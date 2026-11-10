import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { spawnSync } from 'node:child_process';
import { buildRaidRoute, isRaidRouteCurrent, raidRouteToCoordinates, raidRouteToGpx, raidRouteFilename } from '../lib/raid-route.ts';

const AT = Date.parse('2026-11-10T03:00:00Z'), MINUTE = 60000;
const iso = ms => new Date(ms).toISOString();
const region = patch => ({ cityId: 'tokyo', lat: 0, lon: 0, gymName: '선택 지역', radiusKm: 3, ...patch });
const raid = (id, patch = {}) => ({ id, gymName: `체육관 ${id}`, cityId: 'tokyo', lat: 0, lon: 0.001, bossName: '자시안', pokemonId: 888, formId: 2577, tier: 5, startsAt: iso(AT - 5 * MINUTE), endsAt: iso(AT + 60 * MINUTE), observedAt: iso(AT), expiresAt: iso(AT + 10 * MINUTE), status: 'active', sourceUrl: 'https://example.com/gym', timeBasis: 'source-response', ...patch });
const build = (raids, options = {}, area = region(), now = new Date(AT)) => buildRaidRoute(raids, area, now, options);
const pair = () => [raid('a', { lon: 0 }), raid('b', { lon: 0.002 })];

function assertFeasible(route) {
  let previous = Date.parse(route.generatedAt), km = 0;
  for (const stop of route.stops) {
    const arrival = Date.parse(stop.arrivalAt), begin = Date.parse(stop.beginAt), departure = Date.parse(stop.departureAt);
    assert.ok(arrival >= previous); assert.ok(begin >= arrival && begin >= Date.parse(stop.raid.startsAt));
    assert.equal(departure - begin, route.settings.stopMinutes * MINUTE);
    assert.ok(departure <= Date.parse(stop.raid.endsAt) - MINUTE);
    assert.ok(departure <= Date.parse(route.generatedAt) + route.settings.durationMinutes * MINUTE);
    km += stop.legDistanceKm; assert.equal(stop.cumulativeDistanceKm, km); previous = departure;
  }
  assert.equal(route.totalDistanceKm, km);
  assert.ok(Math.abs(route.totalDurationMinutes - route.totalTravelMinutes - route.totalWaitMinutes - route.totalStopMinutes) < 1e-9);
}

test('plans real stops from the selected centre with coherent time and distance totals without mutating input', () => {
  const input = [raid('c', { lon: 0.004 }), ...pair()]; const original = JSON.stringify(input);
  const route = build(input);
  assert.equal(route.stops.length, 3); assert.equal(route.generatedAt, iso(AT)); assert.equal(route.validUntil, iso(AT + 10 * MINUTE));
  assert.equal(route.settings.speedKmH, 4.5); assert.equal(route.settings.maxStops, 10);
  assertFeasible(route); assert.equal(JSON.stringify(input), original);
  assert.equal(route.skippedCount + route.stops.length, input.length);
  assert.deepEqual(build([...input].reverse()), route);
});

test('future eggs wait for their actual start even when arrival occurs after snapshot expiry', () => {
  const future = raid('future', { lon: 0, bossName: null, pokemonId: null, formId: null, startsAt: '2026-11-10T12:10:00+09:00', expiresAt: iso(AT + 2 * MINUTE), status: 'upcoming' });
  const route = build([future], { stopMinutes: 1 });
  assert.equal(route.stops.length, 1); assert.equal(route.stops[0].arrivalAt, iso(AT));
  assert.equal(route.stops[0].beginAt, iso(AT + 10 * MINUTE)); assert.equal(route.totalWaitMinutes, 10);
  assert.equal(route.validUntil, iso(AT + 2 * MINUTE)); assertFeasible(route);
});

test('includes exactly five minutes remaining and enforces the one-minute completion margin precisely', () => {
  const exact = build([raid('exact', { lon: 0, endsAt: iso(AT + 5 * MINUTE) })], { stopMinutes: 1 });
  assert.equal(exact.stops.length, 1);
  const soon = build([raid('soon', { lon: 0, endsAt: iso(AT + 5 * MINUTE - 1) })], { stopMinutes: 1 });
  assert.equal(soon.stops.length, 0); assert.equal(soon.skipped.endingSoon, 1);
  assert.equal(build([raid('margin', { lon: 0, endsAt: iso(AT + 6 * MINUTE) })]).stops.length, 1);
  const late = build([raid('late', { lon: 0, endsAt: iso(AT + 6 * MINUTE - 1) })]);
  assert.equal(late.stops.length, 0); assert.equal(late.skipped.unreachable, 1);
});

