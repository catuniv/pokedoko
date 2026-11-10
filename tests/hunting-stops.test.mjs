import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import ts from 'typescript';

const moduleOf = source => import(`data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText).toString('base64')}`);
const { CITIES } = await moduleOf(await readFile(new URL('../lib/cities.ts', import.meta.url), 'utf8'));
const code = (await readFile(new URL('../lib/hunting-stops.ts', import.meta.url), 'utf8')).replace('import { CITIES } from "./cities";', `const CITIES = ${JSON.stringify(CITIES)};`);
const { parseHuntingStopQuery, createHuntingStopCollector, orderHuntingStops } = await moduleOf(code);
const AT = Date.parse('2026-11-10T08:00:00Z');
const iso = value => new Date(value).toISOString();
const query = params => parseHuntingStopQuery(new URLSearchParams({ city: 'tokyo', ...params }));
const row = (q, patch = {}) => ({ id: '1558149460719090966', lat: q.center.lat, lon: q.center.lon, pokestop_name: '실제 포켓스톱', quest_type_id: 4, ...patch });
const payload = (quests, generated_at = iso(AT)) => ({ generated_at, quests, raids: [] });
const point = (id, lat, lon) => ({ id, name: `장소 ${id}`, lat, lon });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('strict query resolves only checked-in cities/places and rejects arbitrary coordinates/URLs or ambiguous params', () => {
  const normal = query();
  assert.equal(normal.cityId, 'tokyo'); assert.equal(normal.spotIndex, null); assert.equal(normal.radiusKm, 3);
  const city = CITIES.find(c => c.id === 'tokyo');
  assert.deepEqual(normal.center, { name: city.name, lat: city.lat, lon: city.lon });
  const spot = query({ spot: '0', radius: '10' });
  assert.deepEqual(spot.center, { name: city.spots[0].name, lat: city.spots[0].lat, lon: city.spots[0].lon });
  assert.deepEqual(query({ spot: 'center' }), normal);
  for (const params of [{ city: 'fake' }, { city: 'https://example.com' }, { lat: '0' }, { url: 'https://example.com' }, { radius: '15' }, { radius: '1.0' }, { radius: '' }, { spot: '-1' }, { spot: '99' }, { spot: '00' }, { spot: '1.5' }, { city: '' }]) assert.throws(() => query(params), RangeError);
  assert.throws(() => parseHuntingStopQuery(new URL('https://site.test/api/gpx/stops?city=tokyo&city=seoul')), RangeError);
});

test('queries the public quest layer with fixed origin, source bounds, honest source label and original coordinates', async () => {
  const q = query({ radius: '1' }); let calls = 0;
  const collect = createHuntingStopCollector({ now: () => new Date(AT), fetcher: async (url, init) => {
    calls++;
    const u = new URL(url);
    assert.equal(u.origin, 'https://pokecoords.iflowgo.com'); assert.equal(u.pathname, '/iflowgopokecoords/api/v1/nearby');
    assert.equal(u.searchParams.get('layers'), 'quests'); assert.equal(u.searchParams.get('limit'), '800');
    assert.equal(u.searchParams.get('radius_km'), '1'); assert.equal(+u.searchParams.get('lat'), q.center.lat);
    assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'manual'); assert.equal(init.cache, 'no-store');
    assert.equal(init.headers.Accept, 'application/json'); assert.ok(init.signal instanceof AbortSignal);
    return Response.json(payload([row(q, { lat: q.center.lat + 0.000000123456 })], '2026-11-10T16:00:00.123456+08:00'));
  } });
  const result = await collect({ ...q, center: { lat: 0, lon: 0, name: 'forged' } });
  assert.equal(result.status, 'ready'); assert.equal(result.stops.length, 1); assert.equal(calls, 1);
  assert.equal(result.fetchedAt, '2026-11-10T08:00:00.123Z'); assert.equal(result.checkedAt, iso(AT));
  assert.equal(result.stops[0].lat, q.center.lat + 0.000000123456);
  assert.match(result.message, /전체 포켓스톱 목록은 아닙니다/); assert.match(result.sourceName, /퀘스트 포켓스톱/);
  assert.equal(result.sourceUrl, 'https://pokecoords.iflowgo.com/'); assert.deepEqual(result.center, q.center);
});

