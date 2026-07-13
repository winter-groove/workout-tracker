import { db } from './db';
import { exportData, importData } from './backup';
import { seedLibrary } from './exercises';
import { saveRoutine, newRoutine } from './routines';
import { startSession, finishSession } from './sessions';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

test('내보내기→가져오기 왕복이 데이터를 보존한다', async () => {
  await seedLibrary();
  const r = newRoutine(); r.name = '가슴 날';
  r.items = [{ exerciseId: 'lib-bench-press', defaultSets: 3 }];
  await saveRoutine(r);
  const s = await startSession(r);
  s.entries[0].sets[0] = { weight: 60, reps: 10, completedAt: Date.now() };
  await finishSession(s);

  const backup = await exportData();
  expect(backup.version).toBe(1);

  await db.delete();
  await db.open();
  await importData(backup);

  expect(await db.exercises.count()).toBe(backup.exercises.length);
  expect((await db.routines.toArray())[0].name).toBe('가슴 날');
  expect((await db.sessions.toArray())[0].entries[0].sets[0].weight).toBe(60);
});

test('형식이 잘못된 파일은 거부하고 기존 데이터를 보존한다', async () => {
  await seedLibrary();
  const before = await db.exercises.count();
  await expect(importData({ hello: 'world' })).rejects.toThrow();
  await expect(importData(null)).rejects.toThrow();
  expect(await db.exercises.count()).toBe(before);
});

test('가져오기는 libraryVersion 메타를 재설정하고 seedLibrary를 다시 실행한다', async () => {
  await seedLibrary();
  const backup = await exportData();

  await db.delete();
  await db.open();
  await importData(backup);

  expect(await db.meta.get('libraryVersion')).toEqual({ key: 'libraryVersion', value: 3 });
  expect(await db.exercises.count()).toBe(backup.exercises.length);
  const ids = (await db.exercises.toArray()).map((e) => e.id).sort();
  expect(ids).toEqual(backup.exercises.map((e) => e.id).sort());
});

test('백업에서 빠진 라이브러리 운동은 가져오기 후 재시딩으로 복원된다', async () => {
  await seedLibrary();
  const backup = await exportData();
  expect(backup.exercises.find((e) => e.id === 'lib-bench-press')).toBeDefined();
  const trimmedExercises = backup.exercises.filter((e) => e.id !== 'lib-bench-press');
  const trimmedBackup = { ...backup, exercises: trimmedExercises };

  await db.delete();
  await db.open();
  await importData(trimmedBackup);

  const restored = await db.exercises.get('lib-bench-press');
  expect(restored).toBeDefined();
  expect(restored?.isHidden).toBe(false);
  // no duplicates introduced by the reseed
  const ids = (await db.exercises.toArray()).map((e) => e.id);
  expect(new Set(ids).size).toBe(ids.length);
});
