# 세션 자동 이름 + 이름 지정 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 이름 없는 세션을 부위 기반 자동 이름으로 표시하고(전 화면·기존 기록 포함), 편집 화면에서 이름을 직접 지정할 수 있게 한다.

**Architecture:** 순수 함수 `sessionTitle(session, exMap)` 하나를 `sessions.ts`에 추가하고 세 화면의 `routineName ?? '오늘 운동'`을 교체(표시 전용, 데이터 무변경). 편집 화면에 이름 입력란(placeholder=자동 이름, 빈 값 저장 시 undefined).

**Tech Stack:** React 18 + TypeScript, Dexie, vitest + @testing-library/react

**스펙:** `docs/superpowers/specs/2026-07-28-session-title-design.md`

## Global Constraints

- 데이터 무변경 (자동 이름은 표시 전용 — 저장 금지), DB 스키마 변경 금지, 새 npm 의존성 금지, UI 문구 한국어
- 자동 이름 규칙: 부위별 entry 수 최다 2개를 `·` 연결 + " 운동", 동수는 등장순, 해석 불가 시 `'오늘 운동'`
- 기존 테스트 145개 무변경 통과 (표시 문자열 단언이 있는 테스트는 이름 있는 세션을 쓰므로 영향 없음 — 깨지면 원인 분석 후 보고)
- 테스트 실행: `npx vitest run <파일경로>` (전체는 `npm test`)

---

### Task 1: sessionTitle + 세 화면 적용

**Files:**
- Modify: `src/db/sessions.ts`, `src/screens/HistoryScreen.tsx`, `src/screens/SummaryScreen.tsx`, `src/screens/HomeScreen.tsx`
- Test: `src/db/sessions.test.ts`, `src/screens/HistoryScreen.test.tsx`, `src/screens/HomeScreen.test.tsx`, `src/screens/SummaryScreen.test.tsx` (각 1개 추가)

**Interfaces:**
- Produces (Task 2가 사용): `sessionTitle(session: Session, exMap: Map<string, Exercise>): string`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/db/sessions.test.ts` — import에 `sessionTitle` 추가, `import type { Exercise } from '../types';` 추가, 파일 끝에:

```ts
function mkEx(id: string, bodyPart: Exercise['bodyPart']): Exercise {
  return { id, name: id, bodyPart, equipment: '바벨', isCustom: false, isHidden: false };
}

