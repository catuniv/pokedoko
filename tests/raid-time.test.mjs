import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function importTypeScript(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}

const { CITIES } = await importTypeScript('../lib/cities.ts');
const {
  localParts, localToInstant, eventWindow, getCityWindows, formatKst,
  formatLocal, countdown, describeOffset, getGymState, getNextGymStart,
} = await importTypeScript('../lib/raid-time.ts');

const city = id => CITIES.find(item => item.id === id);
const raid = (overrides = {}) => ({
  id: 'zamazenta-raid-hour-2026-11-10', name: 'Zamazenta Raid Hour', nameKo: '자마젠타 레이드 아워',
  kind: 'raid-hour', start: { value: '2026-11-10T18:00:00', kind: 'local' },
  end: { value: '2026-11-10T19:00:00', kind: 'local' }, image: '',
  url: 'https://pokemongo.com/news/into-the-wild-2026', pokemon: [], summary: '', ...overrides,
});
const observation = (overrides = {}) => ({
  id: 'gym-1', name: '직접 기록한 체육관', cityId: 'seoul',
  startsAt: '2026-11-10T09:00:00Z', endsAt: '2026-11-10T09:37:00Z',
  recordedAt: '2026-11-10T08:00:00Z', pokemonName: '자마젠타', ...overrides,
});

test('local time uses each city zone, independent from browser or process zone', () => {
  assert.equal(localToInstant('2026-11-10T18:00:00', 'Asia/Seoul').toISOString(), '2026-11-10T09:00:00.000Z');
  assert.equal(localToInstant('2026-11-10T18:00:00', 'America/New_York').toISOString(), '2026-11-10T23:00:00.000Z');
});

test('New York DST is calculated per date, including overlap and nonexistent time', () => {
  assert.equal(localToInstant('2026-07-01T18:00:00', 'America/New_York').toISOString(), '2026-07-01T22:00:00.000Z');
  assert.equal(localToInstant('2026-11-01T01:30:00', 'America/New_York').toISOString(), '2026-11-01T05:30:00.000Z');
  assert.throws(() => localToInstant('2026-03-08T02:30:00', 'America/New_York'), RangeError);
});

test('Lord Howe half-hour DST transition is supported', () => {
  assert.equal(localToInstant('2026-04-05T01:45:00', 'Australia/Lord_Howe').toISOString(), '2026-04-04T14:45:00.000Z');
  assert.throws(() => localToInstant('2026-10-04T02:15:00', 'Australia/Lord_Howe'), RangeError);
  assert.equal(localToInstant('2026-10-04T02:45:00', 'Australia/Lord_Howe').toISOString(), '2026-10-03T15:45:00.000Z');
});

test('UTC+14 and UTC-10 represent the same local event one day apart', () => {
  const early = eventWindow(raid(), city('kiritimati'));
  const late = eventWindow(raid(), city('honolulu'));
  assert.equal(early.start.toISOString(), '2026-11-10T04:00:00.000Z');
  assert.equal(late.start.toISOString(), '2026-11-11T04:00:00.000Z');
  assert.equal(late.start.getTime() - early.start.getTime(), 86_400_000);
  assert.equal(formatKst(late.start), '11월 11일 (수) 13:00');
});

test('local and instant feed times are not conflated', () => {
  const local = eventWindow(raid(), city('tokyo'));
  const instant = eventWindow(raid({ start: { value: '2026-11-10T18:00:00Z', kind: 'instant' }, end: { value: '2026-11-10T19:00:00Z', kind: 'instant' } }), city('tokyo'));
  assert.equal(formatKst(local.start), '11월 10일 (화) 18:00');
  assert.equal(formatKst(instant.start), '11월 11일 (수) 03:00');
  assert.equal(eventWindow(raid({ start: { value: '2026-11-10T18:00:00', kind: 'instant' } }), city('tokyo')), null);
});

test('active official windows are half-open and ended windows disappear', () => {
  const events = [raid()];
  assert.equal(getCityWindows(city('seoul'), events, new Date('2026-11-10T08:59:59Z'))[0].active, false);
  assert.equal(getCityWindows(city('seoul'), events, new Date('2026-11-10T09:00:00Z'))[0].active, true);
  assert.equal(getCityWindows(city('seoul'), events, new Date('2026-11-10T09:59:59Z'))[0].active, true);
  assert.deepEqual(getCityWindows(city('seoul'), events, new Date('2026-11-10T10:00:00Z')), []);
});

test('explicit Tuesday raid hour is retained and no Wednesday recurrence is invented', () => {
  const now = new Date('2026-11-09T00:00:00Z');
  const result = getCityWindows(city('seoul'), [raid()], now);
  assert.equal(result.length, 1);
  assert.equal(localParts(result[0].start, 'Asia/Seoul').weekday, 2);
  assert.deepEqual(getCityWindows(city('seoul'), [raid()], new Date('2026-11-11T00:00:00Z')), []);
});

