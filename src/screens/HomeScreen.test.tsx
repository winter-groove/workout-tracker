import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { Session } from '../types';
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

async function addFinishedSession(startedAt: number, name?: string): Promise<Session> {
  const s: Session = {
    id: crypto.randomUUID(),
    startedAt,
    finishedAt: startedAt + 3600_000,
    routineName: name,
    entries: [{ exerciseId: 'e1', sets: [{ weight: 50, reps: 10, completedAt: startedAt + 1 }] }],
  };
  await db.sessions.add(s);
  return s;
}

function renderWithSummary() {
  return render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/summary/:sessionId" element={<div>요약화면</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

test('달력 날짜를 누르면 그날 세션이 표시되고 탭하면 요약으로 이동한다', async () => {
  const now = new Date();
  const ts = new Date(now.getFullYear(), now.getMonth(), 15, 10, 0).getTime();
  await addFinishedSession(ts, '가슴 날');
  renderWithSummary();
  fireEvent.click(await screen.findByRole('button', { name: `${now.getMonth() + 1}월 15일` }));
  // 달력 아래 목록 + 최근 운동 카드 양쪽에 같은 텍스트가 존재
  const rows = await screen.findAllByText('가슴 날 · 1개 운동');
  expect(rows).toHaveLength(2);
  fireEvent.click(rows[0]); // 달력 쪽 행
  expect(await screen.findByText('요약화면')).toBeInTheDocument();
});

test('기록 없는 날짜를 누르면 빈 문구가 보인다', async () => {
  renderWithSummary();
  const now = new Date();
  fireEvent.click(await screen.findByRole('button', { name: `${now.getMonth() + 1}월 15일` }));
  expect(await screen.findByText('이 날은 운동 기록이 없어요')).toBeInTheDocument();
});

test('최근 운동을 누르면 요약 화면으로 이동한다', async () => {
  await addFinishedSession(Date.now() - 86_400_000, '등 날');
  renderWithSummary();
  fireEvent.click(await screen.findByText('등 날 · 1개 운동'));
  expect(await screen.findByText('요약화면')).toBeInTheDocument();
});
