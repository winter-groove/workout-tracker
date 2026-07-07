import { db } from './db';
import type { Routine } from '../types';

export function newRoutine(): Routine {
  return { id: crypto.randomUUID(), name: '', items: [] };
}

export async function listRoutines(): Promise<Routine[]> {
  const all = await db.routines.toArray();
  return all.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

export async function saveRoutine(r: Routine): Promise<void> {
  await db.routines.put(r);
}

export async function deleteRoutine(id: string): Promise<void> {
  await db.routines.delete(id);
}
