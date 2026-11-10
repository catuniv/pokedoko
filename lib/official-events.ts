import type { EventTime, GoEvent, Pokemon } from "./pokedoko-types";

// Confirmed official notices, checked 2026-11-10. These are dated events,
// never a recurrence rule. The community feed remains the automatic source.
const WILD_AREA_URL = "https://pokemongo.com/ko/gowildarea/global";
const DYNAMAX_URL = "https://pokemongo.com/ko/news/dynamax-trails-eternamax-eternatus-2026";
const WHITE_IMAGE = "https://lh3.googleusercontent.com/rZ5F64_bgthtpamfHuXVTHrNPcpNUikFzSvvlrKYDmu0-hYXrllAdK8UF7KpSm8fkPQiSgqL2pSMz37nEPkfyJjvCj5aUPRINdoKi2u05xY=s0-e365";
const BLACK_IMAGE = "https://lh3.googleusercontent.com/z0I8oSy7YfD3nba83l6RAcYhupDaxoQT6Go1KXuX1_jEtWlWBmp2igqvEDFImfiVeBO-v_MX1q-NBhT8IF9LMXykX-VfxmypIo9bcoDaiHt3=s0-e365";

const local = (value: string): EventTime => ({ value, kind: "local" });
const pokemon = (
  id: number,
  name: string,
  nameKo: string,
  options: Partial<Pick<Pokemon, "image" | "shiny" | "types" | "form">> = {},
): Pokemon => ({ id, name, nameKo, image: "", shiny: false, types: [], ...options });

