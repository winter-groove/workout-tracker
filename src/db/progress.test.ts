import { db } from './db';
import {
  volume, maxWeight, fmtVolumeDelta, fmtWeightDelta, annotateHistory,
  getPreviousRecord, getPRWeight, summarizeEntry,
} from './progress';
import type { Session } from '../types';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

async function addFinishedSession(
  startedAt: number, exerciseId: string, sets: { weight: number; reps: number }[],
): Promise<Session> {
  const s: Session = {
    id: crypto.randomUUID(),
    startedAt,
    finishedAt: startedAt + 3600_000,
    entries: [{ exerciseId, sets: sets.map((x) => ({ ...x, completedAt: startedAt + 1 })) }],
  };
  await db.sessions.add(s);
  return s;
}

test('volume은 무게×횟수의 합', () => {
  expect(volume([{ weight: 60, reps: 10 }, { weight: 60, reps: 8 }])).toBe(1080);
  expect(volume([])).toBe(0);
});

test('maxWeight는 최고 무게, 빈 배열이면 0', () => {
  expect(maxWeight([{ weight: 60, reps: 10 }, { weight: 65, reps: 5 }])).toBe(65);
  expect(maxWeight([])).toBe(0);
});

test('fmtVolumeDelta: 증가/감소/동일/이전 0', () => {
  expect(fmtVolumeDelta(1150, 1080)).toBe('🔺 +6%');   // +6.48% → 반올림 6
  expect(fmtVolumeDelta(1000, 1080)).toBe('🔻 -7%');   // -7.4% → 반올림 -7
  expect(fmtVolumeDelta(1080, 1080)).toBe('➖');
  expect(fmtVolumeDelta(100, 0)).toBe('🔺');            // 0 나눗셈 방지
});

test('fmtWeightDelta: kg 절대값', () => {
  expect(fmtWeightDelta(62.5, 60)).toBe('🔺 +2.5kg');
  expect(fmtWeightDelta(57.5, 60)).toBe('🔻 -2.5kg');
  expect(fmtWeightDelta(60, 60)).toBe('➖');
});

test('annotateHistory: 최신순 기록에 증감과 PR을 계산한다', () => {
  const recs = [
    [{ weight: 60, reps: 10 }], // 최신: vol 600, max 60 — 과거에 65가 있으므로 PR 아님
    [{ weight: 65, reps: 8 }],  // vol 520, max 65 — 그 시점 최고 50 초과 → PR
    [{ weight: 50, reps: 10 }], // 가장 오래됨: 첫 기록
  ];
  const a = annotateHistory(recs);
  expect(a[0]).toEqual({ volume: 600, maxWeight: 60, prevVolume: 520, prevMaxWeight: 65, isPR: false });
  expect(a[1]).toEqual({ volume: 520, maxWeight: 65, prevVolume: 500, prevMaxWeight: 50, isPR: true });
  expect(a[2]).toEqual({ volume: 500, maxWeight: 50, prevVolume: undefined, prevMaxWeight: undefined, isPR: false });
});

test('getPreviousRecord는 before 이전의 가장 최근 완료 기록을 반환한다', async () => {
  await addFinishedSession(1000, 'ex1', [{ weight: 50, reps: 10 }]);
  await addFinishedSession(2000, 'ex1', [{ weight: 60, reps: 10 }]);
  const prev = await getPreviousRecord('ex1', 2000);
  expect(prev?.[0].weight).toBe(50);
  expect(await getPreviousRecord('ex1', 1000)).toBeUndefined();
});

test('getPreviousRecord는 진행 중 세션을 무시한다', async () => {
  await db.sessions.add({
    id: 'active', startedAt: 500,
    entries: [{ exerciseId: 'ex1', sets: [{ weight: 100, reps: 5, completedAt: 501 }] }],
  });
  expect(await getPreviousRecord('ex1', 2000)).toBeUndefined();
});

test('getPRWeight는 before 이전의 최고 무게를 반환한다', async () => {
  await addFinishedSession(1000, 'ex1', [{ weight: 70, reps: 3 }]);
  await addFinishedSession(2000, 'ex1', [{ weight: 60, reps: 10 }]);
  expect(await getPRWeight('ex1', 3000)).toBe(70);
  expect(await getPRWeight('ex1', 1000)).toBe(0);
});

test('summarizeEntry: 직전 대비 증감 + PR 판정', async () => {
  await addFinishedSession(1000, 'ex1', [{ weight: 70, reps: 3 }]);   // 과거 PR 70
  await addFinishedSession(2000, 'ex1', [{ weight: 60, reps: 10 }]);  // 직전: vol 600, max 60
  const p = await summarizeEntry('ex1', [{ weight: 72.5, reps: 3, completedAt: 1 }], 3000);
  expect(p).toEqual({
    volume: 217.5, maxWeight: 72.5, prevVolume: 600, prevMaxWeight: 60, isPR: true,
  });
});

test('summarizeEntry: 첫 기록이면 비교값 없음 + PR 아님', async () => {
  const p = await summarizeEntry('ex1', [{ weight: 50, reps: 10, completedAt: 1 }], 1000);
  expect(p).toEqual({
    volume: 500, maxWeight: 50, prevVolume: undefined, prevMaxWeight: undefined, isPR: false,
  });
});

test('summarizeEntry: 동일 무게는 PR이 아니다', async () => {
  await addFinishedSession(1000, 'ex1', [{ weight: 60, reps: 10 }]);
  const p = await summarizeEntry('ex1', [{ weight: 60, reps: 10, completedAt: 1 }], 2000);
  expect(p.isPR).toBe(false);
});
