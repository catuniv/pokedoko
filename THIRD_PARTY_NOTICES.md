# 외부 자료와 라이선스 고지

확인일: 2026-11-10.

pokedoko는 [https://pokedoko.catuniv.workers.dev](https://pokedoko.catuniv.workers.dev)에서 무료로 제공하는 비공식 Pokémon GO 팬 도구입니다. 아래는 포함하거나 조회하는 외부 자료의 출처와 사용 조건입니다. 이 문서로 프로젝트 전체에 새로운 MIT 등의 포괄 라이선스를 부여하지 않으며, 소스 코드의 재사용 라이선스 선택은 저장소 소유자에게 있습니다.

## Pokémon 이미지와 명칭

- 출처: [PokeAPI sprites](https://github.com/PokeAPI/sprites), [PokéAPI 명칭 데이터](https://github.com/PokeAPI/pokeapi/blob/master/data/v2/csv/pokemon_species_names.csv).
- 원본 권리 고지: [PokeAPI sprites / LICENCE.txt](https://github.com/PokeAPI/sprites/blob/master/LICENCE.txt).
- 원본은 이미지 콘텐츠의 저작권이 The Pokémon Company에 있음을 명시하면서 저장소 자체를 CC0 1.0으로 배포한다고 안내합니다. 원본 저장소의 CC0 안내가 다른 권리자의 이미지·상표에 대한 권리까지 대신 부여한다는 뜻으로 해석하지 않습니다.
- 이 프로젝트는 Pokémon 명칭·이미지에 대한 소유권이나 별도 사용 허락을 부여하지 않습니다. Pokémon과 관련 명칭·이미지의 권리는 해당 권리자에게 있습니다.
- `public/pokemon/`에 저장한 원본 PNG 14개의 목록과 정확한 폼별 출처는 [docs/pokemon-artwork.md](docs/pokemon-artwork.md)에 보존합니다. 원격으로 불러오는 이미지에도 같은 권리 구분이 적용됩니다.

## Pokémon GO 배경 이미지와 교환 검색 명칭

- 게임 배경 원본: [PokeMiners/pogo_assets](https://github.com/PokeMiners/pogo_assets), `Images/LocationCards`. 원본 저장소는 교육 목적 자료이며 콘텐츠 권리는 Pokémon Company·Niantic 등 각 권리자에게 있음을 안내한다. 공개 원본 접근을 이미지의 자유 재배포 라이선스로 해석하지 않는다. 출처·원본 커밋·바이트 해시는 `lib/trade-background-image-manifest.json`과 [배경 출처 문서](docs/trade-background-sources.md)에 보존한다.
- 2026 와일드에리어 안내 이미지: [LeekDuck](https://leekduck.com/pokemon-go-wild-area/special-backgrounds/). 정지 미리보기의 원본 출처와 표시 범위를 구분한다.
- 자동 갱신 배경 카탈로그·온디맨드 이미지: [psoren/pogo-bg](https://github.com/psoren/pogo-bg). 이 카탈로그는 커뮤니티 자료이며 Pokémon 배경·상표의 권리는 원래 권리자에게 있다. 코드·회원 글·연락처는 가져오지 않는다.
- 일본어·중국어 검색용 포켓몬 명칭은 위 PokeAPI의 공개 `pokemon_species_names.csv`에서 읽어 `lib/pokemon-localized-names.json`에 저장했다. 영어 교환 식별 이름을 유지하면서 해당 언어 이름으로 검색할 수 있다.

## 이벤트와 레이드 보스 데이터

- 출처: [LeekDuck](https://leekduck.com), [ScrapedDuck](https://github.com/bigfoott/ScrapedDuck).
- 사용 조건: [ScrapedDuck / For Developers](https://github.com/bigfoott/ScrapedDuck#for-developers).
- ScrapedDuck은 LeekDuck의 허락을 받아 제공되는 자료라고 안내합니다. 사용 시 **LeekDuck과 ScrapedDuck 모두의 출처를 표시**해야 하며, API를 사용하는 서비스에 **유료벽을 두거나 광고로 수익화할 수 없습니다**.
- pokedoko는 현재 무료이며 광고 수익화와 유료벽을 사용하지 않습니다. README와 화면 하단의 출처 표시를 유지합니다.
- 이 조건은 `lib/feed-snapshot.json`의 저장된 피드와 실행 중 조회하는 같은 출처의 자료에도 적용해 관리합니다. 저장소 공개가 데이터에 새로운 재사용 라이선스를 부여하지 않습니다.
- 별도 일정 확인 출처: [Pokémon GO 공식 뉴스](https://pokemongo.com/news). 공식 공지의 이미지·상표·본문 권리는 원래 권리자에게 있습니다.

## 실시간 레이드 공급원

- [PoGo Radar](https://pokecoords.iflowgo.com/)
- [NYCPokeMap](https://www.nycpokemap.com/gym.html)
- [SydneyPogoMap](https://www.sydneypogomap.com/gym.html)
- [SGPokeMap](https://sgpokemap.com/gym.html)
- [LondonPogoMap](https://londonpogomap.com/gym.html)
- [VanPokeMap](https://vanpokemap.com/gym.html)

공개 지도에 게시된 JSON을 고정 주소에서 조회하고 원문 링크와 응답 시각을 표시합니다. 이 공급원들의 자료에 대한 포괄적인 자유 재배포 라이선스는 확인하지 못했습니다. 공개 엔드포인트에 접근할 수 있다는 사실만으로 외부 데이터의 재배포·상업 이용 권한을 보장하지 않습니다. 공급원과 검증 범위는 [docs/world-raid-sources.md](docs/world-raid-sources.md)에 정리했습니다.

## 지도와 추천 장소

- 지도 데이터: [Natural Earth / Terms of Use](https://www.naturalearthdata.com/about/terms-of-use/). 원본 지도 데이터는 공개 도메인이며 개인·교육·상업적 사용과 수정·배포를 허용한다고 명시합니다.
- 커뮤니티 추천과 좌표: [docs/recommended-spots.md](docs/recommended-spots.md), [원문·좌표 근거 목록](docs/recommended-spots-sources.json).
- 공개 셀 루트 상세 지도: [OpenStreetMap](https://www.openstreetmap.org/copyright) 기여자 및 [표준 타일 이용 정책](https://operations.osmfoundation.org/policies/tiles/). 지도 상세가 열릴 때 현재 화면 타일만 요청하며 기본 브라우저 캐시·Referer·가시적인 출처 표시를 유지한다. 오프라인 타일 다운로드·대량 미리 불러오기는 제공하지 않는다.

추천 글과 좌표 근거의 링크를 보존합니다. 추천 사실을 요약해 표시하는 것과 외부 게시글 본문·사진의 권리는 구분합니다. 외부 게시글이나 사진 전체를 이 저장소의 소스 코드와 같은 조건으로 재배포할 권리를 부여하지 않습니다.

## 사용자 제보 게임 Route

제작자 또는 이용 허락을 받은 사용자가 직접 제보하고 운영자가 검토한 자료만 공개한다. 해당 자료의 출처·권리 근거·원본/추정/복원 분류를 카드 상세와 GPX에 보존한다. 개별 자료에 대한 이용 허락이 이 저장소 전체나 다른 Route의 포괄 라이선스가 되지는 않는다. 최초 적격 seed 파일은0개이며 일반 파밍 GPX나 재배포 권한 미확인 안내선을 실제 게임 원본으로 등록하지 않았다. 운영은 [docs/community-routes.md](docs/community-routes.md)를 따른다.

## 동봉한 외부 소프트웨어

다음 코드의 원래 저작권과 MIT 라이선스 고지를 보존합니다.

- shadcn 스타일: [vendor/shadcn-tailwind-4.13.0.LICENSE.md](vendor/shadcn-tailwind-4.13.0.LICENSE.md), Copyright (c) 2023 shadcn.
- Sites Vite 플러그인: [scripts/vite/sites-vite-plugin.LICENSE](scripts/vite/sites-vite-plugin.LICENSE), Copyright (c) 2026 OpenAI.

그 밖에 패키지 관리자를 통해 설치하는 의존성은 각각의 원본 패키지와 라이선스를 따릅니다. 외부 소프트웨어에 적용되는 라이선스와 Pokémon 이미지·외부 데이터의 권리는 별도로 유지합니다.
