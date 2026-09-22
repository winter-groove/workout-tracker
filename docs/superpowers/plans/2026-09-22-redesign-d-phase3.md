# D 리디자인 Phase 3 — 운동 중 집중 뷰 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 세션 화면 각 운동 카드에 '집중 존'(현재 세트 큰 숫자·±스텝·세트 도트·큰 세트 완료 버튼)을 추가하고 세트 행 탭으로 포커스를 옮길 수 있게 한다 — 기존 세트 테이블·기능·테스트 계약은 전부 유지.

**Architecture:** 재작성 금지, 레이어 추가. 포커스는 파생값(첫 미완료 세트) + 사용자 오버라이드 state 하나. 큰 완료 버튼은 기존 `toggleSet`을 그대로 호출해 드랍 앞 휴식 억제·저장을 자동 승계. 슈퍼세트 그룹은 카드마다 자기 집중 존을 가짐(번갈아 흐름 유지).

**Tech Stack:** React 18 + TypeScript, vitest

**Spec:** `docs/superpowers/specs/2026-09-22-redesign-d-master.md` (Phase 3 절 — 단, "하단 고정 버튼"은 카드 내 큰 버튼으로 구현: 그룹·휴식 타이머·네비 행과의 충돌 회피, 동작 요구는 동일)

## Global Constraints

- **기존 SessionScreen 테스트 30개 무변경 통과가 최우선 게이트** — aria-label 체계(`세트 {라벨} 무게/횟수/완료`), 버튼 이름(＋ 세트 추가/↓ 드랍 추가/− 세트 삭제/운동 빼기/다음 운동/운동 완료/묶기), pill·헤더 문구 전부 불변
- 신규 큰 완료 버튼의 접근 가능한 이름은 `세트 완료` (숫자 없음 — 기존 `/세트 \d+ 완료/` 정규식과 충돌 금지)
- 집중 존 무게 스텝(플레이트 스텝): **kg ±2.5 / lb ±5** (입력칸 미세 스텝 stepFor와 별개), 횟수 ±1, 무게는 0 미만 금지
- 저장은 항상 kg(`displayToKg`), 표시 단위는 `unitFor` — 불변
- Phase 1 토큰만 사용(하드코딩 색 금지), UI 문구 한국어, 새 npm 의존성 금지
- 테스트 실행: `npx vitest run <파일경로>` (전체는 `npm test`, 현재 213개)

---

### Task 1: 집중 존 — SessionScreen 레이어 추가

**Files:**
- Modify: `src/screens/SessionScreen.tsx`, `src/styles.css`
- Test: `src/screens/SessionScreen.test.tsx` (6개 추가, 기존 30개 무변경)

- [ ] **Step 1: 실패하는 테스트 작성**

`src/screens/SessionScreen.test.tsx` 파일 끝에 추가:

