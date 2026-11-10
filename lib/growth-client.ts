export const USAGE_VIEWS = ["live", "raids", "calendar", "pokemon", "city", "event"] as const;
export const CAMPAIGN_SOURCES = ["direct", "dc", "inven", "naver", "kakao", "discord", "youtube", "instagram", "other"] as const;
export type UsageView = typeof USAGE_VIEWS[number];
export type CampaignSource = typeof CAMPAIGN_SOURCES[number];
export type UsageAction = "page_view" | "coordinate_copy" | "share";
export type UsageDetail = { event: UsageAction; view: UsageView; city?: string };

const VISITOR_KEY = "pokedoko.usage.visitor.v1";
const PREFERENCE_KEY = "pokedoko.usage.enabled";
const MAX_AGE_MS = 30 * 86_400_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Visitor = { id: string; createdAt: number; source: CampaignSource };
let memoryVisitor: Visitor | null = null;
let feedbackVisitor: string | null = null;
let memoryPreference: boolean | null = null;
const recentEvents = new Map<string, number>();

export function usageViewForPath(path: string): UsageView | null {
  if (path === "/") return "live";
  if (/^\/cities\/[^/]+\/?$/.test(path)) return "city";
  if (/^\/events\/[^/]+\/?$/.test(path)) return "event";
  const segment = path.replace(/\/$/, "").slice(1);
  return (USAGE_VIEWS as readonly string[]).includes(segment) ? segment as UsageView : null;
}

export function campaignSource(search: string): CampaignSource {
  const params = new URLSearchParams(search);
  const value = (params.get("from") ?? params.get("utm_source") ?? "direct").trim().toLowerCase();
  const aliases: Record<string, CampaignSource> = { dcinside: "dc", cafe: "naver", kakaotalk: "kakao", yt: "youtube", ig: "instagram" };
  return aliases[value] ?? ((CAMPAIGN_SOURCES as readonly string[]).includes(value) ? value as CampaignSource : "other");
}

export function validStoredVisitor(value: unknown, now: number): value is Visitor {
  if (!value || typeof value !== "object") return false;
  const item = value as Visitor;
  return UUID.test(item.id ?? "") && Number.isFinite(item.createdAt) && item.createdAt <= now + 60_000 && now - item.createdAt < MAX_AGE_MS && (CAMPAIGN_SOURCES as readonly string[]).includes(item.source);
}

export function usageAllowed(): boolean {
  if (typeof window === "undefined") return false;
  if (navigator.doNotTrack === "1" || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl) return false;
  if (memoryPreference !== null) return memoryPreference;
  try {
    const stored = localStorage.getItem(PREFERENCE_KEY);
    return stored === null ? memoryPreference ?? true : stored !== "false";
  } catch { return memoryPreference ?? true; }
}

export function setUsageAllowed(enabled: boolean): boolean {
  memoryPreference = enabled;
  let persisted = false;
  try { localStorage.setItem(PREFERENCE_KEY, String(enabled)); persisted = true; } catch { /* Keep the explicit preference for this tab. */ }
  if (!enabled) { try { localStorage.removeItem(VISITOR_KEY); } catch { /* Browser policy may block removal too. */ } }
  if (!enabled) { memoryVisitor = null; recentEvents.clear(); }
  window.dispatchEvent(new Event("pokedoko:usage-preference"));
  return persisted;
}

/** Only a genuine cross-tab storage event should clear this tab's explicit override. */
export function syncUsagePreference(): void {
  memoryPreference = null;
  if (!usageAllowed()) { memoryVisitor = null; recentEvents.clear(); }
}

function visitor(): Visitor {
  const now = Date.now();
  if (memoryVisitor && validStoredVisitor(memoryVisitor, now)) return memoryVisitor;
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(VISITOR_KEY) ?? "null");
    if (validStoredVisitor(saved, now)) return memoryVisitor = saved;
  } catch { /* Use a temporary identifier if browser storage is unavailable. */ }
  memoryVisitor = { id: crypto.randomUUID(), createdAt: now, source: campaignSource(location.search) };
  try { localStorage.setItem(VISITOR_KEY, JSON.stringify(memoryVisitor)); } catch { /* Device-local only. */ }
  return memoryVisitor;
}

/** Capture a campaign before a client-side route transition can change the URL. */
export function initializeUsage(): void { if (usageAllowed()) visitor(); }

export function feedbackVisitorId(): string {
  if (usageAllowed()) return visitor().id;
  // A feedback form still needs a short-lived rate-limit key when usage is off.
  return feedbackVisitor ??= crypto.randomUUID();
}

export async function sendUsage(detail: UsageDetail): Promise<boolean> {
  if (!usageAllowed() || !(USAGE_VIEWS as readonly string[]).includes(detail.view) || !["page_view", "coordinate_copy", "share"].includes(detail.event)) return false;
  const identity = visitor();
  const key = `${detail.event}:${detail.view}:${detail.city ?? ""}`;
  const now = Date.now();
  if (now - (recentEvents.get(key) ?? -Infinity) < 5000) return false;
  recentEvents.set(key, now);
  if (recentEvents.size > 100) recentEvents.clear();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch("/api/usage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitorId: identity.id, event: detail.event, view: detail.view, ...(detail.city ? { city: detail.city } : {}), source: identity.source }),
      keepalive: true,
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    });
    return response.ok;
  } catch { return false; } finally { clearTimeout(timer); }
}
