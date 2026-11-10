import test from 'node:test';
import assert from 'node:assert/strict';
import { parseShareState, patchShareState, buildShareUrl, validShareDay, usageDetail, usageView } from '../lib/share-state.ts';
const cities = ['seoul', 'tokyo', 'new-york'];
const boss = '888:2577:base:자시안 · 검왕';
const center = { id: '서울:체육관/123', cityId: 'seoul', lat: 37.5665123456789, lon: 126.9780123456789, gymName: '서울 중심 체육관', radiusKm: 5 };

test('live sharing round-trips all selected filters and raw centre precision', () => {
  const state = { city: 'seoul', liveCity: 'seoul', boss, kind: 'legendary', tier: '5', state: 'upcoming', q: '한글 체육관 & 공원', radius: 5, mode: 'community', center };
  const url = buildShareUrl('https://pokedoko.example/live', 'live', state, cities);
  const parsed = parseShareState(new URL(url).search, cities);
  for (const [key, value] of Object.entries(state)) assert.deepEqual(parsed[key], value);
  assert.equal(new URL(url).searchParams.get('lat'), '37.5665123456789');
  assert.equal(new URL(url).searchParams.get('lon'), '126.9780123456789');
});
test('unknown enums, malformed boss IDs and control characters do not become state', () => {
  const parsed = parseShareState('?city=london&liveCity=bad&boss=javascript:alert(1)&kind=max&tier=-1&state=hatched&radius=4&mode=players&q=bad%00input&tab=expired&calendarKind=oops&from=evil', cities);
  for (const key of ['city','liveCity','boss','kind','tier','state','radius','mode','q','tab','calendarKind','from']) assert.equal(parsed[key], undefined, key);
  assert.equal(parseShareState('?boss=unrevealed&tier=unknown&state=all', cities).boss, 'unrevealed');
  assert.equal(parseShareState('?boss=25:unknown:shadow:그림자%20피카츄', cities).boss, '25:unknown:shadow:그림자 피카츄');
});
test('invalid or incomplete centres are omitted and geographic boundaries remain valid', () => {
  for (const search of ['?centerCity=unknown&lat=0&lon=0', '?centerCity=seoul&lat=91&lon=1', '?centerCity=seoul&lat=1&lon=-181', '?centerCity=seoul&lat=NaN&lon=0', '?centerCity=seoul&lat=&lon=1', '?centerCity=seoul&lat=1', '?centerCity=seoul&lat=Infinity&lon=0']) assert.equal(parseShareState(search, cities).center, undefined, search);
  assert.equal(parseShareState('?centerCity=seoul&lat=-90&lon=180&radius=10', cities).center.radiusKm, 10);
});
test('dates reject rollover and impossible months while retaining valid leap dates', () => {
  assert.equal(validShareDay('2028-02-29'), '2028-02-29');
  for (const day of ['2026-02-29','2026-02-30','2026-13-01','2026-11-31','2026-1-01','2026-11-10T00:00:00Z']) assert.equal(validShareDay(day), undefined);
  assert.equal(parseShareState('?month=2026-00&day=2026-11-31', cities).month, undefined);
});
test('owned-state patches preserve other filter owners and campaign attribution', () => {
  const input = new URL('https://pokedoko.example/live?from=dc&radius=10&mode=community&city=tokyo&unknown=keep');
  const next = patchShareState(input, { boss, q: '역', kind: 'all' });
  assert.equal(input.searchParams.has('boss'), false, 'input URL is immutable');
  for (const [key, value] of [['from','dc'],['radius','10'],['mode','community'],['city','tokyo'],['unknown','keep']]) assert.equal(next.searchParams.get(key), value);
  assert.equal(parseShareState(next.search, cities).boss, boss);
});
test('legacy city-guide links and explicit all-city shares remain unambiguous', () => {
  const legacy = new URL(buildShareUrl('https://pokedoko.example/live?city=tokyo', 'live', { city: 'tokyo' }, cities));
  assert.equal(legacy.searchParams.get('liveCity'), 'tokyo');
  const fresh = new URL(buildShareUrl('https://pokedoko.example/live', 'live', { city: 'seoul' }, cities));
  assert.equal(fresh.searchParams.get('liveCity'), 'all');
  const all = new URL(buildShareUrl('https://pokedoko.example/live?city=tokyo&liveCity=all', 'live', { city: 'tokyo' }, cities));
  assert.equal(all.searchParams.get('liveCity'), 'all');
});
test('a new share intentionally drops campaign tags, unknown params, hashes and other views', () => {
  const input = 'https://pokedoko.example/live?from=kakao&utm_source=raw&token=private&q=secret&mode=community&radius=5#fragment';
  const url = new URL(buildShareUrl(input, 'raids', { city: 'tokyo', event: 'official-hour' }, cities));
  assert.equal(url.pathname, '/raids');
  assert.equal(url.hash, '');
  assert.deepEqual([...url.searchParams.keys()], ['city','event']);
  assert.equal(url.searchParams.get('event'), 'official-hour');
  assert.equal(parseShareState('?from=kakao', cities).from, 'kakao');
});
test('calendar and Pokemon URLs restore their own month/day/detail/filter state', () => {
  const calendar = { city: 'tokyo', month: '2026-11', day: '2026-11-14', detail: 'official-white-kyurem', calendarKind: 'event' };
  const pokemon = { city: 'new-york', tab: 'upcoming', search: '큐레무', grade: '전설 5성', pokemon: 'upcoming:646:white' };
  for (const [view, state] of [['calendar',calendar],['pokemon',pokemon]]) {
    const parsed = parseShareState(new URL(buildShareUrl('https://pokedoko.example/', view, state, cities)).search, cities);
    for (const [key, value] of Object.entries(state)) assert.equal(parsed[key], value);
  }
});
test('clearing a selected region removes all centre data and preserves independently chosen radius', () => {
  const first = patchShareState(new URL('https://pokedoko.example/live?from=naver'), { center, radius: 5 });
  const cleared = patchShareState(first, { center: null, q: '' });
  for (const key of ['lat','lon','centerCity','centerId','centerName','q']) assert.equal(cleared.searchParams.has(key), false);
  assert.equal(cleared.searchParams.get('radius'), '5');
  assert.equal(cleared.searchParams.get('from'), 'naver');
});
test('independent parse calls allow back/forward restoration without leaking a previous centre', () => {
  const first = parseShareState(new URL(buildShareUrl('https://pokedoko.example', 'live', { center, radius: 5, boss }, cities)).search, cities);
  const second = parseShareState('?city=tokyo&state=all', cities);
  assert.deepEqual(first.center, center);
  assert.equal(second.center, undefined);
  assert.equal(second.boss, undefined);
  assert.equal(second.city, 'tokyo');
});
test('usage detail contains only event, view and a known city; never search or coordinates', () => {
  const detail = usageDetail('coordinate_copy', '/live', '?q=private-name&lat=37.123&lon=126.456&centerName=private-gym&city=seoul', cities);
  assert.deepEqual(detail, { event: 'coordinate_copy', view: 'live', city: 'seoul' });
  assert.deepEqual(usageDetail('share','/pokemon','?search=private',cities,'unknown'), { event: 'share', view: 'pokemon' });
  assert.deepEqual(usageDetail('coordinate_copy','/cities/tokyo','',cities,'tokyo','city'), { event: 'coordinate_copy', view: 'city', city: 'tokyo' });
  assert.equal(usageDetail('share','/not-a-view','',cities), null);
  assert.equal(usageView('/live/unrelated'), null);
  assert.equal(usageView('/','?view=pokemon'), 'pokemon');
});
