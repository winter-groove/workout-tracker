import { db } from './db';
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

export async function buildEntry(exerciseId: string, defaultSets = 3): Promise<SessionEntry> {
  const last = await getLastRecord(exerciseId);
  const sets: SetRecord[] = last
    ? last.map((s) => ({ weight: s.weight, reps: s.reps }))
    : Array.from({ length: defaultSets }, () => ({ weight: 0, reps: 10 }));
  return { exerciseId, sets };
}

export async function startSession(routine?: Routine): Promise<Session> {
  const entries: SessionEntry[] = [];
  if (routine) {
    for (const item of routine.items) {
      entries.push(await buildEntry(item.exerciseId, item.defaultSets));
    }
  }
  const session: Session = {
    id: crypto.randomUUID(),
    startedAt: Date.now(),
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
  const cleaned: Session = {
    ...session,
    finishedAt: Date.now(),
    entries: session.entries
      .map((e) => ({ ...e, sets: e.sets.filter((s) => s.completedAt !== undefined) }))
      .filter((e) => e.sets.length > 0),
  };
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
