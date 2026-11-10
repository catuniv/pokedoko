export type ShareView = "live" | "raids" | "calendar" | "pokemon";
export type ShareCenter = { id: string; cityId: string; lat: number; lon: number; gymName: string; radiusKm: number };
export type ShareState = {
  city?: string; event?: string;
  liveCity?: string; boss?: string; kind?: string; tier?: string; state?: string; q?: string;
  radius?: number; mode?: "density" | "community"; center?: ShareCenter | null;
  month?: string; day?: string; detail?: string; calendarKind?: string;
  tab?: string; search?: string; grade?: string; pokemon?: string;
  from?: string;
};
const VIEWS: ShareView[] = ["live", "raids", "calendar", "pokemon"];
const CAMPAIGNS = ["direct", "dc", "inven", "naver", "kakao", "discord", "youtube", "instagram", "other"];
const KINDS = ["all", "normal", "legendary", "mega", "shadow", "elite", "other"];
const CALENDAR_KINDS = ["all", "raid-hour", "raid-day", "community-day", "spotlight", "event"];
const TABS = ["all", "raid", "event", "upcoming", "unknown"];
const stringKeys = ["city", "event", "liveCity", "boss", "kind", "tier", "state", "q", "mode", "month", "day", "detail", "calendarKind", "tab", "search", "grade", "pokemon", "from"] as const;
const defaults: Partial<Record<typeof stringKeys[number] | "radius", string>> = {
  boss: "all", kind: "all", tier: "all", state: "active", mode: "density", radius: "3", calendarKind: "all", tab: "all", grade: "all",
};
function text(value: string | null, max: number): string | undefined {
  if (!value || value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) return undefined;
  return value;
}
export function validShareDay(value: string | null): string | undefined {
  if (!value || !/^20\d{2}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : undefined;
}
/** Query input is optional and untrusted; unknown values never become UI state. */
export function parseShareState(search: string, cityIds: readonly string[]): ShareState {
  const p = new URLSearchParams(search), state: ShareState = {};
  const city = (value: string | null) => value && cityIds.includes(value) ? value : undefined;
  const oneOf = (key: string, values: readonly string[]) => { const value = p.get(key); return value && values.includes(value) ? value : undefined; };
  state.city = city(p.get("city"));
  state.liveCity = p.get("liveCity") === "all" ? "all" : city(p.get("liveCity"));
  state.event = text(p.get("event"), 180);
  const boss = text(p.get("boss"), 240);
  if (boss && (boss === "all" || boss === "unrevealed" || /^(?:[1-9]\d*|name):(?:\d+|unknown):(?:base|mega|shadow):.{1,180}$/u.test(boss))) state.boss = boss;
  state.kind = oneOf("kind", KINDS);
  const tier = p.get("tier");
  if (tier && (tier === "all" || tier === "unknown" || /^(?:[1-9]|[1-9]\d)$/.test(tier))) state.tier = tier;
  state.state = oneOf("state", ["active", "upcoming", "all"]);
  state.q = text(p.get("q"), 100);
  const radius = Number(p.get("radius"));
  if ([1, 3, 5, 10].includes(radius)) state.radius = radius;
  state.mode = oneOf("mode", ["density", "community"]) as ShareState["mode"];
  state.month = /^20\d{2}-(?:0[1-9]|1[0-2])$/.test(p.get("month") ?? "") ? p.get("month")! : undefined;
  state.day = validShareDay(p.get("day"));
  state.detail = text(p.get("detail"), 180);
  state.calendarKind = oneOf("calendarKind", CALENDAR_KINDS);
  state.tab = oneOf("tab", TABS);
  state.search = text(p.get("search"), 100);
  state.grade = text(p.get("grade"), 60);
  state.pokemon = text(p.get("pokemon"), 220);
  state.from = oneOf("from", CAMPAIGNS);
  const centerCity = city(p.get("centerCity"));
  const latText = p.get("lat"), lonText = p.get("lon");
  const lat = Number(latText), lon = Number(lonText);
  if (centerCity && latText?.trim() && lonText?.trim() && Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
    state.center = { cityId: centerCity, lat, lon, radiusKm: state.radius ?? 3,
      id: text(p.get("centerId"), 220) ?? `shared:${centerCity}:${lat}:${lon}`,
      gymName: text(p.get("centerName"), 120) ?? "공유한 중심",
    };
  }
  return state;
}
/** Patch only the owned fields; preserve attribution and other mounted view state. */
export function patchShareState(url: URL, state: ShareState): URL {
  const next = new URL(url.href);
  for (const key of stringKeys) {
    if (!Object.prototype.hasOwnProperty.call(state, key)) continue;
    const value = state[key];
    if (value === undefined || value === "" || value === defaults[key]) next.searchParams.delete(key);
    else next.searchParams.set(key, String(value));
  }
  if (Object.prototype.hasOwnProperty.call(state, "radius")) {
    if (state.radius === undefined || state.radius === 3) next.searchParams.delete("radius");
    else next.searchParams.set("radius", String(state.radius));
  }
  if (Object.prototype.hasOwnProperty.call(state, "center")) {
    for (const key of ["centerCity", "lat", "lon", "centerId", "centerName"]) next.searchParams.delete(key);
    if (state.center) {
      next.searchParams.set("centerCity", state.center.cityId);
      next.searchParams.set("lat", String(state.center.lat));
      next.searchParams.set("lon", String(state.center.lon));
      next.searchParams.set("centerId", state.center.id);
      next.searchParams.set("centerName", state.center.gymName);
      if (state.center.radiusKm !== 3) next.searchParams.set("radius", String(state.center.radiusKm));
    }
  }
  return next;
}
/** Newly shared links omit campaign attribution, unrelated queries and fragments. */
export function buildShareUrl(href: string, view: ShareView, patch: ShareState, cityIds: readonly string[]): string {
  const current = new URL(href);
  const parsed = parseShareState(current.search, cityIds);
  const state = { ...parsed, ...patch, from: undefined };
  // Older city-guide links use only city; new all-city links must be explicit.
  if (view === "live" && state.liveCity === undefined) state.liveCity = parsed.city ?? "all";
  const allowed: (keyof ShareState)[] = view === "live"
    ? ["city", "liveCity", "boss", "kind", "tier", "state", "q", "radius", "mode", "center"]
    : view === "raids" ? ["city", "event"]
    : view === "calendar" ? ["city", "month", "day", "detail", "calendarKind"]
    : ["city", "tab", "search", "grade", "pokemon"];
  const own = Object.fromEntries(allowed.map((key) => [key, state[key]])) as ShareState;
  return patchShareState(new URL(`/${view}`, current.origin), own).href;
}
export function usageView(pathname: string, search = ""): ShareView | null {
  const path = pathname.replace(/\/$/, "").slice(1);
  if (VIEWS.includes(path as ShareView)) return path as ShareView;
  if (pathname === "/") {
    const legacy = new URLSearchParams(search).get("view");
    return VIEWS.includes(legacy as ShareView) ? legacy as ShareView : "live";
  }
  return null;
}
export function usageDetail(event: "coordinate_copy" | "share", pathname: string, search: string, cityIds: readonly string[], city?: string, resolvedView?: ShareView | "city" | "event" | null) {
  const view = resolvedView ?? usageView(pathname, search);
  if (!view) return null;
  const candidate = city ?? parseShareState(search, cityIds).city;
  return { event, view, ...(candidate && cityIds.includes(candidate) ? { city: candidate } : {}) };
}
