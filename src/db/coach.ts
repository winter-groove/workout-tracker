import type { Exercise, Routine, Session } from '../types';
import { maxWeight, sessionVolume } from './progress';
import { sessionDuration } from './sessions';
import { fmtWeightLabel, kgToDisplay, stepFor, unitFor } from './weightUnit';

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
    if (s.finishedAt === undefined) continue;
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
