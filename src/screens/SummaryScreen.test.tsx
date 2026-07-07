import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { db } from '../db/db';
import { seedLibrary } from '../db/exercises';
import type { Session } from '../types';
import SummaryScreen from './SummaryScreen';

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

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<div>홈화면</div>} />
        <Route path="/summary/:sessionId" element={<SummaryScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

test('운동별 증감과 PR 뱃지를 보여준다', async () => {
  await addFinishedSession(1000, 'lib-bench-press', [{ weight: 50, reps: 10 }]);
  const cur = await addFinishedSession(2000, 'lib-bench-press', [{ weight: 60, reps: 10 }]);
  renderAt(`/summary/${cur.id}`);
  expect(await screen.findByText('벤치프레스')).toBeInTheDocument();
  expect(screen.getByText('볼륨 600kg 🔺 +20% · 최고 60kg 🔺 +10kg')).toBeInTheDocument();
  expect(screen.getByText('🏆 PR')).toBeInTheDocument();
});

test('첫 기록이면 비교 없이 표시하고 PR 뱃지가 없다', async () => {
  const cur = await addFinishedSession(1000, 'lib-squat', [{ weight: 80, reps: 5 }]);
  renderAt(`/summary/${cur.id}`);
  expect(await screen.findByText('볼륨 400kg · 최고 80kg · 첫 기록')).toBeInTheDocument();
  expect(screen.queryByText('🏆 PR')).not.toBeInTheDocument();
});

test('세션이 없으면 홈으로 리다이렉트한다', async () => {
  renderAt('/summary/no-such-id');
  expect(await screen.findByText('홈화면')).toBeInTheDocument();
});
