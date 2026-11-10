import type { FeedBucket } from "./feed-store";

/** Only the text operations needed by the fixed public schedule cache. */
export type FeedKVNamespace = {
  get(key: string, options: { type: "text"; cacheTtl: number }): Promise<string | null>;
  put(key: string, value: string): Promise<unknown>;
};
export type FeedStorageEnv = { BUCKET?: FeedBucket; SCHEDULE_CACHE?: FeedKVNamespace };

/**
 * Sites uses R2; standalone Workers can use a free KV namespace instead.
 * KV is eventually consistent: reads (including missing keys) can remain cached
 * for 60 seconds or longer at other locations. Snapshot timestamps are never
 * replaced with the time of a KV read, and values deliberately have no expiry
 * so the last successful schedule survives a source outage.
 */
export function getFeedStorageBinding(env: FeedStorageEnv): FeedBucket | null {
  if (env.BUCKET) {
    const bucket = env.BUCKET;
    return {
      kind: "r2",
      cacheIdentity: bucket,
      get: key => bucket.get(key),
      put: (key, value, options) => bucket.put(key, value, options),
    };
  }
  if (env.SCHEDULE_CACHE) {
    const namespace = env.SCHEDULE_CACHE;
    return {
      kind: "kv",
      cacheIdentity: namespace,
      async get(key) {
        const text = await namespace.get(key, { type: "text", cacheTtl: 60 });
        return text === null ? null : { size: new TextEncoder().encode(text).byteLength, text: async () => text };
      },
      // Preserve the complete envelope. R2 HTTP metadata has no KV equivalent.
      put: (key, value) => namespace.put(key, value),
    };
  }
  return null;
}