test('validates real PokéStops, deduplicates IDs/coordinates, caps names and excludes gyms/outside/unsafe values', async () => {
  const q = query({ radius: '1' });
  const north = q.center.lat + (1 / 6371.0088) * (180 / Math.PI);
  const rows = [row(q), row(q), row(q, { id: 'same-position' }), row(q, { id: 'edge', lat: north, pokestop_name: '' }), row(q, { id: 'outside', lat: north + 0.0001 }), row(q, { id: 'name', lat: q.center.lat + 0.001, pokestop_name: '\u0000' + '길'.repeat(300) }), row(q, { id: 'bad-id space', lat: north }), row(q, { id: Number.MAX_SAFE_INTEGER + 10 }), row(q, { id: 'bad-pos', lat: 91 }), { id: 'gym', lat: q.center.lat, lon: q.center.lon, gym_name: '체육관' }];
  const collect = createHuntingStopCollector({ now: () => new Date(AT), fetcher: async () => Response.json(payload(rows)) });
  const result = await collect(q);
  assert.equal(result.status, 'ready'); assert.deepEqual(result.stops.map(p => p.id), ['1558149460719090966', 'edge', 'name']);
  assert.equal(result.stops[1].name, '이름 미제공 포켓스톱'); assert.equal(result.stops[2].name.length, 180);
});

test('source dates require explicit valid timezone and reject expired/future/malformed results', async () => {
  const q = query();
  for (const time of ['2026-11-10T08:00:00', '2026-02-30T08:00:00Z', '2026-11-10T08:00:00+14:01', iso(AT + 60_001), iso(AT - 600_000)]) {
    const collect = createHuntingStopCollector({ now: () => new Date(AT), fetcher: async () => Response.json(payload([row(q)], time)) });
    const result = await collect(q); assert.equal(result.status, 'error', time); assert.deepEqual(result.stops, []);
  }
  for (const raw of [{ quests: [] }, { generated_at: iso(AT), raids: [] }, payload([{}]), payload(Array.from({ length: 801 }, () => row(q)))]) {
    const collect = createHuntingStopCollector({ now: () => new Date(AT), fetcher: async () => Response.json(raw) });
    assert.equal((await collect(q)).status, 'error');
  }
});

test('empty and bounded 800-row partial results are explicit rather than fabricated whole-city counts', async () => {
  const q = query();
  const empty = createHuntingStopCollector({ now: () => new Date(AT), fetcher: async () => Response.json(payload([])) });
  assert.equal((await empty(q)).status, 'empty');
  const collect = createHuntingStopCollector({ now: () => new Date(AT), fetcher: async () => Response.json(payload(Array.from({ length: 800 }, (_, i) => row(q, { id: String(i), lat: q.center.lat + i * 0.000001 })))) });
  const result = await collect(q); assert.equal(result.status, 'ready'); assert.equal(result.stops.length, 800); assert.equal(result.limited, true); assert.match(result.message, /800개/);
});

test('five-minute caches coalesce concurrent requests while keys isolate city/place/radius and preserve source times', async () => {
  let clock = AT, calls = 0;
  const q = query();
  const collect = createHuntingStopCollector({ now: () => new Date(clock), fetcher: async () => { calls++; await new Promise(r => setImmediate(r)); return Response.json(payload([row(q)], iso(clock))); } });
  const [a, b] = await Promise.all([collect(q), collect(q)]);
  assert.equal(calls, 1); assert.deepEqual(a, b);
  clock += 299_999; const cached = await collect(q); assert.equal(calls, 1); assert.equal(cached.fetchedAt, iso(AT)); assert.equal(cached.checkedAt, iso(AT));
  clock++; const fresh = await collect(q); assert.equal(calls, 2); assert.equal(fresh.fetchedAt, iso(clock));
  await collect(query({ radius: '1' })); await collect(query({ spot: '0' })); await collect(query({ city: 'seoul' })); assert.equal(calls, 5);
});

