import type { TradePostSummary } from "./trades";

export type TradeOwnerStorage = Pick<Storage, "length" | "key" | "getItem" | "setItem" | "removeItem">;
export type TradeOwnerEntry = { version: 2; entryId: string; ownerKey: string; createdAt: string; post?: TradePostSummary };
export const TRADE_OWNER_ENTRY_PREFIX = "pokedoko.trade-owner.v2.";
export const TRADE_OWNER_LEGACY_KEY = "pokedoko.trade-posts.v1";
export const TRADE_OWNER_REMOVED_PREFIX = "pokedoko.trade-owner-removed.v2.";
export const TRADE_OWNER_LIMIT = 30;
const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const OWNER_KEY = /^[a-f\d]{64}$/i;
const STATUSES = new Set(["pending", "approved", "closed", "removed", "rejected", "expired"]);
const TERMINAL = new Set(["closed", "removed", "rejected", "expired"]);
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const date = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));
const pokemon = (value: unknown) => object(value) && typeof value.speciesId === "number" && Number.isSafeInteger(value.speciesId) && value.speciesId > 0 && typeof value.shiny === "boolean" && typeof value.form === "string";
export class TradeOwnerStorageError extends Error {
  constructor(readonly code: "unavailable" | "limit" | "conflict" | "invalid_record" | "removed", message?: string) {
    super(message ?? ({ unavailable: "브라우저에 글 관리 정보를 저장할 수 없어 접수하지 않았어요. 저장 공간과 브라우저 설정을 확인해 주세요.", limit: "이 기기에서는 작성 기록을 30개까지 보관해요. 종료된 글의 기록을 정리한 뒤 등록해 주세요.", conflict: "다른 탭에서 관리 정보가 변경됐어요. 기록을 새로 확인해 주세요.", invalid_record: "저장된 관리 정보 일부를 읽지 못했어요. 기존 기록은 지우지 않았어요.", removed: "다른 탭에서 이미 정리한 작성 기록이에요." })[code]);
    this.name = "TradeOwnerStorageError";
  }
}
function safe<T>(work: () => T): T {
  try { return work(); } catch (cause) { if (cause instanceof TradeOwnerStorageError) throw cause; throw new TradeOwnerStorageError("unavailable"); }
}
function summary(value: unknown): TradePostSummary | undefined {
  if (!object(value) || typeof value.id !== "string" || !UUID.test(value.id) || typeof value.cityId !== "string" || (value.mode !== "local" && value.mode !== "remote") || !pokemon(value.offer) || !pokemon(value.want) || typeof value.trainerName !== "string" || typeof value.notes !== "string" || typeof value.status !== "string" || !STATUSES.has(value.status) || !date(value.createdAt) || !date(value.expiresAt)) return undefined;
  return { id: value.id.toLowerCase(), cityId: value.cityId, mode: value.mode, offer: { ...(value.offer as TradePostSummary["offer"]) }, want: { ...(value.want as TradePostSummary["want"]) }, trainerName: value.trainerName, notes: value.notes, status: value.status as TradePostSummary["status"], createdAt: value.createdAt, expiresAt: value.expiresAt };
}
function entry(value: unknown, expectedId?: string): TradeOwnerEntry | undefined {
  if (!object(value) || value.version !== 2 || typeof value.entryId !== "string" || !UUID.test(value.entryId) || expectedId && value.entryId.toLowerCase() !== expectedId.toLowerCase() || typeof value.ownerKey !== "string" || !OWNER_KEY.test(value.ownerKey) || !date(value.createdAt)) return undefined;
  const post = summary(value.post);
  return { version: 2, entryId: value.entryId.toLowerCase(), ownerKey: value.ownerKey.toLowerCase(), createdAt: value.createdAt, ...(post ? { post } : {}) };
}
function legacy(raw: string): { entries: TradeOwnerEntry[]; unreadableCount: number } {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return { entries: [], unreadableCount: 1 }; }
  if (!object(value) || value.version !== 1 || !Array.isArray(value.posts)) return { entries: [], unreadableCount: 1 };
  const entries: TradeOwnerEntry[] = []; let unreadableCount = 0;
  for (const item of value.posts) {
    if (!object(item) || typeof item.id !== "string" || !UUID.test(item.id) || typeof item.ownerKey !== "string" || !OWNER_KEY.test(item.ownerKey)) { unreadableCount++; continue; }
    const post = summary(item.post), createdAt = post?.createdAt ?? "1970-01-01T00:00:00.000Z";
    entries.push({ version: 2, entryId: item.id.toLowerCase(), ownerKey: item.ownerKey.toLowerCase(), createdAt, ...(post && post.id === item.id.toLowerCase() ? { post } : {}) });
  }
  return { entries, unreadableCount };
}
function removed(storage: TradeOwnerStorage, id: string) { return storage.getItem(TRADE_OWNER_REMOVED_PREFIX + id) !== null; }
function readEntry(storage: TradeOwnerStorage, id: string): TradeOwnerEntry | undefined {
  const raw = storage.getItem(TRADE_OWNER_ENTRY_PREFIX + id);
  if (raw === null) return undefined;
  try { return entry(JSON.parse(raw), id); } catch { return undefined; }
}
function writeChecked(storage: TradeOwnerStorage, value: TradeOwnerEntry): TradeOwnerEntry {
  const raw = JSON.stringify(value), key = TRADE_OWNER_ENTRY_PREFIX + value.entryId;
  storage.setItem(key, raw);
  if (storage.getItem(key) !== raw) throw new TradeOwnerStorageError("unavailable");
  return value;
}
export function readTradeOwnerEntries(storage: TradeOwnerStorage): { entries: TradeOwnerEntry[]; unreadableCount: number; count: number; legacyPresent: boolean } {
  return safe(() => {
    const keys = new Set<string>();
    // A second pass avoids losing a displayed item when another tab removes a key mid-scan.
    for (let pass = 0; pass < 2; pass++) for (let index = 0; index < storage.length; index++) { const key = storage.key(index); if (key?.startsWith(TRADE_OWNER_ENTRY_PREFIX)) keys.add(key); }
    const entries = new Map<string, TradeOwnerEntry>(); let unreadableCount = 0, count = 0;
    for (const key of keys) {
      const id = key.slice(TRADE_OWNER_ENTRY_PREFIX.length);
      if (removed(storage, id) || storage.getItem(key) === null) continue; count++;
      const value = readEntry(storage, id);
      if (!value) { unreadableCount++; continue; }
      entries.set(value.entryId, value);
    }
    const rawLegacy = storage.getItem(TRADE_OWNER_LEGACY_KEY);
    if (rawLegacy !== null) {
      const parsed = legacy(rawLegacy); unreadableCount += parsed.unreadableCount;
      for (const value of parsed.entries) {
        if (removed(storage, value.entryId)) continue;
        const existing = entries.get(value.entryId);
        if (!existing) { entries.set(value.entryId, value); count++; }
        else if (existing.ownerKey !== value.ownerKey) unreadableCount++;
      }
    }
    // The limit only restricts new drafts; never discard existing management capabilities.
    return { entries: [...entries.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.entryId.localeCompare(b.entryId)), unreadableCount, count, legacyPresent: rawLegacy !== null };
  });
}
export function migrateTradeOwnerStorage(storage: TradeOwnerStorage): void {
  safe(() => {
    const raw = storage.getItem(TRADE_OWNER_LEGACY_KEY); if (raw === null) return;
    const parsed = legacy(raw);
    for (const value of parsed.entries) {
      if (removed(storage, value.entryId)) continue;
      const existingRaw = storage.getItem(TRADE_OWNER_ENTRY_PREFIX + value.entryId);
      if (existingRaw !== null) {
        const existing = readEntry(storage, value.entryId);
        if (!existing || existing.ownerKey !== value.ownerKey) throw new TradeOwnerStorageError("conflict");
      } else writeChecked(storage, value);
    }
    if (parsed.unreadableCount) throw new TradeOwnerStorageError("invalid_record");
    // An older open tab may still have edited v1. Keep its changed array for the next migration.
    if (storage.getItem(TRADE_OWNER_LEGACY_KEY) === raw) storage.removeItem(TRADE_OWNER_LEGACY_KEY);
  });
}
export function createTradeOwnerJournal(storage: TradeOwnerStorage, input: { entryId: string; ownerKey: string; createdAt: string }): TradeOwnerEntry {
  return safe(() => {
    const value = entry({ ...input, version: 2 }); if (!value) throw new TradeOwnerStorageError("invalid_record");
    if (removed(storage, value.entryId)) throw new TradeOwnerStorageError("removed");
    const existingRaw = storage.getItem(TRADE_OWNER_ENTRY_PREFIX + value.entryId);
    if (existingRaw !== null) {
      const existing = readEntry(storage, value.entryId);
      if (!existing || existing.ownerKey !== value.ownerKey) throw new TradeOwnerStorageError("conflict");
      // The POST is allowed only after a durable write and read-back, including a retry.
      return writeChecked(storage, existing);
    }
    if (readTradeOwnerEntries(storage).count >= TRADE_OWNER_LIMIT) throw new TradeOwnerStorageError("limit");
    return writeChecked(storage, value);
  });
}
export function completeTradeOwnerJournal(storage: TradeOwnerStorage, entryId: string, ownerKey: string, post: TradePostSummary): TradeOwnerEntry {
  return safe(() => {
    const id = entryId.toLowerCase();
    if (!UUID.test(id) || !OWNER_KEY.test(ownerKey)) throw new TradeOwnerStorageError("invalid_record");
    if (removed(storage, id)) throw new TradeOwnerStorageError("removed");
    const existing = readEntry(storage, id); if (!existing) throw new TradeOwnerStorageError("removed");
    if (existing.ownerKey !== ownerKey.toLowerCase()) throw new TradeOwnerStorageError("conflict");
    const safePost = summary(post); if (!safePost) throw new TradeOwnerStorageError("invalid_record");
    if (existing.post && existing.post.id !== safePost.id) throw new TradeOwnerStorageError("conflict");
    const keepTerminal = existing.post && TERMINAL.has(existing.post.status) && (safePost.status === "pending" || safePost.status === "approved");
    return writeChecked(storage, { ...existing, post: keepTerminal ? existing.post : safePost });
  });
}
export function removeTradeOwnerEntry(storage: TradeOwnerStorage, entryId: string): void {
  safe(() => {
    const id = entryId.toLowerCase(); if (!UUID.test(id)) throw new TradeOwnerStorageError("invalid_record");
    const key = TRADE_OWNER_REMOVED_PREFIX + id;
    storage.setItem(key, "removed"); if (storage.getItem(key) !== "removed") throw new TradeOwnerStorageError("unavailable");
    storage.removeItem(TRADE_OWNER_ENTRY_PREFIX + id);
    if (storage.getItem(TRADE_OWNER_ENTRY_PREFIX + id) !== null) throw new TradeOwnerStorageError("unavailable");
  });
}
export function isTradeOwnerStorageEvent(event: { key: string | null }): boolean { return event.key === null || event.key === TRADE_OWNER_LEGACY_KEY || event.key.startsWith(TRADE_OWNER_ENTRY_PREFIX) || event.key.startsWith(TRADE_OWNER_REMOVED_PREFIX); }
