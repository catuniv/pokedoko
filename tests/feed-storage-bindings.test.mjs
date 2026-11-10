import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { getFeedStorageBinding } from '../lib/feed-storage-bindings.ts';
import { createFeedStore, FEED_SNAPSHOT_KEY } from '../lib/feed-store.ts';

const fixture = {
  events: [], bosses: [], fetchedAt: new Date().toISOString(), source: 'Public source', sourceUrl: 'https://github.com/bigfoott/ScrapedDuck', cached: false, error: null,
};

function namespace() {
  const values = new Map(), reads = [], writes = [];
  return { values, reads, writes,
    async get(key, options) { reads.push({ key, options }); return values.get(key) ?? null; },
    async put(key, value) { writes.push({ key, value }); values.set(key, value); },
  };
}

test('R2 remains preferred and its metadata/options stay intact when both bindings exist', async () => {
  const calls = [], kv = namespace();
  const r2 = { async get(key) { calls.push(['get', key]); return null; }, async put(...args) { calls.push(['put', ...args]); } };
  const binding = getFeedStorageBinding({ BUCKET: r2, SCHEDULE_CACHE: kv });
  assert.equal(binding.kind, 'r2'); await binding.get('fixed-key');
  const options = { httpMetadata: { contentType: 'application/json' } };
  await binding.put('fixed-key', 'value', options);
  assert.deepEqual(calls, [['get', 'fixed-key'], ['put', 'fixed-key', 'value', options]]);
  assert.equal(kv.reads.length, 0); assert.equal(kv.writes.length, 0);
});

test('KV text adapter uses an explicit 60-second edge cache and never expires the last-good schedule', async () => {
  const kv = namespace(), binding = getFeedStorageBinding({ SCHEDULE_CACHE: kv });
  assert.equal(binding.kind, 'kv'); assert.equal(await binding.get('missing'), null);
  await binding.put('schedule', '일정', { httpMetadata: { contentType: 'ignored-r2-metadata' } });
  const body = await binding.get('schedule'); assert.equal(await body.text(), '일정');
  assert.equal(body.size, Buffer.byteLength('일정'));
  assert.deepEqual(kv.reads[1], { key: 'schedule', options: { type: 'text', cacheTtl: 60 } });
  assert.deepEqual(kv.writes, [{ key: 'schedule', value: '일정' }]);
  assert.equal(getFeedStorageBinding({}), null);
});

test('standalone KV persists through feed-store and is readable by a new store instance', async () => {
  const kv = namespace(), binding = getFeedStorageBinding({ SCHEDULE_CACHE: kv });
  const first = await createFeedStore({ load: async () => fixture, fallback: fixture })(binding);
  assert.equal(first.cache, 'fresh'); assert.equal(first.storage, 'ready');
  const second = await createFeedStore({ load: async () => { throw new Error('should not refetch'); }, fallback: fixture })(getFeedStorageBinding({ SCHEDULE_CACHE: kv }));
  assert.equal(second.cache, 'kv'); assert.equal(second.feed.fetchedAt, fixture.fetchedAt);
  assert.equal(kv.writes.length, 1); assert.equal(kv.writes[0].key, FEED_SNAPSHOT_KEY);
  assert.equal(JSON.parse(kv.writes[0].value).feed.fetchedAt, fixture.fetchedAt);
});

test('negative-cache protection survives new adapter wrappers for the same namespace but never a different namespace', async () => {
  let writes = 0;
  const kv = { async get() { return null; }, async put() { writes++; } };
  const cache = createFeedStore({ load: async () => fixture, fallback: fixture });
  await cache(getFeedStorageBinding({ SCHEDULE_CACHE: kv }));
  const reused = await cache(getFeedStorageBinding({ SCHEDULE_CACHE: kv }));
  assert.equal(reused.cache, 'memory'); assert.equal(reused.storage, 'ready'); assert.equal(writes, 1);
  const other = { async get() { return null; }, async put() { throw new Error('different namespace offline'); } };
  assert.equal((await cache(getFeedStorageBinding({ SCHEDULE_CACHE: other }))).storage, 'unavailable');
});

