import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { vi } from 'vitest';
import type { Session } from '../types';
import { db } from '../db/db';
import { saveRoutine } from '../db/routines';
import { setTodayRoutineId } from '../db/todayRoutine';
import { startSession, getActiveSession } from '../db/sessions';
import HomeScreen from './HomeScreen';

beforeEach(async () => {
  await db.delete();
  await db.open();
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
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
  fireEvent.click(await screen.findByText('가슴 날 · 1개 운동'));
  expect(await screen.findByText('요약화면')).toBeInTheDocument();
});

test('기록 없는 날짜를 누르면 빈 문구가 보인다', async () => {
  renderWithSummary();
  const now = new Date();
  fireEvent.click(await screen.findByRole('button', { name: `${now.getMonth() + 1}월 15일` }));
  expect(await screen.findByText('이 날은 운동 기록이 없어요')).toBeInTheDocument();
});

test('과거 날짜에 기록 추가 버튼으로 백데이트 세션을 시작한다', async () => {
  await saveRoutine({ id: 'r1', name: '가슴운동', items: [] });
  render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/session" element={<div>세션화면</div>} />
        <Route path="/summary/:sessionId" element={<div>요약화면</div>} />
      </Routes>
    </MemoryRouter>,
  );
  const now = new Date();
  fireEvent.click(await screen.findByRole('button', { name: `${now.getMonth() + 1}월 1일` }));
  fireEvent.click(await screen.findByRole('button', { name: '＋ 이 날짜에 기록 추가' }));
  fireEvent.click(screen.getByRole('button', { name: '가슴운동' }));
  expect(await screen.findByText('세션화면')).toBeInTheDocument();
  const s = await getActiveSession();
  const d = new Date(s!.startedAt);
  expect(d.getDate()).toBe(1);
  expect(d.getHours()).toBe(12);
});

test('미래 날짜에는 기록 추가 버튼이 없다', async () => {
  renderWithSummary();
  const now = new Date();
  fireEvent.click(await screen.findByLabelText('다음 달'));
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  fireEvent.click(await screen.findByRole('button', { name: `${next.getMonth() + 1}월 15일` }));
  expect(await screen.findByText('이 날은 운동 기록이 없어요')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '＋ 이 날짜에 기록 추가' })).not.toBeInTheDocument();
});

test('진행 중 세션이 있으면 기록 추가가 차단된다', async () => {
  vi.spyOn(window, 'alert').mockImplementation(() => {});
  await startSession();
  renderWithSummary();
  const now = new Date();
  fireEvent.click(await screen.findByRole('button', { name: `${now.getMonth() + 1}월 1일` }));
  fireEvent.click(await screen.findByRole('button', { name: '＋ 이 날짜에 기록 추가' }));
  fireEvent.click(screen.getByRole('button', { name: '빈 세션' }));
  expect(window.alert).toHaveBeenCalledWith('진행 중인 운동을 먼저 완료하세요');
});

test('홈에 최근 운동 카드가 없다', async () => {
  await addFinishedSession(Date.now() - 3_600_000, '등 날');
  renderWithSummary();
  await screen.findByText('달력');
  expect(screen.queryByText('최근 운동')).not.toBeInTheDocument();
});
