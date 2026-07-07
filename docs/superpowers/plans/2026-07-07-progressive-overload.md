# 점진적 과부하 확인 기능 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 운동 기록을 직전 기록과 비교해 볼륨/최고무게 증감과 PR 여부를 세션 중·완료 후·기록 탭에서 보여준다.

**Architecture:** DB 스키마 변경 없이 기존 `Session > entries > sets{weight, reps, completedAt}` 데이터에서 순수 계산. 신규 모듈 `src/db/progress.ts`에 계산·조회 함수를 모으고, 세 화면(SessionScreen, 신규 SummaryScreen, HistoryScreen)이 이를 소비한다.

**Tech Stack:** React 18 + TypeScript + Vite, Dexie(IndexedDB), react-router-dom(HashRouter), vitest + @testing-library/react + fake-indexeddb

**스펙:** `docs/superpowers/specs/2026-07-07-progressive-overload-design.md`

## Global Constraints

- DB 스키마(`src/db/db.ts`) 변경 금지 — 백업 JSON 포맷 유지
- 새 npm 의존성 추가 금지
- UI 문구는 한국어, 기존 화면들의 이모지/문체를 따름
- 판정 규칙: 화살표는 원시 값 비교(🔺/🔻/➖), 볼륨 증감은 `Math.round` 퍼센트, 최고무게 증감은 kg 절대값, 이전 볼륨 0이면 퍼센트 생략, PR은 무게 기준 "초과"만, 직전 기록 없으면 "첫 기록"·PR 뱃지 없음
- 테스트는 기존 패턴 준수: vitest globals(`test`/`expect`/`vi` 전역), `beforeEach`에서 `db.delete()` + `db.open()`, 컴포넌트는 `MemoryRouter`로 감싸기
- 테스트 실행: `npx vitest run <파일경로>` (전체는 `npm test`)

---

### Task 1: progress.ts 순수 계산 함수

**Files:**
- Create: `src/db/progress.ts`
- Test: `src/db/progress.test.ts`

**Interfaces:**
- Consumes: `SetRecord` 타입 (`src/types.ts` — `{ weight: number; reps: number; completedAt?: number }`)
- Produces (이후 모든 태스크가 사용):
  - `volume(sets: SetRecord[]): number`
  - `maxWeight(sets: SetRecord[]): number`
  - `fmtVolumeDelta(cur: number, prev: number): string` — 예: `'🔺 +6%'`, `'🔻 -7%'`, `'➖'`, prev 0이면 `'🔺'`
  - `fmtWeightDelta(cur: number, prev: number): string` — 예: `'🔺 +2.5kg'`, `'➖'`
  - `interface EntryProgress { volume: number; maxWeight: number; prevVolume?: number; prevMaxWeight?: number; isPR: boolean }`
  - `annotateHistory(records: SetRecord[][]): EntryProgress[]` — 최신순 입력

- [ ] **Step 1: 실패하는 테스트 작성**

`src/db/progress.test.ts` 생성:

