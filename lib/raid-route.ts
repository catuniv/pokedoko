import type { LiveRaid } from "./live-raid-types";

export type RaidRouteRegion = { cityId: string; lat: number; lon: number; gymName: string; radiusKm: number };
export type RaidRouteOptions = { speedKmH?: number; stopMinutes?: number; maxStops?: number; durationMinutes?: number };
export type RaidRouteSettings = Required<RaidRouteOptions>;
export type RaidRouteStop = {
  raid: LiveRaid; arrivalAt: string; beginAt: string; departureAt: string;
  legDistanceKm: number; cumulativeDistanceKm: number;
};
export type RaidRouteSkipped = {
  invalid: number; otherCity: number; outsideRadius: number; expired: number;
  endingSoon: number; unsupported: number; duplicate: number; unreachable: number;
  candidateLimit: number; notSelected: number;
};
export type RaidRoute = {
  generatedAt: string; validUntil: string | null; region: RaidRouteRegion; settings: RaidRouteSettings;
  stops: RaidRouteStop[]; totalDistanceKm: number; totalTravelMinutes: number;
  totalWaitMinutes: number; totalStopMinutes: number; totalDurationMinutes: number;
  endsAt: string | null; candidateCount: number; cappedCandidateCount: number;
  skipped: RaidRouteSkipped; skippedCount: number;
};

type Position = { lat: number; lon: number };
type Candidate = { raid: LiveRaid; start: number; end: number; expiry: number; originDistance: number };
type Visit = { index: number; arrival: number; begin: number; departure: number; distance: number; slack: number };
const MINUTE = 60_000;
const BUFFER = MINUTE;
const MAX_CANDIDATES = 500;
const RADIUS_EPSILON = 1e-9;
const textOrder = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const position = (value: Position) => value && Number.isFinite(value.lat) && Math.abs(value.lat) <= 90 && Number.isFinite(value.lon) && Math.abs(value.lon) <= 180;
const longitude = (value: number) => value === 180 ? -180 : value;
const gymKey = (value: Position) => `${value.lat.toFixed(6)},${longitude(value.lon).toFixed(6)}`;

function instant(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const plain = value.slice(0, 19), wall = new Date(`${plain}Z`), result = Date.parse(value);
  const offset = value.match(/([+-])(\d{2}):(\d{2})$/);
  if (offset && (+offset[2] > 14 || +offset[3] > 59 || (+offset[2] === 14 && +offset[3] !== 0))) return null;
  return Number.isFinite(result) && Number.isFinite(wall.getTime()) && wall.toISOString().slice(0, 19) === plain ? result : null;
}

function distance(a: Position, b: Position): number {
  const rad = Math.PI / 180;
  const h = Math.sin((b.lat - a.lat) * rad / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lon - a.lon) * rad / 2) ** 2;
  return 12_742.0176 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

function settings(options: RaidRouteOptions): RaidRouteSettings {
  const value = { speedKmH: options.speedKmH ?? 4.5, stopMinutes: options.stopMinutes ?? 5, maxStops: options.maxStops ?? 10, durationMinutes: options.durationMinutes ?? 60 };
  for (const [name, min, max] of [["speedKmH", 1, 30], ["stopMinutes", 1, 30], ["maxStops", 2, 30], ["durationMinutes", 15, 180]] as const) {
    if (!Number.isFinite(value[name]) || value[name] < min || value[name] > max || (name === "maxStops" && !Number.isInteger(value[name]))) throw new RangeError(`${name} must be between ${min} and ${max}`);
  }
  return value;
}

function validRegion(region: RaidRouteRegion): boolean {
  return position(region) && typeof region.cityId === "string" && region.cityId.length > 0 && region.cityId.length <= 100 && typeof region.gymName === "string" && region.gymName.length <= 240 && Number.isFinite(region.radiusKm) && region.radiusKm > 0;
}

function unsupported(raid: LiveRaid): boolean {
  const raw = raid as LiveRaid & { kind?: unknown; type?: unknown; battleType?: unknown };
  return [raw.kind, raw.type, raw.battleType].some(value => typeof value === "string" && /^(?:max(?:[-_ ]?battles?)?|dynamax|gigantamax)$/i.test(value))
    || /다이맥스|거다이맥스|맥스\s*배틀|dynamax|gigantamax|max[-_\s]*battle/i.test(raid.bossName ?? "");
}

