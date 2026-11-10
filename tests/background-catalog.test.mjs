import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText).toString('base64')}`;
const staticUrl = moduleUrl(await readFile(new URL('../lib/trade-backgrounds.ts', import.meta.url), 'utf8'));
const commonUrl = moduleUrl((await readFile(new URL('../lib/trade-background-catalog.ts', import.meta.url), 'utf8')).replace('from "./trade-backgrounds"', `from '${staticUrl}'`));
const bindingUrl = moduleUrl(await readFile(new URL('../lib/feed-storage-bindings.ts', import.meta.url), 'utf8'));
const serverUrl = moduleUrl((await readFile(new URL('../lib/trade-background-catalog-server.ts', import.meta.url), 'utf8'))
  .replace('from "./feed-storage-bindings"', `from '${bindingUrl}'`).replace('from "./trade-background-catalog"', `from '${commonUrl}'`));
const { BACKGROUND_CATALOG_SOURCE, BACKGROUND_CATALOG_IMAGE_ROOT, BACKGROUND_CATALOG_MAX_BYTES,
  parseBackgroundCatalogSource, readTradeBackgroundCatalog, mergeTradeBackgroundPresets, validTradeBackgroundImageUrl } = await import(commonUrl);
const { createTradeBackgroundCatalogStore, loadTradeBackgroundCatalog, BACKGROUND_CATALOG_SNAPSHOT_KEY, BACKGROUND_CATALOG_REFRESH_MS } = await import(serverUrl);
const FIXED = Date.parse('2026-11-10T04:00:00Z');
const source = patch => ({ generated: '2026-11-09', backgrounds: [
  { id: 'fixture2026', name: 'Local test background 2026', type: 'special', first: '2026-11-09', image: 'img/bg/fixture2026.jpg' },
  { id: 'fixturecity', name: 'Local test city', type: 'location', first: '2024-08-01', image: 'img/bg/fixturecity.jpg' },
], ...patch });
const catalog = (at = FIXED, patch = {}) => ({ ...parseBackgroundCatalogSource(source(), new Date(at)), presets: mergeTradeBackgroundPresets(parseBackgroundCatalogSource(source(), new Date(at)).presets),
  fetchedAt: new Date(at).toISOString(), source: 'https://github.com/psoren/pogo-bg', stale: false, ...patch });
const bucket = (patch = {}) => {
  const values = new Map(), writes = [], identity = {};
  return { kind: 'kv', cacheIdentity: identity, values, writes,
    async get(key) { const value = values.get(key); return value === undefined ? null : { size: Buffer.byteLength(value), text: async () => value }; },
    async put(key, value) { writes.push({ key, value }); values.set(key, value); }, ...patch };
};

test('public source parser adds only dated released backgrounds and rejects arbitrary image hosts or paths', () => {
  const input = source();
  input.backgrounds.push(
    { ...input.backgrounds[0], id: 'future', first: '2026-11-11' },
    { ...input.backgrounds[0], id: 'invaliddate', first: '2026-02-30' },
    { ...input.backgrounds[0], id: 'unknown', type: 'unknown' },
    { ...input.backgrounds[0], id: 'badimage', image: '../private/picture.jpg', sourceUrl: 'https://evil.example' },
    { ...input.backgrounds[0], id: 'urlimage', image: 'https://evil.example/a.jpg' },
    { ...input.backgrounds[0], id: 'encodedpath', image: 'img/bg/..%2Fprivate.jpg' },
  );
  const result = parseBackgroundCatalogSource(input, new Date(FIXED));
  assert.deepEqual(result.presets.map(item => item.id), ['community-fixture2026', 'community-fixturecity', 'community-badimage', 'community-urlimage', 'community-encodedpath']);
  assert.equal(result.presets[0].imageUrl, `${BACKGROUND_CATALOG_IMAGE_ROOT}img/bg/fixture2026.jpg`);
  assert.equal(result.presets[2].imageUrl, undefined); assert.equal(result.presets[3].imageUrl, undefined);
  assert.equal(result.presets[2].sourceUrl, 'https://github.com/psoren/pogo-bg');
  assert.equal(result.sourceUpdatedAt, '2026-11-09');
  for (const url of ['http://raw.githubusercontent.com/psoren/pogo-bg/main/docs/img/bg/a.jpg', `${BACKGROUND_CATALOG_IMAGE_ROOT}img/bg/a.svg`, `${BACKGROUND_CATALOG_IMAGE_ROOT}img/bg/../a.jpg`, `${BACKGROUND_CATALOG_IMAGE_ROOT}img/bg/a.jpg?token=x`]) assert.equal(validTradeBackgroundImageUrl(url), false);
  assert.throws(() => parseBackgroundCatalogSource(source({ generated: '2099-01-01' }), new Date(FIXED)));
  assert.throws(() => parseBackgroundCatalogSource(source({ backgrounds: [] }), new Date(FIXED)));
});

test('fixed source loading uses one public URL and enforces response size, redirects and abort deadline', async () => {
  const calls = [];
  const fresh = await loadTradeBackgroundCatalog({ now: () => new Date(FIXED), fetcher: async (url, options) => {
    calls.push({ url, redirect: options.redirect }); return Response.json(source());
  } });
  assert.deepEqual(calls, [{ url: BACKGROUND_CATALOG_SOURCE, redirect: 'manual' }]);
  assert.equal(fresh.stale, false); assert.equal(fresh.fetchedAt, new Date(FIXED).toISOString());
  assert.equal(readTradeBackgroundCatalog(fresh, new Date(FIXED))?.sourceUpdatedAt, '2026-11-09');
  for (const response of [new Response('', { status: 302, headers: { Location: 'https://private.example' } }), new Response('{}', { headers: { 'Content-Length': String(BACKGROUND_CATALOG_MAX_BYTES + 1) } }), new Response('not json')]) {
    await assert.rejects(loadTradeBackgroundCatalog({ fetcher: async () => response, now: () => new Date(FIXED) }));
  }
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(BACKGROUND_CATALOG_MAX_BYTES + 1)); controller.close(); } });
  await assert.rejects(loadTradeBackgroundCatalog({ fetcher: async () => new Response(stream), now: () => new Date(FIXED) }), /too large/);
  await assert.rejects(loadTradeBackgroundCatalog({ timeoutMs: 2, fetcher: (_url, options) => new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')))) }), /aborted/);
});

test('six-hour persisted cache survives source failure without inventing a new timestamp', async () => {
  let time = FIXED, calls = 0, broken = false;
  const kv = bucket(), store = createTradeBackgroundCatalogStore({ now: () => new Date(time), load: async () => { calls++; if (broken) throw new Error('source down'); return catalog(time); } });
  const first = await store(kv);
  assert.equal(first.storage, 'ready'); assert.equal(kv.writes.length, 1); assert.equal(kv.writes[0].key, BACKGROUND_CATALOG_SNAPSHOT_KEY);
  time += 5 * 60_000; broken = true;
  assert.equal((await store(kv)).stale, false); assert.equal(calls, 1);
  time += BACKGROUND_CATALOG_REFRESH_MS;
  const stale = await store(kv);
  assert.equal(stale.stale, true); assert.equal(stale.fetchedAt, first.fetchedAt); assert.equal(kv.writes.length, 1);
  const cold = createTradeBackgroundCatalogStore({ now: () => new Date(time), load: async () => { throw new Error('still down'); } });
  assert.equal((await cold(kv)).fetchedAt, first.fetchedAt);
  broken = false;
  assert.equal((await store(kv, true)).stale, false); assert.equal(kv.writes.length, 2);
});

test('concurrent reads share the source and one KV write, including cached misses', async () => {
  let calls = 0;
  const kv = bucket({ async get() { return null; }, async put(key, value) { await new Promise(resolve => setTimeout(resolve, 5)); this.writes.push({ key, value }); } });
  const store = createTradeBackgroundCatalogStore({ now: () => new Date(FIXED), load: async () => { calls++; await new Promise(resolve => setTimeout(resolve, 2)); return catalog(); } });
  const results = await Promise.all(Array.from({ length: 12 }, () => store(kv)));
  assert.equal(calls, 1); assert.equal(kv.writes.length, 1); assert.ok(results.every(result => !result.stale));
  await store(kv); assert.equal(calls, 1); assert.equal(kv.writes.length, 1);
});

test('malformed snapshots and failed persistence do not get reported as stored success', async () => {
  const kv = bucket(); kv.values.set(BACKGROUND_CATALOG_SNAPSHOT_KEY, JSON.stringify({ version: 1, catalog: catalog(FIXED + 86400000) }));
  const store = createTradeBackgroundCatalogStore({ now: () => new Date(FIXED), load: async () => catalog() });
  const result = await store(kv); assert.equal(result.fetchedAt, new Date(FIXED).toISOString()); assert.equal(result.storage, 'ready');
  const broken = bucket({ async put() { throw new Error('private diagnostics'); } });
  const failedPersistence = await createTradeBackgroundCatalogStore({ now: () => new Date(FIXED), load: async () => catalog() })(broken, true);
  assert.equal(failedPersistence.storage, 'unavailable'); assert.equal(failedPersistence.stale, false); assert.doesNotMatch(JSON.stringify(failedPersistence), /private diagnostics/);
  const fallback = await createTradeBackgroundCatalogStore({ load: async () => { throw new Error('offline'); } })();
  assert.equal(fallback.fetchedAt, null); assert.equal(fallback.stale, true); assert.equal(fallback.storage, 'disabled'); assert.ok(fallback.presets.length > 0);
});

test('catalog response validation rejects unbounded records, foreign images and future timestamps', () => {
  const valid = catalog();
  assert.ok(readTradeBackgroundCatalog(valid, new Date(FIXED)));
  for (const patch of [{ fetchedAt: new Date(FIXED + 120000).toISOString() }, { source: 'https://evil.example' }, { sourceUpdatedAt: '2099-01-01' }, { presets: [{ ...valid.presets[0], imageUrl: 'https://evil.example/a.jpg' }] }]) assert.equal(readTradeBackgroundCatalog({ ...valid, ...patch }, new Date(FIXED)), null);
});


test('a stranded Worker flight is replaced by wall-clock lease and cannot overwrite a newer snapshot', async () => {
  let time = FIXED, calls = 0, resolveOld;
  const kv = bucket();
  const store = createTradeBackgroundCatalogStore({ now: () => new Date(time), load: async () => {
    calls++;
    if (calls === 2) return new Promise(resolve => { resolveOld = resolve; });
    return catalog(time);
  } });
  await store(kv);
  time += BACKGROUND_CATALOG_REFRESH_MS + 1;
  const abandonedAt = time, abandoned = store(kv, true);
  while (!resolveOld) await new Promise(resolve => setTimeout(resolve, 0));
  time += 10000;
  const latest = await store(kv, true);
  assert.equal(calls, 3); assert.equal(latest.fetchedAt, new Date(time).toISOString());
  resolveOld(catalog(abandonedAt));
  const late = await abandoned;
  assert.equal(late.fetchedAt, latest.fetchedAt); assert.equal(late.stale, false);
  assert.equal(JSON.parse(kv.writes.at(-1).value).catalog.fetchedAt, latest.fetchedAt);
});

test('a source ignoring abort still returns last-good data by the request deadline', async () => {
  let broken = false;
  const kv = bucket(), store = createTradeBackgroundCatalogStore({ requestTimeoutMs: 3, now: () => new Date(FIXED), load: () => broken ? new Promise(() => {}) : Promise.resolve(catalog()) });
  const original = await store(kv); broken = true;
  const result = await store(kv, true);
  assert.equal(result.stale, true); assert.equal(result.fetchedAt, original.fetchedAt); assert.equal(kv.writes.length, 1);
});
