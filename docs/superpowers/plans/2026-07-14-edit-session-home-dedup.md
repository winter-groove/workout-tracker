# 세션 편집 + 홈 중복 정리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 완료 세션 전용 편집 화면(운동/세트 추가·삭제·수정)을 추가하고 홈 "최근 운동" 카드를 제거한다.

**Architecture:** 신규 `EditSessionScreen`(`/edit/:sessionId`) — 로컬 draft 편집 후 `saveSession`으로 일괄 저장, 완료 세션 불변식(모든 세트 completedAt)은 저장 시 보장. 요약 화면에 "수정하기" 진입점. HomeScreen 최근 운동 카드 삭제.

**Tech Stack:** React 18 + TypeScript, Dexie, vitest + @testing-library/react + fake-indexeddb

**스펙:** `docs/superpowers/specs/2026-07-14-edit-session-and-home-dedup-design.md`

## Global Constraints

- DB 스키마 변경 금지, 새 npm 의존성 추가 금지, UI 문구는 한국어
- 편집은 로컬 draft — 저장 전 DB 무변경, 취소 시 버림
- 저장 시: 세트 0개 운동 제거 → 운동 0개면 `alert('운동이 최소 1개는 있어야 해요. 기록 삭제는 기록 탭에서 할 수 있어요.')` 후 중단 → 모든 세트 `completedAt ?? session.startedAt + 1` → saveSession → `/summary/:id` replace
- startedAt·finishedAt·routineName 유지, 미완료 세션은 홈 리다이렉트
- 테스트 실행: `npx vitest run <파일경로>` (전체는 `npm test`)

---

### Task 1: EditSessionScreen + 라우트 + 요약 진입점

**Files:**
- Create: `src/screens/EditSessionScreen.tsx`
- Modify: `src/App.tsx` (라우트), `src/screens/SummaryScreen.tsx` (수정하기 버튼)
- Test: `src/screens/EditSessionScreen.test.tsx` (신규), `src/screens/SummaryScreen.test.tsx` (1개 추가)

