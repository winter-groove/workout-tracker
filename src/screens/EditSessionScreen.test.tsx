import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { db } from '../db/db';
import { seedLibrary } from '../db/exercises';
import type { Session } from '../types';
import EditSessionScreen from './EditSessionScreen';

beforeEach(async () => {
  await db.delete();
  await db.open();
  await seedLibrary();
});

async function addFinishedSession(
  startedAt: number, exerciseIds: string[], weight = 50,
): Promise<Session> {
  const s: Session = {
    id: crypto.randomUUID(),
    startedAt,
    finishedAt: startedAt + 3600_000,
    entries: exerciseIds.map((exerciseId) => ({
      exerciseId,
      sets: [{ weight, reps: 10, completedAt: startedAt + 1 }],
    })),
  };
  await db.sessions.add(s);
  return s;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<div>홈화면</div>} />
        <Route path="/summary/:sessionId" element={<div>요약화면</div>} />
        <Route path="/edit/:sessionId" element={<EditSessionScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

test('세트 무게를 수정하고 저장하면 DB에 반영되고 요약으로 이동한다', async () => {
  const s = await addFinishedSession(1000, ['lib-bench-press']);
  renderAt(`/edit/${s.id}`);
  const weightInput = await screen.findByLabelText('세트 1 무게');
  fireEvent.change(weightInput, { target: { value: '60' } });
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  expect(await screen.findByText('요약화면')).toBeInTheDocument();
  const saved = await db.sessions.get(s.id);
  expect(saved?.entries[0].sets[0].weight).toBe(60);
  expect(saved?.finishedAt).toBe(1000 + 3600_000);
});

test('세트 추가·삭제가 저장에 반영되고 새 세트는 완료 처리된다', async () => {
  const s = await addFinishedSession(1000, ['lib-bench-press']);
  renderAt(`/edit/${s.id}`);
  await screen.findByText('벤치프레스');
  fireEvent.click(screen.getByRole('button', { name: '＋ 세트 추가' }));
  fireEvent.change(screen.getByLabelText('세트 2 횟수'), { target: { value: '8' } });
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  await screen.findByText('요약화면');
  const saved = await db.sessions.get(s.id);
  expect(saved?.entries[0].sets).toHaveLength(2);
  expect(saved?.entries[0].sets[1]).toMatchObject({ reps: 8, completedAt: 1001 });
});

test('세트 ×로 삭제하고 저장하면 반영된다', async () => {
  const s = await addFinishedSession(1000, ['lib-bench-press']);
  renderAt(`/edit/${s.id}`);
  await screen.findByText('벤치프레스');
  fireEvent.click(screen.getByRole('button', { name: '＋ 세트 추가' }));
  fireEvent.click(screen.getAllByRole('button', { name: /세트 \d+ 삭제/ })[0]);
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  await screen.findByText('요약화면');
  expect((await db.sessions.get(s.id))?.entries[0].sets).toHaveLength(1);
});

test('운동을 삭제하고 저장하면 반영된다', async () => {
  const s = await addFinishedSession(1000, ['lib-bench-press', 'lib-squat']);
  renderAt(`/edit/${s.id}`);
  await screen.findByText('벤치프레스');
  fireEvent.click(screen.getAllByRole('button', { name: '운동 삭제' })[0]);
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  await screen.findByText('요약화면');
  const saved = await db.sessions.get(s.id);
  expect(saved?.entries).toHaveLength(1);
  expect(saved?.entries[0].exerciseId).toBe('lib-squat');
});

test('운동을 추가하고 저장하면 프리필·완료 처리되어 반영된다', async () => {
  const s = await addFinishedSession(1000, ['lib-bench-press']);
  renderAt(`/edit/${s.id}`);
  await screen.findByText('벤치프레스');
  fireEvent.click(screen.getByRole('button', { name: '＋ 운동 추가' }));
  fireEvent.click(await screen.findByRole('button', { name: '전체' }));
  fireEvent.click(await screen.findByText('스쿼트'));
  await waitFor(() => expect(screen.getAllByRole('button', { name: '운동 삭제' })).toHaveLength(2));
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  await screen.findByText('요약화면');
  const saved = await db.sessions.get(s.id);
  expect(saved?.entries).toHaveLength(2);
  expect(saved?.entries[1].exerciseId).toBe('lib-squat');
  for (const set of saved!.entries[1].sets) expect(set.completedAt).toBeDefined();
});

test('운동 추가 후 저장해도 중복되지 않는다', async () => {
  const s = await addFinishedSession(1000, ['lib-bench-press']);
  renderAt(`/edit/${s.id}`);
  await screen.findByText('벤치프레스');
  fireEvent.click(screen.getByRole('button', { name: '＋ 운동 추가' }));
  fireEvent.click(await screen.findByRole('button', { name: '전체' }));
  fireEvent.click(await screen.findByText('스쿼트'));
  await waitFor(() => expect(screen.getAllByRole('button', { name: '운동 삭제' })).toHaveLength(2));
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  await screen.findByText('요약화면');
  expect((await db.sessions.get(s.id))?.entries).toHaveLength(2); // 3이 아님
});

test('추가한 운동을 삭제하고 저장하면 되살아나지 않는다', async () => {
  const s = await addFinishedSession(1000, ['lib-bench-press']);
  renderAt(`/edit/${s.id}`);
  await screen.findByText('벤치프레스');
  fireEvent.click(screen.getByRole('button', { name: '＋ 운동 추가' }));
  fireEvent.click(await screen.findByRole('button', { name: '전체' }));
  fireEvent.click(await screen.findByText('스쿼트'));
  await waitFor(() => expect(screen.getAllByRole('button', { name: '운동 삭제' })).toHaveLength(2));
  fireEvent.click(screen.getAllByRole('button', { name: '운동 삭제' })[1]); // 스쿼트 삭제
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  await screen.findByText('요약화면');
  const saved = await db.sessions.get(s.id);
  expect(saved?.entries).toHaveLength(1);
  expect(saved?.entries[0].exerciseId).toBe('lib-bench-press');
});

test('마지막 운동을 삭제하고 저장하면 차단된다', async () => {
  const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
  const s = await addFinishedSession(1000, ['lib-bench-press']);
  renderAt(`/edit/${s.id}`);
  await screen.findByText('벤치프레스');
  fireEvent.click(screen.getByRole('button', { name: '운동 삭제' }));
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  await waitFor(() => expect(alertSpy).toHaveBeenCalled());
  expect((await db.sessions.get(s.id))?.entries).toHaveLength(1); // 무변경
  alertSpy.mockRestore();
});

test('취소하면 DB가 바뀌지 않는다', async () => {
  const s = await addFinishedSession(1000, ['lib-bench-press']);
  renderAt(`/edit/${s.id}`);
  fireEvent.change(await screen.findByLabelText('세트 1 무게'), { target: { value: '99' } });
  fireEvent.click(screen.getByRole('button', { name: '취소' }));
  expect(await screen.findByText('요약화면')).toBeInTheDocument();
  expect((await db.sessions.get(s.id))?.entries[0].sets[0].weight).toBe(50);
});

test('미완료 세션이면 홈으로 리다이렉트한다', async () => {
  await db.sessions.add({
    id: 'active-1', startedAt: 1000,
    entries: [{ exerciseId: 'lib-bench-press', sets: [{ weight: 50, reps: 10 }] }],
  });
  renderAt('/edit/active-1');
  expect(await screen.findByText('홈화면')).toBeInTheDocument();
});
