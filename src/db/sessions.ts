import { db } from './db';
import { getPreviousRecord } from './progress';
import type { Routine, Session, SessionEntry, SetRecord, Exercise } from '../types';

export async function getLastRecord(exerciseId: string): Promise<SetRecord[] | undefined> {
  const sessions = await db.sessions.orderBy('startedAt').reverse().toArray();
  for (const s of sessions) {
    if (!s.finishedAt) continue;
    const entry = s.entries.find((e) => e.exerciseId === exerciseId);
    const done = entry?.sets.filter((x) => x.completedAt !== undefined);
    if (done && done.length > 0) return done;
  }
  return undefined;
}

export async function buildEntry(
  exerciseId: string, defaultSets = 3, before?: number,
): Promise<SessionEntry> {
  const last = before === undefined
    ? await getLastRecord(exerciseId)
    : await getPreviousRecord(exerciseId, before);
  // 지난 기록의 드랍 구조까지 프리필 (선두 드랍 플래그는 버림)
  const sets: SetRecord[] = last
    ? last.map((s, i) => (i > 0 && s.isDrop
        ? { weight: s.weight, reps: s.reps, isDrop: true }
        : { weight: s.weight, reps: s.reps }))
    : Array.from({ length: defaultSets }, () => ({ weight: 0, reps: 10 }));
  return { exerciseId, sets };
}

export async function startSession(routine?: Routine, startedAt?: number): Promise<Session> {
  const existing = await getActiveSession();
  if (existing) return existing;
  const start = startedAt ?? Date.now();
  const entries: SessionEntry[] = [];
  if (routine) {
    for (const item of routine.items) {
      // 같은 밀리초에 끝난 직전 세션을 놓치지 않도록 +1ms 여유
      entries.push(await buildEntry(item.exerciseId, item.defaultSets, start + 1));
    }
  }
  const session: Session = {
    id: crypto.randomUUID(),
    startedAt: start,
    routineName: routine?.name,
    entries,
  };
  await db.sessions.add(session);
  return session;
}

export async function getActiveSession(): Promise<Session | undefined> {
  const all = await db.sessions.toArray();
  return all.find((s) => s.finishedAt === undefined);
}

export async function saveSession(session: Session): Promise<void> {
  await db.sessions.put(session);
}

// 선두 세트의 isDrop 해제 — 짝(본세트)이 사라진 드랍은 본세트로 승격
export function dropHeadCleaned(sets: SetRecord[]): SetRecord[] {
  return sets.length > 0 && sets[0].isDrop
    ? [{ ...sets[0], isDrop: undefined }, ...sets.slice(1)]
    : sets;
}

export async function finishSession(session: Session): Promise<void> {
  const withDone = session.entries.map((e) => ({
    ...e,
    sets: dropHeadCleaned(e.sets.filter((s) => s.completedAt !== undefined)),
  }));
  const keep = withDone.map((e) => e.sets.length > 0);
  const entries = withDone
    .map((e, i) => {
      if (!keep[i]) return null;
      return e.pairedWithNext && keep[i + 1] !== true ? { ...e, pairedWithNext: undefined } : e;
    })
    .filter((e): e is SessionEntry => e !== null);
  const cleaned: Session = { ...session, finishedAt: Date.now(), entries };
  await db.sessions.put(cleaned);
}

export async function discardSession(id: string): Promise<void> {
  await db.sessions.delete(id);
}

export async function listFinishedSessions(): Promise<Session[]> {
  const all = await db.sessions.orderBy('startedAt').reverse().toArray();
  return all.filter((s) => s.finishedAt !== undefined);
}

export async function deleteSession(id: string): Promise<void> {
  await db.sessions.delete(id);
}

export async function getExerciseHistory(
  exerciseId: string,
): Promise<{ session: Session; sets: SetRecord[] }[]> {
  const sessions = await listFinishedSessions();
  const result: { session: Session; sets: SetRecord[] }[] = [];
  for (const session of sessions) {
    const entry = session.entries.find((e) => e.exerciseId === exerciseId);
    if (entry && entry.sets.length > 0) result.push({ session, sets: entry.sets });
  }
  return result;
}

export async function resumeSession(id: string): Promise<boolean> {
  const existing = await getActiveSession();
  if (existing) return false;
  const s = await db.sessions.get(id);
  if (!s || s.finishedAt === undefined) return false;
  const active: Session = { ...s };
  delete active.finishedAt;
  await db.sessions.put(active);
  return true;
}

// exerciseId → 마지막으로 완료한 세션의 startedAt (listFinishedSessions가 최신순이라 첫 등장이 최신)
export async function getLastDoneMap(): Promise<Map<string, number>> {
  const sessions = await listFinishedSessions();
  const map = new Map<string, number>();
  for (const s of sessions) {
    for (const e of s.entries) {
      if (!map.has(e.exerciseId)) map.set(e.exerciseId, s.startedAt);
    }
  }
  return map;
}

// 표시용 세션 이름: 루틴명 > 부위 구성(최다 2개, 동수는 등장순) > '오늘 운동'. 저장하지 않는 표시 전용 값.
export function sessionTitle(session: Session, exMap: Map<string, Exercise>): string {
  if (session.routineName) return session.routineName;
  const counts = new Map<string, number>();
  for (const e of session.entries) {
    const part = exMap.get(e.exerciseId)?.bodyPart;
    if (part) counts.set(part, (counts.get(part) ?? 0) + 1);
  }
  const parts = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([p]) => p);
  return parts.length > 0 ? `${parts.join('·')} 운동` : '오늘 운동';
}

// 세트 표시 라벨: 본세트는 1,2,3…, 드랍은 직전 본세트 번호에 -1,-2…
// 배열 첫 세트의 isDrop은 무시하고 본세트로 취급 (짝 잃은 플래그 자가 치유 — groupsOf와 동일 원칙)
export function setLabels(sets: { isDrop?: boolean }[]): string[] {
  let main = 0;
  let drop = 0;
  return sets.map((s, i) => {
    if (s.isDrop && i > 0) {
      drop += 1;
      return `${main}-${drop}`;
    }
    main += 1;
    drop = 0;
    return `${main}`;
  });
}
