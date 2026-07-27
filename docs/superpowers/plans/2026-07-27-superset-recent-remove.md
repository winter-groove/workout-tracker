# 슈퍼세트·최근 운동 상위·운동 빼기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 세션 화면에 슈퍼세트 묶기(한 화면 다중 운동)와 운동 빼기를 추가하고, picker에 "최근 한 운동" 구간(최근순+마지막 수행일)을 추가한다.

**Architecture:** `SessionEntry.pairedWithNext?: boolean`(선택 필드, 스토어 무변경)로 연속 entry를 그룹핑(`groupsOf`). SessionScreen을 그룹 렌더로 재구성 — 세트 조작은 entryIdx 명시, 지난기록은 그룹 운동별 맵 로드(매초 재조회 금지 불변식 유지). picker는 `getLastDoneMap`으로 두 구간 분할.

**Tech Stack:** React 18 + TypeScript, Dexie, vitest + @testing-library/react + fake-indexeddb

**스펙:** `docs/superpowers/specs/2026-07-27-superset-recent-remove-design.md`

## Global Constraints

- Dexie 스토어/인덱스 변경 금지 (`SessionEntry`에 optional 필드 추가만 — 백업 하위 호환), 새 npm 의존성 금지, UI 문구 한국어
- 지난기록 로드 effect의 deps에 매초 갱신되는 `now` 금지 — 기존 spy 회귀 테스트('시간이 흘러도 … 다시 조회하지 않는다') 통과 필수. 비교 기준은 기존과 동일 `session.startedAt + 1`
- 기존 SessionScreen 테스트 15개·ExercisePicker 테스트 6개 무변경 통과 (aria-label·문구 구조 유지)
- 운동 빼기 confirm 문구: `완료한 세트가 있어요. 이 운동을 뺄까요?` (완료 세트 있을 때만)
- 묶임 정리 규칙: 그룹 **마지막** entry 제거 시 직전 entry의 flag 해제, **중간** 제거 시 유지(그룹 축소)
- 테스트 실행: `npx vitest run <파일경로>` (전체는 `npm test`)

---

### Task 1: pairedWithNext 타입 + getLastDoneMap + picker 최근 구간

**Files:**
- Modify: `src/types.ts`, `src/db/sessions.ts`, `src/components/ExercisePicker.tsx`
- Test: `src/db/sessions.test.ts`, `src/components/ExercisePicker.test.tsx` (추가)

**Interfaces:**
- Produces (Task 2가 사용): `SessionEntry.pairedWithNext?: boolean`
- Produces: `getLastDoneMap(): Promise<Map<string, number>>` — exerciseId → 마지막 완료 세션 startedAt

- [ ] **Step 1: 실패하는 테스트 작성**

`src/db/sessions.test.ts` — import에 `getLastDoneMap` 추가, 파일 끝에:

```ts
test('getLastDoneMap은 운동별 마지막 완료 세션 시각을 준다 (진행 중 제외)', async () => {
  await addFinishedSession(1000, 'ex1', [{ weight: 50, reps: 10 }]);
  await addFinishedSession(2000, 'ex1', [{ weight: 60, reps: 10 }]);
  await startSession(); // 진행 중 — 제외
  const map = await getLastDoneMap();
  expect(map.get('ex1')).toBe(2000);
  expect(map.size).toBe(1);
});
```

`src/components/ExercisePicker.test.tsx` — 상단에 헬퍼 추가 (import에 `type { Session }` 추가):

```tsx
async function addDone(startedAt: number, exerciseId: string) {
  const s: Session = {
    id: crypto.randomUUID(),
    startedAt,
    finishedAt: startedAt + 3600_000,
    entries: [{ exerciseId, sets: [{ weight: 50, reps: 10, completedAt: startedAt + 1 }] }],
  };
  await db.sessions.add(s);
}
```

파일 끝에 테스트 3개 추가:

