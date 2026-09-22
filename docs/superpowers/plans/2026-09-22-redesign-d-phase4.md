# D 리디자인 Phase 4 — 기록 탭 통계 + 마이 정리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기록 탭 상단에 통계 블록(주간 목표 링·스트릭 / 8주 볼륨 추세 라인차트 / 하이라이트)을 추가하고, 마이 탭에 프로필 헤더를 단다 — D 리디자인 마지막 단계.

**Architecture:** 통계는 전부 coach.ts 확장 순수 함수(`weeklyVolumes`, `highlights`)로 파생 계산. `GoalRing`을 HomeScreen에서 `src/components/GoalRing.tsx`로 추출해 홈·기록이 공유(aria 계약 불변). 차트는 인라인 SVG(토큰 색).

**Tech Stack:** React 18 + TypeScript, vitest

**Spec:** `docs/superpowers/specs/2026-09-22-redesign-d-master.md` (Phase 4 절)

## Global Constraints

- 데이터 모델·DB 무변경, 통계는 기존 세션에서 파생 (coach.ts는 db import 금지 유지)
- 기존 테스트(현재 220개) 무변경 통과 — 기록 탭 통계 블록은 달력 카드 **위**에 추가되며 기존 쿼리와 충돌하는 문구 금지
- GoalRing 추출 후 홈의 링 aria-label(`주간 목표 {goal}회 중 {done}회 완료`) 불변
- 차트·하이라이트 빈 상태(기록 0)에 자리 문구 표시, 색은 Phase 1 토큰만
- UI 문구 한국어, 새 npm 의존성 금지
- 테스트 실행: `npx vitest run <파일경로>` (전체는 `npm test`)

---

### Task 1: coach.ts 확장 — weeklyVolumes·highlights + GoalRing 추출

**Files:**
- Modify: `src/db/coach.ts`, `src/screens/HomeScreen.tsx`
- Create: `src/components/GoalRing.tsx`
- Test: `src/db/coach.test.ts` (3개 추가), 기존 HomeScreen 테스트 무변경 통과

**Interfaces (Produces — Task 2·3이 사용):**
- `weeklyVolumes(sessions: Session[], weeks: number, now?: number): { weekStart: number; volumeKg: number }[]` — 오래된 주부터 `weeks`개, 빈 주는 0
- `highlights(sessions: Session[], exMap: Map<string, Exercise>, now?: number): { kind: 'pr' | 'up' | 'gap'; title: string; sub: string }[]` — 우선순위 pr > up > gap, 최대 3개
- `GoalRing({ done, goal }: { done: number; goal: number })` default export (from `../components/GoalRing`)

- [ ] **Step 1: 실패하는 테스트 작성**

`src/db/coach.test.ts` 끝에 (import에 `weeklyVolumes, highlights` 추가):

```ts
test('weeklyVolumes: 최근 N주를 오래된 주부터, 빈 주는 0으로 채운다', () => {
  const sessions = [fin(0), fin(1), fin(15)]; // 이번 주 600×2, 지지난주 600
  const v = weeklyVolumes(sessions, 3, NOW);
  expect(v).toHaveLength(3);
  expect(v[0].volumeKg).toBe(600);   // 지지난주
  expect(v[1].volumeKg).toBe(0);     // 지난주 비어 있음
  expect(v[2].volumeKg).toBe(1200);  // 이번 주
  expect(v[2].weekStart).toBe(weekStartMs(NOW));
  expect(weeklyVolumes([], 2, NOW).map((x) => x.volumeKg)).toEqual([0, 0]);
});

test('highlights: 무게 갱신(pr)이 최우선으로 잡힌다', () => {
  const older = fin(10); // 벤치 60
  const latest = fin(1, {
    entries: [{ exerciseId: 'lib-bench-press', sets: [{ weight: 72.5, reps: 5, completedAt: 1 }] }],
  });
  const h = highlights([latest, older], exMap, NOW);
  expect(h[0].kind).toBe('pr');
  expect(h[0].title).toContain('벤치프레스');
  expect(h[0].sub).toContain('72.5');
});

test('highlights: pr 없으면 up·gap 순서로, 기록 없으면 빈 배열', () => {
  const prev = fin(8, { routineName: '가슴 날' });                    // 600
  const legacyLeg = fin(12, {
    entries: [{ exerciseId: 'lib-squat', sets: [{ weight: 100, reps: 5, completedAt: 1 }] }],
  });
  const latest = fin(1, {
    routineName: '가슴 날',
    entries: [{ exerciseId: 'lib-bench-press', sets: [{ weight: 60, reps: 12, completedAt: 1 }] }], // 720, 무게 동일 → pr 아님
  });
  const h = highlights([latest, prev, legacyLeg], exMap, NOW);
  expect(h.map((x) => x.kind)).toEqual(['up', 'gap']);
  expect(h[0].title).toContain('가슴 날');
  expect(h[1].title).toContain('하체');
  expect(highlights([], exMap, NOW)).toEqual([]);
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/db/coach.test.ts`
Expected: 신규 3개 FAIL (함수 미정의), 기존 PASS

