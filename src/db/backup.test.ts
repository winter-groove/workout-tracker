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
