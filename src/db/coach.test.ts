import type { Exercise, Routine, Session } from '../types';
import {
  weekStartMs, weeklyGoalProgress, weekStreak,
  suggestRoutine, routineEstimate, lastTopWeight, coachTip,
  weeklyVolumes, highlights,
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

test('suggestRoutine은 진행 중 세션을 무시한다', () => {
  const r1: Routine = { id: 'r1', name: '가슴 날', items: [] };
  const r2: Routine = { id: 'r2', name: '등 날', items: [] };
  const finishedOld = fin(10, { routineName: '가슴 날' });
  const unfinishedRecent: Session = { ...fin(0, { routineName: '등 날' }), finishedAt: undefined };
  // 가드가 있으면: 등 날은 미사용 취급 → 등 날 추천. 가드가 없으면 등 날이 최근 사용으로 집계돼 가슴 날이 나온다.
  expect(suggestRoutine([r1, r2], [unfinishedRecent, finishedOld])?.id).toBe('r2');
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
