# 관리 탭 운동 목록 축약 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리 탭의 736개 운동 목록을 기본 접힘 + 부위 칩 + 30개 페이징으로 축약한다.

**Architecture:** `ManageScreen`만 수정 — `listOpen`/`exFilter`/`visibleCount` state 추가, 필터 체인(숨김→부위→검색) 후 slice(0, visibleCount). 헤더를 토글 버튼화.

**Tech Stack:** React 18 + TypeScript, vitest + @testing-library/react

**스펙:** `docs/superpowers/specs/2026-07-10-manage-exercise-list-collapse-design.md`

## Global Constraints

- 새 npm 의존성 추가 금지, UI 문구는 한국어
- 기본 접힘, 30개씩, 필터·검색·숨김 토글 변경 시 visibleCount 30 리셋
- 부위 칩은 picker와 동일한 `chips`/`chip on` 클래스 재사용
- 기존 ManageScreen 검색 테스트는 "펼침 클릭 추가"로만 수정
- 테스트 실행: `npx vitest run <파일경로>` (전체는 `npm test`)

---

### Task 1: ManageScreen 접힘·칩·페이징

**Files:**
- Modify: `src/screens/ManageScreen.tsx`
- Test: `src/screens/ManageScreen.test.tsx` (기존 1개 수정 + 4개 추가)

**Interfaces:**
- Consumes: `BODY_PARTS`/`BodyPart` (`src/types.ts`)
- Produces: 없음 (말단 UI)

- [ ] **Step 1: 실패하는 테스트 작성**

`src/screens/ManageScreen.test.tsx` — 기존 테스트 `'운동 목록을 이름으로 검색할 수 있다'`의 render 직후에 펼침 클릭을 추가:

```tsx
fireEvent.click(await screen.findByRole('button', { name: /내 운동 목록/ }));
```

(기존 `await screen.findByText('벤치프레스')` 줄은 `await screen.findByPlaceholderText('운동 이름 검색')`로 교체 — 벤치프레스가 첫 30개에 없을 수 있음. 검색 후 단언은 그대로)

파일 끝에 추가:

```tsx
async function openList() {
  fireEvent.click(await screen.findByRole('button', { name: /내 운동 목록/ }));
  await screen.findByPlaceholderText('운동 이름 검색');
}

test('기본 접힘: 개수 헤더만 보이고 검색창·목록은 없다', async () => {
  render(<MemoryRouter><ManageScreen /></MemoryRouter>);
  expect(await screen.findByRole('button', { name: /내 운동 목록 \(\d+개\)/ })).toBeInTheDocument();
  expect(screen.queryByPlaceholderText('운동 이름 검색')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '숨기기' })).not.toBeInTheDocument();
});

test('펼치면 30개만 보이고 더보기로 30개씩 추가된다', async () => {
  render(<MemoryRouter><ManageScreen /></MemoryRouter>);
  await openList();
  expect(screen.getAllByRole('button', { name: '숨기기' })).toHaveLength(30);
  fireEvent.click(screen.getByRole('button', { name: /더보기/ }));
  expect(screen.getAllByRole('button', { name: '숨기기' })).toHaveLength(60);
});

test('부위 칩으로 필터된다', async () => {
  render(<MemoryRouter><ManageScreen /></MemoryRouter>);
  await openList();
  fireEvent.change(screen.getByPlaceholderText('운동 이름 검색'), { target: { value: '벤치프레스' } });
  fireEvent.click(screen.getByRole('button', { name: '하체' }));
  expect(await screen.findByText('검색 결과가 없어요')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '가슴' }));
  expect(await screen.findByText('벤치프레스')).toBeInTheDocument();
});

test('검색어를 바꾸면 더보기 카운트가 리셋된다', async () => {
  render(<MemoryRouter><ManageScreen /></MemoryRouter>);
  await openList();
  fireEvent.click(screen.getByRole('button', { name: /더보기/ }));
  expect(screen.getAllByRole('button', { name: '숨기기' })).toHaveLength(60);
  fireEvent.change(screen.getByPlaceholderText('운동 이름 검색'), { target: { value: '컬' } });
  await waitFor(() => {
    expect(screen.getAllByRole('button', { name: '숨기기' }).length).toBeLessThanOrEqual(30);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/screens/ManageScreen.test.tsx`
Expected: 전부 FAIL (`내 운동 목록 (N개)` 토글 버튼 없음)

- [ ] **Step 3: 구현**

`src/screens/ManageScreen.tsx` 수정.

import 추가:

```tsx
import { BODY_PARTS } from '../types';
import type { BodyPart, Routine } from '../types';
```

