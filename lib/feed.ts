import snapshot from "./feed-snapshot.json" with { type: "json" };
import type {
  EventKind,
  EventTime,
  Feed,
  GoEvent,
  Pokemon,
  RaidBoss,
} from "./pokedoko-types";

const BASE = "https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/";
const OFFICIAL = "https://pokemongo.com/news/into-the-wild-2026";
const names: Record<string, string> = {
  Druddigon: "크리만",
  Orthworm: "꿈트렁",
  "Zacian (Crowned Sword)": "자시안 · 검왕",
  "Zamazenta (Crowned Shield)": "자마젠타 · 방패왕",
  Larvitar: "애버라스",
  Mudkip: "물짱이",
  Makuhita: "마크탕",
  Cranidos: "두개도스",
  Poliwhirl: "슈륙챙이",
  Piloswine: "메꾸리",
  Prinplup: "팽태자",
  "Tornadus (Incarnate)": "토네로스 · 화신",
  Magnemite: "코일",
  Noibat: "음뱃",
  Togedemaru: "토게데마루",
  Grookey: "흥나숭",
  Scorbunny: "염버니",
  Sobble: "울머기",
  Pawniard: "자망칼",
  Cresselia: "크레세리아",
  Darkrai: "다크라이",
  "Mega Banette": "메가다크펫",
  "Mega Metagross": "메가메타그로스",
  "Mega Sableye": "메가깜까미",
  "Deoxys (Normal)": "테오키스 · 노말",
  "Deoxys (Defense)": "테오키스 · 디펜스",
  "Deoxys (Attack)": "테오키스 · 어택",
  "Deoxys (Speed)": "테오키스 · 스피드",
};
const eventNames: Record<string, string> = {
  "into-the-wild-2026": "와일드 에리어로 가는 길",
  "pokemon-go-wild-area-2026-global": "GO 와일드 에리어 2026 · 글로벌",
  "november-communityday2026": "자망칼 커뮤니티 데이",
  raidhour20261118: "크레세리아 · 다크라이 레이드아워",
  raidhour20261125: "테오키스 레이드아워",
  "pokemonspotlighthour2026-11-19": "흥나숭 · 염버니 · 울머기 스포트라이트아워",
  "pokemonspotlighthour2026-11-26": "음뱃 스포트라이트아워",
  "dynamax-trails-2026": "다이맥스 트레일",
  "clefable-super-mega-raid-day-2026": "메가픽시 슈퍼 메가 레이드 데이",
  "cresselia-darkrai-in-5-star-raid-battles-november-2026":
    "크레세리아 · 다크라이 5성 레이드",
  "mega-banette-in-mega-raids-november-2026": "메가다크펫 레이드",
  "zacian-crowned-sword-zamazenta-crowned-shield-in-5-star-raid-battles-november-2026":
    "검왕 자시안 · 방패왕 자마젠타 레이드",
};
type Entry = Record<string, unknown>;
const object = (value: unknown): Entry =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Entry)
    : {};
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const string = (value: unknown): string =>
  typeof value === "string" ? value : "";
const imageUrl = (value: unknown): string =>
  /^https:\/\//.test(string(value)) ? string(value) : "";
