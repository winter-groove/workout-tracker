import { db } from './db';
import {
  seedLibrary, listExercises, addCustomExercise,
  setExerciseHidden, deleteCustomExercise, LIBRARY_VERSION,
} from './exercises';
import library from '../data/exercise-library.json';
import legacy from '../data/legacy-55.json';
import type { BodyPart, Equipment } from '../types';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

test('seedLibrary는 라이브러리 전체를 넣고, 두 번 불러도 중복되지 않는다', async () => {
  await seedLibrary();
  await seedLibrary();
  const all = await db.exercises.toArray();
  expect(all.length).toBe(library.length);
  const bench = await db.exercises.get('lib-bench-press');
  expect(bench?.name).toBe('벤치프레스');
  expect(bench?.imagePath).toBe('exercises/bench-press.webp');
});

test('seedLibrary는 사용자가 숨긴 운동을 되살리지 않는다', async () => {
  await seedLibrary();
  await setExerciseHidden('lib-squat', true);
  await db.meta.delete('libraryVersion'); // 앱 업데이트로 재시딩되는 상황 재현
  await seedLibrary();
  const squat = await db.exercises.get('lib-squat');
  expect(squat?.isHidden).toBe(true);
});

test('listExercises는 숨긴 운동을 제외하고 이름순 정렬한다', async () => {
  await seedLibrary();
  await setExerciseHidden('lib-bench-press', true);
  const list = await listExercises();
  expect(list.find((e) => e.id === 'lib-bench-press')).toBeUndefined();
  const names = list.map((e) => e.name);
  expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'ko')));
});

test('커스텀 운동 추가/삭제', async () => {
  const ex = await addCustomExercise({
    name: '스미스머신 벤치', bodyPart: '가슴', equipment: '머신', iconKey: 'machine',
  });
  expect(ex.isCustom).toBe(true);
  expect((await listExercises()).some((e) => e.id === ex.id)).toBe(true);
  await deleteCustomExercise(ex.id);
  expect(await db.exercises.get(ex.id)).toBeUndefined();
});

test('내장 운동은 deleteCustomExercise로 지울 수 없다', async () => {
  await seedLibrary();
  await expect(deleteCustomExercise('lib-squat')).rejects.toThrow();
  expect(await db.exercises.get('lib-squat')).toBeDefined();
});

test('v1 사용자 재시드: 신규만 추가되고 기존 행(숨김 포함)은 유지된다', async () => {
  await db.exercises.bulkAdd(legacy.map((x) => ({
    id: `lib-${x.id}`,
    name: x.name,
    bodyPart: x.bodyPart as BodyPart,
    equipment: x.equipment as Equipment,
    imagePath: `exercises/${x.id}.webp`,
    isCustom: false,
    isHidden: false,
  })));
  await db.exercises.update('lib-bench-press', { isHidden: true });
  await db.meta.put({ key: 'libraryVersion', value: 1 });
  await seedLibrary();
  expect(await db.exercises.count()).toBe(library.length);
  const bench = await db.exercises.get('lib-bench-press');
  expect(bench?.isHidden).toBe(true);
  expect((await db.meta.get('libraryVersion'))?.value).toBe(LIBRARY_VERSION);
});

test('이름 동기화: 옛 이름 내장 행이 갱신되고 숨김·커스텀은 유지된다', async () => {
  await db.exercises.bulkAdd([
    {
      id: 'lib-reverse-machine-flyes', name: '리버스 머신 플라이',
      bodyPart: '어깨', equipment: '머신',
      imagePath: 'exercises/reverse-machine-flyes.webp', isCustom: false, isHidden: true,
    },
    {
      id: 'custom-1', name: '내 커스텀 운동',
      bodyPart: '가슴', equipment: '기타', iconKey: 'barbell', isCustom: true, isHidden: false,
    },
  ]);
  await db.meta.put({ key: 'libraryVersion', value: 2 });
  await seedLibrary();
  const r = await db.exercises.get('lib-reverse-machine-flyes');
  expect(r?.name).toBe('리버스 펙덱 플라이');
  expect(r?.isHidden).toBe(true);
  expect((await db.exercises.get('custom-1'))?.name).toBe('내 커스텀 운동');
  expect((await db.meta.get('libraryVersion'))?.value).toBe(3);
});