**Interfaces:**
- Consumes: `saveSession`/`buildEntry`(`src/db/sessions.ts` — `buildEntry(id, defaultSets, before)`), `ExercisePicker`+`dominantBodyPart`, `listExercises`, `db`
- Produces: 라우트 `/edit/:sessionId`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/screens/EditSessionScreen.test.tsx` 생성:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { db } from '../db/db';
import { seedLibrary } from '../db/exercises';
import type { Session } from '../types';
import EditSessionScreen from './EditSessionScreen';

beforeEach(async () => {
  await db.delete();
  await db.open();
  await seedLibrary();
});

async function addFinishedSession(
  startedAt: number, exerciseIds: string[], weight = 50,
): Promise<Session> {
  const s: Session = {
    id: crypto.randomUUID(),
    startedAt,
    finishedAt: startedAt + 3600_000,
    entries: exerciseIds.map((exerciseId) => ({
      exerciseId,
      sets: [{ weight, reps: 10, completedAt: startedAt + 1 }],
    })),
  };
  await db.sessions.add(s);
  return s;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<div>홈화면</div>} />
        <Route path="/summary/:sessionId" element={<div>요약화면</div>} />
        <Route path="/edit/:sessionId" element={<EditSessionScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

test('세트 무게를 수정하고 저장하면 DB에 반영되고 요약으로 이동한다', async () => {
  const s = await addFinishedSession(1000, ['lib-bench-press']);
  renderAt(`/edit/${s.id}`);
  const weightInput = await screen.findByLabelText('세트 1 무게');
  fireEvent.change(weightInput, { target: { value: '60' } });
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  expect(await screen.findByText('요약화면')).toBeInTheDocument();
  const saved = await db.sessions.get(s.id);
  expect(saved?.entries[0].sets[0].weight).toBe(60);
  expect(saved?.finishedAt).toBe(1000 + 3600_000);
});

test('세트 추가·삭제가 저장에 반영되고 새 세트는 완료 처리된다', async () => {
  const s = await addFinishedSession(1000, ['lib-bench-press']);
  renderAt(`/edit/${s.id}`);
  await screen.findByText('벤치프레스');
  fireEvent.click(screen.getByRole('button', { name: '＋ 세트 추가' }));
  fireEvent.change(screen.getByLabelText('세트 2 횟수'), { target: { value: '8' } });
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  await screen.findByText('요약화면');
  const saved = await db.sessions.get(s.id);
  expect(saved?.entries[0].sets).toHaveLength(2);
  expect(saved?.entries[0].sets[1]).toMatchObject({ reps: 8, completedAt: 1001 });
});

test('세트 ×로 삭제하고 저장하면 반영된다', async () => {
  const s = await addFinishedSession(1000, ['lib-bench-press']);
  renderAt(`/edit/${s.id}`);
  await screen.findByText('벤치프레스');
  fireEvent.click(screen.getByRole('button', { name: '＋ 세트 추가' }));
  fireEvent.click(screen.getAllByRole('button', { name: /세트 \d+ 삭제/ })[0]);
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  await screen.findByText('요약화면');
  expect((await db.sessions.get(s.id))?.entries[0].sets).toHaveLength(1);
});

test('운동을 삭제하고 저장하면 반영된다', async () => {
  const s = await addFinishedSession(1000, ['lib-bench-press', 'lib-squat']);
  renderAt(`/edit/${s.id}`);
  await screen.findByText('벤치프레스');
  fireEvent.click(screen.getAllByRole('button', { name: '운동 삭제' })[0]);
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  await screen.findByText('요약화면');
  const saved = await db.sessions.get(s.id);
  expect(saved?.entries).toHaveLength(1);
  expect(saved?.entries[0].exerciseId).toBe('lib-squat');
});

test('운동을 추가하고 저장하면 프리필·완료 처리되어 반영된다', async () => {
  const s = await addFinishedSession(1000, ['lib-bench-press']);
  renderAt(`/edit/${s.id}`);
  await screen.findByText('벤치프레스');
  fireEvent.click(screen.getByRole('button', { name: '＋ 운동 추가' }));
  fireEvent.click(await screen.findByText('스쿼트'));
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  await screen.findByText('요약화면');
  const saved = await db.sessions.get(s.id);
  expect(saved?.entries).toHaveLength(2);
  expect(saved?.entries[1].exerciseId).toBe('lib-squat');
  for (const set of saved!.entries[1].sets) expect(set.completedAt).toBeDefined();
});

test('마지막 운동을 삭제하고 저장하면 차단된다', async () => {
  const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
  const s = await addFinishedSession(1000, ['lib-bench-press']);
  renderAt(`/edit/${s.id}`);
  await screen.findByText('벤치프레스');
  fireEvent.click(screen.getByRole('button', { name: '운동 삭제' }));
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  await waitFor(() => expect(alertSpy).toHaveBeenCalled());
  expect((await db.sessions.get(s.id))?.entries).toHaveLength(1); // 무변경
  alertSpy.mockRestore();
});

test('취소하면 DB가 바뀌지 않는다', async () => {
  const s = await addFinishedSession(1000, ['lib-bench-press']);
  renderAt(`/edit/${s.id}`);
  fireEvent.change(await screen.findByLabelText('세트 1 무게'), { target: { value: '99' } });
  fireEvent.click(screen.getByRole('button', { name: '취소' }));
  expect(await screen.findByText('요약화면')).toBeInTheDocument();
  expect((await db.sessions.get(s.id))?.entries[0].sets[0].weight).toBe(50);
});

test('미완료 세션이면 홈으로 리다이렉트한다', async () => {
  await db.sessions.add({
    id: 'active-1', startedAt: 1000,
    entries: [{ exerciseId: 'lib-bench-press', sets: [{ weight: 50, reps: 10 }] }],
  });
  renderAt('/edit/active-1');
  expect(await screen.findByText('홈화면')).toBeInTheDocument();
});
```

`src/screens/SummaryScreen.test.tsx`에 추가 (renderAt에 `/edit` 라우트가 없으므로 이 테스트는 자체 render 사용):

```tsx
test('수정하기를 누르면 편집 화면으로 이동한다', async () => {
  const cur = await addFinishedSession(1000, 'lib-bench-press', [{ weight: 50, reps: 10 }]);
  render(
    <MemoryRouter initialEntries={[`/summary/${cur.id}`]}>
      <Routes>
        <Route path="/" element={<div>홈화면</div>} />
        <Route path="/summary/:sessionId" element={<SummaryScreen />} />
        <Route path="/edit/:sessionId" element={<div>편집화면</div>} />
      </Routes>
    </MemoryRouter>,
  );
  fireEvent.click(await screen.findByRole('button', { name: '수정하기' }));
  expect(await screen.findByText('편집화면')).toBeInTheDocument();
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/screens/EditSessionScreen.test.tsx src/screens/SummaryScreen.test.tsx`
Expected: Edit 8개 FAIL (모듈 없음), Summary 새 1개 FAIL (버튼 없음), 기존 PASS

