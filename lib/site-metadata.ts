import type { Metadata, MetadataRoute } from "next";
import type { City, EventTime, GoEvent } from "./pokedoko-types";

export const SITE_ORIGIN = "https://pokedoko.catuniv.workers.dev";
export const SITE_NAME = "pokedoko";
export const SITEMAP_LIMIT = 200;
export const PAGE_SEO = {
  home: { path: "/", title: "포켓몬 GO 일정·전 세계 레이드", description: "포켓몬 GO 이벤트 캘린더와 등장 포켓몬, 도시별 레이드 아워를 한국시간으로 확인하세요. 공개 체육관 자료를 바탕으로 실제 레이드 위치와 남은 시간을 따로 보여드립니다." },
  live: { path: "/live", title: "실시간 레이드 위치·남은 시간", description: "서울·도쿄·뉴욕 등 지원 도시의 공개 체육관 레이드 자료를 확인하세요. 종료까지 5분 이상 남은 레이드와 반경별 모인 지역, 복사 가능한 좌표를 제공합니다." },
  raids: { path: "/raids", title: "도시별 레이드 아워·레이드 데이 시간표", description: "공개 원문으로 확인한 포켓몬 GO 레이드 아워와 레이드 데이를 도시 현지 시각·한국시간으로 비교하세요. 공식 일정과 실제 체육관 레이드는 구분해서 표시합니다." },
  calendar: { path: "/calendar", title: "포켓몬 GO 이벤트 캘린더", description: "커뮤니티 데이·스포트라이트 아워·레이드 데이 등 확인된 포켓몬 GO 일정을 달력에서 살펴보세요. 이벤트별 등장 포켓몬, 시작·종료 시각과 원문을 함께 제공합니다." },
  pokemon: { path: "/pokemon", title: "등장 포켓몬·레이드 보스 일정", description: "포켓몬 GO에 등장하는 포켓몬과 레이드 보스를 확인하세요. 확인된 기간에 따라 현재·예정·기간 미확인을 구분하고 큐레무 등 서로 다른 폼을 따로 표시합니다." },
  routes: { path: "/routes", title: "지가르데 셀 루트 목록·GPX 다운로드", description: "도시별 Pokémon GO 게임 루트와 경로 지도·GPX를 확인하고 루트를 제보하세요. 운영자가 제보를 검토해 공개하며, 추정·복원 경로를 구분하고 셀 획득을 보장하지 않습니다." },
  regional: { path: "/regional", title: "나라별 한정 이벤트·코스튬·배경 포켓몬", description: "국가와 도시별 포켓몬 GO 한정 이벤트를 확인하세요. 공식 공지로 확인한 코스튬 포켓몬과 지역 배경, 보상 조건·현지 일정·행사 장소의 참고 좌표를 함께 제공합니다." },
  trades: { path: "/trades", title: "포켓몬 교환 상대 찾기", description: "줄 포켓몬과 원하는 포켓몬을 등록하고 지역별 교환 상대를 찾아보세요. 대면 교환과 리모트 교환 준비를 구분하며, 실제 교환 가능 여부와 진행은 Pokémon GO에서 확인합니다." },
  gpx: { path: "/gpx", title: "자동사냥 GPX·포켓스톱 순환 경로", description: "도쿄·시드니·사라고사 등 공개 GPX를 불러오거나 포켓스톱 경로를 만드세요. 걷기 9.3km/h와 순회 15·20km/h, 직접 입력 속도로 거리·예상 시간을 계산하고 GPX를 복사하거나 내려받을 수 있습니다." },
} as const;

export function canonicalUrl(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) throw new Error("Canonical paths must be relative to pokedoko.");
  const url = new URL(value, SITE_ORIGIN);
  if (url.origin !== SITE_ORIGIN) throw new Error("Canonical origin cannot be overridden.");
  url.search = "";
  url.hash = "";
  return url.href;
}

