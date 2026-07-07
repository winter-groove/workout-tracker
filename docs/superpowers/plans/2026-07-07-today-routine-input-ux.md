# 오늘의 루틴 선택 + 입력 UX 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 홈에서 오늘의 루틴을 명시적으로 정하는 흐름으로 교체하고, 세션 picker를 세션의 최빈 부위로 미리 필터하며, 무게 입력의 "040" 문제를 해소한다.

**Architecture:** 오늘의 루틴은 localStorage에 `{id, date}`로 저장하는 신규 모듈 `src/db/todayRoutine.ts` (기존 `settings.ts` 패턴). picker 초기 필터는 오늘의 루틴 배관 없이 세션 entries의 최빈 부위를 `dominantBodyPart` 순수 함수로 계산해 `ExercisePicker`의 새 `initialFilter` prop으로 전달. DB 스키마 변경 없음.

**Tech Stack:** React 18 + TypeScript + Vite, Dexie(IndexedDB), react-router-dom, vitest + @testing-library/react + fake-indexeddb (jsdom localStorage 사용 가능)

**스펙:** `docs/superpowers/specs/2026-07-07-today-routine-and-input-ux-design.md`

## Global Constraints

- DB 스키마(`src/db/db.ts`) 변경 금지 — 백업 JSON 포맷 유지
- 새 npm 의존성 추가 금지
- UI 문구는 한국어, 기존 화면들의 이모지/문체를 따름
- picker 필터는 소프트 필터 — 초기값만 정하고 사용자가 언제든 칩으로 전환 가능
- 오늘의 루틴 저장 형태: localStorage 키 `wt-today-routine`, 값 `JSON.stringify({ id, date })`, date는 로컬 `YYYY-MM-DD`
- 동률/빈 배열이면 `dominantBodyPart`는 `undefined` → picker는 '전체'
- 테스트는 기존 패턴 준수: vitest globals(`test`/`expect`/`vi` 전역), DB 쓰는 테스트는 `beforeEach`에서 `db.delete()` + `db.open()`, 컴포넌트는 `MemoryRouter`로 감싸기
- 테스트 실행: `npx vitest run <파일경로>` (전체는 `npm test`)

---

### Task 1: todayRoutine.ts — 오늘의 루틴 저장 모듈

**Files:**
- Create: `src/db/todayRoutine.ts`
- Test: `src/db/todayRoutine.test.ts`

**Interfaces:**
- Consumes: 없음 (localStorage만)
- Produces (Task 4가 사용):
  - `getTodayRoutineId(now?: Date): string | undefined` — 저장된 date가 `now`의 로컬 날짜와 다르거나 값이 손상되면 `undefined`
  - `setTodayRoutineId(id: string, now?: Date): void`
  - `clearTodayRoutine(): void`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/db/todayRoutine.test.ts` 생성:

```ts
import { getTodayRoutineId, setTodayRoutineId, clearTodayRoutine } from './todayRoutine';

beforeEach(() => {
  localStorage.clear();
});

test('같은 날이면 저장한 루틴 id를 돌려준다', () => {
  setTodayRoutineId('r1', new Date(2026, 6, 7, 9, 0));
  expect(getTodayRoutineId(new Date(2026, 6, 7, 23, 59))).toBe('r1');
});

test('날짜가 다르면 undefined (자동 리셋)', () => {
  setTodayRoutineId('r1', new Date(2026, 6, 7));
  expect(getTodayRoutineId(new Date(2026, 6, 8, 0, 1))).toBeUndefined();
});

test('clear하면 undefined', () => {
  setTodayRoutineId('r1');
  clearTodayRoutine();
  expect(getTodayRoutineId()).toBeUndefined();
});

