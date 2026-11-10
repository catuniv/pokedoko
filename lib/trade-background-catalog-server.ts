import { getFeedStorageBinding, type FeedStorageEnv } from "./feed-storage-bindings";
import type { FeedBucket } from "./feed-store";
import { BACKGROUND_CATALOG_MAX_BYTES, BACKGROUND_CATALOG_PAGE, BACKGROUND_CATALOG_SOURCE, fallbackTradeBackgroundCatalog, mergeTradeBackgroundPresets, parseBackgroundCatalogSource, readTradeBackgroundCatalog, type TradeBackgroundCatalog } from "./trade-background-catalog";

export const BACKGROUND_CATALOG_SNAPSHOT_KEY = "pokedoko/trades/background-catalog-v1.json";
export const BACKGROUND_CATALOG_REFRESH_MS = 6 * 60 * 60 * 1000;
const sourceError = "배경 목록을 갱신하지 못해 마지막 확인 목록을 표시해요.";
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

async function bounded<T>(work: Promise<T>, duration = 1500): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([work, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Background storage timed out")), duration); })]); }
  finally { if (timer !== undefined) clearTimeout(timer); }
}

export async function loadTradeBackgroundCatalog(options: { fetcher?: typeof fetch; now?: () => Date; timeoutMs?: number } = {}): Promise<TradeBackgroundCatalog> {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 5000);
  const now = options.now ?? (() => new Date());
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await (options.fetcher ?? fetch)(BACKGROUND_CATALOG_SOURCE, { signal: controller.signal, redirect: "manual", headers: { Accept: "application/json" }, cache: "no-store" });
    if (!response.ok || response.status >= 300 || !response.body) throw new Error("Public background source unavailable");
    const length = response.headers.get("Content-Length");
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > BACKGROUND_CATALOG_MAX_BYTES)) throw new Error("Background source too large");
    reader = response.body.getReader(); let bytes = 0; const parts: Uint8Array[] = [];
    while (true) {
      const part = await reader.read(); if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > BACKGROUND_CATALOG_MAX_BYTES) throw new Error("Background source too large");
      parts.push(part.value);
    }
    const data = new Uint8Array(bytes); let offset = 0;
    for (const part of parts) { data.set(part, offset); offset += part.byteLength; }
    const parsed = parseBackgroundCatalogSource(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(data)), now());
    return { presets: mergeTradeBackgroundPresets(parsed.presets), fetchedAt: now().toISOString(), sourceUpdatedAt: parsed.sourceUpdatedAt, source: BACKGROUND_CATALOG_PAGE, stale: false };
  } finally { clearTimeout(timer); controller.abort(); if (reader) void reader.cancel().catch(() => undefined); }
}