function data(raid: LiveRaid, at: number): { start: number; end: number; expiry: number } | null {
  if (!raid || typeof raid.id !== "string" || !raid.id || raid.id.length > 240 || typeof raid.gymName !== "string" || !raid.gymName.trim() || raid.gymName.length > 240 || typeof raid.cityId !== "string" || !position(raid) || (raid.bossName !== null && typeof raid.bossName !== "string") || (raid.status !== "active" && raid.status !== "upcoming")) return null;
  const start = instant(raid.startsAt), end = instant(raid.endsAt), observed = instant(raid.observedAt), expires = instant(raid.expiresAt);
  const extra = (raid as LiveRaid & { validUntil?: unknown }).validUntil;
  const validUntil = extra === undefined ? Infinity : instant(extra);
  if (start === null || end === null || observed === null || expires === null || validUntil === null || start >= end || end - start > 86_400_000 || start > at + 7 * 86_400_000 || observed > at + MINUTE || (raid.tier != null && (!Number.isInteger(raid.tier) || raid.tier <= 0 || raid.tier >= 100)) || (raid.pokemonId != null && (!Number.isInteger(raid.pokemonId) || raid.pokemonId <= 0 || raid.pokemonId > 10000)) || (raid.formId != null && (!Number.isInteger(raid.formId) || raid.formId < 0))) return null;
  return { start, end, expiry: Math.min(expires, end, observed + 10 * MINUTE, validUntil) };
}

