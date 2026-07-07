import {
  volume, maxWeight, fmtVolumeDelta, fmtWeightDelta, annotateHistory,
} from './progress';

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
