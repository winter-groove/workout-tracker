import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { db } from '../db/db';
import { seedLibrary } from '../db/exercises';
import ManageScreen from './ManageScreen';

beforeEach(async () => {
  await db.delete();
  await db.open();
  await seedLibrary();
});

test('운동 목록을 이름으로 검색할 수 있다', async () => {
  render(<MemoryRouter><ManageScreen /></MemoryRouter>);
  await screen.findByText('벤치프레스');
  fireEvent.change(screen.getByPlaceholderText('운동 이름 검색'), { target: { value: '스쿼트' } });
  await waitFor(() => {
    expect(screen.queryByText('벤치프레스')).not.toBeInTheDocument();
    expect(screen.getByText('스쿼트')).toBeInTheDocument();
  });
});
