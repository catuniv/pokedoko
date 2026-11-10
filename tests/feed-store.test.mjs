import test from 'node:test';
import assert from 'node:assert/strict';
import { createFeedStore, FEED_SNAPSHOT_KEY } from '../lib/feed-store.ts';

const FIXED = Date.parse('2026-11-10T05:00:00Z');
const feed = (patch = {}) => ({
  events: [{ id: 'announced-event', name: 'Announced Event', nameKo: '확인된 일정', kind: 'event', start: { value: '2026-11-10T10:00:00', kind: 'local' }, end: { value: '2026-11-13T20:00:00', kind: 'local' }, pokemon: [], image: '', url: 'https://pokemongo.com/news', summary: '' }],
  bosses: [], fetchedAt: new Date(FIXED).toISOString(), source: 'Public source', sourceUrl: 'https://github.com/bigfoott/ScrapedDuck', cached: false, error: null, ...patch,
});
const fallback = feed({ fetchedAt: new Date(FIXED - 86_400_000).toISOString(), cached: true });
const snapshot = (value, storedAt = value.fetchedAt) => JSON.stringify({ version: 1, storedAt, feed: value });
function bucket(initial = null) {
  let content = initial;
  const reads = [], writes = [];
  return {
    reads, writes,
    get content() { return content; },
    async get(key) { reads.push(key); return content === null ? null : { size: Buffer.byteLength(content), text: async () => content }; },
    async put(key, value, options) { writes.push({ key, value, options }); content = value; },
  };
}
const store = (load, extras = {}) => createFeedStore({ load, fallback, now: () => new Date(FIXED), ...extras });

test('persists only a successful fixed public feed and another isolate reads it without a source fetch', async () => {
  const r2 = bucket();
  let loads = 0;
  const first = await store(async () => { loads++; return feed(); })(r2);
  assert.equal(first.cache, 'fresh'); assert.equal(first.storage, 'ready');
  assert.equal(r2.writes.length, 1); assert.equal(r2.writes[0].key, FEED_SNAPSHOT_KEY);
  assert.equal(r2.writes[0].options.httpMetadata.contentType, 'application/json; charset=utf-8');
  const saved = JSON.parse(r2.content);
  assert.equal(saved.feed.fetchedAt, feed().fetchedAt); assert.equal(saved.storedAt, feed().fetchedAt);
  const second = await store(async () => { loads++; throw new Error('should not load'); })(r2);
  assert.equal(loads, 1); assert.equal(second.cache, 'r2'); assert.equal(second.feed.cached, true);
  assert.equal(second.feed.error, null); assert.equal(second.feed.fetchedAt, first.feed.fetchedAt);
  assert.equal(r2.writes.length, 1);
});

test('five-minute stale data refreshes through the loader and preserves its own upstream timestamp', async () => {
  const old = feed({ fetchedAt: new Date(FIXED - 300_000).toISOString() });
  const r2 = bucket(snapshot(old));
  const result = await store(async () => feed({ fetchedAt: new Date(FIXED - 1000).toISOString() }))(r2);
  assert.equal(result.cache, 'fresh'); assert.equal(r2.writes.length, 1);
  assert.equal(result.feed.fetchedAt, new Date(FIXED - 1000).toISOString());
  assert.equal(JSON.parse(r2.content).feed.fetchedAt, result.feed.fetchedAt);
  assert.equal(JSON.parse(r2.content).storedAt, new Date(FIXED).toISOString());
});

test('freshly written envelopes cannot make old upstream timestamps fresh', async () => {
  const old = feed({ fetchedAt: new Date(FIXED - 300_000).toISOString() });
  const r2 = bucket(snapshot(old, new Date(FIXED).toISOString()));
  let loads = 0;
  await store(async () => { loads++; return feed(); })(r2);
  assert.equal(loads, 1); assert.equal(r2.writes.length, 1);
});

test('source failures return last-good durable data without rewriting or assigning it a fresh time', async () => {
  const old = feed({ fetchedAt: new Date(FIXED - 360_000).toISOString() });
  const contents = snapshot(old);
  const r2 = bucket(contents);
  const result = await store(async () => { throw new Error('sensitive upstream detail'); })(r2);
  assert.equal(result.cache, 'stale'); assert.equal(result.feed.cached, true);
  assert.equal(result.feed.fetchedAt, old.fetchedAt); assert.equal(result.storedAt, old.fetchedAt);
  assert.equal(r2.writes.length, 0); assert.equal(r2.content, contents);
  assert.match(result.feed.error, /마지막 확인/); assert.doesNotMatch(result.feed.error, /sensitive/);
});

test('partial or cached source data never replaces a durable last-good snapshot', async () => {
  const old = feed({ fetchedAt: new Date(FIXED - 360_000).toISOString() });
  const r2 = bucket(snapshot(old));
  const result = await store(async () => feed({ ...old, cached: true, error: '일부 자료 조회 실패' }))(r2);
  assert.equal(result.cache, 'stale'); assert.equal(result.feed.error, '일부 자료 조회 실패');
  assert.equal(result.feed.fetchedAt, old.fetchedAt); assert.equal(r2.writes.length, 0);
});

test('missing storage and read/write outages keep the public loader operational', async () => {
  let loads = 0;
  const read = async () => { loads++; return feed(); };
  const memory = await store(read)(); assert.equal(memory.cache, 'memory'); assert.equal(memory.storage, 'disabled');
  const failedRead = await store(read)({ async get() { throw new Error('offline'); }, async put() { throw new Error('offline'); } });
  assert.equal(failedRead.feed.cached, false); assert.equal(failedRead.storage, 'unavailable');
  const failedWrite = await store(read)({ async get() { return null; }, async put() { throw new Error('quota'); } });
  assert.equal(failedWrite.feed.cached, false); assert.equal(failedWrite.storage, 'unavailable');
  assert.equal(loads, 3);
});

test('bad, oversized, future-dated and partial cached snapshots are rejected and replaced from the loader', async () => {
  for (const data of ['{broken', '{}', snapshot(feed({ cached: true })), snapshot(feed({ fetchedAt: new Date(FIXED + 61_000).toISOString() })), 'x'.repeat(2 * 1024 * 1024 + 1)]) {
    const r2 = bucket(data); let loads = 0;
    const result = await store(async () => { loads++; return feed(); })(r2);
    assert.equal(loads, 1); assert.equal(result.feed.error, null); assert.equal(r2.writes.length, 1);
    assert.equal(JSON.parse(r2.content).version, 1);
  }
});

test('later storage/source outages retain the isolate last-good timestamp while fallback-only starts remain explicit', async () => {
  let broken = false;
  const read = store(async () => { if (broken) throw new Error('offline'); return feed(); });
  const initial = await read(); broken = true;
  const result = await read(); assert.equal(result.cache, 'stale'); assert.equal(result.feed.fetchedAt, initial.feed.fetchedAt);
  const fallbackOnly = await store(async () => { throw new Error('offline'); })();
  assert.equal(fallbackOnly.cache, 'memory'); assert.equal(fallbackOnly.feed.fetchedAt, fallback.fetchedAt);
  assert.equal(fallbackOnly.feed.cached, true); assert.ok(fallbackOnly.feed.error);
});

test('hung storage is bounded and falls through to source loading', { timeout: 4000 }, async () => {
  const started = performance.now();
  const result = await store(async () => feed())({ get: () => new Promise(() => {}), async put() {} });
  assert.equal(result.cache, 'fresh'); assert.equal(result.storage, 'unavailable');
  assert.ok(performance.now() - started < 3000);
});
