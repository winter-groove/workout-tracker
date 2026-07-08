# 과거 날짜 운동 등록 (백데이트 세션) 설계

날짜: 2026-07-08

## 목적

놓친 날(예: 어제)의 운동을 원하는 날짜로 등록할 수 있게 한다. 현재는 세션이 항상 `Date.now()`로 생성되어 오늘로만 기록됨.

## 요구사항 (사용자 확정)

- 입구는 **홈 달력**: 과거(오늘 포함) 날짜 선택 시 "＋ 이 날짜에 기록 추가" 버튼
- 기록 흐름은 평소와 동일 (세션 화면 → 완료 → 요약 화면)

## 아키텍처: 시작 시각 백데이트 (스키마 변경 없음)

`Session.startedAt`을 선택한 날짜의 **정오(12:00)**로 지정해 세션을 생성한다. 달력 ✓ 표시, 기록 탭 정렬, 과부하 비교(`startedAt` 기준 `getPreviousRecord`/`getPRWeight`)가 전부 기존 로직 그대로 정확하게 동작한다.

## 구성 요소

### 1. `src/db/sessions.ts` — 백데이트 지원

```ts
startSession(routine?: Routine, startedAt?: number): Promise<Session>
  // startedAt 미지정 시 기존처럼 Date.now()
  // 활성 세션이 이미 있으면 기존처럼 그 세션 반환 (호출부에서 사전 차단)

buildEntry(exerciseId: string, defaultSets = 3, before?: number): Promise<SessionEntry>
  // 프리필 기준: before 지정 시 getPreviousRecord(exerciseId, before), 미지정 시 기존 getLastRecord
  // startSession은 자신의 startedAt을 before로 전달
```

`finishedAt`은 기존처럼 완료 시각(`Date.now()`) — 완료 여부 필터에만 쓰이고 모든 표시·계산은 `startedAt` 기준이라 무해.

### 2. 홈 달력 — `HomeScreen.tsx` 수정

선택한 날짜의 세션 목록 아래 (빈 문구 포함 그 아래):

- **과거 또는 오늘 날짜**일 때만 "＋ 이 날짜에 기록 추가" 버튼 표시 (미래 날짜는 숨김)
- 버튼 탭 시:
  - 활성 세션이 있으면 `alert('진행 중인 운동을 먼저 완료하세요')` 후 중단
  - 없으면 인라인으로 루틴 선택지 펼침 (오늘 뭐 할까요 목록과 같은 스타일): 루틴 버튼들 + "빈 세션"
  - 선택 시 `startSession(routine, 선택날짜 정오)` → `navigate('/session')`

### 3. 세션 화면 — `SessionScreen.tsx` 수정 (백데이트 정합성)

- **경과 시계 숨김**: `session.startedAt`이 오늘이 아니면 상단 시계(`fmtElapsed`) 대신 세션 날짜(`M/D`) 표시
- **비교 기준 통일**: `🔥 지난번` pill의 데이터 소스를 `getLastRecord(id)`에서 `getPreviousRecord(id, session.startedAt)`으로 교체
  - 오늘 세션: startedAt=지금이므로 기존과 동일 결과 (활성 세션 자신은 미완료라 원래 제외됨)
  - 백데이트 세션: 그 날짜 이전 기록과 비교 — 오늘 기록과 비교되는 시간 역행 방지
  - `getPRWeight`은 이미 `session.startedAt` 기준이라 변경 없음

### 4. 완료 흐름 — 변경 없음

기존처럼 `/summary/:id`로 이동. 요약의 증감·PR은 `startedAt` 기준이라 백데이트 세션도 정확.

## 에러/엣지 케이스

- 진행 중 세션 존재: 버튼 탭 시 alert 후 중단 (이중 세션 방지 — `startSession`의 기존 가드도 그대로)
- 미래 날짜: 버튼 미표시 (세션 목록/빈 문구는 기존대로)
- 오늘 날짜 선택 후 기록 추가: 일반 시작과 사실상 동일 (startedAt 정오) — 허용
- 백데이트 세션 완료 후 달력: 해당 날짜에 ✓ 표시 (workoutDays가 startedAt 기준이므로 자동)
- 같은 날짜에 세션이 이미 있어도 추가 등록 허용 (하루 2세션과 동일 취급)
- 새로고침으로 세션 복원 시에도 startedAt이 보존되므로 백데이트 상태 유지

## 테스트

- `sessions.test.ts`: `startSession(routine, past)` → startedAt 반영·엔트리 프리필이 past 이전 기록 기준, `buildEntry(id, n, before)` 프리필 기준
- `HomeScreen.test.tsx`: 과거 날짜 선택 시 버튼 표시·미래 날짜 숨김, 버튼 → 루틴 선택 → 세션 화면 이동(라우트 확인), 활성 세션 존재 시 alert
- `SessionScreen.test.tsx`: 백데이트 세션에서 상단에 시계 대신 날짜 표시, `지난번` pill이 세션 날짜 이전 기록 기준(그 이후 기록 무시)
- 기존 테스트 전체 무변화 통과 (오늘 세션 동작 불변)

## 범위 제외 (YAGNI)

- 기록 탭에서 기존 세션 날짜 수정
- 시각(시/분) 지정 — 정오 고정
- 백데이트 세션 표시 뱃지
