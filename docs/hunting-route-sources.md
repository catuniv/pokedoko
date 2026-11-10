# 오토헌팅 경로 원본과 검증

검증일: 2026-11-10. `lib/hunting-catalog.ts`에는 경로 이름·도시·점 개수·거리·출처 주소만 보관한다. 원본 GPX나 좌표 배열은 이 저장소·서버 캐시에 복제하지 않는다. 사용자가 불러오기를 선택하면 브라우저에서 지정한 원본 호스트로 직접 요청한다. 서버 프록시나 CORS 우회는 사용하지 않는다.

## 공개 경로 모음

출처는 [king-owl/pogo-gpx-archive](https://github.com/king-owl/pogo-gpx-archive), 고정 리비전은 [`c360bce9ea15f4e9eb0d5b6c670cf9f089e33772`](https://github.com/king-owl/pogo-gpx-archive/tree/c360bce9ea15f4e9eb0d5b6c670cf9f089e33772)이다. [원본 설명](https://github.com/king-owl/pogo-gpx-archive/blob/c360bce9ea15f4e9eb0d5b6c670cf9f089e33772/README.md)은 높은 포켓스톱 밀도의 동선과 반복 걷기용 경로를 구분한다. 이는 작성 당시의 설명이며 현재 포켓스톱 수·출현량·통행 가능 여부를 보장하지 않는다.

[커뮤니티의 경로 모음 추천](https://www.reddit.com/r/PokemonGoSpoofing/comments/p3hpjr/)은 이 저장소를 직접 연결한다. [커뮤니티 데이 GPX 공유 글](https://www.reddit.com/r/PokemonGoSpoofing/comments/iv8f75/com_day_gpx_routes_at_common_hotspots_for_both/)에서도 뉴욕·도쿄·시드니·부다페스트 등 도시의 경로를 공유했다. 두 글은 커뮤니티 공유의 근거이며, 아래 8개 파일 각각의 인기 순위나 동일 경로임을 증명하지 않는다. UI에는 순위·최고·현재 밀집도 같은 표현을 쓰지 않는다.

## 파일별 검증값

거리는 원본의 문서 순서대로 연속한 좌표 사이 Haversine 거리를 더한 값이다. 평균 지구 반지름 6,371.0088km를 사용하며 고도·도로 우회는 포함하지 않는다. 점 개수에는 원본의 닫는 좌표를 포함한다. `closed`는 원본의 첫 좌표와 마지막 좌표가 정확히 같을 때만 참이며, 가까운 끝점을 임의로 연결하지 않는다. 다음 값은 소수점 셋째 자리로 반올림한 km이다.

| 카탈로그 | 원본 파일 | 점 | 거리 | 원본 끝점 → 시작점 | closed |
| --- | --- | ---: | ---: | ---: | --- |
| 뉴욕 리버 파크 | [River Park, New York.gpx](https://github.com/king-owl/pogo-gpx-archive/blob/c360bce9ea15f4e9eb0d5b6c670cf9f089e33772/Hotspot%20Routes/gpx/North%20America_Canada/River%20Park%2C%20New%20York.gpx) | 58 | 4.620 | 74.32m | false |
| 도쿄 우에노 | [Ueno, Tokyo Japan.gpx](https://github.com/king-owl/pogo-gpx-archive/blob/c360bce9ea15f4e9eb0d5b6c670cf9f089e33772/Hotspot%20Routes/gpx/Asia-Pacific_Oceania/Ueno%2C%20Tokyo%20Japan.gpx) | 187 | 12.236 | 0m | true |
| 도쿄 히비야 공원 | [Hibiya Park, Japan.gpx](https://github.com/king-owl/pogo-gpx-archive/blob/c360bce9ea15f4e9eb0d5b6c670cf9f089e33772/Hotspot%20Routes/gpx/Asia-Pacific_Oceania/Hibiya%20Park%2C%20Japan.gpx) | 47 | 2.657 | 107.63m | false |
| 시드니 왕립 식물원 | [Royal Botanic Gardens, Sydney Australia.gpx](https://github.com/king-owl/pogo-gpx-archive/blob/c360bce9ea15f4e9eb0d5b6c670cf9f089e33772/Hotspot%20Routes/gpx/Asia-Pacific_Oceania/Royal%20Botanic%20Gardens%2C%20Sydney%20Australia.gpx) | 48 | 2.958 | 40.83m | false |
| 사라고사 기본 | [Zaragoza, Spain.gpx](https://github.com/king-owl/pogo-gpx-archive/blob/c360bce9ea15f4e9eb0d5b6c670cf9f089e33772/Hotspot%20Routes/gpx/Europe_Africa/Zaragoza%2C%20Spain.gpx) | 145 | 6.786 | 9.05m | false |
| 사라고사 XXL | [Zaragoza, Spain XXL.gpx](https://github.com/king-owl/pogo-gpx-archive/blob/c360bce9ea15f4e9eb0d5b6c670cf9f089e33772/Hotspot%20Routes/gpx/Europe_Africa/Zaragoza%2C%20Spain%20XXL.gpx) | 329 | 17.825 | 168.05m | false |
| 부다페스트 마르기트섬 | [Margaret Island, Budapest.gpx](https://github.com/king-owl/pogo-gpx-archive/blob/c360bce9ea15f4e9eb0d5b6c670cf9f089e33772/Hotspot%20Routes/gpx/Europe_Africa/Margaret%20Island%2C%20Budapest.gpx) | 53 | 1.874 | 27.14m | false |
| 부다페스트 대안 | [Budapest, Alternate Route.gpx](https://github.com/king-owl/pogo-gpx-archive/blob/c360bce9ea15f4e9eb0d5b6c670cf9f089e33772/Hotspot%20Routes/gpx/Europe_Africa/Budapest%2C%20Alternate%20Route.gpx) | 75 | 2.184 | 0m | true |

모든 원본은 `wpt` 좌표를 기록한다. 일부는 `trkseg` 안, 시드니는 `rte` 안에 `wpt`를 넣어 정식 GPX 스키마의 `trkpt`·`rtept` 구조와 다르다. XML을 먼저 안전하게 파싱한 뒤 기존 문서 순서의 `wpt` 목록을 사용하며, 좌표를 재정렬하거나 추천 스팟을 연결해 대체하지 않는다. 시드니 원본 48점에는 연속 동일 좌표 한 쌍이 있어 파서가 이를 제거한 경로는 47점이다. 표의 원본 점 개수와 중복 제거 뒤 점 개수를 혼동해 로드 실패로 처리하지 않는다. 우에노 원본은 XML 선언 앞에 LF가 한 개 있어 XML 파싱 입력에서 선행 공백만 제거해야 한다. DTD·ENTITY 선언, 잘못된 XML, 유효하지 않은 좌표는 계속 거절한다.

위 8개 고정 raw 주소는 검증 당시 HTTP 200과 `Access-Control-Allow-Origin: *`를 반환했다. 파일은 `text/plain`이므로 XML은 클라이언트에서 명시적으로 파싱한다. 앞으로 외부 원본이 삭제되거나 CORS가 달라지면 실패를 표시하고 이전 선택의 경로를 새 경로로 오인하지 않는다. 고정 리비전은 재현 가능한 출처이며 영구 가용성을 뜻하지 않는다.

## 권리 표시와 제외 자료

검증 당시 원본 저장소의 루트에 LICENSE가 없고 GitHub 라이선스 메타데이터도 `null`이었다. 공개 열람·다운로드 가능 여부와 재배포 허락은 다르다. 작성자의 별도 재배포 허락이나 CC0·MIT 같은 라이선스를 확인하지 못했으므로 `licenseName`·`licenseUrl`·원저작자를 임의로 채우지 않는다. `king-owl`은 저장소 소유자이며 개별 좌표 작성자라고 단정하지 않는다. 이 카탈로그는 원문 링크 안내이며 새로운 라이선스를 부여하지 않는다. 사용자가 직접 불러온 경로의 저장·수정·공유 권한은 원문 조건을 따른다.

뉴욕 [Central Park, New York CIty.gpx](https://github.com/king-owl/pogo-gpx-archive/blob/c360bce9ea15f4e9eb0d5b6c670cf9f089e33772/Hotspot%20Routes/gpx/North%20America_Canada/Central%20Park%2C%20New%20York%20CIty.gpx)는 닫는 `</trkseg></trk>`가 없어 XML 파싱에 실패한다. 정상 GPX인 것처럼 조용히 고쳐서 제공하지 않고 제외했다. 대신 독립적으로 XML·좌표를 검증한 같은 도시의 리버 파크 파일을 연결한다.

[geoo.app Central Park Loop 샘플](https://geoo.app/sample-data/)에는 개별 파일 CC0 표시가 있지만 Pokémon GO 오토헌팅 경로 또는 커뮤니티 인기 경로라는 근거는 없다. 숫자를 채우려고 이 샘플을 인기 경로로 넣지 않았다. 싱가포르·타이베이 역시 이번 고정 원본에서 검증하지 않아 추가하지 않았다.