/** Straight-line, bounded greedy alternatives; this is not a road route or an optimal tour. */
export function buildRaidRoute(raids: readonly LiveRaid[], region: RaidRouteRegion, now: Date, options: RaidRouteOptions = {}): RaidRoute {
  if (!validRegion(region) || !Number.isFinite(now?.getTime())) throw new RangeError("A valid region and generation time are required");
  const at = now.getTime(), config = settings(options), deadline = at + config.durationMinutes * MINUTE;
  const skipped: RaidRouteSkipped = { invalid: 0, otherCity: 0, outsideRadius: 0, expired: 0, endingSoon: 0, unsupported: 0, duplicate: 0, unreachable: 0, candidateLimit: 0, notSelected: 0 };
  const raw: Candidate[] = [];
  for (const raid of raids) {
    const times = data(raid, at);
    if (!times) { skipped.invalid++; continue; }
    if (raid.cityId !== region.cityId) { skipped.otherCity++; continue; }
    if (unsupported(raid)) { skipped.unsupported++; continue; }
    const originDistance = distance(region, raid);
    if (originDistance > region.radiusKm + RADIUS_EPSILON) { skipped.outsideRadius++; continue; }
    if (times.expiry <= at || times.end <= at) { skipped.expired++; continue; }
    if (times.end - at < 5 * MINUTE) { skipped.endingSoon++; continue; }
    const arrival = at + Math.ceil(originDistance / config.speedKmH * 3_600_000);
    const departure = Math.max(arrival, times.start) + config.stopMinutes * MINUTE;
    if (departure > times.end - BUFFER || departure > deadline) { skipped.unreachable++; continue; }
    raw.push({ raid, ...times, originDistance });
  }
  raw.sort((a, b) => a.end - b.end || b.expiry - a.expiry || textOrder(a.raid.id, b.raid.id) || a.raid.lat - b.raid.lat || a.raid.lon - b.raid.lon || textOrder(a.raid.gymName, b.raid.gymName));
  const seenIds = new Set<string>(), seenGyms = new Set<string>();
  const unique = raw.filter(candidate => {
    const key = gymKey(candidate.raid), duplicate = seenIds.has(candidate.raid.id) || seenGyms.has(key);
    seenIds.add(candidate.raid.id); seenGyms.add(key);
    if (duplicate) skipped.duplicate++;
    return !duplicate;
  });
  const nearest = [...unique].sort((a, b) => a.originDistance - b.originDistance || a.end - b.end || textOrder(a.raid.id, b.raid.id));
  // Interleave near and urgent candidates rather than discarding all deadlines
  // outside the nearest 500 gyms. The cap is visible in the returned metadata.
  const chosen = new Set<Candidate>();
  for (let i = 0; chosen.size < Math.min(MAX_CANDIDATES, unique.length); i++) {
    if (nearest[i]) chosen.add(nearest[i]);
    if (chosen.size >= MAX_CANDIDATES) break;
    if (unique[i]) chosen.add(unique[i]);
  }
  const candidates = [...chosen].sort((a, b) => textOrder(a.raid.id, b.raid.id));
  skipped.candidateLimit = unique.length - candidates.length;
  const memo = new Map<number, number>();
  const leg = (from: number, to: number) => {
    if (from < 0) return candidates[to].originDistance;
    const key = Math.min(from, to) * candidates.length + Math.max(from, to);
    let value = memo.get(key);
    if (value === undefined) { value = distance(candidates[from].raid, candidates[to].raid); memo.set(key, value); }
    return value;
  };
  const visit = (index: number, from: number, time: number): Visit | null => {
    const candidate = candidates[index], km = leg(from, index);
    const arrival = time + Math.ceil(km / config.speedKmH * 3_600_000), begin = Math.max(arrival, candidate.start);
    const departure = begin + config.stopMinutes * MINUTE;
    return departure <= candidate.end - BUFFER && departure <= deadline ? { index, arrival, begin, departure, distance: km, slack: candidate.end - BUFFER - departure } : null;
  };
  const greedy = (seed: number | null, urgent: boolean) => {
    const visits: Visit[] = [], used = new Set<number>(); let time = at, from = -1;
    while (visits.length < config.maxStops) {
      let next: Visit | null = seed !== null && visits.length === 0 ? visit(seed, from, time) : null;
      if (!next) for (let i = 0; i < candidates.length; i++) {
        if (used.has(i)) continue;
        const option = visit(i, from, time); if (!option) continue;
        if (!next || (urgent && option.slack !== next.slack ? option.slack < next.slack : option.departure !== next.departure ? option.departure < next.departure : candidates[option.index].end !== candidates[next.index].end ? candidates[option.index].end < candidates[next.index].end : option.distance !== next.distance ? option.distance < next.distance : textOrder(candidates[option.index].raid.id, candidates[next.index].raid.id) < 0)) next = option;
      }
      if (!next) break;
      visits.push(next); used.add(next.index); time = next.departure; from = next.index;
    }
    return visits;
  };
  const nearestSeeds = candidates.map((_, index) => index).sort((a, b) => candidates[a].originDistance - candidates[b].originDistance || textOrder(candidates[a].raid.id, candidates[b].raid.id));
  const urgentSeeds = candidates.map((_, index) => index).sort((a, b) => candidates[a].end - candidates[b].end || textOrder(candidates[a].raid.id, candidates[b].raid.id));
  const seeds: (number | null)[] = [null];
  for (let i = 0; i < 3; i++) for (const index of [nearestSeeds[i], urgentSeeds[i]]) if (index !== undefined && !seeds.includes(index) && seeds.length < 6) seeds.push(index);
  let best: Visit[] = [];
  for (const seed of seeds) for (const urgent of [false, true]) {
    const plan = greedy(seed, urgent), end = plan.at(-1)?.departure ?? at, bestEnd = best.at(-1)?.departure ?? at;
    const km = plan.reduce((sum, value) => sum + value.distance, 0), bestKm = best.reduce((sum, value) => sum + value.distance, 0);
    const ids = plan.map(value => candidates[value.index].raid.id).join("\u0000"), bestIds = best.map(value => candidates[value.index].raid.id).join("\u0000");
    if (plan.length > best.length || (plan.length === best.length && (end < bestEnd || (end === bestEnd && (km < bestKm || (km === bestKm && textOrder(ids, bestIds) < 0)))))) best = plan;
  }
  let cumulative = 0, travelMs = 0, waitMs = 0, previous = at;
  const stops = best.map(value => {
    cumulative += value.distance; travelMs += value.arrival - previous; waitMs += value.begin - value.arrival; previous = value.departure;
    return { raid: { ...candidates[value.index].raid }, arrivalAt: new Date(value.arrival).toISOString(), beginAt: new Date(value.begin).toISOString(), departureAt: new Date(value.departure).toISOString(), legDistanceKm: value.distance, cumulativeDistanceKm: cumulative };
  });
  skipped.notSelected = candidates.length - stops.length;
  return {
    generatedAt: now.toISOString(), validUntil: best.length ? new Date(Math.min(...best.map(value => candidates[value.index].expiry))).toISOString() : null,
    region: { ...region }, settings: config, stops, totalDistanceKm: cumulative, totalTravelMinutes: travelMs / MINUTE,
    totalWaitMinutes: waitMs / MINUTE, totalStopMinutes: stops.length * config.stopMinutes,
    totalDurationMinutes: (previous - at) / MINUTE, endsAt: stops.at(-1)?.departureAt ?? null,
    candidateCount: unique.length, cappedCandidateCount: candidates.length, skipped,
    skippedCount: Object.values(skipped).reduce((sum, count) => sum + count, 0),
  };
}

