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
  fireEvent.click(await screen.findByRole('button', { name: /내 운동 목록/ }));
  fireEvent.change(screen.getByPlaceholderText('운동 이름 검색'), { target: { value: '스쿼트' } });
  await waitFor(() => {
    expect(screen.getByText('스쿼트')).toBeInTheDocument();
    expect(screen.queryByText('벤치프레스')).not.toBeInTheDocument();
  });
});

async function openList() {
  fireEvent.click(await screen.findByRole('button', { name: /내 운동 목록/ }));
  await screen.findByPlaceholderText('운동 이름 검색');
}

test('기본 접힘: 개수 헤더만 보이고 검색창·목록은 없다', async () => {
  render(<MemoryRouter><ManageScreen /></MemoryRouter>);
  expect(await screen.findByRole('button', { name: /내 운동 목록 \(\d+개\)/ })).toBeInTheDocument();
  expect(screen.queryByPlaceholderText('운동 이름 검색')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '숨기기' })).not.toBeInTheDocument();
});

test('펼치면 30개만 보이고 더보기로 30개씩 추가된다', async () => {
  render(<MemoryRouter><ManageScreen /></MemoryRouter>);
  await openList();
  expect(screen.getAllByRole('button', { name: '숨기기' })).toHaveLength(30);
  fireEvent.click(screen.getByRole('button', { name: /더보기/ }));
  expect(screen.getAllByRole('button', { name: '숨기기' })).toHaveLength(60);
});

test('부위 칩으로 필터된다', async () => {
  render(<MemoryRouter><ManageScreen /></MemoryRouter>);
  await openList();
  fireEvent.change(screen.getByPlaceholderText('운동 이름 검색'), { target: { value: '벤치프레스' } });
  fireEvent.click(screen.getByRole('button', { name: '하체' }));
  expect(await screen.findByText('검색 결과가 없어요')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '가슴' }));
  expect(await screen.findByText('벤치프레스')).toBeInTheDocument();
});

test('검색어를 바꾸면 더보기 카운트가 리셋된다', async () => {
  render(<MemoryRouter><ManageScreen /></MemoryRouter>);
  await openList();
  fireEvent.click(screen.getByRole('button', { name: /더보기/ }));
  expect(screen.getAllByRole('button', { name: '숨기기' })).toHaveLength(60);
  fireEvent.change(screen.getByPlaceholderText('운동 이름 검색'), { target: { value: '컬' } });
  await waitFor(() => {
    expect(screen.getAllByRole('button', { name: '숨기기' }).length).toBeLessThanOrEqual(30);
  });
});
