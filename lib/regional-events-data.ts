import type { RegionalEvent } from "./regional-event-types";

/** Officially checked 2026-11-10; dates are local and points are venue references, not live gym locations. */
export const REGIONAL_EVENTS: RegionalEvent[] = [
  {
    "id": "pokexciting-kuala-lumpur",
    "group": "apac-stamps",
    "title": {
      "ko": "도시별 한정 피카츄 · 장기 도장 랠리",
      "en": "City-color Pikachu · Cross-region stamps",
      "zh-CN": "城市限定皮卡丘 · 跨地区印章",
      "ja": "街限定ピカチュウ・地域横断スタンプ"
    },
    "countryCode": "MY",
    "city": "Kuala Lumpur",
    "location": {
      "name": "KLCC Park — Esplanade / Lake Symphony vicinity",
      "latitude": 3.1565548,
      "longitude": 101.7132305,
      "coordinateKind": "reference",
      "coordinateSourceUrl": "https://www.openstreetmap.org/node/1448941202"
    },
    "schedule": {
      "startDate": "2026-09-12",
      "endDate": "2029-09-11",
      "timeZone": "Asia/Kuala_Lumpur"
    },
    "rewards": [
      {
        "speciesId": 25,
        "name": "Pikachu",
        "costume": {
          "ko": "PokéXciting! · 청록색",
          "en": "PokéXciting! · Turquoise",
          "zh-CN": "PokéXciting! · 青绿色",
          "ja": "PokéXciting! · ターコイズ"
        },
        "spriteUrl": "/regional-assets/pm25.fANNIVERSARY_2026_MALAYSIA_01.icon.5e4b1d77b6a4.png",
        "background": {
          "name": "Kuala Lumpur Location Background",
          "imageUrl": "/regional-assets/lc_tpc30th_malaysia.db19c41d33ec.png"
        },
        "method": {
          "ko": "해당 도시의 지정 도장 포켓스톱에서 스탬프 보상 수령",
          "en": "Claim the city stamp reward at its designated PokéStop",
          "zh-CN": "在该城市指定宝可补给站领取印章奖励",
          "ja": "街の指定ポケストップでスタンプ報酬を受け取る"
        },
        "backgroundChance": "guaranteed"
      }
    ],
    "limitations": [
      {
        "ko": "도시별 장기 도장 보상입니다. 단기 행사 야생 보상과는 별개예요.",
        "en": "This is the long-running city stamp reward, separate from short-event wild encounters.",
        "zh-CN": "这是长期城市印章奖励，与短期活动的野外遭遇不同。",
        "ja": "長期の街スタンプ報酬です。短期イベントの野生出現とは別です。"
      },
      {
        "ko": "실제 도장 지점과 참여 조건은 게임의 스탬프 지도에서 확인하세요.",
        "en": "Check the in-game stamp map for the actual stop and eligibility.",
        "zh-CN": "实际印章地点和参与条件请在游戏印章地图中确认。",
        "ja": "実際のスタンプ地点と参加条件はゲーム内マップで確認してください。"
      }
    ],
    "sources": [
      "https://pokemongo.com/news/event-apac-stamp-rally-2026",
      "https://pokemongo.com/news/event-kuala-lumpur-30th-anniversary-2026"
    ],
    "checkedAt": "2026-11-10"
  },
  {
    "id": "pokexciting-taipei",
    "group": "apac-stamps",
    "title": {
      "ko": "도시별 한정 피카츄 · 장기 도장 랠리",
      "en": "City-color Pikachu · Cross-region stamps",
      "zh-CN": "城市限定皮卡丘 · 跨地区印章",
      "ja": "街限定ピカチュウ・地域横断スタンプ"
    },
    "countryCode": "TW",
    "city": "Taipei",
    "location": {
      "name": "Xiangti Boulevard / Xiangti Avenue Plaza",
      "latitude": 25.037248,
      "longitude": 121.566985,
      "coordinateKind": "reference",
      "coordinateSourceUrl": "https://media.taiwan.net.tw/zh-tw/portal/travel/details/attraction_379000000a_002236"
    },
    "schedule": {
      "startDate": "2026-09-12",
      "endDate": "2029-09-11",
      "timeZone": "Asia/Taipei"
    },
    "rewards": [
      {
        "speciesId": 25,
        "name": "Pikachu",
        "costume": {
          "ko": "PokéXciting! · 분홍색",
          "en": "PokéXciting! · Pink",
          "zh-CN": "PokéXciting! · 粉红色",
          "ja": "PokéXciting! · ピンク"
        },
        "spriteUrl": "/regional-assets/pm25.fANNIVERSARY_2026_TAIWAN_01.icon.42f072cb7e0c.png",
        "background": {
          "name": "Taipei Location Background",
          "imageUrl": "/regional-assets/lc_tpc30th_taiwan.d3ee88a1d9f8.png"
        },
        "method": {
          "ko": "해당 도시의 지정 도장 포켓스톱에서 스탬프 보상 수령",
          "en": "Claim the city stamp reward at its designated PokéStop",
          "zh-CN": "在该城市指定宝可补给站领取印章奖励",
          "ja": "街の指定ポケストップでスタンプ報酬を受け取る"
        },
        "backgroundChance": "guaranteed"
      }
    ],
    "limitations": [
      {
        "ko": "도시별 장기 도장 보상입니다. 단기 행사 야생 보상과는 별개예요.",
        "en": "This is the long-running city stamp reward, separate from short-event wild encounters.",
        "zh-CN": "这是长期城市印章奖励，与短期活动的野外遭遇不同。",
        "ja": "長期の街スタンプ報酬です。短期イベントの野生出現とは別です。"
      },
      {
        "ko": "실제 도장 지점과 참여 조건은 게임의 스탬프 지도에서 확인하세요.",
        "en": "Check the in-game stamp map for the actual stop and eligibility.",
        "zh-CN": "实际印章地点和参与条件请在游戏印章地图中确认。",
        "ja": "実際のスタンプ地点と参加条件はゲーム内マップで確認してください。"
      }
    ],
    "sources": [
      "https://pokemongo.com/news/event-apac-stamp-rally-2026",
      "https://pokemongo.com/news/event-taipei-30th-anniversary-2026"
    ],
    "checkedAt": "2026-11-10"
  },
  {
    "id": "pokexciting-singapore",
    "group": "apac-stamps",
    "title": {
      "ko": "도시별 한정 피카츄 · 장기 도장 랠리",
      "en": "City-color Pikachu · Cross-region stamps",
      "zh-CN": "城市限定皮卡丘 · 跨地区印章",
      "ja": "街限定ピカチュウ・地域横断スタンプ"
    },
    "countryCode": "SG",
    "city": "Singapore",
    "location": {
      "name": "Changi Airport Terminal 3 Departure Hall (terminal reference)",
      "latitude": 1.3562222222222,
      "longitude": 103.98658333333,
      "coordinateKind": "reference",
      "coordinateSourceUrl": "https://www.wikidata.org/wiki/Q21974333"
    },
    "schedule": {
      "startDate": "2026-09-12",
      "endDate": "2029-09-11",
      "timeZone": "Asia/Singapore"
    },
    "rewards": [
      {
        "speciesId": 25,
        "name": "Pikachu",
        "costume": {
          "ko": "PokéXciting! · 파란색",
          "en": "PokéXciting! · Blue",
          "zh-CN": "PokéXciting! · 蓝色",
          "ja": "PokéXciting! · ブルー"
        },
        "spriteUrl": "/regional-assets/pm25.fANNIVERSARY_2026_SINGAPORE_01.icon.7068092ffc5a.png",
        "background": {
          "name": "Singapore Location Background",
          "imageUrl": "/regional-assets/lc_tpc30th_singapore.6534cefa5fc7.png"
        },
        "method": {
          "ko": "해당 도시의 지정 도장 포켓스톱에서 스탬프 보상 수령",
          "en": "Claim the city stamp reward at its designated PokéStop",
          "zh-CN": "在该城市指定宝可补给站领取印章奖励",
          "ja": "街の指定ポケストップでスタンプ報酬を受け取る"
        },
        "backgroundChance": "guaranteed"
      }
    ],
    "limitations": [
      {
        "ko": "도시별 장기 도장 보상입니다. 단기 행사 야생 보상과는 별개예요.",
        "en": "This is the long-running city stamp reward, separate from short-event wild encounters.",
        "zh-CN": "这是长期城市印章奖励，与短期活动的野外遭遇不同。",
        "ja": "長期の街スタンプ報酬です。短期イベントの野生出現とは別です。"
      },
      {
        "ko": "실제 도장 지점과 참여 조건은 게임의 스탬프 지도에서 확인하세요.",
        "en": "Check the in-game stamp map for the actual stop and eligibility.",
        "zh-CN": "实际印章地点和参与条件请在游戏印章地图中确认。",
        "ja": "実際のスタンプ地点と参加条件はゲーム内マップで確認してください。"
      }
    ],
    "sources": [
      "https://pokemongo.com/news/event-apac-stamp-rally-2026",
      "https://pokemongo.com/news/event-singapore-30th-anniversary-2026"
    ],
    "checkedAt": "2026-11-10"
  },
  {
    "id": "pokexciting-manila",
    "group": "apac-stamps",
    "title": {
      "ko": "도시별 한정 피카츄 · 장기 도장 랠리",
      "en": "City-color Pikachu · Cross-region stamps",
      "zh-CN": "城市限定皮卡丘 · 跨地区印章",
      "ja": "街限定ピカチュウ・地域横断スタンプ"
    },
    "countryCode": "PH",
    "city": "Manila",
    "location": {
      "name": "SM Mall of Asia — MOA Sky (mall reference)",
      "latitude": 14.5351818,
      "longitude": 120.9815994,
      "coordinateKind": "reference",
      "coordinateSourceUrl": "https://www.openstreetmap.org/relation/21624091"
    },
    "schedule": {
      "startDate": "2026-09-12",
      "endDate": "2029-09-11",
      "timeZone": "Asia/Manila"
    },
    "rewards": [
      {
        "speciesId": 25,
        "name": "Pikachu",
        "costume": {
          "ko": "PokéXciting! · 빨간색",
          "en": "PokéXciting! · Red",
          "zh-CN": "PokéXciting! · 红色",
          "ja": "PokéXciting! · レッド"
        },
        "spriteUrl": "/regional-assets/pm25.fANNIVERSARY_2026_PHILIPPINE_01.icon.3bbdf54e59a2.png",
        "background": {
          "name": "Manila Location Background",
          "imageUrl": "/regional-assets/lc_tpc30th_philippines.c963cf8fb2ad.png"
        },
        "method": {
          "ko": "해당 도시의 지정 도장 포켓스톱에서 스탬프 보상 수령",
          "en": "Claim the city stamp reward at its designated PokéStop",
          "zh-CN": "在该城市指定宝可补给站领取印章奖励",
          "ja": "街の指定ポケストップでスタンプ報酬を受け取る"
        },
        "backgroundChance": "guaranteed"
      }
    ],
    "limitations": [
      {
        "ko": "도시별 장기 도장 보상입니다. 단기 행사 야생 보상과는 별개예요.",
        "en": "This is the long-running city stamp reward, separate from short-event wild encounters.",
        "zh-CN": "这是长期城市印章奖励，与短期活动的野外遭遇不同。",
        "ja": "長期の街スタンプ報酬です。短期イベントの野生出現とは別です。"
      },
      {
        "ko": "실제 도장 지점과 참여 조건은 게임의 스탬프 지도에서 확인하세요.",
        "en": "Check the in-game stamp map for the actual stop and eligibility.",
        "zh-CN": "实际印章地点和参与条件请在游戏印章地图中确认。",
        "ja": "実際のスタンプ地点と参加条件はゲーム内マップで確認してください。"
      }
    ],
    "sources": [
      "https://pokemongo.com/news/event-apac-stamp-rally-2026",
      "https://ph.portal-pokemon.com/30th/topics/20260707_01/"
    ],
    "checkedAt": "2026-11-10"
  },
  {
    "id": "esa-london",
    "group": "esa-museums",
    "title": {
      "ko": "박물관 한정 · 우주비행사 피카츄",
      "en": "Museum exclusive · Astronaut Pikachu",
      "zh-CN": "博物馆限定 · 宇航员皮卡丘",
      "ja": "博物館限定・宇宙飛行士ピカチュウ"
    },
    "countryCode": "GB",
    "city": "London",
    "location": {
      "name": "Science Museum",
      "latitude": 51.4973983,
      "longitude": -0.1746726,
      "coordinateKind": "reference",
      "coordinateSourceUrl": "https://www.openstreetmap.org/way/27765411"
    },
    "schedule": {
      "startDate": "2026-10-04",
      "endDate": "2027-04-30",
      "timeZone": "Europe/London"
    },
    "rewards": [
      {
        "speciesId": 25,
        "name": "Pikachu",
        "costume": {
          "ko": "우주비행사 의상",
          "en": "Astronaut costume",
          "zh-CN": "宇航员服装",
          "ja": "宇宙飛行士の衣装"
        },
        "spriteUrl": "/regional-assets/pm25.fGLASS_HELMET_2026.icon.573bf42d0e7f.png",
        "background": {
          "name": "Science Museum Location Background",
          "imageUrl": "/regional-assets/lc_ESA_scienceMuseumLondon.68e449fec0ea.png"
        },
        "method": {
          "ko": "해당 박물관에서 현장 1성 레이드 참여",
          "en": "Join an in-person one-star raid at this museum",
          "zh-CN": "参加该博物馆的现场一星团体战",
          "ja": "この博物館で現地の1つ星レイドに参加"
        },
        "backgroundChance": "unknown"
      }
    ],
    "limitations": [
      {
        "ko": "현장 레이드 대상입니다. 배경 획득 확률은 공지에 명시되지 않았어요.",
        "en": "For in-person raids. The announcement does not state background odds.",
        "zh-CN": "仅限现场团体战；公告未公布背景获得概率。",
        "ja": "現地レイドが対象です。背景の確率は公表されていません。"
      },
      {
        "ko": "박물관별 운영시간·입장 조건을 확인하세요. 기간 전체가 24시간 운영되는 것은 아니에요.",
        "en": "Check museum opening hours and entry requirements; this is not a 24-hour schedule.",
        "zh-CN": "请确认各博物馆开放时间和入场条件，并非全天24小时开放。",
        "ja": "各館の開館時間と入場条件を確認してください。24時間開催ではありません。"
      }
    ],
    "sources": [
      "https://pokemongo.com/news/european-space-agency-event"
    ],
    "checkedAt": "2026-11-10"
  },
  {
    "id": "esa-toulouse",
    "group": "esa-museums",
    "title": {
      "ko": "박물관 한정 · 우주비행사 피카츄",
      "en": "Museum exclusive · Astronaut Pikachu",
      "zh-CN": "博物馆限定 · 宇航员皮卡丘",
      "ja": "博物館限定・宇宙飛行士ピカチュウ"
    },
    "countryCode": "FR",
    "city": "Toulouse",
    "location": {
      "name": "Cité de l’espace",
      "latitude": 43.5860223,
      "longitude": 1.4927778,
      "coordinateKind": "reference",
      "coordinateSourceUrl": "https://www.openstreetmap.org/way/4722585"
    },
    "schedule": {
      "startDate": "2026-10-04",
      "endDate": "2027-04-30",
      "timeZone": "Europe/Paris"
    },
    "rewards": [
      {
        "speciesId": 25,
        "name": "Pikachu",
        "costume": {
          "ko": "우주비행사 의상",
          "en": "Astronaut costume",
          "zh-CN": "宇航员服装",
          "ja": "宇宙飛行士の衣装"
        },
        "spriteUrl": "/regional-assets/pm25.fGLASS_HELMET_2026.icon.573bf42d0e7f.png",
        "background": {
          "name": "Cité de l’espace Location Background",
          "imageUrl": "/regional-assets/lc_ESA_citeDeEspace.e98ae5d1cfcd.png"
        },
        "method": {
          "ko": "해당 박물관에서 현장 1성 레이드 참여",
          "en": "Join an in-person one-star raid at this museum",
          "zh-CN": "参加该博物馆的现场一星团体战",
          "ja": "この博物館で現地の1つ星レイドに参加"
        },
        "backgroundChance": "unknown"
      }
    ],
    "limitations": [
      {
        "ko": "현장 레이드 대상입니다. 배경 획득 확률은 공지에 명시되지 않았어요.",
        "en": "For in-person raids. The announcement does not state background odds.",
        "zh-CN": "仅限现场团体战；公告未公布背景获得概率。",
        "ja": "現地レイドが対象です。背景の確率は公表されていません。"
      },
      {
        "ko": "박물관별 운영시간·입장 조건을 확인하세요. 기간 전체가 24시간 운영되는 것은 아니에요.",
        "en": "Check museum opening hours and entry requirements; this is not a 24-hour schedule.",
        "zh-CN": "请确认各博物馆开放时间和入场条件，并非全天24小时开放。",
        "ja": "各館の開館時間と入場条件を確認してください。24時間開催ではありません。"
      }
    ],
    "sources": [
      "https://pokemongo.com/news/european-space-agency-event"
    ],
    "checkedAt": "2026-11-10"
  },
  {
    "id": "esa-nuremberg",
    "group": "esa-museums",
    "title": {
      "ko": "박물관 한정 · 우주비행사 피카츄",
      "en": "Museum exclusive · Astronaut Pikachu",
      "zh-CN": "博物馆限定 · 宇航员皮卡丘",
      "ja": "博物館限定・宇宙飛行士ピカチュウ"
    },
    "countryCode": "DE",
    "city": "Nuremberg",
    "location": {
      "name": "Deutsches Museum Nürnberg – Das Zukunftsmuseum",
      "latitude": 49.4536898,
      "longitude": 11.0747575,
      "coordinateKind": "reference",
      "coordinateSourceUrl": "https://www.openstreetmap.org/node/6535921254"
    },
    "schedule": {
      "startDate": "2026-10-04",
      "endDate": "2027-04-30",
      "timeZone": "Europe/Berlin"
    },
    "rewards": [
      {
        "speciesId": 25,
        "name": "Pikachu",
        "costume": {
          "ko": "우주비행사 의상",
          "en": "Astronaut costume",
          "zh-CN": "宇航员服装",
          "ja": "宇宙飛行士の衣装"
        },
        "spriteUrl": "/regional-assets/pm25.fGLASS_HELMET_2026.icon.573bf42d0e7f.png",
        "background": {
          "name": "Deutsches Museum Nürnberg – Das Zukunftsmuseum Location Background",
          "imageUrl": "/regional-assets/lc_ESA_spaceCenterGermany.f0516c182e8e.png"
        },
        "method": {
          "ko": "해당 박물관에서 현장 1성 레이드 참여",
          "en": "Join an in-person one-star raid at this museum",
          "zh-CN": "参加该博物馆的现场一星团体战",
          "ja": "この博物館で現地の1つ星レイドに参加"
        },
        "backgroundChance": "unknown"
      }
    ],
    "limitations": [
      {
        "ko": "현장 레이드 대상입니다. 배경 획득 확률은 공지에 명시되지 않았어요.",
        "en": "For in-person raids. The announcement does not state background odds.",
        "zh-CN": "仅限现场团体战；公告未公布背景获得概率。",
        "ja": "現地レイドが対象です。背景の確率は公表されていません。"
      },
      {
        "ko": "박물관별 운영시간·입장 조건을 확인하세요. 기간 전체가 24시간 운영되는 것은 아니에요.",
        "en": "Check museum opening hours and entry requirements; this is not a 24-hour schedule.",
        "zh-CN": "请确认各博物馆开放时间和入场条件，并非全天24小时开放。",
        "ja": "各館の開館時間と入場条件を確認してください。24時間開催ではありません。"
      }
    ],
    "sources": [
      "https://pokemongo.com/news/european-space-agency-event"
    ],
    "checkedAt": "2026-11-10"
  },
  {
    "id": "esa-valencia",
    "group": "esa-museums",
    "title": {
      "ko": "박물관 한정 · 우주비행사 피카츄",
      "en": "Museum exclusive · Astronaut Pikachu",
      "zh-CN": "博物馆限定 · 宇航员皮卡丘",
      "ja": "博物館限定・宇宙飛行士ピカチュウ"
    },
    "countryCode": "ES",
    "city": "València",
    "location": {
      "name": "Museu de les Ciències",
      "latitude": 39.4548409,
      "longitude": -0.3534144,
      "coordinateKind": "reference",
      "coordinateSourceUrl": "https://www.openstreetmap.org/node/246090193"
    },
    "schedule": {
      "startDate": "2026-10-04",
      "endDate": "2027-04-30",
      "timeZone": "Europe/Madrid"
    },
    "rewards": [
      {
        "speciesId": 25,
        "name": "Pikachu",
        "costume": {
          "ko": "우주비행사 의상",
          "en": "Astronaut costume",
          "zh-CN": "宇航员服装",
          "ja": "宇宙飛行士の衣装"
        },
        "spriteUrl": "/regional-assets/pm25.fGLASS_HELMET_2026.icon.573bf42d0e7f.png",
        "background": {
          "name": "Museu de les Ciències Location Background",
          "imageUrl": "/regional-assets/lc_ESA_ciudadDeLasArtes.f7e8bf69f601.png"
        },
        "method": {
          "ko": "해당 박물관에서 현장 1성 레이드 참여",
          "en": "Join an in-person one-star raid at this museum",
          "zh-CN": "参加该博物馆的现场一星团体战",
          "ja": "この博物館で現地の1つ星レイドに参加"
        },
        "backgroundChance": "unknown"
      }
    ],
    "limitations": [
      {
        "ko": "현장 레이드 대상입니다. 배경 획득 확률은 공지에 명시되지 않았어요.",
        "en": "For in-person raids. The announcement does not state background odds.",
        "zh-CN": "仅限现场团体战；公告未公布背景获得概率。",
        "ja": "現地レイドが対象です。背景の確率は公表されていません。"
      },
      {
        "ko": "박물관별 운영시간·입장 조건을 확인하세요. 기간 전체가 24시간 운영되는 것은 아니에요.",
        "en": "Check museum opening hours and entry requirements; this is not a 24-hour schedule.",
        "zh-CN": "请确认各博物馆开放时间和入场条件，并非全天24小时开放。",
        "ja": "各館の開館時間と入場条件を確認してください。24時間開催ではありません。"
      }
    ],
    "sources": [
      "https://pokemongo.com/news/european-space-agency-event"
    ],
    "checkedAt": "2026-11-10"
  },
  {
    "id": "esa-noordwijk",
    "group": "esa-museums",
    "title": {
      "ko": "박물관 한정 · 우주비행사 피카츄",
      "en": "Museum exclusive · Astronaut Pikachu",
      "zh-CN": "博物馆限定 · 宇航员皮卡丘",
      "ja": "博物館限定・宇宙飛行士ピカチュウ"
    },
    "countryCode": "NL",
    "city": "Noordwijk",
    "location": {
      "name": "Space Expo",
      "latitude": 52.2152921,
      "longitude": 4.4206339,
      "coordinateKind": "reference",
      "coordinateSourceUrl": "https://www.openstreetmap.org/way/52920626"
    },
    "schedule": {
      "startDate": "2026-10-04",
      "endDate": "2027-04-30",
      "timeZone": "Europe/Amsterdam"
    },
    "rewards": [
      {
        "speciesId": 25,
        "name": "Pikachu",
        "costume": {
          "ko": "우주비행사 의상",
          "en": "Astronaut costume",
          "zh-CN": "宇航员服装",
          "ja": "宇宙飛行士の衣装"
        },
        "spriteUrl": "/regional-assets/pm25.fGLASS_HELMET_2026.icon.573bf42d0e7f.png",
        "background": {
          "name": "Space Expo Location Background",
          "imageUrl": "/regional-assets/lc_ESA_spaceExpoNL.e9769f0113b6.png"
        },
        "method": {
          "ko": "해당 박물관에서 현장 1성 레이드 참여",
          "en": "Join an in-person one-star raid at this museum",
          "zh-CN": "参加该博物馆的现场一星团体战",
          "ja": "この博物館で現地の1つ星レイドに参加"
        },
        "backgroundChance": "unknown"
      }
    ],
    "limitations": [
      {
        "ko": "현장 레이드 대상입니다. 배경 획득 확률은 공지에 명시되지 않았어요.",
        "en": "For in-person raids. The announcement does not state background odds.",
        "zh-CN": "仅限现场团体战；公告未公布背景获得概率。",
        "ja": "現地レイドが対象です。背景の確率は公表されていません。"
      },
      {
        "ko": "박물관별 운영시간·입장 조건을 확인하세요. 기간 전체가 24시간 운영되는 것은 아니에요.",
        "en": "Check museum opening hours and entry requirements; this is not a 24-hour schedule.",
        "zh-CN": "请确认各博物馆开放时间和入场条件，并非全天24小时开放。",
        "ja": "各館の開館時間と入場条件を確認してください。24時間開催ではありません。"
      }
    ],
    "sources": [
      "https://pokemongo.com/news/european-space-agency-event"
    ],
    "checkedAt": "2026-11-10"
  },
  {
    "id": "esa-transinne",
    "group": "esa-museums",
    "title": {
      "ko": "박물관 한정 · 우주비행사 피카츄",
      "en": "Museum exclusive · Astronaut Pikachu",
      "zh-CN": "博物馆限定 · 宇航员皮卡丘",
      "ja": "博物館限定・宇宙飛行士ピカチュウ"
    },
    "countryCode": "BE",
    "city": "Transinne",
    "location": {
      "name": "Euro Space Center",
      "latitude": 50.0077008,
      "longitude": 5.2203606,
      "coordinateKind": "reference",
      "coordinateSourceUrl": "https://www.openstreetmap.org/way/712226045"
    },
    "schedule": {
      "startDate": "2026-10-04",
      "endDate": "2027-04-30",
      "timeZone": "Europe/Brussels"
    },
    "rewards": [
      {
        "speciesId": 25,
        "name": "Pikachu",
        "costume": {
          "ko": "우주비행사 의상",
          "en": "Astronaut costume",
          "zh-CN": "宇航员服装",
          "ja": "宇宙飛行士の衣装"
        },
        "spriteUrl": "/regional-assets/pm25.fGLASS_HELMET_2026.icon.573bf42d0e7f.png",
        "background": {
          "name": "Euro Space Center Location Background",
          "imageUrl": "/regional-assets/lc_ESA_euroSpaceCenter.c60fdac0978b.png"
        },
        "method": {
          "ko": "해당 박물관에서 현장 1성 레이드 참여",
          "en": "Join an in-person one-star raid at this museum",
          "zh-CN": "参加该博物馆的现场一星团体战",
          "ja": "この博物館で現地の1つ星レイドに参加"
        },
        "backgroundChance": "unknown"
      }
    ],
    "limitations": [
      {
        "ko": "현장 레이드 대상입니다. 배경 획득 확률은 공지에 명시되지 않았어요.",
        "en": "For in-person raids. The announcement does not state background odds.",
        "zh-CN": "仅限现场团体战；公告未公布背景获得概率。",
        "ja": "現地レイドが対象です。背景の確率は公表されていません。"
      },
      {
        "ko": "박물관별 운영시간·입장 조건을 확인하세요. 기간 전체가 24시간 운영되는 것은 아니에요.",
        "en": "Check museum opening hours and entry requirements; this is not a 24-hour schedule.",
        "zh-CN": "请确认各博物馆开放时间和入场条件，并非全天24小时开放。",
        "ja": "各館の開館時間と入場条件を確認してください。24時間開催ではありません。"
      }
    ],
    "sources": [
      "https://pokemongo.com/news/european-space-agency-event"
    ],
    "checkedAt": "2026-11-10"
  },
  {
    "id": "sendai-lapras-stamp",
    "group": "permanent-stamps",
    "title": {
      "ko": "지역 배경 포켓몬 · 8개 도장 보상",
      "en": "Location-background Pokémon · Eight stamps",
      "zh-CN": "地区背景宝可梦 · 八枚印章奖励",
      "ja": "地域背景付きポケモン・8個のスタンプ"
    },
    "countryCode": "JP",
    "city": "Sendai • Tohoku",
    "location": {
      "name": "Sendai Castle",
      "latitude": 38.252478,
      "longitude": 140.856156,
      "coordinateKind": "reference",
      "coordinateSourceUrl": "https://www.wikidata.org/wiki/Q598621"
    },
    "schedule": {
      "startDate": "2026-11-03",
      "endDate": null,
      "timeZone": "Asia/Tokyo",
      "startInstant": "2026-11-03T00:00:00Z"
    },
    "rewards": [
      {
        "speciesId": 131,
        "name": "Lapras",
        "costume": null,
        "spriteUrl": "/regional-assets/pm131.icon.824e17ae68e0.png",
        "background": {
          "name": "Sendai • Tohoku Location Background",
          "imageUrl": null,
          "localPresetId": "wild-area-sendai-2026"
        },
        "method": {
          "ko": "해당 지역의 지정 스탬프 8개를 모두 모아 보상 수령",
          "en": "Collect all eight designated regional stamps and claim the reward",
          "zh-CN": "集齐该地区指定的八枚印章后领取奖励",
          "ja": "地域の指定スタンプ8個をすべて集めて報酬を受け取る"
        },
        "backgroundChance": "guaranteed"
      }
    ],
    "limitations": [
      {
        "ko": "좌표는 여러 도장 장소 중 한 곳의 참고점입니다. 이곳 한 군데에서 8개를 모두 얻는 방식이 아니에요.",
        "en": "This coordinate is one reference location; all eight stamps are not collected at a single point.",
        "zh-CN": "该坐标只是多个印章地点之一，并非在同一地点获得全部八枚。",
        "ja": "この座標は複数ある地点の1つです。1か所で8個すべてを集める形式ではありません。"
      },
      {
        "ko": "현재 종료일이 발표되지 않았으며, 실제 도장 지점은 게임에서 확인하세요.",
        "en": "No end date is currently announced. Find actual stamp locations in the game.",
        "zh-CN": "目前未公布结束日期；实际印章地点请在游戏中确认。",
        "ja": "終了日は現在未発表です。実際のスタンプ地点はゲーム内で確認してください。"
      }
    ],
    "sources": [
      "https://pokemongo.com/news/forever-stamp-rally-go-wild-area-2026"
    ],
    "checkedAt": "2026-11-10"
  },
  {
    "id": "mexico-hawlucha-stamp",
    "group": "permanent-stamps",
    "title": {
      "ko": "지역 배경 포켓몬 · 8개 도장 보상",
      "en": "Location-background Pokémon · Eight stamps",
      "zh-CN": "地区背景宝可梦 · 八枚印章奖励",
      "ja": "地域背景付きポケモン・8個のスタンプ"
    },
    "countryCode": "MX",
    "city": "Mexico City",
    "location": {
      "name": "Palacio de Bellas Artes",
      "latitude": 19.435277777777777,
      "longitude": -99.14138888888888,
      "coordinateKind": "reference",
      "coordinateSourceUrl": "https://www.wikidata.org/wiki/Q1139081"
    },
    "schedule": {
      "startDate": "2026-11-02",
      "endDate": null,
      "timeZone": "America/Mexico_City",
      "startInstant": "2026-11-03T00:00:00Z"
    },
    "rewards": [
      {
        "speciesId": 701,
        "name": "Hawlucha",
        "costume": null,
        "spriteUrl": "/regional-assets/pm701.icon.0b5d8a0810d8.png",
        "background": {
          "name": "Mexico City Location Background",
          "imageUrl": null,
          "localPresetId": "wild-area-mexico-city-2026"
        },
        "method": {
          "ko": "해당 지역의 지정 스탬프 8개를 모두 모아 보상 수령",
          "en": "Collect all eight designated regional stamps and claim the reward",
          "zh-CN": "集齐该地区指定的八枚印章后领取奖励",
          "ja": "地域の指定スタンプ8個をすべて集めて報酬を受け取る"
        },
        "backgroundChance": "guaranteed"
      }
    ],
    "limitations": [
      {
        "ko": "좌표는 여러 도장 장소 중 한 곳의 참고점입니다. 이곳 한 군데에서 8개를 모두 얻는 방식이 아니에요.",
        "en": "This coordinate is one reference location; all eight stamps are not collected at a single point.",
        "zh-CN": "该坐标只是多个印章地点之一，并非在同一地点获得全部八枚。",
        "ja": "この座標は複数ある地点の1つです。1か所で8個すべてを集める形式ではありません。"
      },
      {
        "ko": "현재 종료일이 발표되지 않았으며, 실제 도장 지점은 게임에서 확인하세요.",
        "en": "No end date is currently announced. Find actual stamp locations in the game.",
        "zh-CN": "目前未公布结束日期；实际印章地点请在游戏中确认。",
        "ja": "終了日は現在未発表です。実際のスタンプ地点はゲーム内で確認してください。"
      }
    ],
    "sources": [
      "https://pokemongo.com/news/forever-stamp-rally-go-wild-area-2026"
    ],
    "checkedAt": "2026-11-10"
  },
  {
    "id": "night-out-london-2026",
    "group": "night-out",
    "title": {
      "ko": "나이트 아웃 · 한정 장소 배경",
      "en": "Pokémon Night Out · Location Background",
      "zh-CN": "Pokémon Night Out · 限定地点背景",
      "ja": "Pokémon Night Out・会場限定背景"
    },
    "countryCode": "GB",
    "city": "London",
    "location": {
      "name": "The O2 Arena",
      "latitude": 51.50299,
      "longitude": 0.00307,
      "coordinateKind": "reference",
      "coordinateSourceUrl": "https://gall.dcinside.com/mgallery/board/view/?id=pokemongoplus&no=239600&search_head=90&page=1"
    },
    "schedule": {
      "startDate": "2026-11-10",
      "endDate": "2026-11-10",
      "timeZone": "Europe/London"
    },
    "rewards": [
      {
        "speciesId": 25,
        "name": "Pikachu",
        "costume": null,
        "spriteUrl": "/regional-assets/pm25.icon.4db52480d109.png",
        "background": {
          "name": "London · Night Out Location Background",
          "imageUrl": "/regional-assets/lc_nightOut2026_London.f4a370585d1a.png"
        },
        "method": {
          "ko": "현장 1성 레이드에서 잡은 포켓몬",
          "en": "Pokémon caught from an in-person 1-star raid",
          "zh-CN": "在现场1星团体战中捕获",
          "ja": "現地の1つ星レイドで捕獲"
        },
        "backgroundChance": "guaranteed"
      },
      {
        "speciesId": 94,
        "name": "Gengar",
        "costume": null,
        "spriteUrl": "/regional-assets/pm94.icon.92696095fd4e.png",
        "background": {
          "name": "London · Night Out Location Background",
          "imageUrl": "/regional-assets/lc_nightOut2026_London.f4a370585d1a.png"
        },
        "method": {
          "ko": "현장 3성 레이드에서 잡은 포켓몬",
          "en": "Pokémon caught from an in-person 3-star raid",
          "zh-CN": "在现场3星团体战中捕获",
          "ja": "現地の3つ星レイドで捕獲"
        },
        "backgroundChance": "guaranteed"
      }
    ],
    "limitations": [
      {
        "ko": "행사 참석자를 대상으로 한 보상입니다. 공연장 입장 조건을 확인하세요.",
        "en": "Rewards are for event attendees. Check venue entry requirements.",
        "zh-CN": "奖励面向活动参加者，请确认场馆入场条件。",
        "ja": "イベント参加者向けの報酬です。会場の入場条件を確認してください。"
      },
      {
        "ko": "정확한 게임 운영 시간은 공지되지 않았어요. LA 행사는 10월 24일, 런던 행사는 11월 10일입니다.",
        "en": "Exact gameplay hours were not announced. Los Angeles was October 24; London is November 10.",
        "zh-CN": "游戏内确切活动时间未公布。洛杉矶为10月24日，伦敦为11月10日。",
        "ja": "ゲーム内の詳しい時間は未発表です。LAは10月24日、ロンドンは11月10日です。"
      }
    ],
    "sources": [
      "https://pokemongo.com/news/pokemon-night-out-irl-details2026"
    ],
    "checkedAt": "2026-11-10"
  },
  {
    "id": "night-out-la-2026",
    "group": "night-out",
    "title": {
      "ko": "나이트 아웃 · 한정 장소 배경",
      "en": "Pokémon Night Out · Location Background",
      "zh-CN": "Pokémon Night Out · 限定地点背景",
      "ja": "Pokémon Night Out・会場限定背景"
    },
    "countryCode": "US",
    "city": "Los Angeles",
    "location": {
      "name": "Intuit Dome",
      "latitude": 33.94446,
      "longitude": -118.34337,
      "coordinateKind": "reference",
      "coordinateSourceUrl": "https://gall.dcinside.com/mgallery/board/view/?id=pokemongoplus&no=239600&search_head=90&page=1"
    },
    "schedule": {
      "startDate": "2026-10-24",
      "endDate": "2026-10-24",
      "timeZone": "America/Los_Angeles"
    },
    "rewards": [
      {
        "speciesId": 25,
        "name": "Pikachu",
        "costume": null,
        "spriteUrl": "/regional-assets/pm25.icon.4db52480d109.png",
        "background": {
          "name": "Los Angeles · Night Out Location Background",
          "imageUrl": "/regional-assets/lc_nightOut2026_LA.55bfefaf8c21.png"
        },
        "method": {
          "ko": "현장 1성 레이드에서 잡은 포켓몬",
          "en": "Pokémon caught from an in-person 1-star raid",
          "zh-CN": "在现场1星团体战中捕获",
          "ja": "現地の1つ星レイドで捕獲"
        },
        "backgroundChance": "guaranteed"
      },
      {
        "speciesId": 94,
        "name": "Gengar",
        "costume": null,
        "spriteUrl": "/regional-assets/pm94.icon.92696095fd4e.png",
        "background": {
          "name": "Los Angeles · Night Out Location Background",
          "imageUrl": "/regional-assets/lc_nightOut2026_LA.55bfefaf8c21.png"
        },
        "method": {
          "ko": "현장 3성 레이드에서 잡은 포켓몬",
          "en": "Pokémon caught from an in-person 3-star raid",
          "zh-CN": "在现场3星团体战中捕获",
          "ja": "現地の3つ星レイドで捕獲"
        },
        "backgroundChance": "guaranteed"
      }
    ],
    "limitations": [
      {
        "ko": "행사 참석자를 대상으로 한 보상입니다. 공연장 입장 조건을 확인하세요.",
        "en": "Rewards are for event attendees. Check venue entry requirements.",
        "zh-CN": "奖励面向活动参加者，请确认场馆入场条件。",
        "ja": "イベント参加者向けの報酬です。会場の入場条件を確認してください。"
      },
      {
        "ko": "정확한 게임 운영 시간은 공지되지 않았어요. LA 행사는 10월 24일, 런던 행사는 11월 10일입니다.",
        "en": "Exact gameplay hours were not announced. Los Angeles was October 24; London is November 10.",
        "zh-CN": "游戏内确切活动时间未公布。洛杉矶为10月24日，伦敦为11月10日。",
        "ja": "ゲーム内の詳しい時間は未発表です。LAは10月24日、ロンドンは11月10日です。"
      }
    ],
    "sources": [
      "https://pokemongo.com/news/pokemon-night-out-irl-details2026"
    ],
    "checkedAt": "2026-11-10"
  }
];
