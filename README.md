# pokedoko

한국시간(KST) 기준으로 보는 Pokémon GO 글로벌 플래너입니다. 레이드아워 시간표와 실시간 레이드 화면을 분리하고, 이벤트 달력·등장 포켓몬·체육관 기록을 제공합니다. 물려받기 프로젝트와 별도의 저장소입니다.

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
```

## 구현된 기능

- `/live` 실시간 레이드: 뉴욕·시드니·싱가포르 공개 지역 지도의 실제 레이드 자동 수집, 보스 한국어 이름·진행/대기·KST 카운트다운·도시/검색 필터, 종료까지 5분 이상인 레이드만 표시, 30개씩 더 보기, 출처별 연결 상태
- `/raids` 레이드아워: 24개 대표 도시의 현지 시각, 공지된 레이드아워·레이드데이 시간표, 한국시간의 시작·종료 시각과 다음 공식 회차
- IANA 시간대 변환: 서머타임, 날짜 변경선, UTC와 현지 시각 원본을 각각 처리
- 세계 지도·대륙/도시/국가 검색·진행 상태 필터·도시 즐겨찾기
- 레이드아워 하단 도시별 추천 장소: 공개 이용자 추천·현지 커뮤니티 자료를 확인한 24개 도시 112곳, 대부분 5곳씩 표시. 추천 글·좌표 근거 링크 제공
- 레이드와 추천 장소의 좌표를 `위도,경도` 형식(공백 없음·원문 정밀도 유지)으로 한 번에 복사. 권한 거부 시 좌표를 선택해서 복사할 수 있는 입력 표시
- `/calendar` 이벤트 달력: 월 이동, 날짜 선택, 유형 필터, 클릭한 카드 내부의 상세 펼침·원문 연결
- `/pokemon` 포켓몬 목록: 한국어/영어/도감 번호 검색, 레이드·이벤트 분류, 등급·색이 다른 모습·출처, 선택한 카드 안의 상세 펼침
- 체육관별 알 부화/시작/종료 타이머: 직접 확인한 시각을 KST로 등록·수정 없이 삭제하며 현재 브라우저에 보관
- 공개 커뮤니티 피드 갱신: 5분 캐시, 조회 실패 시 마지막 확인 자료 및 조회 시각 표시

추천 장소의 출처·확인 범위는 [docs/recommended-spots.md](docs/recommended-spots.md)에 정리했습니다.

## 데이터의 의미

**공식 이벤트 시간과 개별 체육관 실황은 다릅니다.** `/raids`의 지도와 도시 상태는 공지된 레이드아워·레이드데이의 시간 범위에 해당하는지를 계산합니다. `/live`는 공개 지역 지도에 게시된 개별 체육관의 실제 시작·종료 시각을 사용합니다. 자동 수집은 뉴욕·시드니·싱가포르 범위이며, 나머지 도시에는 아직 실시간 자료가 없습니다.

세 지역의 공개 JSON을 60초 캐시로 수집하고 동시 요청을 합칩니다. 종료된 레이드, 부화 후 보스가 확인되지 않은 알, 10분 이상 지난 원문 응답은 제외합니다. 원문에 개별 체육관의 마지막 관측 시각이 없으므로 `meta.time`을 **원문 응답 시각**으로 표시합니다. 이것을 실제 관측 시각으로 설명하지 않습니다. source-response 유효기한은 원문 응답 + 10분 또는 종료 시각 중 빠른 값입니다. 자세한 구조는 [docs/live-raids.md](docs/live-raids.md)에 있습니다. 추천 장소는 정적 명소 목록이며 실측 체육관 수·현재 밀집도 순위가 아닙니다. 체육관 타이머는 사용자가 확인해서 입력한 값만 사용합니다. 종료 시각을 모르면 고정 45분 등을 추측하지 않습니다.

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
- 포켓몬 명칭: [PokéAPI 공개 명칭 데이터](https://github.com/PokeAPI/pokeapi/blob/master/data/v2/csv/pokemon_species_names.csv)
- 지도: [Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/), 공개 도메인

ScrapedDuck은 LeekDuck의 허락을 받아 제공되는 커뮤니티 피드입니다. 해당 프로젝트의 출처 표시 및 광고·유료벽 금지 조건을 지켜야 합니다. 재배포·수익화 전 최신 원문 조건을 확인하세요. Pokémon 명칭·이미지의 권리는 해당 권리자에게 있으며 본 프로젝트는 비공식 팬 도구입니다.

## 배포와 접근 권한

현재 Sites 배포는 **소유자 한 명만** 접근할 수 있는 상태입니다. `.openai/hosting.json`의 Site ID를 유지하고 접근 정책을 바꾸지 않습니다. GitHub 저장소의 비공개 여부와 웹사이트 접속 권한은 별개입니다.

Sites가 로그인과 접근 제어를 담당합니다. 다른 호스팅으로 옮길 때는 인증·소유자 허용 목록을 먼저 연결해야 합니다. 폴더의 `npm run dev`는 로컬 확인용이며 접근 제어를 대체하지 않습니다. 실시간 공급원 URL·토큰은 서버 환경 변수로만 설정하며 브라우저 코드나 Git에 넣지 않습니다. 배포 전에 `npm test`, `npm run typecheck`, `npm run build`를 확인합니다.

## 다음 연동 지점

다른 지역의 실제 공급원이 확인되면 고정 수집 소스를 추가합니다. 관측 범위와 갱신 기준이 동일하지 않아 현재 개수를 국가 전체 밀집도 순위로 사용하지 않습니다. 개별 체육관 마지막 관측 시각을 제공하는 공급원이 연결되면 `timeBasis: observed`로 구분합니다. 서버 환경 변수 `POKEDOKO_RAID_MAPS_ENABLED=false`로 기본 수집을 중지하거나 `POKEDOKO_RAID_FEED_URL`로 별도 JSON 공급원을 지정할 수 있습니다.
