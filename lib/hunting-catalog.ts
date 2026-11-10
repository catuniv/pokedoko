/** Metadata and original-source links only. No third-party GPX geometry is bundled.
 * Verified against the pinned upstream revision on 2026-11-10.
 * An absent license is unknown permission, never a public-domain claim.
 */
export type HuntingCatalogRoute = {
  id: string;
  name: string;
  cityId: string;
  cityName: string;
  countryName: string;
  countryCode: string;
  description: string;
  pointCount: number;
  distanceKm: number;
  /** True only when the original first and last coordinates are identical. */
  closed: boolean;
  sourceTitle: string;
  sourceUrl: string;
  rawUrl: string;
  sourceRevision: string;
  author?: string;
  licenseName?: string;
  licenseUrl?: string;
  communityUrl?: string;
};

const SOURCE_REVISION = "c360bce9ea15f4e9eb0d5b6c670cf9f089e33772";
const SOURCE_TITLE = "king-owl/pogo-gpx-archive";
const COMMUNITY_URL = "https://www.reddit.com/r/PokemonGoSpoofing/comments/p3hpjr/";

function originalSource(path: string) {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return {
    sourceTitle: SOURCE_TITLE,
    sourceRevision: SOURCE_REVISION,
    sourceUrl: `https://github.com/king-owl/pogo-gpx-archive/blob/${SOURCE_REVISION}/${encodedPath}`,
    rawUrl: `https://raw.githubusercontent.com/king-owl/pogo-gpx-archive/${SOURCE_REVISION}/${encodedPath}`,
    // This discussion recommends the collection, not an individual route ranking.
    communityUrl: COMMUNITY_URL,
  };
}

/** Point counts include the original closing point; distance adds no return leg.
 * Files are loaded directly from their original host only after a user action.
 */
export const HUNTING_CATALOG: HuntingCatalogRoute[] = [
  {
    id: "new-york-river-park",
    name: "리버 파크",
    cityId: "new-york",
    cityName: "뉴욕",
    countryName: "미국",
    countryCode: "US",
    description: "뉴욕 브롱크스 리버 파크 일대의 공개 GPX. 시작점과 끝점이 약 74m 떨어져 있어요.",
    pointCount: 58,
    distanceKm: 4.620,
    closed: false,
    ...originalSource("Hotspot Routes/gpx/North America_Canada/River Park, New York.gpx"),
  },
  {
    id: "tokyo-ueno",
    name: "우에노",
    cityId: "tokyo",
    cityName: "도쿄",
    countryName: "일본",
    countryCode: "JP",
    description: "우에노 일대에 기록된 긴 동선. 원본의 마지막 좌표가 출발점으로 돌아와요.",
    pointCount: 187,
    distanceKm: 12.236,
    closed: true,
    ...originalSource("Hotspot Routes/gpx/Asia-Pacific_Oceania/Ueno, Tokyo Japan.gpx"),
  },
  {
    id: "tokyo-hibiya-park",
    name: "히비야 공원",
    cityId: "tokyo",
    cityName: "도쿄",
    countryName: "일본",
    countryCode: "JP",
    description: "히비야 공원 일대의 공개 GPX. 시작점과 끝점이 약 108m 떨어져 있어요.",
    pointCount: 47,
    distanceKm: 2.657,
    closed: false,
    ...originalSource("Hotspot Routes/gpx/Asia-Pacific_Oceania/Hibiya Park, Japan.gpx"),
  },
  {
    id: "sydney-royal-botanic-gardens",
    name: "왕립 식물원",
    cityId: "sydney",
    cityName: "시드니",
    countryName: "호주",
    countryCode: "AU",
    description: "시드니 왕립 식물원 일대의 공개 GPX. 시작점과 끝점이 약 41m 떨어져 있어요.",
    pointCount: 48,
    distanceKm: 2.958,
    closed: false,
    ...originalSource("Hotspot Routes/gpx/Asia-Pacific_Oceania/Royal Botanic Gardens, Sydney Australia.gpx"),
  },
  {
    id: "zaragoza-standard",
    name: "사라고사 기본 경로",
    cityId: "zaragoza",
    cityName: "사라고사",
    countryName: "스페인",
    countryCode: "ES",
    description: "사라고사 도심의 공개 GPX. 원본 끝점은 출발점에서 약 9m 떨어져 있어요.",
    pointCount: 145,
    distanceKm: 6.786,
    closed: false,
    ...originalSource("Hotspot Routes/gpx/Europe_Africa/Zaragoza, Spain.gpx"),
  },
  {
    id: "zaragoza-xxl",
    name: "사라고사 XXL",
    cityId: "zaragoza",
    cityName: "사라고사",
    countryName: "스페인",
    countryCode: "ES",
    description: "같은 아카이브의 넓은 사라고사 동선. 시작점과 끝점이 약 168m 떨어져 있어요.",
    pointCount: 329,
    distanceKm: 17.825,
    closed: false,
    ...originalSource("Hotspot Routes/gpx/Europe_Africa/Zaragoza, Spain XXL.gpx"),
  },
  {
    id: "budapest-margaret-island",
    name: "마르기트섬",
    cityId: "budapest",
    cityName: "부다페스트",
    countryName: "헝가리",
    countryCode: "HU",
    description: "마르기트섬 일대의 공개 GPX. 시작점과 끝점이 약 27m 떨어져 있어요.",
    pointCount: 53,
    distanceKm: 1.874,
    closed: false,
    ...originalSource("Hotspot Routes/gpx/Europe_Africa/Margaret Island, Budapest.gpx"),
  },
  {
    id: "budapest-alternate",
    name: "마르기트섬 대안 경로",
    cityId: "budapest",
    cityName: "부다페스트",
    countryName: "헝가리",
    countryCode: "HU",
    description: "부다페스트 대안 동선으로 공유된 GPX. 원본의 마지막 좌표가 출발점으로 돌아와요.",
    pointCount: 75,
    distanceKm: 2.184,
    closed: true,
    ...originalSource("Hotspot Routes/gpx/Europe_Africa/Budapest, Alternate Route.gpx"),
  },
];