```tsx
test('집중 존: 첫 미완료 세트가 큰 숫자로 보인다', async () => {
  const prev = await startSession(routine);
  prev.entries[0].sets = [{ weight: 60, reps: 10, completedAt: Date.now() }];
  const { finishSession } = await import('../db/sessions');
  await finishSession(prev);

  await startSession(routine); // 프리필 60kg×10
  renderScreen();
  await screen.findByText('벤치프레스');
  const zone = await screen.findByRole('group', { name: '현재 세트' });
  expect(zone).toHaveTextContent('세트 1');
  expect(zone).toHaveTextContent('60');
  expect(zone).toHaveTextContent('10회');
});

test('집중 존 스텝: 무게 +2.5/−2.5, 횟수 +1/−1이 저장된다', async () => {
  await startSession(routine); // 기록 없음 → 0kg×10
  renderScreen();
  await screen.findByText('벤치프레스');
  fireEvent.click(screen.getByRole('button', { name: '무게 2.5 올리기' }));
  fireEvent.click(screen.getByRole('button', { name: '무게 2.5 올리기' }));
  fireEvent.click(screen.getByRole('button', { name: '무게 2.5 내리기' }));
  fireEvent.click(screen.getByRole('button', { name: '횟수 1 올리기' }));
  await waitFor(async () => {
    const s = await getActiveSession();
    expect(s?.entries[0].sets[0].weight).toBe(2.5);
    expect(s?.entries[0].sets[0].reps).toBe(11);
  });
  // 0 미만 금지
  fireEvent.click(screen.getByRole('button', { name: '무게 2.5 내리기' }));
  fireEvent.click(screen.getByRole('button', { name: '무게 2.5 내리기' }));
  await waitFor(async () => {
    expect((await getActiveSession())?.entries[0].sets[0].weight).toBe(0);
  });
});

test('집중 존 세트 완료 버튼: 완료 처리 + 휴식 + 다음 세트로 포커스 이동', async () => {
  await startSession(routine); // 벤치프레스 2세트
  renderScreen();
  await screen.findByText('벤치프레스');
  fireEvent.click(screen.getByRole('button', { name: '세트 완료' }));
  await waitFor(async () => {
    expect((await getActiveSession())?.entries[0].sets[0].completedAt).toBeDefined();
  });
  expect(screen.getByText('건너뛰기')).toBeInTheDocument(); // 휴식 시작
  expect(screen.getByRole('group', { name: '현재 세트' })).toHaveTextContent('세트 2'); // 포커스 이동
});

test('집중 존: 드랍이 뒤따르는 세트를 큰 버튼으로 완료하면 휴식이 뜨지 않는다', async () => {
  const s = await startSession(routine);
  s.entries[0].sets = [
    { weight: 70, reps: 8 },
    { weight: 56, reps: 8, isDrop: true },
  ];
  await saveSession(s);
  renderScreen();
  await screen.findByText('벤치프레스');
  fireEvent.click(screen.getByRole('button', { name: '세트 완료' }));
  await waitFor(async () => {
    expect((await getActiveSession())?.entries[0].sets[0].completedAt).toBeDefined();
  });
  expect(screen.queryByText('건너뛰기')).not.toBeInTheDocument(); // 억제 유지
  expect(screen.getByRole('group', { name: '현재 세트' })).toHaveTextContent('세트 1-1'); // 드랍으로 포커스
});

test('세트 번호를 탭하면 그 세트로 포커스가 옮겨진다', async () => {
  await startSession(routine); // 2세트
  renderScreen();
  await screen.findByText('벤치프레스');
  fireEvent.click(screen.getByRole('button', { name: '세트 2 선택' }));
  expect(screen.getByRole('group', { name: '현재 세트' })).toHaveTextContent('세트 2');
});

test('모든 세트를 완료하면 집중 존 버튼이 완료 상태가 된다', async () => {
  const single: Routine = {
    id: 'rz', name: '한 세트',
    items: [{ exerciseId: 'lib-bench-press', defaultSets: 1 }],
  };
  await startSession(single);
  renderScreen();
  await screen.findByText('벤치프레스');
  fireEvent.click(screen.getByRole('button', { name: '세트 완료' }));
  expect(await screen.findByRole('button', { name: '모든 세트 완료' })).toBeDisabled();
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/screens/SessionScreen.test.tsx`
Expected: 신규 6개 FAIL (집중 존 없음), 기존 30개 PASS

- [ ] **Step 3: 구현**

`src/styles.css` — `.set-head, .set-row` 블록 위에 추가:

