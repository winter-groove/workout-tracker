# 오늘의 루틴 선택 + 입력 UX 개선 설계

날짜: 2026-07-07

## 목적

1. 홈 화면의 "다른 루틴 선택" 흐름을 "오늘의 루틴을 정하는" 흐름으로 교체 — 오늘 할 루틴(가슴/등/어깨 등)을 명시적으로 고르고, 그날은 고정
2. 오늘의 루틴이 정해지면 세션 중 운동 추가 picker가 해당 부위로 미리 필터된 상태로 열림 (소프트 필터 — 언제든 다른 부위/전체로 전환 가능)
3. 세션 화면 무게 입력란의 "0이 안 지워져 040이 되는" 불편 해소

## 요구사항 (사용자 확정)

- 홈: **C안** — 오늘의 루틴을 한 번 정하면 그날은 고정, 시작 버튼만 남음. "다른 루틴 선택" 버튼 삭제
- picker 필터: **소프트 필터** — 부위 칩이 미리 선택된 채 열리되 전체/다른 부위로 전환 가능
- 대표 부위: **자동 추론** — 운동들의 최빈 부위, 동률이면 '전체'

## 구성 요소

### 1. `src/db/todayRoutine.ts` — 오늘의 루틴 저장 (신규)

기존 `settings.ts`의 localStorage 패턴을 따른다 (meta 테이블 아님 — 하루짜리 기기 로컬 상태라 백업 대상도 아님).

```ts
const KEY = 'wt-today-routine';
// 저장 형태: JSON.stringify({ id: string, date: string })  // date는 로컬 'YYYY-MM-DD'

getTodayRoutineId(now?: Date): string | undefined
  // 저장된 date가 오늘(로컬 기준)과 다르면 undefined (자동 리셋)
  // JSON 파싱 실패 시 undefined
setTodayRoutineId(id: string, now?: Date): void
clearTodayRoutine(): void
```

`now` 파라미터는 테스트용 주입 (기본 `new Date()`).

### 2. 홈 화면 — `HomeScreen.tsx` 수정

진행 중 세션 카드(이어서 하기/버리기)는 그대로. 그 외 startcard가 두 상태를 가진다:

**상태 A — 오늘의 루틴 미선택** (getTodayRoutineId가 undefined이거나, 해당 id의 루틴이 삭제된 경우):

- 제목 "오늘 뭐 할까요?"
- 루틴 버튼 목록 (탭하면 `setTodayRoutineId` 후 상태 B로 전환 — 즉시 세션 시작 아님)
- `pickNextRoutine` 결과 루틴 버튼에 `추천` 뱃지 표시 (기존 함수 재활용)
- 맨 아래 "빈 세션으로 시작" 버튼 (루틴 없이 바로 세션 시작 — 기존 begin() 동작)
- 루틴이 하나도 없으면 기존 "첫 운동을 시작해보세요" 카드 유지

**상태 B — 선택됨**:

- "오늘은 **{루틴명}**" + "{N}개 운동"
- "운동 시작하기" 버튼 → 기존 `begin(routine)` 그대로
- 작은 "다시 선택" 버튼 → `clearTodayRoutine()` 후 상태 A로

날짜가 바뀌면 `getTodayRoutineId`가 undefined를 반환하므로 자동으로 상태 A. 운동을 완료해도 그날은 선택 유지 (같은 날 2회차는 같은 루틴, 바꾸려면 "다시 선택").

기존 "다른 루틴 선택" 버튼과 `showRoutinePick` state는 삭제.

### 3. picker 부위 필터 — `ExercisePicker.tsx` + `SessionScreen.tsx` 수정

오늘의 루틴을 세션까지 전달하지 않는다. 대신 **세션에 이미 담긴 운동들의 최빈 부위**로 초기 필터를 정한다 (루틴 세션이면 자연히 그 부위, 빈 세션도 운동 추가 후엔 그 부위가 추천됨).

- `ExercisePicker`에 `initialFilter?: BodyPart | '전체'` prop 추가 — filter state의 초기값으로만 사용 (기본 '전체')
- `dominantBodyPart(exercises: Exercise[]): BodyPart | undefined` 순수 함수를 ExercisePicker 파일에서 export — 최빈 부위 반환, 동률이거나 빈 배열이면 undefined
- `SessionScreen`에서 picker를 열 때 세션 entries의 운동들(exMap으로 해석, 삭제된 운동은 제외)을 넘겨 계산: `dominantBodyPart(...) ?? '전체'`

### 4. 무게/횟수 입력 개선 — `SessionScreen.tsx` 수정

- 무게 입력: `value={s.weight === 0 ? '' : s.weight}` + `placeholder="0"` — 0일 때 빈칸이라 40 입력 시 그대로 40. onChange의 `Number(e.target.value) || 0`은 그대로 (빈칸 = 0)
- 무게·횟수 입력 모두 `onFocus={(e) => e.currentTarget.select()}` — 기존 값이 있어도 탭하면 전체 선택되어 한 번에 덮어쓰기 (040 문제 원천 차단)

## 에러/엣지 케이스

- 오늘의 루틴으로 저장된 루틴이 관리 탭에서 삭제됨 → 홈에서 해당 id를 못 찾으면 상태 A로 표시 (저장값은 다음 set/날짜 변경 시 자연 소멸, 명시적 clear 불필요)
- localStorage 값 손상(JSON 파싱 실패) → undefined 취급
- 자정 넘어 앱을 켠 경우 → date 불일치로 자동 리셋
- 세션 운동이 전부 삭제된 운동(exMap 미해석) → dominantBodyPart에 빈 배열 → '전체'

## 테스트

- `todayRoutine.test.ts`: 같은 날 set/get, 다른 날짜면 undefined, clear, 손상값 undefined
- `HomeScreen.test.tsx` (신규): 상태 A 루틴 목록+추천 뱃지 렌더, 루틴 탭 → 상태 B 전환, "다시 선택" → 상태 A, 삭제된 루틴 id면 상태 A
- `ExercisePicker.test.tsx`: `dominantBodyPart` 단위 테스트 (최빈/동률/빈 배열), `initialFilter`로 열리는지
- `SessionScreen.test.tsx`: 무게 0 → 빈 입력란, 값 입력 시 그대로 반영

## 범위 제외 (YAGNI)

- 루틴에 부위 필드 추가 (자동 추론으로 충분)
- picker 하드 필터
- 오늘의 루틴 백업 포함, 주간 루틴 스케줄링
- 횟수 입력의 빈칸 처리 (기본 10은 placeholder가 아니라 실제 값 — select-on-focus로 충분)
