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

test('background metadata survives response-lost recovery and reload without storing contacts or extra Pokemon fields', () => {
  const shared = new Map(), firstTab = new MemoryStorage(shared), pending = draft(0);
  createTradeOwnerJournal(firstTab, pending);
  const reopenedTab = new MemoryStorage(shared), journal = readTradeOwnerEntries(reopenedTab).entries[0];
  const recovered = post(undefined, {
    offer: { speciesId: 800, shiny: true, form: '', background: { kind: 'special', name: 'Ultra Wormhole' }, unexpected: { private: 'must not persist' } },
    want: { speciesId: 25, shiny: false, form: '', background: { kind: 'location', name: 'Osaka' } },
    contactKind: 'friend_code', contactValue: '123456789012',
  });
  const saved = completeTradeOwnerJournal(reopenedTab, journal.entryId, journal.ownerKey, recovered);
  const reloaded = readTradeOwnerEntries(new MemoryStorage(shared)).entries[0];
  assert.equal(reloaded.ownerKey, pending.ownerKey);
  assert.deepEqual(reloaded.post.offer.background, { kind: 'special', name: 'Ultra Wormhole' });
  assert.deepEqual(reloaded.post.want.background, { kind: 'location', name: 'Osaka' });
  assert.equal(reloaded.post.offer.unexpected, undefined);
  assert.equal(reloaded.post.contactValue, undefined);
  assert.equal(reloaded.post.contactKind, undefined);
  assert.equal(reopenedTab.getItem(TRADE_OWNER_ENTRY_PREFIX + pending.entryId).includes('must not persist'), false);
  // The return value must not retain a nested caller-owned object after persistence.
  recovered.offer.background.name = 'Changed after saving';
  assert.equal(saved.post.offer.background.name, 'Ultra Wormhole');

  completeTradeOwnerJournal(reopenedTab, journal.entryId, journal.ownerKey, {
    ...reloaded.post,
    offer: { ...reloaded.post.offer, background: { kind: 'none', name: '' } },
    want: { ...reloaded.post.want, background: { kind: 'any', name: '' } },
  });
  const changed = readTradeOwnerEntries(firstTab).entries[0];
  assert.deepEqual(changed.post.offer.background, { kind: 'none', name: '' });
  assert.deepEqual(changed.post.want.background, { kind: 'any', name: '' });
});

test('legacy Pokemon without background remain unspecified through migration and later recovery', () => {
  const oldPost = post(), oldKey = capability(), storage = new MemoryStorage();
  storage.setItem(TRADE_OWNER_LEGACY_KEY, JSON.stringify({ version: 1, posts: [{ id: oldPost.id, ownerKey: oldKey, post: oldPost }] }));
  migrateTradeOwnerStorage(storage);
  let entry = readTradeOwnerEntries(new MemoryStorage(storage.values)).entries[0];
  assert.equal(entry.ownerKey, oldKey);
  assert.equal(Object.hasOwn(entry.post.offer, 'background'), false);
  assert.equal(Object.hasOwn(entry.post.want, 'background'), false);
  completeTradeOwnerJournal(storage, entry.entryId, entry.ownerKey, { ...oldPost, status: 'approved' });
  entry = readTradeOwnerEntries(storage).entries[0];
  assert.equal(entry.post.status, 'approved');
  assert.equal(Object.hasOwn(entry.post.offer, 'background'), false);
  assert.equal(Object.hasOwn(entry.post.want, 'background'), false);
});