```css
.focus-zone { background: var(--surface-2); border-radius: 16px; padding: 14px 16px; margin-top: 12px; display: flex; flex-direction: column; gap: 10px; }
.focus-zone .fz-label { font-size: 12px; font-weight: 800; letter-spacing: 0.05em; color: var(--muted); }
.focus-zone .fz-nums { display: flex; align-items: center; justify-content: center; gap: 10px; }
.focus-zone .fz-num { font-size: 40px; font-weight: 800; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.focus-zone .fz-unit { font-size: 16px; color: var(--muted); font-weight: 700; }
.focus-zone .fz-x { font-size: 22px; color: var(--gray-3); font-weight: 800; }
.focus-zone .fz-step { width: 40px; height: 40px; border-radius: 12px; background: var(--surface); color: var(--text-2); font-size: 17px; font-weight: 800; display: flex; align-items: center; justify-content: center; }
.fz-dots { display: flex; gap: 7px; justify-content: center; align-items: center; }
.fz-dots .fd { width: 10px; height: 10px; border-radius: 50%; background: var(--border); }
.fz-dots .fd.done { background: var(--accent); }
.fz-dots .fd.cur { width: 13px; height: 13px; background: transparent; border: 2.5px solid var(--accent); box-sizing: border-box; }
.fz-dots .fd.drop { border-radius: 3px; }
.fz-go { height: 50px; border-radius: 14px; background: var(--accent); color: var(--on-accent); font-size: 15.5px; font-weight: 800; width: 100%; }
.fz-go:disabled { background: var(--surface-2); color: var(--muted); }
.set-row .n-btn { border: none; background: none; padding: 6px 0; font-size: 13px; font-weight: 700; color: var(--muted); cursor: pointer; width: 100%; }
.set-row .n-btn.on { color: var(--accent); }
```

`src/screens/SessionScreen.tsx`:

1. 파일 상단(컴포넌트 밖)에 플레이트 스텝 상수:

```ts
// 집중 존 무게 스텝(플레이트 단위) — 입력칸 미세 스텝(stepFor)과 별개
const FOCUS_STEP: Record<WeightUnit, number> = { kg: 2.5, lb: 5 };
```

2. 컴포넌트 state에 포커스 오버라이드 추가 (`showPicker` 옆):

```ts
  const [focusSel, setFocusSel] = useState<{ entryIdx: number; setIdx: number } | null>(null);
```

3. `toggleSet` 아래에 헬퍼 추가:

```ts
  // 카드의 포커스 세트: 사용자가 고른 세트 > 첫 미완료 세트 > 마지막 세트
  function focusedSetIdx(entryIdx: number): number {
    if (!session) return 0;
    const sets = session.entries[entryIdx].sets;
    if (focusSel && focusSel.entryIdx === entryIdx && focusSel.setIdx < sets.length) return focusSel.setIdx;
    const firstOpen = sets.findIndex((s) => s.completedAt === undefined);
    return firstOpen === -1 ? sets.length - 1 : firstOpen;
  }

  function bumpFocused(entryIdx: number, field: 'weight' | 'reps', deltaDisplay: number, u: WeightUnit) {
    if (!session) return;
    const j = focusedSetIdx(entryIdx);
    const s = session.entries[entryIdx].sets[j];
    if (field === 'weight') {
      const next = Math.max(0, kgToDisplay(s.weight, u) + deltaDisplay);
      patchSet(entryIdx, j, { weight: displayToKg(next, u) });
    } else {
      patchSet(entryIdx, j, { reps: Math.max(0, s.reps + deltaDisplay) });
    }
  }

  function completeFocused(entryIdx: number) {
    if (!session) return;
    const j = focusedSetIdx(entryIdx);
    if (session.entries[entryIdx].sets[j].completedAt !== undefined) return;
    setFocusSel(null); // 완료 후엔 파생 포커스(다음 미완료)로
    toggleSet(entryIdx, j);
  }
```

4. `removeEntry`의 인덱스 조정 뒤와 `addExercise` 뒤에 각각 `setFocusSel(null);` 추가 (엔트리 구조가 바뀌면 오버라이드 무효화). `removeSet`도 마지막 세트를 지우므로 `setFocusSel(null);` 추가.

