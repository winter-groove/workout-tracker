import { getTodayRoutineId, setTodayRoutineId, clearTodayRoutine } from './todayRoutine';

beforeEach(() => {
  localStorage.clear();
});

test('같은 날이면 저장한 루틴 id를 돌려준다', () => {
  setTodayRoutineId('r1', new Date(2026, 6, 7, 9, 0));
  expect(getTodayRoutineId(new Date(2026, 6, 7, 23, 59))).toBe('r1');
});

test('날짜가 다르면 undefined (자동 리셋)', () => {
  setTodayRoutineId('r1', new Date(2026, 6, 7));
  expect(getTodayRoutineId(new Date(2026, 6, 8, 0, 1))).toBeUndefined();
});

test('clear하면 undefined', () => {
  setTodayRoutineId('r1');
  clearTodayRoutine();
  expect(getTodayRoutineId()).toBeUndefined();
});

test('저장값이 손상되면 undefined', () => {
  localStorage.setItem('wt-today-routine', '{broken');
  expect(getTodayRoutineId()).toBeUndefined();
});
