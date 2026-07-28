# 세션 자동 이름 + 이름 지정 설계

날짜: 2026-07-28

## 목적

루틴 없이 시작한 세션이 전부 "오늘 운동"으로 표시되어 기록 탭에서 구분 불가 → 부위 기반 자동 이름(표시 전용)과 편집 화면의 이름 지정 추가.

## 요구사항 (사용자 확정)

- 부위 기반 자동 이름 + 편집 가능 (기록 예시: "가슴·삼두 운동 · 4개")
- 기존 기록에도 즉시 적용 (표시 시점 계산, 데이터 무변경)

## 구성 요소

### 1. `sessionTitle(session, exMap)` — `src/db/sessions.ts` (순수 함수)

우선순위: ① `routineName` 있으면 그대로 → ② entries의 운동 부위를 exMap으로 해석해 부위별 entry 수 집계, **최다 2개 부위**를 `·`로 연결 + " 운동" (동수는 등장순, 예: "가슴 운동", "가슴·등 운동") → ③ 해석 가능한 부위가 없으면(빈 세션·전부 삭제된 운동) 기존 `'오늘 운동'`.

### 2. 적용처 — `routineName ?? '오늘 운동'` 전부 교체

- **HistoryScreen** 세션 목록 (exMap 보유)
- **SummaryScreen** 헤더 (exMap 보유)
- **HomeScreen** 진행 중 카드 + 달력 세션 목록 — exercises liveQuery/exMap 신규 추가 필요

### 3. 편집 화면 이름 지정 — `EditSessionScreen.tsx`

- 상단에 `세션 이름` 입력란 (기존 `field` 패턴). 초기값 = 저장된 `routineName ?? ''`, **placeholder = 자동 생성 이름** (routineName 제외한 sessionTitle)
- 저장 시 `routineName = trim 결과 (빈 문자열이면 undefined)` — 비우면 자동 이름으로 복귀
- 표시 전용 자동 이름은 절대 저장하지 않음 (placeholder로만 노출)

## 에러/엣지 케이스

- 홈 루틴 추천(`pickNextRoutine`)은 세션 `routineName`으로 최근 사용을 추적 — 루틴 세션의 이름을 편집으로 바꾸면 해당 루틴의 추천 순번이 앞당겨질 수 있음(무해, 수용)
- 숨긴 운동 포함 세션: exMap은 includeHidden이라 부위 해석 정상
- 백업/과부하 계산/달력 무영향 (표시 전용)

## 테스트

- `sessionTitle` 단위: 루틴명 우선, 1부위, 2부위, 3+부위 최다 2개(동수 등장순), 삭제 운동/빈 세션 fallback
- 화면: 기록 탭·달력 목록·요약 헤더에서 이름 없는 세션이 부위 이름으로 표시
- 편집: placeholder 자동 이름, 이름 저장 반영, 비우면 undefined 복귀
- 기존 테스트 전수 통과 (표시 문자열 단언 영향 확인)

## 범위 제외 (YAGNI)

- 세션 중 이름 변경 UI, 자동 이름의 데이터 영속화, 부위 아이콘/색상