test('저장값이 손상되면 undefined', () => {
  localStorage.setItem('wt-today-routine', '{broken');
  expect(getTodayRoutineId()).toBeUndefined();
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/db/todayRoutine.test.ts`
Expected: FAIL — `Failed to resolve import "./todayRoutine"` (모듈 없음)

- [ ] **Step 3: 최소 구현 작성**

`src/db/todayRoutine.ts` 생성:

```ts
const KEY = 'wt-today-routine';

function dateKey(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function getTodayRoutineId(now: Date = new Date()): string | undefined {
  const raw = localStorage.getItem(KEY);
  if (raw === null) return undefined;
  try {
    const parsed = JSON.parse(raw) as { id?: unknown; date?: unknown };
    if (typeof parsed.id !== 'string' || parsed.date !== dateKey(now)) return undefined;
    return parsed.id;
  } catch {
    return undefined;
  }
}

export function setTodayRoutineId(id: string, now: Date = new Date()): void {
  localStorage.setItem(KEY, JSON.stringify({ id, date: dateKey(now) }));
}

export function clearTodayRoutine(): void {
  localStorage.removeItem(KEY);
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/db/todayRoutine.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/db/todayRoutine.ts src/db/todayRoutine.test.ts
git commit -m "feat: 오늘의 루틴 localStorage 저장 모듈 — 날짜 불일치 시 자동 리셋"
```

---

### Task 2: ExercisePicker — dominantBodyPart + initialFilter

**Files:**
- Modify: `src/components/ExercisePicker.tsx`
- Test: `src/components/ExercisePicker.test.tsx` (테스트 추가)

**Interfaces:**
- Consumes: `Exercise`/`BodyPart` 타입 (`src/types.ts`)
- Produces (Task 3이 사용):
  - `export type Filter = BodyPart | '전체'` (기존 내부 타입을 export로 변경)
  - `export function dominantBodyPart(exercises: Exercise[]): BodyPart | undefined` — 최빈 부위, 동률·빈 배열이면 `undefined`
  - `ExercisePicker`의 새 prop `initialFilter?: Filter` — filter state 초기값으로만 사용 (기본 `'전체'`)

- [ ] **Step 1: 실패하는 테스트 작성**

`src/components/ExercisePicker.test.tsx` 상단 import 수정:

```tsx
import ExercisePicker, { dominantBodyPart } from './ExercisePicker';
import type { Exercise } from '../types';
```

파일 끝에 추가:

```tsx
function fakeEx(bodyPart: Exercise['bodyPart']): Exercise {
  return {
    id: crypto.randomUUID(), name: 'x', bodyPart,
    equipment: '바벨', isCustom: false, isHidden: false,
  };
}

test('dominantBodyPart: 최빈 부위, 동률·빈 배열은 undefined', () => {
  expect(dominantBodyPart([fakeEx('가슴'), fakeEx('가슴'), fakeEx('어깨')])).toBe('가슴');
  expect(dominantBodyPart([fakeEx('가슴'), fakeEx('어깨')])).toBeUndefined();
  expect(dominantBodyPart([])).toBeUndefined();
});

test('initialFilter가 주어지면 해당 부위 칩이 켜진 채 열리고 전환도 가능하다', async () => {
  render(<ExercisePicker onSelect={() => {}} onClose={() => {}} initialFilter="하체" />);
  expect(await screen.findByText('레그 프레스')).toBeInTheDocument();
  expect(screen.queryByText('벤치프레스')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '하체' })).toHaveClass('on');
  fireEvent.click(screen.getByRole('button', { name: '전체' }));
  expect(await screen.findByText('벤치프레스')).toBeInTheDocument();
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/components/ExercisePicker.test.tsx`
Expected: FAIL — `dominantBodyPart` export 없음 (기존 4개는 PASS 유지)

- [ ] **Step 3: 구현**

`src/components/ExercisePicker.tsx` 수정.

기존 `type Filter = BodyPart | '전체';`를 export로 바꾸고 `dominantBodyPart` 추가:

```tsx
export type Filter = BodyPart | '전체';

export function dominantBodyPart(exercises: Exercise[]): BodyPart | undefined {
  const counts = new Map<BodyPart, number>();
  for (const e of exercises) counts.set(e.bodyPart, (counts.get(e.bodyPart) ?? 0) + 1);
  let best: BodyPart | undefined;
  let bestCount = 0;
  let tie = false;
  for (const [part, count] of counts) {
    if (count > bestCount) {
      best = part;
      bestCount = count;
      tie = false;
    } else if (count === bestCount) {
      tie = true;
    }
  }
  return tie ? undefined : best;
}
```

컴포넌트 시그니처와 filter state 초기값 수정:

```tsx
export default function ExercisePicker({
  onSelect, onClose, initialFilter,
}: {
  onSelect: (ex: Exercise) => void;
  onClose: () => void;
  initialFilter?: Filter;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>(initialFilter ?? '전체');
  ...
```

(나머지는 그대로 — 칩 UI가 기존 filter state를 쓰므로 소프트 필터가 자동으로 성립)

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/components/ExercisePicker.test.tsx`
Expected: PASS (6 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/components/ExercisePicker.tsx src/components/ExercisePicker.test.tsx
git commit -m "feat: ExercisePicker initialFilter prop과 최빈 부위 계산 함수"
```

---

### Task 3: SessionScreen — picker 부위 필터 + 무게 입력 개선

**Files:**
- Modify: `src/screens/SessionScreen.tsx`
- Test: `src/screens/SessionScreen.test.tsx` (테스트 추가)

**Interfaces:**
- Consumes: Task 2의 `dominantBodyPart`, `initialFilter` prop
- Produces: 없음 (말단 UI)

- [ ] **Step 1: 실패하는 테스트 작성**

`src/screens/SessionScreen.test.tsx` 파일 끝에 추가:

```tsx
test('무게가 0이면 입력란이 빈칸으로 보이고 입력하면 그대로 반영된다', async () => {
  await startSession(routine); // 지난 기록 없음 → 무게 0으로 프리필
  renderScreen();
  await screen.findByText('벤치프레스');
  const weightInput = screen.getByLabelText('세트 1 무게') as HTMLInputElement;
  expect(weightInput.value).toBe('');
  fireEvent.change(weightInput, { target: { value: '40' } });
  await waitFor(async () => {
    const s = await getActiveSession();
    expect(s?.entries[0].sets[0].weight).toBe(40);
  });
  expect((screen.getByLabelText('세트 1 무게') as HTMLInputElement).value).toBe('40');
});

test('운동 추가 picker가 세션의 최빈 부위로 미리 필터되어 열린다', async () => {
  const chestOnly: Routine = {
    id: 'r5', name: '가슴 날',
    items: [{ exerciseId: 'lib-bench-press', defaultSets: 1 }],
  };
  await startSession(chestOnly);
  renderScreen();
  await screen.findByText('벤치프레스');
  fireEvent.click(screen.getByRole('button', { name: '＋ 운동 추가' }));
  expect(await screen.findByRole('button', { name: '가슴' })).toHaveClass('on');
  await waitFor(() => expect(screen.queryByText('스쿼트')).not.toBeInTheDocument());
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/screens/SessionScreen.test.tsx`
Expected: 새 2개 FAIL (무게 입력란 value가 `'0'`, '가슴' 칩이 `on` 아님), 기존 8개 PASS 유지

- [ ] **Step 3: 구현**

`src/screens/SessionScreen.tsx` 수정.

import에 `dominantBodyPart` 추가:

```tsx
import ExercisePicker, { dominantBodyPart } from '../components/ExercisePicker';
```

무게 입력(`세트 ${i + 1} 무게` aria-label이 있는 input)을 다음으로 교체:

```tsx
<input
  type="number" inputMode="decimal" step="0.5" min="0"
  aria-label={`세트 ${i + 1} 무게`}
  value={s.weight === 0 ? '' : s.weight}
  placeholder="0"
  onFocus={(e) => e.currentTarget.select()}
  onChange={(e) => patchSet(i, { weight: Number(e.target.value) || 0 })}
/>
```

횟수 입력(`세트 ${i + 1} 횟수`)에는 `onFocus`만 추가:

```tsx
<input
  type="number" inputMode="numeric" min="0"
  aria-label={`세트 ${i + 1} 횟수`}
  value={s.reps}
  onFocus={(e) => e.currentTarget.select()}
  onChange={(e) => patchSet(i, { reps: Number(e.target.value) || 0 })}
/>
```

picker 렌더링을 다음으로 교체 (기존 `{showPicker && <ExercisePicker onSelect={addExercise} onClose={() => setShowPicker(false)} />}`):

```tsx
{showPicker && (
  <ExercisePicker
    initialFilter={
      dominantBodyPart(
        session.entries
          .map((e) => exMap.get(e.exerciseId))
          .filter((e): e is Exercise => e !== undefined),
      ) ?? '전체'
    }
    onSelect={addExercise}
    onClose={() => setShowPicker(false)}
  />
)}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/screens/SessionScreen.test.tsx`
Expected: PASS (10 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/screens/SessionScreen.tsx src/screens/SessionScreen.test.tsx
git commit -m "feat: 무게 입력 빈칸·탭 전체선택, picker 최빈 부위 초기 필터"
```

---

### Task 4: HomeScreen — 오늘의 루틴 선택 흐름

**Files:**
- Modify: `src/screens/HomeScreen.tsx`
- Test: `src/screens/HomeScreen.test.tsx` (신규)

**Interfaces:**
- Consumes: Task 1의 `getTodayRoutineId`/`setTodayRoutineId`/`clearTodayRoutine`, 기존 `pickNextRoutine`(같은 파일)·`saveRoutine`(`src/db/routines.ts`)
- Produces: 없음 (말단 UI)

- [ ] **Step 1: 실패하는 테스트 작성**

`src/screens/HomeScreen.test.tsx` 생성:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { db } from '../db/db';
import { saveRoutine } from '../db/routines';
import { setTodayRoutineId } from '../db/todayRoutine';
import HomeScreen from './HomeScreen';

beforeEach(async () => {
  await db.delete();
  await db.open();
  localStorage.clear();
});

function renderScreen() {
  return render(
    <MemoryRouter>
      <HomeScreen />
    </MemoryRouter>,
  );
}

test('미선택이면 루틴 목록과 추천 뱃지가 보인다', async () => {
  await saveRoutine({ id: 'r1', name: '가슴운동', items: [] });
  await saveRoutine({ id: 'r2', name: '등운동', items: [] });
  renderScreen();
  expect(await screen.findByText('오늘 뭐 할까요?')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /가슴운동.*추천/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '등운동' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '빈 세션으로 시작' })).toBeInTheDocument();
});

test('루틴을 탭하면 오늘의 루틴으로 고정된다', async () => {
  await saveRoutine({ id: 'r1', name: '가슴운동', items: [{ exerciseId: 'e1', defaultSets: 3 }] });
  renderScreen();
  fireEvent.click(await screen.findByRole('button', { name: /가슴운동/ }));
  expect(await screen.findByText('오늘은 가슴운동')).toBeInTheDocument();
  expect(screen.getByText('1개 운동')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '운동 시작하기' })).toBeInTheDocument();
});

test('다시 선택을 누르면 목록으로 돌아온다', async () => {
  await saveRoutine({ id: 'r1', name: '가슴운동', items: [] });
  setTodayRoutineId('r1');
  renderScreen();
  expect(await screen.findByText('오늘은 가슴운동')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '다시 선택' }));
  expect(await screen.findByText('오늘 뭐 할까요?')).toBeInTheDocument();
});

test('저장된 오늘의 루틴이 삭제됐으면 선택 화면이 보인다', async () => {
  await saveRoutine({ id: 'r1', name: '가슴운동', items: [] });
  setTodayRoutineId('삭제된루틴');
  renderScreen();
  expect(await screen.findByText('오늘 뭐 할까요?')).toBeInTheDocument();
});

test('루틴이 하나도 없으면 기존 첫 운동 안내가 보인다', async () => {
  renderScreen();
  expect(await screen.findByText('첫 운동을 시작해보세요')).toBeInTheDocument();
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/screens/HomeScreen.test.tsx`
Expected: FAIL — '오늘 뭐 할까요?' 텍스트 없음 (마지막 테스트만 PASS 가능)

- [ ] **Step 3: 구현**

`src/screens/HomeScreen.tsx` 수정.

import 추가:

```tsx
import { getTodayRoutineId, setTodayRoutineId, clearTodayRoutine } from '../db/todayRoutine';
```

컴포넌트에서 `const [showRoutinePick, setShowRoutinePick] = useState(false);`를 삭제하고 다음으로 교체:

```tsx
const [todayId, setTodayId] = useState<string | undefined>(() => getTodayRoutineId());
```

`const next = pickNextRoutine(routines, sessions);` 아래에 추가:

```tsx
const todayRoutine = routines.find((r) => r.id === todayId);

function chooseToday(r: Routine) {
  setTodayRoutineId(r.id);
  setTodayId(r.id);
}

function resetToday() {
  clearTodayRoutine();
  setTodayId(undefined);
}
```

`active`가 아닐 때의 startcard 전체(기존 `next ? ... : ...` 분기 + "다른 루틴 선택" 버튼 + `showRoutinePick` 블록)를 다음으로 교체:

```tsx
<div className="startcard">
  {routines.length === 0 ? (
    <>
      <div className="t">첫 운동을 시작해보세요</div>
      <div className="s">관리 탭에서 루틴을 만들면 여기에 떠요</div>
      <button className="go" onClick={() => begin()}>빈 세션으로 시작</button>
    </>
  ) : todayRoutine ? (
    <>
      <div className="t">오늘은 {todayRoutine.name}</div>
      <div className="s">{todayRoutine.items.length}개 운동</div>
      <button className="go" onClick={() => begin(todayRoutine)}>운동 시작하기</button>
      <button
        className="go" style={{ marginTop: 8, background: 'rgba(255,255,255,0.2)', color: '#fff' }}
        onClick={resetToday}
      >
        다시 선택
      </button>
    </>
  ) : (
    <>
      <div className="t">오늘 뭐 할까요?</div>
      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {routines.map((r) => (
          <button key={r.id} className="go" onClick={() => chooseToday(r)}>
            {r.name}{next?.id === r.id ? ' ⭐ 추천' : ''}
          </button>
        ))}
        <button
          className="go" style={{ background: 'rgba(255,255,255,0.2)', color: '#fff' }}
          onClick={() => begin()}
        >
          빈 세션으로 시작
        </button>
      </div>
    </>
  )}
</div>
```

(진행 중 세션 카드, 이번 주, 최근 운동 카드는 그대로)

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/screens/HomeScreen.test.tsx`
Expected: PASS (5 tests)

기존 화면 테스트도 확인: `npx vitest run src/App.test.tsx`
Expected: PASS (홈 heading은 변경 없음)

- [ ] **Step 5: 커밋**

```bash
git add src/screens/HomeScreen.tsx src/screens/HomeScreen.test.tsx
git commit -m "feat: 홈 화면 오늘의 루틴 선택 흐름 — 추천 뱃지·다시 선택, 다른 루틴 선택 제거"
```

---

### Task 5: 전체 검증

**Files:** 없음 (검증만)

- [ ] **Step 1: 전체 테스트**

Run: `npm test`
Expected: 전체 PASS (기존 58 + 신규 ≈13)

- [ ] **Step 2: 프로덕션 빌드**

Run: `npm run build`
Expected: 에러 없이 `dist/` 생성 (tsc 타입 체크 포함)

- [ ] **Step 3: 실패 시 수정 후 커밋**

수정이 있었다면:

```bash
git add -A src
git commit -m "fix: 오늘의 루틴 기능 통합 검증 수정"
```
