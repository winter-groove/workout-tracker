import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { db } from '../db/db';
import { seedLibrary } from '../db/exercises';
import type { Session } from '../types';
import * as progress from '../db/progress';
import HistoryScreen from './HistoryScreen';

beforeEach(async () => {
  await db.delete();
  await db.open();
  await seedLibrary();
});

afterEach(() => {
  vi.restoreAllMocks();
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
        <Route path="/edit/:sessionId" element={<div>편집화면</div>} />
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

test('세션 상세에서 수정하기로 편집 화면에 간다', async () => {
  await addFinishedSession(1000, 'lib-bench-press', [{ weight: 50, reps: 10 }]);
  renderScreen();
  fireEvent.click(await screen.findByText(/1개 운동/));
  fireEvent.click(screen.getByRole('button', { name: '수정하기' }));
  expect(await screen.findByText('편집화면')).toBeInTheDocument();
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

test('race: 늦게 resolve된 이전 세션 요약이 나중 선택을 덮어쓰지 않는다', async () => {
  const a = await addFinishedSession(1000, 'lib-bench-press', [{ weight: 50, reps: 10 }]); // vol 500 첫 기록
  const b = await addFinishedSession(2000, 'lib-squat', [{ weight: 80, reps: 5 }]); // vol 400 첫 기록

  // 세션 id별 resolver를 잡아둬서 순서를 뒤집어 resolve할 수 있게 함
  const resolvers = new Map<string, (v: progress.EntryProgress[]) => void>();
  const real = progress.summarizeSession;
  vi.spyOn(progress, 'summarizeSession').mockImplementation((s: Session) => {
    return new Promise((resolve) => {
      resolvers.set(s.id, resolve);
    });
  });

  renderScreen();
  const cards = await screen.findAllByText(/1개 운동/);
  // cards[0] = 최신 = 스쿼트(b), cards[1] = 벤치(a)
  fireEvent.click(cards[0]); // b 펼침 → b의 promise 대기
  fireEvent.click(cards[1]); // a로 전환 → a의 promise 대기, b는 아직 미해결

  // 이미 닫힌 b의 promise를 뒤늦게 resolve — a가 열린 상태를 덮어쓰면 안 됨
  const realA = await real(a);
  const realB = await real(b);
  resolvers.get(b.id)!(realB);
  await Promise.resolve();
  await Promise.resolve();

  expect(screen.queryByText('볼륨 400kg · 최고 80kg · 첫 기록')).not.toBeInTheDocument();

  // 현재 선택인 a의 promise를 resolve → 올바른 요약 표시
  resolvers.get(a.id)!(realA);
  expect(await screen.findByText('볼륨 500kg · 최고 50kg · 첫 기록')).toBeInTheDocument();
});