```ts
import {
  volume, maxWeight, fmtVolumeDelta, fmtWeightDelta, annotateHistory,
} from './progress';

test('volume은 무게×횟수의 합', () => {
  expect(volume([{ weight: 60, reps: 10 }, { weight: 60, reps: 8 }])).toBe(1080);
  expect(volume([])).toBe(0);
});

test('maxWeight는 최고 무게, 빈 배열이면 0', () => {
  expect(maxWeight([{ weight: 60, reps: 10 }, { weight: 65, reps: 5 }])).toBe(65);
  expect(maxWeight([])).toBe(0);
});

test('fmtVolumeDelta: 증가/감소/동일/이전 0', () => {
  expect(fmtVolumeDelta(1150, 1080)).toBe('🔺 +6%');   // +6.48% → 반올림 6
  expect(fmtVolumeDelta(1000, 1080)).toBe('🔻 -7%');   // -7.4% → 반올림 -7
  expect(fmtVolumeDelta(1080, 1080)).toBe('➖');
  expect(fmtVolumeDelta(100, 0)).toBe('🔺');            // 0 나눗셈 방지
});

test('fmtWeightDelta: kg 절대값', () => {
  expect(fmtWeightDelta(62.5, 60)).toBe('🔺 +2.5kg');
  expect(fmtWeightDelta(57.5, 60)).toBe('🔻 -2.5kg');
  expect(fmtWeightDelta(60, 60)).toBe('➖');
});

test('annotateHistory: 최신순 기록에 증감과 PR을 계산한다', () => {
  const recs = [
    [{ weight: 60, reps: 10 }], // 최신: vol 600, max 60 — 과거에 65가 있으므로 PR 아님
    [{ weight: 65, reps: 8 }],  // vol 520, max 65 — 그 시점 최고 50 초과 → PR
    [{ weight: 50, reps: 10 }], // 가장 오래됨: 첫 기록
  ];
  const a = annotateHistory(recs);
  expect(a[0]).toEqual({ volume: 600, maxWeight: 60, prevVolume: 520, prevMaxWeight: 65, isPR: false });
  expect(a[1]).toEqual({ volume: 520, maxWeight: 65, prevVolume: 500, prevMaxWeight: 50, isPR: true });
  expect(a[2]).toEqual({ volume: 500, maxWeight: 50, prevVolume: undefined, prevMaxWeight: undefined, isPR: false });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/db/progress.test.ts`
Expected: FAIL — `Failed to resolve import "./progress"` (모듈 없음)

- [ ] **Step 3: 최소 구현 작성**

`src/db/progress.ts` 생성:

```ts
import type { SetRecord } from '../types';

export interface EntryProgress {
  volume: number;
  maxWeight: number;
  prevVolume?: number;      // undefined면 "첫 기록"
  prevMaxWeight?: number;
  isPR: boolean;            // 그 시점까지의 최고 무게를 초과했는가
}

export function volume(sets: SetRecord[]): number {
  return sets.reduce((sum, s) => sum + s.weight * s.reps, 0);
}

export function maxWeight(sets: SetRecord[]): number {
  return sets.reduce((max, s) => Math.max(max, s.weight), 0);
}

function arrow(cur: number, prev: number): string {
  if (cur > prev) return '🔺';
  if (cur < prev) return '🔻';
  return '➖';
}

export function fmtVolumeDelta(cur: number, prev: number): string {
  if (cur === prev) return '➖';
  if (prev === 0) return arrow(cur, prev);
  const pct = Math.round(((cur - prev) / prev) * 100);
  return `${arrow(cur, prev)} ${pct > 0 ? '+' : ''}${pct}%`;
}

export function fmtWeightDelta(cur: number, prev: number): string {
  if (cur === prev) return '➖';
  const d = cur - prev;
  return `${arrow(cur, prev)} ${d > 0 ? '+' : ''}${d}kg`;
}

// records는 최신순 (getExerciseHistory의 반환 순서와 동일)
export function annotateHistory(records: SetRecord[][]): EntryProgress[] {
  const n = records.length;
  const vols = records.map(volume);
  const maxes = records.map(maxWeight);
  // prBefore[i] = i보다 오래된 기록들의 최고 무게
  const prBefore = new Array<number>(n).fill(0);
  for (let i = n - 2; i >= 0; i--) prBefore[i] = Math.max(prBefore[i + 1], maxes[i + 1]);
  return records.map((_, i) => ({
    volume: vols[i],
    maxWeight: maxes[i],
    prevVolume: i < n - 1 ? vols[i + 1] : undefined,
    prevMaxWeight: i < n - 1 ? maxes[i + 1] : undefined,
    isPR: i < n - 1 && maxes[i] > prBefore[i],
  }));
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/db/progress.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/db/progress.ts src/db/progress.test.ts
git commit -m "feat: 과부하 판정 순수 함수 — 볼륨/최고무게/증감 포맷/기록 주석"
```

---

### Task 2: progress.ts 조회 함수 (직전 기록·PR·종합 판정)

