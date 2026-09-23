import { render, screen, fireEvent } from '@testing-library/react';
import type { Exercise } from '../types';
import ExerciseImage from './ExerciseImage';

function ex(id: string, name: string, illustration?: string): Exercise {
  return {
    id, name, bodyPart: '가슴', equipment: '바벨',
    imagePath: `exercises/${id}.webp`, isCustom: false, isHidden: false, illustration,
  };
}

test('illustration이 있으면 SVG 이미지를 렌더한다', () => {
  render(<ExerciseImage exercise={ex('a', '운동A', 'illustrations/bench-press.svg')} />);
  const img = screen.getByRole('img', { name: '운동A' });
  expect(img).toHaveAttribute('src', expect.stringContaining('illustrations/bench-press.svg'));
});

test('illustration이 없으면 imagePath가 있어도 사진 대신 픽토그램을 렌더한다', () => {
  render(<ExerciseImage exercise={ex('b', '운동B')} />);
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
});

test('illustration 로드 실패 시 픽토그램으로 폴백한다', () => {
  render(<ExerciseImage exercise={ex('c', '운동C', 'illustrations/broken.svg')} />);
  fireEvent.error(screen.getByRole('img'));
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
});

test('gif가 있으면 포스터(webp)를 썸네일로 렌더한다', () => {
  render(<ExerciseImage exercise={{ ...ex('d', '운동D', 'illustrations/bench-press.svg'), gif: 'gifs/bench-press.gif' }} />);
  expect(screen.getByRole('img').getAttribute('src')).toContain('gifs/bench-press.webp');
});
