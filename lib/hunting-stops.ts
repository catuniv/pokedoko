import { CITIES } from "./cities";

export type HuntingStop = { id: string; name: string; lat: number; lon: number };
export type HuntingStopCenter = { lat: number; lon: number; name: string };
export type HuntingStopQuery = {
  cityId: string;
  spotIndex: number | null;
  radiusKm: 1 | 3 | 5 | 10;
  center: HuntingStopCenter;
};
export type HuntingStopResult = {
  status: "ready" | "empty" | "error";
  cityId: string;
  center: HuntingStopCenter;
  radiusKm: number;
  stops: HuntingStop[];
  fetchedAt: string | null;
  checkedAt: string;
  sourceName: string;
  sourceUrl: string;
  limited: boolean;
  message: string;
};
type Position = { lat: number; lon: number };
type CollectorOptions = { fetcher?: typeof fetch; now?: () => Date; timeoutMs?: number };
type Entry = {
  result: HuntingStopResult | null;
  expires: number;
  pending: Promise<HuntingStopResult> | null;
  started: number;
  generation: number;
  controller: AbortController | null;
};
const ORIGIN = "https://pokecoords.iflowgo.com";
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_STOPS = 800;
const MAX_SOURCE_AGE_MS = 600_000;
const CACHE_MS = 300_000;
const ERROR_MS = 30_000;
const LEASE_MS = 5_000;
const RAD = Math.PI / 180;
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const validPosition = (value: Position) => value && Number.isFinite(value.lat) && Number.isFinite(value.lon) && value.lat >= -90 && value.lat <= 90 && value.lon >= -180 && value.lon <= 180;
const distance = (a: Position, b: Position) => {
  const x = Math.sin((b.lat - a.lat) * RAD / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin((b.lon - a.lon) * RAD / 2) ** 2;
  return 12_742.0176 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, x))));
};
const rowOf = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** Queries always resolve to a checked-in city or recommended place, never caller coordinates. */
function resolveQuery(cityId: string, spotIndex: number | null, radiusKm: number): HuntingStopQuery {
  const city = CITIES.find(item => item.id === cityId);
  if (!city || ![1, 3, 5, 10].includes(radiusKm)) throw new RangeError("도시와 반경을 확인해 주세요.");
  if (spotIndex !== null && (!Number.isSafeInteger(spotIndex) || spotIndex < 0 || spotIndex >= city.spots.length)) throw new RangeError("추천 장소를 확인해 주세요.");
  const place = spotIndex === null ? city : city.spots[spotIndex];
  return { cityId, spotIndex, radiusKm: radiusKm as HuntingStopQuery["radiusKm"], center: { lat: place.lat, lon: place.lon, name: place.name } };
}

/** GET /api/gpx/stops?city=tokyo&spot=0&radius=3. Omit spot for the city centre. */
export function parseHuntingStopQuery(value: URL | URLSearchParams): HuntingStopQuery {
  const params = value instanceof URL ? value.searchParams : value;
  for (const key of params.keys()) {
    if (!["city", "spot", "radius"].includes(key) || params.getAll(key).length !== 1) throw new RangeError("지원하지 않는 조회 조건입니다.");
  }
  const city = params.get("city") ?? "";
  const spot = params.get("spot");
  const radius = params.get("radius") ?? "3";
  if (!/^(1|3|5|10)$/.test(radius) || (spot !== null && spot !== "center" && !/^(0|[1-9]\d{0,2})$/.test(spot))) throw new RangeError("조회 조건의 형식을 확인해 주세요.");
  return resolveQuery(city, spot === null || spot === "center" ? null : Number(spot), Number(radius));
}

function instant(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const year = +value.slice(0, 4), month = +value.slice(5, 7), day = +value.slice(8, 10);
  const offset = value.endsWith("Z") ? "+00:00" : value.slice(-6);
  if (year < 2000 || month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate() || +value.slice(11, 13) > 23 || +value.slice(14, 16) > 59 || +value.slice(17, 19) > 59 || +offset.slice(1, 3) > 14 || +offset.slice(4, 6) > 59 || (+offset.slice(1, 3) === 14 && +offset.slice(4, 6) !== 0)) return null;
  const timestamp = Date.parse(value.replace(/\.(\d{3})\d+(?=Z|[+-])/, ".$1"));
  return Number.isFinite(timestamp) ? timestamp : null;
}

function emptyResult(query: HuntingStopQuery, now: Date, message: string): HuntingStopResult {
  return { status: "error", cityId: query.cityId, center: query.center, radiusKm: query.radiusKm, stops: [], fetchedAt: null, checkedAt: now.toISOString(), sourceName: "PoGo Radar · 퀘스트 포켓스톱", sourceUrl: `${ORIGIN}/`, limited: false, message };
}

