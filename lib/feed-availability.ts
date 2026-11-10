import type { City, EventTime, GoEvent, Pokemon, RaidBoss } from "./pokedoko-types";
import { eventWindow } from "./raid-time";

type ScheduledBoss = RaidBoss & { start?: EventTime; end?: EventTime };
export type BossAvailability = "current" | "upcoming" | "expired" | "unknown";

/** A list publication alone never establishes a current spawn window. */
export function bossWindow(boss: ScheduledBoss, city: City) {
  if (!boss.start || !boss.end) return null;
  return eventWindow({ start: boss.start, end: boss.end } as GoEvent, city);
}
export function classifyBoss(boss: ScheduledBoss, city: City, now: Date): BossAvailability {
  const window = bossWindow(boss, city);
  if (!window || !Number.isFinite(now.getTime())) return "unknown";
  if (now < window.start) return "upcoming";
  return now < window.end ? "current" : "expired";
}
export function pokemonIdentity(pokemon: Pokemon): string {
  const form = (pokemon.form || pokemon.name).normalize("NFKC").trim().toLowerCase();
  return `${pokemon.id ?? "unknown"}:${form}`;
}
/** Retain only explicitly dated Raid Hour/Day events still valid in at least one city. */
export function availableRaidEvents(events: GoEvent[], cities: City[], now: Date): GoEvent[] {
  if (!Number.isFinite(now.getTime())) return [];
  return events.filter((event) =>
    (event.kind === "raid-hour" || event.kind === "raid-day") &&
    cities.some((city) => {
      const window = eventWindow(event, city);
      return window && window.end > now;
    }),
  ).sort((a, b) => {
    const firstStart = (event: GoEvent) => Math.min(...cities.flatMap((city) => {
      const window = eventWindow(event, city);
      return window && window.end > now ? [window.start.getTime()] : [];
    }));
    return firstStart(a) - firstStart(b) || a.id.localeCompare(b.id);
  });
}
export function nextRaidEvent(events: GoEvent[], cities: City[], now: Date, selectedId = ""): GoEvent | undefined {
  const available = availableRaidEvents(events, cities, now);
  return available.find((event) => event.id === selectedId) ?? available[0];
}
