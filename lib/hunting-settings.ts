export type HuntingEditorSettings = {
  speedKmh: number;
  speedUnit: "kmh" | "mps";
  laps: number;
  mode: "original" | "loop" | "out-and-back";
  reverse: boolean;
  includeTimes: boolean;
  format: "trk" | "rte";
};
export type HuntingSettings = HuntingEditorSettings & {
  tab: "catalog" | "nearby" | "import";
  routeId: string;
  cityId: string;
  spot: string;
  radius: number;
  maxStops: number;
};
export const DEFAULT_HUNTING_SETTINGS: HuntingSettings = {
  speedKmh: 15, speedUnit: "kmh", laps: 1, mode: "original", reverse: false,
  includeTimes: false, format: "trk", tab: "catalog", routeId: "", cityId: "tokyo", spot: "center", radius: 3, maxStops: 100,
};
export function parseHuntingSettings(search: string, routeIds: readonly string[], cityIds: readonly string[]): HuntingSettings {
  const p = new URLSearchParams(search);
  const result = { ...DEFAULT_HUNTING_SETTINGS };
  if (["catalog", "nearby", "import"].includes(p.get("tab") ?? "")) result.tab = p.get("tab") as HuntingSettings["tab"];
  if (routeIds.includes(p.get("route") ?? "")) { result.routeId = p.get("route")!; result.tab = "catalog"; }
  if (cityIds.includes(p.get("city") ?? "")) result.cityId = p.get("city")!;
  const speed = Number(p.get("speed"));
  if (p.get("speed")?.trim() && Number.isFinite(speed) && speed >= .1 && speed <= 120) result.speedKmh = speed;
  if (p.get("unit") === "mps") result.speedUnit = "mps";
  const laps = Number(p.get("laps"));
  if (Number.isSafeInteger(laps) && laps >= 1 && laps <= 20) result.laps = laps;
  if (["original", "loop", "out-and-back"].includes(p.get("mode") ?? "")) result.mode = p.get("mode") as HuntingSettings["mode"];
  result.reverse = p.get("reverse") === "1";
  result.includeTimes = p.get("timed") === "1";
  if (p.get("format") === "rte") result.format = "rte";
  if (/^\d{1,2}$/.test(p.get("spot") ?? "")) result.spot = p.get("spot")!;
  const radius = Number(p.get("radius")), maxStops = Number(p.get("stops"));
  if ([1, 3, 5, 10].includes(radius)) result.radius = radius;
  if ([20, 50, 100, 200].includes(maxStops)) result.maxStops = maxStops;
  return result;
}
export function huntingSettingsUrl(href: string, state: HuntingSettings, preserveCampaign = false): URL {
  const current = new URL(href), next = new URL("/gpx", current.origin);
  next.searchParams.set("tab", state.tab);
  if (state.tab === "catalog" && state.routeId) next.searchParams.set("route", state.routeId);
  if (state.cityId) next.searchParams.set("city", state.cityId);
  next.searchParams.set("speed", String(state.speedKmh));
  if (state.speedUnit === "mps") next.searchParams.set("unit", "mps");
  if (state.laps !== 1) next.searchParams.set("laps", String(state.laps));
  if (state.mode !== "original") next.searchParams.set("mode", state.mode);
  if (state.reverse) next.searchParams.set("reverse", "1");
  if (state.includeTimes) next.searchParams.set("timed", "1");
  if (state.format === "rte") next.searchParams.set("format", "rte");
  if (state.tab === "nearby") {
    if (state.spot !== "center") next.searchParams.set("spot", state.spot);
    next.searchParams.set("radius", String(state.radius));
    next.searchParams.set("stops", String(state.maxStops));
  }
  const campaign = current.searchParams.get("from");
  if (preserveCampaign && campaign && ["direct", "dc", "inven", "naver", "kakao", "discord", "youtube", "instagram", "other"].includes(campaign)) next.searchParams.set("from", campaign);
  return next;
}
