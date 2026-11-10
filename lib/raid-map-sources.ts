/** Server-only adapters for the JSON used by public regional maps. */
export type MapSource = {
  id: string;
  cityId: string;
  name: string;
  url: string;
  status: "ready" | "empty" | "stale" | "error";
  fetchedAt: string | null;
  checkedAt: string;
  count: number;
  message: string;
  coverage?: { lat: number; lon: number; radiusKm: number; limit: number; limited: boolean };
};

export type CollectedRaidMaps = {
  feed: { sourceName: string; fetchedAt: string; raids: unknown[] };
  sources: MapSource[];
};

type Definition = {
  id: string;
  cityId: string;
  name: string;
  url: string;
  endpoint: string;
  bounds: readonly [number, number, number, number];
};
type AdaptedRaid = {
  id: string;
  cityId: string;
  gymName: string;
  lat: number;
  lon: number;
  bossName: null;
  pokemonId: number | null;
  formId: number | null;
  tier: number | null;
  startsAt: string;
  endsAt: string;
  /** Alias for source response time, never a per-gym observation timestamp. */
  observedAt: string;
  timeBasis: "source-response";
  sourceName: string;
  sourceUrl: string;
};
type SourceResult = { source: MapSource; raids: AdaptedRaid[] };
type Options = { fetcher?: typeof fetch; now?: () => Date; cacheMs?: number };
type CacheEntry = { result: SourceResult | null; expires: number; pending: Promise<SourceResult> | null; pendingStarted: number; generation: number; cancel: (() => void) | null };
type Obj = Record<string, unknown>;

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_RAIDS = 5000;
const MAX_AGE = 10 * 60_000;
const CLOCK_SKEW = 60_000;
const USER_AGENT = "pokedoko-planner/1.0 (+https://pokedoko.adorablecompass.chatgpt.site)";
// Coarse regional guards around each map's named service area, not political
// borders or claims of exhaustive city coverage. They reject grossly misplaced
// records without treating the publisher's data as a worldwide feed.
const DEFINITIONS: readonly Definition[] = [
  { id: "new-york", cityId: "new-york", name: "NYCPokeMap", url: "https://www.nycpokemap.com/gym.html", endpoint: "https://www.nycpokemap.com/raids.php", bounds: [40.3, 41.2, -74.6, -73.3] },
  { id: "sydney", cityId: "sydney", name: "SydneyPogoMap", url: "https://www.sydneypogomap.com/gym.html", endpoint: "https://www.sydneypogomap.com/raids.php", bounds: [-34.4, -32.7, 149.8, 152] },
  { id: "singapore", cityId: "singapore", name: "SGPokeMap", url: "https://sgpokemap.com/gym.html", endpoint: "https://sgpokemap.com/raids.php", bounds: [1.12, 1.55, 103.55, 104.15] },
  { id: "london", cityId: "london", name: "LondonPogoMap", url: "https://londonpogomap.com/gym.html", endpoint: "https://londonpogomap.com/raids.php", bounds: [51.2, 51.8, -0.65, 0.4] },
  { id: "vancouver", cityId: "vancouver", name: "VanPokeMap", url: "https://vanpokemap.com/gym.html", endpoint: "https://vanpokemap.com/raids.php", bounds: [48.9, 49.5, -123.5, -122.4] },
];

const object = (value: unknown): Obj => value && typeof value === "object" && !Array.isArray(value) ? value as Obj : {};
function number(value: unknown): number | null {
  if (typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value.trim())) value = Number(value);
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function integer(value: unknown, min: number, max: number): number | null {
  const result = number(value);
  return result !== null && Number.isInteger(result) && result >= min && result <= max ? result : null;
}
function epoch(value: unknown): number | null {
  const seconds = integer(value, 1, 8_640_000_000_000);
  return seconds !== null && Number.isFinite(new Date(seconds * 1000).getTime()) ? seconds * 1000 : null;
}
function initialSource(definition: Definition, checkedAt: Date): MapSource {
  return { id: definition.id, cityId: definition.cityId, name: definition.name, url: definition.url, status: "error", fetchedAt: null, checkedAt: checkedAt.toISOString(), count: 0, message: "공급원에 연결하지 못했습니다." };
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
  } catch (error) {
    cancel();
    throw error;
  } finally { signal.removeEventListener("abort", cancel); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

function normalize(raw: unknown, definition: Definition, checkedAt: Date): SourceResult {
  const data = object(raw);
  const source = initialSource(definition, checkedAt);
  const fetchedAt = epoch(object(data.meta).time);
  if (fetchedAt === null || fetchedAt > checkedAt.getTime() + CLOCK_SKEW || !Array.isArray(data.raids) || data.raids.length > MAX_RAIDS) {
    source.message = "공급원의 레이드 응답 형식을 확인할 수 없습니다.";
    return { source, raids: [] };
  }
  source.fetchedAt = new Date(fetchedAt).toISOString();
  if (checkedAt.getTime() - fetchedAt >= MAX_AGE) {
    source.status = "stale";
    source.message = "공급원 응답 시각이 10분 이상 지났습니다.";
    return { source, raids: [] };
  }
  const raids = new Map<string, AdaptedRaid>();
  let invalid = 0;
  for (const item of data.raids) {
    const row = object(item);
    const lat = number(row.lat), lon = number(row.lng);
    const start = epoch(row.raid_start), end = epoch(row.raid_end);
    const pokemon = integer(row.pokemon_id, 0, 10000);
    const form = row.form == null ? null : integer(row.form, 0, 100000);
    const tier = row.level == null ? null : integer(row.level, 1, 100);
    const [south, north, west, east] = definition.bounds;
    if (lat === null || lon === null || lat < south || lat > north || lon < west || lon > east || start === null || end === null || start >= end || end - start > 86_400_000 || start > checkedAt.getTime() + 7 * 86_400_000 || pokemon === null || (row.form != null && form === null) || (row.level != null && tier === null)) { invalid++; continue; }
    // Ended records and eggs whose boss has not been refreshed after hatching
    // must not be presented as current boss sightings. raid_spawn is not used.
    if (end <= checkedAt.getTime() || (pokemon === 0 && start <= checkedAt.getTime())) continue;
    const id = `${definition.cityId}:${lat.toFixed(6)},${lon.toFixed(6)}:${start / 1000}`;
    const name = typeof row.gym_name === "string" ? row.gym_name.trim() : "";
    if (name.length > 180 || /[\u0000-\u001f\u007f]/.test(name)) { invalid++; continue; }
    raids.set(id, {
      id, gymName: name || "이름 미제공 체육관", cityId: definition.cityId, lat, lon,
      bossName: null, pokemonId: pokemon || null, formId: form, tier,
      startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString(),
      observedAt: source.fetchedAt, timeBasis: "source-response", sourceName: definition.name, sourceUrl: definition.url,
    });
  }
  const values = [...raids.values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id));
  source.count = values.length;
  source.status = values.length ? "ready" : data.raids.length && invalid === data.raids.length ? "error" : "empty";
  source.message = source.status === "error" ? "유효한 체육관 레코드가 없습니다." : "원문 응답 시각 기준입니다. 체육관별 마지막 관측 시각은 제공되지 않습니다.";
  // data.battles contains Max Battles, never ordinary gym raids.
  return { source, raids: values };
}