**Files:**
- Modify: `src/db/progress.ts` (Task 1에서 생성)
- Test: `src/db/progress.test.ts` (추가)

**Interfaces:**
- Consumes: `db`(`src/db/db.ts`), Task 1의 `volume`/`maxWeight`/`EntryProgress`
- Produces:
  - `getPreviousRecord(exerciseId: string, before: number): Promise<SetRecord[] | undefined>` — `startedAt < before`인 완료 세션 중 가장 최근의 해당 운동 완료 세트
  - `getPRWeight(exerciseId: string, before: number): Promise<number>` — `startedAt < before`인 완료 세션들의 최고 무게, 없으면 0
  - `summarizeEntry(exerciseId: string, sets: SetRecord[], sessionStartedAt: number): Promise<EntryProgress>`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/db/progress.test.ts` 상단 import를 확장하고 테스트 추가:

```ts
import { db } from './db';
import {
  volume, maxWeight, fmtVolumeDelta, fmtWeightDelta, annotateHistory,
  getPreviousRecord, getPRWeight, summarizeEntry,
} from './progress';
import type { Session } from '../types';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

async function addFinishedSession(
  startedAt: number, exerciseId: string, sets: { weight: number; reps: number }[],
): Promise<Session> {
  const s: Session = {
    id: crypto.randomUUID(),
    startedAt,
    finishedAt: startedAt + 3600_000,
    entries: [{ exerciseId, sets: sets.map((x) => ({ ...x, completedAt: startedAt + 1 })) }],
  };
  await db.sessions.add(s);
  return s;
}
```

(기존 Task 1 테스트는 그대로 두고 아래를 추가)

```ts
test('getPreviousRecord는 before 이전의 가장 최근 완료 기록을 반환한다', async () => {
  await addFinishedSession(1000, 'ex1', [{ weight: 50, reps: 10 }]);
  await addFinishedSession(2000, 'ex1', [{ weight: 60, reps: 10 }]);
  const prev = await getPreviousRecord('ex1', 2000);
  expect(prev?.[0].weight).toBe(50);
  expect(await getPreviousRecord('ex1', 1000)).toBeUndefined();
});

test('getPreviousRecord는 진행 중 세션을 무시한다', async () => {
  await db.sessions.add({
    id: 'active', startedAt: 500,
    entries: [{ exerciseId: 'ex1', sets: [{ weight: 100, reps: 5, completedAt: 501 }] }],
  });
  expect(await getPreviousRecord('ex1', 2000)).toBeUndefined();
});

test('getPRWeight는 before 이전의 최고 무게를 반환한다', async () => {
  await addFinishedSession(1000, 'ex1', [{ weight: 70, reps: 3 }]);
  await addFinishedSession(2000, 'ex1', [{ weight: 60, reps: 10 }]);
  expect(await getPRWeight('ex1', 3000)).toBe(70);
  expect(await getPRWeight('ex1', 1000)).toBe(0);
});

test('summarizeEntry: 직전 대비 증감 + PR 판정', async () => {
  await addFinishedSession(1000, 'ex1', [{ weight: 70, reps: 3 }]);   // 과거 PR 70
  await addFinishedSession(2000, 'ex1', [{ weight: 60, reps: 10 }]);  // 직전: vol 600, max 60
  const p = await summarizeEntry('ex1', [{ weight: 72.5, reps: 3, completedAt: 1 }], 3000);
  expect(p).toEqual({
    volume: 217.5, maxWeight: 72.5, prevVolume: 600, prevMaxWeight: 60, isPR: true,
  });
});

test('summarizeEntry: 첫 기록이면 비교값 없음 + PR 아님', async () => {
  const p = await summarizeEntry('ex1', [{ weight: 50, reps: 10, completedAt: 1 }], 1000);
  expect(p).toEqual({
    volume: 500, maxWeight: 50, prevVolume: undefined, prevMaxWeight: undefined, isPR: false,
  });
});

