# 월 달력·기록 디테일·명품보쌈 브랜딩 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 홈에 월 달력(날짜별 세션 조회)과 최근 운동 디테일 이동을 추가하고, 기록 탭 상세에 증감·PR 요약을 통합하며, 앱을 "명품보쌈"으로 브랜딩한다.

**Architecture:** 달력은 신규 `MonthCalendar` 컴포넌트(순수 함수 `monthGrid`로 그리드 생성)로 분리. 세션 디테일은 전부 기존 요약 화면(`/summary/:id`)으로 통일. 판정 로직은 `progress.ts`의 신규 `summarizeSession` 헬퍼로 단일화해 SummaryScreen과 HistoryScreen이 공유. 브랜딩은 아이콘 SVG 수정 후 PNG 재생성 + 매니페스트/타이틀 변경.

**Tech Stack:** React 18 + TypeScript + Vite, Dexie(IndexedDB), react-router-dom, vitest + @testing-library/react + fake-indexeddb, sharp(아이콘 생성 — 기존 devDependency)

**스펙:** `docs/superpowers/specs/2026-07-08-month-calendar-details-branding-design.md`

## Global Constraints

- DB 스키마(`src/db/db.ts`) 변경 금지 — 백업 JSON 포맷 유지
- 새 npm 의존성 추가 금지
- UI 문구는 한국어, 기존 화면들의 이모지/문체를 따름
- workoutDays 키 형식은 기존 홈과 동일: `` `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` `` (month 0-베이스, 패딩 없음)
- 요약 줄 포맷은 기존 SummaryScreen과 동일: `볼륨 {v}kg {fmtVolumeDelta} · 최고 {m}kg {fmtWeightDelta}`, 첫 기록은 `볼륨 {v}kg · 최고 {m}kg · 첫 기록`, PR은 `🏆`
- 테스트는 기존 패턴 준수: vitest globals(`test`/`expect`/`vi` 전역), DB 테스트는 `beforeEach`에서 `db.delete()`+`db.open()`(+필요 시 `seedLibrary()`), 컴포넌트는 `MemoryRouter`
- 테스트 실행: `npx vitest run <파일경로>` (전체는 `npm test`)

---

### Task 1: progress.ts — summarizeSession 헬퍼 + SummaryScreen 리팩터

**Files:**
- Modify: `src/db/progress.ts` (함수 추가)
- Modify: `src/screens/SummaryScreen.tsx` (인라인 Promise.all을 헬퍼 호출로 교체)
- Test: `src/db/progress.test.ts` (테스트 추가), `src/screens/SummaryScreen.test.tsx` (기존 3개 그대로 통과 확인)

**Interfaces:**
- Consumes: 기존 `summarizeEntry(exerciseId, sets, sessionStartedAt): Promise<EntryProgress>`, `Session` 타입
- Produces (Task 4가 사용): `summarizeSession(session: Session): Promise<EntryProgress[]>` — entries 순서 그대로의 판정 배열

- [ ] **Step 1: 실패하는 테스트 작성**

`src/db/progress.test.ts` — import에 `summarizeSession` 추가하고 파일 끝에 추가:

```ts
test('summarizeSession은 세션의 모든 entry를 순서대로 판정한다', async () => {
  await addFinishedSession(1000, 'ex1', [{ weight: 50, reps: 10 }]);
  const cur: Session = {
    id: 's2', startedAt: 2000, finishedAt: 3000,
    entries: [
      { exerciseId: 'ex1', sets: [{ weight: 60, reps: 10, completedAt: 2001 }] },
      { exerciseId: 'ex2', sets: [{ weight: 30, reps: 15, completedAt: 2001 }] },
    ],
  };
  const list = await summarizeSession(cur);
  expect(list).toHaveLength(2);
  expect(list[0]).toMatchObject({ volume: 600, prevVolume: 500, isPR: true });
  expect(list[1]).toMatchObject({ volume: 450, prevVolume: undefined, isPR: false });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/db/progress.test.ts`
