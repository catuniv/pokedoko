import { CITIES } from "./cities";
import { COMMUNITY_ROUTE_MAX_BYTES, COMMUNITY_ROUTE_REVIEW_POLICY, CommunityRouteValidationError, communityGpxFilename, communityRouteGpx, validateCommunityGeometry, validateCommunityRouteMetadata, validateCommunitySubmission, type CommunityRouteDetail, type CommunityRoutePlace, type CommunityRouteSummary } from "./community-routes";

export type CommunityRouteDatabase = Pick<D1Database, "prepare" | "batch">;
type Row = Record<string, string | number | null>;
const READ_HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const COLUMNS = `id, name, city_id, start_name, end_name, start_lat, start_lon, end_lat, end_lon,
  reported_distance_m, computed_distance_m, geometry_type, geometry_validation, point_count,
  source_url, creator_name, last_checked_at, published_at, reversible, estimated_minutes, is_loop`;
const PUBLISHED = "status = 'approved' AND rights_reviewed = 1 AND route_reviewed = 1 AND published_at IS NOT NULL";
const response = (value: unknown, status = 200, extra: Record<string, string> = {}) => Response.json(value, { status, headers: { ...READ_HEADERS, ...extra } });
const error = (status: number, code: string, message: string, extra: Record<string, string> = {}) => response({ ok: false, error: code, message }, status, extra);
class RequestError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}
async function readBody(request: Request): Promise<unknown> {
  if (request.method !== "POST") throw new RequestError(405, "method_not_allowed", "지원하지 않는 요청입니다.");
  if (request.headers.get("Origin") !== new URL(request.url).origin || request.headers.get("Sec-Fetch-Site") === "cross-site") throw new RequestError(403, "same_origin_required", "사이트의 제보 양식을 이용해 주세요.");
  if (request.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") throw new RequestError(415, "json_required", "JSON 요청이 필요합니다.");
  const length = request.headers.get("Content-Length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > COMMUNITY_ROUTE_MAX_BYTES)) throw new RequestError(413, "payload_too_large", "제보 데이터가 너무 큽니다. 좌표 2,000개 이하 파일을 이용해 주세요.");
  if (!request.body) throw new RequestError(400, "invalid_json", "제보 내용을 읽지 못했습니다.");
  const reader = request.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const reading = (async () => {
      let size = 0; const chunks: Uint8Array[] = [];
      while (true) {
        const part = await reader.read(); if (part.done) break;
        size += part.value.byteLength;
        if (size > COMMUNITY_ROUTE_MAX_BYTES) throw new RequestError(413, "payload_too_large", "제보 데이터가 너무 큽니다.");
        chunks.push(part.value);
      }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown; }
      catch { throw new RequestError(400, "invalid_json", "제보 내용을 읽지 못했습니다."); }
    })();
    return await Promise.race([reading, new Promise<never>((_, reject) => { timer = setTimeout(() => { cancel(); reject(new RequestError(408, "request_timeout", "요청 시간이 지났습니다. 다시 시도해 주세요.")); }, 2500); })]);
  } catch (cause) {
    cancel(); if (cause instanceof RequestError) throw cause;
    throw new RequestError(400, "invalid_json", "제보 내용을 읽지 못했습니다.");
  } finally { if (timer !== undefined) clearTimeout(timer); }
}
async function hash(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
function failure(cause: unknown): Response {
  if (cause instanceof RequestError) return error(cause.status, cause.code, cause.message);
  if (cause instanceof CommunityRouteValidationError) return error(400, cause.code, cause.message);
  return error(503, "storage_unavailable", "루트 저장소에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.");
}
function summary(row: Row): CommunityRouteSummary {
  const geometryType = row.geometry_type as CommunityRouteSummary["geometryType"];
  return {
    id: String(row.id), name: String(row.name), cityId: String(row.city_id), startName: String(row.start_name), endName: String(row.end_name),
    startPoint: { lat: Number(row.start_lat), lon: Number(row.start_lon) },
    ...(row.end_lat !== null && row.end_lon !== null ? { endPoint: { lat: Number(row.end_lat), lon: Number(row.end_lon) } } : {}),
    reportedDistanceMeters: Number(row.reported_distance_m), ...(row.computed_distance_m !== null ? { computedDistanceMeters: Number(row.computed_distance_m) } : {}),
    geometryType, verificationStatus: geometryType === "original" ? "reviewed" : "needs_verification",
    gpxAvailable: geometryType !== "none" && row.geometry_validation === "passed" && Number(row.point_count) >= 2,
    pointCount: Number(row.point_count), creatorName: String(row.creator_name), ...(row.source_url ? { sourceUrl: String(row.source_url) } : {}),
    lastCheckedAt: String(row.last_checked_at), publishedAt: new Date(Number(row.published_at) * 1000).toISOString(),
    reversible: row.reversible === 1 ? true : row.reversible === 0 ? false : null,
    estimatedMinutes: typeof row.estimated_minutes === "number" && Number.isSafeInteger(row.estimated_minutes) && row.estimated_minutes >= 1 && row.estimated_minutes <= 1440 ? row.estimated_minutes : null,
    isLoop: row.is_loop === 1 ? true : row.is_loop === 0 ? false : null,
  };
}
export async function handleCommunityRoutesGet(request: Request, db?: CommunityRouteDatabase): Promise<Response> {
  try {
    const params = new URL(request.url).searchParams, city = params.get("city") ?? "seoul", pageText = params.get("page") ?? "1";
    if (!CITIES.some(item => item.id === city) || !/^\d{1,3}$/.test(pageText) || Number(pageText) < 1 || Number(pageText) > 100) return error(400, "invalid_query", "도시와 페이지를 확인해 주세요.");
    if (!db) return failure(undefined);
    const page = Number(pageText), offset = (page - 1) * 20;
    const [result, count] = await Promise.all([
      db.prepare(`SELECT ${COLUMNS} FROM community_routes WHERE ${PUBLISHED} AND city_id = ? ORDER BY published_at DESC, id DESC LIMIT 20 OFFSET ?`).bind(city, offset).all<Row>(),
      db.prepare(`SELECT COUNT(*) AS total FROM community_routes WHERE ${PUBLISHED} AND city_id = ?`).bind(city).first<{ total: number }>(),
    ]);
    if (!result.success) return failure(undefined);
    const total = count?.total ?? 0;
    return response({ ok: true, routes: result.results.map(summary), total, page, hasMore: offset + result.results.length < total });
  } catch (cause) { return failure(cause); }
}
/** These are contributed endpoint locations, never a mirrored game POI database. */
export async function handleCommunityRoutePlacesGet(request: Request, db?: CommunityRouteDatabase): Promise<Response> {
  try {
    const city = new URL(request.url).searchParams.get("city") ?? "seoul";
    if (!CITIES.some(item => item.id === city)) return error(400, "invalid_query", "목록에서 도시를 선택해 주세요.");
    if (!db) return failure(undefined);
    const [result, count] = await Promise.all([
      db.prepare(`SELECT id, start_name, end_name, start_lat, start_lon, end_lat, end_lon FROM community_routes WHERE ${PUBLISHED} AND city_id = ? ORDER BY published_at DESC, id DESC LIMIT 200`).bind(city).all<Row>(),
      db.prepare(`SELECT COUNT(*) AS total FROM community_routes WHERE ${PUBLISHED} AND city_id = ?`).bind(city).first<{ total: number }>(),
    ]);
    if (!result.success) return failure(undefined);
    const places: CommunityRoutePlace[] = [], seen = new Set<string>();
    const append = (row: Row, side: "start" | "end") => {
      const name = row[`${side}_name`], latitude = row[`${side}_lat`], longitude = row[`${side}_lon`];
      if (typeof name !== "string" || !name.trim() || typeof latitude !== "number" || typeof longitude !== "number" || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return;
      const key = JSON.stringify([name, latitude, longitude]);
      if (seen.has(key)) return;
      seen.add(key);
      places.push({ id: `${row.id}:${side}`, name, point: { lat: latitude, lon: longitude }, sourceRouteId: String(row.id) });
    };
    for (const row of result.results) { append(row, "start"); append(row, "end"); }
    return response({ ok: true, places: places.slice(0, 300), truncated: (count?.total ?? 0) > result.results.length || places.length > 300 });
  } catch (cause) { return failure(cause); }
}
async function findRoute(id: string, db?: CommunityRouteDatabase): Promise<CommunityRouteDetail | null> {
  if (!UUID.test(id)) return null;
  if (!db) throw new Error("Missing DB");
  const row = await db.prepare(`SELECT ${COLUMNS}, points_json, rights_basis, rights_details, notes FROM community_routes WHERE ${PUBLISHED} AND id = ?`).bind(id).first<Row>();
  if (!row) return null;
  const base = summary(row);
  validateCommunityRouteMetadata(base, base.startPoint, base.endPoint);
  const route: CommunityRouteDetail = { ...base, rightsBasis: row.rights_basis as CommunityRouteDetail["rightsBasis"], rightsDetails: String(row.rights_details), notes: String(row.notes) };
  if (base.gpxAvailable) {
    // Revalidate stored geometry before either a map or GPX can use it.
    const validated = validateCommunityGeometry(JSON.parse(String(row.points_json)), base.reportedDistanceMeters, base.startPoint, base.endPoint);
    route.points = validated.points;
    route.computedDistanceMeters = validated.computedDistanceMeters;
    route.pointCount = validated.pointCount;
  }
  return route;
}
export async function handleCommunityRouteGet(id: string, db?: CommunityRouteDatabase): Promise<Response> {
  try {
    const route = await findRoute(id, db);
    return route ? response({ ok: true, route }) : error(404, "route_not_found", "공개된 루트를 찾지 못했습니다.");
  } catch { return failure(undefined); }
}
export async function handleCommunityRouteGpx(id: string, db?: CommunityRouteDatabase): Promise<Response> {
  try {
    const route = await findRoute(id, db);
    if (!route) return error(404, "route_not_found", "공개된 루트를 찾지 못했습니다.");
    if (!route.gpxAvailable) return error(404, "geometry_unavailable", "이 루트는 전체 경로가 아직 확보되지 않았습니다.");
    const gpx = communityRouteGpx(route), filename = communityGpxFilename(route);
    return new Response(gpx, { headers: { ...READ_HEADERS, "Content-Type": "application/gpx+xml; charset=utf-8", "Content-Disposition": `attachment; filename="pokedoko-route.gpx"; filename*=UTF-8''${encodeURIComponent(filename)}`, "X-Robots-Tag": "noindex" } });
  } catch { return failure(undefined); }
}
export async function handleCommunityRouteSubmission(request: Request, db?: CommunityRouteDatabase, now: () => Date = () => new Date()): Promise<Response> {
  try {
    const body = await readBody(request);
    if (body && typeof body === "object" && !Array.isArray(body) && "website" in body && typeof body.website === "string" && body.website.trim()) return response({ ok: true, status: "pending" }, 202);
    const date = now(), route = validateCommunitySubmission(body, date);
    if (!db) return failure(undefined);
    const { visitorId, website: _website, ...record } = route;
    const visitorHash = await hash(`pokedoko-route-submitter-v1:${visitorId}`), fingerprint = await hash(JSON.stringify(record));
    const existing = await db.prepare("SELECT id FROM community_routes WHERE fingerprint = ? AND visitor_hash = ? AND status = 'pending'").bind(fingerprint, visitorHash).first<{ id: string }>();
    if (existing) return response({ ok: true, id: existing.id, status: "pending", duplicate: true }, 201);
    const seconds = Math.floor(date.getTime() / 1000), hour = Math.floor(seconds / 3600) * 3600, day = Math.floor(seconds / 86400) * 86400;
    const checked = route.points ? validateCommunityGeometry(route.points, route.reportedDistanceMeters, route.startPoint, route.endPoint) : undefined;
    const id = crypto.randomUUID();
    const inserted = await db.prepare(`INSERT INTO community_routes
      (id, fingerprint, visitor_hash, name, city_id, start_name, end_name, start_lat, start_lon, end_lat, end_lon,
       reported_distance_m, computed_distance_m, geometry_type, geometry_validation, points_json, point_count,
       source_url, creator_name, rights_basis, rights_details, permission_confirmed, in_game_confirmed,
       last_checked_at, notes, status, hour_bucket, day_bucket, created_at, submission_policy, reversible, estimated_minutes, is_loop)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(fingerprint) DO NOTHING RETURNING id`)
      .bind(id, fingerprint, visitorHash, route.name, route.cityId, route.startName, route.endName, route.startPoint.lat, route.startPoint.lon, route.endPoint?.lat ?? null, route.endPoint?.lon ?? null,
        route.reportedDistanceMeters, checked?.computedDistanceMeters ?? null, route.geometryType, checked ? "passed" : "missing", checked ? JSON.stringify(checked.points) : null, checked?.pointCount ?? 0,
        route.sourceUrl ?? "", route.creatorName, route.rightsBasis, route.rightsDetails, route.lastCheckedAt, route.notes, hour, day, seconds, COMMUNITY_ROUTE_REVIEW_POLICY,
        route.reversible === undefined ? null : Number(route.reversible), route.estimatedMinutes ?? null, route.isLoop === undefined ? null : Number(route.isLoop)).first<{ id: string }>();
    if (inserted) return response({ ok: true, id, status: "pending" }, 201);
    // Never disclose another submitter's pending ID, its existence, or moderation status.
    const duplicate = await db.prepare("SELECT id FROM community_routes WHERE fingerprint = ? AND visitor_hash = ? AND status = 'pending'").bind(fingerprint, visitorHash).first<{ id: string }>();
    if (duplicate) return response({ ok: true, id: duplicate.id, status: "pending", duplicate: true }, 201);
    return error(429, "rate_limited", "접수 한도에 도달했거나 같은 자료가 이미 접수되어 있습니다. 잠시 후 다시 시도해 주세요.", { "Retry-After": String(hour + 3600 - seconds) });
  } catch (cause) { return failure(cause); }
}
export function communityRouteMethodNotAllowed(): Response {
  return error(405, "method_not_allowed", "지원하지 않는 요청입니다.", { Allow: "GET, POST" });
}