test('summarizeEntry: 동일 무게는 PR이 아니다', async () => {
  await addFinishedSession(1000, 'ex1', [{ weight: 60, reps: 10 }]);
  const p = await summarizeEntry('ex1', [{ weight: 60, reps: 10, completedAt: 1 }], 2000);
  expect(p.isPR).toBe(false);
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/db/progress.test.ts`
Expected: FAIL — `getPreviousRecord is not a function` (export 없음)

- [ ] **Step 3: 구현 추가**

`src/db/progress.ts` 상단에 import 추가:

```ts
import { db } from './db';
```

파일 끝에 추가:

```ts
export async function getPreviousRecord(
  exerciseId: string, before: number,
): Promise<SetRecord[] | undefined> {
  const sessions = await db.sessions.orderBy('startedAt').reverse().toArray();
  for (const s of sessions) {
    if (s.finishedAt === undefined || s.startedAt >= before) continue;
    const entry = s.entries.find((e) => e.exerciseId === exerciseId);
    const done = entry?.sets.filter((x) => x.completedAt !== undefined);
    if (done && done.length > 0) return done;
  }
  return undefined;
}

export async function getPRWeight(exerciseId: string, before: number): Promise<number> {
  const sessions = await db.sessions.orderBy('startedAt').toArray();
  let pr = 0;
  for (const s of sessions) {
    if (s.finishedAt === undefined || s.startedAt >= before) continue;
    const entry = s.entries.find((e) => e.exerciseId === exerciseId);
    if (!entry) continue;
    pr = Math.max(pr, maxWeight(entry.sets.filter((x) => x.completedAt !== undefined)));
  }
  return pr;
}

export async function summarizeEntry(
  exerciseId: string, sets: SetRecord[], sessionStartedAt: number,
): Promise<EntryProgress> {
  const prev = await getPreviousRecord(exerciseId, sessionStartedAt);
  const pr = await getPRWeight(exerciseId, sessionStartedAt);
  const cur = { volume: volume(sets), maxWeight: maxWeight(sets) };
  return {
    ...cur,
    prevVolume: prev ? volume(prev) : undefined,
    prevMaxWeight: prev ? maxWeight(prev) : undefined,
    isPR: prev !== undefined && cur.maxWeight > pr,
  };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/db/progress.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/db/progress.ts src/db/progress.test.ts
git commit -m "feat: 직전 기록·PR 조회와 종합 과부하 판정 함수"
```

---

### Task 3: 완료 요약 화면 (SummaryScreen + 라우트)

**Files:**
- Create: `src/screens/SummaryScreen.tsx`
- Modify: `src/App.tsx` (라우트 추가)
- Test: `src/screens/SummaryScreen.test.tsx`

**Interfaces:**
- Consumes: Task 2의 `summarizeEntry`, Task 1의 `fmtVolumeDelta`/`fmtWeightDelta`/`EntryProgress`, `db.sessions.get(id)`, `listExercises`(`src/db/exercises.ts`)
- Produces: 라우트 `/summary/:sessionId` — Task 4(세션 완료 시 이동)와 Task 5(기록 탭 요약 보기)가 이 경로로 navigate

- [ ] **Step 1: 실패하는 테스트 작성**

`src/screens/SummaryScreen.test.tsx` 생성:

```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { db } from '../db/db';
import { seedLibrary } from '../db/exercises';
import type { Session } from '../types';
import SummaryScreen from './SummaryScreen';

beforeEach(async () => {
  await db.delete();
  await db.open();
  await seedLibrary();
});

async function addFinishedSession(
  startedAt: number, exerciseId: string, sets: { weight: number; reps: number }[],
): Promise<Session> {
  const s: Session = {
    id: crypto.randomUUID(),
    startedAt,
    finishedAt: startedAt + 3600_000,
    entries: [{ exerciseId, sets: sets.map((x) => ({ ...x, completedAt: startedAt + 1 })) }],
  };
  await db.sessions.add(s);
  return s;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<div>홈화면</div>} />
        <Route path="/summary/:sessionId" element={<SummaryScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

test('운동별 증감과 PR 뱃지를 보여준다', async () => {
  await addFinishedSession(1000, 'lib-bench-press', [{ weight: 50, reps: 10 }]);
  const cur = await addFinishedSession(2000, 'lib-bench-press', [{ weight: 60, reps: 10 }]);
  renderAt(`/summary/${cur.id}`);
  expect(await screen.findByText('벤치프레스')).toBeInTheDocument();
  expect(screen.getByText('볼륨 600kg 🔺 +20% · 최고 60kg 🔺 +10kg')).toBeInTheDocument();
  expect(screen.getByText('🏆 PR')).toBeInTheDocument();
});

test('첫 기록이면 비교 없이 표시하고 PR 뱃지가 없다', async () => {
  const cur = await addFinishedSession(1000, 'lib-squat', [{ weight: 80, reps: 5 }]);
  renderAt(`/summary/${cur.id}`);
  expect(await screen.findByText('볼륨 400kg · 최고 80kg · 첫 기록')).toBeInTheDocument();
  expect(screen.queryByText('🏆 PR')).not.toBeInTheDocument();
});

test('세션이 없으면 홈으로 리다이렉트한다', async () => {
  renderAt('/summary/no-such-id');
  expect(await screen.findByText('홈화면')).toBeInTheDocument();
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/screens/SummaryScreen.test.tsx`
Expected: FAIL — `Failed to resolve import "./SummaryScreen"`

- [ ] **Step 3: SummaryScreen 구현**

`src/screens/SummaryScreen.tsx` 생성:

```tsx
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Session } from '../types';
import { db } from '../db/db';
import { listExercises } from '../db/exercises';
import { summarizeEntry, fmtVolumeDelta, fmtWeightDelta, type EntryProgress } from '../db/progress';

function fmtDate(ts: number): string {
  const d = new Date(ts);
  const day = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  return `${d.getMonth() + 1}/${d.getDate()} (${day})`;
}

export default function SummaryScreen() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [progress, setProgress] = useState<EntryProgress[]>([]);
  const exercises = useLiveQuery(() => listExercises({ includeHidden: true }), []) ?? [];
  const exMap = new Map(exercises.map((e) => [e.id, e]));

  useEffect(() => {
    if (!sessionId) {
      navigate('/', { replace: true });
      return;
    }
    db.sessions.get(sessionId).then(async (s) => {
      if (!s || s.finishedAt === undefined) {
        navigate('/', { replace: true });
        return;
      }
      const list = await Promise.all(
        s.entries.map((e) => summarizeEntry(e.exerciseId, e.sets, s.startedAt)),
      );
      setSession(s);
      setProgress(list);
    });
  }, [sessionId, navigate]);

  if (!session) return null;

  return (
    <div className="screen">
      <h1 className="screen-title">운동 완료 🎉</h1>
      <div className="card">
        <div className="card-h">{session.routineName ?? '오늘 운동'} · {fmtDate(session.startedAt)}</div>
        {session.entries.map((e, i) => {
          const p = progress[i];
          if (!p) return null;
          const line = p.prevVolume === undefined
            ? `볼륨 ${p.volume}kg · 최고 ${p.maxWeight}kg · 첫 기록`
            : `볼륨 ${p.volume}kg ${fmtVolumeDelta(p.volume, p.prevVolume)} · 최고 ${p.maxWeight}kg ${fmtWeightDelta(p.maxWeight, p.prevMaxWeight ?? 0)}`;
          return (
            <div key={i} className="hist-row" style={{ display: 'block' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{exMap.get(e.exerciseId)?.name ?? '삭제된 운동'}</span>
                {p.isPR && <span>🏆 PR</span>}
              </div>
              <div className="d" style={{ fontSize: 12.5, marginTop: 2 }}>{line}</div>
            </div>
          );
        })}
      </div>
      <button className="btn btn-primary" onClick={() => navigate('/')}>확인</button>
    </div>
  );
}
```

`src/App.tsx` 수정 — import와 라우트 추가:

```tsx
import SummaryScreen from './screens/SummaryScreen';
```

`<Routes>` 안에 추가 (기존 라우트 유지):

```tsx
<Route path="/summary/:sessionId" element={<SummaryScreen />} />
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/screens/SummaryScreen.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/screens/SummaryScreen.tsx src/screens/SummaryScreen.test.tsx src/App.tsx
git commit -m "feat: 완료 요약 화면 — 운동별 과부하 판정과 PR 뱃지"
```

---

### Task 4: 세션 화면 실시간 과부하 표시 + 완료 시 요약으로 이동

**Files:**
- Modify: `src/screens/SessionScreen.tsx`
- Test: `src/screens/SessionScreen.test.tsx` (테스트 추가)

**Interfaces:**
- Consumes: Task 1의 `volume`/`maxWeight`/`fmtVolumeDelta`, Task 2의 `getPRWeight`, Task 3의 `/summary/:sessionId` 라우트
- Produces: 없음 (말단 UI)

- [ ] **Step 1: 실패하는 테스트 작성**

`src/screens/SessionScreen.test.tsx`에 추가. 상단 import에 `Routes`, `Route` 추가:

```tsx
import { MemoryRouter, Routes, Route } from 'react-router-dom';
```

파일 끝에 테스트 3개 추가:

```tsx
test('실시간 볼륨 비교가 표시되고 지난 기록을 넘으면 증가로 바뀐다', async () => {
  const prev = await startSession(routine);
  prev.entries[0].sets = [{ weight: 60, reps: 10, completedAt: Date.now() }];
  const { finishSession } = await import('../db/sessions');
  await finishSession(prev);

  await startSession(routine);
  renderScreen();
  expect(await screen.findByText(/볼륨 0 \/ 지난 600kg/)).toBeInTheDocument();

  // buildEntry가 60×10을 미리 채워줌 → 횟수를 11로 올리고 완료 → 660 > 600
  fireEvent.change(screen.getByLabelText('세트 1 횟수'), { target: { value: '11' } });
  fireEvent.click(screen.getByLabelText('세트 1 완료'));
  expect(await screen.findByText(/볼륨 660kg 🔺 \+10%/)).toBeInTheDocument();
});

test('이전 PR을 넘는 세트를 완료하면 PR 뱃지가 뜬다', async () => {
  const prev = await startSession(routine);
  prev.entries[0].sets = [{ weight: 60, reps: 10, completedAt: Date.now() }];
  const { finishSession } = await import('../db/sessions');
  await finishSession(prev);

  await startSession(routine);
  renderScreen();
  await screen.findByText(/지난번 60kg×10/);
  fireEvent.change(screen.getByLabelText('세트 1 무게'), { target: { value: '65' } });
  fireEvent.click(screen.getByLabelText('세트 1 완료'));
  expect(await screen.findByText(/🏆 PR!/)).toBeInTheDocument();
});

test('운동 완료 시 요약 화면으로 이동한다', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  const single: Routine = {
    id: 'r2', name: '한 운동',
    items: [{ exerciseId: 'lib-bench-press', defaultSets: 1 }],
  };
  await startSession(single);
  render(
    <MemoryRouter initialEntries={['/session']}>
      <Routes>
        <Route path="/session" element={<SessionScreen />} />
        <Route path="/summary/:sessionId" element={<div>요약화면</div>} />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByText('벤치프레스');
  fireEvent.click(screen.getByLabelText('세트 1 완료'));
  fireEvent.click(screen.getByRole('button', { name: '운동 완료' }));
  expect(await screen.findByText('요약화면')).toBeInTheDocument();
  vi.restoreAllMocks();
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/screens/SessionScreen.test.tsx`
Expected: 기존 6개 PASS, 새 3개 FAIL (볼륨 표시 없음 / 완료 시 `/`로 이동)

- [ ] **Step 3: SessionScreen 수정**

import 추가:

```tsx
import { volume, maxWeight, fmtVolumeDelta, getPRWeight } from '../db/progress';
```

state 추가 (`lastRecord` 선언 아래):

```tsx
const [prWeight, setPrWeight] = useState(0);
```

기존 `getLastRecord` effect를 다음으로 교체 (PR 무게를 함께 로드, 둘을 같이 세팅해 순간적인 오판 방지):

```tsx
useEffect(() => {
  if (!entry || !session) { setLastRecord(undefined); return; }
  void Promise.all([
    getLastRecord(entry.exerciseId),
    getPRWeight(entry.exerciseId, session.startedAt),
  ]).then(([last, pr]) => {
    setLastRecord(last);
    setPrWeight(pr);
  });
}, [entry?.exerciseId, session?.startedAt]);
```

`finish()`의 완료 분기를 수정 — 기존:

```tsx
await finishSession(session);
navigate('/', { replace: true });
```

를 다음으로:

```tsx
await finishSession(session);
navigate(`/summary/${session.id}`, { replace: true });
```

(주의: `doneCount === 0`으로 세션을 버리는 분기의 `navigate('/', ...)`는 그대로 둠)

`const ex = ...` 줄 근처(렌더 직전)에 계산 추가:

```tsx
const doneSets = entry?.sets.filter((s) => s.completedAt !== undefined) ?? [];
const curVol = volume(doneSets);
const lastVol = lastRecord ? volume(lastRecord) : 0;
const isPRNow = lastRecord !== undefined && maxWeight(doneSets) > prWeight;
const overloadText = curVol > lastVol
  ? `볼륨 ${curVol}kg ${fmtVolumeDelta(curVol, lastVol)}`
  : `볼륨 ${curVol} / 지난 ${lastVol}kg`;
```

JSX에서 기존 `🔥 지난번` pill 바로 아래에 추가:

```tsx
{lastRecord && <div className="last-pill" style={{ marginTop: 10 }}>🔥 지난번 {fmtLast(lastRecord)}</div>}
{lastRecord && (
  <div className="last-pill" style={{ marginTop: 6, marginLeft: 6 }}>
    📈 {overloadText}{isPRNow ? ' · 🏆 PR!' : ''}
  </div>
)}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/screens/SessionScreen.test.tsx`
Expected: PASS (9 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/screens/SessionScreen.tsx src/screens/SessionScreen.test.tsx
git commit -m "feat: 세션 중 실시간 볼륨 비교·PR 뱃지, 완료 시 요약 화면으로 이동"
```

---

### Task 5: 기록 탭 — 운동별 증감·PR 표시 + 요약 보기

**Files:**
- Modify: `src/screens/HistoryScreen.tsx`
- Test: `src/screens/HistoryScreen.test.tsx` (신규)

**Interfaces:**
- Consumes: Task 1의 `annotateHistory`/`fmtVolumeDelta`/`fmtWeightDelta`, Task 3의 `/summary/:sessionId` 라우트
- Produces: 없음 (말단 UI)

- [ ] **Step 1: 실패하는 테스트 작성**

`src/screens/HistoryScreen.test.tsx` 생성:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { db } from '../db/db';
import { seedLibrary } from '../db/exercises';
import type { Session } from '../types';
import HistoryScreen from './HistoryScreen';

beforeEach(async () => {
  await db.delete();
  await db.open();
  await seedLibrary();
});

async function addFinishedSession(
  startedAt: number, exerciseId: string, sets: { weight: number; reps: number }[],
): Promise<Session> {
  const s: Session = {
    id: crypto.randomUUID(),
    startedAt,
    finishedAt: startedAt + 3600_000,
    entries: [{ exerciseId, sets: sets.map((x) => ({ ...x, completedAt: startedAt + 1 })) }],
  };
  await db.sessions.add(s);
  return s;
}

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/history']}>
      <Routes>
        <Route path="/history" element={<HistoryScreen />} />
        <Route path="/summary/:sessionId" element={<div>요약화면</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

test('운동별로 보기에 회차별 증감과 PR이 표시된다', async () => {
  await addFinishedSession(1000, 'lib-bench-press', [{ weight: 50, reps: 10 }]);
  await addFinishedSession(2000, 'lib-bench-press', [{ weight: 60, reps: 10 }]);
  renderScreen();
  fireEvent.change(await screen.findByLabelText('운동별로 보기'), {
    target: { value: 'lib-bench-press' },
  });
  expect(await screen.findByText('볼륨 600kg 🔺 +20% · 최고 60kg 🔺 +10kg 🏆')).toBeInTheDocument();
  expect(screen.getByText('볼륨 500kg · 첫 기록')).toBeInTheDocument();
});

test('세션 상세에서 요약 보기로 이동한다', async () => {
  await addFinishedSession(1000, 'lib-bench-press', [{ weight: 50, reps: 10 }]);
  renderScreen();
  fireEvent.click(await screen.findByText(/1개 운동/));
  fireEvent.click(screen.getByRole('button', { name: '요약 보기' }));
  expect(await screen.findByText('요약화면')).toBeInTheDocument();
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/screens/HistoryScreen.test.tsx`
Expected: FAIL — 증감 텍스트와 '요약 보기' 버튼 없음

- [ ] **Step 3: HistoryScreen 수정**

import 추가:

```tsx
import { useNavigate } from 'react-router-dom';
import { annotateHistory, fmtVolumeDelta, fmtWeightDelta } from '../db/progress';
```

컴포넌트 상단에 추가:

```tsx
const navigate = useNavigate();
```

`exMap` 선언 아래에 추가:

```tsx
const annotations = history ? annotateHistory(history.map((h) => h.sets)) : [];
```

운동별 보기 렌더링(기존 `history.map(({ session, sets }) => ...)` 블록)을 다음으로 교체:

```tsx
{history.map(({ session, sets }, i) => {
  const a = annotations[i];
  const line = a.prevVolume === undefined
    ? `볼륨 ${a.volume}kg · 첫 기록`
    : `볼륨 ${a.volume}kg ${fmtVolumeDelta(a.volume, a.prevVolume)} · 최고 ${a.maxWeight}kg ${fmtWeightDelta(a.maxWeight, a.prevMaxWeight ?? 0)}`;
  return (
    <div key={session.id} className="hist-row" style={{ display: 'block' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>{fmtSets(sets)}</span>
        <span className="d">{fmtDate(session.startedAt)}</span>
      </div>
      <div className="d" style={{ fontSize: 12, marginTop: 2 }}>
        {line}{a.isPR ? ' 🏆' : ''}
      </div>
    </div>
  );
})}
```

세션 상세 펼침의 기존 `기록 삭제` 버튼을 다음으로 교체 (요약 보기 추가):

```tsx
<div className="btn-row" style={{ marginTop: 10 }}>
  <button
    className="btn btn-ghost"
    onClick={(ev) => { ev.stopPropagation(); navigate(`/summary/${s.id}`); }}
  >
    요약 보기
  </button>
  <button
    className="btn btn-danger"
    onClick={(ev) => { ev.stopPropagation(); void remove(s.id); }}
  >
    기록 삭제
  </button>
</div>
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/screens/HistoryScreen.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/screens/HistoryScreen.tsx src/screens/HistoryScreen.test.tsx
git commit -m "feat: 기록 탭 운동별 증감·PR 표시와 세션 요약 보기"
```

---

### Task 6: 전체 검증

**Files:** 없음 (검증만)

- [ ] **Step 1: 전체 테스트**

Run: `npm test`
Expected: 전체 PASS (기존 + 신규 테스트 모두)

- [ ] **Step 2: 프로덕션 빌드**

Run: `npm run build`
Expected: 에러 없이 `dist/` 생성 (tsc 타입 체크 포함)

- [ ] **Step 3: 실패 시 수정 후 커밋**

수정이 있었다면:

```bash
git add -A src
git commit -m "fix: 과부하 기능 통합 검증 수정"
```
