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
