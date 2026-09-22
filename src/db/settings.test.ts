import { getRestSeconds, setRestSeconds, getWeeklyGoal, setWeeklyGoal } from './settings';

beforeEach(() => localStorage.clear());

test('기본 휴식 시간은 90초', () => {
  expect(getRestSeconds()).toBe(90);
});

test('휴식 시간을 저장하고 읽는다', () => {
  setRestSeconds(120);
  expect(getRestSeconds()).toBe(120);
});

test('저장된 값이 비정상이면 기본값으로 돌아간다', () => {
  localStorage.setItem('wt-rest-seconds', 'abc');
  expect(getRestSeconds()).toBe(90);
});

test('주간 목표: 기본 3, 저장·클램프', () => {
  localStorage.removeItem('wt-weekly-goal');
  expect(getWeeklyGoal()).toBe(3);
  setWeeklyGoal(5);
  expect(getWeeklyGoal()).toBe(5);
  localStorage.setItem('wt-weekly-goal', '99');
  expect(getWeeklyGoal()).toBe(3); // 범위 밖 → 기본값
  localStorage.setItem('wt-weekly-goal', 'abc');
  expect(getWeeklyGoal()).toBe(3);
  localStorage.removeItem('wt-weekly-goal');
});
