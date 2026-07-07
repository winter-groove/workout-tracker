import { db } from './db';
import { listRoutines, saveRoutine, deleteRoutine, newRoutine } from './routines';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

test('루틴 저장/수정/목록/삭제', async () => {
  const r = newRoutine();
  r.name = '가슴 날';
  r.items = [{ exerciseId: 'ex1', defaultSets: 3 }];
  await saveRoutine(r);

  r.items.push({ exerciseId: 'ex2', defaultSets: 4 });
  await saveRoutine(r);

  const list = await listRoutines();
  expect(list).toHaveLength(1);
  expect(list[0].items).toHaveLength(2);

  await deleteRoutine(r.id);
  expect(await listRoutines()).toHaveLength(0);
});

test('listRoutines는 이름순 정렬', async () => {
  const a = newRoutine(); a.name = '하체 날'; await saveRoutine(a);
  const b = newRoutine(); b.name = '가슴 날'; await saveRoutine(b);
  expect((await listRoutines()).map((r) => r.name)).toEqual(['가슴 날', '하체 날']);
});
