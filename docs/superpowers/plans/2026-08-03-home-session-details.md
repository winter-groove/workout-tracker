# 홈 세트 표 + SessionDetails 공용화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 펼침 상세를 `SessionDetails` 공용 컴포넌트로 추출(기록 탭 리팩터)하고 홈 달력 세션 목록에 동일한 세트 표 펼침을 추가한다.

**Architecture:** SessionDetails가 요약을 자체 로드(마운트 단위) — 세션 전환 race가 구조적으로 소멸. History는 openSummary 상태 제거로 단순화, Home은 openSessionId 토글 + `요약 ›` 버튼 분리.

**Tech Stack:** React 18 + TypeScript, vitest

**스펙:** `docs/superpowers/specs/2026-08-03-home-session-details-design.md`

## Global Constraints

- 기록 탭 기존 테스트 8개 **무변경** 통과 (race 테스트 포함 — deferred mock이 언마운트 구조에서도 성립)
- Home 기존 테스트 2개는 스펙에 명시된 대로만 갱신 (정규식화·`요약 ›` 클릭), 그 외 무변경
- 무게 단위·PR·첫 기록 표시는 기록 탭과 동일 (`kgToDisplay`/`getWeightUnit`)
- UI 문구 한국어, 새 npm 의존성 금지
- 테스트 실행: `npx vitest run <파일경로>` (전체는 `npm test`)

---

### Task 1: SessionDetails 추출 + HistoryScreen 리팩터

**Files:**
- Create: `src/components/SessionDetails.tsx`
- Modify: `src/screens/HistoryScreen.tsx`
- Test: 기존 `src/screens/HistoryScreen.test.tsx` **무변경 통과가 게이트** (신규 테스트 없음 — 동작 보존 리팩터)

**Interfaces:**
- Produces (Task 2가 사용): default export `SessionDetails({ session, exMap }: { session: Session; exMap: Map<string, Exercise> })`

- [ ] **Step 1: SessionDetails 작성**

`src/components/SessionDetails.tsx` 생성:

```tsx
import { useEffect, useState } from 'react';
import type { Exercise, Session } from '../types';
import {
  fmtVolumeDelta, fmtWeightDelta, summarizeSession, type EntryProgress,
} from '../db/progress';
import { getWeightUnit, kgToDisplay } from '../db/weightUnit';

// 완료 세션의 운동별 세트 표 + 증감·PR 요약 (기록 탭·홈 달력 공용).
// 요약은 마운트 단위로 로드 — 세션 전환 시 재마운트되므로 잔상/race 없음.
export default function SessionDetails({
  session, exMap,
}: {
  session: Session;
  exMap: Map<string, Exercise>;
}) {
  const [summaries, setSummaries] = useState<EntryProgress[] | null>(null);
  const unit = getWeightUnit();

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
    </>
  );
}
```

- [ ] **Step 2: HistoryScreen 리팩터**

`src/screens/HistoryScreen.tsx`:

- import 추가: `import SessionDetails from '../components/SessionDetails';`
- `openSummary` state와 해당 `useEffect` 삭제. 이에 따라 미사용이 되는 import 정리: `summarizeSession`, `EntryProgress`, `useEffect`(다른 사용처 없으면). **주의**: `fmtVolumeDelta`/`fmtWeightDelta`/`kgToDisplay`/`getWeightUnit`/`annotateHistory`는 "운동별로 보기"에서 계속 사용 — 유지
- 펼침 상세의 entries 렌더 블록 전체를 다음으로 교체:

```tsx
{openId === s.id && (
  <div style={{ marginTop: 8 }}>
    <SessionDetails key={s.id} session={s} exMap={exMap} />
    <div className="btn-row" style={{ marginTop: 10 }}>
      <button
        className="btn btn-ghost"
        onClick={(ev) => { ev.stopPropagation(); navigate(`/edit/${s.id}`); }}
      >
        수정하기
      </button>
      <button
        className="btn btn-danger"
        onClick={(ev) => { ev.stopPropagation(); void remove(s.id); }}
      >
        기록 삭제
      </button>
    </div>
  </div>
)}
```

(수정하기/기록 삭제 버튼 구조는 기존 그대로 — entries 부분만 컴포넌트로)

- [ ] **Step 3: 게이트 — 기존 테스트 무변경 통과**

Run: `npx vitest run src/screens/HistoryScreen.test.tsx`
Expected: **8/8 PASS, 테스트 파일 무변경** (race·세트 표·lb·요약 표시 전부). 실패 시 컴포넌트/리팩터를 고치고 테스트는 건드리지 말 것 (깨짐 원인 리포트 필수)

이어서 `npm test` 전체 166 PASS 확인.

- [ ] **Step 4: 커밋**

```bash
git add src/components/SessionDetails.tsx src/screens/HistoryScreen.tsx
git commit -m "refactor: 펼침 상세를 SessionDetails 공용 컴포넌트로 — 요약 로드 마운트 단위화"
```

