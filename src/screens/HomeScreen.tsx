import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Routine } from '../types';
import { listRoutines } from '../db/routines';
import {
  startSession, getActiveSession, discardSession, listFinishedSessions, sessionTitle,
} from '../db/sessions';
import { listExercises } from '../db/exercises';
import {
  suggestRoutine, routineEstimate, lastTopWeight, weeklyGoalProgress, weekStreak, coachTip,
} from '../db/coach';
import { getWeeklyGoal } from '../db/settings';
import { kgToDisplay, unitFor } from '../db/weightUnit';
import { getTodayRoutineId, setTodayRoutineId } from '../db/todayRoutine';
import GoalRing from '../components/GoalRing';

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

function fmtDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function HomeScreen() {
  const navigate = useNavigate();
  const [, setTick] = useState(0);
  const [showRoutinePick, setShowRoutinePick] = useState(false);
  const bump = () => setTick((n) => n + 1);
  const routines = useLiveQuery(() => listRoutines(), []) ?? [];
  const sessions = useLiveQuery(() => listFinishedSessions(), []) ?? [];
  const active = useLiveQuery(() => getActiveSession(), []);
  const allExercises = useLiveQuery(() => listExercises({ includeHidden: true }), []) ?? [];
  const exMap = new Map(allExercises.map((e) => [e.id, e]));

  useEffect(() => {
    const onVisible = () => bump();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  const today = new Date();
  const goal = getWeeklyGoal();
  const suggested = suggestRoutine(routines, sessions);
  const todayId = getTodayRoutineId();
  const routine = routines.find((r) => r.id === todayId) ?? suggested;
  const est = routine ? routineEstimate(routine, sessions) : {};
  const weekly = weeklyGoalProgress(sessions, goal);
  const streak = weekStreak(sessions, goal);
  const tip = coachTip(sessions, exMap);

  async function begin(r?: Routine) {
    await startSession(r);
    navigate('/session');
  }

  async function discardActive() {
    if (active && window.confirm('진행 중이던 세션을 버릴까요? 기록한 세트는 완전히 삭제돼요.')) await discardSession(active.id);
  }

  const heading = active ? '운동 진행 중이에요' : routine ? `오늘은 ${routine.name}!` : '오늘 뭐 할까요?';

  return (
    <div className="screen">
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>
          {today.getMonth() + 1}월 {today.getDate()}일 {DAYS[today.getDay()]}요일
        </div>
        <h1 className="screen-title" style={{ paddingTop: 2 }}>{heading}</h1>
      </div>

      {active ? (
        <div className="startcard">
          <div className="t">진행 중인 운동이 있어요</div>
          <div className="s">{sessionTitle(active, exMap)} · {fmtDate(active.startedAt)} 시작</div>
          <button className="go" onClick={() => navigate('/session')}>이어서 하기</button>
          <button className="go ghost" style={{ marginTop: 8 }} onClick={discardActive}>버리기</button>
        </div>
      ) : (
        <div className="startcard">
          {routine && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span className="coach-pill">코치 추천</span>
              <span className="s" style={{ marginTop: 0 }}>
                {est.minutes || est.volumeKg !== undefined
                  ? `지난 기록 기반${est.minutes ? ` · 약 ${est.minutes}` : ''}${est.volumeKg !== undefined ? ` · ${kgToDisplay(est.volumeKg, 'kg')}kg` : ''}`
                  : '오늘의 루틴'}
              </span>
            </div>
          )}
          {routine ? (
            <>
              <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {routine.items.length === 0 && <div className="s" style={{ marginTop: 0 }}>루틴에 운동이 없어요 — 시작 후 자유롭게 추가하세요</div>}
                {routine.items.map((it, i) => {
                  const ex = exMap.get(it.exerciseId);
                  const w = lastTopWeight(sessions, it.exerciseId);
                  const u = unitFor(ex);
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span className="coach-num">{i + 1}</span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <span style={{ fontSize: 14.5, fontWeight: 800 }}>{ex?.name ?? '삭제된 운동'}</span>
                        <span className="d" style={{ fontSize: 12 }}>
                          {it.defaultSets}세트{w !== undefined ? ` × ${kgToDisplay(w, u)}${u}` : ''}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <button className="go" onClick={() => void begin(routine)}>운동 시작하기</button>
              <button className="go ghost" style={{ marginTop: 8 }} onClick={() => setShowRoutinePick(!showRoutinePick)}>루틴 바꾸기</button>
              {showRoutinePick && (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {routines.map((r) => (
                    <button
                      key={r.id} className="go ghost" style={{ marginTop: 0 }}
                      onClick={() => { setTodayRoutineId(r.id); setShowRoutinePick(false); bump(); }}
                    >
                      {r.name}{suggested?.id === r.id ? ' ⭐ 추천' : ''}
                    </button>
                  ))}
                  <button className="go ghost" style={{ marginTop: 0 }} onClick={() => void begin()}>빈 세션으로 시작</button>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="t" style={{ marginTop: 12 }}>첫 운동을 시작해보세요</div>
              <div className="s">마이 탭에서 루틴을 만들면 여기에 떠요</div>
              <button className="go" onClick={() => void begin()}>빈 세션으로 시작</button>
            </>
          )}
        </div>
      )}

      <div className="grid-2">
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <GoalRing done={weekly.done} goal={weekly.goal} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 800 }}>주간 목표</span>
            <span className="d" style={{ fontSize: 11.5 }}>
              {weekly.done >= weekly.goal ? '이번 주 달성!' : `${weekly.goal - weekly.done}회 남음`}
            </span>
          </div>
        </div>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3 }}>
          <span style={{ fontSize: 13, fontWeight: 800 }}>{streak}주 연속</span>
          <span className="d" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
            {streak > 0 ? '목표를 채운 주가 이어지고 있어요' : '이번 주 목표부터 채워볼까요?'}
          </span>
        </div>
      </div>

      <div className="card tipcard">
        <span className="coach-num" aria-hidden="true">💡</span>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: 'var(--text-2)' }}>{tip.text}</p>
      </div>
    </div>
  );
}