test('malformed background summaries cannot replace saved data or remove a management capability', () => {
  const invalidBackgrounds = [
    null, [], 'Osaka', { kind: 'unknown', name: 'Osaka' }, { kind: 'location', name: '' },
    { kind: 'location', name: 'Osaka ' }, { kind: 'special', name: 'x'.repeat(81) },
    { kind: 'special', name: 'Ultra\u0000Wormhole' }, { kind: 'none', name: 'Osaka' },
    { kind: 'any', name: 'named' }, { kind: 'location', name: 'Osaka', nested: { anything: true } },
  ];
  const storage = new MemoryStorage(), pending = draft(0), originalPost = post();
  createTradeOwnerJournal(storage, pending);
  completeTradeOwnerJournal(storage, pending.entryId, pending.ownerKey, originalPost);
  const before = storage.snapshot();
  for (const background of invalidBackgrounds) {
    storageError(() => completeTradeOwnerJournal(storage, pending.entryId, pending.ownerKey,
      { ...originalPost, offer: { ...originalPost.offer, background } }), 'invalid_record');
    storageError(() => completeTradeOwnerJournal(storage, pending.entryId, pending.ownerKey,
      { ...originalPost, want: { ...originalPost.want, background } }), 'invalid_record');
    assert.deepEqual(storage.snapshot(), before);
  }
  storageError(() => completeTradeOwnerJournal(storage, pending.entryId, pending.ownerKey,
    { ...originalPost, offer: { ...originalPost.offer, background: { kind: 'any', name: '' } } }), 'invalid_record');
  assert.deepEqual(storage.snapshot(), before);

  // A previously corrupted summary is optional metadata; retain the receipt for server recovery.
  const raw = JSON.parse(storage.getItem(TRADE_OWNER_ENTRY_PREFIX + pending.entryId));
  raw.post.offer.background = { kind: 'special', name: 'x'.repeat(81) };
  storage.setItem(TRADE_OWNER_ENTRY_PREFIX + pending.entryId, JSON.stringify(raw));
  const readable = readTradeOwnerEntries(new MemoryStorage(storage.values));
  assert.equal(readable.entries.length, 1);
  assert.equal(readable.entries[0].ownerKey, pending.ownerKey);
  assert.equal(readable.entries[0].post, undefined);
  assert.equal(readable.count, 1);
  completeTradeOwnerJournal(storage, pending.entryId, pending.ownerKey, originalPost);
  assert.equal(readTradeOwnerEntries(storage).entries[0].post.id, originalPost.id);

  const legacyStorage = new MemoryStorage(), legacyKey = capability();
  legacyStorage.setItem(TRADE_OWNER_LEGACY_KEY, JSON.stringify({ version: 1, posts: [
    { id: originalPost.id, ownerKey: legacyKey, post: raw.post },
  ] }));
  migrateTradeOwnerStorage(legacyStorage);
  const migrated = readTradeOwnerEntries(legacyStorage).entries[0];
  assert.equal(migrated.ownerKey, legacyKey);
  assert.equal(migrated.post, undefined);
  completeTradeOwnerJournal(legacyStorage, migrated.entryId, migrated.ownerKey, originalPost);
  assert.equal(readTradeOwnerEntries(legacyStorage).entries[0].post.id, originalPost.id);
});

test('optional GPS declarations survive journal completion and reload without changing old records', () => {
  const storage = new MemoryStorage();
  for (const gpsCapable of [true, false, undefined]) {
    const saved = draft(0); createTradeOwnerJournal(storage, saved);
    completeTradeOwnerJournal(storage, saved.entryId, saved.ownerKey, post(undefined, gpsCapable === undefined ? {} : { gpsCapable }));
    const reloaded = readTradeOwnerEntries(new MemoryStorage(storage.values)).entries.find(item => item.entryId === saved.entryId);
    assert.equal(reloaded.post.gpsCapable, gpsCapable); assert.equal(Object.hasOwn(reloaded.post, 'gpsCapable'), gpsCapable !== undefined);
    assert.equal(reloaded.ownerKey, saved.ownerKey);
  }
  assert.equal(readTradeOwnerEntries(storage).entries.length, 3);
});

test('invalid cached GPS metadata preserves the owner capability for server recovery', () => {
  for (const gpsCapable of [null, 'true', 1, []]) {
    const storage = new MemoryStorage(), saved = draft(0); createTradeOwnerJournal(storage, saved);
    storage.setItem(TRADE_OWNER_ENTRY_PREFIX + saved.entryId, JSON.stringify({ ...saved, version: 2, post: post(undefined, { gpsCapable }) }));
    const restored = readTradeOwnerEntries(storage).entries[0];
    assert.equal(restored.ownerKey, saved.ownerKey); assert.equal(restored.post, undefined); assert.equal(restored.entryId, saved.entryId);
    completeTradeOwnerJournal(storage, saved.entryId, saved.ownerKey, post(undefined, { gpsCapable: false }));
    assert.equal(readTradeOwnerEntries(storage).entries[0].post.gpsCapable, false);
  }
});
