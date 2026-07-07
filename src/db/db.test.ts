import { db } from './db';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

test('exercises에 저장하고 조회할 수 있다', async () => {
  await db.exercises.add({
    id: 'e1', name: '벤치프레스', bodyPart: '가슴', equipment: '바벨',
    isCustom: false, isHidden: false,
  });
  const found = await db.exercises.get('e1');
  expect(found?.name).toBe('벤치프레스');
});

test('sessions를 startedAt 인덱스로 정렬 조회할 수 있다', async () => {
  await db.sessions.bulkAdd([
    { id: 's1', startedAt: 100, entries: [] },
    { id: 's2', startedAt: 200, entries: [] },
  ]);
  const list = await db.sessions.orderBy('startedAt').reverse().toArray();
  expect(list.map((s) => s.id)).toEqual(['s2', 's1']);
});
