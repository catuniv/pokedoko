import { CITIES } from "./cities";
import type { MapSource } from "./raid-map-sources";

type Coverage = { lat: number; lon: number; radiusKm: number; limit: number; limited: boolean };
type NearbySource = MapSource & { coverage: Coverage };
type Raid = {
  id: string; cityId: string; gymName: string; lat: number; lon: number;
  bossName: null; pokemonId: number | null; formId: null; tier: number | null;
  startsAt: string; endsAt: string; observedAt: string;
  timeBasis: "source-response"; sourceName: string; sourceUrl: string;
};
type Result = { source: NearbySource; raids: Raid[] };
type City = (typeof CITIES)[number];
type Entry = { result: Result | null; expires: number };
type Collected = { feed: { sourceName: string; fetchedAt: string; raids: unknown[] }; sources: NearbySource[] };
type Options = { fetcher?: typeof fetch; now?: () => Date };
type Obj = Record<string, unknown>;

const ORIGIN = "https://pokecoords.iflowgo.com";
const RADIUS_KM = 15;
const LIMIT = 800;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_AGE = 600_000;
const USER_AGENT = "pokedoko-planner/1.0 (+https://pokedoko.adorablecompass.chatgpt.site)";
const object = (value: unknown): Obj => value && typeof value === "object" && !Array.isArray(value) ? value as Obj : {};
const number = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
const integer = (value: unknown, min: number, max: number): number | null => {
  const n = number(value);
  return n !== null && Number.isInteger(n) && n >= min && n <= max ? n : null;
};

/** Explicit offsets are mandatory. Fractional source microseconds are reduced to JS milliseconds. */
function instant(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const year = +value.slice(0, 4), month = +value.slice(5, 7), day = +value.slice(8, 10);
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const offset = value.endsWith("Z") ? "+00:00" : value.slice(-6);
  if (month < 1 || month > 12 || day < 1 || day > days || +value.slice(11, 13) > 23 || +value.slice(14, 16) > 59 || +value.slice(17, 19) > 59 || +offset.slice(1, 3) > 14 || +offset.slice(4, 6) > 59 || (+offset.slice(1, 3) === 14 && +offset.slice(4, 6) !== 0)) return null;
  const ms = Date.parse(value.replace(/\.(\d{3})\d+(?=Z|[+-])/, ".$1"));
  return Number.isFinite(ms) ? ms : null;
}

function distance(city: City, lat: number, lon: number): number {
  const rad = Math.PI / 180;
  const a = Math.sin((lat - city.lat) * rad / 2) ** 2 + Math.cos(city.lat * rad) * Math.cos(lat * rad) * Math.sin((lon - city.lon) * rad / 2) ** 2;
  return 12_742.0176 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, a))));
}

function initial(city: City, checkedAt: Date): NearbySource {
  return {
    id: `iflowgo-${city.id}`, cityId: city.id, name: `PoGo Radar · ${city.name}`,
    url: `${ORIGIN}/`, status: "error", fetchedAt: null, checkedAt: checkedAt.toISOString(), count: 0,
    message: "공급원에 연결하지 못했습니다.",
    coverage: { lat: city.lat, lon: city.lon, radiusKm: RADIUS_KM, limit: LIMIT, limited: false },
  };
}

async function boundedJson(response: Response, signal: AbortSignal): Promise<unknown> {
  if (!response.ok || !response.body || Number(response.headers.get("content-length")) > MAX_BYTES) throw new Error("Invalid source response");
  const reader = response.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", cancel, { once: true });
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      if (signal.aborted) throw new Error("Source request timed out");
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BYTES) throw new Error("Source response exceeds byte limit");
      chunks.push(value);
    }
    if (signal.aborted) throw new Error("Source request timed out");
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    cancel();
    throw error;
  } finally { signal.removeEventListener("abort", cancel); }
}

