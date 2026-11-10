import { CITIES } from "./cities";
import { TRADE_MAX_BODY_BYTES, TradeValidationError, validateTradeSubmission, validTradeOwnerKey, type TradePostDetail, type TradePostSummary } from "./trades";

export type TradeDatabase = Pick<D1Database, "prepare" | "batch">;
type Row = Record<string, string | number | null>;
const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const PUBLIC = "status = 'approved' AND published_at IS NOT NULL AND reviewed_at IS NOT NULL AND contact_public_consent = 1 AND expires_at > ?";
const SUMMARY = "id,trainer_name,city_id,mode,offer_species_id,offer_shiny,offer_form,want_species_id,want_shiny,want_form,notes,status,created_at,expires_at";
const json = (data: unknown, status = 200, extra: Record<string, string> = {}) => Response.json(data, { status, headers: { ...HEADERS, ...extra } });
const error = (status: number, code: string, message: string, extra: Record<string, string> = {}) => json({ ok: false, error: code, message }, status, extra);
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
class BadRequest extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}
async function bodyJson(request: Request): Promise<unknown> {
  if (request.method !== "POST") throw new BadRequest(405, "method_not_allowed", "지원하지 않는 요청입니다.");
  if (request.headers.get("Origin") !== new URL(request.url).origin || request.headers.get("Sec-Fetch-Site") === "cross-site") throw new BadRequest(403, "same_origin_required", "사이트의 모집 양식을 이용해 주세요.");
  if (request.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") throw new BadRequest(415, "json_required", "JSON 요청이 필요합니다.");
  const length = request.headers.get("Content-Length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > TRADE_MAX_BODY_BYTES)) throw new BadRequest(413, "payload_too_large", "모집 글이 너무 큽니다.");
  if (!request.body) throw new BadRequest(400, "invalid_json", "요청 내용을 읽지 못했습니다.");
  const reader = request.body.getReader(); let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  try {
    const reading = (async () => {
      let size = 0; const chunks: Uint8Array[] = [];
      while (true) {
        const part = await reader.read(); if (part.done) break;
        size += part.value.byteLength;
        if (size > TRADE_MAX_BODY_BYTES) throw new BadRequest(413, "payload_too_large", "모집 글이 너무 큽니다.");
        chunks.push(part.value);
      }
      const bytes = new Uint8Array(size); let at = 0;
      for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.byteLength; }
      try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown; }
      catch { throw new BadRequest(400, "invalid_json", "요청 내용을 읽지 못했습니다."); }
    })();
    return await Promise.race([reading, new Promise<never>((_, reject) => { timer = setTimeout(() => { cancel(); reject(new BadRequest(408, "request_timeout", "요청 시간이 지났습니다. 다시 시도해 주세요.")); }, 2500); })]);
  } catch (cause) {
    cancel(); if (cause instanceof BadRequest) throw cause;
    throw new BadRequest(400, "invalid_json", "요청 내용을 읽지 못했습니다.");
  } finally { if (timer !== undefined) clearTimeout(timer); }
}
async function hash(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
function failure(cause?: unknown): Response {
  if (cause instanceof BadRequest) return error(cause.status, cause.code, cause.message);
  if (cause instanceof TradeValidationError) return error(400, cause.code, cause.message);
  // Do not echo contacts, management capabilities, SQL parameters or DB diagnostics.
  return error(503, "storage_unavailable", "교환 모집 저장소에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.");
}
function summary(row: Row, seconds: number): TradePostSummary {
  const stored = String(row.status) as TradePostSummary["status"];
  return {
    id: String(row.id), cityId: String(row.city_id), mode: row.mode as "local" | "remote", trainerName: String(row.trainer_name),
    offer: { speciesId: Number(row.offer_species_id), shiny: row.offer_shiny === 1, form: String(row.offer_form) },
    want: { speciesId: Number(row.want_species_id), shiny: row.want_shiny === 1, form: String(row.want_form) },
    notes: String(row.notes), status: (stored === "pending" || stored === "approved") && Number(row.expires_at) <= seconds ? "expired" : stored,
    createdAt: new Date(Number(row.created_at) * 1000).toISOString(), expiresAt: new Date(Number(row.expires_at) * 1000).toISOString(),
  };
}
function detail(row: Row, seconds: number): TradePostDetail {
  return { ...summary(row, seconds), contactKind: row.contact_kind as TradePostDetail["contactKind"], contactValue: String(row.contact_value) };
}
export async function handleTradesGet(request: Request, db?: TradeDatabase, now: () => Date = () => new Date()): Promise<Response> {
  try {
    const query = new URL(request.url).searchParams, city = query.get("city") ?? "all", mode = query.get("mode") ?? "all", pageText = query.get("page") ?? "1", species = query.get("speciesId");
    if (city !== "all" && !CITIES.some(item => item.id === city) || !["all", "local", "remote"].includes(mode) || !/^\d{1,3}$/.test(pageText) || Number(pageText) < 1 || Number(pageText) > 500 || species !== null && (!/^\d{1,4}$/.test(species) || Number(species) < 1 || Number(species) > 2000)) return error(400, "invalid_query", "지역·교환 방식·포켓몬 검색을 확인해 주세요.");
    if (!db) return failure();
    const seconds = Math.floor(now().getTime() / 1000), values: (string | number)[] = [seconds];
    let where = PUBLIC;
    if (city !== "all") { where += " AND city_id = ?"; values.push(city); }
    if (mode !== "all") { where += " AND mode = ?"; values.push(mode); }
    if (species !== null) { where += " AND (offer_species_id = ? OR want_species_id = ?)"; values.push(Number(species), Number(species)); }
    const page = Number(pageText), offset = (page - 1) * 20;
    const [rows, count] = await Promise.all([
      db.prepare(`SELECT ${SUMMARY} FROM trade_posts WHERE ${where} ORDER BY created_at DESC,id DESC LIMIT 20 OFFSET ?`).bind(...values, offset).all<Row>(),
      db.prepare(`SELECT COUNT(*) AS total FROM trade_posts WHERE ${where}`).bind(...values).first<{ total: number }>(),
    ]);
    if (!rows.success) return failure();
    const total = count?.total ?? 0;
    return json({ ok: true, posts: rows.results.map(row => summary(row, seconds)), total, page, hasMore: offset + rows.results.length < total && page < 500 });
  } catch (cause) { return failure(cause); }
}
export async function handleTradeGet(id: string, db?: TradeDatabase, now: () => Date = () => new Date()): Promise<Response> {
  try {
    if (!UUID.test(id)) return error(404, "post_not_found", "공개된 모집 글을 찾지 못했습니다.");
    if (!db) return failure();
    const seconds = Math.floor(now().getTime() / 1000);
    const row = await db.prepare(`SELECT ${SUMMARY},contact_kind,contact_value FROM trade_posts WHERE ${PUBLIC} AND id = ?`).bind(seconds, id).first<Row>();
    return row ? json({ ok: true, post: detail(row, seconds) }, 200, { "X-Robots-Tag": "noindex" }) : error(404, "post_not_found", "모집 중인 공개 글을 찾지 못했습니다.");
  } catch (cause) { return failure(cause); }
}
export async function handleTradeSubmission(request: Request, db?: TradeDatabase, now: () => Date = () => new Date()): Promise<Response> {
  try {
    const body = await bodyJson(request);
    if (object(body) && typeof body.website === "string" && body.website.trim()) return json({ ok: true, status: "pending" }, 202);
    const value = validateTradeSubmission(body);
    if (!db) return failure();
    const ownerHash = await hash(`pokedoko-trade-owner-v1:${value.ownerKey}`);
    const existing = await db.prepare("SELECT id,status,expires_at FROM trade_posts WHERE owner_key_hash = ?").bind(ownerHash).first<Row>();
    if (existing) return json({ ok: true, id: existing.id, status: existing.status, expiresAt: new Date(Number(existing.expires_at) * 1000).toISOString(), duplicate: true }, 201);
    const seconds = Math.floor(now().getTime() / 1000), hour = Math.floor(seconds / 3600) * 3600, day = Math.floor(seconds / 86400) * 86400;
    const visitorHash = await hash(`pokedoko-trade-visitor-v1:${value.visitorId}`), id = crypto.randomUUID(), expires = seconds + value.expiresInDays * 86400;
    const inserted = await db.prepare(`INSERT INTO trade_posts
      (id,owner_key_hash,visitor_hash,trainer_name,city_id,mode,offer_species_id,offer_shiny,offer_form,want_species_id,want_shiny,want_form,contact_kind,contact_value,contact_public_consent,notes,status,created_at,expires_at,hour_bucket,day_bucket)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,'pending',?,?,?,?) ON CONFLICT(owner_key_hash) DO NOTHING RETURNING id`)
      .bind(id, ownerHash, visitorHash, value.trainerName, value.cityId, value.mode, value.offer.speciesId, Number(value.offer.shiny), value.offer.form, value.want.speciesId, Number(value.want.shiny), value.want.form,
        value.contactKind, value.contactValue, value.notes, seconds, expires, hour, day).first<{ id: string }>();
    if (inserted) return json({ ok: true, id, status: "pending", expiresAt: new Date(expires * 1000).toISOString() }, 201);
    const retry = await db.prepare("SELECT id,status,expires_at FROM trade_posts WHERE owner_key_hash = ?").bind(ownerHash).first<Row>();
    if (retry) return json({ ok: true, id: retry.id, status: retry.status, expiresAt: new Date(Number(retry.expires_at) * 1000).toISOString(), duplicate: true }, 201);
    return error(429, "rate_limited", "접수 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.", { "Retry-After": String(hour + 3600 - seconds) });
  } catch (cause) { return failure(cause); }
}
export async function handleTradeManage(id: string, request: Request, db?: TradeDatabase, now: () => Date = () => new Date()): Promise<Response> {
  try {
    const body = await bodyJson(request);
    if (!object(body) || Object.keys(body).some(key => !["ownerKey", "action"].includes(key)) || !validTradeOwnerKey(body.ownerKey) || typeof body.action !== "string" || !["status", "close", "delete"].includes(body.action)) return error(400, "invalid_payload", "글 관리 요청을 확인해 주세요.");
    if (!UUID.test(id)) return error(404, "post_not_found", "관리할 글을 찾지 못했습니다.");
    if (!db) return failure();
    const ownerHash = await hash(`pokedoko-trade-owner-v1:${body.ownerKey.toLowerCase()}`), seconds = Math.floor(now().getTime() / 1000);
    if (body.action === "delete") {
      const removed = await db.prepare("DELETE FROM trade_posts WHERE id = ? AND owner_key_hash = ? RETURNING id").bind(id, ownerHash).first<{ id: string }>();
      return removed ? json({ ok: true, deleted: true }) : error(404, "post_not_found", "이 기기에서 관리할 수 있는 글을 찾지 못했습니다.");
    }
    if (body.action === "close") await db.prepare("UPDATE trade_posts SET status = 'closed' WHERE id = ? AND owner_key_hash = ? AND status IN ('pending','approved')").bind(id, ownerHash).run();
    const row = await db.prepare(`SELECT ${SUMMARY},contact_kind,contact_value FROM trade_posts WHERE id = ? AND owner_key_hash = ?`).bind(id, ownerHash).first<Row>();
    return row ? json({ ok: true, post: detail(row, seconds) }, 200, { "X-Robots-Tag": "noindex" }) : error(404, "post_not_found", "이 기기에서 관리할 수 있는 글을 찾지 못했습니다.");
  } catch (cause) { return failure(cause); }
}
/** A durable client receipt can recover a committed post even if its first response was lost. */
export async function handleTradeRecovery(request: Request, db?: TradeDatabase, now: () => Date = () => new Date()): Promise<Response> {
  try {
    const body = await bodyJson(request);
    if (!object(body) || Object.keys(body).some(key => key !== "ownerKey") || !validTradeOwnerKey(body.ownerKey)) return error(400, "invalid_payload", "작성 기록을 확인해 주세요.");
    if (!db) return failure();
    const ownerHash = await hash(`pokedoko-trade-owner-v1:${body.ownerKey.toLowerCase()}`), seconds = Math.floor(now().getTime() / 1000);
    const row = await db.prepare(`SELECT ${SUMMARY},contact_kind,contact_value FROM trade_posts WHERE owner_key_hash = ?`).bind(ownerHash).first<Row>();
    return row ? json({ ok: true, post: detail(row, seconds) }, 200, { "X-Robots-Tag": "noindex" }) : error(404, "post_not_found", "이 작성 기록으로 접수된 글을 아직 확인하지 못했습니다.");
  } catch (cause) { return failure(cause); }
}
export function tradeMethodNotAllowed(): Response { return error(405, "method_not_allowed", "지원하지 않는 요청입니다."); }
