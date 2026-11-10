# pokedoko

한국시간(KST) 기준으로 보는 Pokémon GO 글로벌 플래너입니다. 레이드아워 시간표와 실시간 레이드 화면을 분리하고, 이벤트 달력·등장 포켓몬·체육관 기록을 제공합니다. 물려받기 프로젝트와 별도의 저장소입니다.

**서비스 주소: [pokedoko.catuniv.workers.dev](https://pokedoko.catuniv.workers.dev)** — 로그인 없이 무료로 이용할 수 있습니다.

## 시작하기

Node.js 22.13 이상이 필요합니다.

```bash
npm ci
npm run dev -- --port 5200
```

`http://localhost:5200`에서 확인합니다. 기본 개발 포트는 5173이며 다른 프로젝트와 같이 실행할 때 위처럼 포트를 지정하세요.

```bash
npm test          # 시간대·데이터 정규화 테스트
npm run typecheck
npm run build
npm run start    # 빌드한 Worker 로컬 실행
npm run growth:report # 운영자 Cloudflare 계정의 최근7일 이용 집계
```

## 구현된 기능

- `/live` 실시간 레이드: 세계 대표 24개 도시 중심 반경 15km 조회(도시당 최대 800개)와 뉴욕·시드니·싱가포르·런던·밴쿠버 지역 지도 자료를 병합. 보스·종류·등급 선택 칩, 진행/대기·KST 카운트다운·도시/검색 필터, 종료까지 5분 이상 표시, 30개씩 더 보기
- 반경 1·3·5·10km 안의 레이드가 많은 지역 최대 5곳 비교. ‘레이드 밀집순’과 ‘추천 스팟 + 레이드’ 선택, 추천 근거·지역 중심 좌표 복사, 반경 내 체육관 분포·목록 확인. 도시·진행 상태·검색 조건과 5분 기준을 함께 적용하며 30개 표시 제한 전의 전체 유효 자료를 계산
- 지역의 ‘경로 만들기’에서 이동 속도·체육관당 머무름·방문 수·소요 시간에 맞는 레이드 방문 순서를 계산. GPX 1.1 복사·파일 다운로드·좌표 목록 복사, 짧은 유효기간과 종료 시간 재검증. 실제 도로를 반영하지 않는 직선 계획이며 공략 성공·참여 인원은 추정하지 않음
- `/routes` 지가르데 셀 루트: 게임에서 확인한 루트의 GPX·좌표 경로를 브라우저에 등록하고 방문 순서를 계획. 게임 승인 루트의 자동 수집은 미연결이며 임의 GPX를 셀 획득이 보장되는 루트로 표시하지 않음
- `/raids` 레이드아워: 24개 대표 도시의 현지 시각, 공지된 레이드아워·레이드데이 시간표, 한국시간의 시작·종료 시각과 다음 공식 회차
- IANA 시간대 변환: 서머타임, 날짜 변경선, UTC와 현지 시각 원본을 각각 처리
- 세계 지도·대륙/도시/국가 검색·진행 상태 필터·도시 즐겨찾기
- 레이드아워 하단 도시별 추천 장소: 공개 이용자 추천·현지 커뮤니티 자료를 확인한 24개 도시 112곳, 대부분 5곳씩 표시. 추천 글·좌표 근거 링크 제공
- 레이드와 추천 장소의 좌표를 `위도,경도` 형식(공백 없음·원문 정밀도 유지)으로 한 번에 복사. 권한 거부 시 좌표를 선택해서 복사할 수 있는 입력 표시
- `/calendar` 이벤트 달력: 월 이동, 날짜 선택, 유형 필터, 클릭한 카드 내부의 상세 펼침·원문 연결
- `/pokemon` 포켓몬 목록: 한국어/영어/도감 번호 검색, 레이드·이벤트 분류, 등급·색이 다른 모습·출처, 선택한 카드 안의 상세 펼침
- 체육관별 알 부화/시작/종료 타이머: 직접 확인한 시각을 KST로 등록·수정 없이 삭제하며 현재 브라우저에 보관
- 공개 커뮤니티 피드 갱신: 5분 캐시, 조회 실패 시 마지막 확인 자료 및 조회 시각 표시
- 일정은 배포 환경의 R2 또는 KV 공유 저장본으로 유지하고 열려 있는 화면은5분마다·화면 복귀 시 갱신. 확정된 현재/예정/기간 미확인 포켓몬을 분리하고 종료된 일정은 현재 목록에서 자동 제외
- 현재 선택한 도시·보스·반경 등을 담은 화면 공유 링크. 직접 열기와 뒤로가기 시 선택을 복원하며 자동 공유가 막히면 링크를 직접 복사
- 이벤트·도시별 서버 렌더링 상세 안내, 화면별 검색 제목·공유 미리보기·사이트맵. 검색 서비스의 등록이나 검색 순위를 보장하지 않음
- 로그인 없는 비공개 오류 제보와 운영자용 익명 브라우저 기준 사용·채널별 재방문 집계. 통계 중단·DNT/GPC 지원

추천 장소의 출처·확인 범위는 [docs/recommended-spots.md](docs/recommended-spots.md)에 정리했습니다.
일정의 자동 갱신 범위·공유 저장·예약 작업 검증은 [docs/automatic-updates.md](docs/automatic-updates.md), 화이트·블랙큐레무 등 공식 보완 일정은 [docs/official-events.md](docs/official-events.md)에 정리했습니다.
제보·집계 확인과 보관 기준은 [docs/growth-operations.md](docs/growth-operations.md), 게시할 채널별 링크는 [docs/community-launch.md](docs/community-launch.md), 검색·공유 메타데이터는 [docs/seo-and-sharing.md](docs/seo-and-sharing.md)에 정리했습니다.
레이드 경로 계산·GPX의 유효성은 [docs/raid-routes.md](docs/raid-routes.md), 사용자 등록 셀 루트의 범위와 보관은 [docs/zygarde-routes.md](docs/zygarde-routes.md)에 정리했습니다.

## 데이터의 의미

**공식 이벤트 시간과 개별 체육관 실황은 다릅니다.** `/raids`의 지도와 도시 상태는 공지된 레이드아워·레이드데이의 시간 범위에 해당하는지를 계산합니다. `/live`는 공개 지도에 게시된 개별 체육관의 실제 시작·종료 시각을 사용합니다. PoGo Radar의 세계 대표 24개 도시 중심 반경 15km 조회와 5개 지역 지도를 함께 확인합니다. 전 세계 모든 체육관을 수집하는 기능은 아니며 800개 상한에 도달한 도시의 자료는 일부 표본입니다. 빈 응답은 야간·미수집·미보고 여부를 구분할 수 없어 ‘자료 미확인’으로 표시합니다.

공개 JSON은 60초 캐시와 동시 요청 합치기를 사용합니다. 종료된 레이드, 부화 후 보스가 확인되지 않은 알, 10분 이상 지난 원문 응답은 제외합니다. 원문에 개별 체육관의 마지막 관측 시각이 없으므로 `meta.time` 또는 `generated_at`을 **원문 응답 시각**으로 표시합니다. source-response 유효기한은 원문 응답 + 10분 또는 종료 시각 중 빠른 값입니다. 중복 공급원의 같은 체육관·시작 시각은 한 번만 집계하고 알려진 보스·폼을 보존합니다. 실제 로비 참가 인원과 모집 상태는 제공되지 않아 인원을 추정하거나 레이드 수에 합산하지 않습니다. 맥스배틀도 포함하지 않습니다. 자세한 구조는 [docs/live-raids.md](docs/live-raids.md), 세계 공급원 조사와 범위는 [docs/world-raid-sources.md](docs/world-raid-sources.md)에 있습니다. 정적 추천 장소와 직접 입력한 타이머는 실시간 관측 자료와 구분합니다.

공식 공지에 없는 일률적인 평일 운영시간·30분 라운드·매주 수요일 일정을 생성하지 않습니다. 공지의 예외가 우선합니다. 2026-11-09·10 특별 레이드아워는 Into the Wild 공식 공지를 별도로 반영했습니다.

`Feed.confirmedWindow`는 확인된 레이드 로테이션의 날짜와 일치한다는 의미이며 체육관별 실황이 아닙니다. 최근 보스 피드만으로 특정 도시에서 지금 해당 보스를 반드시 만난다고 보장하지 않습니다.

## 구조

```text
app/pokedoko-client.tsx       주요 화면·필터·즐겨찾기·체육관 타이머
app/api/feed/route.ts         서버 측 공개 일정 피드 조회
app/api/raids/live/route.ts   서버 측 체육관 관측 공급원 조회
components/pokedoko/LiveRaids.tsx  실시간 화면·관측 집계·수동 기록
components/pokedoko/          달력과 포켓몬 화면
lib/raid-time.ts              IANA 시간대·일정·타이머 계산
lib/cities.ts                 대표 도시·추천 장소
lib/feed.ts                   피드 정규화·공식 예외·실패 복구
lib/raid-map-sources.ts       실제 지역 지도 수집·60초 캐시·요청 합치기
lib/live-raids.ts             수집 자료 검증·진행 상태·한국어 이름
lib/pokemon-names.json        PokéAPI 한국어/영어 도감 명칭
lib/feed-snapshot.json        실제 확인한 마지막 피드
tests/                       의미 있는 시간대·데이터 검증
```

## 출처와 사용 조건

- 일정·보스: [LeekDuck](https://leekduck.com), [ScrapedDuck](https://github.com/bigfoott/ScrapedDuck)
- 공식 일정 확인: [Pokémon GO 뉴스](https://pokemongo.com/news), [Into the Wild 2026](https://pokemongo.com/news/into-the-wild-2026)
- 실시간 레이드: [NYCPokeMap](https://www.nycpokemap.com/gym.html), [SydneyPogoMap](https://www.sydneypogomap.com/gym.html), [SGPokeMap](https://sgpokemap.com/gym.html)
- 추가 수집: [LondonPogoMap](https://londonpogomap.com/gym.html), [VanPokeMap](https://vanpokemap.com/gym.html), [PoGo Radar](https://pokecoords.iflowgo.com/)
- 포켓몬 명칭: [PokéAPI 공개 명칭 데이터](https://github.com/PokeAPI/pokeapi/blob/master/data/v2/csv/pokemon_species_names.csv)
- 포켓몬 이미지: [PokeAPI sprites](https://github.com/PokeAPI/sprites), [원본 라이선스·권리 고지](https://github.com/PokeAPI/sprites/blob/master/LICENCE.txt). 저장한 PNG 14개의 출처는 [이미지 문서](docs/pokemon-artwork.md)에 정리했습니다.
- 지도: [Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/), 공개 도메인

ScrapedDuck은 LeekDuck의 허락을 받아 제공되는 커뮤니티 피드입니다. [원본 사용 조건](https://github.com/bigfoott/ScrapedDuck#for-developers)에 따라 LeekDuck과 ScrapedDuck의 출처를 표시하며 광고 수익화와 유료벽을 사용하지 않습니다. 현재 서비스는 무료입니다.

Pokémon 명칭·이미지의 권리는 해당 권리자에게 있으며 본 프로젝트는 비공식 팬 도구입니다. PokeAPI에서 제공하는 이미지도 저작권 없는 자유 이미지로 취급하지 않습니다. 외부 이미지·피드·지도·동봉한 라이브러리의 조건은 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)를 확인하세요. 이 고지는 프로젝트 소스 코드에 새로운 포괄 라이선스를 부여하지 않습니다.

## 배포와 접근 권한

현재 운영 주소는 **[https://pokedoko.catuniv.workers.dev](https://pokedoko.catuniv.workers.dev)**이며 **로그인 없이 누구나 접속 가능**합니다. 저장소에는 Sites 배포 설정도 보존되어 있습니다. `.openai/hosting.json`의 Site ID를 유지하고 사용자의 요청 없이 접근 정책을 바꾸지 않습니다. GitHub 저장소의 공개 여부와 웹사이트 접속 권한은 별개입니다.

현재 서비스는 로그인 없는 공개 정보 도구입니다. 다른 호스팅으로 옮겨도 이 공개 정책을 유지합니다. 폴더의 `npm run dev`는 로컬 확인용입니다. 실시간 공급원 URL·토큰은 서버 환경 변수로만 설정하며 브라우저 코드나 Git에 넣지 않습니다. 배포 전에 `npm test`, `npm run typecheck`, `npm run build`를 확인합니다. 외부 Cloudflare Workers 배포 준비는 [docs/external-deployment.md](docs/external-deployment.md)에 정리합니다.

## 다음 연동 지점

다른 지역의 실제 공급원이 확인되면 고정 수집 소스를 추가합니다. 관측 범위와 갱신 기준이 동일하지 않아 현재 개수를 국가 전체 밀집도 순위로 사용하지 않습니다. 반경별 추천은 각 체육관 좌표를 중심 후보로 삼아 같은 도시 내 수집된 레이드 수를 비교한 결과이며, 모든 가능한 지점의 최적해나 참여 인원 수는 아닙니다. 개별 체육관 마지막 관측 시각을 제공하는 공급원이 연결되면 `timeBasis: observed`로 구분합니다. 서버 환경 변수 `POKEDOKO_RAID_MAPS_ENABLED=false`로 기본 수집을 중지하거나 `POKEDOKO_RAID_FEED_URL`로 별도 JSON 공급원을 지정할 수 있습니다.