test('sessionTitle: 루틴명 우선, 부위 구성 자동, fallback', () => {
  const exMap = new Map<string, Exercise>([
    ['e1', mkEx('e1', '가슴')],
    ['e2', mkEx('e2', '등')],
    ['e3', mkEx('e3', '가슴')],
    ['e4', mkEx('e4', '하체')],
  ]);
  const E = (id: string) => ({ exerciseId: id, sets: [] });
  const base = { id: 's', startedAt: 1 };
  expect(sessionTitle({ ...base, routineName: '가슴 날', entries: [E('e1')] }, exMap)).toBe('가슴 날');
  expect(sessionTitle({ ...base, entries: [E('e1')] }, exMap)).toBe('가슴 운동');
  expect(sessionTitle({ ...base, entries: [E('e1'), E('e2')] }, exMap)).toBe('가슴·등 운동');
  expect(sessionTitle({ ...base, entries: [E('e1'), E('e3'), E('e2'), E('e4')] }, exMap)).toBe('가슴·등 운동');
  expect(sessionTitle({ ...base, entries: [E('없는운동')] }, exMap)).toBe('오늘 운동');
  expect(sessionTitle({ ...base, entries: [] }, exMap)).toBe('오늘 운동');
});
```

`src/screens/HistoryScreen.test.tsx`에 추가:

```tsx
test('이름 없는 세션은 부위 기반 자동 이름으로 표시된다', async () => {
  await addFinishedSession(1000, 'lib-bench-press', [{ weight: 50, reps: 10 }]);
  renderScreen();
  expect(await screen.findByText(/가슴 운동 · 1개 운동/)).toBeInTheDocument();
});
```

`src/screens/HomeScreen.test.tsx`에 추가 (import에 `seedLibrary` — `../db/exercises`, `Session` 타입은 기존):

```tsx
test('이름 없는 세션은 달력 목록에서 부위 이름으로 표시된다', async () => {
  await seedLibrary();
  const now = new Date();
  const ts = new Date(now.getFullYear(), now.getMonth(), 15, 10).getTime();
  const s: Session = {
    id: crypto.randomUUID(), startedAt: ts, finishedAt: ts + 3600_000,
    entries: [{ exerciseId: 'lib-bench-press', sets: [{ weight: 50, reps: 10, completedAt: ts + 1 }] }],
  };
  await db.sessions.add(s);
  renderWithSummary();
  fireEvent.click(await screen.findByRole('button', { name: `${now.getMonth() + 1}월 15일` }));
  expect(await screen.findByText('가슴 운동 · 1개 운동')).toBeInTheDocument();
});
```

`src/screens/SummaryScreen.test.tsx`에 추가:

```tsx
test('이름 없는 세션의 요약 헤더는 부위 이름이다', async () => {
  const cur = await addFinishedSession(1000, 'lib-squat', [{ weight: 80, reps: 5 }]);
  renderAt(`/summary/${cur.id}`);
  expect(await screen.findByText(/하체 운동 · /)).toBeInTheDocument();
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/db/sessions.test.ts src/screens/HistoryScreen.test.tsx src/screens/HomeScreen.test.tsx src/screens/SummaryScreen.test.tsx`
Expected: 새 4개 FAIL (`sessionTitle` 없음 / '오늘 운동'으로 표시), 기존 PASS

- [ ] **Step 3: 구현**

`src/db/sessions.ts` — import type에 `Exercise` 추가, 파일 끝에:

```ts
// 표시용 세션 이름: 루틴명 > 부위 구성(최다 2개, 동수는 등장순) > '오늘 운동'. 저장하지 않는 표시 전용 값.
export function sessionTitle(session: Session, exMap: Map<string, Exercise>): string {
  if (session.routineName) return session.routineName;
  const counts = new Map<string, number>();
  for (const e of session.entries) {
    const part = exMap.get(e.exerciseId)?.bodyPart;
    if (part) counts.set(part, (counts.get(part) ?? 0) + 1);
  }
  const parts = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([p]) => p);
  return parts.length > 0 ? `${parts.join('·')} 운동` : '오늘 운동';
}
```

`src/screens/HistoryScreen.tsx` — import에 `sessionTitle` 추가, 세션 목록의 `{s.routineName ?? '오늘 운동'}`을 `{sessionTitle(s, exMap)}`으로 교체.

`src/screens/SummaryScreen.tsx` — import에 `sessionTitle`(`../db/sessions`) 추가, 헤더의 `{session.routineName ?? '오늘 운동'}`을 `{sessionTitle(session, exMap)}`으로 교체.

`src/screens/HomeScreen.tsx` — import에 `sessionTitle`(`../db/sessions`)과 `listExercises`(`../db/exercises`) 추가, 컴포넌트에 추가:

```tsx
const allExercises = useLiveQuery(() => listExercises({ includeHidden: true }), []) ?? [];
const exMap = new Map(allExercises.map((e) => [e.id, e]));
```

진행 중 카드의 `{active.routineName ?? '오늘 운동'}` → `{sessionTitle(active, exMap)}`, 달력 목록의 `{s.routineName ?? '오늘 운동'}` → `{sessionTitle(s, exMap)}`.

- [ ] **Step 4: 테스트 통과 확인**

Run: 위 4개 파일 + `npm test` 전체
Expected: PASS (기존 145 + 새 4)

- [ ] **Step 5: 커밋**

```bash
git add src/db/sessions.ts src/db/sessions.test.ts src/screens/HistoryScreen.tsx src/screens/HistoryScreen.test.tsx src/screens/SummaryScreen.tsx src/screens/SummaryScreen.test.tsx src/screens/HomeScreen.tsx src/screens/HomeScreen.test.tsx
git commit -m "feat: 세션 부위 기반 자동 이름 — 기록·홈·요약 표시 교체"
```

---

### Task 2: 편집 화면 세션 이름 입력

**Files:**
- Modify: `src/screens/EditSessionScreen.tsx`
- Test: `src/screens/EditSessionScreen.test.tsx` (2개 추가)

**Interfaces:**
- Consumes: Task 1의 `sessionTitle`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/screens/EditSessionScreen.test.tsx`에 추가:

```tsx
test('세션 이름을 지정해 저장하면 반영되고 placeholder는 자동 이름이다', async () => {
  const s = await addFinishedSession(1000, ['lib-bench-press']);
  renderAt(`/edit/${s.id}`);
  const nameInput = await screen.findByLabelText('세션 이름');
  expect((nameInput as HTMLInputElement).placeholder).toBe('가슴 운동');
  fireEvent.change(nameInput, { target: { value: '아침 가슴' } });
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  await screen.findByText('요약화면');
  expect((await db.sessions.get(s.id))?.routineName).toBe('아침 가슴');
});

test('세션 이름을 비우고 저장하면 자동 이름으로 돌아간다', async () => {
  const s: Session = {
    id: crypto.randomUUID(), startedAt: 1000, finishedAt: 2000, routineName: '내 이름',
    entries: [{ exerciseId: 'lib-bench-press', sets: [{ weight: 50, reps: 10, completedAt: 1001 }] }],
  };
  await db.sessions.add(s);
  renderAt(`/edit/${s.id}`);
  const nameInput = await screen.findByLabelText('세션 이름');
  expect((nameInput as HTMLInputElement).value).toBe('내 이름');
  fireEvent.change(nameInput, { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  await screen.findByText('요약화면');
  expect((await db.sessions.get(s.id))?.routineName).toBeUndefined();
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/screens/EditSessionScreen.test.tsx`
Expected: 새 2개 FAIL ('세션 이름' 라벨 없음), 기존 PASS

- [ ] **Step 3: 구현**

`src/screens/EditSessionScreen.tsx`:

- import에 `sessionTitle`(`../db/sessions` — 기존 import 줄 확장) 추가
- state 추가: `const [name, setName] = useState('');`
- 세션 로드 시(`setSession(s)` 옆): `setName(s.routineName ?? '');`
- 렌더 상단(제목 아래)에 필드 추가:

```tsx
<div className="field">
  <label htmlFor="session-name">세션 이름</label>
  <input
    id="session-name"
    placeholder={sessionTitle({ ...session, routineName: undefined }, exMap)}
    value={name}
    onChange={(e) => setName(e.target.value)}
  />
</div>
```

- `save()`의 `saveSession` 호출을 이름 포함으로 교체:

```tsx
await saveSession({
  ...session,
  routineName: name.trim() === '' ? undefined : name.trim(),
  entries: cleaned,
});
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/screens/EditSessionScreen.test.tsx`
Expected: PASS (기존 + 2)

- [ ] **Step 5: 커밋**

```bash
git add src/screens/EditSessionScreen.tsx src/screens/EditSessionScreen.test.tsx
git commit -m "feat: 편집 화면 세션 이름 지정 — 비우면 자동 이름 복귀"
```

---

### Task 3: 전체 검증

- [ ] **Step 1:** `npm test` → 전체 PASS (기존 145 + 신규 6 = 151)
- [ ] **Step 2:** `npm run build` → 에러 없음
- [ ] **Step 3:** 실패 시 수정 후 `git add -A src && git commit -m "fix: 세션 이름 통합 검증 수정"`
