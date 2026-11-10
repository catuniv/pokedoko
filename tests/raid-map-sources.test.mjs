import test from 'node:test';
import assert from 'node:assert/strict';
import { createRaidMapCollector } from '../lib/raid-map-sources.ts';

const FIXED = Date.parse('2026-11-10T01:00:00Z');
const seconds = ms => Math.floor(ms / 1000);
const cities = [
  { host: 'www.nycpokemap.com', cityId: 'new-york', lat: 40.75, lng: -73.98 },
  { host: 'www.sydneypogomap.com', cityId: 'sydney', lat: -33.86, lng: 151.21 },
  { host: 'sgpokemap.com', cityId: 'singapore', lat: 1.29, lng: 103.85 },
];
const raid = (city = cities[0], overrides = {}) => ({ gym_name: '실제 원문 체육관', lat: city.lat, lng: city.lng, raid_start: seconds(FIXED - 300000), raid_end: seconds(FIXED + 1800000), raid_spawn: seconds(FIXED - 3600000), pokemon_id: 889, form: 2578, level: 5, ...overrides });
const payload = (rows, time = FIXED) => ({ meta: { time: seconds(time) }, raids: rows, battles: [{ ...raid(), gym_name: 'Max battle must not appear' }] });
function sourceFor(url) { return cities.find(city => city.host === new URL(url).hostname); }
function collector(responder, options = {}) {
  return createRaidMapCollector({ now: () => new Date(FIXED), fetcher: async (url, init) => responder(sourceFor(url), url, init), ...options });
}

test('collects only fixed public HTTPS sources and maps real raid windows without fabricated observations', async () => {
  const requested = [];
  const collect = collector((city, url, init) => {
    requested.push({ url, init });
    return Response.json(payload([raid(city)]));
  });
  const value = await collect();
  assert.equal(requested.length, 3);
  assert.equal(value.feed.raids.length, 3);
  assert.equal(value.sources.every(source => source.status === 'ready'), true);
  for (const request of requested) {
    assert.equal(new URL(request.url).protocol, 'https:');
    assert.equal(new URL(request.url).pathname, '/raids.php');
    assert.equal(request.init.redirect, 'manual');
    assert.equal(request.init.headers.Accept, 'application/json');
    assert.match(request.init.headers['User-Agent'], /^pokedoko-private-planner/);
  }
  const entry = value.feed.raids[0];
  assert.equal(entry.id, `new-york:40.750000,-73.980000:${seconds(FIXED - 300000)}`);
  assert.equal(entry.startsAt, '2026-11-10T00:55:00.000Z');
  assert.equal(entry.endsAt, '2026-11-10T01:30:00.000Z');
  assert.equal(entry.observedAt, '2026-11-10T01:00:00.000Z');
  assert.equal(entry.timeBasis, 'source-response');
  assert.equal(entry.pokemonId, 889);
  assert.equal(entry.formId, 2578);
  assert.equal(entry.tier, 5);
  assert.equal(entry.bossName, null);
  assert.equal(value.feed.raids.some(entry => entry.gymName.includes('Max battle')), false);
});

test('future eggs are retained, hatched unknown bosses and ended raids are excluded, empty names remain identifiable', async () => {
  const collect = collector(city => Response.json(payload([
    raid(city, { gym_name: '', raid_start: seconds(FIXED + 600000), pokemon_id: 0 }),
    raid(city, { pokemon_id: 0 }),
    raid(city, { raid_end: seconds(FIXED) }),
  ])));
  const output = await collect();
  assert.equal(output.feed.raids.length, 3);
  for (const entry of output.feed.raids) {
    assert.equal(entry.gymName, '이름 미제공 체육관');
    assert.equal(entry.pokemonId, null);
    assert.equal(Date.parse(entry.startsAt) > FIXED, true);
  }
});

