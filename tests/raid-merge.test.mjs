import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeRaidCollections } from '../lib/raid-merge.ts';
const now = new Date('2026-11-10T03:00:00Z');
const source = (id, status='ready', fetchedAt=now.toISOString()) => ({id,cityId:'seoul',name:id,status,fetchedAt,checkedAt:now.toISOString(),count:1,message:'',url:'https://example.com/'});
const collection = (sources, raids) => ({sources,feed:{sourceName:'Public data',fetchedAt:now.toISOString(),raids}});
test('overlapping providers count a gym occurrence once and preserve known form provenance', () => {
  const legacy={id:'same-gym',formId:2577,observedAt:'2026-11-10T02:59:00Z',sourceName:'original'};
  const nearby={id:'same-gym',formId:null,observedAt:'2026-11-10T03:00:00Z',sourceName:'nearby'};
  const result=mergeRaidCollections([collection([source('legacy')],[legacy]),collection([source('nearby')],[nearby,{id:'second-gym',observedAt:now.toISOString()}])],now);
  assert.equal(result.feed.raids.length,2);
  assert.equal(result.feed.raids[0].sourceName,'original');
  assert.equal(result.feed.raids[0].observedAt,'2026-11-10T02:59:00Z');
  assert.equal(result.sources.length,2);
});
test('a stale richer record cannot suppress fresh nearby data and failures cannot age healthy collections', () => {
  const old={id:'same-gym',formId:2577,observedAt:'2026-11-10T02:49:59Z'};
  const fresh={id:'same-gym',formId:null,observedAt:now.toISOString()};
  const result=mergeRaidCollections([collection([source('old','stale','2026-11-10T02:00:00Z')],[old]),collection([source('fresh')],[fresh])],now);
  assert.deepEqual(result.feed.raids,[fresh]);
  assert.equal(result.feed.fetchedAt,now.toISOString());
  assert.ok(result.feed.sourceName.length<=120);
});
test('an older city cannot expire the combined feed or overwrite per-record response clocks', () => {
  const earlier='2026-11-10T02:50:10Z';
  const older={id:'older',observedAt:earlier};
  const fresh={id:'fresh',observedAt:now.toISOString()};
  const result=mergeRaidCollections([collection([source('old','ready',earlier)],[older]),collection([source('fresh')],[fresh])],now);
  assert.equal(result.feed.fetchedAt,now.toISOString());
  assert.equal(result.feed.raids[0].observedAt,earlier);
  const later=mergeRaidCollections([collection([source('old','ready',earlier)],[older]),collection([source('fresh')],[fresh])],new Date(now.getTime()+20000));
  assert.equal(later.sources[0].status,'stale');
  assert.equal(later.sources[1].status,'ready');
});
test('a revealed boss wins over an egg with form zero, without inventing a form', () => {
  const egg={id:'same-gym',pokemonId:null,formId:0,observedAt:now.toISOString()};
  const boss={id:'same-gym',pokemonId:889,formId:null,observedAt:'2026-11-10T02:59:58Z'};
  const result=mergeRaidCollections([collection([source('egg')],[egg]),collection([source('boss')],[boss])],now);
  assert.deepEqual(result.feed.raids,[boss]);
});