function normalize(raw: unknown, city: City, checkedAt: Date): Result {
  const data = object(raw), source = initial(city, checkedAt);
  const fetchedAt = instant(data.generated_at);
  if (fetchedAt === null || fetchedAt > checkedAt.getTime() + 60_000 || !Array.isArray(data.raids) || data.raids.length > LIMIT) {
    source.message = "공급원의 레이드 응답 형식을 확인할 수 없습니다.";
    return { source, raids: [] };
  }
  source.fetchedAt = new Date(fetchedAt).toISOString();
  source.coverage.limited = data.raids.length === LIMIT;
  if (checkedAt.getTime() - fetchedAt >= MAX_AGE) {
    source.status = "stale"; source.message = "공급원 응답 시각이 10분 이상 지났습니다.";
    return { source, raids: [] };
  }
  const raids = new Map<string, Raid>();
  const gymWindows = new Set<string>();
  let invalid = 0;
  for (const item of data.raids) {
    const row = object(item), lat = number(row.lat), lon = number(row.lon);
    const start = instant(row.raid_battle_at), end = instant(row.raid_end_at);
    const pokemon = row.raid_pokemon_id == null ? 0 : integer(row.raid_pokemon_id, 0, 10_000);
    const tier = row.raid_level == null ? null : integer(row.raid_level, 1, 100);
    const rawId = typeof row.id === "string" ? row.id.trim() : typeof row.id === "number" && Number.isSafeInteger(row.id) ? String(row.id) : "";
    const name = typeof row.gym_name === "string" ? row.gym_name.trim() : "";
    if (!rawId || rawId.length > 180 || /[\u0000-\u0020\u007f]/.test(rawId) || lat === null || lon === null || lat < -90 || lat > 90 || lon < -180 || lon > 180 || distance(city, lat, lon) > RADIUS_KM + 0.00001 || start === null || end === null || start >= end || end - start > 86_400_000 || start > checkedAt.getTime() + 7 * 86_400_000 || pokemon === null || (row.raid_level != null && tier === null) || name.length > 180 || /[\u0000-\u001f\u007f]/.test(name)) { invalid++; continue; }
    if (end <= checkedAt.getTime() || (!pokemon && start <= checkedAt.getTime())) continue;
    // Share the regional adapters' coordinate/window identity across providers.
    // Only the ID is rounded: published coordinates remain unchanged in records.
    const id = `${city.id}:${lat.toFixed(6)},${lon.toFixed(6)}:${start / 1000}`;
    const gymWindow = `${rawId}:${start}`;
    if (raids.has(id) || gymWindows.has(gymWindow)) continue;
    gymWindows.add(gymWindow);
    raids.set(id, {
      id, cityId: city.id, gymName: name || "이름 미제공 체육관", lat, lon,
      bossName: null, pokemonId: pokemon || null, formId: null, tier,
      startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString(),
      observedAt: source.fetchedAt, timeBasis: "source-response", sourceName: source.name, sourceUrl: source.url,
    });
  }
  const values = [...raids.values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id));
  source.count = values.length;
  source.status = values.length ? "ready" : data.raids.length && invalid === data.raids.length ? "error" : "empty";
  source.message = source.status === "error" ? "유효한 체육관 레코드가 없습니다." : `도시 중심 반경 15km에서 최대 800개를 조회합니다.${source.coverage.limited ? " 조회 상한에 도달한 일부 결과입니다." : ""} 원문 응답 시각 기준이며 체육관별 관측 시각·참가 인원은 제공되지 않습니다.`;
  return { source, raids: values };
}