test('failed refresh does not return expired cached points as ready and uses a 30-second failure backoff', async () => {
  let clock = AT, calls = 0; const q = query();
  const collect = createHuntingStopCollector({ now: () => new Date(clock), fetcher: async () => { calls++; if (calls > 1) throw new Error('offline'); return Response.json(payload([row(q)])); } });
  assert.equal((await collect(q)).status, 'ready');
  clock += 300_000; const failed = await collect(q); assert.equal(failed.status, 'error'); assert.deepEqual(failed.stops, []);
  clock += 29_999; assert.equal((await collect(q)).status, 'error'); assert.equal(calls, 2);
  clock++; await collect(q); assert.equal(calls, 3);
});

test('cache cannot extend a nearly expired source response beyond the ten-minute source-age boundary', async () => {
  let clock = AT, calls = 0; const q = query();
  const collect = createHuntingStopCollector({ now: () => new Date(clock), fetcher: async () => { calls++; return Response.json(payload([row(q)], iso(AT - 599_000))); } });
  assert.equal((await collect(q)).status, 'ready'); clock += 1000;
  assert.equal((await collect(q)).status, 'error'); assert.equal(calls, 2);
});

test('expired pending lease recovers and late old work cannot overwrite the replacement cache', async () => {
  const first = deferred(); let clock = AT, calls = 0; const q = query();
  const collect = createHuntingStopCollector({ now: () => new Date(clock), fetcher: async () => { calls++; if (calls === 1) return first.promise; return Response.json(payload([row(q, { pokestop_name: 'new generation' })], iso(clock))); } });
  const abandoned = collect(q); clock += 6000;
  const recovered = await collect(q); assert.equal(recovered.status, 'ready'); assert.equal(recovered.stops[0].name, 'new generation');
  first.resolve(Response.json(payload([row(q, { pokestop_name: 'old generation' })], iso(AT))));
  await abandoned; await new Promise(r => setImmediate(r));
  assert.equal((await collect(q)).stops[0].name, 'new generation'); assert.equal(calls, 2);
});

test('redirects, invalid JSON and oversized advertised/streamed bodies fail without exposing stale points', async () => {
  const q = query();
  const responses = [new Response('', { status: 302, headers: { Location: 'https://elsewhere.test' } }), new Response('{broken'), new Response('{}', { headers: { 'Content-Length': String(2 * 1024 * 1024 + 1) } }), new Response(' '.repeat(2 * 1024 * 1024 + 1))];
  for (const response of responses) {
    const collect = createHuntingStopCollector({ now: () => new Date(AT), fetcher: async () => response });
    assert.equal((await collect(q)).status, 'error');
  }
});

test('deadline bounds fetchers that ignore abort signals and streaming bodies that never finish', async () => {
  const q = query();
  const ignored = createHuntingStopCollector({ now: () => new Date(AT), timeoutMs: 15, fetcher: async () => new Promise(() => {}) });
  const start = performance.now(); assert.equal((await ignored(q)).status, 'error'); assert.ok(performance.now() - start < 500);
  let cancelled = false;
  const hanging = createHuntingStopCollector({ now: () => new Date(AT), timeoutMs: 15, fetcher: async () => new Response(new ReadableStream({ pull() { return new Promise(() => {}); }, cancel() { cancelled = true; } })) });
  assert.equal((await hanging(q)).status, 'error'); assert.equal(cancelled, true);
});

test('route ordering is deterministic, keeps a real nearest first point and deduplicates without mutating input', () => {
  const stops = [point('d', 0.001, 0.001), point('c', 0.001, 0), point('a', 0, 0), point('b', 0, 0.001), point('b', 0, 0.002), point('same', 0, 0)];
  const before = JSON.stringify(stops), center = { lat: 0, lon: 0 };
  const result = orderHuntingStops(stops, center, 20);
  assert.equal(result.points.length, 4); assert.equal(result.points[0].id, 'a'); assert.equal(result.availableCount, 4); assert.equal(result.truncated, false);
  assert.equal(new Set(result.points.map(p => `${p.lat},${p.lon}`)).size, 4); assert.ok(result.totalDistanceKm > 0.4 && result.totalDistanceKm < 0.5);
  assert.deepEqual(orderHuntingStops([...stops].reverse(), center, 20), result); assert.equal(JSON.stringify(stops), before);
  assert.ok(result.points.every(p => stops.some(source => JSON.stringify(source) === JSON.stringify(p))));
});

