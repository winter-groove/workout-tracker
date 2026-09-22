import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { db } from '../db/db';
import { seedLibrary } from '../db/exercises';
import type { Session } from '../types';
import * as progress from '../db/progress';
import { setWeightUnit } from '../db/weightUnit';
import { saveRoutine } from '../db/routines';
import { startSession, getActiveSession } from '../db/sessions';
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
        <Route path="/session" element={<div>세션화면</div>} />
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

test('이름 없는 세션은 부위 기반 자동 이름으로 표시된다', async () => {
  await addFinishedSession(1000, 'lib-bench-press', [{ weight: 50, reps: 10 }]);
  renderScreen();
  expect(await screen.findByText(/가슴 운동 · 1개 운동/)).toBeInTheDocument();
});

test('세션을 펼치면 세트 표(세트·무게·횟수)가 보인다', async () => {
  await addFinishedSession(1000, 'lib-bench-press', [
    { weight: 60, reps: 10 },
    { weight: 62.5, reps: 8 },
  ]);
  renderScreen();
  fireEvent.click(await screen.findByText(/1개 운동/));
  expect(await screen.findByText('무게(kg)')).toBeInTheDocument();
  expect(screen.getByText('세트')).toBeInTheDocument();
  expect(screen.getByText('62.5')).toBeInTheDocument(); // 2세트 무게가 표 셀로
});

test('lb 모드: 세트 표가 파운드로 표시된다', async () => {
  setWeightUnit('lb');
  try {
    await addFinishedSession(1000, 'lib-bench-press', [{ weight: 60, reps: 10 }]);
    renderScreen();
    fireEvent.click(await screen.findByText(/1개 운동/));
    expect(await screen.findByText('무게(lb)')).toBeInTheDocument();
    expect(screen.getByText('132.3 (60kg)')).toBeInTheDocument();
  } finally {
    localStorage.removeItem('wt-weight-unit');
  }
});

test('운동별 단위 lb: 전역 kg여도 그 운동만 lb + kg 병기로 표시된다', async () => {
  await db.exercises.update('lib-bench-press', { unit: 'lb' });
  await addFinishedSession(1000, 'lib-bench-press', [{ weight: 60, reps: 10 }]);
  renderScreen();
  fireEvent.click(await screen.findByText(/1개 운동/));
  expect(await screen.findByText('무게(lb)')).toBeInTheDocument();
  expect(screen.getByText('132.3 (60kg)')).toBeInTheDocument();
  // 요약 줄은 비동기 summarizeSession 이후 렌더 — 동기 getByText는 레이스
  expect(await screen.findByText('볼륨 1322.8lb (600kg) · 최고 132.3lb (60kg) · 첫 기록')).toBeInTheDocument();
});

async function addDropSession(): Promise<Session> {
  const s: Session = {
    id: crypto.randomUUID(), startedAt: 1000, finishedAt: 3600_000,
    entries: [{
      exerciseId: 'lib-bench-press',
      sets: [
        { weight: 70, reps: 8, completedAt: 1001 },
        { weight: 56, reps: 8, completedAt: 1002, isDrop: true },
      ],
    }],
  };
  await db.sessions.add(s);
  return s;
}

test('펼침 세트 표에서 드랍은 1-1로 표시된다', async () => {
  await addDropSession();
  renderScreen();
  fireEvent.click(await screen.findByText(/1개 운동/));
  expect(await screen.findByText('1-1')).toBeInTheDocument();
  expect(screen.getByText('56')).toBeInTheDocument();
});

test('운동별로 보기에서 드랍은 ↓로 표시된다', async () => {
  await addDropSession();
  renderScreen();
  const select = await screen.findByLabelText('운동별로 보기');
  await screen.findByRole('option', { name: '벤치프레스' });
  fireEvent.change(select, { target: { value: 'lib-bench-press' } });
  expect(await screen.findByText('70×8, ↓56×8')).toBeInTheDocument();
});

test('접힘 세션 행에 총 볼륨이 kg으로 표시되고, 펼쳐도 표기는 행 한 곳뿐이다', async () => {
  const s: Session = {
    id: crypto.randomUUID(),
    startedAt: 1000,
    finishedAt: 3600_000,
    entries: [
      { exerciseId: 'lib-bench-press', sets: [{ weight: 60, reps: 10, completedAt: 1001 }] },
      { exerciseId: 'lib-squat', sets: [{ weight: 100, reps: 5, completedAt: 1001 }] },
    ],
  };
  await db.sessions.add(s);
  renderScreen();
  // 펼치기 전에도 행에 총 볼륨이 보인다 (600 + 500)
  const row = await screen.findByText(/2개 운동 · 총 볼륨 1100kg/);
  fireEvent.click(row);
  expect(await screen.findAllByText('무게(kg)')).toHaveLength(2); // 운동별 세트 표 2개
  expect(screen.getAllByText(/총 볼륨 1100kg/)).toHaveLength(1); // 펼침 상세에 중복 표기 없음
});