function time(value: unknown): EventTime | null {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/.test(
      value,
    )
  )
    return null;
  const kind = /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? "instant" : "local";
  const plain = value.slice(0, 19),
    parsed = new Date(`${plain}Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 19) !== plain ||
    !Number.isFinite(Date.parse(kind === "local" ? `${value}Z` : value))
  )
    return null;
  return { value, kind };
}
function pokemon(value: unknown): Pokemon | null {
  const raw = object(value),
    name = string(raw.name),
    image = imageUrl(raw.image);
  if (!name) return null;
  const base = name.replace(/^Shadow /, ""),
    id = Number(image.match(/(?:pm|pokemon_icon_)(\d+)/)?.[1]) || null;
  return {
    id,
    name,
    nameKo: `${name.startsWith("Shadow ") ? "그림자 " : ""}${names[base] || base}`,
    image,
    shiny: raw.canBeShiny === true,
    types: list(raw.types)
      .map((t) => string(object(t).name))
      .filter(Boolean),
  };
}
const kindMap: Record<string, EventKind> = {
  "raid-hour": "raid-hour",
  "raid-day": "raid-day",
  "community-day": "community-day",
  "pokemon-spotlight-hour": "spotlight",
  research: "research",
  "timed-research": "research",
  "special-research": "research",
  "research-breakthrough": "research",
};
function extracted(raw: Entry): Pokemon[] {
  const extra = object(raw.extraData),
    spotlight = object(extra.spotlight);
  const result = [
    ...list(object(extra.raidbattles).bosses),
    ...list(object(extra.communityday).spawns),
    ...list(spotlight.list),
    ...(spotlight.name ? [spotlight] : []),
  ]
    .map(pokemon)
    .filter((p): p is Pokemon => p !== null);
  return [...new Map(result.map((p) => [p.name, p])).values()];
}
const officialHours: GoEvent[] = (
  [
    ["09", "Zacian (Crowned Sword)", 888, "자시안 · 검왕"],
    ["10", "Zamazenta (Crowned Shield)", 889, "자마젠타 · 방패왕"],
  ] as const
).map(([day, name, id, nameKo]) => ({
  id: `official-raid-hour-2026-11-${day}`,
  name: `${name} Raid Hour`,
  nameKo: `${nameKo} 레이드아워`,
  kind: "raid-hour",
  start: { value: `2026-11-${day}T18:00:00.000`, kind: "local" },
  end: { value: `2026-11-${day}T19:00:00.000`, kind: "local" },
  image: `https://cdn.leekduck.com/assets/img/pokemon_icons/pm${id}.f${id === 888 ? "CROWNED_SWORD" : "CROWNED_SHIELD"}.icon.png`,
  url: OFFICIAL,
  pokemon: [
    {
      id,
      name,
      nameKo,
      image: `https://cdn.leekduck.com/assets/img/pokemon_icons/pm${id}.f${id === 888 ? "CROWNED_SWORD" : "CROWNED_SHIELD"}.icon.png`,
      shiny: true,
      types: [],
    },
  ],
  summary: "공식 공지 확인 · 각 도시 현지 18:00–19:00",
}));
export function normalizeEvents(raw: unknown): GoEvent[] {
  const events = new Map<string, GoEvent>();
  for (const value of list(raw)) {
    const row = object(value),
      id = string(row.eventID),
      name = string(row.name),
      start = time(row.start),
      end = time(row.end);
    if (
      !id ||
      !name ||
      !start ||
      !end ||
      start.kind !== end.kind ||
      (start.kind === "instant"
        ? Date.parse(start.value) >= Date.parse(end.value)
        : start.value >= end.value)
    )
      continue;
    const kind = kindMap[string(row.eventType)] || "event";
    const featured =
      id === "into-the-wild-2026"
        ? [
            ["Magnemite", 81],
            ["Noibat", 714],
            ["Togedemaru", 777],
          ].map(
            ([name, dex]) =>
              pokemon({
                name,
                image: `https://cdn.leekduck.com/assets/img/pokemon_icons/pm${dex}.icon.png`,
                canBeShiny: true,
              })!,
          )
        : extracted(row);
    events.set(id, {
      id,
      name,
      nameKo: eventNames[id] || name,
      kind,
      start,
      end,
      image: imageUrl(row.image),
      url: id === "into-the-wild-2026" ? OFFICIAL : imageUrl(row.link),
      pokemon: featured,
      summary:
        id === "into-the-wild-2026"
          ? "공식 공지에 소개된 야생 포켓몬 일부예요"
          : start.kind === "local"
            ? "각 도시 현지 시간 기준"
            : "전 세계 같은 시각에 진행",
    });
  }
  // Official exceptions are explicit dates, never an invented weekly recurrence.
  for (const event of officialHours) {
    for (const [id, existing] of events)
      if (
        existing.kind === "raid-hour" &&
        existing.start.value === event.start.value &&
        existing.pokemon.some((p) =>
          event.pokemon.some((q) => p.name === q.name),
        )
      )
        events.delete(id);
    events.set(event.id, event);
  }
  return [...events.values()].sort(
    (a, b) =>
      a.start.value.localeCompare(b.start.value) || a.id.localeCompare(b.id),
  );
}
function koreaWall(now: Date): string {
  return new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 23);
}
export function normalizeBosses(
  raw: unknown,
  events = normalizeEvents(snapshot.events),
  now = new Date(),
): RaidBoss[] {
  const seen = new Set<string>(),
    wall = koreaWall(now);
  return list(raw).flatMap((value) => {
    const row = object(value),
      p = pokemon(row),
      tier = string(row.tier);
    if (!p || !tier || seen.has(`${p.name}|${tier}`)) return [];
    seen.add(`${p.name}|${tier}`);
    const matching = events.find(
      (e) =>
        e.pokemon.some((q) => q.name === p.name) &&
        (e.start.kind === "local"
          ? wall >= e.start.value && wall < e.end.value
          : now.getTime() >= Date.parse(e.start.value) &&
            now.getTime() < Date.parse(e.end.value)),
    );
    const explicit =
      [
        "Druddigon",
        "Orthworm",
        "Zacian (Crowned Sword)",
        "Zamazenta (Crowned Shield)",
      ].includes(p.name) &&
      wall >= "2026-11-09T10:00:00.000" &&
      wall < "2026-11-13T20:00:00.000";
    return [
      {
        ...p,
        tier,
        confirmedWindow: Boolean(matching || explicit),
        sourceUrl: explicit
          ? OFFICIAL
          : matching?.url || "https://leekduck.com/boss/",
      },
    ];
  });
}
const source = "LeekDuck / ScrapedDuck";
export const FALLBACK_FEED: Feed = {
  events: normalizeEvents(snapshot.events),
  bosses: normalizeBosses(snapshot.bosses),
  fetchedAt: snapshot.fetchedAt,
  source,
  sourceUrl: "https://github.com/bigfoott/ScrapedDuck",
  cached: true,
  error: null,
};
let state = {
  events: FALLBACK_FEED.events,
  bossesRaw: snapshot.bosses as unknown,
  eventsAt: snapshot.fetchedAt,
  bossesAt: snapshot.fetchedAt,
};
let lastAttempt = 0,
  previous: Feed | null = null,
  pending: Promise<Feed> | null = null;