```tsx
test('기록 있는 운동이 최근 한 운동 구간에 최근순·마지막 수행일과 함께 표시된다', async () => {
  await addDone(new Date(2026, 5, 1, 12).getTime(), 'lib-squat');
  await addDone(new Date(2026, 5, 3, 12).getTime(), 'lib-bench-press');
  render(<ExercisePicker onSelect={() => {}} onClose={() => {}} />);
  expect(await screen.findByText('최근 한 운동')).toBeInTheDocument();
  expect(screen.getByText('전체 운동')).toBeInTheDocument();
  const names = screen.getAllByText(/^(벤치프레스|스쿼트)$/).map((el) => el.textContent);
  expect(names.slice(0, 2)).toEqual(['벤치프레스', '스쿼트']); // 최근(6/3 벤치)이 먼저
  expect(screen.getByText('가슴 · 바벨 · 6/3')).toBeInTheDocument();
});

test('기록이 없으면 최근 구간 헤더가 없다', async () => {
  render(<ExercisePicker onSelect={() => {}} onClose={() => {}} />);
  await screen.findByText('벤치프레스');
  expect(screen.queryByText('최근 한 운동')).not.toBeInTheDocument();
  expect(screen.queryByText('전체 운동')).not.toBeInTheDocument();
});

test('검색은 최근 구간에도 적용된다', async () => {
  await addDone(new Date(2026, 5, 1, 12).getTime(), 'lib-squat');
  render(<ExercisePicker onSelect={() => {}} onClose={() => {}} />);
  await screen.findByText('최근 한 운동');
  fireEvent.change(screen.getByPlaceholderText('운동 이름 검색'), { target: { value: '벤치' } });
  await waitFor(() => {
    expect(screen.queryByText('최근 한 운동')).not.toBeInTheDocument(); // 스쿼트가 걸러짐
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/db/sessions.test.ts src/components/ExercisePicker.test.tsx`
Expected: 새 4개 FAIL (`getLastDoneMap` 없음 / '최근 한 운동' 없음), 기존 PASS

- [ ] **Step 3: 구현**

`src/types.ts` — `SessionEntry`에 필드 추가:

```ts
export interface SessionEntry {
  exerciseId: string;
  sets: SetRecord[];
  pairedWithNext?: boolean; // true면 다음 entry와 같은 화면에 묶어 표시 (슈퍼세트)
}
```

`src/db/sessions.ts` — 파일 끝에 추가:

```ts
// exerciseId → 마지막으로 완료한 세션의 startedAt (listFinishedSessions가 최신순이라 첫 등장이 최신)
export async function getLastDoneMap(): Promise<Map<string, number>> {
  const sessions = await listFinishedSessions();
  const map = new Map<string, number>();
  for (const s of sessions) {
    for (const e of s.entries) {
      if (!map.has(e.exerciseId)) map.set(e.exerciseId, s.startedAt);
    }
  }
  return map;
}
```

`src/components/ExercisePicker.tsx` — import에 `getLastDoneMap` 추가:

```tsx
import { getLastDoneMap } from '../db/sessions';
```

`fmtDone` 헬퍼 추가 (컴포넌트 밖):

```tsx
function fmtDone(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
```

컴포넌트 안 — `exercises` 아래에 추가:

```tsx
const lastDone = useLiveQuery(() => getLastDoneMap(), []) ?? new Map<string, number>();
```

`visible` 계산 아래에 추가:

```tsx
const recent = visible
  .filter((e) => lastDone.has(e.id))
  .sort((a, b) => (lastDone.get(b.id) ?? 0) - (lastDone.get(a.id) ?? 0));
const rest = visible.filter((e) => !lastDone.has(e.id));
```

기존 `{visible.map((ex) => ...)}` 블록을 다음으로 교체 (행 렌더는 헬퍼로 추출, `.sb`에 날짜 옵션):

```tsx
{recent.length > 0 && (
  <>
    <div className="card-h" style={{ marginTop: 4 }}>최근 한 운동</div>
    {recent.map((ex) => (
      <button key={ex.id} className="ex-row" onClick={() => onSelect(ex)}>
        <ExerciseImage exercise={ex} />
        <div>
          <div className="nm">{ex.name}</div>
          <div className="sb">{ex.bodyPart} · {ex.equipment} · {fmtDone(lastDone.get(ex.id) ?? 0)}</div>
        </div>
      </button>
    ))}
    <div className="card-h" style={{ marginTop: 12 }}>전체 운동</div>
  </>
)}
{rest.map((ex) => (
  <button key={ex.id} className="ex-row" onClick={() => onSelect(ex)}>
    <ExerciseImage exercise={ex} />
    <div>
      <div className="nm">{ex.name}</div>
      <div className="sb">{ex.bodyPart} · {ex.equipment}</div>
    </div>
  </button>
))}
{visible.length === 0 && <div className="empty">검색 결과가 없어요</div>}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/db/sessions.test.ts src/components/ExercisePicker.test.tsx`
Expected: PASS (기존 + 새 4개)

