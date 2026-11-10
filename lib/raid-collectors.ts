import { collectPublicRaidMaps } from "./raid-map-sources";
import { collectNearbyRaids } from "./nearby-raid-source";
import { mergeRaidCollections } from "./raid-merge";

export async function collectWorldRaidMaps() {
  return mergeRaidCollections(await Promise.all([collectPublicRaidMaps(), collectNearbyRaids()]));
}
