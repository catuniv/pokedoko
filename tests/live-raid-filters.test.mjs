import test from 'node:test';
import assert from 'node:assert/strict';
import { raidKind, raidBossKey, raidBossLabel, raidTierKey, raidTierLabel, buildRaidBossOptions, matchesRaidFilters, changeRaidFilters, resetRaidFilters } from '../lib/live-raid-filters.ts';
import { hasMinimumRaidTime } from '../lib/live-raid-display.ts';

const raid = (overrides = {}) => ({ id: 'one', bossName: '자시안', pokemonId: 888, formId: 0, tier: 5, ...overrides });

test('classifies source raid grades without inventing Max Battles', () => {
  for (const [tier, kind] of [[1,'normal'],[2,'normal'],[3,'normal'],[4,'normal'],[5,'legendary'],[6,'mega'],[7,'mega'],[9,'elite'],[11,'shadow'],[12,'shadow'],[13,'shadow'],[14,'shadow'],[15,'shadow'],[16,'other'],[17,'other'],[20,'other'],[null,'other'],[undefined,'other']]) assert.equal(raidKind(raid({ tier })), kind);
  assert.equal(raidTierLabel('15'), '그림자 5성');
  assert.equal(raidTierKey({ tier: null }), 'unknown');
  assert.equal(raidTierLabel('unknown'), '등급 미공개');
});
test('retains prefix variants when source tier metadata is missing', () => {
  assert.equal(raidKind(raid({ bossName: '그림자 자시안', tier: null })), 'shadow');
  assert.equal(raidKind(raid({ bossName: '메가리자몽', tier: null })), 'mega');
  assert.equal(raidKind(raid({ bossName: 'Shadow Pikachu', tier: 1 })), 'shadow');
  assert.equal(raidKind(raid({ bossName: 'Meganium', tier: 3 })), 'normal');
});
test('boss identity keeps dex IDs, forms and shadow/mega variants separate', () => {
  const values = [raid(), raid({ formId: 2577, bossName: '자시안 · 검왕' }), raid({ formId: null, bossName: '자시안 · 검왕' }), raid({ bossName: '자시안', tier: 15 }), raid({ bossName: '자시안', tier: 6 })];
  assert.equal(new Set(values.map(raidBossKey)).size, values.length);
  assert.notEqual(raidBossKey(raid({ pokemonId: 889 })), raidBossKey(raid()));
});
test('unknown eggs remain selectable and known IDs without names stay distinct', () => {
  const egg = raid({ pokemonId: null, formId: null, bossName: null, tier: 5 });
  assert.equal(raidBossKey(egg), 'unrevealed');
  assert.equal(raidBossLabel(egg), '알 · 보스 미공개');
  assert.equal(raidBossLabel(raid({ bossName: null })), '도감 No. 888');
  assert.notEqual(raidBossKey(egg), raidBossKey(raid({ bossName: null })));
  assert.equal(matchesRaidFilters(egg, { ...resetRaidFilters(), bossKey: 'unrevealed' }), true);
});
test('dynamic boss counts group equal identities but preserve form labels', () => {
  const options = buildRaidBossOptions([raid(), raid({ id: 'two' }), raid({ id: 'three', formId: 2577, bossName: '자시안 · 검왕' })]);
  assert.equal(options.length, 2);
  assert.equal(options.find(x => x.label === '자시안').count, 2);
  assert.equal(options.find(x => x.label === '자시안 · 검왕').count, 1);
  assert.deepEqual(buildRaidBossOptions([]), []);
});
test('same-name records distinguish unconfirmed forms without assuming a form ID', () => {
  const values = [raid({ formId: 2576 }), raid({ formId: null })];
  const options = buildRaidBossOptions(values);
  assert.equal(options.length, 2);
  assert.equal(options.find(x => x.key === raidBossKey(values[0])).label, '자시안');
  assert.equal(options.find(x => x.key === raidBossKey(values[1])).label, '자시안 (폼 미확인)');
  assert.equal(new Set(buildRaidBossOptions([raid({ formId: 2576 }), raid({ formId: 2577 })]).map(x => x.label)).size, 2);
});
test('boss, kind and grade filters combine with AND and retain unknown grades', () => {
  const entry = raid({ bossName: '그림자 피카츄', pokemonId: 25, tier: 13 });
  const filters = { bossKey: raidBossKey(entry), kind: 'shadow', tier: '13' };
  assert.equal(matchesRaidFilters(entry, filters), true);
  assert.equal(matchesRaidFilters(raid(), filters), false);
  assert.equal(matchesRaidFilters(entry, { ...filters, kind: 'mega' }), false);
  assert.equal(matchesRaidFilters(entry, { ...filters, tier: '15' }), false);
  assert.equal(matchesRaidFilters(raid({ tier: null }), { ...resetRaidFilters(), tier: 'unknown' }), true);
});
test('kind/grade changes reset narrower selections and reset returns a fresh state', () => {
  const filters = { bossKey: 'selected-form', kind: 'shadow', tier: '13' };
  assert.deepEqual(changeRaidFilters(filters, { kind: 'mega' }), { bossKey: 'all', kind: 'mega', tier: 'all' });
  assert.deepEqual(changeRaidFilters(filters, { tier: '15' }), { bossKey: 'all', kind: 'shadow', tier: '15' });
  assert.deepEqual(changeRaidFilters(filters, { bossKey: 'another' }), { ...filters, bossKey: 'another' });
  assert.deepEqual(filters, { bossKey: 'selected-form', kind: 'shadow', tier: '13' });
  assert.deepEqual(resetRaidFilters(), { bossKey: 'all', kind: 'all', tier: 'all' });
  assert.notEqual(resetRaidFilters(), resetRaidFilters());
});
test('facet counts follow caller validity at the exact five-minute boundary', () => {
  const now = new Date('2026-11-10T03:00:00Z');
  const entry = raid({ endsAt: '2026-11-10T03:05:00Z' });
  assert.equal(buildRaidBossOptions([entry].filter(r => hasMinimumRaidTime(r, now)))[0].count, 1);
  assert.deepEqual(buildRaidBossOptions([entry].filter(r => hasMinimumRaidTime(r, new Date(now.getTime() + 1)))), []);
});
