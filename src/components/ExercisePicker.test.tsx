import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { db } from '../db/db';
import { seedLibrary } from '../db/exercises';
import ExercisePicker, { dominantBodyPart } from './ExercisePicker';
import type { Exercise, Session } from '../types';

beforeEach(async () => {
  await db.delete();
  await db.open();
  await seedLibrary();
});

async function addDone(startedAt: number, exerciseId: string) {
  const s: Session = {
    id: crypto.randomUUID(),
    startedAt,
    finishedAt: startedAt + 3600_000,
    entries: [{ exerciseId, sets: [{ weight: 50, reps: 10, completedAt: startedAt + 1 }] }],
  };
  await db.sessions.add(s);
}

test('운동 목록이 뜨고 검색으로 좁힐 수 있다', async () => {
  render(<ExercisePicker onSelect={() => {}} onClose={() => {}} />);
  await screen.findByText('벤치프레스');
  fireEvent.change(screen.getByPlaceholderText('운동 이름 검색'), { target: { value: '스쿼트' } });
  await waitFor(() => {
    expect(screen.queryByText('벤치프레스')).not.toBeInTheDocument();
    expect(screen.getByText('스쿼트')).toBeInTheDocument();
  });
});

test('부위 칩으로 필터링된다', async () => {
  render(<ExercisePicker onSelect={() => {}} onClose={() => {}} />);
  await screen.findByText('벤치프레스');
  fireEvent.click(screen.getByRole('button', { name: '하체' }));
  await waitFor(() => {
    expect(screen.queryByText('벤치프레스')).not.toBeInTheDocument();
    expect(screen.getByText('레그 프레스')).toBeInTheDocument();
  });
});

test('운동을 탭하면 onSelect가 불린다', async () => {
  const onSelect = vi.fn();
  render(<ExercisePicker onSelect={onSelect} onClose={() => {}} />);
  fireEvent.click(await screen.findByText('스쿼트'));
  expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'lib-squat' }));
});

test('직접 등록 폼으로 커스텀 운동을 만들면 바로 선택된다', async () => {
  const onSelect = vi.fn();
  render(<ExercisePicker onSelect={onSelect} onClose={() => {}} />);
  fireEvent.click(await screen.findByText('＋ 없는 운동 직접 등록'));
  fireEvent.change(screen.getByLabelText('운동 이름'), { target: { value: '스미스머신 벤치' } });
  fireEvent.click(screen.getByRole('button', { name: '등록' }));
  await waitFor(() => {
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ name: '스미스머신 벤치', isCustom: true }),
    );
  });
});

function fakeEx(bodyPart: Exercise['bodyPart']): Exercise {
  return {
    id: crypto.randomUUID(), name: 'x', bodyPart,
    equipment: '바벨', isCustom: false, isHidden: false,
  };
}

test('dominantBodyPart: 최빈 부위, 동률·빈 배열은 undefined', () => {
  expect(dominantBodyPart([fakeEx('가슴'), fakeEx('가슴'), fakeEx('어깨')])).toBe('가슴');
  expect(dominantBodyPart([fakeEx('가슴'), fakeEx('어깨')])).toBeUndefined();
  expect(dominantBodyPart([])).toBeUndefined();
  expect(dominantBodyPart([fakeEx('어깨'), fakeEx('하체'), fakeEx('가슴'), fakeEx('가슴')])).toBe('가슴');
});

test('initialFilter가 주어지면 해당 부위 칩이 켜진 채 열리고 전환도 가능하다', async () => {
  render(<ExercisePicker onSelect={() => {}} onClose={() => {}} initialFilter="하체" />);
  expect(await screen.findByText('레그 프레스')).toBeInTheDocument();
  expect(screen.queryByText('벤치프레스')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '하체' })).toHaveClass('on');
  fireEvent.click(screen.getByRole('button', { name: '전체' }));
  expect(await screen.findByText('벤치프레스')).toBeInTheDocument();
});

test('기록 있는 운동이 최근 한 운동 구간에 최근순·마지막 수행일과 함께 표시된다', async () => {
  await addDone(new Date(2026, 5, 1, 12).getTime(), 'lib-squat');
  await addDone(new Date(2026, 5, 3, 12).getTime(), 'lib-bench-press');
  render(<ExercisePicker onSelect={() => {}} onClose={() => {}} />);
  expect(await screen.findByText('최근 한 운동')).toBeInTheDocument();
  expect(screen.getByText('전체 운동')).toBeInTheDocument();
  const names = screen.getAllByText(/^(벤치프레스|스쿼트)$/).map((el) => el.textContent);
  expect(names.slice(0, 2)).toEqual(['벤치프레스', '스쿼트']); // 최근(6/3 벤치)이 먼저
  expect(screen.getByText('가슴 · 바벨 · 6/3')).toBeInTheDocument();
});

test('기록이 없으면 최근 구간 헤더가 없다', async () => {
  render(<ExercisePicker onSelect={() => {}} onClose={() => {}} />);
  await screen.findByText('벤치프레스');
  expect(screen.queryByText('최근 한 운동')).not.toBeInTheDocument();
  expect(screen.queryByText('전체 운동')).not.toBeInTheDocument();
});

test('검색은 최근 구간에도 적용된다', async () => {
  await addDone(new Date(2026, 5, 1, 12).getTime(), 'lib-squat');
  render(<ExercisePicker onSelect={() => {}} onClose={() => {}} />);
  await screen.findByText('최근 한 운동');
  fireEvent.change(screen.getByPlaceholderText('운동 이름 검색'), { target: { value: '벤치' } });
  await waitFor(() => {
    expect(screen.queryByText('최근 한 운동')).not.toBeInTheDocument(); // 스쿼트가 걸러짐
  });
});
