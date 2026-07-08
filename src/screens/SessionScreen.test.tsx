import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { db } from '../db/db';
import { seedLibrary } from '../db/exercises';
import { startSession, getActiveSession } from '../db/sessions';
import * as progress from '../db/progress';
import type { Routine } from '../types';
import SessionScreen from './SessionScreen';

const routine: Routine = {
  id: 'r1', name: '가슴 날',
  items: [
    { exerciseId: 'lib-bench-press', defaultSets: 2 },
    { exerciseId: 'lib-squat', defaultSets: 2 },
  ],
};

beforeEach(async () => {
  await db.delete();
  await db.open();
  await seedLibrary();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/session']}>
      <SessionScreen />
    </MemoryRouter>,
  );
}

test('활성 세션의 첫 운동과 세트가 표시된다', async () => {
  await startSession(routine);
  renderScreen();
  expect(await screen.findByText('벤치프레스')).toBeInTheDocument();
  expect(screen.getByText('1 / 2')).toBeInTheDocument();
  expect(screen.getAllByLabelText(/세트 \d+ 완료/)).toHaveLength(2);
});

test('세트를 체크하면 completedAt이 저장되고 휴식 타이머가 나타난다', async () => {
  await startSession(routine);
  renderScreen();
  await screen.findByText('벤치프레스');
  fireEvent.click(screen.getByLabelText('세트 1 완료'));
  await waitFor(async () => {
    const s = await getActiveSession();
    expect(s?.entries[0].sets[0].completedAt).toBeDefined();
  });
  expect(screen.getByText('건너뛰기')).toBeInTheDocument();
});

test('무게를 수정하면 저장된다', async () => {
  await startSession(routine);
  renderScreen();
  await screen.findByText('벤치프레스');
  const weightInput = screen.getAllByLabelText(/세트 1 무게/)[0];
  fireEvent.change(weightInput, { target: { value: '72.5' } });
  await waitFor(async () => {
    const s = await getActiveSession();
    expect(s?.entries[0].sets[0].weight).toBe(72.5);
  });
});

test('다음 운동으로 이동한다', async () => {
  await startSession(routine);
  renderScreen();
  await screen.findByText('벤치프레스');
  fireEvent.click(screen.getByRole('button', { name: '다음 운동' }));
  expect(await screen.findByText('스쿼트')).toBeInTheDocument();
  expect(screen.getByText('2 / 2')).toBeInTheDocument();
});

test('지난 기록 배지가 표시된다', async () => {
  const prev = await startSession(routine);
  prev.entries[0].sets = [{ weight: 60, reps: 10, completedAt: Date.now() }];
  const { finishSession } = await import('../db/sessions');
  await finishSession(prev);

  await startSession(routine);
  renderScreen();
  expect(await screen.findByText(/지난번 60kg×10/)).toBeInTheDocument();
});

test('실시간 볼륨 비교가 표시되고 지난 기록을 넘으면 증가로 바뀐다', async () => {
  const prev = await startSession(routine);
  prev.entries[0].sets = [{ weight: 60, reps: 10, completedAt: Date.now() }];
  const { finishSession } = await import('../db/sessions');
  await finishSession(prev);

  await startSession(routine);
  renderScreen();
  expect(await screen.findByText(/볼륨 0 \/ 지난 600kg/)).toBeInTheDocument();

  // buildEntry가 60×10을 미리 채워줌 → 횟수를 11로 올리고 완료 → 660 > 600
  fireEvent.change(screen.getByLabelText('세트 1 횟수'), { target: { value: '11' } });
  fireEvent.click(screen.getByLabelText('세트 1 완료'));
  expect(await screen.findByText(/볼륨 660kg 🔺 \+10%/)).toBeInTheDocument();
});

test('이전 PR을 넘는 세트를 완료하면 PR 뱃지가 뜬다', async () => {
  const prev = await startSession(routine);
  prev.entries[0].sets = [{ weight: 60, reps: 10, completedAt: Date.now() }];
  const { finishSession } = await import('../db/sessions');
  await finishSession(prev);

  await startSession(routine);
  renderScreen();
  await screen.findByText(/지난번 60kg×10/);
  fireEvent.change(screen.getByLabelText('세트 1 무게'), { target: { value: '65' } });
  fireEvent.click(screen.getByLabelText('세트 1 완료'));
  expect(await screen.findByText(/🏆 PR!/)).toBeInTheDocument();
});