5. 렌더 — 카드 내부, `{rec?.last && (… 📈 pill …)}` 블록 **아래**·`<div className="set-head" …>` **위**에 집중 존 삽입 (그 카드의 `labels`, `u`, `e`, `entryIdx` 사용):

```tsx
                {e.sets.length > 0 && (() => {
                  const fj = focusedSetIdx(entryIdx);
                  const fs = e.sets[fj];
                  const allDone = e.sets.every((s) => s.completedAt !== undefined);
                  return (
                    <div className="focus-zone" role="group" aria-label="현재 세트">
                      <div className="fz-label">세트 {labels[fj]}{fs.isDrop ? ' · 드랍' : ''}</div>
                      <div className="fz-nums">
                        <button className="fz-step" aria-label={`무게 ${FOCUS_STEP[u]} 내리기`} onClick={() => bumpFocused(entryIdx, 'weight', -FOCUS_STEP[u], u)}>−</button>
                        <span className="fz-num">{kgToDisplay(fs.weight, u)}<span className="fz-unit">{u}</span></span>
                        <button className="fz-step" aria-label={`무게 ${FOCUS_STEP[u]} 올리기`} onClick={() => bumpFocused(entryIdx, 'weight', FOCUS_STEP[u], u)}>＋</button>
                        <span className="fz-x">×</span>
                        <button className="fz-step" aria-label="횟수 1 내리기" onClick={() => bumpFocused(entryIdx, 'reps', -1, u)}>−</button>
                        <span className="fz-num">{fs.reps}<span className="fz-unit">회</span></span>
                        <button className="fz-step" aria-label="횟수 1 올리기" onClick={() => bumpFocused(entryIdx, 'reps', 1, u)}>＋</button>
                      </div>
                      <div className="fz-dots" role="img" aria-label={`세트 진행 ${e.sets.filter((s) => s.completedAt !== undefined).length} / ${e.sets.length}`}>
                        {e.sets.map((s, j) => (
                          <span key={j} className={`fd${s.completedAt !== undefined ? ' done' : ''}${j === fj ? ' cur' : ''}${s.isDrop ? ' drop' : ''}`} />
                        ))}
                      </div>
                      <button className="fz-go" disabled={allDone} onClick={() => completeFocused(entryIdx)}>
                        {allDone ? '모든 세트 완료' : '세트 완료'}
                      </button>
                    </div>
                  );
                })()}
```

6. 세트 행 번호를 선택 버튼으로 교체 — 기존 `<span className="n">{labels[j]}</span>` 를:

```tsx
                    <button
                      className={`n-btn${focusedSetIdx(entryIdx) === j ? ' on' : ''}`}
                      aria-label={`세트 ${labels[j]} 선택`}
                      onClick={() => setFocusSel({ entryIdx, setIdx: j })}
                    >
                      {labels[j]}
                    </button>
```

(`.set-row .n` 클래스 규칙은 남겨둠 — 삭제하지 말 것: EditSessionScreen이 계속 사용)

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/screens/SessionScreen.test.tsx`
Expected: **36 전부 PASS** (기존 30 무변경 + 신규 6). 실패한 기존 테스트가 있으면 구현을 고치고 테스트는 건드리지 말 것.

- [ ] **Step 5: 커밋**

```bash
git add src/screens/SessionScreen.tsx src/screens/SessionScreen.test.tsx src/styles.css
git commit -m "feat: 운동 중 집중 존 — 현재 세트 큰 숫자·플레이트 스텝·세트 도트·큰 완료 버튼"
```

---

### Task 2: 전체 검증

- [ ] **Step 1:** `npm test` → 전체 PASS (213 + 6 = 219)
- [ ] **Step 2:** `npx tsc --noEmit`, `npm run build` → 에러 없음
- [ ] **Step 3:** 실패 시 수정 후 `git add -A src && git commit -m "fix: Phase 3 통합 검증 수정"`
