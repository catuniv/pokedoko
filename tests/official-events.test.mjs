import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function importTypeScript(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}

const { OFFICIAL_EVENTS, withOfficialEvents } = await importTypeScript('../lib/official-events.ts');
const { CITIES } = await importTypeScript('../lib/cities.ts');
const { eventWindow, getCityWindows } = await importTypeScript('../lib/raid-time.ts');
const city = id => CITIES.find(item => item.id === id);
const white = OFFICIAL_EVENTS.find(event => event.pokemon.some(pokemon => pokemon.form === 'white'));
const black = OFFICIAL_EVENTS.find(event => event.pokemon.some(pokemon => pokemon.form === 'black'));

test('White and Black Kyurem retain distinct forms, dates and official event classification', () => {
  assert.equal(white.start.value, '2026-11-14T10:00:00');
  assert.equal(white.end.value, '2026-11-14T18:00:00');
  assert.equal(black.start.value, '2026-11-15T10:00:00');
  assert.equal(black.end.value, '2026-11-15T18:00:00');
  assert.notEqual(white.id, black.id);
  assert.equal(white.kind, 'event');
  assert.equal(black.kind, 'event');
  assert.ok(white.pokemon.some(pokemon => pokemon.id === 646 && pokemon.nameKo === '화이트큐레무' && pokemon.form === 'white'));
  assert.ok(white.pokemon.some(pokemon => pokemon.id === 644));
  assert.ok(black.pokemon.some(pokemon => pokemon.id === 646 && pokemon.nameKo === '블랙큐레무' && pokemon.form === 'black'));
  assert.ok(black.pokemon.some(pokemon => pokemon.id === 643));
  assert.deepEqual(getCityWindows(city('seoul'), [white, black], new Date('2026-11-10T00:00:00Z')), []);
});

test('Wild Area uses local wall time across UTC+14 and UTC-10 and Korea', () => {
  const first = eventWindow(white, city('kiritimati'));
  const last = eventWindow(white, city('honolulu'));
  const korea = eventWindow(white, city('seoul'));
  assert.equal(first.start.toISOString(), '2026-11-13T20:00:00.000Z');
  assert.equal(first.end.toISOString(), '2026-11-14T04:00:00.000Z');
  assert.equal(last.start.toISOString(), '2026-11-14T20:00:00.000Z');
  assert.equal(last.end.toISOString(), '2026-11-15T04:00:00.000Z');
  assert.equal(korea.start.toISOString(), '2026-11-14T01:00:00.000Z');
  assert.equal(korea.end.toISOString(), '2026-11-14T09:00:00.000Z');
  assert.equal(last.start.getTime() - first.start.getTime(), 86_400_000);
  assert.equal(eventWindow(black, city('kiritimati')).start.toISOString(), '2026-11-14T20:00:00.000Z');
});

test('confirmed post-Wild Area events have correct kinds, main end times and conditions', () => {
  const byId = id => OFFICIAL_EVENTS.find(event => event.id === id);
  const dynamax = byId('dynamax-trails-2026');
  assert.equal(dynamax.start.value, '2026-11-16T10:00:00');
  assert.equal(dynamax.end.value, '2026-11-23T20:00:00');
  const spotlight = byId('pokemonspotlighthour2026-11-19');
  assert.equal(spotlight.kind, 'spotlight');
  assert.deepEqual(spotlight.pokemon.map(pokemon => pokemon.id), [810, 813, 816]);
  const eternamax = byId('eternamax-eternatus-2026-11-21');
  assert.equal(eternamax.kind, 'event');
  assert.equal(eternamax.end.value, '2026-11-21T14:00:00');
  assert.match(eternamax.summary, /잡을 수 없/);
  assert.match(eternamax.summary, /이미 잡았다면/);
  const community = byId('november-communityday2026');
  assert.equal(community.kind, 'community-day');
  assert.equal(community.end.value, '2026-11-21T17:00:00');
  assert.equal(byId('twilight-wishes-2026').end.value, '2026-11-30T20:00:00');
  const mega = byId('clefable-super-mega-raid-day-2026');
  assert.equal(mega.kind, 'raid-day');
  assert.equal(mega.start.value, '2026-11-28T14:00:00');
  assert.equal(mega.end.value, '2026-11-28T17:00:00');
  assert.match(mega.summary, /대상 체육관/);
  assert.match(white.summary, /추가 보너스는 글로벌 티켓/);
});

test('registry contains only unique, valid dated official events without invented recurrence', () => {
  assert.equal(OFFICIAL_EVENTS.length, 8);
  assert.equal(new Set(OFFICIAL_EVENTS.map(event => event.id)).size, OFFICIAL_EVENTS.length);
  for (const event of OFFICIAL_EVENTS) {
    assert.equal(new URL(event.url).hostname, 'pokemongo.com');
    assert.equal(event.start.kind, 'local');
    assert.equal(event.end.kind, 'local');
    assert.ok(eventWindow(event, city('seoul')));
  }
  assert.equal(OFFICIAL_EVENTS.filter(event => event.pokemon.some(pokemon => pokemon.form === 'white')).length, 1);
  assert.ok(OFFICIAL_EVENTS.every(event => event.start.value < '2026-12-01'));
});

test('official replacement wins by ID without mutating source records and is idempotent', () => {
  const inaccurate = { ...white, nameKo: '커뮤니티 이전 이름', kind: 'raid-day', end: { kind: 'local', value: '2026-11-14T19:00:00' } };
  const original = structuredClone(inaccurate);
  const input = [inaccurate];
  const merged = withOfficialEvents(input);
  assert.equal(merged.find(event => event.id === white.id), white);
  assert.deepEqual(input, [original]);
  assert.deepEqual(withOfficialEvents(merged), merged);
});

test('same official URL and local slot replaces duplicates while retaining whole-weekend umbrella', () => {
  const duplicate = {
    ...white, id: 'another-feed-saturday', kind: 'raid-day',
    url: 'https://pokemongolive.com/en/gowildarea/global/?utm_source=feed#raids',
    start: { kind: 'local', value: '2026-11-14T10:00:00.000' },
    end: { kind: 'local', value: '2026-11-14T18:00:00.000' },
  };
  const umbrella = { ...white, id: 'pokemon-go-wild-area-2026-global', end: { kind: 'local', value: '2026-11-15T18:00:00' } };
  const unrelated = { ...white, id: 'other-event', url: 'https://example.com/another-event' };
  const merged = withOfficialEvents([duplicate, umbrella, unrelated]);
  assert.ok(!merged.some(event => event.id === duplicate.id));
  assert.ok(merged.some(event => event.id === umbrella.id));
  assert.ok(merged.some(event => event.id === unrelated.id));
  assert.ok(merged.some(event => event.id === white.id));
  assert.ok(merged.some(event => event.id === black.id));
});
