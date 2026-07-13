import { db } from './db';
import library from '../data/exercise-library.json';
import type { BodyPart, Equipment, Exercise, IconKey } from '../types';

export const LIBRARY_VERSION = 3;

export async function seedLibrary(): Promise<void> {
  const meta = await db.meta.get('libraryVersion');
  if (meta && meta.value >= LIBRARY_VERSION) return;
  const existing = await db.exercises.toArray();
  const byId = new Map(existing.map((e) => [e.id, e]));
  const rows: Exercise[] = library
    .map((x) => ({
      id: `lib-${x.id}`,
      name: x.name,
      bodyPart: x.bodyPart as BodyPart,
      equipment: x.equipment as Equipment,
      imagePath: `exercises/${x.id}.webp`,
      isCustom: false,
      isHidden: false,
    }))
    .filter((r) => !byId.has(r.id));
  await db.exercises.bulkAdd(rows);
  // 내장 운동의 이름·부위·기구를 라이브러리와 동기화 (숨김 상태는 사용자 것 유지)
  const updates: Exercise[] = [];
  for (const x of library) {
    const cur = byId.get(`lib-${x.id}`);
    if (!cur || cur.isCustom) continue;
    if (cur.name !== x.name || cur.bodyPart !== x.bodyPart || cur.equipment !== x.equipment) {
      updates.push({
        ...cur,
        name: x.name,
        bodyPart: x.bodyPart as BodyPart,
        equipment: x.equipment as Equipment,
      });
    }
  }
  if (updates.length > 0) await db.exercises.bulkPut(updates);
  await db.meta.put({ key: 'libraryVersion', value: LIBRARY_VERSION });
}

export async function listExercises(opts?: { includeHidden?: boolean }): Promise<Exercise[]> {
  const all = await db.exercises.toArray();
  const filtered = opts?.includeHidden ? all : all.filter((e) => !e.isHidden);
  return filtered.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

export async function addCustomExercise(input: {
  name: string;
  bodyPart: BodyPart;
  equipment: Equipment;
  iconKey: IconKey;
}): Promise<Exercise> {
  const ex: Exercise = {
    id: crypto.randomUUID(),
    name: input.name.trim(),
    bodyPart: input.bodyPart,
    equipment: input.equipment,
    iconKey: input.iconKey,
    isCustom: true,
    isHidden: false,
  };
  await db.exercises.add(ex);
  return ex;
}

export async function setExerciseHidden(id: string, hidden: boolean): Promise<void> {
  await db.exercises.update(id, { isHidden: hidden });
}

export async function deleteCustomExercise(id: string): Promise<void> {
  const ex = await db.exercises.get(id);
  if (!ex) return;
  if (!ex.isCustom) throw new Error('내장 운동은 삭제할 수 없습니다. 숨기기를 사용하세요.');
  await db.exercises.delete(id);
}
