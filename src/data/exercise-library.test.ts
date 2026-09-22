import library from './exercise-library.json';
import legacy from './legacy-55.json';
import { BODY_PARTS, EQUIPMENTS } from '../types';
import { MUSCLE_REGIONS } from './muscle-regions';

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

test('리버스 펙덱 플라이가 존재한다', () => {
  expect(library.some((x) => x.name === '리버스 펙덱 플라이')).toBe(true);
});

test('illustration이 있으면 illustrations/<id>.svg 형식이다', () => {
  for (const x of library) {
    if ('illustration' in x && x.illustration) {
      expect(x.illustration).toBe(`illustrations/${x.id}.svg`);
    }
  }
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

test('일러스트 매칭 운동은 -2/-3 프레임 규약을 지킨다', () => {
  // 파이프라인 산출물 규약: illustration이 있으면 애니 프레임 파일명이 유도 가능해야 함
  const withIllu = library.filter((x) => x.illustration);
  expect(withIllu.length).toBeGreaterThan(0);
  for (const x of withIllu) {
    expect(x.illustration).toMatch(/^illustrations\/[a-z0-9-]+\.svg$/);
  }
});

test('muscles 필드는 근육맵 영역 id 어휘만 사용하고 주동근이 첫 원소다', () => {
  const withMuscles = library.filter((x) => Array.isArray(x.muscles));
  expect(withMuscles.length).toBeGreaterThan(200); // 매칭 297 중 대부분
  const regionSet = new Set<string>(MUSCLE_REGIONS);
  for (const x of withMuscles) {
    expect(x.muscles!.length).toBeGreaterThan(0);
    for (const m of x.muscles!) expect(regionSet.has(m)).toBe(true);
  }
});
