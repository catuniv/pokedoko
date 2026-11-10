/** Geometry/timing utilities only. Speed is a generic user setting, not a game limit. */
export type HuntingPoint = { lat: number; lon: number };
export type RouteOptions = {
  speedKmh: number;
  laps: number;
  mode: "original" | "loop" | "out-and-back";
  reverse: boolean;
  includeTimes: boolean;
  startAt: Date;
};
export type HuntingRoutePlan = {
  points: HuntingPoint[];
  distanceKm: number;
  durationMinutes: number;
  sourcePointCount: number;
  laps: number;
  mode: RouteOptions["mode"];
  speedKmh: number;
  times?: string[];
};
export const HUNTING_MAX_BYTES = 2 * 1024 * 1024;
export const HUNTING_MAX_SOURCE_POINTS = 20_000;
export const HUNTING_MAX_OUTPUT_POINTS = 50_000;
export const HUNTING_CLOSED_TOLERANCE_KM = 0.02;
const MAX_DATE_MS = 8_640_000_000_000_000;
const decimalPattern = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;

function validPoint(point: unknown): point is HuntingPoint {
  if (!point || typeof point !== "object") return false;
  const value = point as HuntingPoint;
  return typeof value.lat === "number" && typeof value.lon === "number" && Number.isFinite(value.lat) && Number.isFinite(value.lon) && value.lat >= -90 && value.lat <= 90 && value.lon >= -180 && value.lon <= 180;
}
function samePoint(a: HuntingPoint, b: HuntingPoint): boolean { return a.lat === b.lat && a.lon === b.lon; }
function cleanPoints(points: readonly HuntingPoint[], max: number): HuntingPoint[] {
  if (!Array.isArray(points) || points.length > max) throw new Error(`원본 경로는 좌표 ${max.toLocaleString("ko-KR")}개까지 사용할 수 있어요.`);
  const result: HuntingPoint[] = [];
  for (const point of points) {
    if (!validPoint(point)) throw new Error("위도(-90~90)와 경도(-180~180)는 유한한 숫자여야 해요.");
    if (!result.length || !samePoint(result[result.length - 1], point)) result.push({ lat: point.lat, lon: point.lon });
  }
  if (result.length < 2) throw new Error("서로 다른 좌표가 2개 이상 필요해요.");
  return result;
}
function checkText(text: string) {
  if (typeof text !== "string" || !text.trim()) throw new Error("GPX 또는 좌표 내용을 넣어주세요.");
  if (new TextEncoder().encode(text).length > HUNTING_MAX_BYTES) throw new Error("파일 또는 붙여넣기는 2MiB 이하만 사용할 수 있어요.");
}
function readNumber(value: string | null): number {
  const text = value?.trim();
  if (!text || !decimalPattern.test(text)) throw new Error("GPX 위도·경도는 일반 십진수로 입력되어야 해요.");
  return Number(text);
}

/** Return the selected continuous geometry. Original per-point timestamps are ignored. */
export function parseHuntingGpx(text: string, parseXml?: (text: string) => Document): HuntingPoint[] {
  checkText(text);
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/iu.test(text)) throw new Error("DOCTYPE·ENTITY 선언이 포함된 GPX는 불러올 수 없어요.");
  const xml = text.trimStart();
  const document = parseXml ? parseXml(xml) : new DOMParser().parseFromString(xml, "application/xml");
  if (document.getElementsByTagNameNS("*", "parsererror").length || document.documentElement?.localName !== "gpx") throw new Error("올바른 GPX XML 파일이 아니에요.");
  const groups = (container: string, pointName: string) => Array.from(document.getElementsByTagNameNS("*", container))
    .map((element) => Array.from(element.getElementsByTagNameNS("*", pointName))).filter((points) => points.length);
  const segments = Array.from(document.getElementsByTagNameNS("*", "trkseg"));
  const occupiedSegments = segments.filter((segment) => segment.getElementsByTagNameNS("*", "trkpt").length || segment.getElementsByTagNameNS("*", "wpt").length);
  if (occupiedSegments.length > 1) throw new Error("연결되지 않은 여러 트랙 구간은 하나로 합치지 않아요. 구간별 파일로 나눠주세요.");
  const tracks = groups("trkseg", "trkpt");
  const routes = tracks.length ? [] : groups("rte", "rtept");
  const selected = tracks.length ? tracks : routes;
  if (selected.length > 1) throw new Error("연결되지 않은 여러 경로·트랙 구간은 하나로 합치지 않아요. 구간별 파일로 나눠주세요.");
  if (!selected.length && Array.from(document.getElementsByTagNameNS("*", "rte")).filter((route) => route.getElementsByTagNameNS("*", "wpt").length).length > 1) throw new Error("여러 경로에 나뉜 waypoint는 하나로 합칠 수 없어요.");
  // Legacy public archives put ordered wpt elements inside a single trkseg.
  const elements = selected[0] ?? Array.from(document.getElementsByTagNameNS("*", "wpt"));
  if (elements.length > HUNTING_MAX_SOURCE_POINTS) throw new Error("선택한 원본 경로는 좌표 20,000개까지 사용할 수 있어요.");
  return cleanPoints(elements.map((point) => ({ lat: readNumber(point.getAttribute("lat")), lon: readNumber(point.getAttribute("lon")) })), HUNTING_MAX_SOURCE_POINTS);
}