export async function loadFeed(): Promise<Feed> {
  if (previous && Date.now() - lastAttempt < 300_000)
    return {
      ...previous,
      bosses: normalizeBosses(state.bossesRaw, state.events),
    };
  if (pending) return pending;
  pending = (async () => {
    lastAttempt = Date.now();
    const fetchJson = async (file: string) => {
      const response = await fetch(`${BASE}${file}.min.json`, {
        signal: AbortSignal.timeout(8000),
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: unknown = await response.json();
      if (
        !Array.isArray(data) ||
        !data.length ||
        (file === "events"
          ? normalizeEvents(data).length <= officialHours.length
          : normalizeBosses(data, []).length === 0)
      )
        throw new Error("Empty or invalid feed");
      return data;
    };
    const [events, bosses] = await Promise.allSettled([
      fetchJson("events"),
      fetchJson("raids"),
    ]);
    const fetchedAt = new Date().toISOString(),
      failed = events.status === "rejected" || bosses.status === "rejected";
    if (events.status === "fulfilled") {
      state.events = normalizeEvents(events.value);
      state.eventsAt = fetchedAt;
    }
    if (bosses.status === "fulfilled") {
      state.bossesRaw = bosses.value;
      state.bossesAt = fetchedAt;
    }
    previous = {
      events: state.events,
      bosses: normalizeBosses(state.bossesRaw, state.events),
      fetchedAt: [state.eventsAt, state.bossesAt].sort()[0],
      source,
      sourceUrl: FALLBACK_FEED.sourceUrl,
      cached: failed,
      error: failed
        ? "일부 정보를 가져오지 못해 마지막으로 확인한 정보를 함께 보여드려요."
        : null,
    };
    return previous;
  })()
    .catch(() => ({
      ...FALLBACK_FEED,
      error: "연결하지 못해 저장된 정보를 보여드려요.",
    }))
    .finally(() => {
      pending = null;
    });
  return pending;
}
