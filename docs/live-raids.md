# 실시간 레이드 자동 수집

`GET /api/raids/live`는 기본으로 다음 공개 지역 지도 세 곳의 체육관 레이드 JSON을 수집합니다.

| 지역 | 원문 지도 | 데이터 |
| --- | --- | --- |
| 뉴욕 | [NYCPokeMap](https://www.nycpokemap.com/gym.html) | 고정 HTTPS `/raids.php` |
| 시드니 | [SydneyPogoMap](https://www.sydneypogomap.com/gym.html) | 고정 HTTPS `/raids.php` |
| 싱가포르 | [SGPokeMap](https://sgpokemap.com/gym.html) | 고정 HTTPS `/raids.php` |

2026-11-10에 인증 없는 실제 응답을 확인해 연결했습니다. 원문 프론트엔드도 같은 주소를 조회합니다. 현재 배포는 소유자만 접근할 수 있습니다. 전 세계 전체 체육관을 수집하는 서비스로 설명하지 않습니다.

## 실제 자료와 시각의 의미

- `raids`의 좌표·보스 번호/폼·등급·`raid_start`·`raid_end`를 사용합니다. `battles`의 Max Battles는 일반 레이드 집계에 포함하지 않습니다.
- 원문은 개별 체육관의 마지막 관측 시각을 제공하지 않습니다. `meta.time`은 **원문 응답 생성 시각**입니다. 내부 호환 필드 `observedAt`에 이 값을 넣지만 반드시 `timeBasis: "source-response"`를 함께 전달하고 화면에서도 ‘원문 응답’이라고 표시합니다.
- `raid_spawn`을 최근 관측 시각으로 쓰거나 실제로 없는 종료 시간·다음 회차를 추정하지 않습니다.
- 보스가 아직 없는 미래 알은 시작 대기로 표시합니다. 시작 후에도 `pokemon_id=0`이면 진행 중 보스로 표시하지 않습니다.
- 원문 이름이 비어 있으면 ‘이름 미제공 체육관’으로 표시하고 실제 좌표로 구분합니다. 안정 ID는 지역·좌표·실제 시작 시각으로 만듭니다.
- 포켓몬 한국어/영어 이름은 [PokéAPI 명칭 자료](https://github.com/PokeAPI/pokeapi/blob/master/data/v2/csv/pokemon_species_names.csv)를 사용합니다. 알에 임의의 보스를 붙이지 않습니다.

시작 전은 `upcoming`, `startsAt <= 현재 < endsAt`인 게시 레이드는 `active`입니다. 원문 응답 시각 + 10분과 실제 종료 시각 중 빠른 값을 `expiresAt`으로 사용합니다. 이것은 원문 자료의 표시 유효기간이며 체육관을 재관측했다는 의미가 아닙니다. 화면에서도 매초 시작/종료/유효기간을 다시 계산합니다.

## 요청·검증·장애 처리

`lib/raid-map-sources.ts`는 고정한 세 주소만 병렬 조회합니다. 로그인 정보·쿠키·서명을 사용하지 않습니다. 리디렉션은 `manual`로 처리하고 3xx를 실패로 처리합니다. 공개 요청에 식별 가능한 User-Agent를 넣습니다.

- 성공한 소스: 60초 캐시, 같은 시점의 요청은 하나로 합침
- 실패하거나 오래된 소스: 30초 재시도 대기
- 원문 요청: 8초 제한, 응답 스트림 최대 4 MiB, 소스별 레이드 최대 5,000개
- 합친 정규화 목록: 최대 15,000개; 화면은 30개씩 추가 표시
- 좌표·서비스 지역·역전된 시각·없는 날짜·7일보다 먼 시작·24시간을 넘는 구간·미래로 60초를 넘긴 원문 시각을 검증
- 종료된 레이드, 원문 응답 시각이 10분 이상 지난 자료는 제외
- 한 소스가 실패해도 다른 지역은 표시. 모든 소스가 실패하면 `error`이며 정상 0개로 표시하지 않음

캐시를 다시 읽을 때 원문 응답 시각을 새 시각으로 바꾸지 않습니다. `sources[].checkedAt`은 해당 서버 요청을 확인한 시각, `sources[].fetchedAt`은 원문 시각입니다. 최상위 `checkedAt`은 pokedoko API 호출 시각이며 세 값의 의미를 구분합니다. 페이지는 1분 간격으로 API를 조회합니다. 화면을 열지 않은 동안 별도 크론은 실행하지 않고 다음 API 요청에서 필요한 자료를 갱신합니다.

## 설정

별도의 API 키 없이 기본 지역 수집을 사용합니다.

- `POKEDOKO_RAID_MAPS_ENABLED=false`: 기본 지역 수집을 중지. 상태는 `unconfigured`.
- `POKEDOKO_RAID_FEED_URL`: 별도 공급원 JSON으로 대체. HTTPS만 허용.
- `POKEDOKO_RAID_FEED_TOKEN`: 별도 공급원에 필요한 경우 서버 요청의 Bearer 토큰으로만 사용.

이 값들은 서버 환경 변수입니다. `NEXT_PUBLIC_` 접두사를 붙이거나 브라우저 코드·Git에 토큰을 넣지 않습니다. 사용자 입력으로 임의의 프록시 주소를 받지 않습니다. 별도 공급원은 리디렉션·로컬 주소·URL 내 인증 정보를 거부하고 응답 최대 1 MiB를 적용합니다.

별도 JSON 공급원 계약:

```json
{
  "sourceName": "관측 공급원 이름",
  "fetchedAt": "2026-11-10T09:00:00Z",
  "raids": [{
    "id": "stable-raid-occurrence-id",
    "gymName": "실제 체육관 이름",
    "cityId": "seoul",
    "lat": 37.57,
    "lon": 126.97,
    "bossName": "자마젠타",
    "startsAt": "2026-11-10T09:05:00Z",
    "endsAt": "2026-11-10T09:30:00Z",
    "observedAt": "2026-11-10T08:59:00Z",
    "sourceUrl": "https://provider.example/public-observation"
  }]
}
```

위 값은 계약 설명용이며 앱에 샘플 레이드로 넣지 않습니다. 모든 시각에 UTC 오프셋이 필요합니다. 개별 관측 시각을 제공하는 공급원은 `timeBasis: "observed"`(기본값), 원문 응답 시각만 제공한다면 `timeBasis: "source-response"`를 명시해야 합니다. `bossName`은 생략 가능하고 `pokemonId`로 한국어 이름을 찾을 수 있습니다. `formId`, `tier`, `sourceName`은 선택입니다.

## 공개 응답 상태

`status`는 `ready`(표시할 자료 있음), `empty`(정상 연결·유효 항목 없음), `stale`(자료 갱신 필요), `error`(조회/형식 실패), `unconfigured`(수집 중지)를 구분합니다. `sources`는 지역별 상태·원문 링크·시각·레코드 수를 제공합니다. 자료 수는 연결된 원문의 수집 범위에 한정되며 국가 전체의 레이드 수나 밀집도 순위가 아닙니다.

## 검증

`npm test`로 실제 네트워크 없이 정규화·캐시·동시 요청·실패 대기·부분 장애·응답 크기·시각 경계·폼/이름·출처 표시 계약을 확인합니다. 실제 API 연결 검증 결과와 브라우저용 가로채기 fixture는 구분해서 기록합니다.
