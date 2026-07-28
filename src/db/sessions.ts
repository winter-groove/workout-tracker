import { db } from './db';
import { getPreviousRecord } from './progress';
import type { Routine, Session, SessionEntry, SetRecord } from '../types';

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
  const sets: SetRecord[] = last
    ? last.map((s) => ({ weight: s.weight, reps: s.reps }))
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

export async function finishSession(session: Session): Promise<void> {
  const withDone = session.entries.map((e) => ({
    ...e,
    sets: e.sets.filter((s) => s.completedAt !== undefined),
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
