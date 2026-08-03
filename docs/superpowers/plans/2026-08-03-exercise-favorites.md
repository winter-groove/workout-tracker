# 운동 즐겨찾기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 운동별 ★ 즐겨찾기 — picker 최상단 구간과 관리 탭 토글.

**Architecture:** `Exercise.isFavorite?: boolean` + `setExerciseFavorite`. picker 행을 div로 바꿔 우측 별 버튼(전파 차단), 구간을 즐겨찾기→최근(즐겨찾기 제외)→전체로. 숨김 시 즐겨찾기 자동 해제.

**Tech Stack:** React 18 + TypeScript, Dexie, vitest + @testing-library/react

**스펙:** `docs/superpowers/specs/2026-08-03-exercise-favorites-design.md`

## Global Constraints

- Dexie 스토어/인덱스 무변경, 새 npm 의존성 금지, UI 문구 한국어
- 별 버튼 aria-label: `{운동이름} 즐겨찾기`. 행 선택과 전파 분리 (중첩 button 금지 — 행은 div)
- 숨김(true) 시 `isFavorite: false` 동시 설정
- 기존 테스트 151개 무변경 통과
- 테스트 실행: `npx vitest run <파일경로>` (전체는 `npm test`)

---

### Task 1: 데이터 레이어 — isFavorite + 연동 규칙

**Files:**
- Modify: `src/types.ts`, `src/db/exercises.ts`
- Test: `src/db/exercises.test.ts` (추가)

**Interfaces:**
- Produces (Task 2가 사용): `setExerciseFavorite(id: string, favorite: boolean): Promise<void>`, `Exercise.isFavorite?: boolean`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/db/exercises.test.ts` — import에 `setExerciseFavorite, setExerciseHidden` 추가(exercises), `exportData, importData`(`./backup`) 추가, 파일 끝에:

```ts
test('setExerciseFavorite 토글과 숨김 시 자동 해제', async () => {
  await seedLibrary();
  await setExerciseFavorite('lib-bench-press', true);
  expect((await db.exercises.get('lib-bench-press'))?.isFavorite).toBe(true);
  await setExerciseHidden('lib-bench-press', true);
  const hidden = await db.exercises.get('lib-bench-press');
  expect(hidden?.isHidden).toBe(true);
  expect(hidden?.isFavorite).toBe(false);
  await setExerciseHidden('lib-bench-press', false);
  expect((await db.exercises.get('lib-bench-press'))?.isFavorite).toBe(false); // 복원해도 해제 유지
});

test('시드 이름 동기화에서 isFavorite이 보존된다', async () => {
  await db.exercises.add({
    id: 'lib-reverse-machine-flyes', name: '옛 이름', bodyPart: '어깨', equipment: '머신',
    imagePath: 'exercises/reverse-machine-flyes.webp', isCustom: false, isHidden: false, isFavorite: true,
  });
  await db.meta.put({ key: 'libraryVersion', value: 2 });
  await seedLibrary();
  const r = await db.exercises.get('lib-reverse-machine-flyes');
  expect(r?.name).toBe('리버스 펙덱 플라이');
  expect(r?.isFavorite).toBe(true);
});

