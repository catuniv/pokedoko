import { CITIES } from "./cities";
import type { CellPoint } from "./cell-routes";

export type CommunityGeometryType = "none" | "original" | "estimated" | "reconstructed";
export type CommunityRightsBasis = "creator" | "permission" | "license";
export type CommunityRouteMetadata = { reversible: boolean | null; estimatedMinutes: number | null; isLoop: boolean | null };
export type CommunityRoutePlace = { id: string; name: string; point: CellPoint; sourceRouteId: string };
export type CommunityRouteSummary = {
  id: string; name: string; cityId: string; startName: string; endName: string;
  startPoint: CellPoint; endPoint?: CellPoint; reportedDistanceMeters: number;
  computedDistanceMeters?: number; geometryType: CommunityGeometryType;
  verificationStatus: "reviewed" | "needs_verification";
  gpxAvailable: boolean; pointCount: number; creatorName: string;
  sourceUrl?: string; lastCheckedAt: string; publishedAt: string;
} & CommunityRouteMetadata;
export type CommunityRouteDetail = CommunityRouteSummary & {
  points?: CellPoint[]; rightsBasis: CommunityRightsBasis; rightsDetails: string; notes: string;
};
export type CommunityRouteSubmission = {
  visitorId: string; name: string; cityId: string; startName: string; endName: string;
  startPoint: CellPoint; endPoint?: CellPoint; reportedDistanceMeters: number;
  sourceUrl?: string; creatorName: string; rightsBasis: CommunityRightsBasis;
  rightsDetails: string; allowRedistribution: true; inGameConfirmed: true;
  lastCheckedAt: string; geometryType: CommunityGeometryType; points?: CellPoint[];
  notes: string; website?: string;
  /** Unknown metadata is omitted so existing v1 fingerprints stay identical. */
  reversible?: boolean; estimatedMinutes?: number; isLoop?: boolean;
};
export const COMMUNITY_ROUTE_MAX_POINTS = 2000;
export const COMMUNITY_ROUTE_MAX_BYTES = 192 * 1024;
export const COMMUNITY_ROUTE_REVIEW_POLICY = "community-routes-v1";
const CITY_IDS = new Set(CITIES.map(city => city.id));
const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const GEOMETRY_TYPES = new Set(["none", "original", "estimated", "reconstructed"]);
const RIGHTS_TYPES = new Set(["creator", "permission", "license"]);
const CONTROL = /[\u0000-\u001f\u007f]/u;
export class CommunityRouteValidationError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = "CommunityRouteValidationError"; }
}
const invalid = (code: string, message: string): never => { throw new CommunityRouteValidationError(code, message); };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
function text(value: unknown, label: string, max: number, optional = false, multiline = false): string {
  if (optional && (value === undefined || value === "")) return "";
  const controls = multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u : CONTROL;
  if (typeof value !== "string" || controls.test(value) || Array.from(value.trim()).length > max || !optional && !value.trim()) return invalid("invalid_text", `${label}을 확인해 주세요.`);
  return value.trim();
}
function point(value: unknown): CellPoint {
  if (!object(value) || Object.keys(value).some(key => key !== "lat" && key !== "lon") || typeof value.lat !== "number" || typeof value.lon !== "number" || !Number.isFinite(value.lat) || !Number.isFinite(value.lon) || Math.abs(value.lat) > 90 || Math.abs(value.lon) > 180) return invalid("invalid_coordinates", "위도·경도는 정상 범위의 숫자여야 합니다.");
  return { lat: value.lat, lon: value.lon };
}
export function communityDistanceMeters(a: CellPoint, b: CellPoint): number {
  const rad = Math.PI / 180, x = (b.lat - a.lat) * rad, y = (b.lon - a.lon) * rad;
  const h = Math.sin(x / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(y / 2) ** 2;
  return 6371008.8 * 2 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, h))));
}
export function communityGeometryLabel(type: CommunityGeometryType): string {
  return ({ none: "전체 경로 미확보", original: "전체 경로 데이터 있음", estimated: "추정 경로", reconstructed: "복원 경로" })[type];
}
/** Unknown is distinct from an explicitly confirmed false value. */
export function validateCommunityRouteMetadata(input: { reversible?: unknown; estimatedMinutes?: unknown; isLoop?: unknown }, startPoint?: CellPoint, endPoint?: CellPoint): Pick<CommunityRouteSubmission, "reversible" | "estimatedMinutes" | "isLoop"> {
  const optionalBoolean = (value: unknown, label: string): boolean | undefined => {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== "boolean") return invalid("invalid_route_metadata", `${label}를 확인해 주세요.`);
    return value;
  };
  const reversible = optionalBoolean(input.reversible, "역방향 가능 여부"), isLoop = optionalBoolean(input.isLoop, "순환 루트 여부");
  const minutes = input.estimatedMinutes;
  if (minutes !== undefined && minutes !== null && (typeof minutes !== "number" || !Number.isSafeInteger(minutes) || minutes < 1 || minutes > 1440)) return invalid("invalid_route_duration", "예상 시간은 1~1,440분 사이의 정수로 입력해 주세요.");
  if (isLoop === true && (!startPoint || !endPoint || communityDistanceMeters(point(startPoint), point(endPoint)) > 100)) return invalid("loop_endpoint_mismatch", "순환 루트는 시작·종료 위치를 모두 지정하고 두 위치가 100m 이내여야 합니다.");
  return {
    ...(reversible !== undefined ? { reversible } : {}),
    ...(typeof minutes === "number" ? { estimatedMinutes: minutes } : {}),
    ...(isLoop !== undefined ? { isLoop } : {}),
  };
}
/** Numerical checks never establish that a trace is a game-approved Route. */
export function validateCommunityGeometry(input: unknown, reportedDistanceMeters: number, startPoint?: CellPoint, endPoint?: CellPoint): { points: CellPoint[]; computedDistanceMeters: number; pointCount: number } {
  if (!Array.isArray(input) || input.length < 2 || input.length > COMMUNITY_ROUTE_MAX_POINTS) return invalid("invalid_point_count", "전체 경로 좌표는 2~2,000개여야 합니다.");
  if (!Number.isFinite(reportedDistanceMeters) || reportedDistanceMeters < 100 || reportedDistanceMeters > 100000) return invalid("invalid_distance", "게임에 표시된 거리를 100~100,000m 범위로 입력해 주세요.");
  const points = input.map(point);
  let computedDistanceMeters = 0;
  for (let i = 1; i < points.length; i++) {
    const segment = communityDistanceMeters(points[i - 1], points[i]);
    if (segment > 500) return invalid("geometry_jump", "이웃 좌표 사이가 500m를 넘습니다. 전체 경로가 빠짐없이 들어 있는지 확인해 주세요.");
    computedDistanceMeters += segment;
  }
  if (computedDistanceMeters < 1) return invalid("empty_geometry", "서로 다른 위치를 잇는 전체 경로가 필요합니다.");
  if (Math.abs(computedDistanceMeters - reportedDistanceMeters) > Math.max(100, reportedDistanceMeters * .1)) return invalid("distance_mismatch", "좌표 길이와 게임 표시 거리가 크게 다릅니다. 원본 경로와 거리를 확인해 주세요.");
  if (startPoint && communityDistanceMeters(point(startPoint), points[0]) > 100 || endPoint && communityDistanceMeters(point(endPoint), points.at(-1)!) > 100) return invalid("endpoint_mismatch", "입력한 시작·종료 위치와 GPX 끝점이 100m 넘게 떨어져 있습니다.");
  return { points, computedDistanceMeters, pointCount: points.length };
}
export function validateCommunitySubmission(input: unknown, now = new Date()): CommunityRouteSubmission {
  const allowed = new Set(["visitorId", "name", "cityId", "startName", "endName", "startPoint", "endPoint", "reportedDistanceMeters", "sourceUrl", "creatorName", "rightsBasis", "rightsDetails", "allowRedistribution", "inGameConfirmed", "lastCheckedAt", "geometryType", "points", "notes", "website", "reversible", "estimatedMinutes", "isLoop"]);
  if (!object(input) || Object.keys(input).some(key => !allowed.has(key)) || typeof input.visitorId !== "string" || !UUID.test(input.visitorId)) return invalid("invalid_payload", "제보 내용을 다시 확인해 주세요.");
  if (input.allowRedistribution !== true || input.inGameConfirmed !== true) return invalid("consent_required", "게임 루트 확인과 공개 이용 허락에 동의해 주세요.");
  if (typeof input.cityId !== "string" || !CITY_IDS.has(input.cityId)) return invalid("invalid_city", "목록에서 도시를 선택해 주세요.");
  if (typeof input.geometryType !== "string" || !GEOMETRY_TYPES.has(input.geometryType) || typeof input.rightsBasis !== "string" || !RIGHTS_TYPES.has(input.rightsBasis)) return invalid("invalid_payload", "경로 종류와 이용 허락 근거를 선택해 주세요.");
  const date = input.lastCheckedAt, city = CITIES.find(item => item.id === input.cityId)!;
  const todayParts = new Intl.DateTimeFormat("en-CA", { timeZone: city.zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const todayPart = (kind: string) => todayParts.find(part => part.type === kind)!.value;
  const today = `${todayPart("year")}-${todayPart("month")}-${todayPart("day")}`;
  if (typeof date !== "string" || !/^20\d{2}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date || date > today) return invalid("invalid_checked_date", "게임에서 확인한 날짜를 해당 도시의 오늘 또는 이전 날짜로 입력해 주세요.");
  let sourceUrl: string | undefined;
  if (input.sourceUrl !== undefined && input.sourceUrl !== "") {
    if (typeof input.sourceUrl !== "string" || input.sourceUrl.length > 2048) return invalid("invalid_source_url", "출처는 공개 HTTPS 주소를 입력해 주세요.");
    try { const url = new URL(input.sourceUrl); if (url.protocol !== "https:" || url.username || url.password) throw new Error(); sourceUrl = url.href; }
    catch { return invalid("invalid_source_url", "출처는 공개 HTTPS 주소를 입력해 주세요."); }
  }
  const rightsBasis = input.rightsBasis as CommunityRightsBasis;
  const rightsDetails = text(input.rightsDetails, "이용 허락 근거", 1000, true, true) || (rightsBasis === "creator" ? "본인이 제작하고 공개 이용을 허락한 자료" : "");
  if (rightsBasis !== "creator" && (!sourceUrl || Array.from(rightsDetails).length < 20)) return invalid("rights_evidence_required", "제작자 허락 또는 라이선스의 공개 주소와 근거를 20자 이상 적어 주세요.");
  const startPoint = point(input.startPoint), endPoint = input.endPoint === undefined ? undefined : point(input.endPoint);
  const metadata = validateCommunityRouteMetadata(input, startPoint, endPoint);
  if (communityDistanceMeters(startPoint, city) > 100000 || endPoint && communityDistanceMeters(endPoint, city) > 150000) return invalid("city_location_mismatch", "선택한 도시와 루트 위치가 너무 멉니다. 도시와 좌표를 확인해 주세요.");
  const reportedDistanceMeters = input.reportedDistanceMeters;
  if (typeof reportedDistanceMeters !== "number" || !Number.isFinite(reportedDistanceMeters) || reportedDistanceMeters < 100 || reportedDistanceMeters > 100000) return invalid("invalid_distance", "게임에 표시된 거리를 100~100,000m 범위로 입력해 주세요.");
  const geometryType = input.geometryType as CommunityGeometryType;
  let points: CellPoint[] | undefined;
  if (geometryType === "none") {
    if (input.points !== undefined && (!Array.isArray(input.points) || input.points.length)) return invalid("invalid_geometry_type", "전체 경로가 없는 항목에는 좌표 배열을 등록할 수 없습니다.");
  } else points = validateCommunityGeometry(input.points, reportedDistanceMeters, startPoint, endPoint).points;
  return {
    visitorId: input.visitorId.toLowerCase(), name: text(input.name, "루트 이름", 80), cityId: input.cityId,
    startName: text(input.startName, "시작 위치 이름", 120), endName: text(input.endName, "종료 위치 이름", 120, true),
    startPoint, ...(endPoint ? { endPoint } : {}), reportedDistanceMeters, ...(sourceUrl ? { sourceUrl } : {}),
    creatorName: text(input.creatorName, "공개 닉네임", 80), rightsBasis, rightsDetails,
    allowRedistribution: true, inGameConfirmed: true, lastCheckedAt: date, geometryType,
    ...(points ? { points } : {}), notes: text(input.notes, "설명", 1000, true, true),
    ...(input.website !== undefined ? { website: text(input.website, "website", 200, true) } : {}),
    ...metadata,
  };
}
const xml = (value: string): string => value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff\ud800-\udfff]/gu, "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!);
function decimal(value: number): string {
  const raw = String(Object.is(value, -0) ? 0 : value);
  if (!/[eE]/.test(raw)) return raw;
  const [mantissa, exponent] = raw.toLowerCase().split("e"), sign = mantissa.startsWith("-") ? "-" : "", unsigned = mantissa.replace(/^-/, "");
  const dot = unsigned.indexOf("."), digits = unsigned.replace(".", ""), position = (dot < 0 ? unsigned.length : dot) + Number(exponent);
  return sign + (position <= 0 ? `0.${"0".repeat(-position)}${digits}` : position >= digits.length ? digits + "0".repeat(position - digits.length) : `${digits.slice(0, position)}.${digits.slice(position)}`);
}
/** Published, individually reviewed geometry only; no endpoint interpolation. */
export function communityRouteGpx(route: CommunityRouteDetail): string {
  if (!route.gpxAvailable || !route.points || route.geometryType === "none") return invalid("geometry_unavailable", "다운로드할 전체 경로가 없습니다.");
  const checked = validateCommunityGeometry(route.points, route.reportedDistanceMeters, route.startPoint, route.endPoint);
  const metadata = validateCommunityRouteMetadata(route, route.startPoint, route.endPoint);
  const metadataXml = `${metadata.reversible !== undefined ? `<pokedoko:reversible>${metadata.reversible}</pokedoko:reversible>` : ""}${metadata.estimatedMinutes !== undefined ? `<pokedoko:estimatedMinutes>${metadata.estimatedMinutes}</pokedoko:estimatedMinutes>` : ""}${metadata.isLoop !== undefined ? `<pokedoko:isLoop>${metadata.isLoop}</pokedoko:isLoop>` : ""}`;
  const description = `${communityGeometryLabel(route.geometryType)}; ${route.geometryType === "original" ? "커뮤니티 제공·운영자 검토 자료이며 공식 게임 내보내기를 보증하지 않음" : "게임 원본 경로와 동일함을 보장하지 않음"}; 공개 제작자: ${route.creatorName}; 이용 근거: ${route.rightsDetails}; 게임 확인일: ${route.lastCheckedAt}`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="pokedoko" xmlns="http://www.topografix.com/GPX/1/1" xmlns:pokedoko="urn:pokedoko:routes:1"><metadata><name>${xml(route.name)}</name><desc>${xml(description)}</desc>${route.sourceUrl ? `<link href="${xml(route.sourceUrl)}"><text>출처와 이용 허락</text></link>` : ""}<extensions><pokedoko:geometryType>${route.geometryType}</pokedoko:geometryType><pokedoko:verificationStatus>${route.verificationStatus}</pokedoko:verificationStatus>${metadataXml}</extensions></metadata><trk><name>${xml(route.name)}</name><desc>${xml(description)}</desc><trkseg>${checked.points.map(p => `<trkpt lat="${decimal(p.lat)}" lon="${decimal(p.lon === 180 ? -180 : p.lon)}"></trkpt>`).join("")}</trkseg></trk></gpx>\n`;
}
export function communityGpxFilename(route: Pick<CommunityRouteSummary, "cityId" | "name" | "geometryType">): string {
  const name = route.name.normalize("NFC").replace(/[^\p{L}\p{N}._-]+/gu, "_").replace(/^\.+/, "").slice(0, 90) || "route";
  return `${route.cityId}_route_${name}${route.geometryType === "original" ? "" : `_${route.geometryType}`}.gpx`;
}
