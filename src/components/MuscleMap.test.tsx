import { render, screen } from '@testing-library/react';
import { MUSCLE_REGIONS } from '../data/muscle-regions';
import MuscleMap from './MuscleMap';

test('muscles가 있으면 주동근이 펄스 클래스, 협응근이 보조 클래스를 받는다', () => {
  const { container } = render(<MuscleMap muscles={['chest', 'triceps']} bodyPart="가슴" />);
  expect(screen.getByRole('img', { name: '자극 부위: 가슴' })).toBeInTheDocument();
  expect(container.querySelectorAll('.mm-primary').length).toBeGreaterThan(0);
  expect(container.querySelectorAll('.mm-secondary').length).toBeGreaterThan(0);
});

test('muscles가 없으면 bodyPart 폴백으로 하이라이트한다', () => {
  const { container } = render(<MuscleMap bodyPart="하체" />);
  expect(screen.getByRole('img', { name: /자극 부위/ })).toBeInTheDocument();
  expect(container.querySelectorAll('.mm-primary').length).toBeGreaterThan(0);
});

test('주동근이 뒤쪽 근육이면 뒷모습 뷰를 렌더한다', () => {
  const { container } = render(<MuscleMap muscles={['hamstring']} bodyPart="하체" />);
  expect(container.querySelector('[data-view="back"]')).toBeInTheDocument();
});

test('17개 영역 전부가 자기 뷰에서 주동근 하이라이트를 받는다', () => {
  // 각 영역을 단독 주동근으로 렌더 — 그 영역이 앞/뒤 어느 폴리곤 그룹에도 없으면
  // 뷰 필터에 걸러져 .mm-primary가 0개가 되므로, 폴리곤 누락 회귀를 잡는다.
  for (const id of MUSCLE_REGIONS) {
    const { container, unmount } = render(<MuscleMap muscles={[id]} bodyPart="가슴" />);
    expect(container.querySelectorAll('.mm-primary').length, `${id}: 하이라이트 폴리곤 없음`).toBeGreaterThan(0);
    unmount();
  }
});
