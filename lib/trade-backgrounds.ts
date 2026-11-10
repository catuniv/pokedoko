/**
 * Event-qualified suggestions, not an exhaustive game inventory or compatibility map.
 * Source checks: docs/trade-background-sources.md (2026-11-10).
 * Names identify the event/location; they are not claimed to be in-game asset IDs.
 */
export const TRADE_BACKGROUND_PRESETS = [
  { id: "wild-area-global-2026", kind: "special", name: "GO Wild Area 2026: Global", label: "와일드에리어 2026 · 글로벌", sourceUrl: "https://pokemongo.com/en/news/get-ready-for-gowildarea-2026" },
  { id: "go-fest-wormhole-2024", kind: "special", name: "Ultra Wormhole — GO Fest 2024", label: "울트라홀 · GO Fest 2024", sourceUrl: "https://pokemongo.com/news/special-backgrounds?hl=en" },
  { id: "go-fest-global-2025", kind: "special", name: "GO Fest 2025: Global", label: "GO Fest 2025 · 글로벌", sourceUrl: "https://pokemongo.com/news/go-fest-2025-ultra-unlock-challenges" },
  { id: "wild-area-sendai-2026", kind: "location", name: "Sendai — GO Wild Area 2026", label: "센다이 · GO Wild Area 2026", sourceUrl: "https://pokemongo.com/en/news/get-ready-for-gowildarea-2026" },
  { id: "wild-area-mexico-city-2026", kind: "location", name: "Mexico City — GO Wild Area 2026", label: "멕시코시티 · GO Wild Area 2026", sourceUrl: "https://pokemongo.com/en/news/get-ready-for-gowildarea-2026" },
  { id: "go-tour-los-angeles-2026", kind: "location", name: "Los Angeles — GO Tour: Kalos 2026", label: "로스앤젤레스 · GO Tour: Kalos 2026", sourceUrl: "https://pokemongo.com/gotour/losangeles/gameplay?hl=en" },
  { id: "road-trip-manchester-2025", kind: "location", name: "Manchester — Road Trip 2025", label: "맨체스터 · Road Trip 2025", sourceUrl: "https://pokemongo.com/news/pokemon-go-road-trip-2025-gameplay" },
  { id: "road-trip-london-2025", kind: "location", name: "London — Road Trip 2025", label: "런던 · Road Trip 2025", sourceUrl: "https://pokemongo.com/news/pokemon-go-road-trip-2025-gameplay" },
  { id: "road-trip-paris-2025", kind: "location", name: "Paris — Road Trip 2025", label: "파리 · Road Trip 2025", sourceUrl: "https://pokemongo.com/news/pokemon-go-road-trip-2025-gameplay" },
  { id: "road-trip-valencia-2025", kind: "location", name: "Valencia — Road Trip 2025", label: "발렌시아 · Road Trip 2025", sourceUrl: "https://pokemongo.com/news/pokemon-go-road-trip-2025-gameplay" },
  { id: "road-trip-berlin-2025", kind: "location", name: "Berlin — Road Trip 2025", label: "베를린 · Road Trip 2025", sourceUrl: "https://pokemongo.com/news/pokemon-go-road-trip-2025-gameplay" },
  { id: "road-trip-den-haag-2025", kind: "location", name: "Den Haag — Road Trip 2025", label: "헤이그 · Road Trip 2025", sourceUrl: "https://pokemongo.com/news/pokemon-go-road-trip-2025-gameplay" },
  { id: "road-trip-cologne-2025", kind: "location", name: "Cologne — Road Trip 2025", label: "쾰른 · Road Trip 2025", sourceUrl: "https://pokemongo.com/news/pokemon-go-road-trip-2025-gameplay" },
  { id: "road-to-unova-black-2025", kind: "special", name: "Pokémon Black Version — Road to Unova 2025", label: "블랙 버전 · Road to Unova 2025", sourceUrl: "https://pokemongo.com/news/road-to-unova-event?hl=en" },
  { id: "road-to-unova-white-2025", kind: "special", name: "Pokémon White Version — Road to Unova 2025", label: "화이트 버전 · Road to Unova 2025", sourceUrl: "https://pokemongo.com/news/road-to-unova-event?hl=en" },
  { id: "into-the-wild-2025", kind: "special", name: "Into the Wild 2025", label: "Into the Wild 2025", sourceUrl: "https://pokemongo.com/news/into-the-wild-2025" },
  { id: "road-of-legends-2026", kind: "special", name: "Road of Legends 2026", label: "Road of Legends 2026", sourceUrl: "https://pokemongo.com/news/road-of-legends-2026" },
  { id: "patterns-of-the-wild-2026", kind: "special", name: "Patterns of the Wild 2026", label: "Patterns of the Wild 2026 · 바틱 셔츠", sourceUrl: "https://pokemongo.com/news/patterns-of-the-wild-2026" },
] as const satisfies readonly { id: string; kind: "location" | "special"; name: string; label: string; sourceUrl: string }[];

/** Missing legacy metadata is different from an explicit no-background choice. */
export function formatTradeBackground(background?: { kind: string; name?: string } | null): string {
  if (!background || background.kind === "unspecified") return "배경 미지정";
  if (background.kind === "none") return "배경 없음";
  if (background.kind === "any") return "배경 종류 무관 · 배경 있는 포켓몬";
  const label = background.kind === "location" ? "로케이션 배경" : background.kind === "special" ? "스페셜 배경" : "배경";
  return background.name?.trim() ? `${label} · ${background.name.trim()}` : label;
}
