# 포켓몬 이미지 출처와 대체 표시

확인일: 2026-11-10. 이미지는 생성하거나 편집하지 않았으며 아래 공개 원본 PNG를 그대로 `public/pokemon`에 저장했다. 일반 도감 번호와 폼 전용 이미지 번호는 구분한다.

## 권리와 사용 조건

`public/pokemon`에는 원본 PNG 14개가 포함되어 있다. [PokeAPI sprites의 LICENCE.txt](https://github.com/PokeAPI/sprites/blob/master/LICENCE.txt)는 이미지 콘텐츠의 저작권이 The Pokémon Company에 있음을 명시하며, 저장소 자체는 CC0 1.0으로 배포한다고 안내한다. 이 두 안내를 구분해야 한다. PokeAPI에서 내려받을 수 있다는 이유로 Pokémon 이미지·상표까지 저작권 없는 자유 자산이 되는 것은 아니다.

이 프로젝트는 비공식 팬 도구이며 Pokémon 명칭·이미지의 권리는 각 권리자에게 있다. 이 저장소를 공개하거나 소스 코드의 라이선스를 정하더라도 외부 이미지의 권리를 새로 부여하지 않는다. 다른 용도로 재배포하거나 수익화하려면 원본 조건과 권리 범위를 별도로 확인해야 한다. 전체 외부 자료 고지는 [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)에 정리했다.

## 원본 확인

- [Pokémon GO 픽시 슈퍼 메가 레이드 데이 공식 공지](https://pokemongo.com/ko/news/clefable-super-mega-raid-day-2026)의 대표 이미지에서 메가픽시 모습을 확인했다. 일반 픽시 그림으로 대체하지 않는다.
- [PokeAPI 메가픽시 응답](https://pokeapi.co/api/v2/pokemon/clefable-mega): `id: 10278`, `species: clefable`(도감 36), `sprites.other.official-artwork.front_default`에 정확한 메가폼 원본이 있다. [아트워크 원본](https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/10278.png)을 그대로 저장했다.
- [화이트큐레무 응답](https://pokeapi.co/api/v2/pokemon/kyurem-white)은 10023, [블랙큐레무 응답](https://pokeapi.co/api/v2/pokemon/kyurem-black)은 10022, [무한다이맥스 응답](https://pokeapi.co/api/v2/pokemon/eternatus-eternamax)은 10190의 폼 아트워크를 사용한다.
- 일반 포켓몬 삐삐 35, 별가사리 120, 리그레 605, 자망칼 624, 레시라무 643, 제크로무 644, 암멍이 744, 흥나숭 810, 염버니 813, 울머기 816은 동일한 PokeAPI sprites 저장소의 `other/official-artwork/{id}.png` 원본을 저장했다.
- [PokeAPI sprites 원본 저장소와 사용 안내](https://github.com/PokeAPI/sprites). PokeAPI는 이미지 제공·정리 출처이며 Pokémon 저작권 소유자라는 뜻이 아니다. Pokémon 관련 권리는 각 권리자에게 있다.

포함 파일: `35.png`, `120.png`, `605.png`, `624.png`, `643.png`, `644.png`, `744.png`, `810.png`, `813.png`, `816.png`, `10022.png`, `10023.png`, `10190.png`, `10278.png`. 폼 전용 번호는 PokeAPI 이미지 식별자이며 기본종 도감 번호와 다르다.

## 로딩 동작

`pokemonArtworkCandidates`는 원본 이미지와 확인된 정확한 폼 이미지를 우선 사용한다. 로컬 이미지가 있으면 외부 서비스 응답에 의존하지 않는다. 실패 시 같은 폼의 PokeAPI 원격 아트워크·HOME 이미지를 순서대로 시도한다. 일반종 또는 `normal`일 때만 기본종 아트워크·HOME·스프라이트를 보조 후보로 만든다. 미래 일반종도 유효한 숫자 ID면 별도 라이브러리나 클라이언트 API 요청 없이 같은 안전한 경로를 사용한다.

확인되지 않은 폼에는 일반종 이미지를 넣지 않는다. 후보를 모두 불러오지 못하면 포켓몬 이름과 `폼 이미지 미등록` 또는 `이미지 미등록`을 표시한다. `PokemonArtwork`는 이미지 오류마다 다음 후보를 한 번씩만 시도하고 후보 목록이 바뀌면 다시 로딩한다. 이벤트 등록 정보의 정확성과 실제 이미지 네트워크 성공 여부는 별도로 검증한다.
