# 무게 단위 kg/lb Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 전역 무게 단위(kg/lb) 설정 — 저장은 kg 유지, 입력·표시만 변환.

**Architecture:** `weightUnit.ts` 유틸(변환+반올림) + `fmtWeightDelta` 단위화 + 네 화면의 표시/입력 지점 교체 + 관리 탭 select. 데이터·비교 로직 무변경.

**Tech Stack:** React 18 + TypeScript, vitest

**스펙:** `docs/superpowers/specs/2026-08-03-weight-unit-lb-design.md`

## Global Constraints

- 저장은 항상 kg (`displayToKg` 경유), 표시는 `kgToDisplay` — 계산·비교·백업 로직 무변경
- KG_PER_LB = 0.45359237, 표시 소수 1자리·저장 kg 소수 2자리 반올림
- kg 모드(기본) 출력은 기존과 완전 동일 — 기존 157개 테스트 무변경 통과
- 단위 테스트는 종료 시 `localStorage.removeItem('wt-weight-unit')` 정리
- UI 문구 한국어, 새 npm 의존성 금지
- 테스트 실행: `npx vitest run <파일경로>` (전체는 `npm test`)

---

### Task 1: weightUnit 유틸 + fmtWeightDelta 단위화

**Files:**
- Create: `src/db/weightUnit.ts`
- Modify: `src/db/progress.ts` (fmtWeightDelta)
- Test: `src/db/weightUnit.test.ts` (신규), `src/db/progress.test.ts` (추가)

**Interfaces:**
- Produces (Task 2가 사용): `WeightUnit`, `getWeightUnit()`, `setWeightUnit(u)`, `kgToDisplay(kg): number`, `displayToKg(v): number`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/db/weightUnit.test.ts` 생성:

```ts
import { getWeightUnit, setWeightUnit, kgToDisplay, displayToKg } from './weightUnit';

afterEach(() => {
  localStorage.removeItem('wt-weight-unit');
});

test('기본 단위는 kg이고 토글이 영속된다', () => {
  expect(getWeightUnit()).toBe('kg');
  setWeightUnit('lb');
  expect(getWeightUnit()).toBe('lb');
  setWeightUnit('kg');
  expect(getWeightUnit()).toBe('kg');
});

test('kg 모드 변환은 항등(소수 1자리)', () => {
  expect(kgToDisplay(60)).toBe(60);
  expect(kgToDisplay(20.41)).toBe(20.4);
  expect(displayToKg(62.5)).toBe(62.5);
});

