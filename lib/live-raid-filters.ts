import type { LiveRaid } from "./live-raid-types";

export type RaidKind = "all" | "normal" | "legendary" | "mega" | "shadow" | "elite" | "other";
export type RaidFilters = { bossKey: string; kind: RaidKind; tier: string };
export const RAID_KIND_OPTIONS: { key: RaidKind; label: string }[] = [
  { key: "all", label: "전체" }, { key: "normal", label: "일반" },
  { key: "legendary", label: "전설 5성" }, { key: "mega", label: "메가" },
  { key: "shadow", label: "그림자" }, { key: "elite", label: "엘리트" },
  { key: "other", label: "기타" },
];
const TIER_LABELS: Record<number, string> = {
  1: "1성", 2: "2성", 3: "3성", 4: "4성", 5: "5성",
  6: "메가", 7: "메가 전설", 9: "엘리트",
  11: "그림자 1성", 12: "그림자 2성", 13: "그림자 3성",
  14: "그림자 4성", 15: "그림자 5성",
};
export const resetRaidFilters = (): RaidFilters => ({ bossKey: "all", kind: "all", tier: "all" });
export function raidTierKey(raid: Pick<LiveRaid, "tier">): string {
  return Number.isInteger(raid.tier) && Number(raid.tier) > 0 ? String(raid.tier) : "unknown";
}
export function raidTierLabel(key: string): string {
  return key === "unknown" ? "등급 미공개" : TIER_LABELS[Number(key)] ?? `등급 ${key}`;
}
export function raidKind(raid: Pick<LiveRaid, "tier" | "bossName">): Exclude<RaidKind, "all"> {
  const name = raid.bossName?.trim() ?? "";
  if ([11, 12, 13, 14, 15].includes(raid.tier ?? 0) || /^(?:그림자\s*|Shadow(?:\s|$))/iu.test(name)) return "shadow";
  if ([6, 7].includes(raid.tier ?? 0) || /^(?:메가\s*|Mega(?:\s|$))/iu.test(name)) return "mega";
  if (raid.tier === 5) return "legendary";
  if (raid.tier === 9) return "elite";
  if ([1, 2, 3, 4].includes(raid.tier ?? 0)) return "normal";
  return "other";
}
export function raidBossLabel(raid: Pick<LiveRaid, "bossName" | "pokemonId">): string {
  return raid.bossName?.trim().replace(/\s+/g, " ") || (raid.pokemonId ? `도감 No. ${raid.pokemonId}` : "알 · 보스 미공개");
}
/** Keep forms and shadow/mega prefixes distinct, including sources without form IDs. */
export function raidBossKey(raid: Pick<LiveRaid, "bossName" | "pokemonId" | "formId" | "tier">): string {
  if (!raid.bossName?.trim() && !raid.pokemonId) return "unrevealed";
  const label = raidBossLabel(raid).normalize("NFKC").toLowerCase();
  const kind = raidKind(raid);
  const variant = kind === "shadow" || kind === "mega" ? kind : "base";
  return `${raid.pokemonId ?? "name"}:${raid.formId ?? "unknown"}:${variant}:${label}`;
}
export function buildRaidBossOptions(raids: readonly LiveRaid[]): { key: string; label: string; count: number }[] {
  const options = new Map<string, { key: string; label: string; count: number; raid: LiveRaid }>();
  for (const raid of raids) {
    const key = raidBossKey(raid), existing = options.get(key);
    if (existing) existing.count++;
    else options.set(key, { key, label: raidBossLabel(raid), count: 1, raid });
  }
  const values = [...options.values()];
  return values.map(({ raid, key, label, count }) => {
    const duplicates = values.filter((entry) => entry.label === label);
    if (duplicates.length > 1) {
      const variant = raidKind(raid);
      if (variant === "mega" || variant === "shadow")
        label = `${variant === "mega" ? "메가" : "그림자"} · ${label}`;
      if (raid.formId == null) label += " (폼 미확인)";
      else if (duplicates.filter((entry) => entry.raid.formId != null && raidKind(entry.raid) === variant).length > 1)
        label += ` (폼 ${raid.formId})`;
      if (new Set(duplicates.map((entry) => entry.raid.pokemonId)).size > 1)
        label += ` · No. ${raid.pokemonId ?? "미확인"}`;
    }
    return { key, label, count };
  }).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "ko") || a.key.localeCompare(b.key));
}
export function matchesRaidFilters(raid: LiveRaid, filters: RaidFilters): boolean {
  return (filters.bossKey === "all" || raidBossKey(raid) === filters.bossKey)
    && (filters.kind === "all" || raidKind(raid) === filters.kind)
    && (filters.tier === "all" || raidTierKey(raid) === filters.tier);
}
/** A broader type/grade change clears narrower choices instead of leaving hidden selections. */
export function changeRaidFilters(current: RaidFilters, change: { bossKey: string } | { kind: RaidKind } | { tier: string }): RaidFilters {
  if ("kind" in change) return { bossKey: "all", kind: change.kind, tier: "all" };
  if ("tier" in change) return { ...current, bossKey: "all", tier: change.tier };
  return { ...current, bossKey: change.bossKey };
}
