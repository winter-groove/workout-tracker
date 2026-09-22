# D 리디자인 Phase 2 — 코치 홈 + 달력 이동 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 홈을 코치 제안 카드 중심으로 재구성(추천 루틴 자동 제시·주간 목표 링·스트릭·규칙 기반 팁)하고, 월 달력·백데이트를 기록 탭 상단으로 이동한다.

**Architecture:** 코치는 `src/db/coach.ts`의 순수 함수(입력: 이미 로드된 sessions/routines/exMap — DB 접근 없음). 홈의 `pickNextRoutine` 로직은 `suggestRoutine`으로 이관. 달력 블록(상태 3개 + 렌더 + 백데이트)은 HomeScreen에서 HistoryScreen 상단으로 그대로 이식하고 관련 테스트도 함께 이식.

**Tech Stack:** React 18 + TypeScript, Dexie(기존 liveQuery만), vitest

**Spec:** `docs/superpowers/specs/2026-09-22-redesign-d-master.md` (Phase 2 절)

## Global Constraints

- 데이터 모델·Dexie 스키마·백업 포맷 무변경, 기능 제거 0 — 백데이트·날짜별 세션 펼침·요약 이동은 기록 탭에서 전부 동작해야 함
- 코치는 서버 없는 순수 함수 (`coach.ts`는 `db`를 import하지 않는다), 네트워크·새 npm 의존성 금지
- sessions 인자는 `listFinishedSessions()` 결과(최신순·완료만)를 가정하되, 함수 내부에서도 `finishedAt !== undefined` 필터를 유지(방어)
- 무게 표시는 기존 단위 체계(`unitFor`/`kgToDisplay`/`stepFor`), 저장은 kg 불변
- localStorage 키: 주간 목표 `wt-weekly-goal` (기본 3, 1~14 클램프)
- UI 문구 한국어, 신규 색·컴포넌트는 Phase 1 토큰(`--accent` 등)만 사용
- 테스트 실행: `npx vitest run <파일경로>` (전체는 `npm test`, 현재 200개)

---

### Task 1: coach.ts + 주간 목표 설정 (순수 로직)

**Files:**
- Create: `src/db/coach.ts`, `src/db/coach.test.ts`
- Modify: `src/db/settings.ts`
- Test: `src/db/settings.test.ts` (2개 추가)

**Interfaces (Produces — Task 3·4가 사용):**
- `getWeeklyGoal(): number` / `setWeeklyGoal(n: number): void` (from `./settings`)
- from `./coach`: `weekStartMs(now?: number): number`, `weeklyGoalProgress(sessions, goal, now?): { done: number; goal: number }`, `weekStreak(sessions, goal, now?): number`, `suggestRoutine(routines: Routine[], sessions: Session[]): Routine | undefined`, `routineEstimate(routine: Routine, sessions: Session[]): { minutes?: string; volumeKg?: number }`, `lastTopWeight(sessions: Session[], exerciseId: string): number | undefined`, `coachTip(sessions: Session[], exMap: Map<string, Exercise>, now?: number): { kind: 'welcome'|'progress'|'gap'|'up'|'steady'; text: string }`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/db/settings.test.ts` 끝에 (import에 `getWeeklyGoal, setWeeklyGoal` 추가):

```ts
test('주간 목표: 기본 3, 저장·클램프', () => {
  localStorage.removeItem('wt-weekly-goal');
  expect(getWeeklyGoal()).toBe(3);
  setWeeklyGoal(5);
  expect(getWeeklyGoal()).toBe(5);
  localStorage.setItem('wt-weekly-goal', '99');
  expect(getWeeklyGoal()).toBe(3); // 범위 밖 → 기본값
  localStorage.setItem('wt-weekly-goal', 'abc');
  expect(getWeeklyGoal()).toBe(3);
  localStorage.removeItem('wt-weekly-goal');
});
```

`src/db/coach.test.ts` 신규 (전체):

```ts
import type { Exercise, Routine, Session } from '../types';
import {
  weekStartMs, weeklyGoalProgress, weekStreak,
  suggestRoutine, routineEstimate, lastTopWeight, coachTip,
} from './coach';

// 2026-09-22(화) 12:00 로컬 고정 기준
const NOW = new Date(2026, 8, 22, 12).getTime();
const DAY = 86_400_000;

function fin(daysAgo: number, over: Partial<Session> = {}): Session {
  const startedAt = NOW - daysAgo * DAY;
  return {
    id: `s-${daysAgo}-${Math.random()}`,
    startedAt,
    finishedAt: startedAt + 3600_000,
    entries: [{ exerciseId: 'lib-bench-press', sets: [{ weight: 60, reps: 10, completedAt: startedAt + 1 }] }],
    ...over,
  };
}

const bench: Exercise = { id: 'lib-bench-press', name: '벤치프레스', bodyPart: '가슴', equipment: '바벨', isCustom: false, isHidden: false };
const squat: Exercise = { id: 'lib-squat', name: '스쿼트', bodyPart: '하체', equipment: '바벨', isCustom: false, isHidden: false };
const exMap = new Map<string, Exercise>([[bench.id, bench], [squat.id, squat]]);

test('weekStartMs는 월요일 0시를 돌려준다', () => {
  const start = weekStartMs(NOW); // 2026-09-22는 화요일
  const d = new Date(start);
  expect(d.getDay()).toBe(1); // 월
  expect(d.getHours()).toBe(0);
  expect(d.getDate()).toBe(21); // 9/21(월)
});

