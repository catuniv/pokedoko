import { findRaidHotspots, findRecommendedRaidHotspots, type CommunityRaidSpot, type RaidHotspot } from "./raid-hotspots";
import type { LiveRaid } from "./live-raid-types";

type Request = { requestId: number; raids: LiveRaid[]; radiusKm: number; mode: "density" | "community"; recommendations: CommunityRaidSpot[] };
const context = self as unknown as {
  onmessage: (event: MessageEvent<Request>) => void;
  postMessage: (value: { requestId: number; spots: RaidHotspot[]; error?: boolean }) => void;
};
context.onmessage = ({ data }) => {
  try {
    const spots = data.mode === "community"
      ? findRecommendedRaidHotspots(data.raids, data.radiusKm, data.recommendations)
      : findRaidHotspots(data.raids, data.radiusKm);
    context.postMessage({ requestId: data.requestId, spots });
  } catch {
    context.postMessage({ requestId: data.requestId, spots: [], error: true });
  }
};
