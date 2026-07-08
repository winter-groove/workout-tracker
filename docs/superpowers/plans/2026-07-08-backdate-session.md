# 과거 날짜 운동 등록 (백데이트 세션) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 홈 달력에서 과거 날짜를 골라 그 날짜로 운동 세션을 등록할 수 있게 한다.

**Architecture:** `startSession`에 `startedAt` 파라미터를 추가해 선택 날짜 정오로 세션을 생성. 달력·기록·과부하 비교는 전부 `startedAt` 기준이라 자동으로 정합. 세션 화면은 백데이트 시 경과 시계 대신 날짜를 표시하고, `지난번` 비교·프리필 기준을 "세션 시작일 이전"으로 통일(오늘 세션은 동작 불변). DB 스키마 변경 없음.

**Tech Stack:** React 18 + TypeScript + Vite, Dexie(IndexedDB), vitest + @testing-library/react + fake-indexeddb

**스펙:** `docs/superpowers/specs/2026-07-08-backdate-session-design.md`

## Global Constraints

- DB 스키마(`src/db/db.ts`) 변경 금지 — 백업 JSON 포맷 유지
- 새 npm 의존성 추가 금지
- UI 문구는 한국어, 기존 이모지/문체 유지
- 백데이트 세션의 `startedAt`은 선택 날짜의 **정오(12:00)**
- 미래 날짜에는 "＋ 이 날짜에 기록 추가" 버튼 미표시, 진행 중 세션 존재 시 `alert('진행 중인 운동을 먼저 완료하세요')` 후 중단
- 오늘 세션의 기존 동작(프리필·pill·시계)은 변하지 않아야 함 — 기존 테스트 82개 전부 유지
- 테스트는 기존 패턴 준수: vitest globals, `beforeEach` db reset, `MemoryRouter`
- 테스트 실행: `npx vitest run <파일경로>` (전체는 `npm test`)

---

### Task 1: sessions.ts — startedAt/before 파라미터

**Files:**
- Modify: `src/db/sessions.ts`
- Test: `src/db/sessions.test.ts` (테스트 추가)

**Interfaces:**
- Consumes: 기존 `getPreviousRecord(exerciseId, before)` (`src/db/progress.ts` — progress는 db만 import하므로 순환 없음)
- Produces (Task 2·3이 사용):
  - `startSession(routine?: Routine, startedAt?: number): Promise<Session>` — 미지정 시 `Date.now()`. 루틴 프리필은 자신의 startedAt 이전 기록 기준
  - `buildEntry(exerciseId: string, defaultSets = 3, before?: number): Promise<SessionEntry>` — before 지정 시 그 이전 기록으로 프리필, 미지정 시 기존 `getLastRecord`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/db/sessions.test.ts` 파일 끝에 추가:

```ts
test('startSession은 startedAt 지정 시 그 시각으로 생성하고 프리필도 그 이전 기준이다', async () => {
  await addFinishedSession(1000, 'ex1', [{ weight: 50, reps: 10 }]);
  await addFinishedSession(5000, 'ex1', [{ weight: 70, reps: 10 }]); // 백데이트 시점 이후의 기록
  const routine: Routine = {
    id: 'r9', name: '가슴 날',
    items: [{ exerciseId: 'ex1', defaultSets: 3 }],
  };
  const s = await startSession(routine, 3000);
  expect(s.startedAt).toBe(3000);
  expect(s.entries[0].sets[0].weight).toBe(50); // 3000 이전의 50, 이후의 70 아님
});

