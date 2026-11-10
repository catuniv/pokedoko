import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { distanceKm, findRaidHotspots, findRecommendedRaidHotspots } from '../lib/raid-hotspots.ts';

const raid = (id, lat = 0, lon = 0, cityId = 'city') => ({ id, lat, lon, cityId, gymName: `Gym ${id}`, bossName: null, startsAt: '2026-11-10T00:00:00Z', endsAt: '2026-11-10T01:00:00Z', observedAt: '2026-11-10T00:00:00Z', sourceUrl: null, status: 'active', expiresAt: '2026-11-10T00:10:00Z' });
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const spot = (id, lat = 0, lon = 0, cityId = 'city', patch = {}) => ({ id, cityId, name: `추천 장소 ${id}`, lat, lon, sourceUrl: 'https://www.reddit.com/r/TheSilphRoad/comments/verified/', coordinateSource: 'https://www.wikidata.org/wiki/Q123#P625', ...patch });

test('haversine distance handles the date line, poles, identical positions and antipodes', () => {
  assert.equal(distanceKm({ lat: 0, lon: 180 }, { lat: 0, lon: -180 }), 0);
  assert.ok(Math.abs(distanceKm({ lat: 0, lon: 179.99 }, { lat: 0, lon: -179.99 }) - 2.22390160467) < 1e-8);
  assert.ok(distanceKm({ lat: 90, lon: -170 }, { lat: 90, lon: 170 }) < 1e-9);
  assert.equal(distanceKm({ lat: 37.5, lon: 127 }, { lat: 37.5, lon: 127 }), 0);
  assert.ok(Math.abs(distanceKm({ lat: 0, lon: 0 }, { lat: 0, lon: 180 }) - 20015.114442) < 1e-5);
  assert.throws(() => distanceKm({ lat: 91, lon: 0 }, { lat: 0, lon: 0 }), RangeError);
  assert.throws(() => distanceKm({ lat: 0, lon: NaN }, { lat: 0, lon: 0 }), RangeError);
});

test('includes the exact circle boundary while excluding points just beyond it', () => {
  const center = raid('a-center');
  const boundary = raid('b-boundary', 0, 0.01);
  const inside = raid('c-inside', 0, -0.009999);
  const outside = raid('d-outside', 0, -0.01001);
  const radius = distanceKm(center, boundary);
  const output = findRaidHotspots([outside, inside, boundary, center], radius, 1);
  assert.equal(output[0].id, 'a-center');
  assert.deepEqual(output[0].raidIds, ['a-center', 'b-boundary', 'c-inside']);
  assert.equal(output[0].count, 3);
});

test('clusters across the antimeridian and keeps independent cities separate', () => {
  const input = [raid('a', 0, 179.999), raid('b', 0, -179.999), raid('c', 0, 179.999, 'other-city')];
  const output = findRaidHotspots(input, 1);
  assert.equal(output.length, 2);
  assert.deepEqual(output[0].raidIds, ['a', 'b']);
  assert.deepEqual(output[1].raidIds, ['c']);
});

test('selects the most populated actual gym centre and omits circles sharing any selected raid ID', () => {
  const input = [raid('a', 0, 0), raid('b', 0, 0.005), raid('c', 0, 0.01), raid('d', 0, 0.1), raid('e', 0, 0.105)];
  const output = findRaidHotspots(input, 0.7);
  assert.equal(output.length, 2);
  assert.equal(output[0].id, 'b');
  assert.deepEqual(output[0].raidIds, ['a', 'b', 'c']);
  assert.deepEqual(output[1].raidIds, ['d', 'e']);
  assert.equal(new Set(output.flatMap(point => point.raidIds)).size, 5);
});

test('overlap suppression uses shared members, even if the candidate centres are farther apart than the radius', () => {
  const input = [raid('a', 0, -0.006), raid('b', 0, 0), raid('c', 0, 0.006), raid('d', 0, 0.012), raid('e', 0, 0.018)];
  const output = findRaidHotspots(input, 0.7);
  assert.deepEqual(output[0].raidIds, ['a', 'b', 'c']);
  assert.equal(output.some(point => point.raidIds.includes('c') && point.id !== output[0].id), false);
  // Candidate d overlaps the selected circle through c, whereas e's smaller
  // d/e circle is genuinely disjoint and remains eligible.
  assert.deepEqual(output.map(point => point.id), ['b', 'e']);
  assert.deepEqual(output.map(point => point.count), [3, 2]);
});

test('duplicate IDs count once, conflicting duplicates and ties are stable after shuffling, and input is not mutated', () => {
  const input = [raid('b', 0, 0.1), raid('a', 0, 0), raid('a', 0, 0), raid('z', 0, 0.1, 'a-city'), raid('a', 0, 0.2)];
  const original = JSON.stringify(input);
  const expected = findRaidHotspots(input, 0.2);
  assert.deepEqual(findRaidHotspots([...input].reverse(), 0.2), expected);
  assert.deepEqual(findRaidHotspots([input[3], input[0], input[4], input[2], input[1]], 0.2), expected);
  assert.equal(JSON.stringify(input), original);
  assert.equal(expected.reduce((sum, point) => sum + point.count, 0), 3);
  assert.equal(expected[0].cityId, 'a-city');
});

