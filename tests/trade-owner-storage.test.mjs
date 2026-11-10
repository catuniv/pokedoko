import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../lib/trade-owner-storage.ts', import.meta.url), 'utf8');
const runtime = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { TRADE_OWNER_ENTRY_PREFIX, TRADE_OWNER_LEGACY_KEY, TRADE_OWNER_REMOVED_PREFIX, TRADE_OWNER_LIMIT, TradeOwnerStorageError,
  readTradeOwnerEntries, migrateTradeOwnerStorage, createTradeOwnerJournal, completeTradeOwnerJournal, removeTradeOwnerEntry } = await import(`data:text/javascript;base64,${Buffer.from(runtime + '\n//# sourceURL=trade-owner-storage-test-runtime.js').toString('base64')}`);
const FIXED = Date.parse('2026-11-10T03:00:00Z');
const capability = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex');
const draft = offset => ({ entryId: crypto.randomUUID(), ownerKey: capability(), createdAt: new Date(FIXED + offset).toISOString() });
const post = (id = crypto.randomUUID(), patch = {}) => ({ id, trainerName: '관리 정보 테스트', cityId: 'seoul', mode: 'local',
  offer: { speciesId: 25, shiny: false, form: '' }, want: { speciesId: 1, shiny: true, form: '' },
  notes: '개인 연락처를 저장하지 않는 요약입니다.', status: 'pending', createdAt: new Date(FIXED).toISOString(), expiresAt: new Date(FIXED + 3 * 86400000).toISOString(), ...patch });

/** Separate tab wrappers share durable data but never copy one tab's stale array over another. */
class MemoryStorage {
  constructor(values = new Map()) { this.values = values; this.failSet = () => false; this.failRemove = () => false; }
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { if (this.failSet(key, String(value))) throw new Error('simulated quota error'); this.values.set(key, String(value)); }
  removeItem(key) { if (this.failRemove(key)) throw new Error('simulated removal error'); this.values.delete(key); }
  snapshot() { return [...this.values.entries()].sort(([a], [b]) => a.localeCompare(b)); }
}
const storageError = (work, code) => assert.throws(work, cause => cause instanceof TradeOwnerStorageError && cause.code === code);

test('two tabs can create and complete separate journals without replacing another tab management capability', () => {
  const shared = new Map(), a = new MemoryStorage(shared), b = new MemoryStorage(shared), first = draft(0), second = draft(1);
  assert.equal(readTradeOwnerEntries(a).count, 0); assert.equal(readTradeOwnerEntries(b).count, 0);
  createTradeOwnerJournal(a, first); createTradeOwnerJournal(b, second);
  const firstPost = post(), secondPost = post();
  completeTradeOwnerJournal(a, first.entryId, first.ownerKey, firstPost);
  completeTradeOwnerJournal(b, second.entryId, second.ownerKey, secondPost);
  const reloaded = readTradeOwnerEntries(new MemoryStorage(shared));
  assert.equal(reloaded.entries.length, 2);
  assert.equal(reloaded.entries.find(entry => entry.entryId === first.entryId).ownerKey, first.ownerKey);
  assert.equal(reloaded.entries.find(entry => entry.entryId === second.entryId).ownerKey, second.ownerKey);
  const retry = createTradeOwnerJournal(b, { ...first, createdAt: new Date(FIXED + 999).toISOString() });
  assert.equal(retry.createdAt, first.createdAt); assert.equal(retry.post.id, firstPost.id);
  storageError(() => createTradeOwnerJournal(a, { ...first, ownerKey: capability() }), 'conflict');
  assert.equal(readTradeOwnerEntries(a).entries.length, 2);
});

test('a response-lost journal survives reload before any server ID is known and can be completed after recovery', () => {
  const storage = new MemoryStorage(), pending = draft(0);
  createTradeOwnerJournal(storage, pending);
  // The remote POST may commit, but no response reaches this tab and no completion write occurs.
  const reopened = new MemoryStorage(storage.values), journal = readTradeOwnerEntries(reopened).entries[0];
  assert.equal(journal.ownerKey, pending.ownerKey); assert.equal(journal.entryId, pending.entryId);
  assert.equal(journal.post, undefined);
  const recoveredPost = post();
  assert.notEqual(recoveredPost.id, pending.entryId, 'the durable local receipt ID is independent of the eventual server post ID');
  completeTradeOwnerJournal(reopened, journal.entryId, journal.ownerKey, recoveredPost);
  const complete = readTradeOwnerEntries(storage).entries[0];
  assert.equal(complete.entryId, pending.entryId); assert.equal(complete.ownerKey, pending.ownerKey);
  assert.equal(complete.post.id, recoveredPost.id);
  assert.equal(readTradeOwnerEntries(storage).count, 1);
});

