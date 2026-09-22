import { render, screen } from '@testing-library/react';
import App from './App';

test('탭바와 홈 화면이 렌더링된다', async () => {
  render(<App />);
  // 홈 제목은 useLiveQuery(루틴/세션) 기반 — DB 반영 대기 (레이스 가드)
  expect(await screen.findByRole('heading', { name: '오늘 뭐 할까요?' })).toBeInTheDocument();
  expect(screen.getByText('기록')).toBeInTheDocument();
  expect(screen.getByText('마이')).toBeInTheDocument();
});