/** Fixed-key, read-through public cache. Failed sources never replace last-good data. */
export function createTradeBackgroundCatalogStore(options: { load?: () => Promise<TradeBackgroundCatalog>; now?: () => Date; requestTimeoutMs?: number } = {}) {
  const now = options.now ?? (() => new Date()), load = options.load ?? (() => loadTradeBackgroundCatalog({ now }));
  let lastGood: TradeBackgroundCatalog | null = null;
  let generation = 0;
  let pending: { generation: number; startedAt: number; promise: Promise<TradeBackgroundCatalog> } | null = null;
  let lastWrittenAt: string | null = null, lastWrittenBinding: object | null = null;
  let writing: { identity: object; at: string | null; promise: Promise<boolean> } | null = null;
  const fresh = (catalog: TradeBackgroundCatalog) => catalog.fetchedAt !== null && now().getTime() - Date.parse(catalog.fetchedAt) < BACKGROUND_CATALOG_REFRESH_MS;
  return async (binding?: FeedBucket | null, force = false): Promise<TradeBackgroundCatalog> => {
    let storage: TradeBackgroundCatalog["storage"] = binding ? "ready" : "disabled";
    if (binding) {
      try {
        const blob = await bounded(binding.get(BACKGROUND_CATALOG_SNAPSHOT_KEY));
        if (blob) {
          if (blob.size !== undefined && blob.size > BACKGROUND_CATALOG_MAX_BYTES) throw new Error("Stored catalog too large");
          const text = await bounded(blob.text());
          if (new TextEncoder().encode(text).byteLength > BACKGROUND_CATALOG_MAX_BYTES) throw new Error("Stored catalog too large");
          const raw: unknown = JSON.parse(text);
          const stored = object(raw) && raw.version === 1 ? readTradeBackgroundCatalog(raw.catalog, now()) : null;
          if (!stored || stored.stale || stored.error || !stored.fetchedAt) throw new Error("Invalid stored catalog");
          if (!lastGood || !lastGood.fetchedAt || stored.fetchedAt > lastGood.fetchedAt) lastGood = stored;
        }
      } catch { storage = "unavailable"; /* A storage outage still permits the fixed public source request. */ }
    }
    if (!force && lastGood && fresh(lastGood)) return { ...lastGood, presets: mergeTradeBackgroundPresets(lastGood.presets), stale: false, storage };
    let attemptGeneration: number | undefined;
    try {
      // A cancelled Worker invocation can strand both its fetch and timers. Later
      // requests replace a flight by wall-clock lease instead of inheriting it forever.
      if (!pending || now().getTime() - pending.startedAt >= 9000) {
        const flightGeneration = ++generation;
        pending = { generation: flightGeneration, startedAt: now().getTime(), promise: Promise.resolve().then(load) };
      }
      const flight = pending; attemptGeneration = flight.generation;
      let value: TradeBackgroundCatalog;
      try { value = await bounded(flight.promise, Math.min(7000, Math.max(1, options.requestTimeoutMs ?? 7000))); }
      finally { if (pending === flight) pending = null; }
      // A late completion from a replaced invocation cannot overwrite the new snapshot.
      if (flight.generation !== generation) return lastGood
        ? { ...lastGood, presets: mergeTradeBackgroundPresets(lastGood.presets), stale: !fresh(lastGood), storage }
        : { ...fallbackTradeBackgroundCatalog(), storage };
      const loaded = readTradeBackgroundCatalog(value, now());
      if (!loaded || loaded.stale || loaded.error || !loaded.fetchedAt) throw new Error("Invalid refreshed catalog");
      if (!lastGood || !lastGood.fetchedAt || loaded.fetchedAt >= lastGood.fetchedAt) lastGood = loaded;
      const current = { ...lastGood, presets: mergeTradeBackgroundPresets(lastGood.presets), stale: false };
      if (binding && (lastWrittenBinding !== (binding.cacheIdentity ?? binding) || lastWrittenAt !== current.fetchedAt)) {
        const identity = binding.cacheIdentity ?? binding;
        if (!writing || writing.identity !== identity || writing.at !== current.fetchedAt) {
          writing = { identity, at: current.fetchedAt, promise: bounded(binding.put(BACKGROUND_CATALOG_SNAPSHOT_KEY, JSON.stringify({ version: 1, catalog: current }), { httpMetadata: { contentType: "application/json; charset=utf-8", cacheControl: "no-store" } }))
            .then(() => true, () => false) };
        }
        const attempt = writing;
        if (await attempt.promise) { lastWrittenAt = current.fetchedAt; lastWrittenBinding = identity; storage = "ready"; }
        else storage = "unavailable";
        if (writing === attempt) writing = null;
      }
      return { ...current, storage };
    } catch {
      if (attemptGeneration !== undefined && attemptGeneration !== generation && lastGood) return { ...lastGood, presets: mergeTradeBackgroundPresets(lastGood.presets), stale: !fresh(lastGood), storage };
      return lastGood ? { ...lastGood, presets: mergeTradeBackgroundPresets(lastGood.presets), stale: true, error: sourceError, storage } : { ...fallbackTradeBackgroundCatalog(), storage };
    }
  };
}

const sharedCatalog = createTradeBackgroundCatalogStore();
export function getTradeBackgroundCatalog(env: FeedStorageEnv, options: { force?: boolean } = {}) {
  return sharedCatalog(getFeedStorageBinding(env), options.force ?? false);
}
