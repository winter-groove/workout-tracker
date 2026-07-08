import { db } from './db';
import {
  getLastRecord, buildEntry, startSession, getActiveSession,
  saveSession, finishSession, discardSession,
  listFinishedSessions, deleteSession, getExerciseHistory,
} from './sessions';
import type { Routine, Session } from '../types';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

async function addFinishedSession(startedAt: number, exerciseId: string, sets: { weight: number; reps: number; done?: boolean }[]) {
  const s: Session = {
    id: crypto.randomUUID(),
    startedAt,
    finishedAt: startedAt + 3600_000,
    entries: [{
      exerciseId,
      sets: sets.map((x) => ({ weight: x.weight, reps: x.reps, completedAt: x.done === false ? undefined : startedAt + 1 })),
    }],
  };
  await db.sessions.add(s);
  return s;
}

test('getLastRecord는 가장 최근 완료 세션의 완료 세트를 반환한다', async () => {
  await addFinishedSession(1000, 'ex1', [{ weight: 50, reps: 10 }]);
  await addFinishedSession(2000, 'ex1', [{ weight: 60, reps: 10 }, { weight: 60, reps: 8 }]);
  const last = await getLastRecord('ex1');
  expect(last?.map((s) => s.weight)).toEqual([60, 60]);
});

test('getLastRecord는 진행 중 세션과 미완료 세트를 무시한다', async () => {
  await addFinishedSession(1000, 'ex1', [{ weight: 50, reps: 10 }]);
  await db.sessions.add({
    id: 'active', startedAt: 3000,
    entries: [{ exerciseId: 'ex1', sets: [{ weight: 100, reps: 5 }] }],
  });
  await addFinishedSession(2000, 'ex1', [
    { weight: 60, reps: 10 },
    { weight: 999, reps: 1, done: false },
  ]);
  const last = await getLastRecord('ex1');
  expect(last?.length).toBe(1);
  expect(last?.[0].weight).toBe(60);
});

test('기록이 없으면 getLastRecord는 undefined', async () => {
  expect(await getLastRecord('없는운동')).toBeUndefined();
});

test('buildEntry는 지난 기록을 미완료 상태로 미리 채운다', async () => {
  await addFinishedSession(1000, 'ex1', [{ weight: 60, reps: 10 }, { weight: 55, reps: 12 }]);
  const entry = await buildEntry('ex1');
  expect(entry.sets).toEqual([
    { weight: 60, reps: 10 },
    { weight: 55, reps: 12 },
  ]);
});

test('buildEntry는 기록이 없으면 defaultSets개의 기본 세트를 만든다', async () => {
  const entry = await buildEntry('ex1', 4);
  expect(entry.sets).toHaveLength(4);
  expect(entry.sets[0]).toEqual({ weight: 0, reps: 10 });
});

test('startSession은 루틴 순서대로 entries를 미리 채운다', async () => {
  await addFinishedSession(1000, 'ex1', [{ weight: 60, reps: 10 }]);
  const routine: Routine = {
    id: 'r1', name: '가슴 날',
    items: [{ exerciseId: 'ex1', defaultSets: 3 }, { exerciseId: 'ex2', defaultSets: 2 }],
  };
  const s = await startSession(routine);
  expect(s.routineName).toBe('가슴 날');
  expect(s.entries[0].sets[0].weight).toBe(60);
  expect(s.entries[1].sets).toHaveLength(2);
  expect(await getActiveSession()).toMatchObject({ id: s.id });
});

test('finishSession은 미완료 세트와 빈 entry를 정리하고 완료 처리한다', async () => {
  const s = await startSession();
  s.entries = [
    { exerciseId: 'ex1', sets: [{ weight: 60, reps: 10, completedAt: 1 }, { weight: 60, reps: 8 }] },
    { exerciseId: 'ex2', sets: [{ weight: 40, reps: 12 }] },
  ];
  await saveSession(s);
  await finishSession(s);
  const saved = await db.sessions.get(s.id);
  expect(saved?.finishedAt).toBeDefined();
  expect(saved?.entries).toHaveLength(1);
  expect(saved?.entries[0].sets).toHaveLength(1);
  expect(await getActiveSession()).toBeUndefined();
});

test('startSession을 연속 호출해도 활성 세션이 이미 있으면 같은 세션을 반환한다', async () => {
  const routine: Routine = {
    id: 'r1', name: '가슴 날',
    items: [{ exerciseId: 'ex1', defaultSets: 3 }],
  };
  const first = await startSession(routine);
  const second = await startSession(routine);
  expect(second.id).toBe(first.id);
  expect(await db.sessions.count()).toBe(1);

  const third = await startSession();
  expect(third.id).toBe(first.id);
  expect(await db.sessions.count()).toBe(1);
});

test('discardSession은 세션을 삭제한다', async () => {
  const s = await startSession();
  await discardSession(s.id);
  expect(await getActiveSession()).toBeUndefined();
});

test('listFinishedSessions는 완료 세션만 최근순으로', async () => {
  await addFinishedSession(1000, 'ex1', [{ weight: 50, reps: 10 }]);
  await addFinishedSession(2000, 'ex1', [{ weight: 60, reps: 10 }]);
  await startSession(); // 진행 중 — 제외되어야 함
  const list = await listFinishedSessions();
  expect(list).toHaveLength(2);
  expect(list[0].startedAt).toBe(2000);
});

test('deleteSession과 getExerciseHistory', async () => {
  const a = await addFinishedSession(1000, 'ex1', [{ weight: 50, reps: 10 }]);
  await addFinishedSession(2000, 'ex2', [{ weight: 30, reps: 15 }]);
  const hist = await getExerciseHistory('ex1');
  expect(hist).toHaveLength(1);
  expect(hist[0].sets[0].weight).toBe(50);
  await deleteSession(a.id);
  expect(await getExerciseHistory('ex1')).toHaveLength(0);
});

test('startSession은 startedAt 지정 시 그 시각으로 생성하고 프리필도 그 이전 기준이다', async () => {
  await addFinishedSession(1000, 'ex1', [{ weight: 50, reps: 10 }]);
  await addFinishedSession(5000, 'ex1', [{ weight: 70, reps: 10 }]); // 백데이트 시점 이후의 기록
  const routine: Routine = {
    id: 'r9', name: '가슴 날',
    items: [{ exerciseId: 'ex1', defaultSets: 3 }],
  };
  const s = await startSession(routine, 3000);
  expect(s.startedAt).toBe(3000);
  expect(s.entries[0].sets[0].weight).toBe(50); // 3000 이전의 50, 이후의 70 아님
});

test('buildEntry는 before 지정 시 그 이전 기록으로 프리필한다', async () => {
  await addFinishedSession(1000, 'ex1', [{ weight: 50, reps: 10 }]);
  await addFinishedSession(2000, 'ex1', [{ weight: 60, reps: 10 }]);
  const entry = await buildEntry('ex1', 3, 2000);
  expect(entry.sets[0].weight).toBe(50);
});
