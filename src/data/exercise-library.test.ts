import library from './exercise-library.json';
import legacy from './legacy-55.json';
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

test('이름이 중복 없이 유일하다', () => {
  const names = library.map((x) => x.name);
  expect(new Set(names).size).toBe(names.length);
});

test('근력 계열 전체 확장 — 600개 이상', () => {
  expect(library.length).toBeGreaterThanOrEqual(600);
});

test('기존 55개의 id·libId·이름이 보존된다', () => {
  const byId = new Map(library.map((x) => [x.id, x]));
  expect(legacy.length).toBe(55);
  for (const l of legacy) {
    const cur = byId.get(l.id);
    expect(cur?.libId).toBe(l.libId);
    expect(cur?.name).toBe(l.name);
    expect(cur?.bodyPart).toBe(l.bodyPart);
    expect(cur?.equipment).toBe(l.equipment);
  }
});
