import { getWeightUnit, setWeightUnit, kgToDisplay, displayToKg } from './weightUnit';

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