export function pageMetadata({ title, description, path }: { title: string; description: string; path: string }): Metadata {
  const fullTitle = `${title} | ${SITE_NAME}`;
  return {
    metadataBase: new URL(SITE_ORIGIN),
    title: { absolute: fullTitle },
    description,
    alternates: { canonical: canonicalUrl(path) },
    openGraph: {
      type: "website", locale: "ko_KR", siteName: SITE_NAME,
      title: fullTitle, description, url: canonicalUrl(path),
      images: [{ url: `${SITE_ORIGIN}/og.png`, width: 1200, height: 630, type: "image/png", alt: "pokedoko · 포켓몬 GO 일정과 전 세계 레이드" }],
    },
    twitter: { card: "summary_large_image", title: fullTitle, description, images: [`${SITE_ORIGIN}/og.png`] },
    robots: { index: true, follow: true },
  };
}

export const EVENT_KIND_KO: Record<GoEvent["kind"], string> = {
  "raid-hour": "레이드 아워", "raid-day": "레이드 데이", "community-day": "커뮤니티 데이",
  spotlight: "스포트라이트 아워", event: "이벤트", research: "리서치",
};
export const eventPath = (id: string): string => `/events/${encodeURIComponent(id)}`;
export const cityPath = (id: string): string => `/cities/${encodeURIComponent(id)}`;

function validEventTime(time: EventTime): number | null {
  if (!time || typeof time.value !== "string") return null;
  const local = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/;
  const instant = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
  if (!(time.kind === "local" ? local : instant).test(time.value)) return null;
  if (time.kind !== "local" && time.kind !== "instant") return null;
  // The appended Z only validates the local calendar fields and ordering. It
  // does not turn a local event into a worldwide instant for display.
  const value = Date.parse(time.kind === "local" ? `${time.value}Z` : time.value);
  if (!Number.isFinite(value)) return null;
  const plain = new Date(`${time.value.slice(0, 19)}Z`);
  if (!Number.isFinite(plain.getTime()) || plain.toISOString().slice(0, 19) !== time.value.slice(0, 19)) return null;
  return value;
}

export function indexableEvent(event: GoEvent): boolean {
  if (!event || typeof event.id !== "string" || !event.id.trim() || event.id.length > 200 || !event.name || !event.nameKo) return false;
  const start = validEventTime(event.start), end = validEventTime(event.end);
  if (start === null || end === null || event.start.kind !== event.end.kind || end <= start) return false;
  try { return new URL(event.url).protocol === "https:"; } catch { return false; }
}

export function formatSourceTime(time: EventTime): string {
  if (validEventTime(time) === null) return "시각 미확인";
  if (time.kind === "local") {
    const [date, clock] = time.value.split("T");
    const [year, month, day] = date.split("-");
    return `${year}년 ${Number(month)}월 ${Number(day)}일 ${clock.slice(0, 5)}`;
  }
  return `${new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(time.value))} (한국시간)`;
}

export function windowStatus(start: Date, end: Date, now: Date): "upcoming" | "ongoing" | "ended" | "unknown" {
  if (![start, end, now].every(date => Number.isFinite(date.getTime())) || end <= start) return "unknown";
  if (now >= end) return "ended";
  return now >= start ? "ongoing" : "upcoming";
}

/** Only concrete dated events and existing cities; no invented last-modified date. */
export function buildSitemap(cities: City[], events: GoEvent[]): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = Object.values(PAGE_SEO).map(page => ({ url: canonicalUrl(page.path) }));
  for (const city of cities) entries.push({ url: canonicalUrl(cityPath(city.id)) });
  const unique = new Map(events.filter(indexableEvent).map(event => [event.id, event]));
  const confirmed = [...unique.values()].sort((a, b) => b.start.value.localeCompare(a.start.value) || a.id.localeCompare(b.id));
  for (const event of confirmed) {
    if (entries.length >= SITEMAP_LIMIT) break;
    entries.push({ url: canonicalUrl(eventPath(event.id)) });
  }
  return [...new Map(entries.map(entry => [entry.url, entry])).values()].slice(0, SITEMAP_LIMIT);
}

export function robotsConfig(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/ops", "/signin-with-chatgpt", "/signout-with-chatgpt", "/callback"] }],
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  };
}
