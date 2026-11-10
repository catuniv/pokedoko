import type { RegionalEvent, RegionalEventStatus, RegionalText } from "./regional-event-types";

type Language = keyof RegionalText;
const locales: Record<Language, string> = { ko: "ko-KR", en: "en-US", "zh-CN": "zh-CN", ja: "ja-JP" };
export function regionalText(text: RegionalText, language: Language): string { return text[language] || text.en; }

function localDate(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (key: string) => parts.find(part => part.type === key)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Period status in the venue's timezone; it does not assert live raid availability. */
export function regionalEventStatus(event: RegionalEvent, now = new Date()): RegionalEventStatus {
  if (event.schedule.startInstant && now.getTime() < Date.parse(event.schedule.startInstant)) return "upcoming";
  const today = localDate(now, event.schedule.timeZone);
  if (today < event.schedule.startDate) return "upcoming";
  if (event.schedule.endDate && today > event.schedule.endDate) return "ended";
  return "ongoing";
}

export function formatRegionalDates(event: RegionalEvent, language: Language): string {
  const format = (value: string) => new Intl.DateTimeFormat(locales[language], { timeZone: "UTC", year: "numeric", month: "short", day: "numeric" }).format(new Date(`${value}T12:00:00Z`));
  const start = format(event.schedule.startDate), end = event.schedule.endDate;
  if (end === null) return ({ ko: `${start}부터 · 종료일 미정`, en: `From ${start} · no announced end`, "zh-CN": `${start}起 · 结束日期未公布`, ja: `${start}から・終了日未発表` })[language];
  return end === event.schedule.startDate ? start : `${start} – ${format(end)}`;
}

const dateOnly = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const https = (value: string) => { try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; } catch { return false; } };
const text = (value: RegionalText) => ["ko", "en", "zh-CN", "ja"].every(key => typeof value?.[key as Language] === "string" && !!value[key as Language].trim());

export function validateRegionalEvents(events: readonly RegionalEvent[]): string[] {
  const errors: string[] = [], ids = new Set<string>();
  for (const event of events) {
    const fail = (reason: string) => errors.push(`${event.id}: ${reason}`);
    if (!event.id || ids.has(event.id)) fail("duplicate or missing id"); ids.add(event.id);
    if (!text(event.title) || !/^[A-Z]{2}$/.test(event.countryCode) || !event.city.trim()) fail("missing locale or region");
    if (!dateOnly(event.schedule.startDate) || event.schedule.endDate !== null && (!dateOnly(event.schedule.endDate) || event.schedule.endDate < event.schedule.startDate)) fail("invalid date period");
    if (event.schedule.startInstant && (!/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(event.schedule.startInstant) || !Number.isFinite(Date.parse(event.schedule.startInstant)))) fail("invalid release instant");
    try { localDate(new Date(), event.schedule.timeZone); } catch { fail("invalid timezone"); }
    const point = event.location;
    if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude) || Math.abs(point.latitude) > 90 || Math.abs(point.longitude) > 180 || point.latitude === 0 && point.longitude === 0 || !https(point.coordinateSourceUrl)) fail("unverified or invalid public coordinates");
    if (!event.sources.length || event.sources.some(source => !https(source))) fail("missing sources");
    if (!event.rewards.length) fail("missing rewards");
    for (const reward of event.rewards) {
      if (!Number.isSafeInteger(reward.speciesId) || reward.speciesId < 1 || !reward.name.trim() || !text(reward.method) || reward.costume && !text(reward.costume)) fail("invalid reward");
      for (const image of [reward.spriteUrl, reward.background?.imageUrl]) if (image && !image.startsWith("/regional-assets/") && !image.startsWith("/trade-backgrounds/") && !https(image)) fail("invalid image source");
    }
  }
  return errors;
}