test('failed durable reservation blocks a new capability while completion failure preserves the saved draft and other posts', () => {
  const storage = new MemoryStorage(), previous = draft(0), next = draft(1);
  createTradeOwnerJournal(storage, previous); completeTradeOwnerJournal(storage, previous.entryId, previous.ownerKey, post());
  const original = storage.snapshot();
  storage.failSet = key => key === TRADE_OWNER_ENTRY_PREFIX + next.entryId;
  storageError(() => createTradeOwnerJournal(storage, next), 'unavailable');
  assert.deepEqual(storage.snapshot(), original);
  assert.equal(readTradeOwnerEntries(storage).entries[0].ownerKey, previous.ownerKey);
  storage.failSet = () => false; createTradeOwnerJournal(storage, next);
  const reserved = storage.snapshot();
  storage.failSet = key => key === TRADE_OWNER_ENTRY_PREFIX + next.entryId;
  storageError(() => completeTradeOwnerJournal(storage, next.entryId, next.ownerKey, post()), 'unavailable');
  assert.deepEqual(storage.snapshot(), reserved);
  const reopened = readTradeOwnerEntries(new MemoryStorage(storage.values));
  assert.equal(reopened.entries.find(entry => entry.entryId === next.entryId).ownerKey, next.ownerKey);
  assert.equal(reopened.entries.find(entry => entry.entryId === next.entryId).post, undefined);
  assert.equal(reopened.entries.find(entry => entry.entryId === previous.entryId).ownerKey, previous.ownerKey);
});

test('the thirty-entry limit rejects only new journals and never discards already-existing thirty-one capabilities', () => {
  const storage = new MemoryStorage(), originals = [];
  for (let i = 0; i < TRADE_OWNER_LIMIT; i++) { const value = draft(i); originals.push(value); createTradeOwnerJournal(storage, value); }
  const before = storage.snapshot();
  storageError(() => createTradeOwnerJournal(storage, draft(100)), 'limit');
  assert.deepEqual(storage.snapshot(), before); assert.equal(readTradeOwnerEntries(storage).entries.length, 30);
  // Represents an already-saved extra entry from an older client or a cross-tab race.
  const extra = { version: 2, ...draft(200) }; storage.setItem(TRADE_OWNER_ENTRY_PREFIX + extra.entryId, JSON.stringify(extra));
  const all = readTradeOwnerEntries(storage);
  assert.equal(all.count, 31); assert.equal(all.entries.length, 31); assert.equal(all.unreadableCount, 0);
  for (const original of originals) assert.ok(all.entries.some(entry => entry.ownerKey === original.ownerKey));
  storageError(() => createTradeOwnerJournal(storage, draft(300)), 'limit');
  assert.equal(createTradeOwnerJournal(storage, originals[0]).ownerKey, originals[0].ownerKey);
  assert.equal(readTradeOwnerEntries(storage).entries.length, 31);
});

test('partial legacy migration keeps its original and tombstones prevent stale or failed removals from resurrecting deleted entries', () => {
  const firstPost = post(), secondPost = post(), firstKey = capability(), secondKey = capability();
  const legacy = JSON.stringify({ version: 1, posts: [{ id: firstPost.id, ownerKey: firstKey, post: firstPost }, { id: secondPost.id, ownerKey: secondKey, post: secondPost }] });
  const storage = new MemoryStorage(); storage.setItem(TRADE_OWNER_LEGACY_KEY, legacy);
  storage.failSet = key => key === TRADE_OWNER_ENTRY_PREFIX + secondPost.id;
  storageError(() => migrateTradeOwnerStorage(storage), 'unavailable');
  assert.equal(storage.getItem(TRADE_OWNER_LEGACY_KEY), legacy);
  const partial = readTradeOwnerEntries(storage);
  assert.equal(partial.count, 2); assert.equal(partial.entries.length, 2);
  assert.ok(partial.entries.some(entry => entry.ownerKey === firstKey)); assert.ok(partial.entries.some(entry => entry.ownerKey === secondKey));
  storage.failSet = () => false;
  storage.failRemove = key => key === TRADE_OWNER_ENTRY_PREFIX + firstPost.id;
  storageError(() => removeTradeOwnerEntry(storage, firstPost.id), 'unavailable');
  assert.notEqual(storage.getItem(TRADE_OWNER_REMOVED_PREFIX + firstPost.id), null);
  assert.notEqual(storage.getItem(TRADE_OWNER_ENTRY_PREFIX + firstPost.id), null, 'the failed removal leaves raw data, so reads must respect its tombstone');
  assert.deepEqual(readTradeOwnerEntries(storage).entries.map(entry => entry.entryId), [secondPost.id]);
  storageError(() => completeTradeOwnerJournal(storage, firstPost.id, firstKey, firstPost), 'removed');
  storage.failRemove = () => false; migrateTradeOwnerStorage(storage);
  assert.equal(storage.getItem(TRADE_OWNER_LEGACY_KEY), null);
  const complete = readTradeOwnerEntries(storage);
  assert.equal(complete.entries.length, 1); assert.equal(complete.entries[0].ownerKey, secondKey);
});
