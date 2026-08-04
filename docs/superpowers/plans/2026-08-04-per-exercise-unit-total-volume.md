# 운동별 kg/lb 단위 + 세션 총볼륨 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 운동마다 기록 단위(kg/lb)를 세션 화면 토글로 지정하고, lb 표시에는 항상 kg 병기, 완료 세션에는 전체 총볼륨(kg)을 표시한다.

**Architecture:** `Exercise.unit?: 'kg'|'lb'` 선택 필드(스키마 변경 없음) + `weightUnit.ts` 단위 파라미터화(`unitFor`/`fmtWeightCell`/`fmtWeightLabel`). 저장은 항상 kg 불변 — 단위는 표시 속성. 총볼륨은 `summarizeSession` 결과의 volume 합(원본 kg).

**Tech Stack:** React 18 + TypeScript, Dexie, vitest

**스펙:** `docs/superpowers/specs/2026-08-04-per-exercise-unit-total-volume-design.md`

## Global Constraints

- 저장 무게는 항상 kg(소수 2자리), 증감·PR 비교는 원본 kg — 불변
- 유효 단위 = `운동.unit ?? 전역 설정`; 삭제된 운동(exMap miss)은 전역 단위
- lb로 **표시**되는 곳(운동별이든 전역이든)은 kg 병기: 셀 `132.3 (60kg)`, 라벨 `132.3lb (60kg)`. 예외: 세션 라이브 화면 pill·`fmtSets` 컴팩트 목록·`fmtWeightDelta` 증감치는 환산만
- 총볼륨은 항상 kg
- Dexie store 스키마(인덱스) 변경 금지 — 선택 필드만
- 기존 전역 kg 테스트 무변경 통과, 전역 lb 테스트는 병기 형식으로만 갱신
- UI 문구 한국어, 새 npm 의존성 금지
- 테스트 실행: `npx vitest run <파일경로>` (전체는 `npm test`, 현재 168개)

---

### Task 1: 코어 — Exercise.unit + 단위 헬퍼 + fmtWeightDelta 파라미터

**Files:**
- Modify: `src/types.ts`, `src/db/weightUnit.ts`, `src/db/progress.ts`, `src/db/exercises.ts`
- Test: `src/db/weightUnit.test.ts`, `src/db/progress.test.ts`, `src/db/exercises.test.ts`, `src/db/backup.test.ts`

**Interfaces (Produces — 이후 모든 Task가 사용):**
- `Exercise.unit?: 'kg' | 'lb'`
- `kgToDisplay(kg: number, unit?: WeightUnit): number` / `displayToKg(v: number, unit?: WeightUnit): number` — unit 생략 시 전역 설정(기존 호출부 호환)
- `unitFor(ex?: { unit?: WeightUnit }): WeightUnit`
- `fmtWeightCell(kg: number, unit: WeightUnit): string` — `'60'` / `'132.3 (60kg)'`
- `fmtWeightLabel(kg: number, unit: WeightUnit): string` — `'60kg'` / `'132.3lb (60kg)'`
- `fmtWeightDelta(cur: number, prev: number, unit?: WeightUnit): string`
- `setExerciseUnit(id: string, unit: WeightUnit): Promise<void>`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/db/weightUnit.test.ts` 끝에 추가 (import에 `unitFor, fmtWeightCell, fmtWeightLabel` 추가):

```ts
test('명시 단위 파라미터는 전역 설정과 무관하게 변환한다', () => {
  expect(kgToDisplay(60, 'lb')).toBe(132.3);
  expect(kgToDisplay(60, 'kg')).toBe(60);
  expect(displayToKg(135, 'lb')).toBe(61.23); // 135 × 0.45359237 = 61.2350 → 소수 2자리
  setWeightUnit('lb');
  try {
    expect(kgToDisplay(60, 'kg')).toBe(60); // 전역 lb여도 명시 kg 우선
    expect(displayToKg(60, 'kg')).toBe(60);
  } finally {
    localStorage.removeItem('wt-weight-unit');
  }
});

