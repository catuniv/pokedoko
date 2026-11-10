import { CITIES } from "./cities";

type GrowthDatabase = Pick<D1Database, "prepare" | "batch">;
type Obj = Record<string, unknown>;
const VIEWS = new Set(["live", "raids", "calendar", "pokemon", "city", "event"]);
const EVENTS = new Set(["page_view", "coordinate_copy", "share"]);
const SOURCES = new Set(["direct", "dc", "inven", "naver", "kakao", "discord", "youtube", "instagram", "other"]);
const CATEGORIES = new Set(["bug", "suggestion", "data"]);
const CITY_IDS = new Set(CITIES.map(city => city.id));
const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const DAY = 86_400_000;
const HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };

class InvalidRequest extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}
const json = (value: unknown, status: number, headers: Record<string, string> = {}) => Response.json(value, { status, headers: { ...HEADERS, ...headers } });
const error = (status: number, code: string, headers?: Record<string, string>) => json({ ok: false, error: code }, status, headers);
const kstDay = (date: Date) => new Date(date.getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
const object = (value: unknown): value is Obj => !!value && typeof value === "object" && !Array.isArray(value);
const known = (value: unknown, allowed: Set<string>): value is string => typeof value === "string" && allowed.has(value);
const fields = (value: Obj, allowed: string[]) => Object.keys(value).every(key => allowed.includes(key));
const validCity = (value: unknown) => value === undefined || known(value, CITY_IDS);
const validVisitor = (value: unknown): value is string => typeof value === "string" && UUID.test(value);

async function hash(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

/** Size bounds apply to actual streamed bytes, not a caller's Content-Length. */
async function readJson(request: Request, maxBytes: number): Promise<unknown> {
  if (request.method !== "POST") throw new InvalidRequest(405, "method_not_allowed");
  const origin = request.headers.get("Origin");
  if (!origin || origin !== new URL(request.url).origin || request.headers.get("Sec-Fetch-Site") === "cross-site") throw new InvalidRequest(403, "same_origin_required");
  if (request.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") throw new InvalidRequest(415, "json_required");
  const declared = request.headers.get("Content-Length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) throw new InvalidRequest(413, "payload_too_large");
  if (!request.body) throw new InvalidRequest(400, "invalid_json");
  const reader = request.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const reading = (async () => {
      const chunks: Uint8Array[] = []; let length = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > maxBytes) throw new InvalidRequest(413, "payload_too_large");
        chunks.push(value);
      }
      const bytes = new Uint8Array(length); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown; }
      catch { throw new InvalidRequest(400, "invalid_json"); }
    })();
    return await Promise.race([reading, new Promise<never>((_, reject) => {
      timer = setTimeout(() => { cancel(); reject(new InvalidRequest(408, "request_timeout")); }, 2000);
    })]);
  } catch (cause) {
    cancel();
    if (cause instanceof InvalidRequest) throw cause;
    throw new InvalidRequest(400, "invalid_json");
  } finally { if (timer !== undefined) clearTimeout(timer); }
}

function failure(cause: unknown): Response {
  if (cause instanceof InvalidRequest) return error(cause.status, cause.code);
  // Never echo private feedback, SQL parameters, visitor IDs or DB error text.
  return error(503, "storage_unavailable");
}

export function growthMethodNotAllowed(): Response {
  return error(405, "method_not_allowed", { Allow: "POST" });
}

export async function handleUsageRequest(request: Request, db?: GrowthDatabase, now: () => Date = () => new Date()): Promise<Response> {
  try {
    const body = await readJson(request, 1024);
    if (!object(body) || !fields(body, ["visitorId", "event", "view", "city", "source"]) || !validVisitor(body.visitorId) || !known(body.event, EVENTS) || !known(body.view, VIEWS) || !validCity(body.city) || (body.source !== undefined && !known(body.source, SOURCES))) throw new InvalidRequest(400, "invalid_payload");
    if (request.headers.get("DNT") === "1" || request.headers.get("Sec-GPC") === "1") return json({ ok: true, skipped: true }, 202);
    if (!db) return error(503, "storage_unavailable");
    const date = now(), seconds = Math.floor(date.getTime() / 1000), minute = Math.floor(seconds / 60) * 60;
    const visitorHash = await hash(`pokedoko-growth-v1:${body.visitorId.toLowerCase()}`);
    const city = body.city ?? "", source = body.source ?? "direct";
    // Without an event UUID, identical actions in five seconds are intentionally
    // approximate rather than claiming exact retry/intent discrimination.
    const id = await hash(JSON.stringify([visitorHash, body.event, body.view, city, source, Math.floor(seconds / 5)]));
    const inserted = await db.prepare(`INSERT INTO growth_usage_events
      (id, visitor_hash, day, event, view, city, source, minute_bucket, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING RETURNING id`)
      .bind(id, visitorHash, kstDay(date), body.event, body.view, city, source, minute, seconds).first<{ id: string }>();
    if (inserted) return json({ ok: true }, 202);
    const existing = await db.prepare("SELECT id FROM growth_usage_events WHERE id = ?").bind(id).first<{ id: string }>();
    if (existing) return json({ ok: true, duplicate: true }, 202);
    return error(429, "rate_limited", { "Retry-After": String(minute + 60 - seconds) });
  } catch (cause) { return failure(cause); }
}

