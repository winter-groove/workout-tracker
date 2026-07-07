import Dexie, { type Table } from 'dexie';
import type { Exercise, Routine, Session } from '../types';

export interface MetaRow {
  key: string;
  value: number;
}

export class WorkoutDB extends Dexie {
  exercises!: Table<Exercise, string>;
  routines!: Table<Routine, string>;
  sessions!: Table<Session, string>;
  meta!: Table<MetaRow, string>;

  constructor() {
    super('workout-tracker');
    this.version(1).stores({
      exercises: 'id, bodyPart',
      routines: 'id',
      sessions: 'id, startedAt',
      meta: 'key',
    });
  }
}

export const db = new WorkoutDB();
