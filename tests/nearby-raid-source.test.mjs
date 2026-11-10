import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const moduleOf = source => import(`data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText).toString('base64')}`);
const { CITIES } = await moduleOf(await readFile(new URL('../lib/cities.ts', import.meta.url), 'utf8'));
const source = (await readFile(new URL('../lib/nearby-raid-source.ts', import.meta.url), 'utf8')).replace('import { CITIES } from "./cities";', `const CITIES = ${JSON.stringify(CITIES)};`);
const { createNearbyRaidCollector } = await moduleOf(source);
const FIXED = Date.parse('2026-11-10T03:00:00Z');
const now = () => new Date(FIXED);
const cityFor = url => CITIES.find(city => +new URL(url).searchParams.get('lat') === city.lat && +new URL(url).searchParams.get('lon') === city.lon);
const raid = (city, patch = {}) => ({ id: '18446744073709551615', lat: city.lat, lon: city.lon, gym_name: '원문 체육관', raid_pokemon_id: 888, raid_level: 5, raid_battle_at: '2026-11-10T11:55:00+09:00', raid_end_at: '2026-11-10T12:25:00+09:00', ...patch });
const payload = (rows, generated_at = '2026-11-10T03:00:00.123456+00:00') => ({ generated_at, raids: rows });
const collector = (respond, options = {}) => createNearbyRaidCollector({ now, fetcher: async (url, init) => respond(cityFor(url), url, init), ...options });

test('queries all 24 fixed city centres with UI-supported bounds and six concurrent GETs', async () => {
  const calls = [];
  let active = 0, peak = 0;
  const collect = collector(async (city, url, init) => {
    calls.push({ city, url, init }); active++; peak = Math.max(peak, active);
    await new Promise(resolve => setImmediate(resolve)); active--;
    return Response.json(payload([raid(city)]));
  });
  const output = await collect();
  assert.equal(calls.length, 24); assert.equal(peak, 6); assert.equal(output.feed.raids.length, 24);
  assert.equal(new Set(output.sources.map(s => s.cityId)).size, 24);
  for (const { city, url, init } of calls) {
    const parsed = new URL(url);
    assert.equal(parsed.origin, 'https://pokecoords.iflowgo.com');
    assert.equal(parsed.pathname, '/iflowgopokecoords/api/v1/nearby');
    assert.equal(parsed.searchParams.get('radius_km'), '15');
    assert.equal(parsed.searchParams.get('limit'), '800');
    assert.equal(parsed.searchParams.get('layers'), 'raids');
    assert.equal(init.redirect, 'manual'); assert.equal(init.cache, 'no-store');
    assert.equal(init.headers.Accept, 'application/json');
    assert.match(init.headers['User-Agent'], /^pokedoko-planner/);
    const s = output.sources.find(s => s.cityId === city.id);
    assert.equal(s.id, `iflowgo-${city.id}`); assert.equal(s.coverage.radiusKm, 15);
    assert.equal(s.coverage.limited, false);
  }
  const first = output.feed.raids[0];
  assert.equal(first.id, `seoul:${CITIES[0].lat.toFixed(6)},${CITIES[0].lon.toFixed(6)}:${Date.parse('2026-11-10T02:55:00Z') / 1000}`);
  assert.equal(first.observedAt, '2026-11-10T03:00:00.123Z');
  assert.equal(first.timeBasis, 'source-response'); assert.equal(first.formId, null);
  assert.equal(first.startsAt, '2026-11-10T02:55:00.000Z');
  assert.equal(first.pokemonId, 888); assert.equal(first.sourceUrl, 'https://pokecoords.iflowgo.com/');
});