export function parseHuntingCoordinates(text: string): HuntingPoint[] {
  checkText(text);
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length > HUNTING_MAX_SOURCE_POINTS) throw new Error("원본 경로는 좌표 20,000개까지 사용할 수 있어요.");
  return cleanPoints(lines.map((line, index) => {
    const parts = line.split(",");
    if (parts.length !== 2 || !decimalPattern.test(parts[0].trim()) || !decimalPattern.test(parts[1].trim())) throw new Error(`${index + 1}번째 줄은 위도,경도 형식으로 넣어주세요.`);
    return { lat: Number(parts[0]), lon: Number(parts[1]) };
  }), HUNTING_MAX_SOURCE_POINTS);
}

/** Mean-Earth great-circle distance in kilometres, including date-line crossings. */
export function huntingDistanceKm(a: HuntingPoint, b: HuntingPoint): number {
  const rad = Math.PI / 180;
  const dlat = (b.lat - a.lat) * rad, dlon = (b.lon - a.lon) * rad;
  const h = Math.sin(dlat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dlon / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, h))));
}

export function speedKmhFrom(value: number, unit: "kmh" | "mps"): number {
  if (!Number.isFinite(value) || unit !== "kmh" && unit !== "mps") throw new Error("속도 숫자와 단위를 확인해 주세요.");
  return unit === "mps" ? value * 3.6 : value;
}
export function speedToUnit(kmh: number, unit: "kmh" | "mps"): number {
  if (!Number.isFinite(kmh) || unit !== "kmh" && unit !== "mps") throw new Error("속도 숫자와 단위를 확인해 주세요.");
  return unit === "mps" ? kmh / 3.6 : kmh;
}

/** Explicit direction/closure/repetition only; never sort an imported path. */
export function buildHuntingRoute(points: readonly HuntingPoint[], options: RouteOptions): HuntingRoutePlan {
  if (!options || typeof options !== "object" || !Number.isFinite(options.speedKmh) || options.speedKmh < 0.1 || options.speedKmh > 120) throw new Error("속도는 0.1~120km/h 사이 숫자로 선택해 주세요.");
  if (!Number.isInteger(options.laps) || options.laps < 1 || options.laps > 20) throw new Error("반복 횟수는 1~20회 정수로 선택해 주세요.");
  if (!["original", "loop", "out-and-back"].includes(options.mode) || typeof options.reverse !== "boolean" || typeof options.includeTimes !== "boolean") throw new Error("경로 방식과 방향 설정을 확인해 주세요.");
  const source = cleanPoints(points, HUNTING_MAX_SOURCE_POINTS);
  const ordered = options.reverse ? [...source].reverse() : [...source];
  const first = ordered[0], end = ordered[ordered.length - 1];
  if (options.mode === "original" && options.laps > 1 && huntingDistanceKm(first, end) > HUNTING_CLOSED_TOLERANCE_KM + 1e-9) throw new Error("열린 원본 경로는 그대로 반복할 수 없어요. ‘왕복’ 또는 ‘출발점 연결’을 선택해 주세요.");
  if (options.mode === "loop" && !samePoint(ordered[ordered.length - 1], first)) ordered.push({ ...first });
  if (options.mode === "out-and-back") ordered.push(...ordered.slice(0, -1).reverse().map((point) => ({ ...point })));
  const boundaryDuplicate = samePoint(ordered[0], ordered[ordered.length - 1]) ? 1 : 0;
  const totalCount = ordered.length + (options.laps - 1) * (ordered.length - boundaryDuplicate);
  if (totalCount > HUNTING_MAX_OUTPUT_POINTS) throw new Error("반복한 경로는 좌표 50,000개까지 만들 수 있어요. 반복 횟수나 원본 점 수를 줄여주세요.");
  const result: HuntingPoint[] = [];
  for (let lap = 0; lap < options.laps; lap++) for (const point of ordered) {
    if (!result.length || !samePoint(result[result.length - 1], point)) result.push({ ...point });
  }
  let distanceKm = 0;
  const distances: number[] | undefined = options.includeTimes ? [0] : undefined;
  for (let index = 1; index < result.length; index++) {
    distanceKm += huntingDistanceKm(result[index - 1], result[index]);
    distances?.push(distanceKm);
  }
  const durationMinutes = distanceKm / options.speedKmh * 60;
  const plan: HuntingRoutePlan = { points: result, distanceKm, durationMinutes, sourcePointCount: source.length, laps: options.laps, mode: options.mode, speedKmh: options.speedKmh };
  if (options.includeTimes) {
    if (!(options.startAt instanceof Date) || !Number.isFinite(options.startAt.getTime())) throw new Error("계획 시각을 넣으려면 유효한 출발 날짜와 시간이 필요해요.");
    const start = options.startAt.getTime(), final = start + durationMinutes * 60_000;
    if (options.startAt.getUTCFullYear() < 1 || options.startAt.getUTCFullYear() > 9999 || new Date(final).getUTCFullYear() < 1 || new Date(final).getUTCFullYear() > 9999) throw new Error("GPX 계획 시각은 1~9999년 범위로 지정해 주세요.");
    if (!Number.isFinite(final) || final > MAX_DATE_MS || final < -MAX_DATE_MS) throw new Error("계획 시간이 날짜 범위를 넘었어요. 반복 횟수나 거리를 줄여주세요.");
    plan.times = distances!.map((distance) => new Date(start + Math.round(distance / options.speedKmh * 3_600_000)).toISOString());
  }
  return plan;
}

