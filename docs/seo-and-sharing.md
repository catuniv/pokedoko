# 검색 노출과 링크 미리보기

검색·공유의 기본 주소는 `https://pokedoko.catuniv.workers.dev`다. `lib/site-metadata.ts`에서 canonical을 고정하므로 같은 코드가 Sites 주소에서 실행돼도 기본 주소는 바뀌지 않는다. 도시·이벤트 선택 쿼리와 추적 파라미터는 기본 화면의 canonical에 포함하지 않는다.

## 페이지와 실제 본문

- `/`, `/live`, `/raids`, `/calendar`, `/pokemon`: 화면별 한국어 제목·설명, Open Graph, Twitter 미리보기와 canonical.
- `/events/[id]`: 실제 피드와 공식 보완 목록의 확인된 이벤트만 서버에서 렌더링한다. 등장 포켓몬·원문·현지 시각/전 세계 공통 시각·IANA 시간대별 한국시간을 제공한다. 종료된 일정은 기록으로 표시하며 다음 개최일로 바꾸지 않는다. 없는 ID는 404다.
- `/cities/[id]`: 기존 24개 도시만 제공한다. 시간대와 시차, 사용자 추천 장소·원문 좌표·추천 및 좌표 근거, 해당 도시의 현재·예정 일정을 서버에서 제공한다. 추천 자료가 3곳인 도시를 임의로 5곳까지 채우지 않는다.

실제 체육관 레이드는 이벤트 시간표와 구분한다. 도시 안내는 체육관 수나 현재 참가 인원을 추정하지 않는다. 원문 갱신 실패 시 마지막 확인 자료임을 표시한다. 상세 페이지의 문서는 자바스크립트가 실행되기 전에도 제목·본문·관련 링크를 포함한다.

## robots와 sitemap

설치된 Vinext의 metadata route scanner와 response handler에서 `app/robots.ts` → `/robots.txt`, `app/sitemap.ts` → `/sitemap.xml` 지원을 확인했다. 테스트는 실제 설치본으로 경로 검색·HTTP200·본문 직렬화를 검사한다.

sitemap에는 기본 5개 화면·24개 도시와 시작/종료가 확인된 이벤트를 최대 **전체 200개 URL**까지 싣는다. ID 중복과 잘못된 날짜·원문 URL을 제외한다. 변경 시각을 알지 못하는 자료에는 오늘 날짜를 `lastModified`로 꾸며 넣지 않는다. 기록인 과거 일정도 해당 날짜의 페이지로 남을 수 있다. 원문에 없는 미래 일정은 생성하지 않는다.

robots는 공개 페이지 크롤링을 허용하고 `/api/`, `/ops`와 인증 콜백 경로를 제외한다. robots 자체는 접근 제어나 확실한 비색인 지시가 아니다. API·운영 경로 응답의 `X-Robots-Tag: noindex`도 함께 유지한다. 검색 노출 여부·순위·반영 시점은 보장하지 않는다. [Google robots 안내](https://developers.google.com/search/docs/crawling-indexing/robots/intro), [sitemap 안내](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap).

## 공유 이미지

`public/og.png`는 1200×630 PNG다. 캐릭터 그림을 편집하지 않고 파랑·노랑·빨강과 일정 카드로 직접 구성한 공통 브랜드 이미지다. 모든 페이지가 각자의 제목·설명과 이 이미지를 사용한다. [Open Graph 규격](https://ogp.me/)에 맞춰 원본 주소·크기·대체 설명을 설정했다.

다시 만들 때는 `node scripts/generate-og-image.mjs`를 실행한다. 프로젝트의 기존 잠금 의존성에 있는 sharp를 사용하며 새 패키지를 설치하거나 외부 이미지를 내려받지 않는다. 한국어 글꼴이 있는 환경에서 생성하고 출력 PNG를 확인한다.

배포 후 실제 주소에서 제목·canonical·OG/Twitter 태그, `/og.png`, `/robots.txt`, `/sitemap.xml`, 도시·이벤트 상세의 원본 HTML과 존재하지 않는 ID의 404를 확인한다. 메타데이터를 만들었다고 검색 도구에 자동 등록되는 것은 아니며, 소유자가 검색 도구 등록을 진행할 때 실제 공개 sitemap 주소를 사용한다.