test('unknown future eggs remain, empty gym names get a fallback and expired/hatched unknown raids are excluded', async () => {
  const collect = collector(city => Response.json(payload([
    raid(city, { gym_name: '', raid_pokemon_id: null, raid_battle_at: '2026-11-10T12:05:00+09:00' }),
    raid(city, { id: 'hatched', raid_pokemon_id: null }),
    raid(city, { id: 'ended', raid_end_at: '2026-11-10T12:00:00+09:00' }),
  ])));
  const output = await collect();
  assert.equal(output.feed.raids.length, 24);
  assert.ok(output.feed.raids.every(r => r.pokemonId === null && r.gymName === '이름 미제공 체육관'));
});

test('rejects out-of-radius points, timezone-less/impossible/reversed dates and duplicate gym/windows', async () => {
  const collect = collector(city => Response.json(payload([
    raid(city), raid(city),
    raid(city, { id: 'outside', lat: city.lat + 0.2 }),
    raid(city, { id: 'tz', raid_battle_at: '2026-11-10T02:55:00' }),
    raid(city, { id: 'calendar', raid_battle_at: '2026-02-30T02:55:00Z' }),
    raid(city, { id: 'reverse', raid_end_at: '2026-11-10T02:50:00Z' }),
    raid(city, { id: 'unsafe-id', raid_level: 101 }),
  ])));
  const output = await collect(); assert.equal(output.feed.raids.length, 24);
  assert.ok(output.feed.raids.every(r => r.lat === CITIES.find(c => c.id === r.cityId).lat));
});

test('supports raids crossing calendar days and keeps published raw coordinate precision', async () => {
  const time = Date.parse('2026-11-11T00:05:00Z');
  const collect = collector(city => Response.json(payload([raid(city, {
    lat: city.lat + 0.000000123, raid_battle_at: '2026-11-10T23:55:00Z', raid_end_at: '2026-11-11T00:25:00Z',
  })], '2026-11-11T00:05:00Z')), { now: () => new Date(time) });
  const output = await collect(); assert.equal(output.feed.raids.length, 24);
  assert.equal(output.feed.raids[0].lat, CITIES[0].lat + 0.000000123);
  assert.equal(output.feed.raids[0].startsAt, '2026-11-10T23:55:00.000Z');
});

test('partial failures and empty results remain distinct from stale and future source timestamps', async () => {
  const collect = collector(city => {
    if (city.id === CITIES[0].id) throw new Error('offline');
    if (city.id === CITIES[1].id) return Response.json(payload([], '2026-11-10T02:50:00Z'));
    if (city.id === CITIES[2].id) return Response.json(payload([], '2026-11-10T03:01:01Z'));
    return Response.json(payload([]));
  });
  const output = await collect();
  assert.deepEqual(output.sources.slice(0, 4).map(s => s.status), ['error', 'stale', 'error', 'empty']);
  assert.equal(output.feed.raids.length, 0);
  assert.equal(output.sources[1].fetchedAt, '2026-11-10T02:50:00.000Z');
});

test('coalesces concurrent calls, preserves timestamps in 60-second caches and refreshes same gym on expiry', async () => {
  let clock = FIXED, calls = 0;
  const collect = collector(async city => {
    calls++; await new Promise(resolve => setImmediate(resolve));
    return Response.json(payload([raid(city, { raid_pokemon_id: clock === FIXED ? 888 : 889 })], new Date(clock).toISOString()));
  }, { now: () => new Date(clock) });
  const [a, b] = await Promise.all([collect(), collect()]); assert.equal(calls, 24);
  assert.deepEqual(a, b); clock += 59_000;
  const cached = await collect(); assert.equal(calls, 24);
  assert.equal(cached.feed.fetchedAt, a.feed.fetchedAt);
  assert.equal(cached.sources[0].checkedAt, a.sources[0].checkedAt);
  cached.sources[0].coverage.radiusKm = 99;
  assert.equal((await collect()).sources[0].coverage.radiusKm, 15);
  clock += 1_001;
  const refreshed = await collect(); assert.equal(calls, 48);
  assert.equal(refreshed.feed.raids[0].id, a.feed.raids[0].id);
  assert.equal(refreshed.feed.raids[0].pokemonId, 889);
});

