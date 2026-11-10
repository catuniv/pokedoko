import type { LiveRaidFeed } from "./live-raid-types";

export const LIVE_RAID_REQUEST_TIMEOUT_MS = 30_000;
export const LIVE_RAID_RETRY_DELAYS_MS = [2_000, 5_000] as const;

/** Keep published clocks unchanged; each raid still expires in the display pipeline. */
export function retainLastGoodRaidFeed(previous: LiveRaidFeed | null, failure: LiveRaidFeed, now = new Date()): LiveRaidFeed {
  if (previous && (previous.status === "ready" || previous.status === "empty") && previous.fetchedAt) {
    const age = now.getTime() - Date.parse(previous.fetchedAt);
    if (Number.isFinite(age) && age >= -60_000 && age < 600_000) return previous;
  }
  return failure;
}