- [ ] **Step 3: 구현**

`src/db/coach.ts` 끝에 추가 (`fmtWeightLabel`도 import에 추가: `import { fmtWeightLabel, kgToDisplay, stepFor, unitFor } from './weightUnit';`):

```ts
export interface WeekVolume { weekStart: number; volumeKg: number }

// 최근 N주 볼륨(원본 kg 합) — 오래된 주부터, 빈 주는 0
export function weeklyVolumes(sessions: Session[], weeks: number, now: number = Date.now()): WeekVolume[] {
  const first = weekStartMs(now) - (weeks - 1) * WEEK;
  const out: WeekVolume[] = Array.from({ length: weeks }, (_, i) => ({ weekStart: first + i * WEEK, volumeKg: 0 }));
  for (const s of sessions) {
    if (s.finishedAt === undefined) continue;
    const i = Math.round((weekStartMs(s.startedAt) - first) / WEEK);
    if (i >= 0 && i < weeks) out[i].volumeKg += sessionVolume(s);
  }
  return out;
}

export interface Highlight { kind: 'pr' | 'up' | 'gap'; title: string; sub: string }

// 기록 하이라이트: 무게 갱신 > 루틴 볼륨 상승 > 부위 공백, 최대 3개
export function highlights(
  sessions: Session[], exMap: Map<string, Exercise>, now: number = Date.now(),
): Highlight[] {
  const done = sessions.filter((s) => s.finishedAt !== undefined);
  if (done.length === 0) return [];
  const out: Highlight[] = [];

  // pr: 최근 7일 세션에서 어떤 운동의 최고 무게가 그 이전 기록을 넘었으면
  outer: for (const s of done) {
    if (now - s.startedAt > 7 * DAY) break;
    for (const e of s.entries) {
      const ex = exMap.get(e.exerciseId);
      if (!ex) continue;
      const cur = maxWeight(e.sets);
      const prev = lastTopWeight(done.filter((x) => x.startedAt < s.startedAt), e.exerciseId);
      if (prev !== undefined && cur > prev) {
        const d = new Date(s.startedAt);
        out.push({
          kind: 'pr',
          title: `${ex.name} 무게 갱신`,
          sub: `${d.getMonth() + 1}/${d.getDate()} · ${fmtWeightLabel(cur, unitFor(ex))}`,
        });
        break outer;
      }
    }
  }

  // up: coachTip과 동일 규칙 — 같은 루틴 직전 대비 볼륨 상승
  const latest = done[0];
  if (latest.routineName) {
    const prev = done.find((s, i) => i > 0 && s.routineName === latest.routineName);
    if (prev) {
      const cur = sessionVolume(latest);
      const before = sessionVolume(prev);
      if (before > 0 && cur > before) {
        out.push({
          kind: 'up',
          title: `${latest.routineName} 볼륨 상승`,
          sub: `지난번보다 +${Math.round(((cur - before) / before) * 100)}%`,
        });
      }
    }
  }

  // gap: 해본 적 있는 부위가 10일 이상 공백
  for (const part of GAP_PARTS) {
    const last = done.find((s) => s.entries.some((e) => exMap.get(e.exerciseId)?.bodyPart === part));
    if (!last) continue;
    const days = Math.floor((now - last.startedAt) / DAY);
    if (days >= GAP_DAYS) {
      out.push({ kind: 'gap', title: `${part} ${days}일 공백`, sub: '이번 주에 한 번 어때요?' });
      break;
    }
  }

  return out.slice(0, 3);
}
```

`src/components/GoalRing.tsx` 신규 — HomeScreen의 `GoalRing` 함수를 그대로 이동:

```tsx
// 주간 목표 진행 링 (홈·기록 공용)
export default function GoalRing({ done, goal }: { done: number; goal: number }) {
  const pct = goal > 0 ? Math.min(1, done / goal) : 0;
  const C = 2 * Math.PI * 24;
  return (
    <svg width="58" height="58" viewBox="0 0 58 58" role="img" aria-label={`주간 목표 ${goal}회 중 ${done}회 완료`}>
      <circle cx="29" cy="29" r="24" fill="none" stroke="var(--border)" strokeWidth="7" />
      <circle
        cx="29" cy="29" r="24" fill="none" stroke="var(--accent)" strokeWidth="7" strokeLinecap="round"
        strokeDasharray={`${C * pct} ${C}`} transform="rotate(-90 29 29)"
      />
      <text x="29" y="34" textAnchor="middle" fontSize="15" fontWeight="800" fill="var(--text)">{done}/{goal}</text>
    </svg>
  );
}
```

