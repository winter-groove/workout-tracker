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

test('세션을 펼치면 운동별 요약이 함께 표시되고 요약 보기 버튼은 없다', async () => {
  await addFinishedSession(1000, 'lib-bench-press', [{ weight: 50, reps: 10 }]);
  await addFinishedSession(2000, 'lib-bench-press', [{ weight: 60, reps: 10 }]);
  renderScreen();
  fireEvent.click((await screen.findAllByText(/1개 운동/))[0]); // 최신(60kg) 세션 펼침
  expect(await screen.findByText('볼륨 600kg 🔺 +20% · 최고 60kg 🔺 +10kg')).toBeInTheDocument();
  expect(screen.getByText(/벤치프레스.*🏆/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '요약 보기' })).not.toBeInTheDocument();
});

test('펼친 세션을 바꾸면 이전 세션의 요약이 새 세션에 표시되지 않는다', async () => {
  await addFinishedSession(1000, 'lib-bench-press', [{ weight: 50, reps: 10 }]); // vol 500
  await addFinishedSession(2000, 'lib-squat', [{ weight: 80, reps: 5 }]);        // vol 400, 첫 기록
  renderScreen();
  const cards = await screen.findAllByText(/1개 운동/);
  fireEvent.click(cards[0]); // 최신: 스쿼트 세션
  expect(await screen.findByText('볼륨 400kg · 최고 80kg · 첫 기록')).toBeInTheDocument();
  fireEvent.click(cards[1]); // 벤치 세션으로 전환
  expect(await screen.findByText('볼륨 500kg · 최고 50kg · 첫 기록')).toBeInTheDocument();
  expect(screen.queryByText('볼륨 400kg · 최고 80kg · 첫 기록')).not.toBeInTheDocument();
});
