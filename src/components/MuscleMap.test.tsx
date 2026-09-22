import { render, screen } from '@testing-library/react';
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
