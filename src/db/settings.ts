const KEY = 'wt-rest-seconds';
const DEFAULT = 90;

export function getRestSeconds(): number {
  const raw = localStorage.getItem(KEY);
  const n = raw === null ? NaN : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT;
}

export function setRestSeconds(n: number): void {
  localStorage.setItem(KEY, String(n));
}

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