test('운동 완료 시 요약 화면으로 이동한다', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  const single: Routine = {
    id: 'r2', name: '한 운동',
    items: [{ exerciseId: 'lib-bench-press', defaultSets: 1 }],
  };
  await startSession(single);
  render(
    <MemoryRouter initialEntries={['/session']}>
      <Routes>
        <Route path="/session" element={<SessionScreen />} />
        <Route path="/summary/:sessionId" element={<div>요약화면</div>} />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByText('벤치프레스');
  fireEvent.click(screen.getByLabelText('세트 1 완료'));
  fireEvent.click(screen.getByRole('button', { name: '운동 완료' }));
  expect(await screen.findByText('요약화면')).toBeInTheDocument();
});

test('무게가 0이면 입력란이 빈칸으로 보이고 입력하면 그대로 반영된다', async () => {
  await startSession(routine); // 지난 기록 없음 → 무게 0으로 프리필
  renderScreen();
  await screen.findByText('벤치프레스');
  const weightInput = screen.getByLabelText('세트 1 무게') as HTMLInputElement;
  expect(weightInput.value).toBe('');
  fireEvent.change(weightInput, { target: { value: '40' } });
  await waitFor(async () => {
    const s = await getActiveSession();
    expect(s?.entries[0].sets[0].weight).toBe(40);
  });
  expect((screen.getByLabelText('세트 1 무게') as HTMLInputElement).value).toBe('40');
});

test('운동 추가 picker가 세션의 최빈 부위로 미리 필터되어 열린다', async () => {
  const chestOnly: Routine = {
    id: 'r5', name: '가슴 날',
    items: [{ exerciseId: 'lib-bench-press', defaultSets: 1 }],
  };
  await startSession(chestOnly);
  renderScreen();
  await screen.findByText('벤치프레스');
  fireEvent.click(screen.getByRole('button', { name: '＋ 운동 추가' }));
  expect(await screen.findByRole('button', { name: '가슴' })).toHaveClass('on');
  await waitFor(() => expect(screen.queryByText('스쿼트')).not.toBeInTheDocument());
});

async function addFinishedSession(
  startedAt: number, exerciseId: string, sets: { weight: number; reps: number }[],
) {
  await db.sessions.add({
    id: crypto.randomUUID(),
    startedAt,
    finishedAt: startedAt + 3600_000,
    entries: [{ exerciseId, sets: sets.map((x) => ({ ...x, completedAt: startedAt + 1 })) }],
  });
}

test('백데이트 세션은 경과 시계 대신 날짜를 표시한다', async () => {
  const past = new Date();
  past.setDate(past.getDate() - 1);
  const noon = new Date(past.getFullYear(), past.getMonth(), past.getDate(), 12).getTime();
  await startSession(routine, noon);
  renderScreen();
  await screen.findByText('벤치프레스');
  expect(screen.getByText(`${past.getMonth() + 1}/${past.getDate()}`)).toBeInTheDocument();
});

test('백데이트 세션의 지난 기록은 세션 날짜 이전 기준이다', async () => {
  const now = Date.now();
  await addFinishedSession(now - 3 * 86_400_000, 'lib-bench-press', [{ weight: 50, reps: 10 }]);
  await addFinishedSession(now - 3_600_000, 'lib-bench-press', [{ weight: 70, reps: 10 }]); // 최근 기록
  await startSession(routine, now - 2 * 86_400_000); // 그 사이 날짜로 백데이트
  renderScreen();
  expect(await screen.findByText(/지난번 50kg×10/)).toBeInTheDocument(); // 70이 아닌 50 기준
});

test('시간이 흘러도 지난 기록을 매초 다시 조회하지 않는다', async () => {
  const spy = vi.spyOn(progress, 'getPreviousRecord');
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    await startSession(routine);
    renderScreen();
    await vi.waitFor(() => {
      expect(screen.getByText('벤치프레스')).toBeInTheDocument();
    });
    const callsAfterMount = spy.mock.calls.length;
    await vi.advanceTimersByTimeAsync(3000); // 시계 3틱
    expect(spy.mock.calls.length).toBe(callsAfterMount);
  } finally {
    vi.useRealTimers();
    spy.mockRestore();
  }
});