test('rejects stale, malformed, other-city, out-of-radius and Max Battle data with explanatory counts', () => {
  const route = build([
    raid('expired', { expiresAt: iso(AT) }), raid('old', { observedAt: iso(AT - 11 * MINUTE), expiresAt: iso(AT + 10 * MINUTE) }),
    raid('alias-expired', { validUntil: iso(AT) }), raid('other-city', { cityId: 'seoul' }),
    raid('outside', { lon: 1 }), raid('max', { bossName: '다이맥스 리자몽' }), raid('max-tag', { kind: 'max-battle' }),
    raid('invalid', { startsAt: '2026-11-10T03:00:00' }), raid('invalid-calendar', { startsAt: '2026-02-30T03:00:00Z' }), raid('invalid-coord', { lat: NaN }),
    raid('reverse', { endsAt: iso(AT - 10 * MINUTE) }),
  ]);
  assert.equal(route.stops.length, 0); assert.equal(route.skipped.expired, 3);
  assert.equal(route.skipped.otherCity, 1); assert.equal(route.skipped.outsideRadius, 1);
  assert.equal(route.skipped.unsupported, 2); assert.equal(route.skipped.invalid, 4); assert.equal(route.skippedCount, 11);
});

test('duplicate IDs or gym coordinates never become extra stops, while original coordinate precision is preserved', () => {
  const input = [raid('a', { lon: 0.0012345678901234 }), raid('a', { lon: 0.002 }), raid('different-id', { lon: 0.0012345678901234 }), raid('b', { lon: 0.003 })];
  const route = build(input, { stopMinutes: 1 }); assert.equal(route.stops.length, 2); assert.equal(route.skipped.duplicate, 2);
  assert.equal(route.stops[0].raid.lon, 0.0012345678901234);
  assert.deepEqual(build([...input].reverse(), { stopMinutes: 1 }), route);
});

test('duration and stop count are respected; invalid settings are refused', () => {
  const input = Array.from({ length: 10 }, (_, i) => raid(String(i), { lon: i * 0.00001 }));
  assert.equal(build(input, { maxStops: 2 }).stops.length, 2);
  const short = build(input, { durationMinutes: 15 }); assert.equal(short.stops.length, 2); assertFeasible(short);
  for (const patch of [{ speedKmH: 0 }, { speedKmH: 31 }, { stopMinutes: 0 }, { maxStops: 1 }, { maxStops: 2.5 }, { durationMinutes: 14 }, { durationMinutes: Infinity }]) assert.throws(() => build(input, patch), RangeError);
  assert.throws(() => build(input, {}, region({ radiusKm: 0 })), RangeError);
  assert.throws(() => build(input, {}, region(), new Date('invalid')), RangeError);
});

test('candidate cap and bounded multi-start produce stable feasible results for a dense 5000-record input', t => {
  const input = Array.from({ length: 5000 }, (_, i) => raid(`gym-${String(i).padStart(5, '0')}`, { lat: Math.floor(i / 100) * 0.00001, lon: i % 100 * 0.00001, endsAt: iso(AT + (60 + i % 5) * MINUTE) }));
  const start = performance.now(); const route = build(input, { stopMinutes: 1, maxStops: 30, durationMinutes: 180 }); const elapsed = performance.now() - start;
  assert.equal(route.candidateCount, 5000); assert.equal(route.cappedCandidateCount, 500); assert.equal(route.skipped.candidateLimit, 4500);
  assert.equal(route.stops.length, 30); assertFeasible(route); assert.ok(elapsed < 3000);
  t.diagnostic(`5000 inputs /500 candidates /30 stops: ${elapsed.toFixed(1)}ms`);
  assert.deepEqual(build([...input].reverse(), { stopMinutes: 1, maxStops: 30, durationMinutes: 180 }), route);
});

test('spherical distance crosses the date line rather than taking the long way around Earth', () => {
  const route = build([raid('east', { lon: 180 }), raid('west', { lon: -179.999 })], { stopMinutes: 1 }, region({ lon: 179.999, radiusKm: 1 }));
  assert.equal(route.stops.length, 2); assert.ok(route.totalDistanceKm < 0.3); assertFeasible(route);
  assert.match(raidRouteToCoordinates(route), /0,180/);
  assert.ok(!raidRouteToGpx(route).includes('lon="180"')); assert.match(raidRouteToGpx(route), /lon="-180"/);
});