test('unitFor: 운동별 단위가 있으면 우선, 없으면 전역 설정', () => {
  expect(unitFor({ unit: 'lb' })).toBe('lb');
  expect(unitFor({})).toBe('kg');
  expect(unitFor(undefined)).toBe('kg');
  setWeightUnit('lb');
  try {
    expect(unitFor({})).toBe('lb');
    expect(unitFor({ unit: 'kg' })).toBe('kg');
  } finally {
    localStorage.removeItem('wt-weight-unit');
  }
});

test('fmtWeightCell/fmtWeightLabel: lb면 kg 병기', () => {
  expect(fmtWeightCell(60, 'kg')).toBe('60');
  expect(fmtWeightCell(60, 'lb')).toBe('132.3 (60kg)');
  expect(fmtWeightLabel(60, 'kg')).toBe('60kg');
  expect(fmtWeightLabel(60, 'lb')).toBe('132.3lb (60kg)');
  expect(fmtWeightLabel(600, 'lb')).toBe('1322.8lb (600kg)');
});
```

`src/db/progress.test.ts` 끝에 추가:

```ts
test('fmtWeightDelta: 단위 파라미터로 표시 단위를 바꾼다 (판정은 원본 kg)', () => {
  expect(fmtWeightDelta(62.5, 60, 'lb')).toBe('🔺 +5.5lb'); // 137.8 - 132.3
  expect(fmtWeightDelta(62.5, 60, 'kg')).toBe('🔺 +2.5kg');
  expect(fmtWeightDelta(60, 60, 'lb')).toBe('➖');
});
```

`src/db/exercises.test.ts` 끝에 추가 (import에 `setExerciseUnit`, `LIBRARY_VERSION` 필요분 추가):

```ts
test('setExerciseUnit이 단위를 저장하고 seedLibrary 재동기화에도 보존된다', async () => {
  await seedLibrary();
  await setExerciseUnit('lib-bench-press', 'lb');
  expect((await db.exercises.get('lib-bench-press'))?.unit).toBe('lb');
  // 이름을 어긋나게 만들어 동기화(bulkPut) 경로를 강제로 태운다
  await db.exercises.update('lib-bench-press', { name: '변조' });
  await db.meta.put({ key: 'libraryVersion', value: 0 });
  await seedLibrary();
  const ex = await db.exercises.get('lib-bench-press');
  expect(ex?.name).toBe('벤치프레스');
  expect(ex?.unit).toBe('lb'); // 동기화가 unit을 지우지 않음
});
```

`src/db/backup.test.ts` 끝에 추가 (해당 파일의 기존 export/import 헬퍼·패턴 재사용):

```ts
test('운동별 단위(unit)가 백업 왕복에서 보존된다', async () => {
  await seedLibrary();
  await setExerciseUnit('lib-bench-press', 'lb');
  const dump = await exportData();
  await db.delete();
  await db.open();
  await importData(dump);
  expect((await db.exercises.get('lib-bench-press'))?.unit).toBe('lb');
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/db/weightUnit.test.ts src/db/progress.test.ts src/db/exercises.test.ts src/db/backup.test.ts`
Expected: 신규 6개 FAIL (unitFor 등 미정의 / setExerciseUnit 미정의), 기존 PASS

- [ ] **Step 3: 구현**

`src/types.ts` — `Exercise`의 `isFavorite?: boolean;` 아래에 추가:

```ts
  unit?: 'kg' | 'lb';    // 이 운동의 기록/표시 단위 — 없으면 전역 설정
```

`src/db/weightUnit.ts` — 전체를 다음으로 교체:

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

// 운동별 단위 — 지정 없거나 삭제된 운동이면 전역 설정
export function unitFor(ex?: { unit?: WeightUnit }): WeightUnit {
  return ex?.unit ?? getWeightUnit();
}

// kg 저장값 → 단위 표시값 (소수 1자리). unit 생략 시 전역 설정
export function kgToDisplay(kg: number, unit: WeightUnit = getWeightUnit()): number {
  const v = unit === 'lb' ? kg / KG_PER_LB : kg;
  return Math.round(v * 10) / 10;
}

// 단위 입력값 → kg 저장값 (소수 2자리 — lb 왕복 보장). unit 생략 시 전역 설정
export function displayToKg(v: number, unit: WeightUnit = getWeightUnit()): number {
  const kg = unit === 'lb' ? v * KG_PER_LB : v;
  return Math.round(kg * 100) / 100;
}

// 세트 표 셀: lb면 kg 환산 병기
export function fmtWeightCell(kg: number, unit: WeightUnit): string {
  const v = kgToDisplay(kg, unit);
  return unit === 'lb' ? `${v} (${kgToDisplay(kg, 'kg')}kg)` : `${v}`;
}

// 요약 줄 라벨: 단위 접미사 포함, lb면 kg 병기
export function fmtWeightLabel(kg: number, unit: WeightUnit): string {
  const v = kgToDisplay(kg, unit);
  return unit === 'lb' ? `${v}lb (${kgToDisplay(kg, 'kg')}kg)` : `${v}kg`;
}
```

`src/db/progress.ts` — import를 `import { getWeightUnit, kgToDisplay, type WeightUnit } from './weightUnit';`로 바꾸고 `fmtWeightDelta`를 교체:

```ts
export function fmtWeightDelta(
  cur: number, prev: number, unit: WeightUnit = getWeightUnit(),
): string {
  if (cur === prev) return '➖';
  const arrowCh = cur > prev ? '🔺' : '🔻';
  const d = Math.round((kgToDisplay(cur, unit) - kgToDisplay(prev, unit)) * 10) / 10;
  return `${arrowCh} ${d > 0 ? '+' : ''}${d}${unit}`;
}
```

`src/db/exercises.ts` — import에 `import type { WeightUnit } from './weightUnit';` 추가, `setExerciseFavorite` 아래에:

```ts
export async function setExerciseUnit(id: string, unit: WeightUnit): Promise<void> {
  await db.exercises.update(id, { unit });
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/db/weightUnit.test.ts src/db/progress.test.ts src/db/exercises.test.ts src/db/backup.test.ts`
Expected: 전부 PASS. 이어서 `npm test` 전체 PASS(168 + 6 = 174) — 기본값 파라미터라 기존 호출부 무영향 확인.

- [ ] **Step 5: 커밋**

```bash
git add src/types.ts src/db/weightUnit.ts src/db/progress.ts src/db/exercises.ts src/db/weightUnit.test.ts src/db/progress.test.ts src/db/exercises.test.ts src/db/backup.test.ts
git commit -m "feat: Exercise.unit 선택 필드와 단위 파라미터 헬퍼(unitFor·병기 포매터)"
```

---

### Task 2: 세션 화면 — 운동별 단위 토글 + 카드 단위 입력

**Files:**
- Modify: `src/screens/SessionScreen.tsx`
- Test: `src/screens/SessionScreen.test.tsx` (1개 추가)

**Interfaces:**
- Consumes (Task 1): `unitFor`, `kgToDisplay(kg, unit)`, `displayToKg(v, unit)`, `setExerciseUnit`, `WeightUnit`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/screens/SessionScreen.test.tsx` 파일 끝에 추가:

```tsx
test('단위 토글: 운동별 lb로 저장되고 표시·입력이 파운드로 바뀐다', async () => {
  const prev = await startSession(routine);
  prev.entries[0].sets = [{ weight: 60, reps: 10, completedAt: Date.now() }];
  const { finishSession } = await import('../db/sessions');
  await finishSession(prev);

  await startSession(routine);
  renderScreen();
  await screen.findByText(/지난번 60kg×10/);
  fireEvent.click(screen.getByRole('button', { name: '벤치프레스 단위 전환' }));
  expect(await screen.findByText(/지난번 132.3lb×10/)).toBeInTheDocument();
  expect(screen.getByText('무게(lb)')).toBeInTheDocument();
  expect((screen.getByLabelText('세트 1 무게') as HTMLInputElement).value).toBe('132.3'); // 프리필 60kg → lb
  expect((await db.exercises.get('lib-bench-press'))?.unit).toBe('lb');
  // 단위 미지정 운동(스쿼트)은 전역 kg 유지
  fireEvent.click(screen.getByRole('button', { name: '다음 운동' }));
  expect(await screen.findByText('무게(kg)')).toBeInTheDocument();
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/screens/SessionScreen.test.tsx`
Expected: 신규 1개 FAIL (단위 전환 버튼 없음), 기존 PASS

- [ ] **Step 3: 구현**

`src/screens/SessionScreen.tsx`:

- import 변경: `import { kgToDisplay, displayToKg, unitFor, type WeightUnit } from '../db/weightUnit';` (getWeightUnit 제거), `listExercises` import 줄을 `import { listExercises, setExerciseUnit } from '../db/exercises';`로
- `fmtLast`에 unit 파라미터 추가:

```ts
function fmtLast(sets: SetRecord[], unit: WeightUnit): string {
  return sets
    .map((s, i) => (i === 0 ? `${kgToDisplay(s.weight, unit)}${unit}×${s.reps}` : `${kgToDisplay(s.weight, unit)}×${s.reps}`))
    .join(' · ');
}
```

- 컴포넌트의 `const unit = getWeightUnit();` 줄 삭제
- `group.map((entryIdx) => {` 본문 최상단(`const e = ...` 아래 `const gex = ...` 다음)에 `const u = unitFor(gex);` 추가
- 카드 내 표시를 u 기준으로 교체:
  - `overloadText`:

```ts
const overloadText = curVol > lastVol
  ? `볼륨 ${kgToDisplay(curVol, u)}${u} ${fmtVolumeDelta(curVol, lastVol)}`
  : `볼륨 ${kgToDisplay(curVol, u)} / 지난 ${kgToDisplay(lastVol, u)}${u}`;
```

  - 지난번 pill: `{fmtLast(rec.last, u)}`
  - set-head: `<span>세트</span><span>무게({u})</span><span>횟수</span><span>완료</span>`
  - 무게 input: `step={u === 'lb' ? 2.5 : 0.5}`, `value={s.weight === 0 ? '' : kgToDisplay(s.weight, u)}`, `onChange={(ev) => patchSet(entryIdx, j, { weight: displayToKg(Number(ev.target.value) || 0, u) })}`
- `.tags` 줄의 `운동 빼기` 버튼 **앞**에 토글 추가하고, 기존 `운동 빼기` 버튼의 `style={{ marginLeft: 'auto' }}`는 토글로 이동:

```tsx
{gex && (
  <button
    className="btn-sm btn btn-ghost" style={{ marginLeft: 'auto' }}
    aria-label={`${gex.name} 단위 전환`}
    onClick={() => void setExerciseUnit(gex.id, u === 'kg' ? 'lb' : 'kg')}
  >
    {u} ⇄
  </button>
)}
<button
  className="btn-sm btn btn-ghost"
  style={gex ? undefined : { marginLeft: 'auto' }}
  onClick={() => removeEntry(entryIdx)}
>
  운동 빼기
</button>
```

(useLiveQuery가 exercises를 다시 읽어 exMap → `gex.unit` → `u`가 즉시 갱신됨. 삭제된 운동은 토글이 없고 전역 단위로 표시)

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/screens/SessionScreen.test.tsx`
Expected: 전부 PASS — 특히 기존 `lb 모드: 표시는 파운드, 저장은 kg`(전역 lb, 라이브 화면은 병기 없음이라 무변경) 포함

- [ ] **Step 5: 커밋**

```bash
git add src/screens/SessionScreen.tsx src/screens/SessionScreen.test.tsx
git commit -m "feat: 세션 화면 운동별 kg/lb 토글 — 입력·pill·표 헤더가 운동 단위를 따름"
```

---

### Task 3: SessionDetails + 요약 화면 — 병기 표시 + 세션 총볼륨

**Files:**
- Modify: `src/components/SessionDetails.tsx`, `src/screens/SummaryScreen.tsx`
- Test: `src/screens/HistoryScreen.test.tsx` (lb 테스트 1개 갱신 + 2개 추가), `src/screens/SummaryScreen.test.tsx` (lb 테스트 1개 갱신 + 1개 추가)

**Interfaces:**
- Consumes (Task 1): `unitFor`, `kgToDisplay(kg, 'kg')`, `fmtWeightCell`, `fmtWeightLabel`, `fmtWeightDelta(cur, prev, unit)`

- [ ] **Step 1: 테스트 갱신·추가**

`src/screens/HistoryScreen.test.tsx` — 기존 `'lb 모드: 세트 표가 파운드로 표시된다'`의 `expect(screen.getByText('132.3')).toBeInTheDocument();`를 다음으로 교체:

```tsx
    expect(screen.getByText('132.3 (60kg)')).toBeInTheDocument(); // 전역 lb도 kg 병기
```

파일 끝에 추가:

```tsx
test('운동별 단위 lb: 전역 kg여도 그 운동만 lb + kg 병기로 표시된다', async () => {
  await db.exercises.update('lib-bench-press', { unit: 'lb' });
  await addFinishedSession(1000, 'lib-bench-press', [{ weight: 60, reps: 10 }]);
  renderScreen();
  fireEvent.click(await screen.findByText(/1개 운동/));
  expect(await screen.findByText('무게(lb)')).toBeInTheDocument();
  expect(screen.getByText('132.3 (60kg)')).toBeInTheDocument();
  expect(screen.getByText('볼륨 1322.8lb (600kg) · 최고 132.3lb (60kg) · 첫 기록')).toBeInTheDocument();
});

test('펼침 상세에 세션 총볼륨이 kg으로 표시된다', async () => {
  const s: Session = {
    id: crypto.randomUUID(),
    startedAt: 1000,
    finishedAt: 3600_000,
    entries: [
      { exerciseId: 'lib-bench-press', sets: [{ weight: 60, reps: 10, completedAt: 1001 }] },
      { exerciseId: 'lib-squat', sets: [{ weight: 100, reps: 5, completedAt: 1001 }] },
    ],
  };
  await db.sessions.add(s);
  renderScreen();
  fireEvent.click(await screen.findByText(/2개 운동/));
  expect(await screen.findByText('총볼륨 1100kg')).toBeInTheDocument(); // 600 + 500
});
```

`src/screens/SummaryScreen.test.tsx` — 기존 `'lb 모드: 요약 볼륨·최고가 파운드로 표시된다'`의 단언을 다음으로 교체:

```tsx
    expect(await screen.findByText('볼륨 1322.8lb (600kg) · 최고 132.3lb (60kg) · 첫 기록')).toBeInTheDocument();
```

파일 끝에 추가:

```tsx
test('요약 화면에 세션 총볼륨이 kg으로 표시된다', async () => {
  const s: Session = {
    id: crypto.randomUUID(),
    startedAt: 1000,
    finishedAt: 3600_000,
    entries: [
      { exerciseId: 'lib-bench-press', sets: [{ weight: 60, reps: 10, completedAt: 1001 }] },
      { exerciseId: 'lib-squat', sets: [{ weight: 100, reps: 5, completedAt: 1001 }] },
    ],
  };
  await db.sessions.add(s);
  renderAt(`/summary/${s.id}`);
  expect(await screen.findByText('총볼륨 1100kg')).toBeInTheDocument();
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/screens/HistoryScreen.test.tsx src/screens/SummaryScreen.test.tsx`
Expected: 갱신 2 + 신규 3 FAIL (병기·총볼륨 없음), 나머지 PASS

- [ ] **Step 3: 구현**

`src/components/SessionDetails.tsx` — 전체를 다음으로 교체:

```tsx
import { useEffect, useState } from 'react';
import type { Exercise, Session } from '../types';
import {
  fmtVolumeDelta, fmtWeightDelta, summarizeSession, type EntryProgress,
} from '../db/progress';
import { fmtWeightCell, fmtWeightLabel, kgToDisplay, unitFor } from '../db/weightUnit';

// 완료 세션의 운동별 세트 표 + 증감·PR 요약 + 총볼륨 (기록 탭·홈 달력 공용).
// 무게는 운동별 단위(unitFor)로 표시하되 lb면 kg 병기, 총볼륨은 항상 원본 kg.
// 요약은 마운트 단위로 로드 — 세션 전환 시 재마운트되므로 잔상/race 없음.
// 소비처 계약: 세션마다 재마운트되도록 렌더할 것(조건부 렌더 또는 key={session.id}) — 재마운트가 이전 세션 요약의 잔상 표시를 방지한다.
export default function SessionDetails({
  session, exMap,
}: {
  session: Session;
  exMap: Map<string, Exercise>;
}) {
  const [summaries, setSummaries] = useState<EntryProgress[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void summarizeSession(session).then((list) => {
      if (!cancelled) setSummaries(list);
    });
    return () => {
      cancelled = true;
    };
  }, [session.id]);

  return (
    <>
      {session.entries.map((e, i) => {
        const p = summaries?.[i];
        const u = unitFor(exMap.get(e.exerciseId));
        const line = p
          ? (p.prevVolume === undefined
              ? `볼륨 ${fmtWeightLabel(p.volume, u)} · 최고 ${fmtWeightLabel(p.maxWeight, u)} · 첫 기록`
              : `볼륨 ${fmtWeightLabel(p.volume, u)} ${fmtVolumeDelta(p.volume, p.prevVolume)} · 최고 ${fmtWeightLabel(p.maxWeight, u)} ${fmtWeightDelta(p.maxWeight, p.prevMaxWeight ?? 0, u)}`)
          : null;
        return (
          <div key={i} className="hist-row" style={{ display: 'block' }}>
            <div style={{ fontWeight: 700 }}>
              {exMap.get(e.exerciseId)?.name ?? '삭제된 운동'}{p?.isPR ? ' 🏆' : ''}
            </div>
            <div className="set-view d" style={{ marginTop: 6 }}>
              <span>세트</span><span>무게({u})</span><span>횟수</span>
            </div>
            {e.sets.map((set, j) => (
              <div key={j} className="set-view" style={{ marginTop: 4 }}>
                <span className="d">{j + 1}</span>
                <span>{fmtWeightCell(set.weight, u)}</span>
                <span>{set.reps}</span>
              </div>
            ))}
            {line && <div className="d" style={{ fontSize: 12, marginTop: 6 }}>{line}</div>}
          </div>
        );
      })}
      {summaries && (
        <div style={{ fontWeight: 700, marginTop: 8 }}>
          총볼륨 {kgToDisplay(summaries.reduce((sum, p) => sum + p.volume, 0), 'kg')}kg
        </div>
      )}
    </>
  );
}
```

`src/screens/SummaryScreen.tsx`:

- import 변경: `import { fmtWeightLabel, kgToDisplay, unitFor } from '../db/weightUnit';` (getWeightUnit, 기존 kgToDisplay 단독 사용 제거)
- `const unit = getWeightUnit();` 줄 삭제
- card-h 바로 아래(entries.map 위)에 총볼륨 줄 추가:

```tsx
<div style={{ fontWeight: 800, marginBottom: 8 }}>
  총볼륨 {kgToDisplay(progress.reduce((sum, p) => sum + p.volume, 0), 'kg')}kg
</div>
```

- `session.entries.map((e, i) => {` 본문에서 `const p = progress[i];` 아래에 `const u = unitFor(exMap.get(e.exerciseId));` 추가, `line`을 교체:

```tsx
const line = p.prevVolume === undefined
  ? `볼륨 ${fmtWeightLabel(p.volume, u)} · 최고 ${fmtWeightLabel(p.maxWeight, u)} · 첫 기록`
  : `볼륨 ${fmtWeightLabel(p.volume, u)} ${fmtVolumeDelta(p.volume, p.prevVolume)} · 최고 ${fmtWeightLabel(p.maxWeight, u)} ${fmtWeightDelta(p.maxWeight, p.prevMaxWeight ?? 0, u)}`;
```

(progress가 빈 배열인 로드 직전 프레임엔 `if (!session) return null` + p null 가드가 기존과 동일하게 동작. 총볼륨 줄은 progress 합이 0이어도 표시돼도 무방 — session 로드와 progress 세팅이 같은 setState 흐름이라 실제로는 동시 표시)

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/screens/HistoryScreen.test.tsx src/screens/SummaryScreen.test.tsx src/screens/HomeScreen.test.tsx`
Expected: 전부 PASS (HomeScreen은 SessionDetails 공유 소비처 — 총볼륨 줄 추가로 깨지지 않는지 확인)

- [ ] **Step 5: 커밋**

```bash
git add src/components/SessionDetails.tsx src/screens/SummaryScreen.tsx src/screens/HistoryScreen.test.tsx src/screens/SummaryScreen.test.tsx
git commit -m "feat: 세트 표·요약 lb+kg 병기, 세션 총볼륨(kg) 표시 — 기록·홈·요약 공통"
```

---

### Task 4: 편집 화면 + 기록 탭 운동별 보기 — 운동 단위 적용

**Files:**
- Modify: `src/screens/EditSessionScreen.tsx`, `src/screens/HistoryScreen.tsx`
- Test: `src/screens/EditSessionScreen.test.tsx` (1개 추가), `src/screens/HistoryScreen.test.tsx` (1개 추가)

**Interfaces:**
- Consumes (Task 1): `unitFor`, `kgToDisplay(kg, unit)`, `displayToKg(v, unit)`, `fmtWeightLabel`, `fmtWeightDelta(cur, prev, unit)`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/screens/EditSessionScreen.test.tsx` 파일 끝에 추가:

```tsx
test('운동별 단위 lb: 편집 무게 입력이 파운드로 표시되고 kg으로 저장된다', async () => {
  await db.exercises.update('lib-bench-press', { unit: 'lb' });
  const s = await addFinishedSession(1000, ['lib-bench-press'], 60);
  renderAt(`/edit/${s.id}`);
  await screen.findByText('벤치프레스');
  await waitFor(() => {
    expect((screen.getByLabelText('세트 1 무게') as HTMLInputElement).value).toBe('132.3');
  });
  fireEvent.change(screen.getByLabelText('세트 1 무게'), { target: { value: '135' } });
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  await screen.findByText('요약화면');
  expect((await db.sessions.get(s.id))?.entries[0].sets[0].weight).toBeCloseTo(61.23, 2);
});
```

`src/screens/HistoryScreen.test.tsx` 파일 끝에 추가:

```tsx
test('운동별로 보기: lb 운동은 파운드 세트 목록 + 병기 요약으로 표시된다', async () => {
  await db.exercises.update('lib-bench-press', { unit: 'lb' });
  await addFinishedSession(1000, 'lib-bench-press', [{ weight: 60, reps: 10 }]);
  renderScreen();
  const select = await screen.findByLabelText('운동별로 보기');
  await screen.findByRole('option', { name: '벤치프레스' });
  fireEvent.change(select, { target: { value: 'lib-bench-press' } });
  expect(await screen.findByText('132.3×10')).toBeInTheDocument(); // fmtSets는 환산만
  expect(screen.getByText('볼륨 1322.8lb (600kg) · 첫 기록')).toBeInTheDocument();
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/screens/EditSessionScreen.test.tsx src/screens/HistoryScreen.test.tsx`
Expected: 신규 2개 FAIL (전역 kg으로 표시됨), 기존 PASS

- [ ] **Step 3: 구현**

`src/screens/EditSessionScreen.tsx`:

- import 변경: `import { kgToDisplay, displayToKg, unitFor } from '../db/weightUnit';` (getWeightUnit 제거)
- `const unit = getWeightUnit();` 줄 삭제
- `{entries.map((e, i) => (` 을 문 본문 형태로 바꿔 `const u = unitFor(exMap.get(e.exerciseId));`를 계산: `{entries.map((e, i) => { const u = unitFor(exMap.get(e.exerciseId)); return ( ... ); })}`
- 무게 input을 u 기준으로: `step={u === 'lb' ? 2.5 : 0.5}`, `value={s.weight === 0 ? '' : kgToDisplay(s.weight, u)}`, `onChange={(ev) => patchSet(i, j, { weight: displayToKg(Number(ev.target.value) || 0, u) })}`

`src/screens/HistoryScreen.tsx`:

- import 변경: `import { kgToDisplay, unitFor, fmtWeightLabel, type WeightUnit } from '../db/weightUnit';` (getWeightUnit 제거)
- `fmtSets`에 unit 파라미터 추가:

```ts
function fmtSets(sets: SetRecord[], unit: WeightUnit): string {
  return sets.map((s) => `${kgToDisplay(s.weight, unit)}×${s.reps}`).join(', ');
}
```

- `const unit = getWeightUnit();` 줄을 `const filterUnit = unitFor(exMap.get(filterId));`로 교체 (exMap 선언 아래)
- 운동별 보기 블록에서:
  - `line`을 교체:

```ts
const line = a.prevVolume === undefined
  ? `볼륨 ${fmtWeightLabel(a.volume, filterUnit)} · 첫 기록`
  : `볼륨 ${fmtWeightLabel(a.volume, filterUnit)} ${fmtVolumeDelta(a.volume, a.prevVolume)} · 최고 ${fmtWeightLabel(a.maxWeight, filterUnit)} ${fmtWeightDelta(a.maxWeight, a.prevMaxWeight ?? 0, filterUnit)}`;
```

  - `{fmtSets(sets)}` → `{fmtSets(sets, filterUnit)}`

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/screens/EditSessionScreen.test.tsx src/screens/HistoryScreen.test.tsx`
Expected: 전부 PASS (기존 kg 테스트 무변경 — `fmtWeightLabel(600, 'kg')` = `'600kg'`으로 문자열 동일)

- [ ] **Step 5: 커밋**

```bash
git add src/screens/EditSessionScreen.tsx src/screens/HistoryScreen.tsx src/screens/EditSessionScreen.test.tsx src/screens/HistoryScreen.test.tsx
git commit -m "feat: 편집 화면·운동별 보기도 운동 단위 적용 — lb 병기 규칙 통일"
```

---

### Task 5: 전체 검증

- [ ] **Step 1:** `npm test` → 전체 PASS (168 기존 + 신규 12 = 180, 갱신 3 포함)
- [ ] **Step 2:** `npm run build` → 에러 없음
- [ ] **Step 3:** 실패 시 수정 후 `git add -A src && git commit -m "fix: 운동별 단위 통합 검증 수정"`