function normalize(raw: unknown, query: HuntingStopQuery, now: Date): HuntingStopResult {
  const data = rowOf(raw), fetched = instant(data.generated_at);
  const result = emptyResult(query, now, "공급원의 포켓스톱 응답 형식을 확인할 수 없습니다.");
  if (fetched === null || fetched > now.getTime() + 60_000 || !Array.isArray(data.quests) || data.quests.length > MAX_STOPS) return result;
  result.fetchedAt = new Date(fetched).toISOString();
  if (now.getTime() - fetched >= MAX_SOURCE_AGE_MS) { result.message = "공급원 응답 시각이 10분 이상 지났습니다. 다시 조회해 주세요."; return result; }
  result.limited = data.quests.length === MAX_STOPS;
  const valid: HuntingStop[] = [];
  let malformed = 0;
  for (const item of data.quests) {
    const row = rowOf(item);
    const id = typeof row.id === "string" ? row.id.trim() : typeof row.id === "number" && Number.isSafeInteger(row.id) ? String(row.id) : "";
    const lat = row.lat, lon = row.lon;
    const explicitStop = typeof row.pokestop_name === "string" || typeof row.quest_title === "string" || typeof row.quest_type_id === "number";
    if (!id || id.length > 180 || /[\u0000-\u0020\u007f]/.test(id) || typeof lat !== "number" || typeof lon !== "number" || !validPosition({ lat, lon }) || !explicitStop) { malformed++; continue; }
    if (distance(query.center, { lat, lon }) > query.radiusKm + 0.00001) continue;
    const name = (typeof row.pokestop_name === "string" ? row.pokestop_name.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 180) : "") || "이름 미제공 포켓스톱";
    valid.push({ id, name, lat, lon });
  }
  valid.sort((a, b) => compare(a.id, b.id) || a.lat - b.lat || a.lon - b.lon || compare(a.name, b.name));
  const ids = new Set<string>(), coordinates = new Set<string>();
  for (const stop of valid) {
    const key = `${stop.lat.toFixed(6)},${(stop.lon === 180 ? -180 : stop.lon).toFixed(6)}`;
    if (ids.has(stop.id) || coordinates.has(key)) continue;
    ids.add(stop.id); coordinates.add(key); result.stops.push(stop);
  }
  if (data.quests.length && malformed === data.quests.length) return result;
  result.status = result.stops.length ? "ready" : "empty";
  result.message = `퀘스트가 등록된 포켓스톱 표본입니다. 전체 포켓스톱 목록은 아닙니다.${result.limited ? " 최대 800개 조회 상한에 도달했습니다." : ""}${result.status === "empty" ? " 이 범위에서 확인된 자료가 없습니다." : ""}`;
  return result;
}

async function boundedJson(response: Response, signal: AbortSignal): Promise<unknown> {
  if (!response.ok || !response.body || Number(response.headers.get("Content-Length")) > MAX_BYTES) throw new Error("Invalid upstream response");
  const reader = response.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", cancel, { once: true });
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      if (signal.aborted) throw new Error("Timed out");
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BYTES) throw new Error("Body exceeds byte limit");
      chunks.push(value);
    }
    if (signal.aborted) throw new Error("Timed out");
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) { cancel(); throw error; }
  finally { signal.removeEventListener("abort", cancel); }
}

/** Fixed, anonymous public queries. Coordinates are resolved again even for direct helper callers. */
export function createHuntingStopCollector(options: CollectorOptions = {}) {
  const fetcher = options.fetcher ?? fetch, now = options.now ?? (() => new Date());
  const timeout = options.timeoutMs ?? 4_000;
  if (!Number.isFinite(timeout) || timeout <= 0 || timeout > 4_000) throw new RangeError("Invalid request timeout");
  const entries = new Map<string, Entry>();
  return (input: HuntingStopQuery): Promise<HuntingStopResult> => {
    const query = resolveQuery(input.cityId, input.spotIndex, input.radiusKm);
    const key = `${query.cityId}:${query.spotIndex ?? "center"}:${query.radiusKm}`;
    let entry = entries.get(key);
    if (!entry) { entry = { result: null, expires: 0, pending: null, started: 0, generation: 0, controller: null }; entries.set(key, entry); }
    const current = entry;
    const time = now().getTime();
    if (current.pending && time - current.started < LEASE_MS && time >= current.started) return current.pending;
    // An abandoned Worker request must not hold the isolate's shared promise forever.
    if (current.pending) { current.generation++; current.controller?.abort(); current.pending = null; }
    else if (current.result && current.expires > time) return Promise.resolve(current.result);
    const generation = ++current.generation;
    const controller = new AbortController();
    current.controller = controller; current.started = time;
    const work = (async () => {
      const timer = setTimeout(() => controller.abort(), timeout);
      let rejectAbort: (() => void) | undefined;
      const aborted = new Promise<never>((_, reject) => {
        rejectAbort = () => reject(new Error("Source request timed out"));
        controller.signal.addEventListener("abort", rejectAbort, { once: true });
      });
      let result: HuntingStopResult;
      try {
        const request = (async () => {
          const endpoint = `${ORIGIN}/iflowgopokecoords/api/v1/nearby?${new URLSearchParams({ lat: String(query.center.lat), lon: String(query.center.lon), radius_km: String(query.radiusKm), layers: "quests", limit: String(MAX_STOPS) })}`;
          const response = await fetcher(endpoint, { method: "GET", headers: { Accept: "application/json", "User-Agent": "pokedoko-planner/1.0 (+https://pokedoko.catuniv.workers.dev)" }, cache: "no-store", redirect: "manual", signal: controller.signal });
          return normalize(await boundedJson(response, controller.signal), query, now());
        })();
        result = await Promise.race([request, aborted]);
      } catch {
        result = emptyResult(query, now(), controller.signal.aborted ? "포켓스톱 공급원의 응답 시간이 초과되었습니다." : "포켓스톱 자료를 불러오지 못했습니다. 잠시 후 다시 조회해 주세요.");
      } finally {
        clearTimeout(timer);
        if (rejectAbort) controller.signal.removeEventListener("abort", rejectAbort);
      }
      if (current.generation === generation) {
        current.result = result;
        current.expires = result.status === "error" ? now().getTime() + ERROR_MS : Math.min(now().getTime() + CACHE_MS, Date.parse(result.fetchedAt!) + MAX_SOURCE_AGE_MS);
      }
      return result;
    })();
    current.pending = work;
    void work.finally(() => {
      if (current.generation === generation && current.pending === work) { current.pending = null; current.controller = null; }
    });
    return work;
  };
}

