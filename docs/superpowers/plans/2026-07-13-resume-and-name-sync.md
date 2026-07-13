# 세션 이어서 하기 + 이름 동기화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 실수로 완료한 세션을 요약 화면에서 재개할 수 있게 하고, "리버스 머신 플라이"를 "리버스 펙덱 플라이"로 개명하며 개명이 기존 사용자에게 반영되는 시드 이름 동기화를 추가한다.

**Architecture:** `resumeSession`(finishedAt 제거)과 SummaryScreen 버튼(오늘 완료만). 시드는 `LIBRARY_VERSION=3` + 내장 운동 name/bodyPart/equipment를 라이브러리 값으로 `bulkPut` 동기화 (isHidden 유지, 커스텀 무변경).

**Tech Stack:** React 18 + TypeScript, Dexie, vitest + fake-indexeddb

**스펙:** `docs/superpowers/specs/2026-07-13-resume-session-and-name-sync-design.md`

## Global Constraints

- DB 스키마 변경 금지, 새 npm 의존성 추가 금지, UI 문구는 한국어
- 재개 버튼은 `finishedAt`이 **오늘**(로컬 `toDateString` 비교)일 때만, 활성 세션 존재 시 `alert('진행 중인 운동을 먼저 완료하세요')`
- 이름 동기화는 내장(non-custom) 행만, `isHidden` 유지
- 기존 테스트 중 libraryVersion 값 단언(2)은 3으로 갱신 필요 (`exercises.test.ts`, `backup.test.ts`) — 그 외 무변경
- 테스트 실행: `npx vitest run <파일경로>` (전체는 `npm test`)

---

### Task 1: 개명 + 시드 이름 동기화

**Files:**
- Modify: `scripts/library-ko.json`, `src/data/exercise-library.json` (개명), `src/db/exercises.ts` (LIBRARY_VERSION 3 + 동기화)
- Test: `src/data/exercise-library.test.ts`, `src/db/exercises.test.ts` (추가), `src/db/backup.test.ts` (버전 단언 3으로)

**Interfaces:**
- Consumes: 기존 `seedLibrary`/`library` JSON
- Produces: 없음 (Task 2와 독립)

- [ ] **Step 1: 실패하는 테스트 작성**

`src/data/exercise-library.test.ts`에 추가:

```ts
test('리버스 펙덱 플라이가 존재한다', () => {
  expect(library.some((x) => x.name === '리버스 펙덱 플라이')).toBe(true);
});
```

`src/db/exercises.test.ts`에 추가:

```ts
test('이름 동기화: 옛 이름 내장 행이 갱신되고 숨김·커스텀은 유지된다', async () => {
  await db.exercises.bulkAdd([
    {
      id: 'lib-reverse-machine-flyes', name: '리버스 머신 플라이',
      bodyPart: '어깨', equipment: '머신',
      imagePath: 'exercises/reverse-machine-flyes.webp', isCustom: false, isHidden: true,
    },
    {
      id: 'custom-1', name: '내 커스텀 운동',
      bodyPart: '가슴', equipment: '기타', iconKey: 'barbell', isCustom: true, isHidden: false,
    },
  ]);
  await db.meta.put({ key: 'libraryVersion', value: 2 });
  await seedLibrary();
  const r = await db.exercises.get('lib-reverse-machine-flyes');
  expect(r?.name).toBe('리버스 펙덱 플라이');
  expect(r?.isHidden).toBe(true);
  expect((await db.exercises.get('custom-1'))?.name).toBe('내 커스텀 운동');
  expect((await db.meta.get('libraryVersion'))?.value).toBe(3);
});
```

