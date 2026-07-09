# 세트 삭제 버튼 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 세션 화면에서 실수로 추가한 마지막 세트를 삭제하는 "− 세트 삭제" 버튼을 추가한다.

**Architecture:** `SessionScreen`에 `removeSet()` 하나 추가 — 마지막 세트를 잘라내고 기존 `update()`로 저장. 완료된 세트는 confirm을 거치고, 세트 1개면 버튼 disabled. DB/다른 화면 변경 없음.

**Tech Stack:** React 18 + TypeScript, vitest + @testing-library/react + fake-indexeddb

**스펙:** `docs/superpowers/specs/2026-07-09-remove-set-design.md`

## Global Constraints

- DB 스키마 변경 금지, 새 npm 의존성 추가 금지, UI 문구는 한국어
- 완료 세트 삭제 확인 문구는 정확히 `완료한 세트예요. 삭제할까요?`
- 세트 1개면 disabled (0개 방지), 기존 SessionScreen 테스트 13개 유지
- 테스트 실행: `npx vitest run <파일경로>` (전체는 `npm test`)

---

### Task 1: SessionScreen — removeSet + 버튼

**Files:**
- Modify: `src/screens/SessionScreen.tsx`
- Test: `src/screens/SessionScreen.test.tsx` (테스트 2개 추가)

**Interfaces:**
- Consumes: 기존 `update(next: Session)`, `entry`/`idx`/`session` state
- Produces: 없음 (말단 UI)

- [ ] **Step 1: 실패하는 테스트 작성**

`src/screens/SessionScreen.test.tsx` 파일 끝에 추가 (기존 `afterEach(() => vi.restoreAllMocks())` 존재):

```tsx
test('세트 삭제 버튼이 마지막 미완료 세트를 즉시 삭제하고 1개 남으면 비활성화된다', async () => {
  await startSession(routine); // 벤치프레스 defaultSets 2
  renderScreen();
  await screen.findByText('벤치프레스');
  fireEvent.click(screen.getByRole('button', { name: '− 세트 삭제' }));
  await waitFor(async () => {
    const s = await getActiveSession();
    expect(s?.entries[0].sets).toHaveLength(1);
  });
  expect(screen.getByRole('button', { name: '− 세트 삭제' })).toBeDisabled();
});

test('완료된 마지막 세트는 confirm 취소 시 유지, 수락 시 삭제된다', async () => {
  await startSession(routine);
  renderScreen();
  await screen.findByText('벤치프레스');
  fireEvent.click(screen.getByLabelText('세트 2 완료'));
  const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
  fireEvent.click(screen.getByRole('button', { name: '− 세트 삭제' }));
  expect(confirmSpy).toHaveBeenCalledWith('완료한 세트예요. 삭제할까요?');
  expect((await getActiveSession())?.entries[0].sets).toHaveLength(2);
  confirmSpy.mockReturnValue(true);
  fireEvent.click(screen.getByRole('button', { name: '− 세트 삭제' }));
  await waitFor(async () => {
    const s = await getActiveSession();
    expect(s?.entries[0].sets).toHaveLength(1);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/screens/SessionScreen.test.tsx`
Expected: 새 2개 FAIL ('− 세트 삭제' 버튼 없음), 기존 13개 PASS

- [ ] **Step 3: 구현**

`src/screens/SessionScreen.tsx` — `addSet` 함수 아래에 추가:

```tsx
function removeSet() {
  if (!session || !entry || entry.sets.length <= 1) return;
  const last = entry.sets[entry.sets.length - 1];
  if (last.completedAt && !window.confirm('완료한 세트예요. 삭제할까요?')) return;
  const entries = session.entries.map((e, i) =>
    i !== idx ? e : { ...e, sets: e.sets.slice(0, -1) },
  );
  void update({ ...session, entries });
}
```

기존 `＋ 세트 추가` 버튼 줄:

```tsx
<button className="btn btn-ghost" style={{ marginTop: 10 }} onClick={addSet}>＋ 세트 추가</button>
```

을 다음으로 교체:

```tsx
<div className="btn-row" style={{ marginTop: 10 }}>
  <button className="btn btn-ghost" onClick={addSet}>＋ 세트 추가</button>
  <button
    className="btn btn-ghost" disabled={entry.sets.length <= 1} onClick={removeSet}
  >
    − 세트 삭제
  </button>
</div>
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/screens/SessionScreen.test.tsx`
Expected: PASS (15 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/screens/SessionScreen.tsx src/screens/SessionScreen.test.tsx
git commit -m "feat: 세션 화면 마지막 세트 삭제 버튼 — 완료 세트는 확인 후"
```

---

### Task 2: 전체 검증

**Files:** 없음 (검증만)

- [ ] **Step 1: 전체 테스트**

Run: `npm test`
Expected: 전체 PASS (기존 91 + 신규 2 = 93개)

- [ ] **Step 2: 프로덕션 빌드**

Run: `npm run build`
Expected: 에러 없이 dist/ 생성

- [ ] **Step 3: 실패 시 수정 후 커밋**

수정이 있었다면:

```bash
git add -A src
git commit -m "fix: 세트 삭제 통합 검증 수정"
```