test('백업 왕복에 isFavorite이 보존된다', async () => {
  await seedLibrary();
  await setExerciseFavorite('lib-squat', true);
  const dump = JSON.parse(JSON.stringify(await exportData()));
  await importData(dump);
  expect((await db.exercises.get('lib-squat'))?.isFavorite).toBe(true);
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/db/exercises.test.ts`
Expected: 새 3개 중 1·3 FAIL (`setExerciseFavorite` 없음), 시드 보존은 타입 에러(isFavorite 미정의) — 기존 PASS

- [ ] **Step 3: 구현**

`src/types.ts` — Exercise에 추가:

```ts
isFavorite?: boolean;
```

`src/db/exercises.ts`:

```ts
export async function setExerciseFavorite(id: string, favorite: boolean): Promise<void> {
  await db.exercises.update(id, { isFavorite: favorite });
}
```

`setExerciseHidden`을 다음으로 교체 (숨김 시 즐겨찾기 해제):

```ts
export async function setExerciseHidden(id: string, hidden: boolean): Promise<void> {
  if (hidden) {
    await db.exercises.update(id, { isHidden: true, isFavorite: false });
  } else {
    await db.exercises.update(id, { isHidden: false });
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/db/exercises.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/types.ts src/db/exercises.ts src/db/exercises.test.ts
git commit -m "feat: 운동 즐겨찾기 데이터 — isFavorite, 숨김 시 해제, 보존 규칙"
```

---

### Task 2: picker 즐겨찾기 구간 + 관리 탭 토글

**Files:**
- Modify: `src/components/ExercisePicker.tsx`, `src/screens/ManageScreen.tsx`
- Test: `src/components/ExercisePicker.test.tsx`, `src/screens/ManageScreen.test.tsx` (추가)

**Interfaces:**
- Consumes: Task 1의 `setExerciseFavorite`, `Exercise.isFavorite`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/components/ExercisePicker.test.tsx` — import에 `setExerciseFavorite`(`../db/exercises`) 추가, 파일 끝에:

```tsx
test('즐겨찾기 운동은 최상단 구간에 표시되고 최근 구간에서 빠진다', async () => {
  await addDone(new Date(2026, 5, 1, 12).getTime(), 'lib-squat');
  await setExerciseFavorite('lib-squat', true);
  await setExerciseFavorite('lib-bench-press', true);
  render(<ExercisePicker onSelect={() => {}} onClose={() => {}} />);
  expect(await screen.findByText('★ 즐겨찾기')).toBeInTheDocument();
  expect(screen.queryByText('최근 한 운동')).not.toBeInTheDocument(); // 유일한 최근(스쿼트)이 즐겨찾기로 이동
  expect(screen.getByText('전체 운동')).toBeInTheDocument();
});

test('별을 탭하면 토글되고 행 선택은 일어나지 않는다', async () => {
  const onSelect = vi.fn();
  render(<ExercisePicker onSelect={onSelect} onClose={() => {}} />);
  fireEvent.click(await screen.findByLabelText('스쿼트 즐겨찾기'));
  await waitFor(async () => {
    expect((await db.exercises.get('lib-squat'))?.isFavorite).toBe(true);
  });
  expect(onSelect).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('스쿼트')); // 행 탭은 여전히 선택
  expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'lib-squat' }));
});
```

`src/screens/ManageScreen.test.tsx`에 추가:

```tsx
test('관리 탭에서 별을 탭하면 즐겨찾기가 토글된다', async () => {
  render(<MemoryRouter><ManageScreen /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: /내 운동 목록/ }));
  await screen.findByPlaceholderText('운동 이름 검색');
  fireEvent.change(screen.getByPlaceholderText('운동 이름 검색'), { target: { value: '스쿼트' } });
  fireEvent.click(await screen.findByLabelText('스쿼트 즐겨찾기'));
  await waitFor(async () => {
    expect((await db.exercises.get('lib-squat'))?.isFavorite).toBe(true);
  });
});
```

(`db` import가 없으면 추가)

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/components/ExercisePicker.test.tsx src/screens/ManageScreen.test.tsx`
Expected: 새 3개 FAIL, 기존 PASS

- [ ] **Step 3: 구현**

`src/components/ExercisePicker.tsx`:

- import에 `setExerciseFavorite` 추가: `import { listExercises, setExerciseFavorite } from '../db/exercises';`
- 구간 계산을 다음으로 교체 (기존 `recent`/`rest` 선언 대체):

```tsx
const favorites = visible.filter((e) => e.isFavorite);
const recent = visible
  .filter((e) => !e.isFavorite && lastDone.has(e.id))
  .sort((a, b) => (lastDone.get(b.id) ?? 0) - (lastDone.get(a.id) ?? 0));
const rest = visible.filter((e) => !e.isFavorite && !lastDone.has(e.id));
```

- 행 렌더 헬퍼 추가 (컴포넌트 안, return 위 — 중첩 button 방지를 위해 행은 div):

```tsx
function renderRow(ex: Exercise, doneAt?: number) {
  return (
    <div
      key={ex.id} className="ex-row" style={{ cursor: 'pointer' }}
      onClick={() => onSelect(ex)}
    >
      <ExerciseImage exercise={ex} />
      <div>
        <div className="nm">{ex.name}</div>
        <div className="sb">
          {ex.bodyPart} · {ex.equipment}{doneAt !== undefined ? ` · ${fmtDone(doneAt)}` : ''}
        </div>
      </div>
      <button
        aria-label={`${ex.name} 즐겨찾기`}
        style={{
          marginLeft: 'auto', background: 'none', border: 'none', padding: '0 6px',
          fontSize: 18, color: ex.isFavorite ? '#f5a623' : 'var(--gray-5)', cursor: 'pointer',
        }}
        onClick={(ev) => {
          ev.stopPropagation();
          void setExerciseFavorite(ex.id, !ex.isFavorite);
        }}
      >
        {ex.isFavorite ? '★' : '☆'}
      </button>
    </div>
  );
}
```

- 목록 렌더 블록(기존 `{recent.length > 0 && ...}`부터 `{rest.map(...)}`까지)을 다음으로 교체:

```tsx
{favorites.length > 0 && (
  <>
    <div className="card-h" style={{ marginTop: 4 }}>★ 즐겨찾기</div>
    {favorites.map((ex) => renderRow(ex, lastDone.get(ex.id)))}
  </>
)}
{recent.length > 0 && (
  <>
    <div className="card-h" style={{ marginTop: favorites.length > 0 ? 12 : 4 }}>최근 한 운동</div>
    {recent.map((ex) => renderRow(ex, lastDone.get(ex.id)))}
  </>
)}
{(favorites.length > 0 || recent.length > 0) && rest.length > 0 && (
  <div className="card-h" style={{ marginTop: 12 }}>전체 운동</div>
)}
{rest.map((ex) => renderRow(ex))}
```

`src/screens/ManageScreen.tsx`:

- import에 `setExerciseFavorite` 추가 (기존 exercises import 줄 확장)
- 운동 행 `.right` 안, 기존 숨기기/삭제 버튼 **앞에** 추가:

```tsx
<button
  className="btn-sm btn btn-ghost"
  aria-label={`${ex.name} 즐겨찾기`}
  onClick={() => void setExerciseFavorite(ex.id, !ex.isFavorite)}
>
  {ex.isFavorite ? '★' : '☆'}
</button>{' '}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/components/ExercisePicker.test.tsx src/screens/ManageScreen.test.tsx`
Expected: PASS (기존 + 새 3). 기존 picker 테스트(행 탭 onSelect, 최근 구간, 직접 등록)가 div 행 구조에서도 그대로 통과해야 함 — 깨지면 원인 분석 후 보고

- [ ] **Step 5: 커밋**

```bash
git add src/components/ExercisePicker.tsx src/components/ExercisePicker.test.tsx src/screens/ManageScreen.tsx src/screens/ManageScreen.test.tsx
git commit -m "feat: 운동 즐겨찾기 — picker 최상단 구간·별 토글, 관리 탭 토글"
```

---

### Task 3: 전체 검증

- [ ] **Step 1:** `npm test` → 전체 PASS (기존 151 + 신규 6 = 157)
- [ ] **Step 2:** `npm run build` → 에러 없음
- [ ] **Step 3:** 실패 시 수정 후 `git add -A src && git commit -m "fix: 즐겨찾기 통합 검증 수정"`
