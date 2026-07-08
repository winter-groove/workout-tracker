import { render, screen, fireEvent } from '@testing-library/react';
import MonthCalendar, { monthGrid } from './MonthCalendar';

test('monthGrid: 2026년 7월은 수요일 시작 5주', () => {
  const g = monthGrid(2026, 6);
  expect(g).toHaveLength(5);
  expect(g[0][0]).toBeNull();
  expect(g[0][1]).toBeNull();
  expect(g[0][2]?.getDate()).toBe(1);
  expect(g[4][4]?.getDate()).toBe(31);
  expect(g[4][5]).toBeNull();
  expect(g[4][6]).toBeNull();
});

test('monthGrid: 6주 달과 연도 경계', () => {
  expect(monthGrid(2026, 10)).toHaveLength(6); // 2026년 11월은 일요일 시작 → 6주
  const jan = monthGrid(2027, 0);
  expect(jan.flat().filter(Boolean)).toHaveLength(31);
});

test('달 이동과 날짜 선택이 동작한다', () => {
  const onSelect = vi.fn();
  render(<MonthCalendar workoutDays={new Set()} selectedDate={null} onSelectDate={onSelect} />);
  const now = new Date();
  expect(screen.getByText(`${now.getFullYear()}년 ${now.getMonth() + 1}월`)).toBeInTheDocument();

  fireEvent.click(screen.getByLabelText('이전 달'));
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  expect(screen.getByText(`${prev.getFullYear()}년 ${prev.getMonth() + 1}월`)).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('다음 달'));

  fireEvent.click(screen.getByRole('button', { name: `${now.getMonth() + 1}월 15일` }));
  expect(onSelect).toHaveBeenCalledTimes(1);
  expect((onSelect.mock.calls[0][0] as Date).getDate()).toBe(15);
});

test('운동한 날은 ✓로 표시된다', () => {
  const now = new Date();
  const key = `${now.getFullYear()}-${now.getMonth()}-15`;
  render(<MonthCalendar workoutDays={new Set([key])} selectedDate={null} onSelectDate={() => {}} />);
  expect(screen.getByRole('button', { name: `${now.getMonth() + 1}월 15일` })).toHaveTextContent('✓');
});
