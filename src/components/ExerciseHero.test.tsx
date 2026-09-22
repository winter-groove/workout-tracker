import { render, screen, act } from '@testing-library/react';
import { vi } from 'vitest';
import type { Exercise } from '../types';
import ExerciseHero from './ExerciseHero';

const bench: Exercise = {
  id: 'lib-bench-press', name: '벤치프레스', bodyPart: '가슴', equipment: '바벨',
  isCustom: false, isHidden: false,
  illustration: 'illustrations/bench-press.svg', muscles: ['chest', 'triceps'],
};

function frameOpacities(container: HTMLElement): string[] {
  return [...container.querySelectorAll<HTMLImageElement>('img')].map((i) => i.style.opacity);
}

test('3프레임을 핑퐁 순서로 순환한다 (1→2→3→2→1)', () => {
  vi.useFakeTimers();
  try {
    const { container } = render(<ExerciseHero exercise={bench} />);
    const imgs = [...container.querySelectorAll<HTMLImageElement>('img')];
    expect(imgs).toHaveLength(3);
    expect(imgs[1].src).toContain('bench-press-2.svg');
    expect(imgs[2].src).toContain('bench-press-3.svg');
    expect(frameOpacities(container)).toEqual(['1', '0', '0']);
    act(() => vi.advanceTimersByTime(450));
    expect(frameOpacities(container)).toEqual(['0', '1', '0']);
    act(() => vi.advanceTimersByTime(450));
    expect(frameOpacities(container)).toEqual(['0', '0', '1']);
    act(() => vi.advanceTimersByTime(450));
    expect(frameOpacities(container)).toEqual(['0', '1', '0']); // 핑퐁 되돌아옴
  } finally {
    vi.useRealTimers();
  }
});

test('illustration이 없으면 픽토그램 + 근육맵만 렌더한다', () => {
  const { container } = render(<ExerciseHero exercise={{ ...bench, illustration: undefined, muscles: undefined }} />);
  expect(container.querySelectorAll('img')).toHaveLength(0);
  expect(screen.getByRole('img', { name: /자극 부위/ })).toBeInTheDocument();
});

test('근육맵이 muscles 기반으로 함께 렌더된다', () => {
  render(<ExerciseHero exercise={bench} />);
  expect(screen.getByRole('img', { name: '자극 부위: 가슴' })).toBeInTheDocument();
});