export async function handleFeedbackRequest(request: Request, db?: GrowthDatabase, now: () => Date = () => new Date()): Promise<Response> {
  try {
    const body = await readJson(request, 12 * 1024);
    if (!object(body) || !fields(body, ["visitorId", "category", "message", "page", "city", "website"]) || !validVisitor(body.visitorId) || !known(body.category, CATEGORIES) || !known(body.page, VIEWS) || !validCity(body.city) || typeof body.message !== "string" || (body.website !== undefined && (typeof body.website !== "string" || body.website.length > 200))) throw new InvalidRequest(400, "invalid_payload");
    const message = body.message.trim();
    const length = Array.from(message).length;
    if (length < 20 || length > 2000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(message)) throw new InvalidRequest(400, "invalid_payload");
    // Silent honeypot discard has no database write and exposes no moderation signal.
    if (typeof body.website === "string" && body.website.trim()) return json({ ok: true }, 202);
    if (!db) return error(503, "storage_unavailable");
    const seconds = Math.floor(now().getTime() / 1000), hour = Math.floor(seconds / 3600) * 3600;
    const visitorHash = await hash(`pokedoko-growth-v1:${body.visitorId.toLowerCase()}`);
    const inserted = await db.prepare(`INSERT INTO growth_feedback
      (id, visitor_hash, category, message, page, city, hour_bucket, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`)
      .bind(crypto.randomUUID(), visitorHash, body.category, message, body.page, body.city ?? "", hour, seconds).first<{ id: string }>();
    return inserted ? json({ ok: true }, 201) : error(429, "rate_limited", { "Retry-After": String(hour + 3600 - seconds) });
  } catch (cause) { return failure(cause); }
}

/** Schema lives exclusively in Drizzle migrations; scheduled maintenance deletes bounded rows only. */
export async function pruneGrowthData(db?: GrowthDatabase, now = new Date(), limit = 5000): Promise<{ enabled: boolean; deleted: Record<string, number> }> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 5000) throw new RangeError("Retention batch must be between 1 and 5000 rows");
  if (!db) return { enabled: false, deleted: {} };
  const seconds = Math.floor(now.getTime() / 1000);
  const rules = [
    ["growth_feedback", "created_at < ?", seconds - 30 * 86_400],
    ["growth_usage_events", "created_at < ?", seconds - 86_400],
    ["growth_daily_visitors", "day <= ?", kstDay(new Date(now.getTime() - 30 * DAY))],
    ["growth_daily_aggregates", "day <= ?", kstDay(new Date(now.getTime() - 90 * DAY))],
    ["growth_rate_limits", "expires_at <= ?", seconds],
    ["community_route_rate_limits", "expires_at <= ?", seconds],
  ] as const;
  const result = await db.batch(rules.map(([table, where, cutoff]) => db.prepare(`DELETE FROM ${table} WHERE rowid IN (SELECT rowid FROM ${table} WHERE ${where} LIMIT ?)`)
    .bind(cutoff, limit)));
  if (result.some(value => !value.success)) throw new Error("Growth retention failed");
  return { enabled: true, deleted: Object.fromEntries(rules.map(([table], index) => [table, result[index].meta.changes ?? 0])) };
}

/** Sites can refresh feeds without a native Cron Trigger. Cleanup remains off the response path. */
export function createGrowthRetentionScheduler(options: { now?: () => Date } = {}): (db: GrowthDatabase | undefined, context: { waitUntil(promise: Promise<unknown>): void }) => boolean {
  const now = options.now ?? (() => new Date());
  const lastAttempt = new WeakMap<GrowthDatabase, number>();
  return (db, context) => {
    if (!db) return false;
    const date = now(), time = date.getTime(), previous = lastAttempt.get(db);
    if (previous !== undefined && time - previous < 3_600_000) return false;
    lastAttempt.set(db, time);
    const work = pruneGrowthData(db, date).then(() => undefined).catch(() => {
      // Feed availability must not depend on SQL availability or migration timing.
      console.warn("[pokedoko] background growth retention failed");
    });
    try { context.waitUntil(work); } catch { /* A cancelled request cannot block its feed response. */ }
    return true;
  };
}
