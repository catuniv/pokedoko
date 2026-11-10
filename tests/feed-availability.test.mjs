import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const compile = (source) => {
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
  return `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
};
const timeUrl = compile(await readFile(new URL('../lib/raid-time.ts', import.meta.url), 'utf8'));
const source = await readFile(new URL('../lib/feed-availability.ts', import.meta.url), 'utf8');
const { bossWindow, classifyBoss, pokemonIdentity, availableRaidEvents, nextRaidEvent } = await import(compile(source.replace('"./raid-time"', JSON.stringify(timeUrl))));
const seoul = { id: 'seoul', zone: 'Asia/Seoul' };
const newYork = { id: 'new-york', zone: 'America/New_York' };
const at = (value) => new Date(value);
const local = (value) => ({ value, kind: 'local' });
const instant = (value) => ({ value, kind: 'instant' });
const boss = (overrides = {}) => ({ id: 646, name: 'White Kyurem', nameKo: '화이트큐레무', form: 'white', tier: '전설', confirmedWindow: true, sourceUrl: 'https://pokemongo.com/news', types: [], image: '', shiny: false, start: local('2026-11-10T18:00:00'), end: local('2026-11-10T19:00:00'), ...overrides });
const event = (id, start, end, overrides = {}) => ({ id, name: id, nameKo: id, kind: 'raid-hour', start: local(start), end: local(end), image: '', url: 'https://pokemongo.com/news', pokemon: [], summary: '', ...overrides });

test('local boss windows depend on selected city; starts inclusive and ends exclusive', () => {
  const entry = boss();
  assert.equal(classifyBoss(entry, seoul, at('2026-11-10T08:59:59Z')), 'upcoming');
  assert.equal(classifyBoss(entry, seoul, at('2026-11-10T09:00:00Z')), 'current');
  assert.equal(classifyBoss(entry, newYork, at('2026-11-10T09:00:00Z')), 'upcoming');
  assert.equal(classifyBoss(entry, seoul, at('2026-11-10T10:00:00Z')), 'expired');
  assert.equal(bossWindow(entry, newYork).start.toISOString(), '2026-11-10T23:00:00.000Z');
});
test('absolute boss windows share the same instant across cities', () => {
  const entry = boss({ start: instant('2026-11-10T09:00:00Z'), end: instant('2026-11-10T10:00:00Z') });
  for (const city of [seoul, newYork]) assert.equal(classifyBoss(entry, city, at('2026-11-10T09:30:00Z')), 'current');
});
test('missing, invalid and reversed boss windows remain undated, never confirmed-current', () => {
  for (const entry of [boss({ start: undefined }), boss({ end: undefined }), boss({ start: local('bad') }), boss({ end: local('2026-11-10T17:00:00') })]) {
    assert.equal(bossWindow(entry, seoul), null);
    assert.equal(classifyBoss(entry, seoul, at('2026-11-10T09:30:00Z')), 'unknown');
  }
  assert.equal(classifyBoss(boss(), seoul, new Date('bad')), 'unknown');
});
test('future White and Black Kyurem keep separate form identities and do not enter current list', () => {
  const white = boss({ start: local('2026-11-15T10:00:00'), end: local('2026-11-16T18:00:00') });
  const black = { ...white, name: 'Black Kyurem', nameKo: '블랙큐레무', form: 'black' };
  assert.notEqual(pokemonIdentity(white), pokemonIdentity(black));
  assert.equal(classifyBoss(white, seoul, at('2026-11-10T09:00:00Z')), 'upcoming');
  assert.equal(classifyBoss(black, seoul, at('2026-11-10T09:00:00Z')), 'upcoming');
});
test('expired selected raid automatically resolves to next confirmed window', () => {
  const first = event('first', '2026-11-10T18:00:00', '2026-11-10T19:00:00');
  const next = event('next', '2026-11-11T18:00:00', '2026-11-11T19:00:00');
  assert.equal(nextRaidEvent([first, next], [seoul], at('2026-11-10T09:59:59Z'), 'first').id, 'first');
  assert.equal(nextRaidEvent([first, next], [seoul], at('2026-11-10T10:00:00Z'), 'first').id, 'next');
  assert.equal(nextRaidEvent([first], [seoul], at('2026-11-10T10:00:00Z'), 'first'), undefined);
});
test('raid schedules remain available while another city has a confirmed future window', () => {
  const entry = event('world-local', '2026-11-10T18:00:00', '2026-11-10T19:00:00');
  assert.deepEqual(availableRaidEvents([entry], [seoul, newYork], at('2026-11-10T10:00:00Z')).map(x => x.id), ['world-local']);
  assert.deepEqual(availableRaidEvents([entry], [seoul, newYork], at('2026-11-11T00:00:00Z')), []);
});
test('undated, general and past events never become fallback raid schedules', () => {
  const old = event('old', '2026-11-09T18:00:00', '2026-11-09T19:00:00');
  const general = event('general', '2026-11-15T10:00:00', '2026-11-16T18:00:00', { kind: 'event', pokemon: [boss()] });
  const invalid = event('invalid', 'bad', 'bad');
  assert.deepEqual(availableRaidEvents([old, general, invalid], [seoul], at('2026-11-10T09:00:00Z')), []);
  assert.equal(nextRaidEvent([old], [seoul], at('2026-11-10T09:00:00Z'), 'old'), undefined);
});