test('source age, malformed metadata and out-of-area coordinates never become current records', async () => {
  const collect = collector(city => {
    if (city.cityId === 'new-york') return Response.json(payload([raid(city)], FIXED - 600000));
    if (city.cityId === 'sydney') return Response.json(payload([raid(city)], FIXED + 61000));
    return Response.json(payload([raid(city, { lat: 40.75, lng: -73.98 })]));
  });
  const output = await collect();
  assert.equal(output.feed.raids.length, 0);
  assert.deepEqual(output.sources.map(source => source.status), ['stale', 'error', 'error']);
  assert.equal(output.sources[0].fetchedAt, '2026-11-10T00:50:00.000Z');
});

test('rejects invalid windows, numeric metadata, record counts and malformed source payloads', async () => {
  const collect = collector(city => {
    if (city.cityId === 'new-york') return Response.json(payload([
      raid(city, { raid_start: seconds(FIXED), raid_end: seconds(FIXED) }),
      raid(city, { lat: 'not-a-number' }),
      raid(city, { raid_start: seconds(FIXED + 8 * 86400000), raid_end: seconds(FIXED + 8 * 86400000 + 600000) }),
      raid(city, { raid_end: seconds(FIXED + 86400000) }),
    ]));
    if (city.cityId === 'sydney') return Response.json(payload(Array.from({ length: 5001 }, () => raid(city))));
    return new Response('{malformed JSON');
  });
  const output = await collect();
  assert.equal(output.feed.raids.length, 0);
  assert.equal(output.sources.every(source => source.status === 'error'), true);
});

test('parallel calls share one request per source and 60-second cache preserves source/check timestamps', async () => {
  let calls = 0, clock = FIXED;
  let unblock;
  const gate = new Promise(resolve => { unblock = resolve; });
  const collect = collector(async city => { calls++; await gate; return Response.json(payload([raid(city)])); }, { now: () => new Date(clock) });
  const first = collect(), second = collect();
  assert.equal(calls, 3);
  unblock();
  const [a, b] = await Promise.all([first, second]);
  assert.deepEqual(a, b);
  clock += 59000;
  const cached = await collect();
  assert.equal(calls, 3);
  assert.equal(cached.feed.fetchedAt, a.feed.fetchedAt);
  assert.equal(cached.sources[0].checkedAt, a.sources[0].checkedAt);
  clock += 1000;
  await collect();
  assert.equal(calls, 6);
});

test('partial failures retain healthy regions and errors back off without stale-success masquerading', async () => {
  let clock = FIXED;
  const calls = new Map();
  const collect = collector(city => {
    calls.set(city.cityId, (calls.get(city.cityId) || 0) + 1);
    if (city.cityId === 'sydney') throw new Error('source unavailable');
    return Response.json(payload([raid(city)]));
  }, { now: () => new Date(clock) });
  const first = await collect();
  assert.equal(first.feed.raids.length, 2);
  assert.deepEqual(first.sources.map(source => source.status), ['ready', 'error', 'ready']);
  clock += 29000;
  await collect();
  assert.equal(calls.get('sydney'), 1);
  clock += 1000;
  await collect();
  assert.equal(calls.get('sydney'), 2);
  assert.equal(calls.get('new-york'), 1);
});

test('empty and all-failed sources remain distinct and aggregate freshness uses the oldest healthy source', async () => {
  const collect = collector(city => Response.json(payload([], FIXED - (city.cityId === 'sydney' ? 120000 : 0))));
  const empty = await collect();
  assert.equal(empty.sources.every(source => source.status === 'empty'), true);
  assert.equal(empty.feed.fetchedAt, '2026-11-10T00:58:00.000Z');
  const failure = await collector(() => { throw new Error('offline'); })();
  assert.equal(failure.sources.every(source => source.status === 'error'), true);
  assert.deepEqual(failure.feed.raids, []);
});

test('response limits cover declared size and actual streamed bytes without exposing error text', async () => {
  const collect = collector(city => {
    if (city.cityId === 'new-york') return new Response('{}', { headers: { 'content-length': String(4 * 1024 * 1024 + 1) } });
    if (city.cityId === 'sydney') return new Response(new Uint8Array(4 * 1024 * 1024 + 1));
    throw new Error('private internal stack');
  });
  const output = await collect();
  assert.equal(output.sources.every(source => source.status === 'error'), true);
  assert.doesNotMatch(JSON.stringify(output), /private internal stack/);
});
