import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_HUNTING_SETTINGS, parseHuntingSettings, huntingSettingsUrl } from '../lib/hunting-settings.ts';
import { HUNTING_CATALOG } from '../lib/hunting-catalog.ts';

const routeIds = HUNTING_CATALOG.map(route => route.id);
const cities = ['tokyo', 'sydney', 'seoul'];
test('catalog GPX shares preserve user speed, units, repetitions and output choices', () => {
  const input = { ...DEFAULT_HUNTING_SETTINGS, routeId: routeIds[0], speedKmh: 9.3, speedUnit: 'mps', laps: 3, mode: 'out-and-back', reverse: true, includeTimes: true, format: 'rte' };
  const url = huntingSettingsUrl('https://pokedoko.example/gpx?from=dc&lat=private&unknown=bad#file', input);
  const restored = parseHuntingSettings(url.search, routeIds, cities);
  assert.deepEqual(restored, input);
  for (const field of ['from', 'lat', 'unknown']) assert.equal(url.searchParams.has(field), false);
  assert.equal(url.hash, '');
});
test('nearby shares contain only named city, source place and bounded routing settings', () => {
  const input = { ...DEFAULT_HUNTING_SETTINGS, tab: 'nearby', cityId: 'sydney', spot: '2', radius: 5, maxStops: 200, mode: 'loop', speedKmh: 20 };
  const url = huntingSettingsUrl('https://pokedoko.example/gpx?from=inven', input, true);
  assert.equal(url.searchParams.get('from'), 'inven');
  assert.deepEqual(parseHuntingSettings(url.search, routeIds, cities), input);
  assert.equal(url.searchParams.has('route'), false);
  assert.equal(huntingSettingsUrl('https://pokedoko.example/gpx?from=private-token', input, true).searchParams.has('from'), false);
});
test('untrusted query bounds and unknown source IDs never become route controls', () => {
  const restored = parseHuntingSettings('?route=../../private&city=unknown&tab=admin&speed=Infinity&unit=mph&laps=999999&mode=teleport&radius=99&stops=100000&spot=nan&timed=true&reverse=yes&format=html', routeIds, cities);
  assert.deepEqual(restored, DEFAULT_HUNTING_SETTINGS);
  for (const speed of ['0', '-1', '120.001', '', 'NaN']) assert.equal(parseHuntingSettings(`?speed=${speed}`, routeIds, cities).speedKmh, 15);
  for (const speed of ['9.3', '15', '20', '.1', '120']) assert.equal(parseHuntingSettings(`?speed=${speed}`, routeIds, cities).speedKmh, Number(speed));
  for (const laps of ['1', '20']) assert.equal(parseHuntingSettings(`?laps=${laps}`, routeIds, cities).laps, Number(laps));
});
test('source-linked catalog pins real original files without creating rankings or granting a license', () => {
  assert.equal(new Set(routeIds).size, HUNTING_CATALOG.length);
  assert.equal(HUNTING_CATALOG.length, 8);
  for (const route of HUNTING_CATALOG) {
    const raw = new URL(route.rawUrl), source = new URL(route.sourceUrl);
    assert.equal(raw.origin, 'https://raw.githubusercontent.com');
    assert.equal(source.origin, 'https://github.com');
    assert.match(route.sourceRevision, /^[0-9a-f]{40}$/);
    assert.ok(raw.pathname.includes(`/${route.sourceRevision}/`));
    assert.ok(source.pathname.includes(`/blob/${route.sourceRevision}/`));
    assert.equal(raw.pathname.endsWith('.gpx'), true);
    assert.ok(route.pointCount >= 2 && Number.isSafeInteger(route.pointCount));
    assert.ok(route.distanceKm > 0 && Number.isFinite(route.distanceKm));
    assert.equal(Object.hasOwn(route, 'points'), false);
    assert.notEqual(route.licenseName, 'Public Domain');
  }
});