test('next official rounds are chronological and unrelated event types are excluded', () => {
  const late = raid({ id: 'later', kind: 'raid-day', start: { value: '2026-11-14T14:00:00', kind: 'local' }, end: { value: '2026-11-14T17:00:00', kind: 'local' } });
  const other = raid({ id: 'spotlight', kind: 'spotlight' });
  assert.deepEqual(getCityWindows(city('seoul'), [late, other, raid()], new Date('2026-11-09T00:00:00Z')).map(item => item.event.id), ['zamazenta-raid-hour-2026-11-10', 'later']);
  assert.deepEqual(getCityWindows(city('seoul'), [], new Date()), []);
});

test('invalid/null source dates, nonexistent dates, and reversed windows are safely omitted', () => {
  for (const event of [raid({ start: null }), raid({ start: { value: null, kind: 'local' } }), raid({ end: { value: '2026-11-10T17:00:00', kind: 'local' } }), raid({ start: { value: '2026-02-30T18:00:00', kind: 'local' } })]) {
    assert.equal(eventWindow(event, city('seoul')), null);
  }
  assert.throws(() => localToInstant('2026-11-10T24:00:00', 'Asia/Seoul'), RangeError);
  assert.throws(() => localToInstant('2026-11-10T18:00:00Z', 'Asia/Seoul'), RangeError);
  assert.deepEqual(getCityWindows(city('seoul'), [raid()], new Date('invalid')), []);
});

test('clock, countdown, and KST offsets preserve seconds and non-hour differences', () => {
  const date = new Date('2026-11-10T09:04:05Z');
  assert.equal(formatLocal(date, 'Asia/Seoul'), '18:04:05');
  assert.equal(formatKst(date, false), '18:04');
  assert.equal(countdown(-1000), '00:00:00');
  assert.equal(countdown(1001), '00:00:02');
  assert.equal(countdown(90_061_000), '1일 01:01');
  assert.equal(describeOffset(city('seoul'), date), '한국과 같은 시간');
  assert.equal(describeOffset(city('new-york'), date), '한국보다 14시간 느림');
  assert.equal(describeOffset({ ...city('sydney'), zone: 'Australia/Darwin' }, date), '한국보다 30분 빠름');
});

test('observed gym timing uses actual recorded start/end, without an assumed duration', () => {
  assert.equal(getGymState(observation(), new Date('2026-11-10T08:59:59Z')), 'waiting');
  assert.equal(getGymState(observation(), new Date('2026-11-10T09:00:00Z')), 'active');
  assert.equal(getGymState(observation(), new Date('2026-11-10T09:37:00Z')), 'ended');
  assert.equal(getGymState(observation({ endsAt: null }), new Date('2026-11-10T08:59:59Z')), 'waiting');
  assert.equal(getGymState(observation({ endsAt: null }), new Date('2026-11-10T10:00:00Z')), 'unknownend');
  assert.equal(getGymState(observation({ startsAt: '2026-11-10T09:00:00' }), new Date()), 'unknownend');
});

test('next hatch is only an explicitly observed future time and can be city-filtered', () => {
  const records = [observation(), observation({ id: 'gym-2', cityId: 'tokyo', startsAt: '2026-11-10T08:30:00Z' })];
  assert.equal(getNextGymStart(records, new Date('2026-11-10T08:00:00Z')).toISOString(), '2026-11-10T08:30:00.000Z');
  assert.equal(getNextGymStart(records, new Date('2026-11-10T08:00:00Z'), 'seoul').toISOString(), '2026-11-10T09:00:00.000Z');
  assert.equal(getNextGymStart(records, new Date('2026-11-10T09:00:00Z')), null);
});

test('every curated city has a valid IANA timezone, unique id, and valid landmark coordinates', () => {
  assert.equal(CITIES.length, 24);
  assert.equal(new Set(CITIES.map(item => item.id)).size, CITIES.length);
  for (const item of CITIES) {
    assert.doesNotThrow(() => localParts(new Date('2026-11-10T09:00:00Z'), item.zone));
    assert.ok(Math.abs(item.lat) <= 90 && Math.abs(item.lon) <= 180);
    assert.ok(item.spots.length >= 1 && item.spots.length <= 5);
    assert.equal(new Set(item.spots.map(spot => spot.name)).size, item.spots.length);
    for (const spot of item.spots) {
      assert.ok(Number.isFinite(spot.lat) && Math.abs(spot.lat) <= 90);
      assert.ok(Number.isFinite(spot.lon) && Math.abs(spot.lon) <= 180);
      assert.equal(new URL(spot.sourceUrl).protocol, 'https:');
      assert.equal(new URL(spot.coordinateSource).protocol, 'https:');
    }
  }
});
