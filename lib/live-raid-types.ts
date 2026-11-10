/** Public, credential-free response from /api/raids/live. */
export type LiveRaidStatus =
  | "unconfigured"
  | "ready"
  | "empty"
  | "stale"
  | "error";
export type LiveRaid = {
  id: string;
  gymName: string;
  cityId: string;
  lat: number;
  lon: number;
  bossName: string | null;
  startsAt: string;
  endsAt: string;
  observedAt: string;
  sourceUrl: string | null;
  status: "active" | "upcoming";
  expiresAt: string;
  /** Source response time is not the gym's last observation time. */
  timeBasis?: "observed" | "source-response";
  sourceName?: string;
  pokemonId?: number | null;
  formId?: number | null;
  tier?: number | null;
};
export type LiveRaidSource = {
  id: string;
  cityId: string;
  name: string;
  url: string;
  status: "ready" | "empty" | "stale" | "error";
  fetchedAt: string | null;
  checkedAt: string;
  count: number;
  message: string;
};
export type LiveRaidFeed = {
  status: LiveRaidStatus;
  raids: LiveRaid[];
  fetchedAt: string | null;
  checkedAt: string;
  sourceName: string | null;
  message: string;
  discarded: { invalid: number; stale: number; ended: number };
  sources?: LiveRaidSource[];
};