/** Per-source cache/backoff and shared in-flight requests prevent poll amplification. */
export function createRaidMapCollector(options: Options = {}): () => Promise<CollectedRaidMaps> {
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? (() => new Date());
  const cacheMs = options.cacheMs !== undefined && Number.isFinite(options.cacheMs) ? Math.max(0, Math.min(options.cacheMs, 300_000)) : 60_000;
  const entries = new Map<string, CacheEntry>(DEFINITIONS.map((source) => [source.id, { result: null, expires: 0, pending: null, pendingStarted: 0, generation: 0, cancel: null }]));
  async function collectOne(definition: Definition): Promise<SourceResult> {
    const entry = entries.get(definition.id)!;
    if (entry.pending) {
      if (now().getTime() - entry.pendingStarted < 9_000) return entry.pending;
      entry.generation++;
      entry.cancel?.();
      entry.pending = null;
      entry.cancel = null;
      entry.expires = 0;
    }
    if (entry.result && entry.expires > now().getTime()) return entry.result;
    const attempt = ++entry.generation;
    entry.pendingStarted = now().getTime();
    const controller = new AbortController();
    entry.cancel = () => controller.abort();
    const timer = setTimeout(() => controller.abort(), 8_000);
    let rejectAbort: (() => void) | null = null;
    const aborted = new Promise<never>((_, reject) => {
      rejectAbort = () => reject(new Error("Source request timed out"));
      controller.signal.addEventListener("abort", rejectAbort, { once: true });
    });
    const job = (async () => {
      let value: SourceResult;
      try {
        const work = (async () => {
          const response = await fetcher(definition.endpoint, { headers: { Accept: "application/json", "User-Agent": USER_AGENT }, cache: "no-store", redirect: "manual", signal: controller.signal });
          const data = await boundedJson(response, controller.signal);
          return normalize(data, definition, now());
        })();
        value = await Promise.race([work, aborted]);
      } catch (cause) {
        console.warn('[pokedoko] raid source request failed', definition.id, cause instanceof Error ? `${cause.name}: ${cause.message}` : 'Unknown request error');
        value = { source: initialSource(definition, now()), raids: [] };
      } finally {
        clearTimeout(timer);
        if (rejectAbort) controller.signal.removeEventListener("abort", rejectAbort);
      }
      if (attempt === entry.generation) {
        entry.result = value;
        entry.expires = now().getTime() + (value.source.status === "error" || value.source.status === "stale" ? Math.min(cacheMs, 30_000) : cacheMs);
      }
      return value;
    })();
    entry.pending = job;
    try { return await job; } finally {
      if (entry.pending === job) { entry.pending = null; entry.cancel = null; }
    }
  }
  return async () => {
    const results = await Promise.all(DEFINITIONS.map(collectOne));
    const successful = results.filter(({ source }) => source.status === "ready" || source.status === "empty");
    const timestamps = successful.flatMap(({ source }) => source.fetchedAt ? [Date.parse(source.fetchedAt)] : []);
    return {
      feed: {
        sourceName: "공개 지역 레이드 지도",
        fetchedAt: new Date(timestamps.length ? Math.min(...timestamps) : now().getTime()).toISOString(),
        raids: results.flatMap(({ raids }) => raids),
      },
      sources: results.map(({ source }) => ({ ...source })),
    };
  };
}

export const collectPublicRaidMaps = createRaidMapCollector();
