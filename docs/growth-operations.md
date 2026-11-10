# 제보와 기본 이용 통계 운영

## 저장과 접근

새 D1 바인딩 `DB`는 기존 일정 캐시(R2 또는 `SCHEDULE_CACHE` KV)와 별개다. 사용자의 이름·연락처·원래 IP·사용자 에이전트·좌표·검색어를 통계 테이블에 저장하지 않는다. 방문자 키는 이 사이트의 브라우저 저장소에서 무작위로 만들고 서버에서는 SHA-256 해시로 바꾼다. 이는 실제 사람 수가 아니라 브라우저 기준 지표다. 저장소 삭제·기기 변경·차단에 따라 값이 달라진다.

일반 방문자는 제보를 `POST /api/feedback`으로 접수할 수 있지만 내용 목록을 읽는 공개 API는 없다. 운영자는 본인 Cloudflare 계정의 **Workers & Pages → D1 → pokedoko-growth → Console 또는 Studio**에서 확인한다. 공개 GitHub 저장소에 제보 내용·연락처·운영자 인증 토큰을 복사하지 않는다.

별도의 통계 관리자 비밀번호나 공개 통계 페이지는 만들지 않았다. 기존 Cloudflare 계정 권한으로 관리한다. 사이트의 ‘의견 보내기’ 창에서 통계 중단이 가능하며 DNT와 GPC 설정도 존중한다. 제보는 통계와 독립적으로 이용할 수 있다.

## 운영자가 바로 확인하는 SQL

로컬에서 Cloudflare에 로그인돼 있다면 아래 한 줄로 최근7일의 집계를 볼 수 있다. 제보 내용이나 방문자 해시는 출력하지 않는다.

```sh
npm run growth:report
# 최근30일: npm run growth:report -- --days 30
```

채널별 일별 이용 현황:

```sql
SELECT * FROM growth_daily_summary ORDER BY day DESC, source;
```

전체 채널 합산:

```sql
SELECT day,
  SUM(page_views) AS page_views,
  SUM(coordinate_copies) AS coordinate_copies,
  SUM(shares) AS shares,
  SUM(unique_visitors) AS unique_browsers,
  SUM(returning_visitors_7d) AS returning_browsers_7d
FROM growth_daily_summary GROUP BY day ORDER BY day DESC;
```

비공개 제보함:

```sql
SELECT * FROM feedback_inbox ORDER BY created_at_kst DESC LIMIT 100;
```

`day`는 한국시간 날짜다. `returning_visitors_7d`는 이전 7일에 같은 익명 브라우저 키가 기록됐던 일별 방문자 수다. 같은 날 여러 화면에 들어와도 방문 브라우저 수는 한 번만 센다. 내부 처리용 수신 기록은 1일, 해시 방문 기록과 제보는 30일, 식별자를 포함하지 않는 집계는 90일 보관 후 매일09시 예약 작업과 일정 API 조회에 따라 동일 실행 인스턴스·DB에서 1시간에한번 예약하는 보조 작업에서 정리한다. 각 작업은 테이블당최대5,000행씩 지우며, 대량 접수나 장애로 생긴 적체는 여러 번의 정리가 필요할 수 있다. 1·30·90일은 정리 기준이며 실제 삭제 시점은 작업 실행과 적체에 따라 달라질 수 있다.

운영자의 확인 방문도 집계될 수 있다. 자동화·다른 기기·저장소 초기화를 실제로 다른 사람이라고 구분할 수 없으므로 이 수치를 검증된 실사용자 수나 홍보 성과로 과장하지 않는다.

통계는 완전한 회계 기록이 아니다. 서버는 같은 브라우저의 동일 행동·화면·도시·채널을 고정5초 구간에서 한 번만 집계하며, 브라우저도 빠른 연속 전송을 줄인다. 고정1분 구간에 통계30건, 고정1시간 구간에 제보3건으로 방문자 키별 한도를 둔다. 이는 기본 중복·과다 요청 완화이며 악의적인 모든 봇을 차단하거나 사람 수를 보증하지 않는다. 통계 오류가 나도 레이드 조회·공유·좌표 복사는 계속 동작한다.

## 홍보 채널

`?from=dc`, `?from=inven`, `?from=naver`, `?from=kakao`, `?from=discord`, `?from=youtube`, `?from=instagram`처럼 정해진 값만 집계한다. 임의의 `utm_source`는 정규화하며 원래 문자열·유입 페이지 주소는 전송하지 않는다. 첫 유입 채널은 브라우저 키와 함께30일 이내 유지한다. 새로 공유하는 링크에는 원래 홍보 태그를 물려주지 않는다. 이는 실제 광고 노출이나 모든 유입 경로를 측정하는 도구가 아니다.

게시할 링크와 간단한 운영 계획은 [community-launch.md](community-launch.md)에 있다. 외부 채널에 자동 게시하거나 메시지를 보내지 않는다.

## 배포와 마이그레이션

`npm run db:generate`로 생성한 SQL과 스냅샷을 소스에 보존한다. 요청을 받을 때 테이블을 만들지 않는다. Sites는 `.openai/hosting.json`의 `d1: "DB"` 선언과 배포 패키지의 Drizzle 마이그레이션을 적용한다. 외부 Workers는 별도 실제 D1 UUID를 `prepare-cloudflare-deploy.mjs --d1-id ...`로 매핑한 뒤 같은 SQL을 적용한다. 기존 캐시 바인딩과 매일09시 Cron을 유지한다.

배포 후 익명 POST 검증, D1 저장 결과, 제보 GET405, DNT 통계 건너뛰기, 과다 요청429를 확인한다. 테스트는 실제 이용자 수나 실제 제보로 소개하지 않는다.
