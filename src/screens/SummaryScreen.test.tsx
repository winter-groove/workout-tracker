import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { db } from '../db/db';
import { seedLibrary } from '../db/exercises';
import { getActiveSession } from '../db/sessions';
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
        <Route path="/session" element={<div>세션화면</div>} />
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

test('오늘 완료한 세션은 이어서 하기로 재개된다', async () => {
  const cur = await addFinishedSession(Date.now() - 3_600_000, 'lib-bench-press', [{ weight: 60, reps: 10 }]);
  renderAt(`/summary/${cur.id}`);
  fireEvent.click(await screen.findByRole('button', { name: '이어서 하기' }));
  expect(await screen.findByText('세션화면')).toBeInTheDocument();
  expect((await getActiveSession())?.id).toBe(cur.id);
});

test('과거에 완료한 세션에는 이어서 하기가 없다', async () => {
  const old = await addFinishedSession(Date.now() - 2 * 86_400_000, 'lib-squat', [{ weight: 80, reps: 5 }]);
  renderAt(`/summary/${old.id}`);
  await screen.findByText('스쿼트');
  expect(screen.queryByRole('button', { name: '이어서 하기' })).not.toBeInTheDocument();
});
