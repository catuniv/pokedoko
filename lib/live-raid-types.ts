/** Public, credential-free response from /api/raids/live. */
export type LiveRaidStatus = 'unconfigured' | 'ready' | 'empty' | 'stale' | 'error';
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
  status: 'active' | 'upcoming';
  expiresAt: string;
};
export type LiveRaidFeed = {
  status: LiveRaidStatus;
  raids: LiveRaid[];
  fetchedAt: string | null;
  checkedAt: string;
  sourceName: string | null;
  message: string;
  discarded: { invalid: number; stale: number; ended: number };
};