Expected: FAIL — `summarizeSession` export 없음 (기존 12개는 PASS)

- [ ] **Step 3: 구현**

`src/db/progress.ts` — 상단 import를 `import type { SetRecord, Session } from '../types';`로 확장하고 파일 끝에 추가:

```ts
export async function summarizeSession(session: Session): Promise<EntryProgress[]> {
  return Promise.all(
    session.entries.map((e) => summarizeEntry(e.exerciseId, e.sets, session.startedAt)),
  );
}
```

`src/screens/SummaryScreen.tsx` — import를 다음으로 교체:

```tsx
import { summarizeSession, fmtVolumeDelta, fmtWeightDelta, type EntryProgress } from '../db/progress';
```

useEffect 내부의 다음 블록을:

```tsx
const list = await Promise.all(
  s.entries.map((e) => summarizeEntry(e.exerciseId, e.sets, s.startedAt)),
);
```

다음으로 교체:

```tsx
const list = await summarizeSession(s);
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/db/progress.test.ts src/screens/SummaryScreen.test.tsx`
Expected: PASS (progress 13개 + SummaryScreen 기존 3개)

- [ ] **Step 5: 커밋**

```bash
git add src/db/progress.ts src/db/progress.test.ts src/screens/SummaryScreen.tsx
git commit -m "refactor: 세션 전체 판정 summarizeSession 헬퍼로 단일화"
```

---

### Task 2: MonthCalendar 컴포넌트

**Files:**
- Create: `src/components/MonthCalendar.tsx`
- Modify: `src/styles.css` (달력 스타일 추가)
- Test: `src/components/MonthCalendar.test.tsx`

**Interfaces:**
- Consumes: 없음 (독립 컴포넌트)
- Produces (Task 3이 사용):
  - `export function monthGrid(year: number, month: number): (Date | null)[][]` — month는 0-베이스, 월요일 시작 주 단위 2차원 배열, 앞뒤 패딩은 null
  - default export `MonthCalendar` props: `{ workoutDays: Set<string>; selectedDate: Date | null; onSelectDate: (d: Date) => void }` — workoutDays 키는 `` `${year}-${month0}-${day}` ``
  - 각 날짜 셀은 `aria-label="{M}월 {D}일"`인 button

- [ ] **Step 1: 실패하는 테스트 작성**

`src/components/MonthCalendar.test.tsx` 생성:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import MonthCalendar, { monthGrid } from './MonthCalendar';

test('monthGrid: 2026년 7월은 수요일 시작 5주', () => {
  const g = monthGrid(2026, 6);
  expect(g).toHaveLength(5);
  expect(g[0][0]).toBeNull();
  expect(g[0][1]).toBeNull();
  expect(g[0][2]?.getDate()).toBe(1);
  expect(g[4][4]?.getDate()).toBe(31);
  expect(g[4][5]).toBeNull();
  expect(g[4][6]).toBeNull();
});

test('monthGrid: 6주 달과 연도 경계', () => {
  expect(monthGrid(2026, 10)).toHaveLength(6); // 2026년 11월은 일요일 시작 → 6주
  const jan = monthGrid(2027, 0);
  expect(jan.flat().filter(Boolean)).toHaveLength(31);
});

test('달 이동과 날짜 선택이 동작한다', () => {
  const onSelect = vi.fn();
  render(<MonthCalendar workoutDays={new Set()} selectedDate={null} onSelectDate={onSelect} />);
  const now = new Date();
  expect(screen.getByText(`${now.getFullYear()}년 ${now.getMonth() + 1}월`)).toBeInTheDocument();

  fireEvent.click(screen.getByLabelText('이전 달'));
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  expect(screen.getByText(`${prev.getFullYear()}년 ${prev.getMonth() + 1}월`)).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('다음 달'));

  fireEvent.click(screen.getByRole('button', { name: `${now.getMonth() + 1}월 15일` }));
  expect(onSelect).toHaveBeenCalledTimes(1);
  expect((onSelect.mock.calls[0][0] as Date).getDate()).toBe(15);
});