test('weeklyGoalProgress는 이번 주 완료 세션만 센다', () => {
  const sessions = [fin(0), fin(1), fin(8)]; // 이번 주 2개(화·월), 지난주 1개
  expect(weeklyGoalProgress(sessions, 3, NOW)).toEqual({ done: 2, goal: 3 });
});

test('weekStreak: 이번 주는 채웠을 때만 포함, 지난주부터 연속 계산', () => {
  // goal 2 — 지난주 2개, 지지난주 2개, 이번 주 1개 → 이번 주 미충족이라 2
  const sessions = [fin(1), fin(7), fin(8), fin(14), fin(15)];
  expect(weekStreak(sessions, 2, NOW)).toBe(2);
  // 이번 주 하나 더 채우면 3
  expect(weekStreak([fin(0), ...sessions], 2, NOW)).toBe(3);
  expect(weekStreak([], 2, NOW)).toBe(0);
});

test('suggestRoutine은 가장 오래 안 쓴 루틴을 고른다', () => {
  const r1: Routine = { id: 'r1', name: '가슴 날', items: [] };
  const r2: Routine = { id: 'r2', name: '등 날', items: [] };
  const sessions = [fin(1, { routineName: '가슴 날' })]; // 가슴은 어제 씀
  expect(suggestRoutine([r1, r2], sessions)?.id).toBe('r2');
  expect(suggestRoutine([], sessions)).toBeUndefined();
});

test('routineEstimate는 같은 이름 마지막 세션의 시간·볼륨을 준다', () => {
  const r: Routine = { id: 'r1', name: '가슴 날', items: [] };
  const ref = fin(3, { routineName: '가슴 날' }); // 60×10=600kg, 1시간
  expect(routineEstimate(r, [fin(1), ref])).toEqual({ minutes: '1시간', volumeKg: 600 });
  expect(routineEstimate(r, [])).toEqual({});
});

test('lastTopWeight는 최신 세션부터 찾은 최고 무게', () => {
  const older = fin(5); // 60kg
  const newer = fin(2, {
    entries: [{ exerciseId: 'lib-bench-press', sets: [{ weight: 70, reps: 8, completedAt: 1 }] }],
  });
  expect(lastTopWeight([newer, older], 'lib-bench-press')).toBe(70);
  expect(lastTopWeight([newer, older], 'lib-squat')).toBeUndefined();
});

test('coachTip: 기록 없으면 welcome', () => {
  expect(coachTip([], exMap, NOW).kind).toBe('welcome');
});

test('coachTip: 같은 최고 무게 반복이면 progress(+스텝 도전)', () => {
  const prev = fin(4);   // 벤치 60
  const latest = fin(1); // 벤치 60 — 정체
  const tip = coachTip([latest, prev], exMap, NOW);
  expect(tip.kind).toBe('progress');
  expect(tip.text).toContain('벤치프레스');
  expect(tip.text).toContain('60.5'); // kg 스텝 0.5
});

test('coachTip: 부위 공백 10일 이상이면 gap', () => {
  // 하체는 12일 전이 마지막, 벤치는 어제 70kg(정체 아님 → progress 미발동)
  const legacyLeg = fin(12, {
    entries: [{ exerciseId: 'lib-squat', sets: [{ weight: 100, reps: 5, completedAt: 1 }] }],
  });
  const latest = fin(1, {
    entries: [{ exerciseId: 'lib-bench-press', sets: [{ weight: 70, reps: 8, completedAt: 1 }] }],
  });
  const tip = coachTip([latest, legacyLeg], exMap, NOW);
  expect(tip.kind).toBe('gap');
  expect(tip.text).toContain('하체');
});