test('empty and invalid data are safe; invalid radius and limits are rejected', () => {
  assert.deepEqual(findRaidHotspots([], 1), []);
  assert.deepEqual(findRaidHotspots([raid('a')], 1, 0), []);
  assert.deepEqual(findRaidHotspots([raid('', 0, 0), raid('bad-lat', 100, 0), raid('bad-lon', 0, 181), raid('nan', NaN, 0)], 1), []);
  for (const radius of [0, -1, NaN, Infinity, -Infinity]) assert.throws(() => findRaidHotspots([], radius), RangeError);
  for (const limit of [-1, 1.5, NaN, Infinity]) assert.throws(() => findRaidHotspots([], 1, limit), RangeError);
  const global = findRaidHotspots([raid('a', 0, 0), raid('b', 0, 180)], 30000);
  assert.equal(global.length, 1);
  assert.equal(global[0].count, 2);
});

function referenceHotspots(raids, radiusKm, limit = 5) {
  const candidates = raids.map(center => ({ center, ids: raids.filter(other => other.cityId === center.cityId && distanceKm(center, other) <= radiusKm + 1e-9).map(other => other.id).sort(compare) }));
  candidates.sort((a, b) => b.ids.length - a.ids.length || compare(a.center.cityId, b.center.cityId) || compare(a.center.id, b.center.id));
  const used = new Set(), output = [];
  for (const candidate of candidates) {
    if (candidate.ids.some(id => used.has(id))) continue;
    output.push({ id: candidate.center.id, ids: candidate.ids });
    for (const id of candidate.ids) used.add(id);
    if (output.length === limit) break;
  }
  return output;
}

test('spatial index matches a small brute-force spherical reference on varied latitudes and radii', () => {
  let seed = 1337;
  const random = () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 2 ** 32);
  for (const latitude of [0, 37.5, 80, -45]) {
    const input = Array.from({ length: 70 }, (_, index) => raid(`id-${String(index).padStart(3, '0')}`, latitude + (random() - 0.5) * 0.1, (random() - 0.5) * 0.1, index % 3 ? 'city' : 'other-city'));
    for (const radius of [0.05, 0.5, 2, 7]) {
      const actual = findRaidHotspots(input, radius).map(point => ({ id: point.id, ids: point.raidIds }));
      assert.deepEqual(actual, referenceHotspots(input, radius));
    }
  }
});

test('5000-gym city and 15000-gym multi-city workloads complete without an all-pairs haversine scan', t => {
  const grid = Array.from({ length: 5000 }, (_, index) => raid(`id-${String(index).padStart(5, '0')}`, 37.5 + Math.floor(index / 100) * 0.001, 127 + (index % 100) * 0.001));
  let start = performance.now();
  const first = findRaidHotspots(grid, 0.5);
  const singleMs = performance.now() - start;
  const multi = ['a', 'b', 'c'].flatMap((city, group) => grid.map((point, index) => ({ ...point, id: `${city}-${point.id}`, cityId: city, lat: point.lat + group * 5 })));
  start = performance.now();
  const second = findRaidHotspots(multi, 0.5);
  const multiMs = performance.now() - start;
  start = performance.now();
  const dense = findRaidHotspots(grid.map(point => ({ ...point, lat: 37.5, lon: 127 })), 1);
  const denseMs = performance.now() - start;
  t.diagnostic(`5000 gyms: ${singleMs.toFixed(1)}ms; 15000 gyms: ${multiMs.toFixed(1)}ms; 5000 coincident gyms: ${denseMs.toFixed(1)}ms`);
  assert.equal(first.length, 5);
  assert.equal(second.length, 5);
  assert.equal(dense.length, 1);
  assert.equal(dense[0].count, 5000);
  assert.ok(singleMs < 5000 && multiMs < 10000 && denseMs < 5000, 'bounded large-data runtime');
});

test('community candidates use the actual recommended coordinate and count only real same-city raids', () => {
  const input = [raid('a', 0, 0.001), raid('b', 0, 0.002), raid('a', 0, 0.001), raid('foreign', 0, 0.001, 'other-city'), raid('dense-1', 0, 1), raid('dense-2', 0, 1.001), raid('dense-3', 0, 1.002)];
  const place = spot('park');
  const original = JSON.stringify([input, place]);
  const output = findRecommendedRaidHotspots(input, 0.5, [place]);
  assert.equal(output.length, 1); assert.equal(output[0].id, 'recommended:city:park');
  assert.equal(output[0].lat, place.lat); assert.equal(output[0].lon, place.lon);
  assert.equal(output[0].gymName, place.name);
  assert.deepEqual(output[0].raidIds, ['a', 'b']); assert.equal(output[0].count, 2);
  assert.deepEqual(output[0].communitySpot, { name: place.name, sourceUrl: place.sourceUrl, coordinateSource: place.coordinateSource });
  assert.equal(JSON.stringify([input, place]), original);
  assert.equal(findRaidHotspots(input, 0.5)[0].count, 3);
});

