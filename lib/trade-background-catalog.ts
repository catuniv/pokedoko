import { TRADE_BACKGROUND_PRESETS } from "./trade-backgrounds";

export type TradeBackgroundPreset = {
  id: string; kind: "location" | "special"; name: string; label: string; sourceUrl: string; imageUrl?: string;
};
export type TradeBackgroundCatalog = {
  presets: TradeBackgroundPreset[];
  fetchedAt: string | null;
  sourceUpdatedAt: string | null;
  source: string;
  stale: boolean;
  error?: string;
  storage?: "ready" | "unavailable" | "disabled";
};

export const BACKGROUND_CATALOG_SOURCE = "https://raw.githubusercontent.com/psoren/pogo-bg/main/docs/data/data.json";
export const BACKGROUND_CATALOG_PAGE = "https://github.com/psoren/pogo-bg";
export const BACKGROUND_CATALOG_IMAGE_ROOT = "https://raw.githubusercontent.com/psoren/pogo-bg/main/docs/";
export const BACKGROUND_CATALOG_MAX_BYTES = 4 * 1024 * 1024;
const MAX_PRESETS = 1000;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, max = 80): value is string => typeof value === "string" && !!value.trim() && value === value.trim() && Array.from(value).length <= max && !/[\u0000-\u001f\u007f]/u.test(value);
const normalized = (value: string) => value.normalize("NFKC").toLocaleLowerCase("en").replace(/\s+/g, " ").trim();
function dateOnly(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const at = Date.parse(value + "T00:00:00Z");
  return Number.isFinite(at) && new Date(at).toISOString().slice(0, 10) === value;
}
export function validTradeBackgroundImageUrl(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(BACKGROUND_CATALOG_IMAGE_ROOT)
    && /^img\/bg\/[a-zA-Z0-9][a-zA-Z0-9_-]{0,119}\.jpg$/.test(value.slice(BACKGROUND_CATALOG_IMAGE_ROOT.length));
}
export function validTradeBackgroundPreset(value: unknown): value is TradeBackgroundPreset {
  if (!object(value) || Object.keys(value).some(key => !["id", "kind", "name", "label", "sourceUrl", "imageUrl"].includes(key)) || !text(value.id, 120) || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(value.id) || (value.kind !== "location" && value.kind !== "special") || !text(value.name) || !text(value.label, 160) || typeof value.sourceUrl !== "string") return false;
  try {
    const url = new URL(value.sourceUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.port || !["pokemongo.com", "github.com"].includes(url.hostname)) return false;
  } catch { return false; }
  return value.imageUrl === undefined || validTradeBackgroundImageUrl(value.imageUrl);
}

/** Static verified options retain their names, so stored posts never change identity. */
export function mergeTradeBackgroundPresets(additions: readonly TradeBackgroundPreset[]): TradeBackgroundPreset[] {
  const result: TradeBackgroundPreset[] = TRADE_BACKGROUND_PRESETS.map(item => ({ ...item }));
  const byId = new Map(result.map((item, index) => [item.id, index]));
  const byName = new Map(result.map((item, index) => [`${item.kind}:${normalized(item.name)}`, index]));
  for (const raw of additions.slice(0, MAX_PRESETS)) {
    if (!validTradeBackgroundPreset(raw)) continue;
    // An explicit same-event, same-year alias, never a fuzzy city/year match.
    const wildArea2026 = raw.id === "community-gowildarea2026" && raw.kind === "special" && /\b2026\b/.test(raw.name)
      ? byId.get("wild-area-global-2026") : undefined;
    const index = byId.get(raw.id) ?? byName.get(`${raw.kind}:${normalized(raw.name)}`) ?? wildArea2026;
    if (index !== undefined) {
      if (raw.imageUrl && !result[index].imageUrl) result[index] = { ...result[index], imageUrl: raw.imageUrl };
      continue;
    }
    byId.set(raw.id, result.length); byName.set(`${raw.kind}:${normalized(raw.name)}`, result.length); result.push({ ...raw });
  }
  return result;
}

/** The public catalog supplies facts and fixed image paths, never an arbitrary URL proxy. */
export function parseBackgroundCatalogSource(value: unknown, now = new Date()): { presets: TradeBackgroundPreset[]; sourceUpdatedAt: string } {
  if (!object(value) || !dateOnly(value.generated) || value.generated > now.toISOString().slice(0, 10) || !Array.isArray(value.backgrounds) || !value.backgrounds.length || value.backgrounds.length > MAX_PRESETS) throw new Error("Invalid public background catalog");
  const presets: TradeBackgroundPreset[] = [], ids = new Set<string>();
  const today = now.toISOString().slice(0, 10);
  for (const raw of value.backgrounds) {
    if (!object(raw) || !text(raw.id) || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(raw.id) || !text(raw.name) || (raw.type !== "location" && raw.type !== "special") || !dateOnly(raw.first) || raw.first < "2016-07-06" || raw.first > today || ids.has(raw.id)) continue;
    const imageUrl = typeof raw.image === "string" ? BACKGROUND_CATALOG_IMAGE_ROOT + raw.image : undefined;
    const preset: TradeBackgroundPreset = { id: `community-${raw.id}`, kind: raw.type, name: raw.name, label: raw.name, sourceUrl: BACKGROUND_CATALOG_PAGE,
      ...(validTradeBackgroundImageUrl(imageUrl) ? { imageUrl } : {}) };
    if (!validTradeBackgroundPreset(preset)) continue;
    ids.add(raw.id); presets.push(preset);
  }
  if (!presets.length) throw new Error("Public background catalog had no dated records");
  return { presets, sourceUpdatedAt: value.generated };
}

export function fallbackTradeBackgroundCatalog(): TradeBackgroundCatalog {
  return { presets: mergeTradeBackgroundPresets([]), fetchedAt: null, sourceUpdatedAt: null, source: BACKGROUND_CATALOG_PAGE, stale: true, error: "배경 목록을 갱신하지 못해 기본 목록을 표시해요." };
}
export function readTradeBackgroundCatalog(value: unknown, now = new Date()): TradeBackgroundCatalog | null {
  if (!object(value) || !Array.isArray(value.presets) || value.presets.length > MAX_PRESETS + TRADE_BACKGROUND_PRESETS.length || !value.presets.every(validTradeBackgroundPreset) || value.source !== BACKGROUND_CATALOG_PAGE || typeof value.stale !== "boolean") return null;
  if (value.fetchedAt !== null && (typeof value.fetchedAt !== "string" || !/^\d{4}-\d\d-\d\dT.*Z$/.test(value.fetchedAt) || !Number.isFinite(Date.parse(value.fetchedAt)) || Date.parse(value.fetchedAt) > now.getTime() + 60_000)) return null;
  if (value.sourceUpdatedAt !== null && (!dateOnly(value.sourceUpdatedAt) || value.sourceUpdatedAt > now.toISOString().slice(0, 10))) return null;
  if (value.error !== undefined && (typeof value.error !== "string" || value.error.length > 300)) return null;
  if (value.storage !== undefined && !["ready", "unavailable", "disabled"].includes(String(value.storage))) return null;
  return { ...(typeof value.storage === "string" ? { storage: value.storage as TradeBackgroundCatalog["storage"] } : {}), presets: value.presets.map(preset => ({ ...preset })), fetchedAt: value.fetchedAt as string | null, sourceUpdatedAt: value.sourceUpdatedAt as string | null, source: value.source, stale: value.stale, ...(typeof value.error === "string" ? { error: value.error } : {}) };
}
