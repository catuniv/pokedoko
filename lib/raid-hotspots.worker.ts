import { findRaidHotspots, type RaidHotspot } from "./raid-hotspots";
import type { LiveRaid } from "./live-raid-types";

type Request = { requestId: number; raids: LiveRaid[]; radiusKm: number };
const context = self as unknown as {
  onmessage: (event: MessageEvent<Request>) => void;
  postMessage: (value: { requestId: number; spots: RaidHotspot[]; error?: boolean }) => void;
};
context.onmessage = ({ data }) => {
  try {
    context.postMessage({ requestId: data.requestId, spots: findRaidHotspots(data.raids, data.radiusKm) });
  } catch {
    context.postMessage({ requestId: data.requestId, spots: [], error: true });
  }
};
