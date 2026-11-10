/** User-supplied walking geometry, never an authoritative Pokémon GO Route feed. */
export const CELL_ROUTE_MAX_BYTES = 1_048_576;
export const CELL_ROUTE_MAX_POINTS = 2_000;
export const CELL_ROUTE_MAX_ROUTES = 20;
export type CellPoint = { lat: number; lon: number };
export type CellRoute = {
  id: string; name: string; cityId: string; points: CellPoint[];
  reversible: boolean; sourceUrl?: string; createdAt: string;
};
export type CellCompletion = { routeId: string; cityId: string; day: string; cells: number; completedAt: string };
export type CellRouteState = { version: 1; routes: CellRoute[]; completions: CellCompletion[] };
export type CellRouteStep = { route: CellRoute; points: CellPoint[]; reversed: boolean; walkKm: number; transferKm: number };
export type CellRoutePlan = { steps: CellRouteStep[]; walkKm: number; transferKm: number; totalKm: number; estimatedMinutes: number };
const cleanText = (value: unknown, max: number): value is string => typeof value === "string" && value.trim().length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/u.test(value);
const validPoint = (value: unknown): value is CellPoint => {
  if (!value || typeof value !== "object") return false;
  const p = value as CellPoint;
  return typeof p.lat === "number" && typeof p.lon === "number" && Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180;
};
export function cellSourceUrl(value: string): string | undefined {
  if (!value.trim()) return undefined;
  if (value.length > 2048) throw new Error("원문 주소가 너무 길어요.");
  try { const url = new URL(value.trim()); if (url.protocol !== "https:" || url.username || url.password) throw new Error(); return url.href; }
  catch { throw new Error("원문은 https://로 시작하는 공개 주소를 넣어주세요."); }
}
export function validateCellPoints(input: readonly CellPoint[]): CellPoint[] {
  if (input.length > CELL_ROUTE_MAX_POINTS) throw new Error("한 경로는 좌표 2,000개까지 등록할 수 있어요.");
  const points: CellPoint[] = [];
  for (const point of input) {
    if (!validPoint(point)) throw new Error("위도는 -90~90, 경도는 -180~180 사이 숫자여야 해요.");
    const previous = points.at(-1);
    if (!previous || previous.lat !== point.lat || previous.lon !== point.lon) points.push({ lat: point.lat, lon: point.lon });
  }
  if (points.length < 2) throw new Error("서로 다른 좌표가 2개 이상 필요해요.");
  return points;
}
function checkInputSize(text: string) {
  if (new TextEncoder().encode(text).length > CELL_ROUTE_MAX_BYTES) throw new Error("파일 또는 붙여넣기는 1MiB 이하만 사용할 수 있어요.");
  if (!text.trim()) throw new Error("경로 내용을 넣어주세요.");
}
export function parseCellCoordinateLines(text: string): CellPoint[] {
  checkInputSize(text);
  const rows = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (rows.length > CELL_ROUTE_MAX_POINTS) throw new Error("한 경로는 좌표 2,000개까지 등록할 수 있어요.");
  const number = "[+-]?(?:\\d+(?:\\.\\d+)?|\\.\\d+)";
  const pattern = new RegExp(`^(${number})\\s*,\\s*(${number})$`);
  return validateCellPoints(rows.map((line, index) => {
    const match = pattern.exec(line);
    if (!match) throw new Error(`${index + 1}번째 줄은 위도,경도 형식으로 넣어주세요.`);
    return { lat: Number(match[1]), lon: Number(match[2]) };
  }));
}
/** Reject DTD/entity declarations before DOMParser can process any XML. */
export function validateCellGpxEnvelope(text: string): void {
  checkInputSize(text);
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/iu.test(text)) throw new Error("DOCTYPE·ENTITY 선언이 있는 GPX는 불러올 수 없어요.");
}
export function parseCellGpx(text: string, parseXml?: (text: string) => Document): CellPoint[] {
  validateCellGpxEnvelope(text);
  const document = parseXml ? parseXml(text) : new DOMParser().parseFromString(text, "application/xml");
  if (document.getElementsByTagNameNS("*", "parsererror").length || document.documentElement.localName !== "gpx") throw new Error("올바른 GPX XML 파일이 아니에요.");
  const tracks = Array.from(document.getElementsByTagNameNS("*", "trkseg")).map((segment) => Array.from(segment.getElementsByTagNameNS("*", "trkpt"))).filter((points) => points.length);
  // Some exporters include the same path in both representations. Track wins.
  const groups = tracks.length ? tracks : Array.from(document.getElementsByTagNameNS("*", "rte")).map((route) => Array.from(route.getElementsByTagNameNS("*", "rtept"))).filter((points) => points.length);
  if (groups.length !== 1) throw new Error("한 번에 이어진 경로 1개만 등록해 주세요. 여러 트랙·구간은 파일을 나눠주세요.");
  if (groups[0].length > CELL_ROUTE_MAX_POINTS) throw new Error("한 경로는 좌표 2,000개까지 등록할 수 있어요.");
  return validateCellPoints(groups[0].map((point) => {
    const lat = point.getAttribute("lat"), lon = point.getAttribute("lon");
    if (!lat?.trim() || !lon?.trim()) throw new Error("GPX 좌표에 위도나 경도가 빠져 있어요.");
    return { lat: Number(lat), lon: Number(lon) };
  }));
}
export function cellDistanceKm(a: CellPoint, b: CellPoint): number {
  const rad = Math.PI / 180, dlat = (b.lat - a.lat) * rad, dlon = (b.lon - a.lon) * rad;
  const h = Math.sin(dlat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dlon / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}
export function cellPathKm(points: readonly CellPoint[]): number {
  return points.slice(1).reduce((sum, point, index) => sum + cellDistanceKm(points[index], point), 0);
}
function validDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^20\d{2}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function cellLocalDay(now: Date, zone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
/** Malformed device data cannot create routes, coordinates, or completed days. */
export function restoreCellState(value: unknown, cityIds: readonly string[]): CellRouteState {
  const empty: CellRouteState = { version: 1, routes: [], completions: [] };
  if (!value || typeof value !== "object" || (value as { version?: unknown }).version !== 1) return empty;
  const raw = value as { routes?: unknown; completions?: unknown };
  if (!Array.isArray(raw.routes) || raw.routes.length > CELL_ROUTE_MAX_ROUTES) return empty;
  const seen = new Set<string>();
  for (const entry of raw.routes) {
    if (!entry || typeof entry !== "object") continue;
    const route = entry as CellRoute;
    if (!cleanText(route.id, 100) || seen.has(route.id) || !cleanText(route.name, 80) || !cityIds.includes(route.cityId) || typeof route.reversible !== "boolean" || !Array.isArray(route.points) || typeof route.createdAt !== "string" || !Number.isFinite(Date.parse(route.createdAt))) continue;
    try {
      const points = validateCellPoints(route.points);
      const sourceUrl = cellSourceUrl(route.sourceUrl ?? "");
      empty.routes.push({ id: route.id, name: route.name.trim(), cityId: route.cityId, reversible: route.reversible, createdAt: route.createdAt, sourceUrl, points }); seen.add(route.id);
    } catch { /* Reject only the malformed entry. */ }
  }
  if (Array.isArray(raw.completions)) {
    const records = new Set<string>();
    for (const entry of raw.completions.slice(-500)) {
      const record = entry as CellCompletion | null;
      const route = record && empty.routes.find((item) => item.id === record.routeId);
      if (!record || !route || route.cityId !== record.cityId || !validDay(record.day) || !Number.isSafeInteger(record.cells) || record.cells < 0 || record.cells > 999 || typeof record.completedAt !== "string" || !Number.isFinite(Date.parse(record.completedAt))) continue;
      const key = `${record.routeId}:${record.day}`;
      if (!records.has(key)) { empty.completions.push({ routeId: record.routeId, cityId: record.cityId, day: record.day, cells: record.cells, completedAt: record.completedAt }); records.add(key); }
    }
  }
  return empty;
}
/** Try every permissible first direction, then greedily reduce path length plus transfers.
 * This is a bounded heuristic, not a claim of a globally shortest walking route. */
export function planCellRoutes(routes: readonly CellRoute[], cityId: string, limit: 3 | 5, excluded: ReadonlySet<string> = new Set()): CellRoutePlan {
  if (limit !== 3 && limit !== 5) throw new Error("방문 경로 수는 3개 또는 5개만 선택할 수 있어요.");
  const unique = new Map<string, CellRoute>();
  for (const route of routes.slice(0, CELL_ROUTE_MAX_ROUTES)) {
    if (route.cityId !== cityId || excluded.has(route.id) || unique.has(route.id)) continue;
    try { unique.set(route.id, { ...route, points: validateCellPoints(route.points) }); } catch { /* Invalid input is not a route candidate. */ }
  }
  const candidates = [...unique.values()].sort((a, b) => a.id.localeCompare(b.id));
  const lengths = new Map(candidates.map((route) => [route.id, cellPathKm(route.points)]));
  const orientations = (route: CellRoute) => [false, ...(route.reversible ? [true] : [])].map((reversed) => ({ route, reversed, points: reversed ? [...route.points].reverse() : [...route.points] }));
  let best: CellRouteStep[] = [], bestTotal = Infinity, bestTransfer = Infinity, bestKey = "";
  for (const first of candidates.flatMap(orientations)) {
    const steps: CellRouteStep[] = [{ ...first, walkKm: lengths.get(first.route.id)!, transferKm: 0 }], used = new Set([first.route.id]);
    while (steps.length < Math.min(limit, candidates.length)) {
      const end = steps.at(-1)!.points.at(-1)!;
      const next = candidates.filter((route) => !used.has(route.id)).flatMap(orientations).map((item) => ({ ...item, transferKm: cellDistanceKm(end, item.points[0]) })).sort((a, b) => (a.transferKm + lengths.get(a.route.id)!) - (b.transferKm + lengths.get(b.route.id)!) || a.transferKm - b.transferKm || a.route.id.localeCompare(b.route.id) || Number(a.reversed) - Number(b.reversed))[0];
      if (!next) break;
      steps.push({ ...next, walkKm: lengths.get(next.route.id)! }); used.add(next.route.id);
    }
    const transfer = steps.reduce((sum, step) => sum + step.transferKm, 0), key = steps.map((step) => `${step.route.id}:${step.reversed}`).join("|");
    const total = transfer + steps.reduce((sum, step) => sum + step.walkKm, 0);
    if (total < bestTotal - 1e-9 || Math.abs(total - bestTotal) <= 1e-9 && (transfer < bestTransfer - 1e-9 || Math.abs(transfer - bestTransfer) <= 1e-9 && key < bestKey)) { best = steps; bestTotal = total; bestTransfer = transfer; bestKey = key; }
  }
  const walkKm = best.reduce((sum, step) => sum + step.walkKm, 0), transferKm = best.reduce((sum, step) => sum + step.transferKm, 0);
  return { steps: best, walkKm, transferKm, totalKm: walkKm + transferKm, estimatedMinutes: (walkKm + transferKm) / 4.5 * 60 };
}
const xml = (value: string) => value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff\ud800-\udfff]/gu, "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!);
export function cellGpxDecimal(value: number): string {
  if (!Number.isFinite(value)) throw new RangeError("좌표는 유한한 숫자여야 해요.");
  const raw = String(Object.is(value, -0) ? 0 : value);
  if (!/[eE]/.test(raw)) return raw;
  const [mantissa, exponent] = raw.toLowerCase().split("e"), sign = mantissa.startsWith("-") ? "-" : "", unsigned = mantissa.replace(/^-/, "");
  const dot = unsigned.indexOf("."), digits = unsigned.replace(".", ""), position = (dot < 0 ? unsigned.length : dot) + Number(exponent);
  return sign + (position <= 0 ? `0.${"0".repeat(-position)}${digits}` : position >= digits.length ? digits + "0".repeat(position - digits.length) : `${digits.slice(0, position)}.${digits.slice(position)}`);
}
export function cellPlanGpx(plan: CellRoutePlan, format: "trk" | "rte" = "trk"): string {
  if (!plan.steps.length) return "";
  const routes = plan.steps.map((step, index) => {
    const name = `${index + 1}. ${step.route.name}${step.reversed ? " (역방향)" : ""}`;
    const pointTag = format === "trk" ? "trkpt" : "rtept";
    const points = step.points.map((p) => `      <${pointTag} lat="${cellGpxDecimal(p.lat)}" lon="${cellGpxDecimal(p.lon === 180 ? -180 : p.lon)}" />`).join("\n");
    const info = `<name>${xml(name)}</name><desc>사용자 제공·게임 루트 미검증. 경로 사이 이동 구간은 포함하지 않습니다.</desc>`;
    return format === "trk" ? `  <trk>${info}\n    <trkseg>\n${points}\n    </trkseg>\n  </trk>` : `  <rte>${info}\n${points}\n  </rte>`;
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="pokedoko" xmlns="http://www.topografix.com/GPX/1/1">\n  <metadata><name>사용자 등록 루트 방문 순서</name><desc>게임 내 루트와 셀 획득은 확인하거나 보장하지 않습니다. 각 구간은 분리된 경로입니다.</desc></metadata>\n${routes}\n</gpx>`;
}
export function cellPlanCoordinates(plan: CellRoutePlan): string {
  return plan.steps.map((step) => step.points.map((point) => `${cellGpxDecimal(point.lat)},${cellGpxDecimal(point.lon)}`).join("\n")).join("\n\n");
}
