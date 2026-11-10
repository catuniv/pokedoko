import { collectPublicRaidMaps } from "./raid-map-sources";
import { collectNearbyRaids } from "./nearby-raid-source";
import { mergeRaidCollections } from "./raid-merge";
import { CITIES } from "./cities";
import type { CollectedRaidMaps } from "./raid-map-sources";

type Options = {
  regionalCollector?: () => Promise<CollectedRaidMaps>;
  nearbyCollector?: () => Promise<CollectedRaidMaps>;
  now?: () => Date;
  deadlineMs?: number;
};
const regional = [
  ["new-york", "NYCPokeMap", "https://www.nycpokemap.com/gym.html"],
  ["sydney", "SydneyPogoMap", "https://www.sydneypogomap.com/gym.html"],
  ["singapore", "SGPokeMap", "https://sgpokemap.com/gym.html"],
  ["london", "LondonPogoMap", "https://londonpogomap.com/gym.html"],
  ["vancouver", "VanPokeMap", "https://vanpokemap.com/gym.html"],
];

/** Every HTTP invocation gets its own deadline, including when awaiting shared work. */
export function createWorldRaidCollector(options: Options = {}) {
  const now = options.now ?? (() => new Date());
  const deadline = Math.min(11000, Math.max(1, options.deadlineMs ?? 11000));
  const failure = (nearby: boolean): CollectedRaidMaps => {
    const checkedAt = now().toISOString();
    const sources = nearby
      ? CITIES.map((city) => ({ id: `iflowgo-${city.id}`, cityId: city.id, name: `PoGo Radar · ${city.name}`, url: "https://pokecoords.iflowgo.com/", coverage: { lat: city.lat, lon: city.lon, radiusKm: 15, limit: 800, limited: false } }))
      : regional.map(([id, name, url]) => ({ id, cityId: id, name, url }));
    return {
      feed: { sourceName: "공개 레이드 지도", fetchedAt: checkedAt, raids: [] },
      sources: sources.map((source) => ({ ...source, status: "error" as const, fetchedAt: null, checkedAt, count: 0, message: "공급원 응답이 지연됐습니다. 다른 지역 자료는 계속 표시합니다." })),
    };
  };
  const bounded = async (collect: () => Promise<CollectedRaidMaps>, nearby: boolean) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        Promise.resolve().then(collect),
        new Promise<CollectedRaidMaps>((resolve) => { timer = setTimeout(() => resolve(failure(nearby)), deadline); }),
      ]);
    } catch { return failure(nearby); }
    finally { if (timer) clearTimeout(timer); }
  };
  return async () => {
    // Do not abort a shared collector when only this caller's deadline expires.
    const settled = await Promise.allSettled([
      bounded(options.regionalCollector ?? collectPublicRaidMaps, false),
      bounded(options.nearbyCollector ?? collectNearbyRaids, true),
    ]);
    return mergeRaidCollections(settled.map((value, i) => value.status === "fulfilled" ? value.value : failure(i === 1)), now());
  };
}

export const collectWorldRaidMaps = createWorldRaidCollector();
