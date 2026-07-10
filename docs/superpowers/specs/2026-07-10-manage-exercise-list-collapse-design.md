# 관리 탭 운동 목록 축약 설계

날짜: 2026-07-10

## 목적

운동 라이브러리 확장(736개)으로 관리 탭이 지나치게 길어짐 — 목록을 기본 접힘 + 페이징으로 축약한다.

## 요구사항 (사용자 확정)

- "내 운동 목록 (N개)" 카드 헤더가 토글, **기본 접힘**
- 펼치면: 숨긴 운동 표시 체크박스 + 이름 검색 + **부위 칩(전체 + 7부위)** + 목록 **30개씩** + "더보기 (M개 남음)"
- 검색어/부위 변경 시 표시 개수 30으로 리셋
- 직접 등록 버튼/폼은 펼침 상태 안에 유지

## 구성 요소 — `ManageScreen.tsx` 수정

- state: `listOpen`(기본 false), `exQuery`(기존), `exFilter`(BodyPart | '전체', 기본 '전체'), `visibleCount`(기본 30)
- 헤더: `내 운동 목록 (${exercises.length}개) ${listOpen ? '▴' : '▾'}` — 탭하면 토글 (기존 card-h를 버튼화)
- 필터 체인: showHidden → 부위(`exFilter === '전체' || e.bodyPart === exFilter`) → 검색(기존). 표시: `filtered.slice(0, visibleCount)`
- 더보기: `filtered.length > visibleCount`일 때 `더보기 (${filtered.length - visibleCount}개 남음)` 버튼 → `visibleCount + 30`
- `exQuery`/`exFilter`/`showHidden` 변경 시 `visibleCount`를 30으로 리셋
- 부위 칩은 picker와 동일한 `chips`/`chip` 클래스 재사용 (`['전체', ...BODY_PARTS]`)
- 접힘 상태에서는 체크박스·검색·칩·목록·직접 등록 버튼 모두 미표시

## 에러/엣지 케이스

- 필터 결과 0개: 기존 스타일의 "검색 결과가 없어요" 문구
- 더보기 후 필터 변경: 30으로 리셋되므로 일관적
- 접힘 상태 기본이므로 736개 렌더 비용도 기본 화면에서 사라짐 (성능 부수 효과)

## 테스트 (`ManageScreen.test.tsx`)

- 기본 접힘: 검색창·목록 미표시, 헤더에 개수 표시
- 펼침 후: 검색 동작(기존 테스트를 펼침 클릭 추가로 수정), 부위 칩 필터, 30개 제한 + 더보기 클릭 시 추가 표시
- 검색어 변경 시 visibleCount 리셋 (더보기 후 검색 → 30개 이하 표시)

## 범위 제외 (YAGNI)

- 가상 스크롤, 알파벳 인덱스, 목록 정렬 옵션
