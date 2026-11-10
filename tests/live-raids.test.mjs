import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const compile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const asModule = source => import(`data:text/javascript;base64,${Buffer.from(compile(source)).toString('base64')}`);
const { CITIES } = await asModule(await readFile(new URL('../lib/cities.ts', import.meta.url), 'utf8'));
const source = (await readFile(new URL('../lib/live-raids.ts', import.meta.url), 'utf8')).replace("import { CITIES } from './cities';", `const CITIES = ${JSON.stringify(CITIES)};`);
const { loadLiveRaids, normalizeLiveRaidFeed } = await asModule(source);
const now = new Date('2026-11-10T09:00:00Z');
const raid = overrides => ({ id: 'raid-1', gymName: '확인된 체육관', cityId: 'seoul', lat: 37.57, lon: 126.97, bossName: '자마젠타', startsAt: '2026-11-10T08:55:00Z', endsAt: '2026-11-10T09:20:00Z', observedAt: '2026-11-10T08:59:00Z', ...overrides });
const feed = (raids = [], overrides = {}) => ({ sourceName: '테스트 관측 공급원', fetchedAt: '2026-11-10T09:00:00Z', raids, ...overrides });

test('unconfigured provider performs no request and never invents raids', async () => {
  let requested = false;
  const output = await loadLiveRaids({ env: {}, now, fetcher: async () => { requested = true; throw new Error('must not fetch'); } });
  assert.equal(requested, false);
  assert.equal(output.status, 'unconfigured');
  assert.deepEqual(output.raids, []);
  assert.equal(output.fetchedAt, null);
});

test('fresh provider empty response is distinct from an outage or missing provider', () => {
  assert.equal(normalizeLiveRaidFeed(feed(), now).status, 'empty');
  assert.equal(normalizeLiveRaidFeed({ raids: [] }, now).status, 'error');
  assert.equal(normalizeLiveRaidFeed(feed([], { fetchedAt: '2026-11-10T08:49:59Z' }), now).status, 'stale');
});

test('accepts UTC offsets and separates observed active and upcoming raids', () => {
  const output = normalizeLiveRaidFeed(feed([raid({ startsAt: '2026-11-10T17:55:00+09:00' }), raid({ id: 'raid-2', startsAt: '2026-11-10T09:05:00Z' })]), now);
  assert.equal(output.status, 'ready');
  assert.equal(output.raids[0].status, 'active');
  assert.equal(output.raids[0].startsAt, '2026-11-10T08:55:00.000Z');
  assert.equal(output.raids[1].status, 'upcoming');
  assert.equal(output.raids[0].expiresAt, '2026-11-10T09:09:00.000Z');
});

test('stale observations and raids ending exactly now never remain active', () => {
  const output = normalizeLiveRaidFeed(feed([raid({ id: 'stale', observedAt: '2026-11-10T08:50:00Z' }), raid({ id: 'ended', endsAt: '2026-11-10T09:00:00Z' })]), now);
  assert.deepEqual(output.raids, []);
  assert.equal(output.status, 'stale');
  assert.equal(output.discarded.stale, 1);
  assert.equal(output.discarded.ended, 1);
});

test('rejects unzoned/invalid dates, unknown cities, illegal coordinates and reversed windows', () => {
  const bad = [
    { startsAt: '2026-11-10T08:55:00' }, { startsAt: '2026-02-30T08:55:00Z' }, { cityId: 'unknown-city' },
    { lat: 91 }, { lon: -181 }, { lat: '37.57' }, { lat: NaN }, { endsAt: '2026-11-10T08:55:00Z' },
    { observedAt: '2026-11-10T09:02:00Z' }, { sourceUrl: 'javascript:alert(1)' }, { gymName: 'x'.repeat(181) },
  ].map((fields, index) => raid({ id: `invalid-${index}`, ...fields }));
  const output = normalizeLiveRaidFeed(feed(bad), now);
  assert.equal(output.status, 'error');
  assert.equal(output.discarded.invalid, bad.length);
  assert.equal(output.raids.length, 0);
});

test('keeps newest observation when duplicate raid IDs disagree', () => {
  const output = normalizeLiveRaidFeed(feed([raid({ bossName: '오래된 이름', observedAt: '2026-11-10T08:57:00Z' }), raid({ bossName: '새 관측' })]), now);
  assert.equal(output.raids.length, 1);
  assert.equal(output.raids[0].bossName, '새 관측');
});

test('old feed metadata prevents fresh-looking entries from being presented as live', () => {
  const output = normalizeLiveRaidFeed(feed([raid()], { fetchedAt: '2026-11-10T08:49:00Z' }), now);
  assert.equal(output.status, 'stale');
  assert.deepEqual(output.raids, []);
  assert.equal(output.fetchedAt, '2026-11-10T08:49:00.000Z');
  assert.equal(output.checkedAt, now.toISOString());
});

test('token only goes to the configured HTTPS server and never the public response', async () => {
  let request;
  const output = await loadLiveRaids({ now, env: { POKEDOKO_RAID_FEED_URL: 'https://provider.example/secret-feed-path', POKEDOKO_RAID_FEED_TOKEN: 'secret-token-marker' }, fetcher: async (url, options) => { request = { url, options }; return Response.json(feed([raid()])); } });
  assert.equal(output.status, 'ready');
  assert.equal(request.options.headers.Authorization, 'Bearer secret-token-marker');
  assert.equal(request.options.redirect, 'error');
  assert.equal(request.options.cache, 'no-store');
  assert.equal(request.options.signal instanceof AbortSignal, true);
  assert.doesNotMatch(JSON.stringify(output), /secret-token-marker|secret-feed-path/);
});

test('misconfigured URLs, credentials and request errors cannot leak credentials', async () => {
  for (const url of ['http://provider.example/feed', 'https://localhost/feed', 'https://127.0.0.1/feed', 'https://user:password@provider.example/feed']) {
    let calls = 0;
    const output = await loadLiveRaids({ now, env: { POKEDOKO_RAID_FEED_URL: url }, fetcher: async () => { calls++; throw new Error('must not fetch'); } });
    assert.equal(output.status, 'error'); assert.equal(calls, 0); assert.deepEqual(output.raids, []);
  }
  const output = await loadLiveRaids({ now, env: { POKEDOKO_RAID_FEED_URL: 'https://provider.example/feed', POKEDOKO_RAID_FEED_TOKEN: 'secret-token' }, fetcher: async () => { throw new Error('error containing secret-token'); } });
  assert.equal(output.status, 'error'); assert.doesNotMatch(JSON.stringify(output), /secret-token/);
});

test('caps provider body and record count; malformed JSON is an error, not healthy empty', async () => {
  const options = { now, env: { POKEDOKO_RAID_FEED_URL: 'https://provider.example/feed' } };
  const tooLarge = await loadLiveRaids({ ...options, fetcher: async () => new Response('x', { headers: { 'content-length': '1048577' } }) });
  const malformed = await loadLiveRaids({ ...options, fetcher: async () => new Response('{invalid json') });
  assert.equal(tooLarge.status, 'error'); assert.equal(malformed.status, 'error');
  assert.equal(normalizeLiveRaidFeed(feed(Array.from({ length: 1001 }, (_, i) => raid({ id: `raid-${i}` }))), now).status, 'error');
});