test('lb 왕복: 45lb → 20.41kg → 45lb', () => {
  setWeightUnit('lb');
  const kg = displayToKg(45);
  expect(kg).toBe(20.41);
  expect(kgToDisplay(kg)).toBe(45);
  expect(kgToDisplay(60)).toBe(132.3); // 60kg 표시
});
```

`src/db/progress.test.ts` — import에 `setWeightUnit`(`./weightUnit`) 추가, 파일 끝에:

```ts
test('fmtWeightDelta는 lb 모드에서 파운드로 표시한다', () => {
  setWeightUnit('lb');
  try {
    expect(fmtWeightDelta(62.5, 60)).toBe('🔺 +5.5lb'); // 137.8 - 132.3
    expect(fmtWeightDelta(60, 60)).toBe('➖');
  } finally {
    localStorage.removeItem('wt-weight-unit');
  }
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/db/weightUnit.test.ts src/db/progress.test.ts`
Expected: 새 4개 FAIL (모듈 없음 / kg 하드코딩), 기존 PASS

- [ ] **Step 3: 구현**

`src/db/weightUnit.ts` 생성:

```ts
const KEY = 'wt-weight-unit';

export type WeightUnit = 'kg' | 'lb';

export const KG_PER_LB = 0.45359237;

export function getWeightUnit(): WeightUnit {
  return localStorage.getItem(KEY) === 'lb' ? 'lb' : 'kg';
}

export function setWeightUnit(u: WeightUnit): void {
  localStorage.setItem(KEY, u);
}

// kg 저장값 → 현재 단위 표시값 (소수 1자리)
export function kgToDisplay(kg: number): number {
  const v = getWeightUnit() === 'lb' ? kg / KG_PER_LB : kg;
  return Math.round(v * 10) / 10;
}

// 현재 단위 입력값 → kg 저장값 (소수 2자리 — lb 왕복 보장)
export function displayToKg(v: number): number {
  const kg = getWeightUnit() === 'lb' ? v * KG_PER_LB : v;
  return Math.round(kg * 100) / 100;
}
```

`src/db/progress.ts` — import 추가 `import { getWeightUnit, kgToDisplay } from './weightUnit';`, `fmtWeightDelta`를 다음으로 교체 (화살표는 kg 원값 비교 유지):

```ts
export function fmtWeightDelta(cur: number, prev: number): string {
  if (cur === prev) return '➖';
  const arrowCh = cur > prev ? '🔺' : '🔻';
  const d = Math.round((kgToDisplay(cur) - kgToDisplay(prev)) * 10) / 10;
  return `${arrowCh} ${d > 0 ? '+' : ''}${d}${getWeightUnit()}`;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/db/weightUnit.test.ts src/db/progress.test.ts`
Expected: PASS — kg 모드 기존 fmtWeightDelta 테스트('🔺 +2.5kg' 등)도 그대로 통과

- [ ] **Step 5: 커밋**

```bash
git add src/db/weightUnit.ts src/db/weightUnit.test.ts src/db/progress.ts src/db/progress.test.ts
git commit -m "feat: 무게 단위 유틸(kg/lb)과 증감 표시 단위화"
```

---

### Task 2: 화면 적용 + 관리 탭 설정

**Files:**
- Modify: `src/screens/SessionScreen.tsx`, `src/screens/EditSessionScreen.tsx`, `src/screens/SummaryScreen.tsx`, `src/screens/HistoryScreen.tsx`, `src/screens/ManageScreen.tsx`
- Test: `src/screens/SessionScreen.test.tsx`, `src/screens/SummaryScreen.test.tsx`, `src/screens/ManageScreen.test.tsx` (각 1개 추가)

**Interfaces:**
- Consumes: Task 1의 `getWeightUnit`/`setWeightUnit`/`kgToDisplay`/`displayToKg`/`WeightUnit`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/screens/SessionScreen.test.tsx` — import에 `setWeightUnit`(`../db/weightUnit`) 추가, 파일 끝에:

```tsx
test('lb 모드: 표시는 파운드, 저장은 kg', async () => {
  setWeightUnit('lb');
  try {
    const prev = await startSession(routine);
    prev.entries[0].sets = [{ weight: 60, reps: 10, completedAt: Date.now() }];
    const { finishSession } = await import('../db/sessions');
    await finishSession(prev);

    await startSession(routine);
    renderScreen();
    expect(await screen.findByText(/지난번 132.3lb×10/)).toBeInTheDocument();
    expect(screen.getAllByText('무게(lb)').length).toBeGreaterThan(0);
    const w = screen.getAllByLabelText(/세트 1 무게/)[0] as HTMLInputElement;
    expect(w.value).toBe('132.3');
    fireEvent.change(w, { target: { value: '135' } });
    await waitFor(async () => {
      expect((await getActiveSession())?.entries[0].sets[0].weight).toBeCloseTo(61.23, 2);
    });
  } finally {
    localStorage.removeItem('wt-weight-unit');
  }
});
```

`src/screens/SummaryScreen.test.tsx` — import에 `setWeightUnit` 추가, 파일 끝에:

```tsx
test('lb 모드: 요약 볼륨·최고가 파운드로 표시된다', async () => {
  setWeightUnit('lb');
  try {
    const cur = await addFinishedSession(1000, 'lib-bench-press', [{ weight: 60, reps: 10 }]);
    renderAt(`/summary/${cur.id}`);
    // 볼륨 600kg → 1322.8lb, 최고 60kg → 132.3lb
    expect(await screen.findByText('볼륨 1322.8lb · 최고 132.3lb · 첫 기록')).toBeInTheDocument();
  } finally {
    localStorage.removeItem('wt-weight-unit');
  }
});
```

`src/screens/ManageScreen.test.tsx` — import에 `getWeightUnit`(`../db/weightUnit`) 추가, 파일 끝에:

```tsx
test('설정에서 무게 단위를 lb로 바꿀 수 있다', async () => {
  try {
    render(<MemoryRouter><ManageScreen /></MemoryRouter>);
    fireEvent.change(await screen.findByLabelText('무게 단위'), { target: { value: 'lb' } });
    expect(getWeightUnit()).toBe('lb');
  } finally {
    localStorage.removeItem('wt-weight-unit');
  }
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/screens/SessionScreen.test.tsx src/screens/SummaryScreen.test.tsx src/screens/ManageScreen.test.tsx`
Expected: 새 3개 FAIL, 기존 PASS

- [ ] **Step 3: 구현**

**`src/screens/SessionScreen.tsx`** — import 추가:

```tsx
import { getWeightUnit, kgToDisplay, displayToKg } from '../db/weightUnit';
```

`fmtLast`를 단위 인지로 교체:

```tsx
function fmtLast(sets: SetRecord[]): string {
  const unit = getWeightUnit();
  return sets
    .map((s, i) => (i === 0 ? `${kgToDisplay(s.weight)}${unit}×${s.reps}` : `${kgToDisplay(s.weight)}×${s.reps}`))
    .join(' · ');
}
```

그룹 렌더 안 계산부의 `overloadText`를 다음으로 교체 (unit은 렌더 상단에서 `const unit = getWeightUnit();` 1회):

```tsx
const overloadText = curVol > lastVol
  ? `볼륨 ${kgToDisplay(curVol)}${unit} ${fmtVolumeDelta(curVol, lastVol)}`
  : `볼륨 ${kgToDisplay(curVol)} / 지난 ${kgToDisplay(lastVol)}${unit}`;
```

set-head의 `<span>무게(kg)</span>` → `<span>무게({unit})</span>`.

무게 input을 다음으로 교체:

```tsx
<input
  type="number" inputMode="decimal" step={unit === 'lb' ? 2.5 : 0.5} min="0"
  aria-label={`세트 ${j + 1} 무게`}
  value={s.weight === 0 ? '' : kgToDisplay(s.weight)}
  placeholder="0"
  onFocus={(ev) => ev.currentTarget.select()}
  onChange={(ev) => patchSet(entryIdx, j, { weight: displayToKg(Number(ev.target.value) || 0) })}
/>
```

**`src/screens/EditSessionScreen.tsx`** — import 추가(위와 동일), 컴포넌트 렌더 상단에 `const unit = getWeightUnit();`, 무게 input을 동일 패턴으로 교체 (value=kgToDisplay, onChange=displayToKg, step 동적).

**`src/screens/SummaryScreen.tsx`** — import 추가 `import { getWeightUnit, kgToDisplay } from '../db/weightUnit';`, 렌더 상단 `const unit = getWeightUnit();`, line 계산을:

```tsx
const line = p.prevVolume === undefined
  ? `볼륨 ${kgToDisplay(p.volume)}${unit} · 최고 ${kgToDisplay(p.maxWeight)}${unit} · 첫 기록`
  : `볼륨 ${kgToDisplay(p.volume)}${unit} ${fmtVolumeDelta(p.volume, p.prevVolume)} · 최고 ${kgToDisplay(p.maxWeight)}${unit} ${fmtWeightDelta(p.maxWeight, p.prevMaxWeight ?? 0)}`;
```

**`src/screens/HistoryScreen.tsx`** — import 추가(위와 동일), `fmtSets`를:

```tsx
function fmtSets(sets: SetRecord[]): string {
  return sets.map((s) => `${kgToDisplay(s.weight)}×${s.reps}`).join(', ');
}
```

운동별 보기 line과 세션 상세 line의 `볼륨 ${...}kg`/`최고 ${...}kg`을 `볼륨 ${kgToDisplay(...)}${unit}`/`최고 ${kgToDisplay(...)}${unit}`으로 교체 (컴포넌트 상단 `const unit = getWeightUnit();`).

**`src/screens/ManageScreen.tsx`** — import 추가 `import { getWeightUnit, setWeightUnit } from '../db/weightUnit'; import type { WeightUnit } from '../db/weightUnit';`, state `const [unit, setUnit] = useState<WeightUnit>(getWeightUnit());`, 설정 카드의 휴식 시간 field 아래에:

```tsx
<div className="field">
  <label htmlFor="weight-unit">무게 단위</label>
  <select
    id="weight-unit" value={unit}
    onChange={(e) => {
      const u = e.target.value as WeightUnit;
      setUnit(u);
      setWeightUnit(u);
    }}
  >
    <option value="kg">kg</option>
    <option value="lb">lb</option>
  </select>
</div>
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/screens/SessionScreen.test.tsx src/screens/SummaryScreen.test.tsx src/screens/ManageScreen.test.tsx src/screens/HistoryScreen.test.tsx src/screens/EditSessionScreen.test.tsx`
Expected: 전부 PASS — kg 기본이라 기존 테스트 문자열('60kg', '볼륨 600kg' 등) 그대로 통과해야 함. 깨지면 원인 분석 후 보고

- [ ] **Step 5: 커밋**

```bash
git add src/screens/SessionScreen.tsx src/screens/SessionScreen.test.tsx src/screens/EditSessionScreen.tsx src/screens/SummaryScreen.tsx src/screens/SummaryScreen.test.tsx src/screens/HistoryScreen.tsx src/screens/ManageScreen.tsx src/screens/ManageScreen.test.tsx
git commit -m "feat: 무게 단위 lb 지원 — 입력·표시 변환, 관리 탭 설정"
```

---

### Task 3: 전체 검증

- [ ] **Step 1:** `npm test` → 전체 PASS (기존 157 + 신규 7 = 164)
- [ ] **Step 2:** `npm run build` → 에러 없음
- [ ] **Step 3:** 실패 시 수정 후 `git add -A src && git commit -m "fix: 무게 단위 통합 검증 수정"`
