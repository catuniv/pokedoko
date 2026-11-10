import type { LiveRaid } from "./live-raid-types";

export const MIN_RAID_REMAINING_MS = 5 * 60_000;

/** Include the exact five-minute boundary; recalculate as the live clock ticks. */
export function hasMinimumRaidTime(
  raid: Pick<LiveRaid, "endsAt">,
  now: Date,
): boolean {
  return Date.parse(raid.endsAt) - now.getTime() >= MIN_RAID_REMAINING_MS;
}