test('recommended ranking evaluates every candidate before top-five selection and suppresses overlapping raid membership', () => {
  const input = [raid('a', 0, 0), raid('b', 0, 0.001), raid('c', 0, 0.002), raid('d', 0, 0.1), raid('e', 0, 0.101), raid('f', 0, 0.2)];
  const places = [spot('third', 0, 0.2), spot('second', 0, 0.1), spot('overlap', 0, 0.001), spot('first', 0, 0)];
  const output = findRecommendedRaidHotspots(input, 0.5, places);
  assert.deepEqual(output.map(s => s.id), ['recommended:city:first', 'recommended:city:second', 'recommended:city:third']);
  assert.deepEqual(output.map(s => s.count), [3, 2, 1]);
  assert.equal(new Set(output.flatMap(s => s.raidIds)).size, 6);
  assert.deepEqual(findRecommendedRaidHotspots([...input].reverse(), 0.5, [...places].reverse()), output);
});

test('recommended circles include exact spherical boundaries and handle date-line wrapping', () => {
  const center = spot('dateline', 0, 179.999);
  const boundary = raid('boundary', 0, -179.999), inside = raid('inside', 0, 180), outside = raid('outside', 0, -179.9989);
  const output = findRecommendedRaidHotspots([outside, boundary, inside], distanceKm(center, boundary), [center]);
  assert.deepEqual(output[0].raidIds, ['boundary', 'inside']);
  assert.equal(output[0].lon, 179.999);
});

test('zero-raid recommendations stay empty without falling back to gym rankings', () => {
  assert.deepEqual(findRecommendedRaidHotspots([raid('a')], 1, [spot('distant', 0, 1)]), []);
  assert.deepEqual(findRecommendedRaidHotspots([raid('a')], 1, [spot('foreign', 0, 0, 'other-city')]), []);
  assert.deepEqual(findRecommendedRaidHotspots([], 1, [spot('a')]), []);
  assert.deepEqual(findRecommendedRaidHotspots([raid('a')], 1, []), []);
  assert.deepEqual(findRecommendedRaidHotspots([raid('a')], 1, [spot('a')], 0), []);
});

test('validates community sources and coordinates, bounds input size and deduplicates place IDs deterministically', () => {
  const input = [raid('a')];
  const places = [spot('valid'), spot('valid', 0, 0.001), spot('insecure', 0, 0, 'city', { sourceUrl: 'http://example.com' }), spot('script', 0, 0, 'city', { sourceUrl: 'javascript:alert(1)' }), spot('credentials', 0, 0, 'city', { sourceUrl: 'https://user:secret@example.com' }), spot('invalid-map', 0, 0, 'city', { coordinateSource: 'data:bad' }), spot('bad-lat', 91), spot('blank', 0, 0, 'city', { name: ' ' })];
  const output = findRecommendedRaidHotspots(input, 1, places);
  assert.equal(output.length, 1); assert.equal(output[0].lat, 0); assert.equal(output[0].lon, 0);
  assert.deepEqual(findRecommendedRaidHotspots(input, 1, places.reverse()), output);
  for (const radius of [0, -1, NaN, Infinity]) assert.throws(() => findRecommendedRaidHotspots(input, radius, []), RangeError);
  for (const limit of [-1, 1.2, Infinity]) assert.throws(() => findRecommendedRaidHotspots(input, 1, [], limit), RangeError);
  assert.throws(() => findRecommendedRaidHotspots(input, 1, Array.from({ length: 2001 }, () => spot('a'))), RangeError);
});

test('15000 raids and 112 community centres use bounded indexed queries', t => {
  const input = ['a', 'b', 'c'].flatMap((city, group) => Array.from({ length: 5000 }, (_, index) => raid(`${city}-${index}`, 37.5 + group * 5 + Math.floor(index / 100) * 0.001, 127 + index % 100 * 0.001, city)));
  const places = Array.from({ length: 112 }, (_, index) => spot(String(index), 37.5 + index % 3 * 5 + Math.floor(index / 3) * 0.001, 127.02, ['a', 'b', 'c'][index % 3]));
  const start = performance.now();
  const output = findRecommendedRaidHotspots(input, 0.5, places);
  const elapsed = performance.now() - start;
  t.diagnostic(`15000 raids /112 recommended centres: ${elapsed.toFixed(1)}ms`);
  assert.equal(output.length, 5); assert.ok(output.every(s => s.communitySpot && s.count === s.raidIds.length));
  assert.ok(elapsed < 5000, 'indexed recommendation queries complete within bounded runtime');
});