test('route caps to nearest actual stops, handles empty/invalid points, date-line wrap and invalid inputs', () => {
  const stops = Array.from({ length: 60 }, (_, i) => point(String(i).padStart(3, '0'), 0, i * 0.001));
  const result = orderHuntingStops(stops, { lat: 0, lon: 0 }, 20);
  assert.equal(result.points.length, 20); assert.equal(result.availableCount, 60); assert.equal(result.truncated, true);
  assert.ok(result.points.every(p => p.lon <= 0.019));
  assert.deepEqual(orderHuntingStops([], { lat: 0, lon: 0 }), { points: [], availableCount: 0, truncated: false, totalDistanceKm: 0 });
  assert.equal(orderHuntingStops([point('bad', NaN, 0), point('one', 0, 0)], { lat: 0, lon: 0 }).points.length, 1);
  const wrapped = orderHuntingStops([point('east', 0, 179.999), point('west', 0, -179.999), point('same-meridian-a', 1, 180), point('same-meridian-b', 1, -180)], { lat: 0, lon: 180 });
  assert.equal(wrapped.points.length, 3); assert.ok(wrapped.totalDistanceKm < 224);
  for (const max of [0, 19, 21, 201, NaN]) assert.throws(() => orderHuntingStops(stops, { lat: 0, lon: 0 }, max), RangeError);
  assert.throws(() => orderHuntingStops(stops, { lat: 91, lon: 0 }), RangeError);
  assert.throws(() => orderHuntingStops(Array.from({ length: 801 }, (_, i) => point(String(i), 0, 0)), { lat: 0, lon: 0 }), RangeError);
});

test('800-point input and a 200-stop closed tour remain bounded for client-side planning', t => {
  const stops = Array.from({ length: 800 }, (_, i) => point(String(i).padStart(4, '0'), 35 + Math.floor(i / 40) * 0.0001, 139 + i % 40 * 0.0001));
  const start = performance.now(); const result = orderHuntingStops(stops, { lat: 35, lon: 139 }, 200); const elapsed = performance.now() - start;
  assert.equal(result.points.length, 200); assert.equal(result.availableCount, 800); assert.ok(elapsed < 1500); assert.ok(Number.isFinite(result.totalDistanceKm));
  t.diagnostic(`800 inputs /200 selected /four bounded 2-opt passes: ${elapsed.toFixed(1)}ms`);
});

test('GET route rejects invalid queries and applies explicit success/error cache and noindex headers', async () => {
  const route = await readFile(new URL('../app/api/gpx/stops/route.ts', import.meta.url), 'utf8');
  const fixture = { status: 'ready', cityId: 'tokyo', stops: [], fetchedAt: new Date().toISOString() };
  const stubs = `const parseHuntingStopQuery = value => { if (value.searchParams.get('city') !== 'tokyo') throw new RangeError('bad'); return {}; }; const collectHuntingStops = async () => (${JSON.stringify(fixture)});`;
  const ready = await moduleOf(route.replace(/^import[^\n]+;/m, stubs));
  const good = await ready.GET(new Request('https://pokedoko.test/api/gpx/stops?city=tokyo'));
  assert.equal(good.status, 200); assert.equal(good.headers.get('Cache-Control'), 'public, max-age=60'); assert.equal(good.headers.get('X-Robots-Tag'), 'noindex, nofollow');
  const bad = await ready.GET(new Request('https://pokedoko.test/api/gpx/stops?city=unknown'));
  assert.equal(bad.status, 400); assert.equal(bad.headers.get('Cache-Control'), 'no-store');
  const error = await moduleOf(route.replace(/^import[^\n]+;/m, stubs.replace('"ready"', '"error"')));
  const failed = await error.GET(new Request('https://pokedoko.test/api/gpx/stops?city=tokyo'));
  assert.equal(failed.status, 502); assert.equal(failed.headers.get('Cache-Control'), 'no-store');
  const nearlyExpired = await moduleOf(route.replace(/^import[^\n]+;/m, stubs.replace(fixture.fetchedAt, new Date(Date.now() - 590_000).toISOString())));
  const nearBoundary = await nearlyExpired.GET(new Request('https://pokedoko.test/api/gpx/stops?city=tokyo'));
  const maxAge = Number(nearBoundary.headers.get('Cache-Control').split('=')[1]); assert.ok(maxAge >= 8 && maxAge <= 10);
});