export const OFFICIAL_EVENTS: GoEvent[] = [
  {
    id: "go-wild-area-2026-global-saturday",
    name: "GO Wild Area: Global — White Kyurem and Zekrom",
    nameKo: "GO 와일드 에리어: 화이트큐레무·제크로무",
    kind: "event",
    start: local("2026-11-14T10:00:00"),
    end: local("2026-11-14T18:00:00"),
    image: WHITE_IMAGE,
    url: WILD_AREA_URL,
    pokemon: [
      pokemon(646, "White Kyurem", "화이트큐레무", { form: "white", image: WHITE_IMAGE, shiny: true, types: ["dragon", "ice"] }),
      pokemon(644, "Zekrom", "제크로무", { shiny: true, types: ["dragon", "electric"] }),
    ],
    summary: "현지 10~18시 전설 레이드에 등장해요. 화이트큐레무 레이드로 합체 에너지를 얻을 수 있어요. 한정 리서치·추가 보너스는 글로벌 티켓 대상이에요.",
  },
  {
    id: "go-wild-area-2026-global-sunday",
    name: "GO Wild Area: Global — Black Kyurem and Reshiram",
    nameKo: "GO 와일드 에리어: 블랙큐레무·레시라무",
    kind: "event",
    start: local("2026-11-15T10:00:00"),
    end: local("2026-11-15T18:00:00"),
    image: BLACK_IMAGE,
    url: WILD_AREA_URL,
    pokemon: [
      pokemon(646, "Black Kyurem", "블랙큐레무", { form: "black", image: BLACK_IMAGE, shiny: true, types: ["dragon", "ice"] }),
      pokemon(643, "Reshiram", "레시라무", { shiny: true, types: ["dragon", "fire"] }),
    ],
    summary: "현지 10~18시 전설 레이드에 등장해요. 한정 리서치·추가 보너스는 글로벌 티켓 대상이에요. 레이드 아워와는 별도 이벤트예요.",
  },
  {
    id: "dynamax-trails-2026",
    name: "Dynamax Trails",
    nameKo: "커다란 발자국",
    kind: "event",
    start: local("2026-11-16T10:00:00"),
    end: local("2026-11-23T20:00:00"),
    image: "",
    url: DYNAMAX_URL,
    pokemon: [],
    summary: "다이맥스 포켓몬과 GO패스 이벤트예요. 기본 GO패스는 무료예요. 와일드 위크 GO패스 티어 1 보상을 받은 트레이너는 11월 14일 10시부터 먼저 이용할 수 있어요.",
  },
  {
    id: "pokemonspotlighthour2026-11-19",
    name: "Grookey, Scorbunny and Sobble Spotlight Hour",
    nameKo: "흥나숭·염버니·울머기 스포트라이트 아워",
    kind: "spotlight",
    start: local("2026-11-19T18:00:00"),
    end: local("2026-11-19T19:00:00"),
    image: "",
    url: DYNAMAX_URL,
    pokemon: [
      pokemon(810, "Grookey", "흥나숭", { shiny: true, types: ["grass"] }),
      pokemon(813, "Scorbunny", "염버니", { shiny: true, types: ["fire"] }),
      pokemon(816, "Sobble", "울머기", { shiny: true, types: ["water"] }),
    ],
    summary: "현지 18~19시 세 포켓몬이 많이 등장하고, 잡았을 때 받는 사탕이 2배예요. 레이드 이벤트가 아니에요.",
  },
  {
    id: "eternamax-eternatus-2026-11-21",
    name: "Eternamax Eternatus Returns",
    nameKo: "무한다이노(무한다이맥스) 귀환",
    kind: "event",
    start: local("2026-11-21T11:00:00"),
    end: local("2026-11-21T14:00:00"),
    image: "",
    url: DYNAMAX_URL,
    pokemon: [pokemon(890, "Eternamax Eternatus", "무한다이노(무한다이맥스)", { form: "eternamax", types: ["poison", "dragon"] })],
    summary: "현지 11~14시 맥스배틀에 등장해요. 승리 후 무한다이맥스는 잡을 수 없어요. 일반 무한다이노는 GO패스 보상이며, 이미 잡았다면 추가로 잡을 수 없어요.",
  },
  {
    id: "november-communityday2026",
    name: "November 2026 Community Day: Pawniard",
    nameKo: "11월 커뮤니티 데이: 자망칼",
    kind: "community-day",
    start: local("2026-11-21T14:00:00"),
    end: local("2026-11-21T17:00:00"),
    image: "",
    url: "https://pokemongo.com/ko/news/communityday-november-2026-pawniard",
    pokemon: [pokemon(624, "Pawniard", "자망칼", { shiny: true, types: ["dark", "steel"] })],
    summary: "현지 14~17시 자망칼이 많이 등장해요. 일부 보너스와 진화 특전은 21시까지 이어져요. 유료 리서치는 선택 사항이에요.",
  },
  {
    id: "twilight-wishes-2026",
    name: "Twilight Wishes",
    nameKo: "황혼의 소원",
    kind: "event",
    start: local("2026-11-24T10:00:00"),
    end: local("2026-11-30T20:00:00"),
    image: "",
    url: "https://pokemongo.com/ko/news/twilight-wishes-2026",
    pokemon: [
      pokemon(35, "Clefairy", "삐삐", { shiny: true, types: ["fairy"] }),
      pokemon(120, "Staryu", "별가사리", { shiny: true, types: ["water"] }),
      pokemon(605, "Elgyem", "리그레", { shiny: true, types: ["psychic"] }),
      pokemon(744, "Rockruff", "암멍이", { shiny: true, types: ["rock"] }),
    ],
    summary: "삐삐·별가사리·리그레·암멍이 등이 야생에 등장해요. 특별한 의상의 피카츄·에브이·블래키는 레이드에 등장해요. 기본 GO패스는 무료이고 디럭스는 선택 사항이에요.",
  },
  {
    id: "clefable-super-mega-raid-day-2026",
    name: "Clefable Super Mega Raid Day",
    nameKo: "픽시 슈퍼 메가 레이드 데이",
    kind: "raid-day",
    start: local("2026-11-28T14:00:00"),
    end: local("2026-11-28T17:00:00"),
    image: "",
    url: "https://pokemongo.com/ko/news/clefable-super-mega-raid-day-2026",
    pokemon: [pokemon(36, "Mega Clefable", "메가픽시", { form: "mega", shiny: true, types: ["fairy"] })],
    summary: "현지 14~17시 대상 체육관에서 슈퍼 메가 레이드가 열려요. 모든 체육관에 등장하는 것은 아니에요. 유료 이벤트 티켓은 추가 보너스용이에요.",
  },
];

function canonicalOfficialUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (!["pokemongo.com", "www.pokemongo.com", "pokemongolive.com", "www.pokemongolive.com"].includes(url.hostname)) return null;
    const path = url.pathname.replace(/^\/[a-z]{2}(?:-[a-z]{2})?(?=\/)/i, "").replace(/\/+$/, "");
    return `pokemon-go-official:${path}`;
  } catch {
    return null;
  }
}

function timeSlot(time: EventTime): string {
  // Community feeds may serialize identical local timestamps with .000.
  return `${time.kind}:${time.value.replace(/\.0+(?=Z?$)/, "")}`;
}

/** Official values win only over the same ID or official URL and exact slot.
 * A full-weekend umbrella and its dated raid lineups remain separate events.
 */
export function withOfficialEvents(events: GoEvent[]): GoEvent[] {
  const merged = new Map(events.map(event => [event.id, event]));
  for (const official of OFFICIAL_EVENTS) {
    const officialUrl = canonicalOfficialUrl(official.url);
    for (const [id, event] of merged) {
      if (id === official.id || (
        officialUrl !== null && canonicalOfficialUrl(event.url) === officialUrl &&
        timeSlot(event.start) === timeSlot(official.start) &&
        timeSlot(event.end) === timeSlot(official.end)
      )) merged.delete(id);
    }
    merged.set(official.id, official);
  }
  return [...merged.values()].sort((a, b) => a.start.value.localeCompare(b.start.value) || a.id.localeCompare(b.id));
}
