import type { Feed } from "./pokedoko-types";

/** Minimal R2 shape keeps this helper testable without the Worker runtime. */
export type FeedBucket = {
  /** R2 is the historical default for callers that pass a bucket directly. */
  kind?: "r2" | "kv";
  /** Stable underlying binding identity across adapter wrapper instances. */
  cacheIdentity?: object;
  get(key: string): Promise<{ size?: number; text(): Promise<string> } | null>;
  put(key: string, value: string, options?: { httpMetadata?: { contentType?: string; cacheControl?: string } }): Promise<unknown>;
};
export type FeedStoreResult = {
  feed: Feed;
  cache: "fresh" | "r2" | "kv" | "stale" | "memory";
  storedAt: string | null;
  storage: "ready" | "unavailable" | "disabled";
};
type Snapshot = { version: 1; storedAt: string; feed: Feed };
type Options = { load: () => Promise<Feed>; fallback: Feed; now?: () => Date };
type Obj = Record<string, unknown>;

export const FEED_SNAPSHOT_KEY = "pokedoko/feeds/public-schedule-v1.json";
const MAX_AGE = 300_000;
const MAX_BYTES = 2 * 1024 * 1024;
const object = (value: unknown): Obj => value && typeof value === "object" && !Array.isArray(value) ? value as Obj : {};
const timestamp = (value: unknown): number | null => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const result = Date.parse(value);
  return Number.isFinite(result) ? result : null;
};

function validFeed(value: unknown, now: number): value is Feed {
  const data = object(value), fetchedAt = timestamp(data.fetchedAt);
  return fetchedAt !== null && fetchedAt <= now + 60_000 &&
    Array.isArray(data.events) && data.events.length <= 5000 &&
    data.events.every(value => {
      const event = object(value), start = object(event.start), end = object(event.end);
      return typeof event.id === "string" && typeof event.name === "string" &&
        typeof start.value === "string" && typeof end.value === "string" &&
        (start.kind === "local" || start.kind === "instant") && start.kind === end.kind &&
        Array.isArray(event.pokemon);
    }) && Array.isArray(data.bosses) && data.bosses.length <= 5000 &&
    data.bosses.every(value => typeof object(value).name === "string" && typeof object(value).tier === "string") &&
    typeof data.source === "string" && typeof data.sourceUrl === "string" &&
    typeof data.cached === "boolean" && (data.error === null || typeof data.error === "string");
}

/** R2 failure must not prevent the fixed public-source loader from running. */
async function bounded<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Storage timed out")), 1500);
    })]);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}

function fresh(snapshot: Snapshot, now: number): boolean {
  return now - Date.parse(snapshot.storedAt) < MAX_AGE && now - Date.parse(snapshot.feed.fetchedAt) < MAX_AGE;
}

/**
 * GET read-through cache for a fixed upstream loader. There is deliberately no
 * caller-supplied key, URL or write payload. Only a complete successful public
 * feed is persisted; failures never replace last-good data or its timestamps.
 */