test('coachTip: 같은 루틴 볼륨 상승이면 up, 아니면 steady', () => {
  const prev = fin(8, { routineName: '가슴 날' }); // 600kg
  const latest = fin(1, {
    routineName: '가슴 날',
    entries: [{ exerciseId: 'lib-bench-press', sets: [{ weight: 70, reps: 10, completedAt: 1 }] }], // 700kg, 무게도 올라 progress 아님
  });
  expect(coachTip([latest, prev], exMap, NOW).kind).toBe('up');
  // 상승 없고 정체도 아니면 steady
  const single = fin(1, {
    entries: [{ exerciseId: 'lib-bench-press', sets: [{ weight: 70, reps: 8, completedAt: 1 }] }],
  });
  expect(coachTip([single], exMap, NOW).kind).toBe('steady');
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/db/coach.test.ts src/db/settings.test.ts`
Expected: coach.ts 모듈 없음으로 FAIL + settings 신규 1개 FAIL, 기존 PASS

- [ ] **Step 3: 구현**

`src/db/settings.ts` 끝에 추가:

```ts
const GOAL_KEY = 'wt-weekly-goal';
const GOAL_DEFAULT = 3;

// 주간 목표(회) — 1~14 밖이거나 숫자가 아니면 기본 3
export function getWeeklyGoal(): number {
  const raw = localStorage.getItem(GOAL_KEY);
  const n = raw === null ? NaN : Number(raw);
  return Number.isFinite(n) && n >= 1 && n <= 14 ? Math.round(n) : GOAL_DEFAULT;
}

export function setWeeklyGoal(n: number): void {
  localStorage.setItem(GOAL_KEY, String(n));
}
```

`src/db/coach.ts` 신규 (전체):

```ts
import type { Exercise, Routine, Session } from '../types';
import { maxWeight, sessionVolume } from './progress';
import { sessionDuration } from './sessions';
import { kgToDisplay, stepFor, unitFor } from './weightUnit';

// 코치: 서버 없이 이미 로드된 기록에서 파생 계산하는 순수 함수 모음.
// sessions는 listFinishedSessions() 결과(최신순·완료만)를 가정하되 방어 필터를 유지한다.

const DAY = 86_400_000;
const WEEK = 7 * DAY;

// 월요일 00:00(로컬) — 주간 통계의 기준점
export function weekStartMs(now: number = Date.now()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // 월=0
  return d.getTime();
}

export interface WeeklyProgress { done: number; goal: number }

export function weeklyGoalProgress(
  sessions: Session[], goal: number, now: number = Date.now(),
): WeeklyProgress {
  const start = weekStartMs(now);
  const done = sessions.filter((s) => s.finishedAt !== undefined && s.startedAt >= start).length;
  return { done, goal };
}

// 목표를 채운 연속 주 수 — 이번 주는 채웠을 때만 포함, 아니면 지난주부터 거슬러 센다
export function weekStreak(sessions: Session[], goal: number, now: number = Date.now()): number {
  if (goal <= 0) return 0;
  const counts = new Map<number, number>();
  for (const s of sessions) {
    if (s.finishedAt === undefined) continue;
    const w = weekStartMs(s.startedAt);
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  let cursor = weekStartMs(now);
  let streak = 0;
  if ((counts.get(cursor) ?? 0) >= goal) streak += 1;
  cursor -= WEEK;
  while ((counts.get(cursor) ?? 0) >= goal) {
    streak += 1;
    cursor -= WEEK;
  }
  return streak;
}

// 가장 오래 안 쓴 루틴 추천 (기존 홈의 pickNextRoutine 로직 이관)
export function suggestRoutine(routines: Routine[], sessions: Session[]): Routine | undefined {
  if (routines.length === 0) return undefined;
  const lastUsed = new Map<string, number>();
  for (const s of sessions) {
    if (s.routineName && !lastUsed.has(s.routineName)) lastUsed.set(s.routineName, s.startedAt);
  }
  return [...routines].sort(
    (a, b) => (lastUsed.get(a.name) ?? 0) - (lastUsed.get(b.name) ?? 0),
  )[0];
}

export interface RoutineEstimate { minutes?: string; volumeKg?: number }

// 같은 이름으로 완료한 마지막 세션 기반 예상 시간·볼륨
export function routineEstimate(routine: Routine, sessions: Session[]): RoutineEstimate {
  const ref = sessions.find((s) => s.finishedAt !== undefined && s.routineName === routine.name);
  if (!ref) return {};
  const est: RoutineEstimate = { volumeKg: sessionVolume(ref) };
  const dur = sessionDuration(ref);
  if (dur) est.minutes = dur;
  return est;
}

// 최신 세션부터 찾은 그 운동의 마지막 최고 무게 (코치 카드 프리뷰용)
export function lastTopWeight(sessions: Session[], exerciseId: string): number | undefined {
  for (const s of sessions) {
    if (s.finishedAt === undefined) continue;
    const e = s.entries.find((x) => x.exerciseId === exerciseId);
    if (e && e.sets.length > 0) return maxWeight(e.sets);
  }
  return undefined;
}

export interface CoachTip { kind: 'welcome' | 'progress' | 'gap' | 'up' | 'steady'; text: string }

const GAP_PARTS = ['가슴', '등', '하체'] as const;
const GAP_DAYS = 10;

// 팁 우선순위: 무게 정체(진행 제안) > 부위 공백 > 볼륨 상승 축하 > 격려
export function coachTip(
  sessions: Session[], exMap: Map<string, Exercise>, now: number = Date.now(),
): CoachTip {
  const done = sessions.filter((s) => s.finishedAt !== undefined);
  if (done.length === 0) {
    return { kind: 'welcome', text: '첫 운동을 기록하면 여기서 다음 목표를 제안해 드려요.' };
  }
  const latest = done[0];

  // 1) 진행 제안: 최근 세션의 대표(최고 무게) 운동이 직전에도 같은 최고 무게였으면 +스텝 도전
  const top = [...latest.entries].sort((a, b) => maxWeight(b.sets) - maxWeight(a.sets))[0];
  if (top && maxWeight(top.sets) > 0) {
    const ex = exMap.get(top.exerciseId);
    const prevW = lastTopWeight(done.filter((s) => s.id !== latest.id), top.exerciseId);
    const curW = maxWeight(top.sets);
    if (ex && prevW !== undefined && prevW === curW) {
      const u = unitFor(ex);
      const nextW = Math.round((kgToDisplay(curW, u) + stepFor(u)) * 10) / 10;
      return {
        kind: 'progress',
        text: `${ex.name} ${kgToDisplay(curW, u)}${u}에서 두 번 버텼어요. 다음엔 ${nextW}${u}에 도전해 보세요.`,
      };
    }
  }

  // 2) 부위 공백: 해본 적 있는 부위가 10일 이상 비면 제안
  for (const part of GAP_PARTS) {
    const last = done.find((s) => s.entries.some((e) => exMap.get(e.exerciseId)?.bodyPart === part));
    if (!last) continue;
    const days = Math.floor((now - last.startedAt) / DAY);
    if (days >= GAP_DAYS) {
      return { kind: 'gap', text: `${part} 운동을 쉰 지 ${days}일째예요. 이번 주에 한 번 넣어볼까요?` };
    }
  }

  // 3) 같은 루틴 볼륨 상승 축하
  if (latest.routineName) {
    const prev = done.find((s, i) => i > 0 && s.routineName === latest.routineName);
    if (prev) {
      const cur = sessionVolume(latest);
      const before = sessionVolume(prev);
      if (before > 0 && cur > before) {
        const pct = Math.round(((cur - before) / before) * 100);
        return { kind: 'up', text: `${latest.routineName} 볼륨이 지난번보다 ${pct}% 올랐어요. 좋은 흐름이에요.` };
      }
    }
  }

  return { kind: 'steady', text: '꾸준히 잘하고 있어요. 오늘도 지난 기록보다 한 세트만 더!' };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/db/coach.test.ts src/db/settings.test.ts`
Expected: 전부 PASS. 이어서 `npm test` (200 + 11 = 211)

- [ ] **Step 5: 커밋**

```bash
git add src/db/coach.ts src/db/coach.test.ts src/db/settings.ts src/db/settings.test.ts
git commit -m "feat: 코치 규칙 엔진 — 주간 링·스트릭·루틴 추천·예상치·팁 (순수 함수)"
```

---

### Task 2: 달력을 기록 탭으로 이식 (홈은 아직 그대로)

**Files:**
- Modify: `src/screens/HistoryScreen.tsx`
- Test: `src/screens/HistoryScreen.test.tsx` (이식 테스트 5개 추가)

**Interfaces:**
- Consumes: 기존 `MonthCalendar`, `SessionDetails`, `sessionVolume`, `startSession(routine?, startedAt?)`
- Produces: 기록 탭 달력 블록 — Task 3가 홈에서 달력을 제거해도 기능 보존

- [ ] **Step 1: 이식 테스트 작성 (기록 탭 기준)**

`src/screens/HistoryScreen.test.tsx`의 `renderScreen`을 다음으로 교체(라우트 추가):

```tsx
function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/history']}>
      <Routes>
        <Route path="/history" element={<HistoryScreen />} />
        <Route path="/session" element={<div>세션화면</div>} />
        <Route path="/summary/:sessionId" element={<div>요약화면</div>} />
        <Route path="/edit/:sessionId" element={<div>편집화면</div>} />
      </Routes>
    </MemoryRouter>,
  );
}
```

파일 끝에 추가 (import에 `waitFor`(이미 있으면 생략), `saveRoutine`(`../db/routines`), `startSession, getActiveSession`(`../db/sessions`), `vi` 사용은 기존 패턴):

```tsx
test('기록 탭 달력에서 날짜를 누르면 그날 세션이 표시되고 요약 버튼으로 이동한다', async () => {
  const now = new Date();
  const ts = new Date(now.getFullYear(), now.getMonth(), 15, 10).getTime();
  await db.sessions.add({
    id: crypto.randomUUID(), startedAt: ts, finishedAt: ts + 3600_000, routineName: '가슴 날',
    entries: [{ exerciseId: 'lib-bench-press', sets: [{ weight: 50, reps: 10, completedAt: ts + 1 }] }],
  });
  renderScreen();
  fireEvent.click(await screen.findByRole('button', { name: `${now.getMonth() + 1}월 15일` }));
  // 같은 세션이 달력 행(위)과 세션 목록 행(아래)에 모두 있으므로 findAll[0] = 달력 행
  expect((await screen.findAllByText(/가슴 날 · 1개 운동/))[0]).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '요약 ›' })); // 요약 › 버튼은 달력 행에만 있음
  expect(await screen.findByText('요약화면')).toBeInTheDocument();
});