test('운동별로 보기: lb 운동은 파운드 세트 목록 + 병기 요약으로 표시된다', async () => {
  await db.exercises.update('lib-bench-press', { unit: 'lb' });
  await addFinishedSession(1000, 'lib-bench-press', [{ weight: 60, reps: 10 }]);
  renderScreen();
  const select = await screen.findByLabelText('운동별로 보기');
  await screen.findByRole('option', { name: '벤치프레스' });
  fireEvent.change(select, { target: { value: 'lib-bench-press' } });
  expect(await screen.findByText('132.3×10')).toBeInTheDocument(); // fmtSets는 환산만
  expect(screen.getByText('볼륨 1322.8lb (600kg) · 첫 기록')).toBeInTheDocument();
});

test('펼침 상세에 운동 시간이 표시된다', async () => {
  await addFinishedSession(1000, 'lib-bench-press', [{ weight: 60, reps: 10 }]); // +1시간짜리 세션
  renderScreen();
  fireEvent.click(await screen.findByText(/1개 운동/));
  expect(await screen.findByText('⏱ 운동 시간 1시간')).toBeInTheDocument();
});

test('기록 탭 달력에서 날짜를 누르면 그날 세션이 표시되고 요약 버튼으로 이동한다', async () => {
  const now = new Date();
  const ts = new Date(now.getFullYear(), now.getMonth(), 15, 10).getTime();
  await db.sessions.add({
    id: crypto.randomUUID(), startedAt: ts, finishedAt: ts + 3600_000, routineName: '가슴 날',
    entries: [{ exerciseId: 'lib-bench-press', sets: [{ weight: 50, reps: 10, completedAt: ts + 1 }] }],
  });
  renderScreen();
  fireEvent.click(await screen.findByRole('button', { name: `${now.getMonth() + 1}월 15일` }));
  // 같은 세션이 달력 행(위)과 세션 목록 행(아래)에 모두 있으므로 findAll[0] = 달력 행
  expect((await screen.findAllByText(/가슴 날 · 1개 운동/))[0]).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '요약 ›' })); // 요약 › 버튼은 달력 행에만 있음
  expect(await screen.findByText('요약화면')).toBeInTheDocument();
});

test('기록 탭 달력: 세션 행을 탭하면 세트 표가 펼쳐진다', async () => {
  const now = new Date();
  const ts = new Date(now.getFullYear(), now.getMonth(), 15, 10).getTime();
  await db.sessions.add({
    id: crypto.randomUUID(), startedAt: ts, finishedAt: ts + 3600_000,
    entries: [{ exerciseId: 'lib-bench-press', sets: [{ weight: 60, reps: 10, completedAt: ts + 1 }] }],
  });
  renderScreen();
  fireEvent.click(await screen.findByRole('button', { name: `${now.getMonth() + 1}월 15일` }));
  fireEvent.click((await screen.findAllByText(/가슴 운동 · 1개 운동 · 총 볼륨/))[0]); // [0] = 달력 행
  expect((await screen.findAllByText('무게(kg)')).length).toBeGreaterThan(0);
});

test('기록 탭: 진행 중 세션이 있으면 백데이트가 차단된다', async () => {
  vi.spyOn(window, 'alert').mockImplementation(() => {});
  await saveRoutine({ id: 'r1', name: '가슴운동', items: [] });
  await startSession();
  renderScreen();
  const now = new Date();
  fireEvent.click(await screen.findByRole('button', { name: `${now.getMonth() + 1}월 1일` }));
  fireEvent.click(await screen.findByRole('button', { name: '＋ 이 날짜에 기록 추가' }));
  fireEvent.click(await screen.findByRole('button', { name: '빈 세션' }));
  await waitFor(() => {
    expect(window.alert).toHaveBeenCalledWith('진행 중인 운동을 먼저 완료하세요');
  });
});

test('기록 탭 달력: 기록 없는 날짜는 빈 문구가 보인다', async () => {
  renderScreen();
  const now = new Date();
  fireEvent.click(await screen.findByRole('button', { name: `${now.getMonth() + 1}월 15일` }));
  expect(await screen.findByText('이 날은 운동 기록이 없어요')).toBeInTheDocument();
});

test('기록 탭에서 과거 날짜 백데이트 세션을 시작한다', async () => {
  await saveRoutine({ id: 'r1', name: '가슴운동', items: [] });
  renderScreen();
  const now = new Date();
  fireEvent.click(await screen.findByRole('button', { name: `${now.getMonth() + 1}월 1일` }));
  fireEvent.click(await screen.findByRole('button', { name: '＋ 이 날짜에 기록 추가' }));
  // 루틴 목록은 useLiveQuery로 비동기 로드 — 동기 getByRole은 레이스
  fireEvent.click(await screen.findByRole('button', { name: '가슴운동' }));
  expect(await screen.findByText('세션화면')).toBeInTheDocument();
  const s = await getActiveSession();
  expect(new Date(s!.startedAt).getDate()).toBe(1);
  expect(new Date(s!.startedAt).getHours()).toBe(12);
});

test('기록 탭: 미래 날짜에는 기록 추가 버튼이 없다', async () => {
  renderScreen();
  fireEvent.click(await screen.findByLabelText('다음 달'));
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  fireEvent.click(await screen.findByRole('button', { name: `${next.getMonth() + 1}월 15일` }));
  expect(await screen.findByText('이 날은 운동 기록이 없어요')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '＋ 이 날짜에 기록 추가' })).not.toBeInTheDocument();
});