test('current-plan guard checks snapshot age, latest selected fields and refreshed timestamps conservatively', () => {
  const input = pair(), route = build(input);
  assert.equal(isRaidRouteCurrent(route, input, new Date(AT)), true);
  const refreshed = input.map(r => ({ ...r, observedAt: iso(AT + 30_000), expiresAt: iso(AT + 10 * MINUTE + 30_000) }));
  assert.equal(isRaidRouteCurrent(route, refreshed, new Date(AT + 30_000)), true);
  for (const patch of [{ cityId: 'seoul' }, { lat: 0.0001 }, { lon: 0.0001 }, { bossName: '다른 보스' }, { pokemonId: 889 }, { formId: null }, { tier: 3 }, { startsAt: iso(AT - MINUTE) }, { endsAt: iso(AT + 50 * MINUTE) }, { expiresAt: iso(AT) }]) {
    assert.equal(isRaidRouteCurrent(route, [{ ...input[0], ...patch }, input[1]], new Date(AT)), false);
  }
  assert.equal(isRaidRouteCurrent(route, input.slice(1), new Date(AT)), false);
  assert.equal(isRaidRouteCurrent(route, input, new Date(AT + 120_000)), false);
  assert.equal(isRaidRouteCurrent(route, input, new Date(AT - 1)), false);
  assert.equal(isRaidRouteCurrent({ ...route, validUntil: iso(AT) }, refreshed, new Date(AT)), false);
  assert.equal(isRaidRouteCurrent(route, input, new Date('invalid')), false);
});

test('export guard shifts departure deadlines by elapsed time and still requires five minutes remaining', () => {
  const input = [raid('tight', { lon: 0, endsAt: iso(AT + 6 * MINUTE) }), raid('later', { lon: 0.0001 })];
  const route = build(input);
  assert.equal(route.stops.length, 2); assert.equal(route.stops[0].raid.id, 'tight');
  assert.equal(isRaidRouteCurrent(route, input, new Date(AT)), true);
  assert.equal(isRaidRouteCurrent(route, input, new Date(AT + 1000)), false);
  assert.equal(isRaidRouteCurrent(route, input, new Date(AT + MINUTE + 1)), false);
});

test('GPX preserves precision, escapes XML and omits fabricated activity timestamps; origin duplication is removed', t => {
  const input = [raid('a', { lon: 0, gymName: 'A & <B> "C" \'D\' \u0001💡' }), raid('b', { lat: 1e-7, lon: 0.0012345678901234 })];
  const route = build(input, { stopMinutes: 1 }, region({ gymName: '<출발 & 지역>' }));
  const gpx = raidRouteToGpx(route), coordinates = raidRouteToCoordinates(route);
  assert.equal(route.stops.length, 2); assert.equal(coordinates.split('\n').length, 2);
  assert.match(gpx, /version="1\.1" creator="pokedoko"/); assert.match(gpx, /xmlns="http:\/\/www\.topografix\.com\/GPX\/1\/1"/);
  assert.match(gpx, /A &amp; &lt;B&gt; &quot;C&quot; &apos;D&apos;/); assert.ok(!gpx.includes('\u0001')); assert.ok(gpx.includes('💡'));
  assert.match(gpx, /lat="0\.0000001"/); assert.match(gpx, /lon="0\.0012345678901234"/);
  assert.equal((gpx.match(/<time>/g) ?? []).length, 1);
  assert.equal((gpx.match(/<rtept /g) ?? []).length, 2); assert.equal((gpx.match(/<trkpt /g) ?? []).length, 2);
  assert.match(raidRouteFilename(route), /^pokedoko-route-tokyo-20261110T030000Z\.gpx$/);
  const python = spawnSync('python3', ['-c', 'import sys,xml.etree.ElementTree as E,json; r=E.fromstring(sys.stdin.read()); ns={"g":"http://www.topografix.com/GPX/1/1"}; print(json.dumps({"rte":[[p.attrib["lat"],p.attrib["lon"]] for p in r.findall("g:rte/g:rtept",ns)],"trk":[[p.attrib["lat"],p.attrib["lon"]] for p in r.findall("g:trk/g:trkseg/g:trkpt",ns)]}))'], { input: gpx, encoding: 'utf8' });
  if (python.error?.code === 'ENOENT') t.diagnostic('Python XML parser unavailable; structural assertions above still ran');
  else { assert.equal(python.status, 0, python.stderr); const parsed = JSON.parse(python.stdout); assert.deepEqual(parsed.rte, parsed.trk); assert.equal(parsed.rte[1][1], '0.0012345678901234'); }
});

test('empty and one-stop routes cannot be exported as a misleading GPX', () => {
  for (const route of [build([]), build([raid('one')])]) {
    assert.throws(() => raidRouteToGpx(route), RangeError); assert.throws(() => raidRouteToCoordinates(route), RangeError);
    assert.equal(isRaidRouteCurrent(route, [], new Date(AT)), false);
  }
});