/** Number's significant digits, expanded to XML-schema decimal (never exponent). */
export function huntingDecimal(value: number): string {
  if (!Number.isFinite(value)) throw new RangeError("유한한 숫자가 필요해요.");
  const raw = String(Object.is(value, -0) ? 0 : value);
  if (!/[eE]/.test(raw)) return raw;
  const [mantissa, exponent] = raw.toLowerCase().split("e"), sign = mantissa.startsWith("-") ? "-" : "", unsigned = mantissa.replace(/^-/, "");
  const dot = unsigned.indexOf("."), digits = unsigned.replace(".", ""), position = (dot < 0 ? unsigned.length : dot) + Number(exponent);
  return sign + (position <= 0 ? `0.${"0".repeat(-position)}${digits}` : position >= digits.length ? digits + "0".repeat(position - digits.length) : `${digits.slice(0, position)}.${digits.slice(position)}`);
}
const escapeXml = (value: string): string => value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff\ud800-\udfff]/gu, "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!);

export type HuntingRouteSource = { url: string; title?: string; author?: string };
export function buildHuntingGpx(plan: HuntingRoutePlan, name: string, format: "trk" | "rte" = "trk", source?: HuntingRouteSource): string {
  if (!plan.points.length) return "";
  if (format !== "trk" && format !== "rte") throw new Error("GPX 형식은 trk 또는 rte여야 해요.");
  if (plan.points.length < 2 || plan.points.length > HUNTING_MAX_OUTPUT_POINTS || plan.points.some((point) => !validPoint(point))) throw new Error("내보낼 경로 좌표를 확인해 주세요.");
  if (plan.times && (plan.times.length !== plan.points.length || plan.times.some((time) => !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(time) || !Number.isFinite(Date.parse(time))))) throw new Error("계획 시각과 좌표 수가 맞지 않아요.");
  const title = escapeXml(name.trim() || "pokedoko hunting route");
  const description = escapeXml(`Planned route, not a recorded GPS activity. Speed: ${huntingDecimal(plan.speedKmh)} km/h; laps: ${plan.laps}; mode: ${plan.mode}. ${plan.times ? "Timestamps are planned estimates." : "No timestamps were generated."}`);
  let attribution = "";
  if (source) {
    let url: URL;
    try { url = new URL(source.url); } catch { throw new Error("원문 주소는 유효한 HTTPS 주소여야 해요."); }
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("원문 주소는 인증 정보 없는 HTTPS 주소여야 해요.");
    if (source.author?.trim()) attribution += `<author><name>${escapeXml(source.author.trim())}</name></author>`;
    attribution += `<link href="${escapeXml(url.href)}">${source.title?.trim() ? `<text>${escapeXml(source.title.trim())}</text>` : ""}</link>`;
  }
  const pointName = format === "trk" ? "trkpt" : "rtept";
  const geometry = plan.points.map((point, index) => `      <${pointName} lat="${huntingDecimal(point.lat)}" lon="${huntingDecimal(point.lon === 180 ? -180 : point.lon)}">${plan.times ? `<time>${escapeXml(plan.times[index])}</time>` : ""}</${pointName}>`).join("\n");
  const path = format === "trk" ? `  <trk><name>${title}</name>\n    <trkseg>\n${geometry}\n    </trkseg>\n  </trk>` : `  <rte><name>${title}</name>\n${geometry}\n  </rte>`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="pokedoko" xmlns="http://www.topografix.com/GPX/1/1">\n  <metadata><name>${title}</name><desc>${description}</desc>${attribution}</metadata>\n${path}\n</gpx>`;
}
export function huntingCoordinates(plan: HuntingRoutePlan): string {
  return plan.points.map((point) => {
    if (!validPoint(point)) throw new Error("좌표 목록에 유효하지 않은 값이 있어요.");
    return `${huntingDecimal(point.lat)},${huntingDecimal(point.lon)}`;
  }).join("\n");
}
