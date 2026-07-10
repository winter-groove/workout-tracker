import { render, screen, fireEvent } from '@testing-library/react';
import type { Exercise } from '../types';
import ExerciseImage from './ExerciseImage';

function ex(id: string, name: string): Exercise {
  return {
    id, name, bodyPart: '가슴', equipment: '바벨',
    imagePath: `exercises/${id}.webp`, isCustom: false, isHidden: false,
  };
}

test('이미지 로드 실패 시 아이콘 fallback, 다른 운동으로 바뀌면 다시 이미지를 시도한다', () => {
  const { rerender } = render(<ExerciseImage exercise={ex('a', '운동A')} />);
  fireEvent.error(screen.getByAltText('운동A'));
  expect(screen.queryByAltText('운동A')).not.toBeInTheDocument(); // fallback 아이콘
  rerender(<ExerciseImage exercise={ex('b', '운동B')} />);
  expect(screen.getByAltText('운동B')).toBeInTheDocument(); // 새 운동은 다시 img
});