test('기록 탭 달력: 세션 행을 탭하면 세트 표가 펼쳐진다', async () => {
  const now = new Date();
  const ts = new Date(now.getFullYear(), now.getMonth(), 15, 10).getTime();
  await db.sessions.add({
    id: crypto.randomUUID(), startedAt: ts, finishedAt: ts + 3600_000,
    entries: [{ exerciseId: 'lib-bench-press', sets: [{ weight: 60, reps: 10, completedAt: ts + 1 }] }],
  });
  renderScreen();
  fireEvent.click(await screen.findByRole('button', { name: `${now.getMonth() + 1}월 15일` }));
  fireEvent.click((await screen.findAllByText(/가슴 운동 · 1개 운동 · 총 볼륨/))[0]); // [0] = 달력 행
  expect((await screen.findAllByText('무게(kg)')).length).toBeGreaterThan(0);
});

test('기록 탭: 진행 중 세션이 있으면 백데이트가 차단된다', async () => {
  vi.spyOn(window, 'alert').mockImplementation(() => {});
  await saveRoutine({ id: 'r1', name: '가슴운동', items: [] });
  await startSession();
  renderScreen();
  const now = new Date();
  fireEvent.click(await screen.findByRole('button', { name: `${now.getMonth() + 1}월 1일` }));
  fireEvent.click(await screen.findByRole('button', { name: '＋ 이 날짜에 기록 추가' }));
  fireEvent.click(await screen.findByRole('button', { name: '빈 세션' }));
  await waitFor(() => {
    expect(window.alert).toHaveBeenCalledWith('진행 중인 운동을 먼저 완료하세요');
  });
});

