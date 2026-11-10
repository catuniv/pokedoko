import type { City } from "./pokedoko-types";

/** Community recommendations with linked evidence and representative place coordinates.
 * Place coordinates do not claim that a live gym or lobby exists there. */
export const CITIES: City[] = [
  {
    id: "seoul",
    name: "서울",
    nameEn: "Seoul",
    country: "대한민국",
    countryCode: "KR",
    zone: "Asia/Seoul",
    region: "asia",
    lat: 37.5665,
    lon: 126.978,
    spots: [
      {
        name: "강남역",
        lat: 37.4979278,
        lon: 127.0275833,
        note: "현지 플레이어가 레이드·맥스배틀 경험을 바탕으로 추천. 역 대표 좌표.",
        sourceUrl:
          "https://www.reddit.com/r/TheSilphRoad/comments/1ku0omk/pok%C3%A9mon_go_in_seoul/",
        coordinateSource: "https://en.wikipedia.org/wiki/Gangnam_station",
      },
      {
        name: "명동거리",
        lat: 37.5637,
        lon: 126.984,
        note: "직접 방문한 플레이어가 GO Fest 레이드 참가 경험을 공유. 명동 지역 대표 좌표.",
        sourceUrl:
          "https://www.reddit.com/r/pokemongo/comments/1e05kih/good_locations_to_play_in_seoul/",
        coordinateSource: "https://en.wikipedia.org/wiki/Myeong-dong",
      },
      {
        name: "홍대입구역 일대",
        lat: 37.55667,
        lon: 126.92361,
        note: "서울 방문 플레이어가 홍대의 레이드 참여 인원을 근거로 추천. 역 대표 좌표.",
        sourceUrl:
          "https://www.reddit.com/r/seoul/comments/16sef5g/pok%C3%A9mon_players/",
        coordinateSource:
          "https://en.wikipedia.org/wiki/Hongik_University_station",
      },
      {
        name: "서울숲",
        lat: 37.544625,
        lon: 127.0398444,
        note: "서울 플레이어의 추천 지역에 포함된 공원. 공원 대표 좌표.",
        sourceUrl:
          "https://www.reddit.com/r/seoul/comments/16sef5g/pok%C3%A9mon_players/",
        coordinateSource: "https://en.wikipedia.org/wiki/Seoul_Forest",
      },
      {
        name: "인사동 거리",
        lat: 37.572972,
        lon: 126.98618,
        note: "플레이어가 인사동·쌈지길 주변 포켓스톱 동선을 추천. 인사동 지역 대표 좌표.",
        sourceUrl:
          "https://www.reddit.com/r/seoul/comments/16sef5g/pok%C3%A9mon_players/",
        coordinateSource: "https://en.wikipedia.org/wiki/Insa-dong",
      },
    ],
  },
  {
    id: "tokyo",
    name: "도쿄",
    nameEn: "Tokyo",
    country: "일본",
    countryCode: "JP",
    zone: "Asia/Tokyo",
    region: "asia",
    lat: 35.6762,
    lon: 139.6503,
    spots: [
      {
        name: "이케부쿠로역",
        lat: 35.730277777778,
        lon: 139.71138888889,
        note: "현지 플레이어가 동쪽 출구를 레이드 동선으로 추천. 좌표는 역 대표점.",
        sourceUrl: "https://rocketnews24.com/2026/04/21/2752847/",
        coordinateSource: "https://www.wikidata.org/wiki/Q173919#P625",
      },
      {
        name: "신주쿠역",
        lat: 35.69083333333333,
        lon: 139.70027777777779,
        note: "직접 플레이한 기자가 서쪽 출구와 주변 지역을 포획·레이드 동선으로 추천. 역 대표 좌표.",
        sourceUrl: "https://rocketnews24.com/2026/04/21/2752847/",
        coordinateSource: "https://www.wikidata.org/wiki/Q801447#P625",
      },
      {
        name: "아키하바라역",
        lat: 35.69833333333333,
        lon: 139.77305555555554,
        note: "직접 플레이한 기자가 우에노부터 아키하바라까지의 동선을 추천. JR역 대표 좌표.",
        sourceUrl: "https://rocketnews24.com/2026/04/21/2752847/",
        coordinateSource: "https://www.wikidata.org/wiki/Q800374#P625",
      },
      {
        name: "우에노 공원",
        lat: 35.712222,
        lon: 139.771111,
        note: "지역 플레이 가이드가 야생 포획과 공원 남쪽 레이드를 추천. 공원 대표 좌표.",
        sourceUrl: "https://pokemongo-raku.com/post156463",
        coordinateSource: "https://www.wikidata.org/wiki/Q746216#P625",
      },
      {
        name: "시부야역",
        lat: 35.658513888889,
        lon: 139.70133055556,
        note: "현지 레이드 경험을 공유한 댓글에서 시부야의 플레이 활동을 추천. 역 대표 좌표.",
        sourceUrl:
          "https://www.reddit.com/r/TheSilphRoad/comments/1tndnco/best_gym_density_in_tokyo/",
        coordinateSource: "https://www.wikidata.org/wiki/Q428811#P625",
      },
    ],
  },
  {
    id: "taipei",
    name: "타이베이",
    nameEn: "Taipei",
    country: "대만",
    countryCode: "TW",
    zone: "Asia/Taipei",
    region: "asia",
    lat: 25.033,
    lon: 121.5654,
    spots: [
      {
        name: "타이베이 메인역",
        lat: 25.0475,
        lon: 121.517,
        note: "타이베이를 자주 방문하는 플레이어가 비 오는 날의 레이드 장소로 추천. 역 대표 좌표.",
        sourceUrl:
          "https://www.reddit.com/r/taiwan/comments/1m8rbye/best_places_to_play_pok%C3%A9mon_go/",
        coordinateSource: "https://en.wikipedia.org/wiki/Taipei_Main_Station",
      },
      {
        name: "다안 삼림공원",
        lat: 25.0297299,
        lon: 121.5361368,
        note: "직접 방문하는 플레이어가 맑은 날의 플레이 장소로 추천. 공원 대표 좌표.",
        sourceUrl:
          "https://www.reddit.com/r/taiwan/comments/1m8rbye/best_places_to_play_pok%C3%A9mon_go/",
        coordinateSource: "https://en.wikipedia.org/wiki/Daan_Forest_Park",
      },
      {
        name: "베이터우 공원",
        lat: 25.1365,
        lon: 121.506333,
        note: "타이베이 이용자들이 작성한 포켓몬 GO 추천 목록에 포함. 공원 대표 좌표.",
        sourceUrl:
          "https://www.reddit.com/r/taiwan/comments/1m8rbye/best_places_to_play_pok%C3%A9mon_go/",
        coordinateSource: "https://en.wikipedia.org/wiki/Beitou_Park",
      },
      {
        name: "시먼딩",
        lat: 25.042643,
        lon: 121.507539,
        note: "타이베이 플레이어의 추천 목록에 포함된 보행자 지역. 한중거리·청두로 교차점 좌표.",
        sourceUrl:
          "https://www.reddit.com/r/taiwan/comments/1m8rbye/best_places_to_play_pok%C3%A9mon_go/",
        coordinateSource: "https://en.wikipedia.org/wiki/Ximending",
      },
      {
        name: "송산 문창원구",
        lat: 25.04361,
        lon: 121.5625,
        note: "이용자가 실내 순환 동선과 커뮤니티 모임 장소를 추천. 시설 대표 좌표.",
        sourceUrl:
          "https://www.reddit.com/r/taiwan/comments/1m8rbye/best_places_to_play_pok%C3%A9mon_go/",
        coordinateSource:
          "https://en.wikipedia.org/wiki/Songshan_Cultural_and_Creative_Park",
      },
    ],
  },
  {
    id: "hong-kong",
    name: "홍콩",
    nameEn: "Hong Kong",
    country: "홍콩",
    countryCode: "HK",
    zone: "Asia/Hong_Kong",
    region: "asia",
    lat: 22.3193,
    lon: 114.1694,
    spots: [
      {
        name: "빅토리아 공원",
        lat: 22.28194,
        lon: 114.18806,
        note: "2026년 직접 방문한 플레이어가 레이드 참가 경험을 추천. 공원 대표 좌표.",
        sourceUrl:
          "https://www.reddit.com/r/PokemonGoMystic/comments/1uckimm/is_there_much_a_pogo_scene_in_hong_kong/",
        coordinateSource:
          "https://en.wikipedia.org/wiki/Victoria_Park_(Hong_Kong)",
      },
      {
        name: "엘리먼츠 쇼핑몰",
        lat: 22.3045,
        lon: 114.16135,
        note: "홍콩 플레이어가 레이드 장소로 직접 추천한 구룡역 위 쇼핑몰. 시설 대표 좌표.",
        sourceUrl:
          "https://www.reddit.com/r/PokemonGoMystic/comments/1uckimm/is_there_much_a_pogo_scene_in_hong_kong/",
        coordinateSource: "https://www.wikidata.org/wiki/Q5358920#P625",
      },
      {
        name: "카우룽 공원",
        lat: 22.30143,
        lon: 114.16986,
        note: "시티사파리 참가자가 항구의 GPS 문제와 달리 공원에서는 정상 플레이했다고 보고. 공원 대표 좌표.",
        sourceUrl:
          "https://www.reddit.com/r/TheSilphRoad/comments/1h8jw0t/gps_bug_in_hong_kong_city_safari_event/",
        coordinateSource: "https://en.wikipedia.org/wiki/Kowloon_Park",
      },
    ],
  },
  {
    id: "singapore",
    name: "싱가포르",
    nameEn: "Singapore",
    country: "싱가포르",
    countryCode: "SG",
    zone: "Asia/Singapore",
    region: "asia",
    lat: 1.3521,
    lon: 103.8198,
    spots: [
      {
        name: "비보시티",
        lat: 1.26389,
        lon: 103.822,
        note: "싱가포르 커뮤니티가 레이드 중심 장소로 추천한 실내 쇼핑몰입니다.",
        sourceUrl:
          "https://www.reddit.com/r/PokemonGo_Singapore/comments/1lln7v0/breakdown_on_the_best_places_to_play_pokemon_go/",
        coordinateSource: "https://www.wikidata.org/wiki/Q7937930#P625",
      },
      {
        name: "선텍 시티",
        lat: 1.294722222222222,
        lon: 103.85888888888888,
        note: "분수와 주변 건물 동선의 포켓몬 출현과 실내 이동 환경이 추천됐습니다.",
        sourceUrl:
          "https://www.reddit.com/r/PokemonGo_Singapore/comments/1lln7v0/breakdown_on_the_best_places_to_play_pokemon_go/",
        coordinateSource: "https://www.wikidata.org/wiki/Q3268183#P625",
      },
      {
        name: "내셔널 스타디움·스포츠 허브",
        lat: 1.3044065,
        lon: 103.8742626,
        note: "스포츠 허브 일대의 포획과 이벤트 모임 장소로 추천됐습니다.",
        sourceUrl:
          "https://www.reddit.com/r/PokemonGo_Singapore/comments/1lln7v0/breakdown_on_the_best_places_to_play_pokemon_go/",
        coordinateSource: "https://www.wikidata.org/wiki/Q4201688#P625",
      },
      {
        name: "마리나 베이 샌즈",
        lat: 1.2825,
        lon: 103.86,
        note: "실내 순환 동선에서 포획과 레이드를 함께 할 수 있는 장소로 소개됐습니다.",
        sourceUrl:
          "https://www.reddit.com/r/PokemonGo_Singapore/comments/1lln7v0/breakdown_on_the_best_places_to_play_pokemon_go/",
        coordinateSource: "https://www.wikidata.org/wiki/Q548679#P625",
      },
      {
        name: "차이나타운 포인트",
        lat: 1.28528,
        lon: 103.845,
        note: "주변의 가까운 체육관 동선으로 소개됐으며, 이용자들이 비보시티로 분산됐다는 의견도 있습니다.",
        sourceUrl:
          "https://www.reddit.com/r/PokemonGo_Singapore/comments/1lln7v0/breakdown_on_the_best_places_to_play_pokemon_go/",
        coordinateSource: "https://www.wikidata.org/wiki/Q18111169#P625",
      },
    ],
  },
  {
    id: "bangkok",
    name: "방콕",
    nameEn: "Bangkok",
    country: "태국",
    countryCode: "TH",
    zone: "Asia/Bangkok",
    region: "asia",
    lat: 13.7563,
    lon: 100.5018,
    spots: [
      {
        name: "시암 BTS역 일대",
        lat: 13.7456194,
        lon: 100.5342278,
        note: "방콕 플레이어가 시암역 주변의 레이드 참가 경험을 추천. 역 대표 좌표.",
        sourceUrl:
          "https://www.reddit.com/r/TheSilphRoad/comments/11p8fwq/trip_report_tokyo_the_greatest_pok%C3%A9mon_go_city_on/",
        coordinateSource: "https://en.wikipedia.org/wiki/Siam_BTS_station",
      },
      {
        name: "시암 파라곤",
        lat: 13.74639,
        lon: 100.535,
        note: "방콕 플레이어가 시암 일대를 추천하며 후원 포켓스톱 변경 경험도 설명. 쇼핑몰 대표 좌표.",
        sourceUrl:
          "https://www.reddit.com/r/TheSilphRoad/comments/11p8fwq/trip_report_tokyo_the_greatest_pok%C3%A9mon_go_city_on/",
        coordinateSource: "https://en.wikipedia.org/wiki/Siam_Paragon",
      },
      {
        name: "룸피니 공원",
        lat: 13.73056,
        lon: 100.54167,
        note: "지역 이용자가 레이드아워 모임이 있다고 직접 설명. 공원 대표 좌표.",
        sourceUrl:
          "https://www.reddit.com/r/TheSilphRoad/comments/11p8fwq/trip_report_tokyo_the_greatest_pok%C3%A9mon_go_city_on/",
        coordinateSource: "https://en.wikipedia.org/wiki/Lumphini_Park",
      },
      {
        name: "벤차시리 공원",
        lat: 13.7303389,
        lon: 100.5673194,
        note: "지역 이용자가 아이템 수집용 순환 동선을 추천. 벤차낏티와 다른 공원.",
        sourceUrl:
          "https://www.reddit.com/r/TheSilphRoad/comments/11p8fwq/trip_report_tokyo_the_greatest_pok%C3%A9mon_go_city_on/",
        coordinateSource: "https://en.wikipedia.org/wiki/Benchasiri_Park",
      },
      {
        name: "센트럴월드",
        lat: 13.74694,
        lon: 100.53972,
        note: "2016년 지역 포켓몬 커뮤니티 운영자가 직접 추천한 실내 장소. 최근 인원·지점 수를 보장하지 않음.",
        sourceUrl:
          "https://www.khaosodenglish.com/tech/2016/08/10/survival-guide-bangkok-pokemon-go-trainers/",
        coordinateSource: "https://en.wikipedia.org/wiki/CentralWorld",
      },
    ],
  },
  {
    id: "dubai",
    name: "두바이",
    nameEn: "Dubai",
    country: "아랍에미리트",
    countryCode: "AE",
    zone: "Asia/Dubai",
    region: "asia",
    lat: 25.2048,
    lon: 55.2708,
    spots: [
      {
        name: "이븐 바투타 몰",
        lat: 25.04468,
        lon: 55.12194,
        note: "현지 이용자가 이벤트 주말 모임 장소로 추천한 쇼핑몰",
        sourceUrl:
          "https://www.reddit.com/r/DubaiGaming/comments/1mmtkm9/is_there_anyone_who_still_plays_pokemon_go/",
        coordinateSource: "https://www.wikidata.org/wiki/Q511504#P625",
      },
      {
        name: "JBR 해변 지구",
        lat: 25.0772222,
        lon: 55.1348694,
        note: "현지 커뮤니티 운영자가 커뮤니티데이 플레이 장소로 소개한 구역",
        sourceUrl:
          "https://www.reddit.com/r/DubaiGaming/comments/y1xrcz/pokemon_gois_it_played_in_dubai/",
        coordinateSource: "https://www.wikidata.org/wiki/Q1466585#P625",
      },
      {
        name: "두바이 몰",
        lat: 25.1975,
        lon: 55.2791667,
        note: "방문 이용자가 여러 포켓스톱과 체육관을 확인한 실내 구역",
        sourceUrl: "https://note.com/talatatta/n/n4e3e4acd59c0?hl=en",
        coordinateSource: "https://www.wikidata.org/wiki/Q1133309#P625",
      },
      {
        name: "에미레이트 몰",
        lat: 25.1180556,
        lon: 55.2005556,
        note: "방문 이용자가 체육관과 쉬어 갈 공간을 소개한 실내 구역",
        sourceUrl: "https://note.com/talatatta/n/n4e3e4acd59c0?hl=en",
        coordinateSource: "https://www.wikidata.org/wiki/Q1066448#P625",
      },
      {
        name: "글로벌 빌리지",
        lat: 25.068749,
        lon: 55.30626,
        note: "이용자가 포켓스톱 밀집 화면을 공유한 장소 · 유료 입장",
        sourceUrl:
          "https://www.reddit.com/r/pokemongo/comments/1p08ykx/rip_inventory/",
        coordinateSource: "https://www.wikidata.org/wiki/Q5570759#P625",
      },
    ],
  },
  {
    id: "sydney",
    name: "시드니",
    nameEn: "Sydney",
    country: "호주",
    countryCode: "AU",
    zone: "Australia/Sydney",
    region: "oceania",
    lat: -33.8688,
    lon: 151.2093,
    spots: [
      {
        name: "하이드 파크",
        lat: -33.873333,
        lon: 151.211389,
        note: "현지 플레이어가 커뮤니티 데이와 레이드 모임 장소로 추천한 공원입니다.",
        sourceUrl: "https://www.reddit.com/r/unsw/comments/1x5bpjn/pokemon_go/",
        coordinateSource: "https://www.wikidata.org/wiki/Q1144894#P625",
      },
      {
        name: "로열 보타닉 가든",
        lat: -33.862222,
        lon: 151.2175,
        note: "현지 커뮤니티가 포획과 커뮤니티 데이 동선으로 추천한 정원입니다.",
        sourceUrl:
          "https://www.reddit.com/r/pokemongo/comments/1u79kam/where_to_play_community_day_sydney_aus/",
        coordinateSource: "https://www.wikidata.org/wiki/Q54489#P625",
      },
      {
        name: "시드니 오페라 하우스",
        lat: -33.857058,
        lon: 151.214897,
        note: "지역 플레이어들이 이벤트 모임 장소로 언급했습니다. 건물 대표 좌표입니다.",
        sourceUrl:
          "https://www.reddit.com/r/pokemongo/comments/1u79kam/where_to_play_community_day_sydney_aus/",
        coordinateSource: "https://www.wikidata.org/wiki/Q45178#P625",
      },
      {
        name: "서큘러 키",
        lat: -33.861,
        lon: 151.211,
        note: "서큘러 키·오페라 하우스·보타닉 가든을 잇는 커뮤니티 모임 동선으로 소개됐습니다.",
        sourceUrl: "https://www.reddit.com/r/pokemongo/comments/1myr0uz/",
        coordinateSource: "https://www.wikidata.org/wiki/Q1092910#P625",
      },
      {
        name: "달링 하버",
        lat: -33.872222222222,
        lon: 151.19916666667,
        note: "시드니 커뮤니티의 시티 사파리 안내에서 소개한 활동 구역입니다. 항구 대표 좌표입니다.",
        sourceUrl:
          "https://leekduck.com/events/pokemon-go-city-safari-sydney-2025/",
        coordinateSource: "https://www.wikidata.org/wiki/Q54488#P625",
      },
    ],
  },
  {
    id: "perth",
    name: "퍼스",
    nameEn: "Perth",
    country: "호주",
    countryCode: "AU",
    zone: "Australia/Perth",
    region: "oceania",
    lat: -31.9505,
    lon: 115.8605,
    spots: [
      {
        name: "킹스 파크",
        lat: -31.962135,
        lon: 115.831712,
        note: "현지 이용자들이 이벤트와 레이드 모임 장소로 반복 추천한 공원입니다.",
        sourceUrl: "https://www.reddit.com/r/perth/comments/1bw63hg/",
        coordinateSource:
          "https://en.wikipedia.org/wiki/Kings_Park,_Western_Australia",
      },
      {
        name: "엘리자베스 키",
        lat: -31.9575,
        lon: 115.857,
        note: "퍼스 이용자가 포켓몬 GO와 함께 걷는 도심·강변 동선으로 소개했습니다.",
        sourceUrl: "https://www.reddit.com/r/perth/comments/hqh9in/",
        coordinateSource: "https://en.wikipedia.org/wiki/Elizabeth_Quay",
      },
      {
        name: "포리스트 플레이스 일대",
        lat: -31.9522,
        lon: 115.859,
        note: "그린 캑터스 주변이 지역 레이드 모임 동선으로 언급됐습니다. 광장 서쪽 대표점입니다.",
        sourceUrl: "https://www.reddit.com/r/perth/comments/1e2t4zx/",
        coordinateSource:
          "https://latitude.to/map/au/australia/regions/state-of-western-australia/cities/perth/articles/137053/general-post-office-perth",
      },
      {
        name: "힐러리스 보트 하버",
        lat: -31.8236378,
        lon: 115.7420294,
        note: "커뮤니티 위키의 트레이너 장소 기록(2016)에 포함된 구역입니다. 현재 게임 구성은 달라질 수 있습니다.",
        sourceUrl: "https://pkmngotrading.com/wiki/Australia",
        coordinateSource: "https://pkmngotrading.com/wiki/Australia",
      },
      {
        name: "사우스 퍼스 에스플러네이드",
        lat: -31.97153204,
        lon: 115.85327625,
        note: "커뮤니티의 과거 플레이 기록(2017)이 있는 강변 구역입니다. 현재 출현 정보는 아닙니다.",
        sourceUrl: "https://pkmngotrading.com/wiki/South_Perth",
        coordinateSource: "https://pkmngotrading.com/wiki/South_Perth",
      },
    ],
  },
  {
    id: "auckland",
    name: "오클랜드",
    nameEn: "Auckland",
    country: "뉴질랜드",
    countryCode: "NZ",
    zone: "Pacific/Auckland",
    region: "oceania",
    lat: -36.8485,
    lon: 174.7633,
    spots: [
      {
        name: "사일로 파크",
        lat: -36.8403106,
        lon: 174.7553856,
        note: "현지 이용자가 커뮤니티 앰배서더의 레이드아워 모임 장소로 추천했습니다.",
        sourceUrl:
          "https://www.reddit.com/r/auckland/comments/1w61rkh/pokemon_go/",
        coordinateSource:
          "https://nz.near-place.com/silo-park-beaumont-street-and-jellicoe-street-auckland",
      },
      {
        name: "브리토마트·와이테마타역",
        lat: -36.8445,
        lon: 174.7691,
        note: "브리토마트 주변 체육관을 잇는 이벤트 동선으로 추천됐습니다. 역 대표 좌표입니다.",
        sourceUrl:
          "https://www.reddit.com/r/auckland/comments/1w61rkh/pokemon_go/",
        coordinateSource:
          "https://en.wikipedia.org/wiki/Waitematā_railway_station",
      },
      {
        name: "바이아덕트 하버",
        lat: -36.843534,
        lon: 174.760015,
        note: "현지 이용자가 윈야드 쿼터와 함께 도심 플레이 구역으로 소개했습니다.",
        sourceUrl:
          "https://www.reddit.com/r/auckland/comments/1w61rkh/pokemon_go/",
        coordinateSource: "https://en.wikipedia.org/wiki/Viaduct_Harbour",
      },
      {
        name: "앨버트 파크",
        lat: -36.85064,
        lon: 174.76789,
        note: "오클랜드 이용자가 도심 워터프런트의 대안으로 추천한 공원입니다.",
        sourceUrl:
          "https://www.reddit.com/r/PokemonGoSpoofing/comments/cxswpq/",
        coordinateSource:
          "https://mbd-db.osu.edu/hol/localities/90a5d3d1-5bf3-4f44-b614-4513f39e35e8",
      },
      {
        name: "도심 워터프런트 추천 지점",
        lat: -36.84331,
        lon: 174.766245,
        note: "오클랜드 이용자가 직접 공유한 워터프런트 좌표입니다. 개별 체육관 위치는 아닙니다.",
        sourceUrl:
          "https://www.reddit.com/r/PokemonGoSpoofing/comments/cxswpq/",
        coordinateSource:
          "https://www.reddit.com/r/PokemonGoSpoofing/comments/cxswpq/",
      },
    ],
  },
  {
    id: "kiritimati",
    name: "키리티마티",
    nameEn: "Kiritimati",
    country: "키리바시",
    countryCode: "KI",
    zone: "Pacific/Kiritimati",
    region: "oceania",
    lat: 1.8721,
    lon: -157.4278,
    spots: [
      {
        name: "런던 마을 이벤트 추천 지점",
        lat: 1.98715,
        lon: -157.47714,
        note: "이용자들이 반복 공유한 작은 이벤트 구역입니다. 확인된 추천 지점만 표시합니다.",
        sourceUrl:
          "https://www.reddit.com/r/PoGoAndroidSpoofing/comments/10ih7dc/",
        coordinateSource:
          "https://www.reddit.com/r/PoGoAndroidSpoofing/comments/10ih7dc/",
      },
    ],
  },
  {
    id: "istanbul",
    name: "이스탄불",
    nameEn: "Istanbul",
    country: "튀르키예",
    countryCode: "TR",
    zone: "Europe/Istanbul",
    region: "europe",
    lat: 41.0082,
    lon: 28.9784,
    spots: [
      {
        name: "귈하네 공원",
        lat: 41.0122222,
        lon: 28.98,
        note: "현지 이용자가 레이드 이벤트 때 플레이어가 모이는 곳으로 추천",
        sourceUrl:
          "https://www.reddit.com/r/PokeTurkiye/comments/1wmdeew/15_kere_falan_denedik_sonunda_yendik/",
        coordinateSource: "https://www.wikidata.org/wiki/Q1560106#P625",
      },
      {
        name: "괴즈테페 60주년 공원",
        lat: 40.9697222,
        lon: 29.0577778,
        note: "현지 커뮤니티가 함께 플레이하고 이벤트를 여는 공원으로 소개",
        sourceUrl:
          "https://community.wayfarer.scopely.com/t/gym-issue-at-our-large-community-park/109860",
        coordinateSource: "https://www.wikidata.org/wiki/Q65219354#P625",
      },
      {
        name: "이스티클랄 거리",
        lat: 41.0341667,
        lon: 28.9788889,
        note: "현지 이용자가 포켓스톱이 많은 도심 플레이 구역으로 추천",
        sourceUrl:
          "https://www.reddit.com/r/PokeTurkiye/comments/1tvycyl/istanbulda_gym_lerin_veya_pokestoplar%C4%B1n_%C3%A7ok/",
        coordinateSource: "https://www.wikidata.org/wiki/Q344348#P625",
      },
      {
        name: "술탄아흐메트 광장",
        lat: 41.0063889,
        lon: 28.9755556,
        note: "이용자가 광장과 주변 체육관·포켓스톱을 플레이 장소로 추천",
        sourceUrl: "https://www.reddit.com/r/TheSilphRoad/comments/nranst/",
        coordinateSource: "https://www.wikidata.org/wiki/Q387548#P625",
      },
      {
        name: "마치카 민주공원",
        lat: 41.04444,
        lon: 28.9925,
        note: "공식 커뮤니티데이 모임 장소로 안내된 공원",
        sourceUrl: "https://pokemongo.com/news/trainer-meetups-may-2022?hl=tr",
        coordinateSource: "https://en.wikipedia.org/wiki/Ma%C3%A7ka_Park",
      },
    ],
  },
  {
    id: "london",
    name: "런던",
    nameEn: "London",
    country: "영국",
    countryCode: "GB",
    zone: "Europe/London",
    region: "europe",
    lat: 51.5074,
    lon: -0.1278,
    spots: [
      {
        name: "하이드파크",
        lat: 51.5086111,
        lon: -0.1636111,
        note: "현지 커뮤니티 가이드의 커뮤니티데이 추천 공원",
        sourceUrl:
          "https://sites.google.com/view/pogolondon/guide/playing-in-london",
        coordinateSource: "https://www.wikidata.org/wiki/Q123738#P625",
      },
      {
        name: "리젠트파크",
        lat: 51.5322222,
        lon: -0.1566667,
        note: "현지 커뮤니티가 커뮤니티데이 모임 구역으로 소개한 공원",
        sourceUrl:
          "https://sites.google.com/view/pogolondon/guide/playing-in-london",
        coordinateSource: "https://www.wikidata.org/wiki/Q739341#P625",
      },
      {
        name: "그린파크",
        lat: 51.5041667,
        lon: -0.1436111,
        note: "현지 가이드가 레이드아워와 커뮤니티데이 모임을 안내한 공원",
        sourceUrl:
          "https://sites.google.com/view/pogolondon/guide/playing-in-london",
        coordinateSource: "https://www.wikidata.org/wiki/Q119892#P625",
      },
      {
        name: "마블아치",
        lat: 51.5130556,
        lon: -0.1588889,
        note: "현지 커뮤니티 가이드의 레이드 모임 지점",
        sourceUrl:
          "https://sites.google.com/view/pogolondon/guide/playing-in-london",
        coordinateSource: "https://www.wikidata.org/wiki/Q845529#P625",
      },
      {
        name: "킹스크로스역 주변",
        lat: 51.5309722,
        lon: -0.1233333,
        note: "현지 커뮤니티 가이드의 주말 레이드·레이드아워 모임 구역",
        sourceUrl:
          "https://sites.google.com/view/pogolondon/guide/playing-in-london",
        coordinateSource: "https://www.wikidata.org/wiki/Q219867#P625",
      },
    ],
  },
  {
    id: "paris",
    name: "파리",
    nameEn: "Paris",
    country: "프랑스",
    countryCode: "FR",
    zone: "Europe/Paris",
    region: "europe",
    lat: 48.8566,
    lon: 2.3522,
    spots: [
      {
        name: "튈르리 정원",
        lat: 48.8638889,
        lon: 2.3261111,
        note: "파리 GO Fest 이용자 가이드의 도심 플레이·모임 장소",
        sourceUrl:
          "https://www.margxt.fr/pokemon-go-fest-paris-carte-de-lexperience-ville-et-points-de-rendez-vous/",
        coordinateSource: "https://www.wikidata.org/wiki/Q818517#P625",
      },
      {
        name: "뤽상부르 공원",
        lat: 48.8469444,
        lon: 2.3372222,
        note: "파리 GO Fest 이용자 가이드가 추천한 도심 모임 공원",
        sourceUrl:
          "https://www.margxt.fr/pokemon-go-fest-paris-carte-de-lexperience-ville-et-points-de-rendez-vous/",
        coordinateSource: "https://www.wikidata.org/wiki/Q309458#P625",
      },
      {
        name: "라데팡스",
        lat: 48.8916667,
        lon: 2.2408333,
        note: "파리 GO Fest 이용자 가이드가 도심 체험 구역으로 추천",
        sourceUrl:
          "https://www.margxt.fr/pokemon-go-fest-paris-carte-de-lexperience-ville-et-points-de-rendez-vous/",
        coordinateSource: "https://www.wikidata.org/wiki/Q987729#P625",
      },
      {
        name: "파리 식물원",
        lat: 48.8438889,
        lon: 2.3597222,
        note: "파리 GO Fest 이용자 가이드의 플레이·모임 공원",
        sourceUrl:
          "https://www.margxt.fr/pokemon-go-fest-paris-carte-de-lexperience-ville-et-points-de-rendez-vous/",
        coordinateSource: "https://www.wikidata.org/wiki/Q730948#P625",
      },
      {
        name: "몽수리 공원",
        lat: 48.822222,
        lon: 2.338333,
        note: "파리 GO Fest 이용자 가이드가 추천한 모임 공원",
        sourceUrl:
          "https://www.margxt.fr/pokemon-go-fest-paris-carte-de-lexperience-ville-et-points-de-rendez-vous/",
        coordinateSource: "https://www.wikidata.org/wiki/Q1538929#P625",
      },
    ],
  },
  {
    id: "madrid",
    name: "마드리드",
    nameEn: "Madrid",
    country: "스페인",
    countryCode: "ES",
    zone: "Europe/Madrid",
    region: "europe",
    lat: 40.4168,
    lon: -3.7038,
    spots: [
      {
        name: "레티로 공원",
        lat: 40.415,
        lon: -3.68389,
        note: "현지 플레이어 가이드가 체육관·포켓스톱이 많은 곳으로 추천",
        sourceUrl:
          "https://pokemongohub.net/post/guide/pokemon-go-fest-madrid-2024-local-guide/",
        coordinateSource:
          "https://en.wikipedia.org/wiki/Parque_del_Buen_Retiro",
      },
      {
        name: "푸에르타 델 솔",
        lat: 40.41694,
        lon: -3.70361,
        note: "현지 가이드가 솔에서 그란비아로 이어지는 게임 루트를 소개",
        sourceUrl:
          "https://pokemongohub.net/post/guide/pokemon-go-fest-madrid-2024-local-guide/",
        coordinateSource: "https://www.wikidata.org/wiki/Q427163#P625",
      },
      {
        name: "그란비아",
        lat: 40.42,
        lon: -3.70361,
        note: "현지 가이드가 도심 플레이와 게임 루트를 함께 소개한 거리",
        sourceUrl:
          "https://pokemongohub.net/post/guide/pokemon-go-fest-madrid-2024-local-guide/",
        coordinateSource: "https://www.wikidata.org/wiki/Q1324163#P625",
      },
      {
        name: "마드리드 리오",
        lat: 40.418,
        lon: -3.721,
        note: "현지 플레이어 가이드에 소개된 강변 게임 루트 구역",
        sourceUrl:
          "https://pokemongohub.net/post/guide/pokemon-go-fest-madrid-2024-local-guide/",
        coordinateSource: "https://www.wikidata.org/wiki/Q6062341#P625",
      },
      {
        name: "파세오 델 프라도",
        lat: 40.41417,
        lon: -3.69361,
        note: "현지 가이드가 레티로 공원 대신 걸으며 플레이할 구역으로 추천",
        sourceUrl:
          "https://pokemongohub.net/post/guide/pokemon-go-fest-madrid-2024-local-guide/",
        coordinateSource: "https://www.wikidata.org/wiki/Q2079615#P625",
      },
    ],
  },
  {
    id: "new-york",
    name: "뉴욕",
    nameEn: "New York",
    country: "미국",
    countryCode: "US",
    zone: "America/New_York",
    region: "america",
    lat: 40.7128,
    lon: -74.006,
    spots: [
      {
        name: "브라이언트 파크",
        lat: 40.753805555556,
        lon: -73.983611111111,
        note: "현지 이용자들이 레이드와 짧은 순환 동선으로 반복 추천한 공원입니다.",
        sourceUrl:
          "https://www.reddit.com/r/pokemongoNYC/comments/1xfzgwp/wild_area_recommendations/",
        coordinateSource: "https://www.wikidata.org/wiki/Q995174#P625",
      },
      {
        name: "베데스다 테라스·분수",
        lat: 40.7741,
        lon: -73.9711,
        note: "센트럴 파크의 분수와 밴드셸 주변 레이드 모임 동선이 추천됐습니다.",
        sourceUrl:
          "https://www.reddit.com/r/pokemongoNYC/comments/1lfr4ue/any_raid_trains_in_manhattan_for_go_fest_how_do_i/",
        coordinateSource: "https://www.wikidata.org/wiki/Q532029#P625",
      },
      {
        name: "타임스스퀘어",
        lat: 40.7575,
        lon: -73.98583333333333,
        note: "방문자가 현장에서 여러 레이드에 참여한 경험을 공유한 장소입니다.",
        sourceUrl:
          "https://www.reddit.com/r/pokemongo/comments/1r5z6jm/first_time_playing_in_manhattan_experience/",
        coordinateSource: "https://www.wikidata.org/wiki/Q11259#P625",
      },
      {
        name: "헤럴드 스퀘어",
        lat: 40.750122222222,
        lon: -73.987744444444,
        note: "타임스스퀘어·브라이언트 파크와 함께 걷는 레이드 순환 동선으로 추천됐습니다.",
        sourceUrl:
          "https://www.reddit.com/r/pokemongoNYC/comments/1lfr4ue/any_raid_trains_in_manhattan_for_go_fest_how_do_i/",
        coordinateSource: "https://www.wikidata.org/wiki/Q109982#P625",
      },
      {
        name: "선셋 파크",
        lat: 40.648055555556,
        lon: -74.003611111111,
        note: "브루클린 커뮤니티의 이벤트 모임 장소로 소개됐습니다. 행사별 체육관 구성은 달라질 수 있습니다.",
        sourceUrl:
          "https://www.reddit.com/r/pokemongoNYC/comments/1umlw7p/guide_where_to_play_global_go_fest_in_nyc/",
        coordinateSource: "https://www.wikidata.org/wiki/Q49567970#P625",
      },
    ],
  },
  {
    id: "chicago",
    name: "시카고",
    nameEn: "Chicago",
    country: "미국",
    countryCode: "US",
    zone: "America/Chicago",
    region: "america",
    lat: 41.8781,
    lon: -87.6298,
    spots: [
      {
        name: "링컨 파크 동물원",
        lat: 41.92138889,
        lon: -87.63388889,
        note: "현지 플레이어와 커뮤니티 앰배서더가 레이드 장소로 추천한 동물원 주변입니다.",
        sourceUrl:
          "https://www.reddit.com/r/PokemonGoFestChicago/comments/1tndl73/best_places_to_raid/",
        coordinateSource: "https://www.wikidata.org/wiki/Q3241309#P625",
      },
      {
        name: "네이비 피어",
        lat: 41.89138889,
        lon: -87.59969444,
        note: "시카고 지역 커뮤니티 가이드의 주요 레이드 장소로 언급됐습니다.",
        sourceUrl:
          "https://www.reddit.com/r/PokemonGoFestChicago/comments/1tndl73/best_places_to_raid/",
        coordinateSource: "https://www.wikidata.org/wiki/Q3337338#P625",
      },
      {
        name: "밀레니엄 파크",
        lat: 41.8825,
        lon: -87.6225,
        note: "방문 플레이어가 도심 플레이 동선의 후보로 소개한 공원입니다.",
        sourceUrl:
          "https://www.reddit.com/r/PokemonGoFestChicago/comments/1u0erg6/go_fest_chicago_a_5_time_in_person_and_out_of/",
        coordinateSource: "https://www.wikidata.org/wiki/Q1130516#P625",
      },
      {
        name: "그랜트 파크",
        lat: 41.87611111,
        lon: -87.61888889,
        note: "GO Fest 참가자가 행사와 도심 플레이의 거점으로 언급한 공원입니다.",
        sourceUrl:
          "https://www.reddit.com/r/PokemonGoFestChicago/comments/1u0erg6/go_fest_chicago_a_5_time_in_person_and_out_of/",
        coordinateSource: "https://www.wikidata.org/wiki/Q159085#P625",
      },
      {
        name: "매킨리 파크",
        lat: 41.82416667,
        lon: -87.67944444,
        note: "시카고 현지 포켓몬 GO 커뮤니티가 만든 레이드 가이드에 포함된 공원입니다.",
        sourceUrl:
          "https://www.reddit.com/r/PokemonGoFestChicago/comments/1tndl73/best_places_to_raid/",
        coordinateSource: "https://www.wikidata.org/wiki/Q49523792#P625",
      },
    ],
  },
  {
    id: "los-angeles",
    name: "로스앤젤레스",
    nameEn: "Los Angeles",
    country: "미국",
    countryCode: "US",
    zone: "America/Los_Angeles",
    region: "america",
    lat: 34.0522,
    lon: -118.2437,
    spots: [
      {
        name: "산타모니카 피어",
        lat: 34.00861111,
        lon: -118.49861111,
        note: "방문자들이 포획과 레이드 장소로 반복 추천한 해변 부두입니다.",
        sourceUrl:
          "https://www.reddit.com/r/pokemongo/comments/1woudbk/city_experience_27/",
        coordinateSource: "https://www.wikidata.org/wiki/Q595439#P625",
      },
      {
        name: "리틀 도쿄",
        lat: 34.05111111,
        lon: -118.23888889,
        note: "LA 지역 플레이어들이 커뮤니티와 함께 플레이할 장소로 추천한 지역입니다.",
        sourceUrl:
          "https://www.reddit.com/r/pokemongola/comments/1rb822m/does_anyone_know_a_good_park_to_play_the_kalos/",
        coordinateSource: "https://www.wikidata.org/wiki/Q49518260#P625",
      },
      {
        name: "글로리아 몰리나 그랜드 파크",
        lat: 34.05669444,
        lon: -118.247,
        note: "지역 커뮤니티의 투어 플레이 장소 질문에서 추천된 도심 공원입니다.",
        sourceUrl:
          "https://www.reddit.com/r/pokemongola/comments/1rb822m/does_anyone_know_a_good_park_to_play_the_kalos/",
        coordinateSource: "https://www.wikidata.org/wiki/Q5594874#P625",
      },
      {
        name: "캘텍 캠퍼스",
        lat: 34.13861111,
        lon: -118.12444444,
        note: "파사데나 플레이어들이 커뮤니티 데이와 레이드 동선으로 언급한 캠퍼스입니다.",
        sourceUrl:
          "https://www.reddit.com/r/pokemongola/comments/1f1f841/rediscovering_pok%C3%A9mon_go_in_la_any/",
        coordinateSource: "https://www.wikidata.org/wiki/Q161562#P625",
      },
      {
        name: "더 그로브",
        lat: 34.071964,
        lon: -118.357515,
        note: "이용자들이 몇 시간 동안 걸으며 포켓몬을 잡기 좋은 장소로 추천했습니다.",
        sourceUrl:
          "https://www.reddit.com/r/pokemongo/comments/1woudbk/city_experience_27/",
        coordinateSource:
          "https://en.wikipedia.org/wiki/The_Grove_at_Farmers_Market",
      },
    ],
  },
  {
    id: "honolulu",
    name: "호놀룰루",
    nameEn: "Honolulu",
    country: "미국",
    countryCode: "US",
    zone: "Pacific/Honolulu",
    region: "america",
    lat: 21.3099,
    lon: -157.8581,
    spots: [
      {
        name: "알라모아나 센터",
        lat: 21.29111111,
        lon: -157.84361111,
        note: "하와이 지역 플레이어들이 이벤트 플레이와 레이드 모임 장소로 추천한 쇼핑몰입니다.",
        sourceUrl:
          "https://www.reddit.com/r/PokemonGOHawaii/comments/1tzw02f/pokemon_go_fest_july_1112_in_waikiki/",
        coordinateSource: "https://www.wikidata.org/wiki/Q1431609#P625",
      },
      {
        name: "와이키키 해변",
        lat: 21.27666667,
        lon: -157.82861111,
        note: "하와이 플레이어의 방문객 가이드에서 해변 포획과 도심 레이드 동선으로 소개됐습니다.",
        sourceUrl: "https://sites.google.com/view/tsr-hi/visitors",
        coordinateSource: "https://www.wikidata.org/wiki/Q254861#P625",
      },
      {
        name: "매직 아일랜드",
        lat: 21.284596,
        lon: -157.846595,
        note: "지역 플레이어 가이드에서 해변 포획과 알라모아나 인근 동선으로 소개됐습니다.",
        sourceUrl: "https://sites.google.com/view/tsr-hi/visitors",
        coordinateSource: "https://en.wikipedia.org/wiki/Magic_Island_(Hawaii)",
      },
      {
        name: "이올라니 궁전 주변",
        lat: 21.30661111,
        lon: -157.859,
        note: "지역 가이드가 다운타운 레이드 동선의 거점으로 언급한 궁전 주변입니다.",
        sourceUrl: "https://sites.google.com/view/tsr-hi/visitors",
        coordinateSource: "https://www.wikidata.org/wiki/Q423525#P625",
      },
      {
        name: "하와이 주청사 주변",
        lat: 21.3075,
        lon: -157.8575,
        note: "지역 가이드가 이올라니 궁전과 함께 도보 레이드 동선으로 소개한 장소입니다.",
        sourceUrl: "https://sites.google.com/view/tsr-hi/visitors",
        coordinateSource: "https://www.wikidata.org/wiki/Q1290002#P625",
      },
    ],
  },
  {
    id: "vancouver",
    name: "밴쿠버",
    nameEn: "Vancouver",
    country: "캐나다",
    countryCode: "CA",
    zone: "America/Vancouver",
    region: "america",
    lat: 49.2827,
    lon: -123.1207,
    spots: [
      {
        name: "스탠리 파크",
        lat: 49.30416667,
        lon: -123.14472222,
        note: "City Safari 참가자가 걸으며 탐색한 장소입니다. 공원 전체를 대표하는 좌표입니다.",
        sourceUrl:
          "https://www.reddit.com/r/TheSilphRoad/comments/1ntoz9w/vancouver_city_safari_recap_927928/",
        coordinateSource: "https://apps.gov.bc.ca/pub/bcgnws/names/53257.html",
      },
      {
        name: "사이언스 월드",
        lat: 49.27330556,
        lon: -123.104,
        note: "지역 커뮤니티 앰배서더의 이벤트 모임 장소로 안내된 도심 명소입니다.",
        sourceUrl:
          "https://www.reddit.com/r/pokemongo/comments/1teaujw/vancouver_ca_community_event/",
        coordinateSource: "https://www.wikidata.org/wiki/Q1391769#P625",
      },
      {
        name: "잭 풀 플라자",
        lat: 49.28927989,
        lon: -123.11996239,
        note: "City Safari 공식 안내에서 트레이너 라운지 장소로 소개된 광장입니다.",
        sourceUrl:
          "https://pokemongo.com/ja/news/city-safari-vancouver-know-before-you-go",
        coordinateSource: "https://www.wikidata.org/wiki/Q106882428#P625",
      },
      {
        name: "미노루 파크·리치먼드",
        lat: 49.16556,
        lon: -123.14528,
        note: "메트로 밴쿠버 리치먼드의 이벤트 레이드 경험을 이용자가 공유한 공원입니다.",
        sourceUrl:
          "https://www.reddit.com/r/TheSilphRoad/comments/1ntoz9w/vancouver_city_safari_recap_927928/",
        coordinateSource: "https://en.wikipedia.org/wiki/Minoru_Park",
      },
      {
        name: "퀸 엘리자베스 파크",
        lat: 49.24222222,
        lon: -123.115,
        note: "커뮤니티에서 플레이 장소로 언급된 공원입니다. 과거 둥지 종류가 현재도 유지된다는 뜻은 아닙니다.",
        sourceUrl:
          "https://www.reddit.com/r/PokemonGoSpoofing/comments/dztgks/anyone_know_of_any_charmander_nest/",
        coordinateSource: "https://www.wikidata.org/wiki/Q1479020#P625",
      },
    ],
  },
  {
    id: "mexico-city",
    name: "멕시코시티",
    nameEn: "Mexico City",
    country: "멕시코",
    countryCode: "MX",
    zone: "America/Mexico_City",
    region: "america",
    lat: 19.4326,
    lon: -99.1332,
    spots: [
      {
        name: "알라메다 센트럴",
        lat: 19.43555556,
        lon: -99.14388889,
        note: "현지 플레이어들이 앰배서더 모임과 레이드·포획 장소로 반복 추천한 도심 공원입니다.",
        sourceUrl:
          "https://www.reddit.com/r/TheSilphRoad/comments/1wc3sj2/best_place_to_raid_and_catch_in_mexico_city/",
        coordinateSource: "https://www.wikidata.org/wiki/Q3355305#P625",
      },
      {
        name: "파르케 멕시코",
        lat: 19.41222,
        lon: -99.16917,
        note: "로마·콘데사 지역의 레이드 장소로 현지 플레이어가 추천한 공원입니다.",
        sourceUrl:
          "https://www.reddit.com/r/TheSilphRoad/comments/1wc3sj2/best_place_to_raid_and_catch_in_mexico_city/",
        coordinateSource: "https://en.wikipedia.org/wiki/Parque_M%C3%A9xico",
      },
      {
        name: "파르케 운디도",
        lat: 19.37805556,
        lon: -99.17888889,
        note: "현지 이용자들이 대중교통 접근과 레이드 동선을 장점으로 추천한 공원입니다.",
        sourceUrl:
          "https://www.reddit.com/r/TheSilphRoad/comments/1wc3sj2/best_place_to_raid_and_catch_in_mexico_city/",
        coordinateSource: "https://www.wikidata.org/wiki/Q3438112#P625",
      },
      {
        name: "파르케 데 로스 베나도스",
        lat: 19.37213333,
        lon: -99.15608056,
        note: "오래된 지역 플레이 모임이 있는 장소로 현지 플레이어들이 추천했습니다.",
        sourceUrl:
          "https://www.reddit.com/r/TheSilphRoad/comments/1wc3sj2/best_place_to_raid_and_catch_in_mexico_city/",
        coordinateSource: "https://www.wikidata.org/wiki/Q6062815#P625",
      },
      {
        name: "보스케 데 산후안 데 아라곤",
        lat: 19.4618,
        lon: -99.07271944,
        note: "현지 플레이어가 커뮤니티와 교류하기 좋은 장소로 소개한 대형 공원입니다.",
        sourceUrl:
          "https://www.reddit.com/r/TheSilphRoad/comments/1wc3sj2/best_place_to_raid_and_catch_in_mexico_city/",
        coordinateSource: "https://www.wikidata.org/wiki/Q2878993#P625",
      },
    ],
  },
  {
    id: "sao-paulo",
    name: "상파울루",
    nameEn: "São Paulo",
    country: "브라질",
    countryCode: "BR",
    zone: "America/Sao_Paulo",
    region: "america",
    lat: -23.5505,
    lon: -46.6333,
    spots: [
      {
        name: "이비라푸에라 공원",
        lat: -23.58833333,
        lon: -46.65888889,
        note: "현지 플레이어들이 이벤트와 비 오는 날의 실내 인접 동선까지 논의한 대표 공원입니다.",
        sourceUrl:
          "https://www.reddit.com/r/saopaulo/comments/1w74lsh/pergunta_para_jogadores_de_pok%C3%A9mon_go/",
        coordinateSource: "https://www.wikidata.org/wiki/Q212248#P625",
      },
      {
        name: "파울리스타 대로·MASP 앞",
        lat: -23.56111111,
        lon: -46.65583333,
        note: "직접 방문한 작성자가 추천한 파울리스타 플레이 동선 중 MASP 주변입니다.",
        sourceUrl:
          "https://www.showmetech.com.br/5-lugares-para-jogar-pokemon-go-em-sao-paulo/",
        coordinateSource: "https://www.wikidata.org/wiki/Q82941#P625",
      },
      {
        name: "빌라로부스 공원",
        lat: -23.54667,
        lon: -46.72111,
        note: "포켓몬 GO 플레이 가이드에서 산책하며 포획하기 좋은 공원으로 소개됐습니다.",
        sourceUrl:
          "https://www.showmetech.com.br/5-lugares-para-jogar-pokemon-go-em-sao-paulo/",
        coordinateSource:
          "https://en.wikipedia.org/wiki/Villa-Lobos_State_Park",
      },
      {
        name: "루스 공원",
        lat: -23.533,
        lon: -46.635,
        note: "플레이 가이드에서 루스역과 주변 명소를 함께 걷는 포획 동선으로 소개됐습니다.",
        sourceUrl:
          "https://www.showmetech.com.br/5-lugares-para-jogar-pokemon-go-em-sao-paulo/",
        coordinateSource: "https://en.wikipedia.org/wiki/Jardim_da_Luz",
      },
      {
        name: "라르구 다 바타타",
        lat: -23.56639,
        lon: -46.69417,
        note: "플레이 가이드에서 피녜이루스역 인근 트레이너 모임과 포획 장소로 추천됐습니다.",
        sourceUrl:
          "https://www.showmetech.com.br/5-lugares-para-jogar-pokemon-go-em-sao-paulo/",
        coordinateSource: "https://en.wikipedia.org/wiki/Largo_da_Batata",
      },
    ],
  },
  {
    id: "cape-town",
    name: "케이프타운",
    nameEn: "Cape Town",
    country: "남아프리카공화국",
    countryCode: "ZA",
    zone: "Africa/Johannesburg",
    region: "africa",
    lat: -33.9249,
    lon: 18.4241,
    spots: [
      {
        name: "V&A 워터프런트",
        lat: -33.90305556,
        lon: 18.42277778,
        note: "현지 이용자가 포켓몬 GO 플레이 장소로 추천한 항구 구역입니다.",
        sourceUrl: "https://www.reddit.com/r/capetown/comments/1dkfi01/",
        coordinateSource: "https://en.wikipedia.org/wiki/V&A_Waterfront",
      },
      {
        name: "카날 워크",
        lat: -33.89277778,
        lon: 18.51083333,
        note: "현지 이용자가 레이드와 포획 장소로 추천한 쇼핑몰 구역입니다.",
        sourceUrl: "https://www.reddit.com/r/capetown/comments/1dkfi01/",
        coordinateSource: "https://en.wikipedia.org/wiki/Canal_Walk",
      },
      {
        name: "그린 포인트 파크",
        lat: -33.9041596,
        lon: 18.4012,
        note: "지역 플레이어의 추천 목록에 포함된 공원입니다.",
        sourceUrl: "https://www.reddit.com/r/capetown/comments/1dkfi01/",
        coordinateSource: "https://en.wikipedia.org/wiki/Green_Point_Park",
      },
      {
        name: "커스텐보시 국립식물원",
        lat: -33.9875,
        lon: 18.4325,
        note: "지역 플레이어가 포획 동선으로 추천한 식물원입니다. 정원 대표 좌표입니다.",
        sourceUrl: "https://www.reddit.com/r/capetown/comments/1dkfi01/",
        coordinateSource:
          "https://en.wikipedia.org/wiki/Kirstenbosch_National_Botanical_Garden",
      },
      {
        name: "컴퍼니스 가든",
        lat: -33.92777778,
        lon: 18.41694444,
        note: "케이프타운 현지 플레이 안내에서 소개한 도심 공원입니다. 자료의 특정 출현 정보는 현재와 다를 수 있습니다.",
        sourceUrl:
          "https://www.cometocapetown.com/everything-you-need-to-know-about-playing-pokemon-go-in-cape-town/",
        coordinateSource: "https://en.wikipedia.org/wiki/Company%27s_Garden",
      },
    ],
  },
  {
    id: "nairobi",
    name: "나이로비",
    nameEn: "Nairobi",
    country: "케냐",
    countryCode: "KE",
    zone: "Africa/Nairobi",
    region: "africa",
    lat: -1.2921,
    lon: 36.8219,
    spots: [
      {
        name: "빌리지 마켓",
        lat: -1.22916667,
        lon: 36.80472222,
        note: "지역 커뮤니티 앰배서더가 대형 이벤트 모임 장소로 소개했습니다.",
        sourceUrl:
          "https://www.reddit.com/r/TheSilphRoad/comments/1cz1stu/looking_for_pokemongo_players_from_nairobi_kenya/",
        coordinateSource: "https://en.wikipedia.org/wiki/The_Village_Market",
      },
      {
        name: "존 미추키 메모리얼 파크",
        lat: -1.27565,
        lon: 36.81689,
        note: "나이로비 커뮤니티가 국립박물관과 함께 이벤트를 진행한다고 소개한 공원입니다.",
        sourceUrl:
          "https://www.reddit.com/r/TheSilphRoad/comments/1cz1stu/looking_for_pokemongo_players_from_nairobi_kenya/",
        coordinateSource: "https://mapcarta.com/W1287470604",
      },
      {
        name: "케냐 국립박물관 일대",
        lat: -1.27388889,
        lon: 36.815,
        note: "커뮤니티 앰배서더가 대형 이벤트 장소로 소개한 뮤지엄 힐 구역입니다.",
        sourceUrl:
          "https://www.reddit.com/r/TheSilphRoad/comments/1cz1stu/looking_for_pokemongo_players_from_nairobi_kenya/",
        coordinateSource:
          "https://en.wikipedia.org/wiki/National_Museums_of_Kenya",
      },
    ],
  },
];