(이 파일의 기존 v1 마이그레이션 테스트에 `expect(...libraryVersion...).toBe(2)` 단언이 있으면 `LIBRARY_VERSION` import로 대체하거나 3으로 갱신)

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/data/exercise-library.test.ts src/db/exercises.test.ts`
Expected: 새 2개 FAIL (이름 없음 / 동기화 안 됨)

- [ ] **Step 3: 개명 (두 JSON 동일 치환)**

```bash
node -e "
const fs = require('fs');
for (const f of ['scripts/library-ko.json', 'src/data/exercise-library.json']) {
  const s = fs.readFileSync(f, 'utf8');
  if (!s.includes('리버스 머신 플라이')) { console.error('대상 없음: ' + f); process.exit(1); }
  fs.writeFileSync(f, s.replaceAll('리버스 머신 플라이', '리버스 펙덱 플라이'));
}
console.log('✓ 개명 완료');
"
```

- [ ] **Step 4: seedLibrary 동기화 구현**

`src/db/exercises.ts` — `LIBRARY_VERSION = 3`으로 올리고 `seedLibrary`를 다음으로 교체:

```ts
export async function seedLibrary(): Promise<void> {
  const meta = await db.meta.get('libraryVersion');
  if (meta && meta.value >= LIBRARY_VERSION) return;
  const existing = await db.exercises.toArray();
  const byId = new Map(existing.map((e) => [e.id, e]));
  const rows: Exercise[] = library
    .map((x) => ({
      id: `lib-${x.id}`,
      name: x.name,
      bodyPart: x.bodyPart as BodyPart,
      equipment: x.equipment as Equipment,
      imagePath: `exercises/${x.id}.webp`,
      isCustom: false,
      isHidden: false,
    }))
    .filter((r) => !byId.has(r.id));
  await db.exercises.bulkAdd(rows);
  // 내장 운동의 이름·부위·기구를 라이브러리와 동기화 (숨김 상태는 사용자 것 유지)
  const updates: Exercise[] = [];
  for (const x of library) {
    const cur = byId.get(`lib-${x.id}`);
    if (!cur || cur.isCustom) continue;
    if (cur.name !== x.name || cur.bodyPart !== x.bodyPart || cur.equipment !== x.equipment) {
      updates.push({
        ...cur,
        name: x.name,
        bodyPart: x.bodyPart as BodyPart,
        equipment: x.equipment as Equipment,
      });
    }
  }
  if (updates.length > 0) await db.exercises.bulkPut(updates);
  await db.meta.put({ key: 'libraryVersion', value: LIBRARY_VERSION });
}
```

`src/db/backup.test.ts`의 `libraryVersion` 단언 값 2를 3으로 갱신.

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run src/data/exercise-library.test.ts src/db/exercises.test.ts src/db/backup.test.ts`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add scripts/library-ko.json src/data/exercise-library.json src/data/exercise-library.test.ts src/db/exercises.ts src/db/exercises.test.ts src/db/backup.test.ts
git commit -m "feat: 리버스 펙덱 플라이 개명 + 시드 이름 동기화 (v3)"
```

---

### Task 2: resumeSession + 요약 화면 이어서 하기

**Files:**
- Modify: `src/db/sessions.ts`, `src/screens/SummaryScreen.tsx`
- Test: `src/db/sessions.test.ts`, `src/screens/SummaryScreen.test.tsx` (추가)

**Interfaces:**
- Consumes: 기존 `getActiveSession`
- Produces: `resumeSession(id: string): Promise<boolean>`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/db/sessions.test.ts` — import에 `resumeSession` 추가, 파일 끝에:

```ts
test('resumeSession은 완료 세션을 다시 활성화한다', async () => {
  const a = await addFinishedSession(1000, 'ex1', [{ weight: 50, reps: 10 }]);
  expect(await resumeSession(a.id)).toBe(true);
  const active = await getActiveSession();
  expect(active?.id).toBe(a.id);
  expect(active?.finishedAt).toBeUndefined();
});

test('resumeSession은 활성 세션이 있으면 거부하고 아무것도 바꾸지 않는다', async () => {
  const a = await addFinishedSession(1000, 'ex1', [{ weight: 50, reps: 10 }]);
  await startSession();
  expect(await resumeSession(a.id)).toBe(false);
  expect((await db.sessions.get(a.id))?.finishedAt).toBeDefined();
});

test('resumeSession은 없는 id·미완료 세션에 false', async () => {
  expect(await resumeSession('없는세션')).toBe(false);
  const s = await startSession();
  expect(await resumeSession(s.id)).toBe(false);
});
```