test('기록 탭 달력: 기록 없는 날짜는 빈 문구가 보인다', async () => {
  renderScreen();
  const now = new Date();
  fireEvent.click(await screen.findByRole('button', { name: `${now.getMonth() + 1}월 15일` }));
  expect(await screen.findByText('이 날은 운동 기록이 없어요')).toBeInTheDocument();
});

test('기록 탭에서 과거 날짜 백데이트 세션을 시작한다', async () => {
  await saveRoutine({ id: 'r1', name: '가슴운동', items: [] });
  renderScreen();
  const now = new Date();
  fireEvent.click(await screen.findByRole('button', { name: `${now.getMonth() + 1}월 1일` }));
  fireEvent.click(await screen.findByRole('button', { name: '＋ 이 날짜에 기록 추가' }));
  // 루틴 목록은 useLiveQuery로 비동기 로드 — 동기 getByRole은 레이스
  fireEvent.click(await screen.findByRole('button', { name: '가슴운동' }));
  expect(await screen.findByText('세션화면')).toBeInTheDocument();
  const s = await getActiveSession();
  expect(new Date(s!.startedAt).getDate()).toBe(1);
  expect(new Date(s!.startedAt).getHours()).toBe(12);
});

test('기록 탭: 미래 날짜에는 기록 추가 버튼이 없다', async () => {
  renderScreen();
  fireEvent.click(await screen.findByLabelText('다음 달'));
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  fireEvent.click(await screen.findByRole('button', { name: `${next.getMonth() + 1}월 15일` }));
  expect(await screen.findByText('이 날은 운동 기록이 없어요')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '＋ 이 날짜에 기록 추가' })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/screens/HistoryScreen.test.tsx`
Expected: 신규 6개 FAIL (기록 탭에 달력 없음), 기존 PASS

- [ ] **Step 3: 구현 — HomeScreen의 달력 블록을 HistoryScreen 상단에 복제**

`src/screens/HistoryScreen.tsx`:

- import 추가: `import { useState } from 'react';`(기존 유지), `import MonthCalendar from '../components/MonthCalendar';`, `listRoutines`(`../db/routines`), `startSession, getActiveSession`은 `../db/sessions` 기존 import 줄에 추가, `Routine` 타입(`../types`)
- 컴포넌트에 상태·데이터 추가 (기존 `openId` 옆):

```tsx
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showBackdatePick, setShowBackdatePick] = useState(false);
  const [openCalSessionId, setOpenCalSessionId] = useState('');
  const routines = useLiveQuery(() => listRoutines(), []) ?? [];
  const active = useLiveQuery(() => getActiveSession(), []);
  const today = new Date();
  const workoutDays = new Set(
    sessions.map((s) => new Date(s.startedAt)).map((d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`),
  );
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const daySessions = selectedDate ? sessions.filter((s) => sameDay(new Date(s.startedAt), selectedDate)) : [];
  const canBackdate = selectedDate !== null && selectedDate.getTime() <= today.getTime();

  async function beginBackdate(routine?: Routine) {
    if (!selectedDate) return;
    if (active) {
      window.alert('진행 중인 운동을 먼저 완료하세요');
      return;
    }
    const noon = new Date(
      selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 12,
    ).getTime();
    await startSession(routine, noon);
    navigate('/session');
  }
```

- 렌더: `<h1 className="screen-title">기록</h1>` 바로 아래에 달력 카드 삽입 — HomeScreen의 `<div className="card"><div className="card-h">달력</div>…</div>` 블록(달력·daySessions 행·세트 표 펼침·백데이트 버튼·루틴 픽커)을 **그대로** 옮겨 붙이되, 홈의 `openSessionId`→`openCalSessionId`로 치환. 세션 행 span·`요약 ›` 버튼·`<SessionDetails key={s.id} …/>`·`＋ 이 날짜에 기록 추가`·루틴 목록·`빈 세션` 버튼 구조는 홈과 동일(현재 HomeScreen.tsx 156~207행 참조— 파일을 열어 해당 블록을 복사)
- 기존 '운동별로 보기' field와 세션 목록은 달력 카드 **아래** 그대로 유지

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/screens/HistoryScreen.test.tsx src/screens/HomeScreen.test.tsx`
Expected: 전부 PASS (홈은 아직 무변경 — 달력이 양쪽에 있는 중간 상태는 Task 3에서 해소)

- [ ] **Step 5: 커밋**

```bash
git add src/screens/HistoryScreen.tsx src/screens/HistoryScreen.test.tsx
git commit -m "feat: 기록 탭 상단에 월 달력 이식 — 날짜별 세션·세트 표 펼침·백데이트 포함"
```

---

### Task 3: 홈 재구성 — 코치 카드·링·스트릭·팁 (달력 제거)

**Files:**
- Modify: `src/screens/HomeScreen.tsx` (전면 재작성), `src/styles.css` (신규 클래스 5개), `src/screens/HomeScreen.test.tsx` (재작성)

**Interfaces:**
- Consumes (Task 1): `suggestRoutine, routineEstimate, lastTopWeight, weeklyGoalProgress, weekStreak, coachTip` / `getWeeklyGoal` / 기존 `getTodayRoutineId/setTodayRoutineId`, `unitFor/kgToDisplay`, `sessionTitle`
- 홈의 `pickNextRoutine` export는 **삭제** (coach.suggestRoutine으로 이관 — 사용처는 홈뿐임을 `grep -rn pickNextRoutine src`로 확인)

- [ ] **Step 1: HomeScreen.test.tsx를 다음 내용으로 재작성** (기존 달력 테스트는 Task 2에서 기록 탭으로 이식 완료 — 파일 전체 교체)

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { vi } from 'vitest';
import type { Session } from '../types';
import { db } from '../db/db';
import { seedLibrary } from '../db/exercises';
import { saveRoutine } from '../db/routines';
import { setTodayRoutineId } from '../db/todayRoutine';
import { startSession, getActiveSession } from '../db/sessions';
import HomeScreen from './HomeScreen';

beforeEach(async () => {
  await db.delete();
  await db.open();
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderScreen() {
  return render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/session" element={<div>세션화면</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function addFinishedSession(startedAt: number, name?: string, weight = 50): Promise<Session> {
  const s: Session = {
    id: crypto.randomUUID(),
    startedAt,
    finishedAt: startedAt + 3600_000,
    routineName: name,
    entries: [{ exerciseId: 'lib-bench-press', sets: [{ weight, reps: 10, completedAt: startedAt + 1 }] }],
  };
  await db.sessions.add(s);
  return s;
}

test('루틴이 있으면 추천 루틴이 코치 카드로 자동 제안된다', async () => {
  await seedLibrary();
  await saveRoutine({ id: 'r1', name: '가슴 날', items: [{ exerciseId: 'lib-bench-press', defaultSets: 4 }] });
  await addFinishedSession(Date.now() - 3 * 86_400_000, '가슴 날', 70);
  renderScreen();
  expect(await screen.findByText('오늘은 가슴 날!')).toBeInTheDocument();
  expect(screen.getByText('코치 추천')).toBeInTheDocument();
  expect(await screen.findByText('벤치프레스')).toBeInTheDocument();
  expect(screen.getByText(/4세트 × 70kg/)).toBeInTheDocument(); // 지난 최고 무게 프리뷰
  expect(screen.getByText(/1시간/)).toBeInTheDocument(); // 예상 시간(지난 세션 기반)
});

test('오늘의 루틴을 고르면 추천보다 우선된다', async () => {
  await saveRoutine({ id: 'r1', name: '가슴 날', items: [] });
  await saveRoutine({ id: 'r2', name: '등 날', items: [] });
  setTodayRoutineId('r2');
  renderScreen();
  expect(await screen.findByText('오늘은 등 날!')).toBeInTheDocument();
});

test('루틴 바꾸기에서 다른 루틴을 고르면 고정된다', async () => {
  await saveRoutine({ id: 'r1', name: '가슴 날', items: [] });
  await saveRoutine({ id: 'r2', name: '등 날', items: [] });
  await addFinishedSession(Date.now() - 86_400_000, '등 날'); // 등을 어제 씀 → 추천은 가슴
  renderScreen();
  expect(await screen.findByText('오늘은 가슴 날!')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '루틴 바꾸기' }));
  fireEvent.click(await screen.findByRole('button', { name: /등 날/ }));
  expect(await screen.findByText('오늘은 등 날!')).toBeInTheDocument();
});

test('운동 시작하기는 제안된 루틴으로 세션을 시작한다', async () => {
  await seedLibrary();
  await saveRoutine({ id: 'r1', name: '가슴 날', items: [{ exerciseId: 'lib-bench-press', defaultSets: 3 }] });
  renderScreen();
  fireEvent.click(await screen.findByRole('button', { name: '운동 시작하기' }));
  expect(await screen.findByText('세션화면')).toBeInTheDocument();
  expect((await getActiveSession())?.routineName).toBe('가슴 날');
});

test('루틴이 없으면 첫 운동 안내가 보인다', async () => {
  renderScreen();
  expect(await screen.findByText('첫 운동을 시작해보세요')).toBeInTheDocument();
  expect(screen.getByText('마이 탭에서 루틴을 만들면 여기에 떠요')).toBeInTheDocument();
});

test('날짜가 바뀌면 고정이 풀리고 추천으로 돌아온다', async () => {
  await saveRoutine({ id: 'r1', name: '가슴 날', items: [] });
  await saveRoutine({ id: 'r2', name: '등 날', items: [] });
  setTodayRoutineId('r2');
  renderScreen();
  expect(await screen.findByText('오늘은 등 날!')).toBeInTheDocument();
  localStorage.setItem('wt-today-routine', JSON.stringify({ id: 'r2', date: '2020-01-01' }));
  fireEvent(document, new Event('visibilitychange'));
  // 만료 → 추천(둘 다 미사용이면 첫 번째) 표시
  expect(await screen.findByText('오늘은 가슴 날!')).toBeInTheDocument();
});

test('주간 목표 링이 이번 주 완료 수를 보여준다', async () => {
  await addFinishedSession(Date.now() - 3600_000); // 오늘(이번 주) 1개
  renderScreen();
  expect(await screen.findByRole('img', { name: '주간 목표 3회 중 1회 완료' })).toBeInTheDocument();
});

test('코치 팁: 기록이 없으면 환영 문구', async () => {
  renderScreen();
  expect(await screen.findByText('첫 운동을 기록하면 여기서 다음 목표를 제안해 드려요.')).toBeInTheDocument();
});

test('진행 중 세션이 있으면 이어서 하기 카드가 우선한다', async () => {
  await startSession();
  renderScreen();
  expect(await screen.findByText('운동 진행 중이에요')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '이어서 하기' }));
  expect(await screen.findByText('세션화면')).toBeInTheDocument();
});

test('홈에 달력 카드가 없다 (기록 탭으로 이동)', async () => {
  renderScreen();
  await screen.findByText(/첫 운동을 시작해보세요|코치 추천/);
  expect(screen.queryByText('달력')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('다음 달')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/screens/HomeScreen.test.tsx`
Expected: 재작성분 대부분 FAIL (코치 카드 없음), 달력 부재 테스트 FAIL

- [ ] **Step 3: 구현**

`src/styles.css` — `.startcard` 블록 아래에 추가:

```css
.startcard .go.ghost { background: var(--surface-2); color: var(--text-2); }
.coach-pill { display: inline-block; font-size: 11px; font-weight: 800; letter-spacing: 0.06em; color: var(--on-accent); background: var(--accent); border-radius: 999px; padding: 5px 10px; }
.coach-num { width: 34px; height: 34px; border-radius: 10px; background: var(--surface-2); color: var(--accent); font-size: 13px; font-weight: 800; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.tipcard { display: flex; gap: 12px; align-items: flex-start; }
```

`src/screens/HomeScreen.tsx` 전체를 다음으로 교체:

```tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Routine } from '../types';
import { listRoutines } from '../db/routines';
import {
  startSession, getActiveSession, discardSession, listFinishedSessions, sessionTitle,
} from '../db/sessions';
import { listExercises } from '../db/exercises';
import {
  suggestRoutine, routineEstimate, lastTopWeight, weeklyGoalProgress, weekStreak, coachTip,
} from '../db/coach';
import { getWeeklyGoal } from '../db/settings';
import { kgToDisplay, unitFor } from '../db/weightUnit';
import { getTodayRoutineId, setTodayRoutineId } from '../db/todayRoutine';

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

function fmtDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function GoalRing({ done, goal }: { done: number; goal: number }) {
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

export default function HomeScreen() {
  const navigate = useNavigate();
  const [, setTick] = useState(0);
  const [showRoutinePick, setShowRoutinePick] = useState(false);
  const bump = () => setTick((n) => n + 1);
  const routines = useLiveQuery(() => listRoutines(), []) ?? [];
  const sessions = useLiveQuery(() => listFinishedSessions(), []) ?? [];
  const active = useLiveQuery(() => getActiveSession(), []);
  const allExercises = useLiveQuery(() => listExercises({ includeHidden: true }), []) ?? [];
  const exMap = new Map(allExercises.map((e) => [e.id, e]));

  useEffect(() => {
    const onVisible = () => bump();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  const today = new Date();
  const goal = getWeeklyGoal();
  const suggested = suggestRoutine(routines, sessions);
  const todayId = getTodayRoutineId();
  const routine = routines.find((r) => r.id === todayId) ?? suggested;
  const est = routine ? routineEstimate(routine, sessions) : {};
  const weekly = weeklyGoalProgress(sessions, goal);
  const streak = weekStreak(sessions, goal);
  const tip = coachTip(sessions, exMap);

  async function begin(r?: Routine) {
    await startSession(r);
    navigate('/session');
  }

  async function discardActive() {
    if (active && window.confirm('진행 중이던 세션을 버릴까요? 기록한 세트는 완전히 삭제돼요.')) await discardSession(active.id);
  }

  const heading = active ? '운동 진행 중이에요' : routine ? `오늘은 ${routine.name}!` : '오늘 뭐 할까요?';

  return (
    <div className="screen">
      <div>
        <div className="hist-row d" style={{ border: 'none', padding: 0, fontSize: 13 }}>
          {today.getMonth() + 1}월 {today.getDate()}일 {DAYS[today.getDay()]}요일
        </div>
        <h1 className="screen-title" style={{ paddingTop: 2 }}>{heading}</h1>
      </div>

      {active ? (
        <div className="startcard">
          <div className="t">진행 중인 운동이 있어요</div>
          <div className="s">{sessionTitle(active, exMap)} · {fmtDate(active.startedAt)} 시작</div>
          <button className="go" onClick={() => navigate('/session')}>이어서 하기</button>
          <button className="go ghost" style={{ marginTop: 8 }} onClick={discardActive}>버리기</button>
        </div>
      ) : (
        <div className="startcard">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span className="coach-pill">코치 추천</span>
            <span className="s" style={{ marginTop: 0 }}>
              {est.minutes || est.volumeKg !== undefined
                ? `지난 기록 기반${est.minutes ? ` · 약 ${est.minutes}` : ''}${est.volumeKg !== undefined ? ` · ${kgToDisplay(est.volumeKg, 'kg')}kg` : ''}`
                : '오늘의 루틴'}
            </span>
          </div>
          {routine ? (
            <>
              <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {routine.items.length === 0 && <div className="s" style={{ marginTop: 0 }}>루틴에 운동이 없어요 — 시작 후 자유롭게 추가하세요</div>}
                {routine.items.map((it, i) => {
                  const ex = exMap.get(it.exerciseId);
                  const w = lastTopWeight(sessions, it.exerciseId);
                  const u = unitFor(ex);
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span className="coach-num">{i + 1}</span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <span style={{ fontSize: 14.5, fontWeight: 800 }}>{ex?.name ?? '삭제된 운동'}</span>
                        <span className="d" style={{ fontSize: 12 }}>
                          {it.defaultSets}세트{w !== undefined ? ` × ${kgToDisplay(w, u)}${u}` : ''}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <button className="go" onClick={() => void begin(routine)}>운동 시작하기</button>
              <button className="go ghost" style={{ marginTop: 8 }} onClick={() => setShowRoutinePick(!showRoutinePick)}>루틴 바꾸기</button>
              {showRoutinePick && (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {routines.map((r) => (
                    <button
                      key={r.id} className="go ghost" style={{ marginTop: 0 }}
                      onClick={() => { setTodayRoutineId(r.id); setShowRoutinePick(false); bump(); }}
                    >
                      {r.name}{suggested?.id === r.id ? ' ⭐ 추천' : ''}
                    </button>
                  ))}
                  <button className="go ghost" style={{ marginTop: 0 }} onClick={() => void begin()}>빈 세션으로 시작</button>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="t" style={{ marginTop: 12 }}>첫 운동을 시작해보세요</div>
              <div className="s">마이 탭에서 루틴을 만들면 여기에 떠요</div>
              <button className="go" onClick={() => void begin()}>빈 세션으로 시작</button>
            </>
          )}
        </div>
      )}

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
          <span className="d" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
            {streak > 0 ? '목표를 채운 주가 이어지고 있어요' : '이번 주 목표부터 채워볼까요?'}
          </span>
        </div>
      </div>

      <div className="card tipcard">
        <span className="coach-num" aria-hidden="true">💡</span>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: 'var(--text-2)' }}>{tip.text}</p>
      </div>
    </div>
  );
}
```

주의: `pickNextRoutine` export와 `MonthCalendar`/`SessionDetails`/`sessionVolume` import·달력 상태·백데이트 함수는 이 교체로 제거된다. `grep -rn "pickNextRoutine" src` 가 0건인지 확인.

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/screens/HomeScreen.test.tsx src/screens/HistoryScreen.test.tsx`
Expected: 전부 PASS

- [ ] **Step 5: 커밋**

```bash
git add src/screens/HomeScreen.tsx src/screens/HomeScreen.test.tsx src/styles.css
git commit -m "feat: 코치 홈 — 추천 카드·주간 목표 링·스트릭·팁, 달력은 기록 탭으로"
```

---

### Task 4: 마이 탭 주간 목표 설정

**Files:**
- Modify: `src/screens/ManageScreen.tsx`
- Test: `src/screens/ManageScreen.test.tsx` (1개 추가)

**Interfaces:**
- Consumes (Task 1): `getWeeklyGoal, setWeeklyGoal` (from `../db/settings`)

- [ ] **Step 1: 실패하는 테스트 작성**

`src/screens/ManageScreen.test.tsx` 끝에:

```tsx
test('주간 목표를 바꾸면 저장된다', async () => {
  renderScreen();
  const input = await screen.findByLabelText('주간 목표 (회)');
  fireEvent.change(input, { target: { value: '5' } });
  expect(localStorage.getItem('wt-weekly-goal')).toBe('5');
});
```

(파일의 기존 renderScreen 헬퍼 사용 — 없으면 기존 테스트가 쓰는 렌더 방식을 그대로 따른다)

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/screens/ManageScreen.test.tsx`
Expected: 신규 1개 FAIL

- [ ] **Step 3: 구현**

`src/screens/ManageScreen.tsx`:

- import에 `getWeeklyGoal, setWeeklyGoal`을 `../db/settings` 기존 줄에 추가
- 상태 추가 (기존 rest 옆): `const [goal, setGoal] = useState(getWeeklyGoal());`
- 설정 카드의 '무게 단위' field 아래에:

```tsx
        <div className="field">
          <label htmlFor="weekly-goal">주간 목표 (회)</label>
          <input
            id="weekly-goal" type="number" inputMode="numeric" min="1" max="14"
            value={goal}
            onChange={(e) => {
              const n = Math.min(14, Math.max(1, Number(e.target.value) || 3));
              setGoal(n);
              setWeeklyGoal(n);
            }}
          />
        </div>
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/screens/ManageScreen.test.tsx`
Expected: 전부 PASS

- [ ] **Step 5: 커밋**

```bash
git add src/screens/ManageScreen.tsx src/screens/ManageScreen.test.tsx
git commit -m "feat: 마이 탭 주간 목표 설정 (wt-weekly-goal)"
```

---

### Task 5: 전체 검증

- [ ] **Step 1:** `npm test` → 전체 PASS (200 + coach 10 + settings 1 + 기록 이식 5 + 마이 1 = 217 안팎; 홈 재작성으로 홈 파일은 16→10)
- [ ] **Step 2:** `npx tsc --noEmit`, `npm run build` → 에러 없음
- [ ] **Step 3:** 실패 시 수정 후 `git add -A src && git commit -m "fix: Phase 2 통합 검증 수정"`