`src/screens/HomeScreen.tsx`: 내부 `GoalRing` 함수 삭제, `import GoalRing from '../components/GoalRing';` 추가. 그 외 무변경.

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/db/coach.test.ts src/screens/HomeScreen.test.tsx`
Expected: 전부 PASS (홈 링 aria 불변)

- [ ] **Step 5: 커밋**

```bash
git add src/db/coach.ts src/db/coach.test.ts src/components/GoalRing.tsx src/screens/HomeScreen.tsx
git commit -m "feat: 주별 볼륨·하이라이트 파생 함수 + GoalRing 공용 추출"
```

---

### Task 2: 기록 탭 통계 블록

**Files:**
- Modify: `src/screens/HistoryScreen.tsx`, `src/styles.css`
- Test: `src/screens/HistoryScreen.test.tsx` (3개 추가, 기존 20개 무변경)

**Interfaces:**
- Consumes (Task 1): `weeklyVolumes, highlights, weeklyGoalProgress, weekStreak`(`../db/coach`), `getWeeklyGoal`(`../db/settings`), `GoalRing`(`../components/GoalRing`)

- [ ] **Step 1: 실패하는 테스트 작성**

`src/screens/HistoryScreen.test.tsx` 끝에 추가:

```tsx
test('기록 탭 상단에 주간 링·스트릭·볼륨 추세가 보인다', async () => {
  await addFinishedSession(Date.now() - 3600_000, 'lib-bench-press', [{ weight: 60, reps: 10 }]);
  renderScreen();
  expect(await screen.findByRole('img', { name: '주간 목표 3회 중 1회 완료' })).toBeInTheDocument();
  expect(screen.getByRole('img', { name: /주간 볼륨 추세/ })).toBeInTheDocument();
});

test('기록이 없으면 추세 자리에 빈 문구가 보인다', async () => {
  renderScreen();
  expect(await screen.findByText('기록이 쌓이면 추세가 보여요')).toBeInTheDocument();
});