/** A plan is a short-lived snapshot, not a promise that future gyms stay unchanged. */
export function isRaidRouteCurrent(route: RaidRoute, raids: readonly LiveRaid[], now: Date, maxAgeMs = 120_000): boolean {
  try {
    const at = now.getTime(), generated = instant(route.generatedAt), until = instant(route.validUntil);
    if (!Number.isFinite(at) || !Number.isFinite(maxAgeMs) || maxAgeMs <= 0 || !validRegion(route.region) || generated === null || until === null || generated > at || at - generated >= maxAgeMs || until <= at || route.stops.length < 2) return false;
    const latest = new Map(raids.map(raid => [raid.id, raid]));
    const elapsed = at - generated;
    return route.stops.every(stop => {
      const raid = latest.get(stop.raid.id); if (!raid) return false;
      const values = data(raid, at), departure = instant(stop.departureAt);
      if (!values || values.expiry <= at || values.end - at < 5 * MINUTE || departure === null || departure + elapsed > values.end - BUFFER || unsupported(raid)) return false;
      return (["cityId", "lat", "lon", "bossName", "pokemonId", "formId", "tier", "startsAt", "endsAt"] as const).every(key => raid[key] === stop.raid[key])
        && raid.cityId === route.region.cityId && distance(route.region, raid) <= route.region.radiusKm + RADIUS_EPSILON;
    });
  } catch { return false; }
}

/** Expand exponent notation without changing the precision of the input number. */
function decimal(value: number): string {
  const plain = String(value); if (!/[eE]/.test(plain)) return plain;
  const [mantissa, exponent] = plain.toLowerCase().split("e"), negative = mantissa.startsWith("-");
  const unsigned = negative ? mantissa.slice(1) : mantissa, digits = unsigned.replace(".", "");
  const point = (unsigned.indexOf(".") < 0 ? unsigned.length : unsigned.indexOf(".")) + Number(exponent);
  return (negative ? "-" : "") + (point <= 0 ? `0.${"0".repeat(-point)}${digits}` : point >= digits.length ? `${digits}${"0".repeat(point - digits.length)}` : `${digits.slice(0, point)}.${digits.slice(point)}`);
}
function xml(value: string): string {
  const clean = [...value].filter(character => {
    const n = character.codePointAt(0)!;
    return n === 9 || n === 10 || n === 13 || (n >= 0x20 && n <= 0xd7ff) || (n >= 0xe000 && n <= 0xfffd) || (n >= 0x10000 && n <= 0x10ffff);
  }).join("");
  return clean.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function points(route: RaidRoute): { lat: number; lon: number; name: string }[] {
  if (!validRegion(route.region) || route.stops.length < 2 || route.stops.length > 30 || instant(route.generatedAt) === null || route.stops.some(stop => !position(stop.raid))) throw new RangeError("At least two valid raid stops are required");
  const output = [{ lat: route.region.lat, lon: route.region.lon, name: `${route.region.gymName} 출발점` }];
  for (const stop of route.stops) {
    const point = { lat: stop.raid.lat, lon: stop.raid.lon, name: stop.raid.gymName }, previous = output.at(-1)!;
    if (point.lat === previous.lat && longitude(point.lon) === longitude(previous.lon)) output[output.length - 1] = point;
    else output.push(point);
  }
  if (output.length < 2) throw new RangeError("At least two distinct route points are required");
  return output;
}

export function raidRouteToCoordinates(route: RaidRoute): string {
  return points(route).map(point => `${decimal(point.lat)},${decimal(point.lon)}`).join("\n");
}

/** GPX contains a planned straight-line route and track, not recorded activity. */
export function raidRouteToGpx(route: RaidRoute): string {
  const ordered = points(route), name = `${route.region.gymName} 레이드 방문 계획`;
  const description = "계획한 방문 순서의 직선 연결입니다. 실제 도로·보행 경로 또는 기록된 이동 궤적이 아닙니다. 시간·거리는 추정이며 각 레이드의 최신 상태를 다시 확인하세요.";
  const pointXml = (tag: "rtept" | "trkpt", point: typeof ordered[number]) => `    <${tag} lat="${decimal(point.lat)}" lon="${decimal(longitude(point.lon))}"><name>${xml(point.name)}</name></${tag}>`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="pokedoko" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 https://www.topografix.com/GPX/1/1/gpx.xsd">\n  <metadata><name>${xml(name)}</name><desc>${xml(description)}</desc><time>${new Date(route.generatedAt).toISOString()}</time></metadata>\n  <rte><name>${xml(name)}</name><desc>${xml(description)}</desc>\n${ordered.map(point => pointXml("rtept", point)).join("\n")}\n  </rte>\n  <trk><name>${xml(name)}</name><desc>${xml(description)}</desc><trkseg>\n${ordered.map(point => pointXml("trkpt", point)).join("\n")}\n  </trkseg></trk>\n</gpx>\n`;
}

export function raidRouteFilename(route: RaidRoute): string {
  const at = instant(route.generatedAt); if (at === null) throw new RangeError("Invalid route generation time");
  const city = route.region.cityId.replace(/[^a-z0-9-]/gi, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "city";
  return `pokedoko-route-${city}-${new Date(at).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}.gpx`;
}
