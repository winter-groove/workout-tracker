import { render, screen } from '@testing-library/react';
import App from './App';

test('탭바와 홈 화면이 렌더링된다', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: '홈' })).toBeInTheDocument();
  expect(screen.getByText('기록')).toBeInTheDocument();
  expect(screen.getByText('관리')).toBeInTheDocument();
});