test('하이라이트: 무게 갱신이 표시된다', async () => {
  await addFinishedSession(Date.now() - 10 * 86_400_000, 'lib-bench-press', [{ weight: 60, reps: 10 }]);
  await addFinishedSession(Date.now() - 3600_000, 'lib-bench-press', [{ weight: 72.5, reps: 5 }]);
  renderScreen();
  expect(await screen.findByText('벤치프레스 무게 갱신')).toBeInTheDocument();
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/screens/HistoryScreen.test.tsx`
Expected: 신규 3개 FAIL, 기존 20개 PASS

- [ ] **Step 3: 구현**

`src/styles.css` — `.grid-2` 규칙 아래에 추가:

```css
.trend-empty { text-align: center; color: var(--muted); font-size: 12.5px; padding: 26px 0; }
```

`src/screens/HistoryScreen.tsx`:

- import 추가: `weeklyVolumes, highlights, weeklyGoalProgress, weekStreak`를 `../db/coach`에서, `getWeeklyGoal`을 `../db/settings`에서, `GoalRing`을 `../components/GoalRing`에서
- 컴포넌트 본문(달력 파생값 근처)에 추가:

```ts
  const goal = getWeeklyGoal();
  const weekly = weeklyGoalProgress(sessions, goal);
  const streak = weekStreak(sessions, goal);
  const trend = weeklyVolumes(sessions, 8);
  const hasTrend = trend.some((w) => w.volumeKg > 0);
  const marks = highlights(sessions, exMap);
```

- 렌더: `<h1 className="screen-title">기록</h1>` 바로 아래·달력 카드 위에 통계 블록 삽입:

```tsx
      <div className="grid-2">
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <GoalRing done={weekly.done} goal={weekly.goal} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 800 }}>주간 목표</span>
            <span className="d" style={{ fontSize: 11.5 }}>
              {weekly.done >= weekly.goal ? '이번 주 달성!' : `${weekly.goal - weekly.done}회 남음`}
            </span>
          </div>
        </div>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3 }}>
          <span style={{ fontSize: 13, fontWeight: 800 }}>{streak}주 연속</span>
          <span className="d" style={{ fontSize: 11.5, lineHeight: 1.5 }}>주간 목표 달성 스트릭</span>
        </div>
      </div>

      <div className="card">
        <div className="card-h">볼륨 추세 · 최근 8주</div>
        {hasTrend ? (() => {
          const W = 314;
          const H = 96;
          const max = Math.max(...trend.map((w) => w.volumeKg));
          const pts = trend
            .map((w, i) => `${10 + (i * (W - 20)) / (trend.length - 1)},${H - 12 - (w.volumeKg / max) * (H - 34)}`)
            .join(' ');
          const [lx, ly] = pts.split(' ').slice(-1)[0].split(',').map(Number);
          return (
            <svg
              width="100%" viewBox={`0 0 ${W} ${H}`} role="img"
              aria-label={`주간 볼륨 추세, 이번 주 ${kgToDisplay(trend[trend.length - 1].volumeKg, 'kg')}kg`}
            >
              <line x1="0" y1={H - 12} x2={W} y2={H - 12} stroke="var(--border)" strokeWidth="1" />
              <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx={lx} cy={ly} r="4.5" fill="var(--accent)" />
            </svg>
          );
        })() : (
          <div className="trend-empty">기록이 쌓이면 추세가 보여요</div>
        )}
      </div>

      {marks.length > 0 && (
        <div className="card">
          <div className="card-h">하이라이트</div>
          {marks.map((m, i) => (
            <div key={i} className="hist-row">
              <span>{m.title}</span>
              <span className="d">{m.sub}</span>
            </div>
          ))}
        </div>
      )}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/screens/HistoryScreen.test.tsx`
Expected: 전부 PASS (23개)

- [ ] **Step 5: 커밋**

```bash
git add src/screens/HistoryScreen.tsx src/screens/HistoryScreen.test.tsx src/styles.css
git commit -m "feat: 기록 탭 통계 블록 — 주간 링·스트릭, 8주 볼륨 추세, 하이라이트"
```

---

### Task 3: 마이 탭 프로필 헤더

**Files:**
- Modify: `src/screens/ManageScreen.tsx`
- Test: `src/screens/ManageScreen.test.tsx` (1개 추가)

**Interfaces:**
- Consumes: `listFinishedSessions`(`../db/sessions` — ManageScreen에 이미 import된 모듈 여부 확인 후 추가), `useLiveQuery`(이미 사용 중)

- [ ] **Step 1: 실패하는 테스트 작성**

`src/screens/ManageScreen.test.tsx` 끝에 (기존 렌더 헬퍼 재사용, db import는 파일에 이미 있음):

```tsx
test('마이 탭 프로필 헤더에 완료 운동 횟수가 보인다', async () => {
  await db.sessions.add({
    id: crypto.randomUUID(), startedAt: 1000, finishedAt: 3600_000,
    entries: [{ exerciseId: 'e1', sets: [{ weight: 50, reps: 10, completedAt: 1001 }] }],
  });
  renderScreen();
  expect(await screen.findByText('명품보쌈 멤버')).toBeInTheDocument();
  expect(await screen.findByText('운동 1회 완료')).toBeInTheDocument();
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/screens/ManageScreen.test.tsx`
Expected: 신규 1개 FAIL

- [ ] **Step 3: 구현**

`src/screens/ManageScreen.tsx`:

- import에 `listFinishedSessions`(`../db/sessions`) 추가, 컴포넌트에 `const doneSessions = useLiveQuery(() => listFinishedSessions(), []) ?? [];`
- `<h1 className="screen-title">마이</h1>` 바로 아래에:

```tsx
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span
          style={{
            width: 52, height: 52, borderRadius: '50%', background: 'var(--surface-2)',
            color: 'var(--accent)', fontSize: 20, fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          명
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 16, fontWeight: 800 }}>명품보쌈 멤버</span>
          <span className="d" style={{ fontSize: 12.5 }}>운동 {doneSessions.length}회 완료</span>
        </div>
      </div>
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/screens/ManageScreen.test.tsx`
Expected: 전부 PASS

- [ ] **Step 5: 커밋**

```bash
git add src/screens/ManageScreen.tsx src/screens/ManageScreen.test.tsx
git commit -m "feat: 마이 탭 프로필 헤더 — 완료 횟수 표시"
```

---

### Task 4: 전체 검증

- [ ] **Step 1:** `npm test` → 전체 PASS (220 + 7 = 227)
- [ ] **Step 2:** `npx tsc --noEmit`, `npm run build` → 에러 없음
- [ ] **Step 3:** 실패 시 수정 후 `git add -A src && git commit -m "fix: Phase 4 통합 검증 수정"`