- [ ] **Step 5: 커밋**

```bash
git add src/types.ts src/db/sessions.ts src/db/sessions.test.ts src/components/ExercisePicker.tsx src/components/ExercisePicker.test.tsx
git commit -m "feat: picker 최근 한 운동 구간 — 최근순 정렬과 마지막 수행일"
```

---

### Task 2: SessionScreen 그룹 렌더 — 슈퍼세트 묶기 + 운동 빼기

**Files:**
- Modify: `src/screens/SessionScreen.tsx` (전체 교체), `src/db/sessions.test.ts` (백업 왕복 1개)
- Test: `src/screens/SessionScreen.test.tsx` (추가)

**Interfaces:**
- Consumes: Task 1의 `pairedWithNext`
- Produces: `export function groupsOf(entries: { pairedWithNext?: boolean }[]): number[][]`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/screens/SessionScreen.test.tsx` — import를 `import SessionScreen, { groupsOf } from './SessionScreen';`로 바꾸고, `saveSession` import 추가. 파일 끝에:

```tsx
test('groupsOf: 연속 pairedWithNext를 묶고 dangling flag는 무시한다', () => {
  expect(groupsOf([{ pairedWithNext: true }, {}, {}])).toEqual([[0, 1], [2]]);
  expect(groupsOf([{ pairedWithNext: true }, { pairedWithNext: true }, {}])).toEqual([[0, 1, 2]]);
  expect(groupsOf([{}, { pairedWithNext: true }])).toEqual([[0], [1]]);
  expect(groupsOf([])).toEqual([]);
});

test('다음 운동과 묶으면 두 운동이 한 화면에 보이고 각각 기록된다', async () => {
  await startSession(routine);
  renderScreen();
  await screen.findByText('벤치프레스');
  fireEvent.click(screen.getByRole('button', { name: '🔗 다음 운동과 묶기' }));
  expect(await screen.findByText('스쿼트')).toBeInTheDocument();
  expect(screen.getByText('벤치프레스')).toBeInTheDocument();
  expect(screen.getByText('1 / 1')).toBeInTheDocument();
  fireEvent.click(screen.getAllByLabelText('세트 1 완료')[1]); // 스쿼트의 세트 1
  await waitFor(async () => {
    const s = await getActiveSession();
    expect(s?.entries[1].sets[0].completedAt).toBeDefined();
    expect(s?.entries[0].pairedWithNext).toBe(true);
  });
});

test('묶음은 저장되어 재마운트해도 유지된다', async () => {
  const s = await startSession(routine);
  s.entries[0].pairedWithNext = true;
  await saveSession(s);
  renderScreen();
  expect(await screen.findByText('벤치프레스')).toBeInTheDocument();
  expect(screen.getByText('스쿼트')).toBeInTheDocument();
});

test('묶기 해제하면 한 운동씩 보인다', async () => {
  const s = await startSession(routine);
  s.entries[0].pairedWithNext = true;
  await saveSession(s);
  renderScreen();
  await screen.findByText('스쿼트');
  fireEvent.click(screen.getByRole('button', { name: '묶기 해제' }));
  await waitFor(() => expect(screen.queryByText('스쿼트')).not.toBeInTheDocument());
  expect(screen.getByText('1 / 2')).toBeInTheDocument();
});

test('묶음 단위로 이동한다', async () => {
  const three: Routine = {
    id: 'r3', name: '3종',
    items: [
      { exerciseId: 'lib-bench-press', defaultSets: 1 },
      { exerciseId: 'lib-squat', defaultSets: 1 },
      { exerciseId: 'lib-pec-deck', defaultSets: 1 },
    ],
  };
  const s = await startSession(three);
  s.entries[0].pairedWithNext = true;
  await saveSession(s);
  renderScreen();
  await screen.findByText('벤치프레스');
  expect(screen.getByText('1 / 2')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '다음 운동' }));
  expect(await screen.findByText('펙덱 플라이')).toBeInTheDocument();
  expect(screen.getByText('2 / 2')).toBeInTheDocument();
});