---

### Task 2: 홈 달력 세션 펼침

**Files:**
- Modify: `src/screens/HomeScreen.tsx`
- Test: `src/screens/HomeScreen.test.tsx` (기존 2개 갱신 + 2개 추가)

**Interfaces:**
- Consumes: Task 1의 `SessionDetails`

- [ ] **Step 1: 테스트 갱신·추가**

`src/screens/HomeScreen.test.tsx`:

기존 `'달력 날짜를 누르면 그날 세션이 표시되고 탭하면 요약으로 이동한다'`를 다음으로 교체 (행 탭=펼침, 이동은 요약 › 버튼):

```tsx
test('달력 날짜를 누르면 그날 세션이 표시되고 요약 버튼으로 이동한다', async () => {
  const now = new Date();
  const ts = new Date(now.getFullYear(), now.getMonth(), 15, 10, 0).getTime();
  await addFinishedSession(ts, '가슴 날');
  renderWithSummary();
  fireEvent.click(await screen.findByRole('button', { name: `${now.getMonth() + 1}월 15일` }));
  expect(await screen.findByText(/가슴 날 · 1개 운동/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '요약 ›' }));
  expect(await screen.findByText('요약화면')).toBeInTheDocument();
});
```

기존 `'이름 없는 세션은 달력 목록에서 부위 이름으로 표시된다'`의 정확 매칭을 정규식으로:

```tsx
expect(await screen.findByText(/가슴 운동 · 1개 운동/)).toBeInTheDocument();
```

파일 끝에 추가:

```tsx
test('달력 세션을 탭하면 세트 표가 펼쳐진다', async () => {
  await seedLibrary();
  const now = new Date();
  const ts = new Date(now.getFullYear(), now.getMonth(), 15, 10).getTime();
  const s: Session = {
    id: crypto.randomUUID(), startedAt: ts, finishedAt: ts + 3600_000,
    entries: [{ exerciseId: 'lib-bench-press', sets: [{ weight: 60, reps: 10, completedAt: ts + 1 }] }],
  };
  await db.sessions.add(s);
  renderWithSummary();
  fireEvent.click(await screen.findByRole('button', { name: `${now.getMonth() + 1}월 15일` }));
  fireEvent.click(await screen.findByText(/가슴 운동 · 1개 운동/));
  expect(await screen.findByText('무게(kg)')).toBeInTheDocument();
  expect(screen.getByText('60')).toBeInTheDocument();
  // 다시 탭하면 접힘
  fireEvent.click(screen.getByText(/가슴 운동 · 1개 운동/));
  await waitFor(() => expect(screen.queryByText('무게(kg)')).not.toBeInTheDocument());
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/screens/HomeScreen.test.tsx`
Expected: 갱신 1 + 신규 1 FAIL (요약 › 버튼·펼침 없음), 나머지 PASS

- [ ] **Step 3: 구현**

`src/screens/HomeScreen.tsx`:

- import 추가: `import SessionDetails from '../components/SessionDetails';`
- state 추가 (selectedDate 옆): `const [openSessionId, setOpenSessionId] = useState('');`
- 달력 `onSelectDate` 핸들러에 리셋 추가:

```tsx
onSelectDate={(d) => { setSelectedDate(d); setShowBackdatePick(false); setOpenSessionId(''); }}
```

- daySessions 행 렌더를 다음으로 교체:

```tsx
{daySessions.map((s) => (
  <div key={s.id} className="hist-row" style={{ display: 'block' }}>
    <div
      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
      onClick={() => setOpenSessionId(openSessionId === s.id ? '' : s.id)}
    >
      <span>{sessionTitle(s, exMap)} · {s.entries.length}개 운동 {openSessionId === s.id ? '▴' : '▾'}</span>
      <button
        className="btn-sm btn btn-ghost"
        onClick={(ev) => { ev.stopPropagation(); navigate(`/summary/${s.id}`); }}
      >
        요약 ›
      </button>
    </div>
    {openSessionId === s.id && (
      <div style={{ marginTop: 8 }}>
        <SessionDetails key={s.id} session={s} exMap={exMap} />
      </div>
    )}
  </div>
))}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/screens/HomeScreen.test.tsx`
Expected: PASS (기존 갱신분 포함 + 신규)

- [ ] **Step 5: 커밋**

```bash
git add src/screens/HomeScreen.tsx src/screens/HomeScreen.test.tsx
git commit -m "feat: 홈 달력 세션 세트 표 펼침 — 요약 이동은 버튼으로 분리"
```

---

### Task 3: 전체 검증

- [ ] **Step 1:** `npm test` → 전체 PASS (166 + 신규 1 = 167)
- [ ] **Step 2:** `npm run build` → 에러 없음
- [ ] **Step 3:** 실패 시 수정 후 `git add -A src && git commit -m "fix: 홈 세트 표 통합 검증 수정"`