const compile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(compile(source)).toString('base64')}`;
const storeUrl = moduleUrl(await readFile(new URL('../lib/feed-store.ts', import.meta.url), 'utf8'));
const bindingUrl = moduleUrl(await readFile(new URL('../lib/feed-storage-bindings.ts', import.meta.url), 'utf8'));
const commonRewrite = source => source
  .replace(/import \{ FALLBACK_FEED, loadFeed \} from [^;]+;/, `const FALLBACK_FEED = ${JSON.stringify(fixture)}; const loadFeed = async () => FALLBACK_FEED;`)
  .replace(/import \{ createFeedStore \} from [^;]+;/, `import { createFeedStore } from '${storeUrl}';`)
  .replace(/import \{ getFeedStorageBinding \} from [^;]+;/, `import { getFeedStorageBinding } from '${bindingUrl}';`);

test('native Worker scheduled handler persists the fixed feed, reports storage failures and preserves fetch', async () => {
  const source = commonRewrite(await readFile(new URL('../worker/index.ts', import.meta.url), 'utf8'))
    .replace('import handler from "vinext/server/fetch-handler";', 'const handler = { fetch: async () => new Response("fetch-preserved") };')
    .replace('import { runWithConnectorBinding } from "../lib/connector-context";', 'const runWithConnectorBinding = (_binding, callback) => callback();')
    .replace('import.meta.env.DEV', 'false');
  const { default: worker } = await import(moduleUrl(source));
  const kv = namespace(), messages = [];
  const info = console.info, error = console.error;
  console.info = (...args) => messages.push(['info', ...args]);
  console.error = (...args) => messages.push(['error', ...args]);
  try {
    await worker.scheduled({ cron: '0 0 * * *' }, { SCHEDULE_CACHE: kv }, {});
    assert.equal(kv.writes.length, 1); assert.equal(JSON.parse(kv.writes[0].value).feed.fetchedAt, fixture.fetchedAt);
    assert.ok(messages.some(item => item[0] === 'info' && item[2].storageKind === 'kv'));
    const broken = { async get() { return null; }, async put() { throw new Error('private credential must not be logged'); } };
    await assert.rejects(worker.scheduled({ cron: '0 0 * * *' }, { SCHEDULE_CACHE: broken }, {}), /Scheduled public feed refresh failed/);
    assert.ok(messages.some(item => item[0] === 'error'));
    assert.doesNotMatch(JSON.stringify(messages), /private credential/);
    const response = await worker.fetch(new Request('https://example.com/'), {}, {});
    assert.equal(await response.text(), 'fetch-preserved');
  } finally { console.info = info; console.error = error; }
});

test('feed status route reports KV storage kind and kv cache hits without exposing an arbitrary write operation', async () => {
  const kv = namespace();
  // The test module owns a minimal namespace implementation; route code itself
  // still supplies only its fixed public snapshot key and fixed upstream loader.
  const source = commonRewrite(await readFile(new URL('../app/api/feed/route.ts', import.meta.url), 'utf8'))
    .replace("import { env } from 'cloudflare:workers';", 'const values = new Map(); const env = { SCHEDULE_CACHE: { async get(key) { return values.get(key) ?? null; }, async put(key, value) { values.set(key, value); } } };');
  const route = await import(moduleUrl(source));
  const first = await route.GET(new Request('https://example.com/api/feed?status=1'));
  assert.equal(first.headers.get('X-Pokedoko-Feed-Storage-Kind'), 'kv');
  assert.equal(first.headers.get('Cache-Control'), 'no-store');
  assert.equal((await first.json()).storageKind, 'kv');
  const second = await route.GET(new Request('https://example.com/api/feed?status=1'));
  assert.equal(second.headers.get('X-Pokedoko-Feed-Cache'), 'kv');
  assert.equal((await second.json()).fetchedAt, fixture.fetchedAt);
  assert.equal(route.POST, undefined);
});