export const collectHuntingStops = createHuntingStopCollector();

/** Nearest subset, nearest-neighbour tour and at most four 2-opt passes; no road/optimality claim. */
export function orderHuntingStops(stops: readonly HuntingStop[], center: Position, maxStops = 100): { points: HuntingStop[]; availableCount: number; truncated: boolean; totalDistanceKm: number } {
  if (!validPosition(center) || ![20, 50, 100, 200].includes(maxStops) || !Array.isArray(stops) || stops.length > MAX_STOPS) throw new RangeError("경로의 좌표와 방문 수를 확인해 주세요.");
  const stable = stops.filter(stop => stop && typeof stop.id === "string" && stop.id.length > 0 && stop.id.length <= 180 && typeof stop.name === "string" && validPosition(stop)).map(stop => ({ ...stop })).sort((a, b) => compare(a.id, b.id) || a.lat - b.lat || a.lon - b.lon || compare(a.name, b.name));
  const ids = new Set<string>(), coordinates = new Set<string>();
  const unique = stable.filter(stop => {
    const key = `${stop.lat.toFixed(6)},${(stop.lon === 180 ? -180 : stop.lon).toFixed(6)}`;
    if (ids.has(stop.id) || coordinates.has(key)) return false;
    ids.add(stop.id); coordinates.add(key); return true;
  }).map(stop => ({ stop, distance: distance(center, stop) })).sort((a, b) => a.distance - b.distance || compare(a.stop.id, b.stop.id));
  const candidates = unique.slice(0, maxStops).map(item => item.stop);
  const n = candidates.length;
  if (n < 2) return { points: candidates, availableCount: unique.length, truncated: unique.length > n, totalDistanceKm: 0 };
  const matrix = Array.from({ length: n }, () => new Float64Array(n));
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) matrix[a][b] = matrix[b][a] = distance(candidates[a], candidates[b]);
  const remaining = new Set(Array.from({ length: n - 1 }, (_, i) => i + 1));
  const tour = [0];
  while (remaining.size) {
    const previous = tour[tour.length - 1];
    let best = -1;
    for (const candidate of remaining) if (best < 0 || matrix[previous][candidate] < matrix[previous][best] || (matrix[previous][candidate] === matrix[previous][best] && compare(candidates[candidate].id, candidates[best].id) < 0)) best = candidate;
    tour.push(best); remaining.delete(best);
  }
  // Keep the nearest actual stop at index zero, including when reversing a suffix.
  for (let pass = 0; pass < 4; pass++) {
    let bestGain = 1e-9, start = -1, end = -1;
    for (let i = 1; i < n - 1; i++) for (let j = i + 1; j < n; j++) {
      const a = tour[i - 1], b = tour[i], c = tour[j], d = tour[(j + 1) % n];
      const gain = matrix[a][b] + matrix[c][d] - matrix[a][c] - matrix[b][d];
      if (gain > bestGain) { bestGain = gain; start = i; end = j; }
    }
    if (start < 0) break;
    const reversed = tour.slice(start, end + 1).reverse(); tour.splice(start, reversed.length, ...reversed);
  }
  let totalDistanceKm = 0;
  for (let i = 0; i < n; i++) totalDistanceKm += matrix[tour[i]][tour[(i + 1) % n]];
  return { points: tour.map(index => candidates[index]), availableCount: unique.length, truncated: unique.length > n, totalDistanceKm };
}