`src/screens/SummaryScreen.test.tsx` — 상단 import에 `fireEvent` 추가, `import { getActiveSession } from '../db/sessions';` 추가, 파일 끝에:

```tsx
test('오늘 완료한 세션은 이어서 하기로 재개된다', async () => {
  const cur = await addFinishedSession(Date.now() - 3_600_000, 'lib-bench-press', [{ weight: 60, reps: 10 }]);
  render(
    <MemoryRouter initialEntries={[`/summary/${cur.id}`]}>
      <Routes>
        <Route path="/" element={<div>홈화면</div>} />
        <Route path="/session" element={<div>세션화면</div>} />
        <Route path="/summary/:sessionId" element={<SummaryScreen />} />
      </Routes>
    </MemoryRouter>,
  );
  fireEvent.click(await screen.findByRole('button', { name: '이어서 하기' }));
  expect(await screen.findByText('세션화면')).toBeInTheDocument();
  expect((await getActiveSession())?.id).toBe(cur.id);
});

test('과거에 완료한 세션에는 이어서 하기가 없다', async () => {
  const old = await addFinishedSession(Date.now() - 2 * 86_400_000, 'lib-squat', [{ weight: 80, reps: 5 }]);
  renderAt(`/summary/${old.id}`);
  await screen.findByText('스쿼트');
  expect(screen.queryByRole('button', { name: '이어서 하기' })).not.toBeInTheDocument();
});
```

(참고: 기존 `addFinishedSession` 헬퍼는 `finishedAt = startedAt + 3600_000` — 첫 테스트는 finishedAt이 지금, 둘째는 이틀 전이 됨)

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/db/sessions.test.ts src/screens/SummaryScreen.test.tsx`
Expected: 새 5개 FAIL (`resumeSession` 없음 / 버튼 없음), 기존 PASS

- [ ] **Step 3: 구현**

`src/db/sessions.ts` 파일 끝에 추가:

```ts
export async function resumeSession(id: string): Promise<boolean> {
  const existing = await getActiveSession();
  if (existing) return false;
  const s = await db.sessions.get(id);
  if (!s || s.finishedAt === undefined) return false;
  const active: Session = { ...s };
  delete active.finishedAt;
  await db.sessions.put(active);
  return true;
}
```

`src/screens/SummaryScreen.tsx`:

import 추가:

```tsx
import { resumeSession } from '../db/sessions';
```

`if (!session) return null;` 아래에 추가:

```tsx
const canResume = session.finishedAt !== undefined
  && new Date(session.finishedAt).toDateString() === new Date().toDateString();

async function resume() {
  if (!session) return;
  const ok = await resumeSession(session.id);
  if (!ok) {
    window.alert('진행 중인 운동을 먼저 완료하세요');
    return;
  }
  navigate('/session', { replace: true });
}
```

기존 확인 버튼 줄을 다음으로 교체:

```tsx
<div className="btn-row">
  <button className="btn btn-primary" onClick={() => navigate('/')}>확인</button>
  {canResume && (
    <button className="btn btn-ghost" onClick={() => void resume()}>이어서 하기</button>
  )}
</div>
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/db/sessions.test.ts src/screens/SummaryScreen.test.tsx`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/db/sessions.ts src/db/sessions.test.ts src/screens/SummaryScreen.tsx src/screens/SummaryScreen.test.tsx
git commit -m "feat: 요약 화면 이어서 하기 — 오늘 완료 세션 재개"
```

---

### Task 3: 전체 검증

- [ ] **Step 1:** `npm test` → 전체 PASS (기존 103 + 신규 ≈7)
- [ ] **Step 2:** `npm run build` → 에러 없음
- [ ] **Step 3:** 실패 시 수정 후 `git add -A src scripts && git commit -m "fix: 재개·이름 동기화 통합 검증 수정"`
