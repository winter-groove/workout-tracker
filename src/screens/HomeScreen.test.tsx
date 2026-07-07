import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { db } from '../db/db';
import { saveRoutine } from '../db/routines';
import { setTodayRoutineId } from '../db/todayRoutine';
import HomeScreen from './HomeScreen';

beforeEach(async () => {
  await db.delete();
  await db.open();
  localStorage.clear();
});

function renderScreen() {
  return render(
    <MemoryRouter>
      <HomeScreen />
    </MemoryRouter>,
  );
}

test('미선택이면 루틴 목록과 추천 뱃지가 보인다', async () => {
  await saveRoutine({ id: 'r1', name: '가슴운동', items: [] });
  await saveRoutine({ id: 'r2', name: '등운동', items: [] });
  renderScreen();
  expect(await screen.findByText('오늘 뭐 할까요?')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /가슴운동.*추천/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '등운동' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '빈 세션으로 시작' })).toBeInTheDocument();
});

test('루틴을 탭하면 오늘의 루틴으로 고정된다', async () => {
  await saveRoutine({ id: 'r1', name: '가슴운동', items: [{ exerciseId: 'e1', defaultSets: 3 }] });
  renderScreen();
  fireEvent.click(await screen.findByRole('button', { name: /가슴운동/ }));
  expect(await screen.findByText('오늘은 가슴운동')).toBeInTheDocument();
  expect(screen.getByText('1개 운동')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '운동 시작하기' })).toBeInTheDocument();
});

test('다시 선택을 누르면 목록으로 돌아온다', async () => {
  await saveRoutine({ id: 'r1', name: '가슴운동', items: [] });
  setTodayRoutineId('r1');
  renderScreen();
  expect(await screen.findByText('오늘은 가슴운동')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '다시 선택' }));
  expect(await screen.findByText('오늘 뭐 할까요?')).toBeInTheDocument();
});

test('저장된 오늘의 루틴이 삭제됐으면 선택 화면이 보인다', async () => {
  await saveRoutine({ id: 'r1', name: '가슴운동', items: [] });
  setTodayRoutineId('삭제된루틴');
  renderScreen();
  expect(await screen.findByText('오늘 뭐 할까요?')).toBeInTheDocument();
});

test('루틴이 하나도 없으면 기존 첫 운동 안내가 보인다', async () => {
  renderScreen();
  expect(await screen.findByText('첫 운동을 시작해보세요')).toBeInTheDocument();
});

test('앱이 켜진 채 날짜가 바뀌면 다시 선택 화면으로 돌아온다', async () => {
  await saveRoutine({ id: 'r1', name: '가슴운동', items: [] });
  setTodayRoutineId('r1');
  renderScreen();
  expect(await screen.findByText('오늘은 가슴운동')).toBeInTheDocument();
  // 자정이 지나 저장된 날짜가 어제가 된 상황을 시뮬레이션
  localStorage.setItem('wt-today-routine', JSON.stringify({ id: 'r1', date: '2020-01-01' }));
  fireEvent(document, new Event('visibilitychange'));
  expect(await screen.findByText('오늘 뭐 할까요?')).toBeInTheDocument();
});
