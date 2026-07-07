import library from './exercise-library.json';
import { BODY_PARTS, EQUIPMENTS } from '../types';

test('id와 libId가 중복 없이 유일하다', () => {
  const ids = library.map((x) => x.id);
  const libIds = library.map((x) => x.libId);
  expect(new Set(ids).size).toBe(ids.length);
  expect(new Set(libIds).size).toBe(libIds.length);
});

test('모든 항목의 부위/기구가 유효한 값이다', () => {
  for (const x of library) {
    expect(BODY_PARTS).toContain(x.bodyPart);
    expect(EQUIPMENTS).toContain(x.equipment);
    expect(x.name.length).toBeGreaterThan(0);
  }
});
