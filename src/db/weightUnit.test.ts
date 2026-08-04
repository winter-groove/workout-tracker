import { getWeightUnit, setWeightUnit, kgToDisplay, displayToKg, unitFor, fmtWeightCell, fmtWeightLabel } from './weightUnit';

afterEach(() => {
  localStorage.removeItem('wt-weight-unit');
});

test('기본 단위는 kg이고 토글이 영속된다', () => {
  expect(getWeightUnit()).toBe('kg');
  setWeightUnit('lb');
  expect(getWeightUnit()).toBe('lb');
  setWeightUnit('kg');
  expect(getWeightUnit()).toBe('kg');
});

test('kg 모드 변환은 항등(소수 1자리)', () => {
  expect(kgToDisplay(60)).toBe(60);
  expect(kgToDisplay(20.41)).toBe(20.4);
  expect(displayToKg(62.5)).toBe(62.5);
});

test('lb 왕복: 45lb → 20.41kg → 45lb', () => {
  setWeightUnit('lb');
  const kg = displayToKg(45);
  expect(kg).toBe(20.41);
  expect(kgToDisplay(kg)).toBe(45);
  expect(kgToDisplay(60)).toBe(132.3); // 60kg 표시
});

test('명시 단위 파라미터는 전역 설정과 무관하게 변환한다', () => {
  expect(kgToDisplay(60, 'lb')).toBe(132.3);
  expect(kgToDisplay(60, 'kg')).toBe(60);
  expect(displayToKg(135, 'lb')).toBe(61.23); // 135 × 0.45359237 = 61.2350 → 소수 2자리
  setWeightUnit('lb');
  try {
    expect(kgToDisplay(60, 'kg')).toBe(60); // 전역 lb여도 명시 kg 우선
    expect(displayToKg(60, 'kg')).toBe(60);
  } finally {
    localStorage.removeItem('wt-weight-unit');
  }
});

test('unitFor: 운동별 단위가 있으면 우선, 없으면 전역 설정', () => {
  expect(unitFor({ unit: 'lb' })).toBe('lb');
  expect(unitFor({})).toBe('kg');
  expect(unitFor(undefined)).toBe('kg');
  setWeightUnit('lb');
  try {
    expect(unitFor({})).toBe('lb');
    expect(unitFor({ unit: 'kg' })).toBe('kg');
  } finally {
    localStorage.removeItem('wt-weight-unit');
  }
});

test('fmtWeightCell/fmtWeightLabel: lb면 kg 병기', () => {
  expect(fmtWeightCell(60, 'kg')).toBe('60');
  expect(fmtWeightCell(60, 'lb')).toBe('132.3 (60kg)');
  expect(fmtWeightLabel(60, 'kg')).toBe('60kg');
  expect(fmtWeightLabel(60, 'lb')).toBe('132.3lb (60kg)');
  expect(fmtWeightLabel(600, 'lb')).toBe('1322.8lb (600kg)');
});
