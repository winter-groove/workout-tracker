import { db } from './db';
import {
  getLastRecord, buildEntry, startSession, getActiveSession,
  saveSession, finishSession, discardSession,
  listFinishedSessions, deleteSession, getExerciseHistory, resumeSession, getLastDoneMap, sessionTitle, setLabels, seedForNewSet,
} from './sessions';
import { exportData, importData } from './backup';
import type { Routine, Session, Exercise } from '../types';

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

test('finishSession: 미완료 entry 제거 시 오묶임이 생기지 않게 flag를 정리한다', async () => {
  const s = await startSession();
  s.entries = [
    { exerciseId: 'a', sets: [{ weight: 50, reps: 10, completedAt: 1 }], pairedWithNext: true },
    { exerciseId: 'b', sets: [{ weight: 20, reps: 10 }] },
    { exerciseId: 'c', sets: [{ weight: 30, reps: 10, completedAt: 1 }] },
  ];
  await saveSession(s);
  await finishSession(s);
  const saved = await db.sessions.get(s.id);
  expect(saved?.entries.map((e) => e.exerciseId)).toEqual(['a', 'c']);
  expect(saved?.entries[0].pairedWithNext).toBeUndefined();
});

test('finishSession: 살아남은 인접 쌍의 묶음은 유지되고 trailing flag는 정리된다', async () => {
  const s = await startSession();
  s.entries = [
    { exerciseId: 'a', sets: [{ weight: 50, reps: 10, completedAt: 1 }], pairedWithNext: true },
    { exerciseId: 'b', sets: [{ weight: 20, reps: 10, completedAt: 1 }], pairedWithNext: true },
    { exerciseId: 'c', sets: [{ weight: 30, reps: 10 }] },
  ];
  await saveSession(s);
  await finishSession(s);
  const saved = await db.sessions.get(s.id);
  expect(saved?.entries.map((e) => e.exerciseId)).toEqual(['a', 'b']);
  expect(saved?.entries[0].pairedWithNext).toBe(true);
  expect(saved?.entries[1].pairedWithNext).toBeUndefined();
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

test('resumeSession은 완료 세션을 다시 활성화한다', async () => {
  const a = await addFinishedSession(1000, 'ex1', [{ weight: 50, reps: 10 }]);
  expect(await resumeSession(a.id)).toBe(true);
  const active = await getActiveSession();
  expect(active?.id).toBe(a.id);
  expect(active?.finishedAt).toBeUndefined();
});

test('resumeSession은 활성 세션이 있으면 거부하고 아무것도 바꾸지 않는다', async () => {
  const a = await addFinishedSession(1000, 'ex1', [{ weight: 50, reps: 10 }]);
  await startSession();
  expect(await resumeSession(a.id)).toBe(false);
  expect((await db.sessions.get(a.id))?.finishedAt).toBeDefined();
});

test('resumeSession은 없는 id·미완료 세션에 false', async () => {
  expect(await resumeSession('없는세션')).toBe(false);
  const s = await startSession();
  expect(await resumeSession(s.id)).toBe(false);
});

test('getLastDoneMap은 운동별 마지막 완료 세션 시각을 준다 (진행 중 제외)', async () => {
  await addFinishedSession(1000, 'ex1', [{ weight: 50, reps: 10 }]);
  await addFinishedSession(2000, 'ex1', [{ weight: 60, reps: 10 }]);
  await startSession(); // 진행 중 — 제외
  const map = await getLastDoneMap();
  expect(map.get('ex1')).toBe(2000);
  expect(map.size).toBe(1);
});

test('백업 왕복에 pairedWithNext가 보존된다', async () => {
  const s = await startSession();
  s.entries = [
    { exerciseId: 'ex1', sets: [{ weight: 50, reps: 10, completedAt: 1 }], pairedWithNext: true },
    { exerciseId: 'ex2', sets: [{ weight: 20, reps: 10, completedAt: 1 }] },
  ];
  await saveSession(s);
  await finishSession(s);
  const dump = JSON.parse(JSON.stringify(await exportData()));
  await importData(dump);
  const restored = (await listFinishedSessions())[0];
  expect(restored.entries[0].pairedWithNext).toBe(true);
});

function mkEx(id: string, bodyPart: Exercise['bodyPart']): Exercise {
  return { id, name: id, bodyPart, equipment: '바벨', isCustom: false, isHidden: false };
}

test('sessionTitle: 루틴명 우선, 부위 구성 자동, fallback', () => {
  const exMap = new Map<string, Exercise>([
    ['e1', mkEx('e1', '가슴')],
    ['e2', mkEx('e2', '등')],
    ['e3', mkEx('e3', '가슴')],
    ['e4', mkEx('e4', '하체')],
  ]);
  const E = (id: string) => ({ exerciseId: id, sets: [] });
  const base = { id: 's', startedAt: 1 };
  expect(sessionTitle({ ...base, routineName: '가슴 날', entries: [E('e1')] }, exMap)).toBe('가슴 날');
  expect(sessionTitle({ ...base, entries: [E('e1')] }, exMap)).toBe('가슴 운동');
  expect(sessionTitle({ ...base, entries: [E('e1'), E('e2')] }, exMap)).toBe('가슴·등 운동');
  expect(sessionTitle({ ...base, entries: [E('e1'), E('e3'), E('e2'), E('e4')] }, exMap)).toBe('가슴·등 운동');
  expect(sessionTitle({ ...base, entries: [E('없는운동')] }, exMap)).toBe('오늘 운동');
  expect(sessionTitle({ ...base, entries: [] }, exMap)).toBe('오늘 운동');
});

test('setLabels: 본세트는 번호, 드랍은 3-1·3-2, 선두 드랍은 본세트로 취급', () => {
  expect(setLabels([{}, {}, {}])).toEqual(['1', '2', '3']);
  expect(setLabels([{}, {}, {}, { isDrop: true }, { isDrop: true }]))
    .toEqual(['1', '2', '3', '3-1', '3-2']);
  expect(setLabels([{ isDrop: true }, { isDrop: true }])).toEqual(['1', '1-1']);
  expect(setLabels([{}, { isDrop: true }, {}, { isDrop: true }]))
    .toEqual(['1', '1-1', '2', '2-1']);
  expect(setLabels([])).toEqual([]);
});

test('buildEntry는 지난 기록의 드랍 구조까지 프리필한다', async () => {
  const s: Session = {
    id: crypto.randomUUID(), startedAt: 1000, finishedAt: 2000,
    entries: [{
      exerciseId: 'ex1',
      sets: [
        { weight: 70, reps: 8, completedAt: 1001 },
        { weight: 56, reps: 8, completedAt: 1002, isDrop: true },
      ],
    }],
  };
  await db.sessions.add(s);
  const entry = await buildEntry('ex1', 3);
  expect(entry.sets).toEqual([
    { weight: 70, reps: 8 },
    { weight: 56, reps: 8, isDrop: true },
  ]);
});

test('finishSession은 본세트가 빠져 선두에 남은 드랍을 본세트로 정리한다', async () => {
  const s = await startSession();
  s.entries = [{
    exerciseId: 'ex1',
    sets: [
      { weight: 70, reps: 8 },                                        // 미완료 → 제거
      { weight: 56, reps: 8, completedAt: Date.now(), isDrop: true },  // 남아서 선두가 됨
    ],
  }];
  await saveSession(s);
  await finishSession(s);
  const saved = await db.sessions.get(s.id);
  expect(saved?.entries[0].sets).toHaveLength(1);
  expect(saved?.entries[0].sets[0].isDrop).toBeUndefined();
});

test('seedForNewSet: 마지막 본세트 기준, 드랍만 있으면 마지막 세트, 비면 기본값', () => {
  expect(seedForNewSet([{ weight: 70, reps: 8 }, { weight: 56, reps: 8, isDrop: true }]))
    .toEqual({ weight: 70, reps: 8 });
  // 무게 0인 본세트도 정상 시드 (맨몸 운동)
  expect(seedForNewSet([{ weight: 0, reps: 12 }, { weight: 40, reps: 8, isDrop: true }]))
    .toEqual({ weight: 0, reps: 12 });
  expect(seedForNewSet([{ weight: 30, reps: 10, isDrop: true }]))
    .toEqual({ weight: 30, reps: 10 });
  expect(seedForNewSet([])).toEqual({ weight: 0, reps: 10 });
});

test('sessionDuration: 분·시간 표기, 백데이트(12시간 이상)·미완료는 null', async () => {
  const { sessionDuration } = await import('./sessions');
  const base: Session = { id: 'd1', startedAt: 1_000_000, entries: [] };
  expect(sessionDuration(base)).toBeNull(); // 미완료
  expect(sessionDuration({ ...base, finishedAt: base.startedAt + 52 * 60_000 })).toBe('52분');
  expect(sessionDuration({ ...base, finishedAt: base.startedAt + 60 * 60_000 })).toBe('1시간');
  expect(sessionDuration({ ...base, finishedAt: base.startedAt + 72 * 60_000 })).toBe('1시간 12분');
  expect(sessionDuration({ ...base, finishedAt: base.startedAt + 30_000 })).toBe('1분'); // 1분 미만 → 최소 1분
  expect(sessionDuration({ ...base, finishedAt: base.startedAt + 22 * 3600_000 })).toBeNull(); // 백데이트
  expect(sessionDuration({ ...base, finishedAt: base.startedAt + 12 * 3600_000 - 1 })).toBeNull(); // 반올림 경계도 12시간 컷
  expect(sessionDuration({ ...base, finishedAt: base.startedAt + 11 * 3600_000 + 59 * 60_000 })).toBe('11시간 59분');
  expect(sessionDuration({ ...base, finishedAt: base.startedAt - 1 })).toBeNull(); // 음수
});
