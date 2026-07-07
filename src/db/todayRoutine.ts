const KEY = 'wt-today-routine';

function dateKey(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function getTodayRoutineId(now: Date = new Date()): string | undefined {
  const raw = localStorage.getItem(KEY);
  if (raw === null) return undefined;
  try {
    const parsed = JSON.parse(raw) as { id?: unknown; date?: unknown };
    if (typeof parsed.id !== 'string' || parsed.date !== dateKey(now)) return undefined;
    return parsed.id;
  } catch {
    return undefined;
  }
}

export function setTodayRoutineId(id: string, now: Date = new Date()): void {
  localStorage.setItem(KEY, JSON.stringify({ id, date: dateKey(now) }));
}

export function clearTodayRoutine(): void {
  localStorage.removeItem(KEY);
}
