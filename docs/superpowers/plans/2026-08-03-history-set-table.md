# 기록 탭 세트 표 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기록 탭 세션 펼침 상세를 운동명 헤더 + 3열 세트 표로 개편, 접힘 행에 ▾/▴ 표시.

**Architecture:** `HistoryScreen` 펼침 렌더 블록 교체 + `.set-view` CSS 1개. 데이터·요약 로직 무변경.

**Tech Stack:** React 18 + TypeScript, vitest

**스펙:** `docs/superpowers/specs/2026-08-03-history-set-table-design.md`

## Global Constraints

- 세션 펼침 상세만 변경 — "운동별로 보기"(fmtSets)·요약 줄·수정하기/삭제 버튼·race 가드 무변경
- 무게는 `kgToDisplay`, 헤더 단위는 `getWeightUnit()` — kg 모드 기존 테스트 무변경 통과 (세션 행 매칭이 정규식임을 활용, ▾ 추가로 깨지는 정확 매칭이 있으면 원인 보고 후 갱신)
- lb 테스트는 localStorage 정리
- 테스트 실행: `npx vitest run <파일경로>` (전체는 `npm test`)

---

### Task 1: 펼침 상세 세트 표

**Files:**
- Modify: `src/screens/HistoryScreen.tsx`, `src/styles.css`
- Test: `src/screens/HistoryScreen.test.tsx` (2개 추가)

- [ ] **Step 1: 실패하는 테스트 작성**

`src/screens/HistoryScreen.test.tsx` — import에 `setWeightUnit`(`../db/weightUnit`) 추가, 파일 끝에:

```tsx
test('세션을 펼치면 세트 표(세트·무게·횟수)가 보인다', async () => {
  await addFinishedSession(1000, 'lib-bench-press', [
    { weight: 60, reps: 10 },
    { weight: 62.5, reps: 8 },
  ]);
  renderScreen();
  fireEvent.click(await screen.findByText(/1개 운동/));
  expect(await screen.findByText('무게(kg)')).toBeInTheDocument();
  expect(screen.getByText('세트')).toBeInTheDocument();
  expect(screen.getByText('62.5')).toBeInTheDocument(); // 2세트 무게가 표 셀로
});

test('lb 모드: 세트 표가 파운드로 표시된다', async () => {
  setWeightUnit('lb');
  try {
    await addFinishedSession(1000, 'lib-bench-press', [{ weight: 60, reps: 10 }]);
    renderScreen();
    fireEvent.click(await screen.findByText(/1개 운동/));
    expect(await screen.findByText('무게(lb)')).toBeInTheDocument();
    expect(screen.getByText('132.3')).toBeInTheDocument();
  } finally {
    localStorage.removeItem('wt-weight-unit');
  }
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/screens/HistoryScreen.test.tsx`
Expected: 새 2개 FAIL (표 헤더 없음), 기존 PASS

- [ ] **Step 3: 구현**

`src/styles.css` — `.hist-row .d { ... }` 근처에 추가:

```css
.set-view { display: grid; grid-template-columns: 40px 1fr 1fr; gap: 6px; text-align: center; font-size: 13.5px; font-weight: 600; }
```

`src/screens/HistoryScreen.tsx` — import에 `getWeightUnit, kgToDisplay`가 없다면 추가(`../db/weightUnit` — 무게 단위 작업에서 이미 있을 수 있음), 컴포넌트에 `const unit = getWeightUnit();`가 없다면 추가.

접힘 행의 좌측 span을 ▾/▴ 포함으로 교체:

```tsx
<span>{sessionTitle(s, exMap)} · {s.entries.length}개 운동 {openId === s.id ? '▴' : '▾'}</span>
```

펼침 상세의 entries 렌더 블록(`{s.entries.map((e, i) => ...)}`)을 다음으로 교체 (요약 line 계산은 기존 그대로 유지):

```tsx
{s.entries.map((e, i) => {
  const p = openSummary?.id === s.id ? openSummary.list[i] : undefined;
  const line = p
    ? (p.prevVolume === undefined
        ? `볼륨 ${kgToDisplay(p.volume)}${unit} · 최고 ${kgToDisplay(p.maxWeight)}${unit} · 첫 기록`
        : `볼륨 ${kgToDisplay(p.volume)}${unit} ${fmtVolumeDelta(p.volume, p.prevVolume)} · 최고 ${kgToDisplay(p.maxWeight)}${unit} ${fmtWeightDelta(p.maxWeight, p.prevMaxWeight ?? 0)}`)
    : null;
  return (
    <div key={i} className="hist-row" style={{ display: 'block' }}>
      <div style={{ fontWeight: 700 }}>
        {exMap.get(e.exerciseId)?.name ?? '삭제된 운동'}{p?.isPR ? ' 🏆' : ''}
      </div>
      <div className="set-view d" style={{ marginTop: 6 }}>
        <span>세트</span><span>무게({unit})</span><span>횟수</span>
      </div>
      {e.sets.map((set, j) => (
        <div key={j} className="set-view" style={{ marginTop: 4 }}>
          <span className="d">{j + 1}</span>
          <span>{kgToDisplay(set.weight)}</span>
          <span>{set.reps}</span>
        </div>
      ))}
      {line && <div className="d" style={{ fontSize: 12, marginTop: 6 }}>{line}</div>}
    </div>
  );
})}
```

(주의: 요약 line 문자열은 무게 단위 작업에서 이미 이 형태로 변환되어 있음 — 기존 코드의 line 계산을 그대로 옮기고 우측 `fmtSets` span만 제거하는 것이 핵심. `fmtSets` 함수 자체는 "운동별로 보기"에서 계속 사용하므로 삭제 금지)

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/screens/HistoryScreen.test.tsx`
Expected: PASS (기존 + 새 2)

- [ ] **Step 5: 커밋**

```bash
git add src/screens/HistoryScreen.tsx src/screens/HistoryScreen.test.tsx src/styles.css
git commit -m "feat: 기록 탭 펼침 상세 — 세트 표(세트·무게·횟수)와 펼침 표시"
```

---

### Task 2: 전체 검증

- [ ] **Step 1:** `npm test` → 전체 PASS (기존 164 + 신규 2 = 166)
- [ ] **Step 2:** `npm run build` → 에러 없음
- [ ] **Step 3:** 실패 시 수정 후 `git add -A src && git commit -m "fix: 세트 표 통합 검증 수정"`