test('all failures return metadata and use a 30-second per-city retry backoff', async () => {
  let clock = FIXED, calls = 0;
  const collect = collector(() => { calls++; throw new Error('offline'); }, { now: () => new Date(clock) });
  const output = await collect(); assert.equal(output.sources.length, 24);
  assert.ok(output.sources.every(s => s.status === 'error'));
  clock += 29_999; await collect(); assert.equal(calls, 24);
  clock += 1; await collect(); assert.equal(calls, 48);
});

test('800 results mark a limited sample, oversized arrays/bodies and redirects are rejected', async () => {
  const collect = collector(city => {
    if (city.id === CITIES[0].id) return Response.json(payload(Array.from({ length: 800 }, (_, i) => raid(city, { id: String(i), lat: city.lat + i / 1e6 }))));
    if (city.id === CITIES[1].id) return Response.json(payload(Array.from({ length: 801 }, () => raid(city))));
    if (city.id === CITIES[2].id) return new Response('x', { headers: { 'Content-Length': String(2 * 1024 * 1024 + 1) } });
    if (city.id === CITIES[3].id) return new Response('', { status: 302, headers: { Location: 'https://example.com' } });
    return Response.json(payload([]));
  });
  const output = await collect(); assert.equal(output.sources[0].coverage.limited, true);
  assert.equal(output.sources[0].count, 800);
  assert.deepEqual(output.sources.slice(1, 4).map(s => s.status), ['error', 'error', 'error']);
});

test('stream byte bound rejects large chunked responses without waiting for the full body', async () => {
  let cancelled = 0;
  const collect = collector(() => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1)); },
    cancel() { cancelled++; },
  })));
  const output = await collect(); assert.ok(output.sources.every(s => s.status === 'error'));
  assert.equal(cancelled, 24);
});

test('hanging fetches abort individually and the whole batch resolves within its ten-second budget', { timeout: 12_000 }, async () => {
  let calls = 0, aborted = 0;
  const started = performance.now();
  const collect = collector((_city, _url, init) => {
    calls++; init.signal.addEventListener('abort', () => { aborted++; });
    return new Promise(() => {});
  });
  const output = await collect(); const elapsed = performance.now() - started;
  assert.equal(output.sources.length, 24); assert.ok(output.sources.every(s => s.status === 'error'));
  assert.ok(calls <= 18); assert.equal(aborted, calls);
  assert.ok(elapsed >= 9_500 && elapsed < 11_500, `batch took ${elapsed} ms`);
});

test('an expired pending lease recovers after a cancelled request without old jobs clearing the replacement or overwriting its cache', async () => {
  let clock = FIXED, calls = 0;
  const oldResolvers = [];
  let releaseHealthy;
  const healthyGate = new Promise(resolve => { releaseHealthy = resolve; });
  const collect = collector(async city => {
    calls++;
    if (clock === FIXED) return new Promise(resolve => oldResolvers.push(() => resolve(Response.json(payload([raid(city, { raid_pokemon_id: 888 })])))));
    await healthyGate;
    return Response.json(payload([raid(city, { raid_pokemon_id: 889 })], new Date(clock).toISOString()));
  }, { now: () => new Date(clock) });
  const abandoned = collect(); assert.equal(calls, 6);
  clock += 11_000;
  const replacement = collect(); assert.notEqual(replacement, abandoned); assert.equal(calls, 12);
  await abandoned;
  // The abandoned finally must not clear the replacement's shared promise.
  assert.equal(collect(), replacement);
  releaseHealthy();
  const recovered = await replacement;
  assert.equal(recovered.feed.raids.length, 24); assert.ok(recovered.feed.raids.every(r => r.pokemonId === 889));
  for (const release of oldResolvers) release();
  await new Promise(resolve => setImmediate(resolve));
  const cached = await collect(); assert.equal(calls, 30);
  assert.deepEqual(cached.feed, recovered.feed);
  assert.ok(cached.sources.every(s => s.status === 'ready'));
});
