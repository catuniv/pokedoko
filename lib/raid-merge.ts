import type { CollectedRaidMaps } from "./raid-map-sources";

type Row = Record<string, unknown>;
const row = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};

/** Keep one occurrence per gym/start, without borrowing a fresher source timestamp. */
export function mergeRaidCollections(collections: readonly CollectedRaidMaps[], now = new Date()): CollectedRaidMaps {
  const sources = collections.flatMap((value) => value.sources).map((source) => (source.status === "ready" || source.status === "empty") && source.fetchedAt && now.getTime() - Date.parse(source.fetchedAt) >= 600000 ? { ...source, status: "stale" as const, count: 0, message: "원문 응답 시각이 10분 이상 지났습니다." } : source);
  const healthy = sources.filter((source) => source.status === "ready" || source.status === "empty");
  const timestamps = healthy.flatMap((source) => source.fetchedAt && Number.isFinite(Date.parse(source.fetchedAt)) ? [Date.parse(source.fetchedAt)] : []);
  const raids = new Map<string, unknown>();
  for (const collection of collections) {
    for (const value of collection.feed.raids) {
      const next = row(value);
      if (typeof next.id !== "string") continue;
      const previous = raids.get(next.id);
      if (!previous) { raids.set(next.id, value); continue; }
      const old = row(previous);
      const oldFresh = typeof old.observedAt === "string" && Date.parse(old.observedAt) > now.getTime() - 600000;
      const nextFresh = typeof next.observedAt === "string" && Date.parse(next.observedAt) > now.getTime() - 600000;
      const oldBoss = typeof old.pokemonId === "number" && old.pokemonId > 0 || typeof old.bossName === "string" && !!old.bossName;
      const nextBoss = typeof next.pokemonId === "number" && next.pokemonId > 0 || typeof next.bossName === "string" && !!next.bossName;
      const sameBoss = old.pokemonId === next.pokemonId;
      const oldForm = typeof old.formId === "number" && old.formId > 0, nextForm = typeof next.formId === "number" && next.formId > 0;
      const newer = String(next.observedAt) > String(old.observedAt);
      if ((!oldFresh && nextFresh) || (oldFresh === nextFresh && (nextBoss && !oldBoss || nextBoss === oldBoss && (sameBoss ? nextForm && !oldForm || nextForm === oldForm && newer : newer))))
        raids.set(next.id, value);
    }
  }
  return {
    feed: {
      sourceName: "공개 지역 지도 · PoGo Radar",
      fetchedAt: new Date(timestamps.length ? Math.max(...timestamps) : now.getTime()).toISOString(),
      raids: [...raids.values()],
    },
    sources,
  };
}