export function createFeedStore(options: Options): (bucket?: FeedBucket | null) => Promise<FeedStoreResult> {
  const now = options.now ?? (() => new Date());
  let lastGood: Snapshot | null = null;
  let lastKvWriteAt: string | null = null;
  let lastKvWriteBinding: object | null = null;
  return async (bucket = null) => {
    const at = now().getTime();
    let stored: Snapshot | null = null;
    let storage: FeedStoreResult["storage"] = bucket ? "ready" : "disabled";
    if (bucket) {
      try {
        const blob = await bounded(bucket.get(FEED_SNAPSHOT_KEY));
        if (blob) {
          if (blob.size !== undefined && blob.size > MAX_BYTES) throw new Error("Snapshot too large");
          const text = await bounded(blob.text());
          if (new TextEncoder().encode(text).byteLength > MAX_BYTES) throw new Error("Snapshot too large");
          const raw = object(JSON.parse(text)), storedAt = timestamp(raw.storedAt);
          if (raw.version !== 1 || storedAt === null || storedAt > at + 60_000 || !validFeed(raw.feed, at) || raw.feed.cached || raw.feed.error !== null) throw new Error("Invalid stored feed");
          stored = { version: 1, storedAt: String(raw.storedAt), feed: raw.feed };
          if (!lastGood || Date.parse(lastGood.feed.fetchedAt) < Date.parse(stored.feed.fetchedAt)) lastGood = stored;
          if (fresh(stored, at)) {
            // KV reads in another PoP can lag a successful write by 60 seconds
            // or more. Do not move this isolate back to an older cached value.
            const newer = lastGood && Date.parse(lastGood.feed.fetchedAt) > Date.parse(stored.feed.fetchedAt) ? lastGood : null;
            const value = newer ?? stored;
            return { feed: { ...value.feed, cached: true, error: null }, cache: newer ? "memory" : bucket.kind ?? "r2", storedAt: value.storedAt, storage };
          }
        }
      } catch { storage = "unavailable"; }
    }

    // A recently cached KV miss may outlive our successful put. Reusing that
    // verified write in this isolate avoids another same-key write inside KV's
    // one-write-per-second limit. This is a memory hit, never a KV readback.
    if (bucket?.kind === "kv" && (bucket.cacheIdentity ?? bucket) === lastKvWriteBinding && lastGood && lastKvWriteAt === lastGood.storedAt && fresh(lastGood, at)) {
      return { feed: { ...lastGood.feed, cached: true, error: null }, cache: "memory", storedAt: lastGood.storedAt, storage };
    }

    let loaded: Feed;
    try {
      const result = await options.load();
      if (!validFeed(result, now().getTime())) throw new Error("Invalid upstream feed");
      loaded = result;
    } catch {
      loaded = { ...options.fallback, cached: true, error: "일정을 갱신하지 못해 마지막 확인 자료를 표시합니다." };
    }
    const completedAt = now();
    const success = !loaded.cached && loaded.error === null && completedAt.getTime() - Date.parse(loaded.fetchedAt) < MAX_AGE;
    if (success) {
      const snapshot: Snapshot = { version: 1, storedAt: completedAt.toISOString(), feed: loaded };
      // An older in-flight request cannot roll back this isolate's last-good feed.
      if (!lastGood || Date.parse(lastGood.feed.fetchedAt) <= Date.parse(loaded.fetchedAt)) lastGood = snapshot;
      if (bucket) {
        try {
          const text = JSON.stringify(snapshot);
          if (new TextEncoder().encode(text).byteLength > MAX_BYTES) throw new Error("Snapshot too large");
          await bounded(bucket.put(FEED_SNAPSHOT_KEY, text, { httpMetadata: { contentType: "application/json; charset=utf-8", cacheControl: "no-store" } }));
          if (bucket.kind === "kv") { lastKvWriteAt = snapshot.storedAt; lastKvWriteBinding = bucket.cacheIdentity ?? bucket; }
        } catch { storage = "unavailable"; }
      }
      return { feed: loaded, cache: bucket ? "fresh" : "memory", storedAt: snapshot.storedAt, storage };
    }

    const candidates = [stored, lastGood].filter((value): value is Snapshot => value !== null);
    const previous = candidates.sort((a, b) => Date.parse(b.feed.fetchedAt) - Date.parse(a.feed.fetchedAt))[0];
    const usePrevious = previous && Date.parse(previous.feed.fetchedAt) >= Date.parse(loaded.fetchedAt);
    const feed = usePrevious ? previous.feed : loaded;
    return {
      feed: { ...feed, cached: true, error: loaded.error || "일정을 갱신하지 못해 마지막 확인 자료를 표시합니다." },
      cache: usePrevious ? "stale" : "memory", storedAt: usePrevious ? previous.storedAt : null, storage,
    };
  };
}
