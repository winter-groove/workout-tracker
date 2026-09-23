import { render, screen, act, fireEvent } from '@testing-library/react';
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

test('선화 폴백은 1↔3 프레임을 왕복한다', () => {
  vi.useFakeTimers();
  try {
    const { container } = render(<ExerciseHero exercise={bench} />);
    const imgs = [...container.querySelectorAll<HTMLImageElement>('img')];
    expect(imgs).toHaveLength(2);
    expect(imgs[1].src).toContain('bench-press-3.svg');
    expect(frameOpacities(container)).toEqual(['1', '0']);
    act(() => vi.advanceTimersByTime(650));
    expect(frameOpacities(container)).toEqual(['0', '1']);
    act(() => vi.advanceTimersByTime(650));
    expect(frameOpacities(container)).toEqual(['1', '0']);
  } finally { vi.useRealTimers(); }
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

test('운동 교체 시 애니 상태를 초기화한다 (인스턴스 재사용 잔존 방지)', () => {
  vi.useFakeTimers();
  try {
    const squat: Exercise = {
      id: 'lib-squat', name: '스쿼트', bodyPart: '하체', equipment: '바벨',
      isCustom: false, isHidden: false,
      illustration: 'illustrations/squat.svg', muscles: ['quadriceps'],
    };
    const { container, rerender } = render(<ExerciseHero exercise={bench} />);
    const imgs = [...container.querySelectorAll<HTMLImageElement>('img')];

    // 벤치: 650ms 진행 후 step 중간 상태로 이동 (frame 3, 인덱스1이 라이브)
    act(() => vi.advanceTimersByTime(650));
    expect(frameOpacities(container)).toEqual(['0', '1']);

    // 벤치 frame 1(인덱스 0, 현재 비표시 프레임)에 에러 발생 → dead set에 추가
    fireEvent.error(imgs[0]);
    expect(frameOpacities(container)).toEqual(['0', '1']); // 죽은 프레임이 라이브가 아니므로 화면엔 영향 없음

    // 스쿼트로 교체: exercise.id 변경 → reset useEffect 트리거
    rerender(<ExerciseHero exercise={squat} />);
    const newImgs = [...container.querySelectorAll<HTMLImageElement>('img')];

    // 스쿼트 URL 확인
    expect(newImgs[0].src).toContain('squat.svg');
    expect(newImgs[1].src).toContain('squat-3.svg');

    // 상태 초기화: step=0, dead={} → 모든 프레임 살아있고 frame 0 표시
    expect(frameOpacities(container)).toEqual(['1', '0']);
  } finally {
    vi.useRealTimers();
  }
});

test('gif가 있으면 GIF 한 장을 흰 패널에 렌더하고 선화 프레임은 렌더하지 않는다', () => {
  const { container } = render(<ExerciseHero exercise={{ ...bench, gif: 'gifs/bench-press.gif' }} />);
  const imgs = [...container.querySelectorAll<HTMLImageElement>('img')];
  expect(imgs).toHaveLength(1);
  expect(imgs[0].src).toContain('gifs/bench-press.gif');
  expect(imgs[0].alt).toBe('벤치프레스 동작');
});

test('reduced-motion이면 GIF 대신 포스터(webp)를 렌더한다', () => {
  const orig = window.matchMedia;
  window.matchMedia = ((q: string) => ({ matches: q.includes('reduced-motion'), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  try {
    const { container } = render(<ExerciseHero exercise={{ ...bench, gif: 'gifs/bench-press.gif' }} />);
    expect(container.querySelector('img')!.src).toContain('gifs/bench-press.webp');
  } finally { window.matchMedia = orig; }
});