- [ ] **Step 3: 구현**

`src/screens/EditSessionScreen.tsx` 생성:

```tsx
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Exercise, Session, SessionEntry, SetRecord } from '../types';
import { db } from '../db/db';
import { saveSession, buildEntry } from '../db/sessions';
import { listExercises } from '../db/exercises';
import ExercisePicker, { dominantBodyPart } from '../components/ExercisePicker';

export default function EditSessionScreen() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [entries, setEntries] = useState<SessionEntry[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const exercises = useLiveQuery(() => listExercises({ includeHidden: true }), []) ?? [];
  const exMap = new Map(exercises.map((e) => [e.id, e]));

  useEffect(() => {
    if (!sessionId) {
      navigate('/', { replace: true });
      return;
    }
    db.sessions.get(sessionId).then((s) => {
      if (!s || s.finishedAt === undefined) {
        navigate('/', { replace: true });
        return;
      }
      setSession(s);
      setEntries(s.entries.map((e) => ({ ...e, sets: e.sets.map((x) => ({ ...x })) })));
    });
  }, [sessionId, navigate]);

  if (!session) return null;

  function patchSet(entryIdx: number, setIdx: number, patch: Partial<SetRecord>) {
    setEntries(entries.map((e, i) =>
      i !== entryIdx ? e : { ...e, sets: e.sets.map((s, j) => (j !== setIdx ? s : { ...s, ...patch })) },
    ));
  }

  function removeSet(entryIdx: number, setIdx: number) {
    setEntries(entries.map((e, i) =>
      i !== entryIdx ? e : { ...e, sets: e.sets.filter((_, j) => j !== setIdx) },
    ));
  }

  function addSet(entryIdx: number) {
    setEntries(entries.map((e, i) => {
      if (i !== entryIdx) return e;
      const last = e.sets[e.sets.length - 1] ?? { weight: 0, reps: 10 };
      return { ...e, sets: [...e.sets, { weight: last.weight, reps: last.reps }] };
    }));
  }

  function removeEntry(entryIdx: number) {
    setEntries(entries.filter((_, i) => i !== entryIdx));
  }

  async function addExercise(ex: Exercise) {
    if (!session) return;
    setShowPicker(false);
    const entry = await buildEntry(ex.id, 3, session.startedAt + 1);
    setEntries((prev) => [...prev, entry]);
  }

  async function save() {
    if (!session) return;
    const cleaned = entries
      .map((e) => ({
        ...e,
        sets: e.sets.map((s) => ({ ...s, completedAt: s.completedAt ?? session.startedAt + 1 })),
      }))
      .filter((e) => e.sets.length > 0);
    if (cleaned.length === 0) {
      window.alert('운동이 최소 1개는 있어야 해요. 기록 삭제는 기록 탭에서 할 수 있어요.');
      return;
    }
    await saveSession({ ...session, entries: cleaned });
    navigate(`/summary/${session.id}`, { replace: true });
  }

  return (
    <div className="screen">
      <h1 className="screen-title">기록 수정</h1>
      {entries.map((e, i) => (
        <div key={i} className="card">
          <div className="hist-row" style={{ borderBottom: 'none' }}>
            <span>{exMap.get(e.exerciseId)?.name ?? '삭제된 운동'}</span>
            <button
              className="btn-sm btn btn-danger"
              onClick={() => removeEntry(i)}
            >
              운동 삭제
            </button>
          </div>
          {e.sets.map((s, j) => (
            <div key={j} className="set-row" style={{ marginTop: 8 }}>
              <span className="n">{j + 1}</span>
              <input
                type="number" inputMode="decimal" step="0.5" min="0"
                aria-label={`세트 ${j + 1} 무게`}
                value={s.weight === 0 ? '' : s.weight}
                placeholder="0"
                onFocus={(ev) => ev.currentTarget.select()}
                onChange={(ev) => patchSet(i, j, { weight: Number(ev.target.value) || 0 })}
              />
              <input
                type="number" inputMode="numeric" min="0"
                aria-label={`세트 ${j + 1} 횟수`}
                value={s.reps}
                onFocus={(ev) => ev.currentTarget.select()}
                onChange={(ev) => patchSet(i, j, { reps: Number(ev.target.value) || 0 })}
              />
              <button className="chk" aria-label={`세트 ${j + 1} 삭제`} onClick={() => removeSet(i, j)}>
                ×
              </button>
            </div>
          ))}
          <button className="btn btn-ghost" style={{ marginTop: 10 }} onClick={() => addSet(i)}>
            ＋ 세트 추가
          </button>
        </div>
      ))}
      <button className="btn btn-ghost" onClick={() => setShowPicker(true)}>＋ 운동 추가</button>
      <div className="btn-row">
        <button className="btn btn-ghost" onClick={() => navigate(`/summary/${session.id}`, { replace: true })}>
          취소
        </button>
        <button className="btn btn-primary" onClick={() => void save()}>저장</button>
      </div>
      {showPicker && (
        <ExercisePicker
          initialFilter={
            dominantBodyPart(
              entries.map((e) => exMap.get(e.exerciseId)).filter((e): e is Exercise => e !== undefined),
            ) ?? '전체'
          }
          onSelect={addExercise}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}
```