test('운동한 날은 ✓로 표시된다', () => {
  const now = new Date();
  const key = `${now.getFullYear()}-${now.getMonth()}-15`;
  render(<MonthCalendar workoutDays={new Set([key])} selectedDate={null} onSelectDate={() => {}} />);
  expect(screen.getByRole('button', { name: `${now.getMonth() + 1}월 15일` })).toHaveTextContent('✓');
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/components/MonthCalendar.test.tsx`
Expected: FAIL — `Failed to resolve import "./MonthCalendar"`

- [ ] **Step 3: 구현**

`src/components/MonthCalendar.tsx` 생성:

```tsx
import { useState } from 'react';

const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

// month는 0-베이스. 월요일 시작 주 단위 그리드, 앞뒤 빈 칸은 null
export function monthGrid(year: number, month: number): (Date | null)[][] {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7; // 월=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function MonthCalendar({
  workoutDays, selectedDate, onSelectDate,
}: {
  workoutDays: Set<string>;
  selectedDate: Date | null;
  onSelectDate: (d: Date) => void;
}) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  function move(delta: number) {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }

  return (
    <>
      <div className="cal-head">
        <button aria-label="이전 달" onClick={() => move(-1)}>◀</button>
        <span>{viewYear}년 {viewMonth + 1}월</span>
        <button aria-label="다음 달" onClick={() => move(1)}>▶</button>
      </div>
      <div className="weekrow">
        {DAY_LABELS.map((l) => <div key={l} className="day">{l}</div>)}
      </div>
      {monthGrid(viewYear, viewMonth).map((week, wi) => (
        <div key={wi} className="weekrow" style={{ marginTop: 4 }}>
          {week.map((d, di) => {
            if (!d) return <div key={di} className="day"><div className="dot" style={{ visibility: 'hidden' }} /></div>;
            const done = workoutDays.has(dayKey(d));
            const isToday = sameDay(d, today);
            const isSelected = selectedDate !== null && sameDay(d, selectedDate);
            return (
              <div key={di} className="day">
                <button
                  className={`dot ${done ? 'on' : isToday ? 'today' : ''}${isSelected ? ' sel' : ''}`}
                  aria-label={`${viewMonth + 1}월 ${d.getDate()}일`}
                  onClick={() => onSelectDate(d)}
                >
                  {done ? '✓' : d.getDate()}
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
}
```

`src/styles.css` — `.day .dot.today { ... }` 줄 바로 아래에 추가:

```css
.cal-head { display: flex; justify-content: space-between; align-items: center; font-size: 14px; font-weight: 800; margin-bottom: 10px; }
.cal-head button { background: none; border: none; font-size: 13px; color: var(--blue); padding: 4px 10px; cursor: pointer; }
.day button.dot { border: none; padding: 0; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
.day .dot.sel { box-shadow: 0 0 0 2px var(--blue); }
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/components/MonthCalendar.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/components/MonthCalendar.tsx src/components/MonthCalendar.test.tsx src/styles.css
git commit -m "feat: 월 달력 컴포넌트 — 달 이동, 운동일 표시, 날짜 선택"
```

---

### Task 3: HomeScreen — 월 달력 카드 + 최근 운동 디테일

**Files:**
- Modify: `src/screens/HomeScreen.tsx`
- Test: `src/screens/HomeScreen.test.tsx` (테스트 추가)

**Interfaces:**
- Consumes: Task 2의 `MonthCalendar`(props: workoutDays/selectedDate/onSelectDate), 기존 `/summary/:sessionId` 라우트, 기존 `sameDay`/`workoutDays`
- Produces: 없음 (말단 UI)

- [ ] **Step 1: 실패하는 테스트 작성**

`src/screens/HomeScreen.test.tsx` — 상단 import 확장:

```tsx
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { Session } from '../types';
```

파일에 헬퍼와 테스트 추가:

```tsx
async function addFinishedSession(startedAt: number, name?: string): Promise<Session> {
  const s: Session = {
    id: crypto.randomUUID(),
    startedAt,
    finishedAt: startedAt + 3600_000,
    routineName: name,
    entries: [{ exerciseId: 'e1', sets: [{ weight: 50, reps: 10, completedAt: startedAt + 1 }] }],
  };
  await db.sessions.add(s);
  return s;
}

function renderWithSummary() {
  return render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/summary/:sessionId" element={<div>요약화면</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

test('달력 날짜를 누르면 그날 세션이 표시되고 탭하면 요약으로 이동한다', async () => {
  const now = new Date();
  const ts = new Date(now.getFullYear(), now.getMonth(), 15, 10, 0).getTime();
  await addFinishedSession(ts, '가슴 날');
  renderWithSummary();
  fireEvent.click(await screen.findByRole('button', { name: `${now.getMonth() + 1}월 15일` }));
  // 달력 아래 목록 + 최근 운동 카드 양쪽에 같은 텍스트가 존재
  const rows = await screen.findAllByText('가슴 날 · 1개 운동');
  expect(rows).toHaveLength(2);
  fireEvent.click(rows[0]); // 달력 쪽 행
  expect(await screen.findByText('요약화면')).toBeInTheDocument();
});

test('기록 없는 날짜를 누르면 빈 문구가 보인다', async () => {
  renderWithSummary();
  const now = new Date();
  fireEvent.click(await screen.findByRole('button', { name: `${now.getMonth() + 1}월 15일` }));
  expect(await screen.findByText('이 날은 운동 기록이 없어요')).toBeInTheDocument();
});

test('최근 운동을 누르면 요약 화면으로 이동한다', async () => {
  await addFinishedSession(Date.now() - 86_400_000, '등 날');
  renderWithSummary();
  fireEvent.click(await screen.findByText('등 날 · 1개 운동'));
  expect(await screen.findByText('요약화면')).toBeInTheDocument();
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/screens/HomeScreen.test.tsx`
Expected: 새 3개 FAIL (달력 날짜 버튼 없음), 기존 6개 PASS 유지

- [ ] **Step 3: 구현**

`src/screens/HomeScreen.tsx` 수정:

import 추가:

```tsx
import MonthCalendar from '../components/MonthCalendar';
```

`weekDates` 함수와 `DAY_LABELS` 상수를 삭제 (달력 컴포넌트로 이동됨. `sameDay`는 유지).

컴포넌트에서 `const week = weekDates(today);` 삭제, state 추가:

```tsx
const [selectedDate, setSelectedDate] = useState<Date | null>(null);
```

선택 날짜의 세션 계산 (`workoutDays` 선언 아래):

```tsx
const daySessions = selectedDate
  ? sessions.filter((s) => sameDay(new Date(s.startedAt), selectedDate))
  : [];
```

기존 "이번 주" 카드 전체를 다음으로 교체:

```tsx
<div className="card">
  <div className="card-h">달력</div>
  <MonthCalendar workoutDays={workoutDays} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
  {selectedDate && (
    <div style={{ marginTop: 12 }}>
      {daySessions.map((s) => (
        <div
          key={s.id} className="hist-row" style={{ cursor: 'pointer' }}
          onClick={() => navigate(`/summary/${s.id}`)}
        >
          <span>{s.routineName ?? '오늘 운동'} · {s.entries.length}개 운동</span>
          <span className="d">보기 ›</span>
        </div>
      ))}
      {daySessions.length === 0 && <div className="empty">이 날은 운동 기록이 없어요</div>}
    </div>
  )}
</div>
```

최근 운동 행을 탭 가능하게 교체:

```tsx
{sessions.slice(0, 5).map((s) => (
  <div
    key={s.id} className="hist-row" style={{ cursor: 'pointer' }}
    onClick={() => navigate(`/summary/${s.id}`)}
  >
    <span>{s.routineName ?? '오늘 운동'} · {s.entries.length}개 운동</span>
    <span className="d">{fmtDate(s.startedAt)}</span>
  </div>
))}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/screens/HomeScreen.test.tsx src/App.test.tsx`
Expected: HomeScreen 9개 + App 1개 PASS

- [ ] **Step 5: 커밋**

```bash
git add src/screens/HomeScreen.tsx src/screens/HomeScreen.test.tsx
git commit -m "feat: 홈 월 달력 — 날짜별 세션 조회, 최근 운동 요약 이동"
```

---

### Task 4: HistoryScreen — 상세에 요약 인라인 통합

**Files:**
- Modify: `src/screens/HistoryScreen.tsx`
- Test: `src/screens/HistoryScreen.test.tsx` (기존 '요약 보기' 테스트 교체)

**Interfaces:**
- Consumes: Task 1의 `summarizeSession(session): Promise<EntryProgress[]>`, 기존 `fmtVolumeDelta`/`fmtWeightDelta`/`EntryProgress`
- Produces: 없음 (말단 UI)

- [ ] **Step 1: 테스트 교체**

`src/screens/HistoryScreen.test.tsx`의 기존 테스트 `'세션 상세에서 요약 보기로 이동한다'`를 삭제하고 다음으로 교체:

```tsx
test('세션을 펼치면 운동별 요약이 함께 표시되고 요약 보기 버튼은 없다', async () => {
  await addFinishedSession(1000, 'lib-bench-press', [{ weight: 50, reps: 10 }]);
  await addFinishedSession(2000, 'lib-bench-press', [{ weight: 60, reps: 10 }]);
  renderScreen();
  fireEvent.click((await screen.findAllByText(/1개 운동/))[0]); // 최신(60kg) 세션 펼침
  expect(await screen.findByText('볼륨 600kg 🔺 +20% · 최고 60kg 🔺 +10kg')).toBeInTheDocument();
  expect(screen.getByText(/벤치프레스.*🏆/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '요약 보기' })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/screens/HistoryScreen.test.tsx`
Expected: 새 테스트 FAIL (요약 줄 없음 + '요약 보기' 버튼 존재), 나머지 PASS

- [ ] **Step 3: 구현**

`src/screens/HistoryScreen.tsx` 수정:

- import 정리: `useNavigate` import와 `const navigate = useNavigate();` 삭제. `useState` 옆에 `useEffect` 추가. progress import를 다음으로 확장:

```tsx
import { useState, useEffect } from 'react';
import {
  annotateHistory, fmtVolumeDelta, fmtWeightDelta, summarizeSession, type EntryProgress,
} from '../db/progress';
```

- 컴포넌트에 펼친 세션의 요약 로드 추가 (`annotations` 선언 아래):

```tsx
const [openSummary, setOpenSummary] = useState<EntryProgress[] | null>(null);

useEffect(() => {
  setOpenSummary(null);
  const s = sessions.find((x) => x.id === openId);
  if (s) void summarizeSession(s).then(setOpenSummary);
}, [openId, sessions]);
```

- 펼친 상세의 entries 렌더링(`{s.entries.map((e, i) => ...)}`)을 다음으로 교체:

```tsx
{s.entries.map((e, i) => {
  const p = openSummary?.[i];
  const line = p
    ? (p.prevVolume === undefined
        ? `볼륨 ${p.volume}kg · 최고 ${p.maxWeight}kg · 첫 기록`
        : `볼륨 ${p.volume}kg ${fmtVolumeDelta(p.volume, p.prevVolume)} · 최고 ${p.maxWeight}kg ${fmtWeightDelta(p.maxWeight, p.prevMaxWeight ?? 0)}`)
    : null;
  return (
    <div key={i} className="hist-row" style={{ display: 'block' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>{exMap.get(e.exerciseId)?.name ?? '삭제된 운동'}{p?.isPR ? ' 🏆' : ''}</span>
        <span className="d">{fmtSets(e.sets)}</span>
      </div>
      {line && <div className="d" style={{ fontSize: 12, marginTop: 2 }}>{line}</div>}
    </div>
  );
})}
```

- 버튼 영역(`<div className="btn-row" ...>` 전체)을 단일 삭제 버튼으로 교체:

```tsx
<button
  className="btn btn-danger" style={{ marginTop: 10 }}
  onClick={(ev) => { ev.stopPropagation(); void remove(s.id); }}
>
  기록 삭제
</button>
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/screens/HistoryScreen.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/screens/HistoryScreen.tsx src/screens/HistoryScreen.test.tsx
git commit -m "feat: 기록 탭 상세에 운동별 증감·PR 요약 인라인 통합"
```

---

### Task 5: 명품보쌈 브랜딩 + 전체 검증

**Files:**
- Modify: `scripts/generate-icons.mjs` (모서리 글자 추가)
- Modify: `vite.config.ts` (manifest name/short_name, icon purpose)
- Modify: `index.html` (title, apple-touch-icon)
- Regenerate: `public/icons/icon-192.png`, `public/icons/icon-512.png` (산출물 커밋)

**Interfaces:**
- Consumes: 없음
- Produces: 없음

- [ ] **Step 1: 아이콘 SVG에 글자 추가**

`scripts/generate-icons.mjs`의 `const svg` 를 다음 전체로 교체 (기존 바벨 유지 + 모서리 글자 4개):

```js
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
  <rect width="512" height="512" rx="112" fill="#3182F6"/>
  <g stroke="#fff" stroke-width="28" stroke-linecap="round" fill="#fff">
    <line x1="96" y1="256" x2="416" y2="256"/>
    <rect x="128" y="168" width="44" height="176" rx="14"/>
    <rect x="340" y="168" width="44" height="176" rx="14"/>
    <rect x="72" y="200" width="32" height="112" rx="12"/>
    <rect x="408" y="200" width="32" height="112" rx="12"/>
  </g>
  <g fill="#fff" font-family="'Apple SD Gothic Neo', 'AppleGothic', sans-serif" font-weight="800" font-size="88">
    <text x="52" y="132" text-anchor="start">명</text>
    <text x="460" y="132" text-anchor="end">보</text>
    <text x="52" y="472" text-anchor="start">품</text>
    <text x="460" y="472" text-anchor="end">쌈</text>
  </g>
</svg>`;
```

- [ ] **Step 2: 아이콘 재생성 + 시각 확인**

Run: `npm run icons`
Expected: `✓ icon-192.png`, `✓ icon-512.png` 출력

그 다음 `public/icons/icon-512.png`를 Read 도구로 열어 **글자 4개(좌상 명, 우상 보, 좌하 품, 우하 쌈)가 실제로 렌더링됐는지 눈으로 확인**. 글자가 □(폰트 미발견)로 나오면 font-family에서 따옴표를 제거한 `Apple SD Gothic Neo, AppleGothic, sans-serif`로 바꿔 재시도.

- [ ] **Step 3: 매니페스트·타이틀 변경**

`vite.config.ts` manifest에서:

```ts
name: '명품보쌈',
short_name: '명품보쌈',
```

로 교체하고, 512 아이콘의 `purpose: 'any maskable'`을 `purpose: 'any'`로 변경 (maskable 마스크가 모서리 글자를 잘라내는 것 방지).

`index.html`에서 `<title>운동기록</title>`을 `<title>명품보쌈</title>`으로 교체하고, `<title>` 줄 바로 위에 추가:

```html
<link rel="apple-touch-icon" href="./icons/icon-192.png" />
```

- [ ] **Step 4: 전체 검증**

Run: `npm test`
Expected: 전체 PASS (기존 + 신규 ≈80개)

Run: `npm run build`
Expected: 에러 없이 dist/ 생성, 출력에 PWA precache 정보 표시

- [ ] **Step 5: 커밋**

```bash
git add scripts/generate-icons.mjs vite.config.ts index.html public/icons/icon-192.png public/icons/icon-512.png
git commit -m "feat: 명품보쌈 브랜딩 — 아이콘 모서리 글자, 앱 이름·타이틀 변경"
```
