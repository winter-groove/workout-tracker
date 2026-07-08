import type { SetRecord, Session } from '../types';
import { db } from './db';

export interface EntryProgress {
  volume: number;
  maxWeight: number;
  prevVolume?: number;      // undefined면 "첫 기록"
  prevMaxWeight?: number;
  isPR: boolean;            // 그 시점까지의 최고 무게를 초과했는가
}

export function volume(sets: SetRecord[]): number {
  return sets.reduce((sum, s) => sum + s.weight * s.reps, 0);
}

export function maxWeight(sets: SetRecord[]): number {
  return sets.reduce((max, s) => Math.max(max, s.weight), 0);
}

function arrow(cur: number, prev: number): string {
  if (cur > prev) return '🔺';
  if (cur < prev) return '🔻';
  return '➖';
}

export function fmtVolumeDelta(cur: number, prev: number): string {
  if (cur === prev) return '➖';
  if (prev === 0) return arrow(cur, prev);
  const pct = Math.round(((cur - prev) / prev) * 100);
  return `${arrow(cur, prev)} ${pct > 0 ? '+' : ''}${pct}%`;
}

export function fmtWeightDelta(cur: number, prev: number): string {
  if (cur === prev) return '➖';
  const d = cur - prev;
  return `${arrow(cur, prev)} ${d > 0 ? '+' : ''}${d}kg`;
}

// records는 최신순 (getExerciseHistory의 반환 순서와 동일)
export function annotateHistory(records: SetRecord[][]): EntryProgress[] {
  const n = records.length;
  const vols = records.map(volume);
  const maxes = records.map(maxWeight);
  // prBefore[i] = i보다 오래된 기록들의 최고 무게
  const prBefore = new Array<number>(n).fill(0);
  for (let i = n - 2; i >= 0; i--) prBefore[i] = Math.max(prBefore[i + 1], maxes[i + 1]);
  return records.map((_, i) => ({
    volume: vols[i],
    maxWeight: maxes[i],
    prevVolume: i < n - 1 ? vols[i + 1] : undefined,
    prevMaxWeight: i < n - 1 ? maxes[i + 1] : undefined,
    isPR: i < n - 1 && maxes[i] > prBefore[i],
  }));
}

export async function getPreviousRecord(
  exerciseId: string, before: number,
): Promise<SetRecord[] | undefined> {
  const sessions = await db.sessions.orderBy('startedAt').reverse().toArray();
  for (const s of sessions) {
    if (s.finishedAt === undefined || s.startedAt >= before) continue;
    const entry = s.entries.find((e) => e.exerciseId === exerciseId);
    const done = entry?.sets.filter((x) => x.completedAt !== undefined);
    if (done && done.length > 0) return done;
  }
  return undefined;
}

export async function getPRWeight(exerciseId: string, before: number): Promise<number> {
  const sessions = await db.sessions.orderBy('startedAt').toArray();
  let pr = 0;
  for (const s of sessions) {
    if (s.finishedAt === undefined || s.startedAt >= before) continue;
    const entry = s.entries.find((e) => e.exerciseId === exerciseId);
    if (!entry) continue;
    pr = Math.max(pr, maxWeight(entry.sets.filter((x) => x.completedAt !== undefined)));
  }
  return pr;
}

export async function summarizeEntry(
  exerciseId: string, sets: SetRecord[], sessionStartedAt: number,
): Promise<EntryProgress> {
  const prev = await getPreviousRecord(exerciseId, sessionStartedAt);
  const pr = await getPRWeight(exerciseId, sessionStartedAt);
  const cur = { volume: volume(sets), maxWeight: maxWeight(sets) };
  return {
    ...cur,
    prevVolume: prev ? volume(prev) : undefined,
    prevMaxWeight: prev ? maxWeight(prev) : undefined,
    isPR: prev !== undefined && cur.maxWeight > pr,
  };
}

export async function summarizeSession(session: Session): Promise<EntryProgress[]> {
  return Promise.all(
    session.entries.map((e) => summarizeEntry(e.exerciseId, e.sets, session.startedAt)),
  );
}
