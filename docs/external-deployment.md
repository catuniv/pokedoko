# Cloudflare Workers 별도 주소 준비

기존 ChatGPT Sites 주소와 별도로 소유자 계정의 `workers.dev` 주소에 공개하는 절차다. 무료 계정에서는 Workers KV를 일정 공유 저장소로 사용한다. R2를 이미 활성화한 계정은 기존 R2 방식도 선택할 수 있다. 준비 스크립트는 로그인·계정/저장소 생성·유료 전환·배포를 실행하지 않는다.

## 필요한 계정 정보

- 직접 관리하는 Cloudflare 계정 ID와 활성화된 Workers 서브도메인. 계정 ID는 비밀번호나 API 토큰이 아니다.
- 같은 계정의 실제 KV namespace ID 또는 이미 활성화된 R2 버킷 이름 중 하나. KV는 `SCHEDULE_CACHE`, R2는 `BUCKET`으로 바인딩한다.
- 계정의 Workers 배포 권한과 선택한 저장소 권한. 처음 연결할 때 소유자가 `npx wrangler login`으로 브라우저에서 승인하고 `npx wrangler whoami`로 계정을 확인한다. 토큰을 채팅에 붙여 넣을 필요는 없다.

저장소가 없으면 소유자가 대시보드나 [공식 KV 명령](https://developers.cloudflare.com/workers/wrangler/commands/kv/)으로 namespace를 만들고 그 ID를 확인한다. 준비 스크립트는 ID 형식만 검사하므로 계정 소유권·실제 저장소 존재·권한은 별도로 확인해야 한다. R2 미활성 계정에서 결제 등록이나 유료 전환을 자동 진행하지 않는다.

KV 무료 제공량에는 하루 읽기 100,000회·서로 다른 키 쓰기 1,000회·저장공간 1GB 등의 제한이 있다. 같은 키 쓰기는 초당 1회 제한이 있으므로 트래픽이 늘면 캐시 동작과 사용량을 확인한다. [현재 KV 제한](https://developers.cloudflare.com/kv/platform/limits/).

## KV 기준 빌드와 준비

저장소 루트에서 다음을 실행한다. 두 `read`에 실제 계정 ID와 미리 만든 KV namespace ID를 각각 입력한다.

```sh
npm test
npm run typecheck
npm run build
read -r POKEDOKO_CF_ACCOUNT_ID
read -r POKEDOKO_CF_KV_NAMESPACE
node scripts/prepare-cloudflare-deploy.mjs \
  --account-id "$POKEDOKO_CF_ACCOUNT_ID" \
  --kv-namespace "$POKEDOKO_CF_KV_NAMESPACE" \
  --name pokedoko \
  --dry-run
```

`--kv-namespace`와 `--bucket`은 함께 사용할 수 없다. `--dry-run`을 빼면 독립 산출물만 만든다. 넣으면 [Wrangler dry-run](https://developers.cloudflare.com/workers/wrangler/commands/workers/#deploy)으로 업로드 없이 모듈을 검증한다. 실패하면 실제 배포 전에 해결한다. 이 검증은 원격 저장소 존재·권한·공급원 응답을 증명하지 않는다.

KV 설정에는 R2 바인딩을 넣지 않고 다음 항목을 생성한다.

```json
{
  "kv_namespaces": [{ "binding": "SCHEDULE_CACHE", "id": "실제 namespace ID" }],
  "triggers": { "crons": ["0 0 * * *"] }
}
```

위 JSON은 구조 설명이며 그대로 배포할 수 없다. 실제 스크립트는 32자리 16진수 ID를 요구하고 빈 값·일반 예제 ID를 거부한다. Worker 빌드에는 `SCHEDULE_CACHE` 어댑터와 `scheduled` 핸들러가 포함되어야 한다. Cron Trigger의 `0 0 * * *`는 UTC 기준 매일 00:00, 한국시간 09:00이다. [공식 Cron 설정](https://developers.cloudflare.com/workers/configuration/cron-triggers/).

생성 결과:

```text
dist/external-cloudflare/pokedoko/
  server/                  # 기존 Worker 빌드 복사본
    wrangler.json          # 계정·KV 또는 R2를 지정한 별도 설정
  client/                  # 같은 빌드의 CSS/JS/이미지
  preparation.json         # 준비 시각·저장소 종류·미배포 상태
  dry-run/                 # --dry-run 사용 시
```

원본 `dist/server/wrangler.json`, `.openai/hosting.json`, `vite.config.ts`, `package.json`은 변경하지 않는다. 기존 준비 폴더는 덮어쓰지 않는다. 새 빌드가 `dist`를 정리할 수 있으므로 코드가 바뀌면 빌드·준비·검증을 다시 한다. 이전 준비 폴더가 남아 있으면 출력 경로를 확인하고 소유자가 정리한 뒤 다시 실행한다.

현재 잠금 파일의 Vinext·Cloudflare Vite 플러그인이 생성한 기존 Wrangler 산출물을 사용한다. [Vinext 최신 배포 안내](https://vinext.dev/docs/deploying/cloudflare)의 초기화 명령은 다른 설정 체계로 파일을 변경할 수 있으므로 기존 프로젝트에서 `vinext init`을 다시 실행하지 않는다. 출력 구조나 추가 바인딩이 바뀌면 준비 스크립트는 명시적 검토를 요구한다.

## R2를 이미 사용하는 계정

미리 만들어 둔 R2 버킷이 있으면 위 준비 명령의 `--kv-namespace` 대신 `--bucket "$POKEDOKO_CF_BUCKET"`을 사용한다. 버킷 자체를 공개할 필요는 없다. `site-creator-r2` 같은 Sites 기본 버킷 이름이나 예제 이름은 허용하지 않는다. [R2 버킷 규칙](https://developers.cloudflare.com/r2/buckets/create-buckets/).

R2 옵션은 기존 BUCKET 구성을 보존하고 KV용 Cron을 자동 추가하지 않는다. 별도 예약 운영이 필요하면 소유자가 확인한 뒤 추가한다.

## 실제 배포와 확인

소유자가 계정·산출물·dry-run 결과를 확인한 뒤 실제 배포를 진행한다. 아래 명령은 원격 배포 작업이다.

```sh
npx wrangler whoami
npx wrangler deploy --config dist/external-cloudflare/pokedoko/server/wrangler.json
```

주소는 실제 배포 결과에서 확인한다. 익명 창으로 `/`, `/calendar`, `/pokemon`, `/raids`, `/live`를 열고 이미지, 지도 및 좌표 복사, 종료 5분 이상 남은 레이드를 확인한다. `/api/feed?status=1`의 `ok`, 저장소 종류와 정상 저장 상태를 확인하고 다시 조회하여 저장본 재사용 여부를 검증한다. KV는 지역별 전파 지연이 있을 수 있으므로 저장·원문 시각을 구분한다. 기존 Sites의 R2 자료는 새 KV로 자동 복사되지 않으며 첫 정상 조회 때 새 저장본이 작성된다. `/api/raids/live`의 공개 공급원도 새 실행 위치에서 재검증한다.

## 두 주소의 09시 갱신

- 기존 Sites 예약 작업은 `https://pokedoko.adorablecompass.chatgpt.site/api/feed?status=1`을 대상으로 그대로 유지한다.
- 외부 KV 배포는 별도의 native Workers Cron Trigger가 매일 한국시간 09시에 `scheduled` 핸들러를 실행한다. 기존 Sites 작업의 URL을 바꿀 필요가 없다.
- 브라우저의 5분 주기·화면 복귀 갱신은 상대 경로 `/api/feed`를 사용하므로 각 사이트의 저장소를 이용한다.

두 사이트의 저장소·로그·갱신 결과를 구분해서 확인한다. 준비 스크립트는 기존 Sites 예약 작업을 변경하지 않는다. 참고: [일정 자동 갱신 운영](automatic-updates.md).