(참고: 세트 행이 운동 카드마다 있어 `세트 N 무게` aria-label이 화면 전체에서 중복될 수 있음 — 테스트는 단일 운동이거나 getAllBy를 사용)

`src/App.tsx` — import와 라우트 추가:

```tsx
import EditSessionScreen from './screens/EditSessionScreen';
```

```tsx
<Route path="/edit/:sessionId" element={<EditSessionScreen />} />
```

`src/screens/SummaryScreen.tsx` — 버튼 줄에 수정하기 추가 (확인과 이어서 하기 사이):

```tsx
<div className="btn-row">
  <button className="btn btn-primary" onClick={() => navigate('/')}>확인</button>
  <button className="btn btn-ghost" onClick={() => navigate(`/edit/${session.id}`)}>수정하기</button>
  {canResume && (
    <button className="btn btn-ghost" onClick={() => void resume()}>이어서 하기</button>
  )}
</div>
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/screens/EditSessionScreen.test.tsx src/screens/SummaryScreen.test.tsx`
Expected: PASS (Edit 8 + Summary 기존+1)

- [ ] **Step 5: 커밋**

```bash
git add src/screens/EditSessionScreen.tsx src/screens/EditSessionScreen.test.tsx src/App.tsx src/screens/SummaryScreen.tsx src/screens/SummaryScreen.test.tsx
git commit -m "feat: 완료 세션 편집 화면 — 운동·세트 추가/삭제/수정"
```

---

### Task 2: 홈 최근 운동 카드 제거

**Files:**
- Modify: `src/screens/HomeScreen.tsx`, `src/screens/HomeScreen.test.tsx`

**Interfaces:** 없음

- [ ] **Step 1: 테스트 수정**

`src/screens/HomeScreen.test.tsx`:

- 테스트 `'최근 운동을 누르면 요약 화면으로 이동한다'` **삭제**
- 테스트 `'달력 날짜를 누르면 그날 세션이 표시되고 탭하면 요약으로 이동한다'`에서 중복 행 단언을 단일 행으로 수정:

```tsx
// 기존:
// const rows = await screen.findAllByText('가슴 날 · 1개 운동');
// expect(rows).toHaveLength(2);
// fireEvent.click(rows[0]);
// 수정:
fireEvent.click(await screen.findByText('가슴 날 · 1개 운동'));
```

- 파일 끝에 추가:

```tsx
test('홈에 최근 운동 카드가 없다', async () => {
  await addFinishedSession(Date.now() - 3_600_000, '등 날');
  renderWithSummary();
  await screen.findByText('달력');
  expect(screen.queryByText('최근 운동')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/screens/HomeScreen.test.tsx`
Expected: 수정된 달력 테스트 FAIL(행 2개 존재), 새 테스트 FAIL(최근 운동 존재)

- [ ] **Step 3: 구현**

`src/screens/HomeScreen.tsx` — `<div className="card">`로 감싼 "최근 운동" 카드 블록 전체 삭제 (달력 카드 아래). `fmtDate`가 다른 곳에서 안 쓰이면 함수도 삭제 (진행 중 카드의 `{fmtDate(active.startedAt)} 시작`에서 사용 중이므로 유지).

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/screens/HomeScreen.test.tsx src/App.test.tsx`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/screens/HomeScreen.tsx src/screens/HomeScreen.test.tsx
git commit -m "feat: 홈 최근 운동 카드 제거 — 세션 목록은 기록 탭으로 일원화"
```

---

### Task 3: 전체 검증

- [ ] **Step 1:** `npm test` → 전체 PASS (기존 111 + Edit 8 + Summary 1 + Home ±0 = ≈120)
- [ ] **Step 2:** `npm run build` → 에러 없음
- [ ] **Step 3:** 실패 시 수정 후 `git add -A src && git commit -m "fix: 세션 편집 통합 검증 수정"`
