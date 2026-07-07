import { db } from './db';
import type { Exercise, Routine, Session } from '../types';

export interface BackupFile {
  version: 1;
  exportedAt: number;
  exercises: Exercise[];
  routines: Routine[];
  sessions: Session[];
}

export async function exportData(): Promise<BackupFile> {
  return {
    version: 1,
    exportedAt: Date.now(),
    exercises: await db.exercises.toArray(),
    routines: await db.routines.toArray(),
    sessions: await db.sessions.toArray(),
  };
}

function isBackupFile(raw: unknown): raw is BackupFile {
  if (typeof raw !== 'object' || raw === null) return false;
  const o = raw as Record<string, unknown>;
  return (
    o.version === 1 &&
    Array.isArray(o.exercises) &&
    Array.isArray(o.routines) &&
    Array.isArray(o.sessions)
  );
}

export async function importData(raw: unknown): Promise<void> {
  if (!isBackupFile(raw)) throw new Error('백업 파일 형식이 올바르지 않습니다.');
  await db.transaction('rw', db.exercises, db.routines, db.sessions, async () => {
    await db.exercises.clear();
    await db.routines.clear();
    await db.sessions.clear();
    await db.exercises.bulkAdd(raw.exercises);
    await db.routines.bulkAdd(raw.routines);
    await db.sessions.bulkAdd(raw.sessions);
  });
}