test('buildEntry는 before 지정 시 그 이전 기록으로 프리필한다', async () => {
  await addFinishedSession(1000, 'ex1', [{ weight: 50, reps: 10 }]);
  await addFinishedSession(2000, 'ex1', [{ weight: 60, reps: 10 }]);
  const entry = await buildEntry('ex1', 3, 2000);
  expect(entry.sets[0].weight).toBe(50);
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/db/sessions.test.ts`
Expected: 새 2개 FAIL (startedAt 무시되어 `Date.now()`로 생성 / before 파라미터 없음), 기존 PASS

- [ ] **Step 3: 구현**

`src/db/sessions.ts` — import 추가:

```ts
import { getPreviousRecord } from './progress';
```

`buildEntry`를 다음으로 교체:

```ts
export async function buildEntry(
  exerciseId: string, defaultSets = 3, before?: number,
): Promise<SessionEntry> {
  const last = before === undefined
    ? await getLastRecord(exerciseId)
    : await getPreviousRecord(exerciseId, before);
  const sets: SetRecord[] = last
    ? last.map((s) => ({ weight: s.weight, reps: s.reps }))
    : Array.from({ length: defaultSets }, () => ({ weight: 0, reps: 10 }));
  return { exerciseId, sets };
}
```

`startSession`을 다음으로 교체:

```ts
export async function startSession(routine?: Routine, startedAt?: number): Promise<Session> {
  const existing = await getActiveSession();
  if (existing) return existing;
  const start = startedAt ?? Date.now();
  const entries: SessionEntry[] = [];
  if (routine) {
    for (const item of routine.items) {
      entries.push(await buildEntry(item.exerciseId, item.defaultSets, start));
    }
  }
  const session: Session = {
    id: crypto.randomUUID(),
    startedAt: start,
    routineName: routine?.name,
    entries,
  };
  await db.sessions.add(session);
  return session;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/db/sessions.test.ts`
Expected: PASS (기존 + 새 2개)

- [ ] **Step 5: 커밋**

```bash
git add src/db/sessions.ts src/db/sessions.test.ts
git commit -m "feat: startSession 백데이트 지원 — startedAt 지정과 그 이전 기준 프리필"
```

---

### Task 2: HomeScreen — "＋ 이 날짜에 기록 추가"

**Files:**
- Modify: `src/screens/HomeScreen.tsx`
- Test: `src/screens/HomeScreen.test.tsx` (테스트 추가)

**Interfaces:**
- Consumes: Task 1의 `startSession(routine?, startedAt?)`, 기존 `active`(useLiveQuery getActiveSession)·`routines`·`selectedDate`
- Produces: 없음 (말단 UI)

- [ ] **Step 1: 실패하는 테스트 작성**

`src/screens/HomeScreen.test.tsx` — import에 `startSession`, `getActiveSession` 추가:

```tsx
import { startSession, getActiveSession } from '../db/sessions';
```

`beforeEach` 아래에 추가:

```tsx
afterEach(() => {
  vi.restoreAllMocks();
});
```

파일 끝에 테스트 3개 추가:

```tsx
test('과거 날짜에 기록 추가 버튼으로 백데이트 세션을 시작한다', async () => {
  await saveRoutine({ id: 'r1', name: '가슴운동', items: [] });
  render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/session" element={<div>세션화면</div>} />
        <Route path="/summary/:sessionId" element={<div>요약화면</div>} />
      </Routes>
    </MemoryRouter>,
  );
  const now = new Date();
  fireEvent.click(await screen.findByRole('button', { name: `${now.getMonth() + 1}월 1일` }));
  fireEvent.click(await screen.findByRole('button', { name: '＋ 이 날짜에 기록 추가' }));
  fireEvent.click(screen.getByRole('button', { name: '가슴운동' }));
  expect(await screen.findByText('세션화면')).toBeInTheDocument();
  const s = await getActiveSession();
  const d = new Date(s!.startedAt);
  expect(d.getDate()).toBe(1);
  expect(d.getHours()).toBe(12);
});

test('미래 날짜에는 기록 추가 버튼이 없다', async () => {
  renderWithSummary();
  const now = new Date();
  fireEvent.click(await screen.findByLabelText('다음 달'));
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  fireEvent.click(await screen.findByRole('button', { name: `${next.getMonth() + 1}월 15일` }));
  expect(await screen.findByText('이 날은 운동 기록이 없어요')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '＋ 이 날짜에 기록 추가' })).not.toBeInTheDocument();
});