/** Fixed public nearby searches, with city caches and a bounded six-request worker pool. */
export function createNearbyRaidCollector(options: Options = {}): () => Promise<Collected> {
  const fetcher = options.fetcher ?? fetch, now = options.now ?? (() => new Date());
  const entries = new Map<string, Entry>(CITIES.map(city => [city.id, { result: null, expires: 0 }]));
  let pending: Promise<Collected> | null = null;
  let pendingStarted = 0;
  let generation = 0;
  let pendingBudget: AbortController | null = null;
  async function request(city: City, budgetSignal: AbortSignal, attempt: number): Promise<Result> {
    const entry = entries.get(city.id)!;
    if (attempt !== generation) return { source: initial(city, now()), raids: [] };
    if (entry.result && entry.expires > now().getTime()) return entry.result;
    const controller = new AbortController();
    const abort = () => controller.abort();
    budgetSignal.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, 4_000);
    let rejectAbort: (() => void) | null = null;
    const abortPromise = new Promise<never>((_, reject) => {
      rejectAbort = () => reject(new Error("Source request timed out"));
      controller.signal.addEventListener("abort", rejectAbort, { once: true });
    });
    let value: Result;
    try {
      if (budgetSignal.aborted) controller.abort();
      const endpoint = `${ORIGIN}/iflowgopokecoords/api/v1/nearby?${new URLSearchParams({ lat: String(city.lat), lon: String(city.lon), radius_km: String(RADIUS_KM), layers: "raids", limit: String(LIMIT) })}`;
      const work = (async () => {
        if (controller.signal.aborted) throw new Error("Source request timed out");
        const response = await fetcher(endpoint, { headers: { Accept: "application/json", "User-Agent": USER_AGENT }, cache: "no-store", redirect: "manual", signal: controller.signal });
        const raw = await boundedJson(response, controller.signal);
        return normalize(raw, city, now());
      })();
      value = await Promise.race([work, abortPromise]);
    } catch {
      value = { source: initial(city, now()), raids: [] };
      if (controller.signal.aborted) value.source.message = "공급원 응답 시간이 초과되었습니다.";
    } finally {
      clearTimeout(timer);
      budgetSignal.removeEventListener("abort", abort);
      if (rejectAbort) controller.signal.removeEventListener("abort", rejectAbort);
    }
    // A previously cancelled Worker request can resume after its replacement.
    // Only the current lease may publish results into shared isolate caches.
    if (attempt === generation) {
      entry.result = value;
      entry.expires = now().getTime() + (value.source.status === "error" || value.source.status === "stale" ? 30_000 : 60_000);
    }
    return value;
  }
  async function collect(attempt: number, budget: AbortController): Promise<Collected> {
    const timer = setTimeout(() => budget.abort(), 10_000);
    const results: Result[] = new Array(CITIES.length);
    let next = 0;
    try {
      await Promise.all(Array.from({ length: 6 }, async () => {
        while (next < CITIES.length) {
          const index = next++;
          results[index] = await request(CITIES[index], budget.signal, attempt);
        }
      }));
    } finally { clearTimeout(timer); }
    const successful = results.filter(result => result.source.status === "ready" || result.source.status === "empty");
    const timestamps = successful.flatMap(result => result.source.fetchedAt ? [Date.parse(result.source.fetchedAt)] : []);
    return {
      feed: { sourceName: "PoGo Radar 공개 지도", fetchedAt: new Date(timestamps.length ? Math.min(...timestamps) : now().getTime()).toISOString(), raids: results.flatMap(result => result.raids) },
      sources: results.map(result => ({ ...result.source, coverage: { ...result.source.coverage } })),
    };
  }
  return () => {
    if (pending && now().getTime() - pendingStarted >= 11_000) {
      // Timers may have stopped with a cancelled hosting request. Elapsed wall
      // time, rather than that request's timer, decides whether it is reusable.
      generation++;
      pendingBudget?.abort();
      pending = null;
      pendingBudget = null;
      for (const entry of entries.values()) entry.expires = 0;
    }
    if (!pending) {
      const attempt = ++generation;
      pendingStarted = now().getTime();
      const budget = new AbortController();
      pendingBudget = budget;
      const job = collect(attempt, budget).finally(() => {
        if (pending === job) { pending = null; pendingBudget = null; }
      });
      pending = job;
    }
    return pending;
  };
}

export const collectNearbyRaids = createNearbyRaidCollector();
