import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { db } from '../db/db';
import { seedLibrary } from '../db/exercises';
import type { Session } from '../types';
import HistoryScreen from './HistoryScreen';

beforeEach(async () => {
  await db.delete();
  await db.open();
  await seedLibrary();
});

async function addFinishedSession(
  startedAt: number, exerciseId: string, sets: { weight: number; reps: number }[],
): Promise<Session> {
  const s: Session = {
    id: crypto.randomUUID(),
    startedAt,
    finishedAt: startedAt + 3600_000,
    entries: [{ exerciseId, sets: sets.map((x) => ({ ...x, completedAt: startedAt + 1 })) }],
  };
  await db.sessions.add(s);
  return s;
}

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/history']}>
      <Routes>
        <Route path="/history" element={<HistoryScreen />} />
        <Route path="/summary/:sessionId" element={<div>요약화면</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

test('운동별로 보기에 회차별 증감과 PR이 표시된다', async () => {
  await addFinishedSession(1000, 'lib-bench-press', [{ weight: 50, reps: 10 }]);
  await addFinishedSession(2000, 'lib-bench-press', [{ weight: 60, reps: 10 }]);
  renderScreen();
  const select = await screen.findByLabelText('운동별로 보기');
  await screen.findByRole('option', { name: '벤치프레스' });
  fireEvent.change(select, {
    target: { value: 'lib-bench-press' },
  });
  expect(await screen.findByText('볼륨 600kg 🔺 +20% · 최고 60kg 🔺 +10kg 🏆')).toBeInTheDocument();
  expect(screen.getByText('볼륨 500kg · 첫 기록')).toBeInTheDocument();
});

test('세션 상세에서 요약 보기로 이동한다', async () => {
  await addFinishedSession(1000, 'lib-bench-press', [{ weight: 50, reps: 10 }]);
  renderScreen();
  fireEvent.click(await screen.findByText(/1개 운동/));
  fireEvent.click(screen.getByRole('button', { name: '요약 보기' }));
  expect(await screen.findByText('요약화면')).toBeInTheDocument();
});
