import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { vi } from 'vitest';
import type { Session } from '../types';
import { db } from '../db/db';
import { seedLibrary } from '../db/exercises';
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
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/session" element={<div>세션화면</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function addFinishedSession(startedAt: number, name?: string, weight = 50): Promise<Session> {
  const s: Session = {
    id: crypto.randomUUID(),
    startedAt,
    finishedAt: startedAt + 3600_000,
    routineName: name,
    entries: [{ exerciseId: 'lib-bench-press', sets: [{ weight, reps: 10, completedAt: startedAt + 1 }] }],
  };
  await db.sessions.add(s);
  return s;
}

test('루틴이 있으면 추천 루틴이 코치 카드로 자동 제안된다', async () => {
  await seedLibrary();
  await saveRoutine({ id: 'r1', name: '가슴 날', items: [{ exerciseId: 'lib-bench-press', defaultSets: 4 }] });
  await addFinishedSession(Date.now() - 3 * 86_400_000, '가슴 날', 70);
  renderScreen();
  expect(await screen.findByText('오늘은 가슴 날!')).toBeInTheDocument();
  expect(screen.getByText('코치 추천')).toBeInTheDocument();
  expect(await screen.findByText('벤치프레스')).toBeInTheDocument();
  expect(screen.getByText(/4세트 × 70kg/)).toBeInTheDocument(); // 지난 최고 무게 프리뷰
  expect(screen.getByText(/1시간/)).toBeInTheDocument(); // 예상 시간(지난 세션 기반)
});

test('오늘의 루틴을 고르면 추천보다 우선된다', async () => {
  await saveRoutine({ id: 'r1', name: '가슴 날', items: [] });
  await saveRoutine({ id: 'r2', name: '등 날', items: [] });
  setTodayRoutineId('r2');
  renderScreen();
  expect(await screen.findByText('오늘은 등 날!')).toBeInTheDocument();
});

test('루틴 바꾸기에서 다른 루틴을 고르면 고정된다', async () => {
  await saveRoutine({ id: 'r1', name: '가슴 날', items: [] });
  await saveRoutine({ id: 'r2', name: '등 날', items: [] });
  await addFinishedSession(Date.now() - 86_400_000, '등 날'); // 등을 어제 씀 → 추천은 가슴
  renderScreen();
  expect(await screen.findByText('오늘은 가슴 날!')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '루틴 바꾸기' }));
  fireEvent.click(await screen.findByRole('button', { name: /등 날/ }));
  expect(await screen.findByText('오늘은 등 날!')).toBeInTheDocument();
});

test('운동 시작하기는 제안된 루틴으로 세션을 시작한다', async () => {
  await seedLibrary();
  await saveRoutine({ id: 'r1', name: '가슴 날', items: [{ exerciseId: 'lib-bench-press', defaultSets: 3 }] });
  renderScreen();
  fireEvent.click(await screen.findByRole('button', { name: '운동 시작하기' }));
  expect(await screen.findByText('세션화면')).toBeInTheDocument();
  expect((await getActiveSession())?.routineName).toBe('가슴 날');
});

test('루틴이 없으면 첫 운동 안내가 보인다', async () => {
  renderScreen();
  expect(await screen.findByText('첫 운동을 시작해보세요')).toBeInTheDocument();
  expect(screen.getByText('마이 탭에서 루틴을 만들면 여기에 떠요')).toBeInTheDocument();
});

test('날짜가 바뀌면 고정이 풀리고 추천으로 돌아온다', async () => {
  await saveRoutine({ id: 'r1', name: '가슴 날', items: [] });
  await saveRoutine({ id: 'r2', name: '등 날', items: [] });
  setTodayRoutineId('r2');
  renderScreen();
  expect(await screen.findByText('오늘은 등 날!')).toBeInTheDocument();
  localStorage.setItem('wt-today-routine', JSON.stringify({ id: 'r2', date: '2020-01-01' }));
  fireEvent(document, new Event('visibilitychange'));
  // 만료 → 추천(둘 다 미사용이면 첫 번째) 표시
  expect(await screen.findByText('오늘은 가슴 날!')).toBeInTheDocument();
});

test('주간 목표 링이 이번 주 완료 수를 보여준다', async () => {
  await addFinishedSession(Date.now() - 3600_000); // 오늘(이번 주) 1개
  renderScreen();
  expect(await screen.findByRole('img', { name: '주간 목표 3회 중 1회 완료' })).toBeInTheDocument();
});

test('코치 팁: 기록이 없으면 환영 문구', async () => {
  renderScreen();
  expect(await screen.findByText('첫 운동을 기록하면 여기서 다음 목표를 제안해 드려요.')).toBeInTheDocument();
});

test('진행 중 세션이 있으면 이어서 하기 카드가 우선한다', async () => {
  await startSession();
  renderScreen();
  expect(await screen.findByText('운동 진행 중이에요')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '이어서 하기' }));
  expect(await screen.findByText('세션화면')).toBeInTheDocument();
});

test('홈에 달력 카드가 없다 (기록 탭으로 이동)', async () => {
  renderScreen();
  await screen.findByText(/첫 운동을 시작해보세요|코치 추천/);
  expect(screen.queryByText('달력')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('다음 달')).not.toBeInTheDocument();
});