test('진행 중 세션이 있으면 기록 추가가 차단된다', async () => {
  vi.spyOn(window, 'alert').mockImplementation(() => {});
  await startSession();
  renderWithSummary();
  const now = new Date();
  fireEvent.click(await screen.findByRole('button', { name: `${now.getMonth() + 1}월 1일` }));
  fireEvent.click(await screen.findByRole('button', { name: '＋ 이 날짜에 기록 추가' }));
  fireEvent.click(screen.getByRole('button', { name: '빈 세션' }));
  expect(window.alert).toHaveBeenCalledWith('진행 중인 운동을 먼저 완료하세요');
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/screens/HomeScreen.test.tsx`
Expected: 새 3개 FAIL ('＋ 이 날짜에 기록 추가' 버튼 없음), 기존 9개 PASS

- [ ] **Step 3: 구현**

`src/screens/HomeScreen.tsx` 수정:

state 추가 (`selectedDate` 선언 아래):

```tsx
const [showBackdatePick, setShowBackdatePick] = useState(false);
```

백데이트 판정·시작 함수 추가 (`begin` 함수 아래):

```tsx
const canBackdate = selectedDate !== null && selectedDate.getTime() <= today.getTime();

async function beginBackdate(routine?: Routine) {
  if (!selectedDate) return;
  if (active) {
    window.alert('진행 중인 운동을 먼저 완료하세요');
    return;
  }
  const noon = new Date(
    selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 12,
  ).getTime();
  await startSession(routine, noon);
  navigate('/session');
}
```

달력의 `onSelectDate`를 날짜 변경 시 선택지 접힘까지 처리하도록 교체:

```tsx
<MonthCalendar
  workoutDays={workoutDays}
  selectedDate={selectedDate}
  onSelectDate={(d) => { setSelectedDate(d); setShowBackdatePick(false); }}
/>
```

달력 카드의 `{daySessions.length === 0 && ...}` 줄 바로 아래(같은 `{selectedDate && (...)}` 블록 안)에 추가:

```tsx
{canBackdate && (
  <>
    <button
      className="btn btn-ghost" style={{ marginTop: 10 }}
      onClick={() => setShowBackdatePick(!showBackdatePick)}
    >
      ＋ 이 날짜에 기록 추가
    </button>
    {showBackdatePick && (
      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {routines.map((r) => (
          <button key={r.id} className="btn btn-ghost" onClick={() => void beginBackdate(r)}>
            {r.name}
          </button>
        ))}
        <button className="btn btn-ghost" onClick={() => void beginBackdate()}>빈 세션</button>
      </div>
    )}
  </>
)}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/screens/HomeScreen.test.tsx src/App.test.tsx`
Expected: HomeScreen 12개 + App 1개 PASS

- [ ] **Step 5: 커밋**

```bash
git add src/screens/HomeScreen.tsx src/screens/HomeScreen.test.tsx
git commit -m "feat: 홈 달력에서 과거 날짜 운동 등록 — 이 날짜에 기록 추가"
```

---

### Task 3: SessionScreen — 백데이트 정합성 (시계·비교 기준)

**Files:**
- Modify: `src/screens/SessionScreen.tsx`
- Test: `src/screens/SessionScreen.test.tsx` (테스트 추가)

**Interfaces:**
- Consumes: Task 1의 `buildEntry(id, defaultSets, before)`, 기존 `getPreviousRecord`/`getPRWeight`(`src/db/progress.ts`)
- Produces: 없음 (말단 UI)

- [ ] **Step 1: 실패하는 테스트 작성**

`src/screens/SessionScreen.test.tsx` — 파일 끝에 헬퍼와 테스트 추가:

```tsx
async function addFinishedSession(
  startedAt: number, exerciseId: string, sets: { weight: number; reps: number }[],
) {
  await db.sessions.add({
    id: crypto.randomUUID(),
    startedAt,
    finishedAt: startedAt + 3600_000,
    entries: [{ exerciseId, sets: sets.map((x) => ({ ...x, completedAt: startedAt + 1 })) }],
  });
}

test('백데이트 세션은 경과 시계 대신 날짜를 표시한다', async () => {
  const past = new Date();
  past.setDate(past.getDate() - 1);
  const noon = new Date(past.getFullYear(), past.getMonth(), past.getDate(), 12).getTime();
  await startSession(routine, noon);
  renderScreen();
  await screen.findByText('벤치프레스');
  expect(screen.getByText(`${past.getMonth() + 1}/${past.getDate()}`)).toBeInTheDocument();
});

test('백데이트 세션의 지난 기록은 세션 날짜 이전 기준이다', async () => {
  const now = Date.now();
  await addFinishedSession(now - 3 * 86_400_000, 'lib-bench-press', [{ weight: 50, reps: 10 }]);
  await addFinishedSession(now - 3_600_000, 'lib-bench-press', [{ weight: 70, reps: 10 }]); // 최근 기록
  await startSession(routine, now - 2 * 86_400_000); // 그 사이 날짜로 백데이트
  renderScreen();
  expect(await screen.findByText(/지난번 50kg×10/)).toBeInTheDocument(); // 70이 아닌 50 기준
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/screens/SessionScreen.test.tsx`
Expected: 새 2개 FAIL (시계가 경과 시간 표시 / 지난번이 70kg 기준), 기존 10개 PASS

- [ ] **Step 3: 구현**

`src/screens/SessionScreen.tsx` 수정:

import 교체 — `getLastRecord`를 sessions import에서 제거하고 progress import에 `getPreviousRecord` 추가:

```tsx
import {
  getActiveSession, saveSession, finishSession, discardSession, buildEntry,
} from '../db/sessions';
import {
  volume, maxWeight, fmtVolumeDelta, getPRWeight, getPreviousRecord,
} from '../db/progress';
```

지난 기록 로드 effect의 `getLastRecord(entry.exerciseId)`를 다음으로 교체:

```tsx
getPreviousRecord(entry.exerciseId, session.startedAt),
```

`addExercise`의 `buildEntry(ex.id)`를 다음으로 교체 (세션 중 추가한 운동도 세션 날짜 기준 프리필):

```tsx
const newEntry = await buildEntry(ex.id, 3, session.startedAt);
```

렌더 직전 계산부(`const ex = ...` 근처)에 추가:

```tsx
const startDate = new Date(session.startedAt);
const isBackdated = startDate.toDateString() !== new Date(now).toDateString();
```

상단 시계 span을 다음으로 교체:

```tsx
<span className="clock">
  {isBackdated ? `${startDate.getMonth() + 1}/${startDate.getDate()}` : fmtElapsed(session.startedAt, now)}
</span>
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/screens/SessionScreen.test.tsx`
Expected: PASS (12 tests — 기존 10 + 새 2)

- [ ] **Step 5: 커밋**

```bash
git add src/screens/SessionScreen.tsx src/screens/SessionScreen.test.tsx
git commit -m "feat: 백데이트 세션 정합성 — 날짜 표시, 세션 시작일 이전 기준 비교·프리필"
```

---

### Task 4: 전체 검증

**Files:** 없음 (검증만)

- [ ] **Step 1: 전체 테스트**

Run: `npm test`
Expected: 전체 PASS (기존 82 + 신규 7 = 89개)

- [ ] **Step 2: 프로덕션 빌드**

Run: `npm run build`
Expected: 에러 없이 dist/ 생성

- [ ] **Step 3: 실패 시 수정 후 커밋**

수정이 있었다면:

```bash
git add -A src
git commit -m "fix: 백데이트 세션 통합 검증 수정"
```