test('운동 빼기: 완료 세트 없으면 즉시 제거된다', async () => {
  await startSession(routine);
  renderScreen();
  await screen.findByText('벤치프레스');
  fireEvent.click(screen.getByRole('button', { name: '운동 빼기' }));
  expect(await screen.findByText('스쿼트')).toBeInTheDocument();
  await waitFor(async () => {
    expect((await getActiveSession())?.entries).toHaveLength(1);
  });
});

test('운동 빼기: 완료 세트가 있으면 confirm을 거친다', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  await startSession(routine);
  renderScreen();
  await screen.findByText('벤치프레스');
  fireEvent.click(screen.getByLabelText('세트 1 완료'));
  fireEvent.click(screen.getByRole('button', { name: '운동 빼기' }));
  expect(window.confirm).toHaveBeenCalledWith('완료한 세트가 있어요. 이 운동을 뺄까요?');
  expect((await getActiveSession())?.entries).toHaveLength(2);
});

test('묶인 운동을 빼면 남은 운동이 단독 그룹이 된다', async () => {
  const s = await startSession(routine);
  s.entries[0].pairedWithNext = true;
  await saveSession(s);
  renderScreen();
  await screen.findByText('스쿼트');
  fireEvent.click(screen.getAllByRole('button', { name: '운동 빼기' })[1]); // 스쿼트 빼기
  await waitFor(() => expect(screen.queryByText('스쿼트')).not.toBeInTheDocument());
  expect(screen.getByText('1 / 1')).toBeInTheDocument();
  const cur = await getActiveSession();
  expect(cur?.entries).toHaveLength(1);
  expect(cur?.entries[0].pairedWithNext).toBeUndefined();
});
```

`src/db/sessions.test.ts` — import에 `exportData, importData`(`./backup`) 추가, 파일 끝에:

```ts
test('백업 왕복에 pairedWithNext가 보존된다', async () => {
  const s = await startSession();
  s.entries = [
    { exerciseId: 'ex1', sets: [{ weight: 50, reps: 10, completedAt: 1 }], pairedWithNext: true },
    { exerciseId: 'ex2', sets: [{ weight: 20, reps: 10, completedAt: 1 }] },
  ];
  await saveSession(s);
  await finishSession(s);
  const dump = JSON.parse(JSON.stringify(await exportData()));
  await importData(dump);
  const restored = (await listFinishedSessions())[0];
  expect(restored.entries[0].pairedWithNext).toBe(true);
});
```

(importData의 검증이 이 필드를 거부하면 — 거부 원인을 리포트에 명시하고 검증 로직을 필드 추가에 맞게 최소 수정)

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/screens/SessionScreen.test.tsx src/db/sessions.test.ts`
Expected: 새 9+1개 FAIL (`groupsOf` export 없음 등), 기존 PASS

- [ ] **Step 3: SessionScreen 전체 교체**

`src/screens/SessionScreen.tsx`를 다음 전체 내용으로 교체:

```tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Exercise, Session, SetRecord } from '../types';
import {
  getActiveSession, saveSession, finishSession, discardSession, buildEntry,
} from '../db/sessions';
import { listExercises } from '../db/exercises';
import { getRestSeconds } from '../db/settings';
import {
  volume, maxWeight, fmtVolumeDelta, getPRWeight, getPreviousRecord,
} from '../db/progress';
import ExerciseImage from '../components/ExerciseImage';
import ExercisePicker, { dominantBodyPart } from '../components/ExercisePicker';
import RestTimer from '../components/RestTimer';

function fmtElapsed(startedAt: number, now: number): string {
  const sec = Math.max(0, Math.floor((now - startedAt) / 1000));
  const mm = String(Math.floor(sec / 60)).padStart(2, '0');
  const ss = String(sec % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function fmtLast(sets: SetRecord[]): string {
  return sets.map((s, i) => (i === 0 ? `${s.weight}kg×${s.reps}` : `${s.weight}×${s.reps}`)).join(' · ');
}

// 연속된 pairedWithNext로 이어지는 entry 인덱스 묶음. 마지막 entry의 flag는 무시(짝이 빠진 경우 자가 치유)
export function groupsOf(entries: { pairedWithNext?: boolean }[]): number[][] {
  const groups: number[][] = [];
  let cur: number[] = [];
  entries.forEach((e, i) => {
    cur.push(i);
    if (!e.pairedWithNext || i === entries.length - 1) {
      groups.push(cur);
      cur = [];
    }
  });
  return groups;
}

interface ExerciseRecord {
  last?: SetRecord[];
  pr: number;
}

export default function SessionScreen() {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [idx, setIdx] = useState(0);
  const [restUntil, setRestUntil] = useState(0);
  const [restTotal, setRestTotal] = useState(90);
  const [showPicker, setShowPicker] = useState(false);
  const [records, setRecords] = useState<Map<string, ExerciseRecord>>(new Map());
  const [now, setNow] = useState(Date.now());
  const exercises = useLiveQuery(() => listExercises({ includeHidden: true }), []) ?? [];
  const exMap = new Map(exercises.map((e) => [e.id, e]));

  useEffect(() => {
    getActiveSession().then((s) => {
      if (!s) navigate('/', { replace: true });
      else setSession(s);
    });
  }, [navigate]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const groups = session ? groupsOf(session.entries) : [];
  const gPos = groups.findIndex((g) => g.includes(idx));
  const group = gPos >= 0 ? groups[gPos] : [];
  const groupIds = session ? group.map((i) => session.entries[i].exerciseId) : [];
  const groupKey = groupIds.join('|');

  useEffect(() => {
    if (!session || groupIds.length === 0) {
      setRecords(new Map());
      return;
    }
    // 같은 밀리초에 생성된 직전 세션을 놓치지 않도록 +1ms 여유
    const before = session.startedAt + 1;
    let cancelled = false;
    void Promise.all(
      [...new Set(groupIds)].map(async (id) => {
        const [last, pr] = await Promise.all([
          getPreviousRecord(id, before),
          getPRWeight(id, before),
        ]);
        return [id, { last, pr }] as const;
      }),
    ).then((pairs) => {
      if (!cancelled) setRecords(new Map(pairs));
    });
    return () => {
      cancelled = true;
    };
  }, [groupKey, session?.startedAt]);

  if (!session) return null;

  async function update(next: Session) {
    setSession(next);
    await saveSession(next);
  }

  function patchSet(entryIdx: number, setIdx: number, patch: Partial<SetRecord>) {
    if (!session) return;
    const entries = session.entries.map((e, i) =>
      i !== entryIdx ? e : { ...e, sets: e.sets.map((s, j) => (j !== setIdx ? s : { ...s, ...patch })) },
    );
    void update({ ...session, entries });
  }

  function toggleSet(entryIdx: number, setIdx: number) {
    if (!session) return;
    const s = session.entries[entryIdx].sets[setIdx];
    if (s.completedAt) {
      patchSet(entryIdx, setIdx, { completedAt: undefined });
    } else {
      patchSet(entryIdx, setIdx, { completedAt: Date.now() });
      const restSec = getRestSeconds();
      setRestTotal(restSec);
      setRestUntil(Date.now() + restSec * 1000);
    }
  }

  function addSet(entryIdx: number) {
    if (!session) return;
    const target = session.entries[entryIdx];
    const last = target.sets[target.sets.length - 1] ?? { weight: 0, reps: 10 };
    const entries = session.entries.map((e, i) =>
      i !== entryIdx ? e : { ...e, sets: [...e.sets, { weight: last.weight, reps: last.reps }] },
    );
    void update({ ...session, entries });
  }

  function removeSet(entryIdx: number) {
    if (!session) return;
    const target = session.entries[entryIdx];
    if (target.sets.length <= 1) return;
    const last = target.sets[target.sets.length - 1];
    if (last.completedAt && !window.confirm('완료한 세트예요. 삭제할까요?')) return;
    const entries = session.entries.map((e, i) =>
      i !== entryIdx ? e : { ...e, sets: e.sets.slice(0, -1) },
    );
    void update({ ...session, entries });
  }

  function removeEntry(entryIdx: number) {
    if (!session) return;
    const target = session.entries[entryIdx];
    const hasDone = target.sets.some((s) => s.completedAt !== undefined);
    if (hasDone && !window.confirm('완료한 세트가 있어요. 이 운동을 뺄까요?')) return;
    // 그룹 마지막을 빼면 직전 flag 해제(엉뚱한 다음 운동과 묶임 방지), 중간이면 유지(그룹 축소)
    const entries = session.entries
      .map((e, i) =>
        i === entryIdx - 1 && !target.pairedWithNext && e.pairedWithNext
          ? { ...e, pairedWithNext: undefined }
          : e,
      )
      .filter((_, i) => i !== entryIdx);
    void update({ ...session, entries });
    const nextGroups = groupsOf(entries);
    const fallback = nextGroups.find((g) => g.includes(Math.min(idx, entries.length - 1)));
    setIdx(fallback ? fallback[0] : 0);
  }

  function pairWithNext() {
    if (!session || group.length === 0) return;
    const lastIdx = group[group.length - 1];
    if (lastIdx >= session.entries.length - 1) return;
    const entries = session.entries.map((e, i) =>
      i === lastIdx ? { ...e, pairedWithNext: true } : e,
    );
    void update({ ...session, entries });
  }

  function unpair() {
    if (!session) return;
    const inGroup = new Set(group);
    const entries = session.entries.map((e, i) =>
      inGroup.has(i) && e.pairedWithNext ? { ...e, pairedWithNext: undefined } : e,
    );
    void update({ ...session, entries });
  }

  async function addExercise(ex: Exercise) {
    if (!session) return;
    setShowPicker(false);
    const newEntry = await buildEntry(ex.id, 3, session.startedAt + 1);
    const next = { ...session, entries: [...session.entries, newEntry] };
    await update(next);
    setIdx(next.entries.length - 1);
  }

  async function finish() {
    if (!session) return;
    const doneCount = session.entries.flatMap((e) => e.sets).filter((s) => s.completedAt).length;
    if (doneCount === 0) {
      if (window.confirm('완료한 세트가 없어요. 세션을 버릴까요? 되돌릴 수 없어요.')) {
        await discardSession(session.id);
        navigate('/', { replace: true });
      }
      return;
    }
    if (!window.confirm('운동을 완료할까요?')) return;
    await finishSession(session);
    navigate(`/summary/${session.id}`, { replace: true });
  }

  const total = groups.length;
  const startDate = new Date(session.startedAt);
  const isBackdated = startDate.toDateString() !== new Date(now).toDateString();
  const canPair = group.length > 0 && group[group.length - 1] < session.entries.length - 1;

  return (
    <>
      <div className="topnav">
        <button onClick={finish} aria-label="세션 종료">✕</button>
        <span className="title">{session.routineName ?? '오늘 운동'} · <span>{total > 0 ? `${gPos + 1} / ${total}` : '운동 없음'}</span></span>
        <span className="clock">
          {isBackdated ? `${startDate.getMonth() + 1}/${startDate.getDate()}` : fmtElapsed(session.startedAt, now)}
        </span>
      </div>
      <div className="progressbar">
        <div style={{ width: total > 0 ? `${((gPos + 1) / total) * 100}%` : '0%' }} />
      </div>
      <div className="screen">
        {group.length > 0 ? (
          group.map((entryIdx) => {
            const e = session.entries[entryIdx];
            const gex = exMap.get(e.exerciseId);
            const rec = records.get(e.exerciseId);
            const doneSets = e.sets.filter((s) => s.completedAt !== undefined);
            const curVol = volume(doneSets);
            const lastVol = rec?.last ? volume(rec.last) : 0;
            const isPRNow = rec?.last !== undefined && maxWeight(doneSets) > (rec?.pr ?? 0);
            const overloadText = curVol > lastVol
              ? `볼륨 ${curVol}kg ${fmtVolumeDelta(curVol, lastVol)}`
              : `볼륨 ${curVol} / 지난 ${lastVol}kg`;
            return (
              <div key={entryIdx} className="card">
                {group.length === 1 && gex && <ExerciseImage exercise={gex} className="hero-img" />}
                <div className="ex-name">{gex?.name ?? '삭제된 운동'}</div>
                <div className="tags">
                  {gex && <span className="tag">{gex.bodyPart}</span>}
                  {gex && <span className="tag">{gex.equipment}</span>}
                  <button
                    className="btn-sm btn btn-ghost" style={{ marginLeft: 'auto' }}
                    onClick={() => removeEntry(entryIdx)}
                  >
                    운동 빼기
                  </button>
                </div>
                {rec?.last && <div className="last-pill" style={{ marginTop: 10 }}>🔥 지난번 {fmtLast(rec.last)}</div>}
                {rec?.last && (
                  <div className="last-pill" style={{ marginTop: 6, marginLeft: 6 }}>
                    📈 {overloadText}{isPRNow ? ' · 🏆 PR!' : ''}
                  </div>
                )}
                <div className="set-head" style={{ marginTop: 10 }}>
                  <span>세트</span><span>무게(kg)</span><span>횟수</span><span>완료</span>
                </div>
                {e.sets.map((s, j) => (
                  <div key={j} className={`set-row ${s.completedAt ? 'done' : ''}`} style={{ marginTop: 8 }}>
                    <span className="n">{j + 1}</span>
                    <input
                      type="number" inputMode="decimal" step="0.5" min="0"
                      aria-label={`세트 ${j + 1} 무게`}
                      value={s.weight === 0 ? '' : s.weight}
                      placeholder="0"
                      onFocus={(ev) => ev.currentTarget.select()}
                      onChange={(ev) => patchSet(entryIdx, j, { weight: Number(ev.target.value) || 0 })}
                    />
                    <input
                      type="number" inputMode="numeric" min="0"
                      aria-label={`세트 ${j + 1} 횟수`}
                      value={s.reps}
                      onFocus={(ev) => ev.currentTarget.select()}
                      onChange={(ev) => patchSet(entryIdx, j, { reps: Number(ev.target.value) || 0 })}
                    />
                    <button
                      className="chk" aria-label={`세트 ${j + 1} 완료`}
                      onClick={() => toggleSet(entryIdx, j)}
                    >
                      ✓
                    </button>
                  </div>
                ))}
                <div className="btn-row" style={{ marginTop: 10 }}>
                  <button className="btn btn-ghost" onClick={() => addSet(entryIdx)}>＋ 세트 추가</button>
                  <button
                    className="btn btn-ghost" disabled={e.sets.length <= 1} onClick={() => removeSet(entryIdx)}
                  >
                    − 세트 삭제
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <div className="empty">아래에서 운동을 추가해 시작하세요</div>
        )}
        <div className="btn-row">
          <button className="btn btn-ghost" onClick={() => setShowPicker(true)}>＋ 운동 추가</button>
          {canPair && (
            <button className="btn btn-ghost" onClick={pairWithNext}>🔗 다음 운동과 묶기</button>
          )}
          {group.length >= 2 && (
            <button className="btn btn-ghost" onClick={unpair}>묶기 해제</button>
          )}
        </div>
        <RestTimer until={restUntil} total={restTotal} onSkip={() => setRestUntil(0)} />
        <div className="btn-row">
          <button className="btn btn-ghost" disabled={gPos <= 0} onClick={() => setIdx(groups[gPos - 1][0])}>이전</button>
          {gPos < total - 1 ? (
            <button className="btn btn-primary" onClick={() => setIdx(groups[gPos + 1][0])}>다음 운동</button>
          ) : (
            <button className="btn btn-primary" style={{ background: 'var(--green)' }} onClick={finish}>운동 완료</button>
          )}
        </div>
      </div>
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
    </>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/screens/SessionScreen.test.tsx src/db/sessions.test.ts`
Expected: PASS (기존 15 + 새 9, sessions 기존 + 2)

- [ ] **Step 5: 커밋**

```bash
git add src/screens/SessionScreen.tsx src/screens/SessionScreen.test.tsx src/db/sessions.test.ts
git commit -m "feat: 세션 슈퍼세트 묶기와 운동 빼기 — 그룹 단위 화면·이동"
```

---

### Task 3: 전체 검증

- [ ] **Step 1:** `npm test` → 전체 PASS (기존 124 + 신규 ≈14)
- [ ] **Step 2:** `npm run build` → 에러 없음
- [ ] **Step 3:** 실패 시 수정 후 `git add -A src && git commit -m "fix: 슈퍼세트 통합 검증 수정"`