(기존 `import type { Routine } from '../types';` 줄은 위로 통합)

state 추가 (`exQuery` 옆):

```tsx
const [listOpen, setListOpen] = useState(false);
const [exFilter, setExFilter] = useState<BodyPart | '전체'>('전체');
const [visibleCount, setVisibleCount] = useState(30);
```

리셋 헬퍼 추가 (`visibleExercises` 자리):

```tsx
function changeQuery(q: string) {
  setExQuery(q);
  setVisibleCount(30);
}

function changeFilter(f: BodyPart | '전체') {
  setExFilter(f);
  setVisibleCount(30);
}

function changeShowHidden(v: boolean) {
  setShowHidden(v);
  setVisibleCount(30);
}

const filteredExercises = (showHidden ? exercises : exercises.filter((e) => !e.isHidden))
  .filter((e) => exFilter === '전체' || e.bodyPart === exFilter)
  .filter((e) => exQuery.trim() === '' || e.name.includes(exQuery.trim()));
const shownExercises = filteredExercises.slice(0, visibleCount);
```

(기존 `const visibleExercises = ...` 선언은 삭제)

"내 운동 목록" 카드 전체를 다음으로 교체:

```tsx
<div className="card">
  <button
    className="card-h"
    style={{
      display: 'flex', justifyContent: 'space-between', width: '100%',
      background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left',
    }}
    onClick={() => setListOpen(!listOpen)}
  >
    <span>내 운동 목록 ({exercises.length}개)</span>
    <span>{listOpen ? '▴' : '▾'}</span>
  </button>
  {listOpen && (
    <>
      <label style={{ fontSize: 12, color: 'var(--gray-5)' }}>
        <input
          type="checkbox" checked={showHidden}
          onChange={(e) => changeShowHidden(e.target.checked)}
        /> 숨긴 운동 표시
      </label>
      <input
        className="search" placeholder="운동 이름 검색" style={{ marginTop: 8 }}
        value={exQuery} onChange={(e) => changeQuery(e.target.value)}
      />
      <div className="chips" style={{ marginTop: 8 }}>
        {(['전체', ...BODY_PARTS] as const).map((b) => (
          <button key={b} className={`chip ${exFilter === b ? 'on' : ''}`} onClick={() => changeFilter(b)}>
            {b}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
        {shownExercises.map((ex) => (
          <div key={ex.id} className="ex-row" style={{ boxShadow: 'none', border: '1px solid var(--gray-1)' }}>
            <ExerciseImage exercise={ex} />
            <div>
              <div className="nm">{ex.name}{ex.isHidden ? ' (숨김)' : ''}</div>
              <div className="sb">{ex.bodyPart} · {ex.equipment}{ex.isCustom ? ' · 직접 등록' : ''}</div>
            </div>
            <div className="right">
              {ex.isCustom ? (
                <button
                  className="btn-sm btn btn-danger"
                  onClick={() => window.confirm(`'${ex.name}'을(를) 삭제할까요?`) && void deleteCustomExercise(ex.id)}
                >
                  삭제
                </button>
              ) : (
                <button className="btn-sm btn btn-ghost" onClick={() => void setExerciseHidden(ex.id, !ex.isHidden)}>
                  {ex.isHidden ? '보이기' : '숨기기'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {filteredExercises.length === 0 && <div className="empty">검색 결과가 없어요</div>}
      {filteredExercises.length > visibleCount && (
        <button
          className="btn btn-ghost" style={{ marginTop: 10 }}
          onClick={() => setVisibleCount(visibleCount + 30)}
        >
          더보기 ({filteredExercises.length - visibleCount}개 남음)
        </button>
      )}
      {addingEx ? (
        <div style={{ marginTop: 10 }}>
          <AddExerciseForm onSaved={() => setAddingEx(false)} />
        </div>
      ) : (
        <button className="btn btn-ghost" style={{ marginTop: 10 }} onClick={() => setAddingEx(true)}>
          ＋ 운동 직접 등록
        </button>
      )}
    </>
  )}
</div>
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/screens/ManageScreen.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/screens/ManageScreen.tsx src/screens/ManageScreen.test.tsx
git commit -m "feat: 관리 탭 운동 목록 — 기본 접힘, 부위 칩, 30개 페이징"
```

---

### Task 2: 전체 검증

- [ ] **Step 1:** `npm test` → 전체 PASS (기존 99 + 신규 4 = 103개)
- [ ] **Step 2:** `npm run build` → 에러 없음
- [ ] **Step 3:** 실패 시 수정 후 `git add -A src && git commit -m "fix: 관리 탭 축약 통합 검증 수정"`
