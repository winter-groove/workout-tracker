import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Routine, Session } from '../types';
import { listRoutines } from '../db/routines';
import {
  startSession, getActiveSession, discardSession, listFinishedSessions,
} from '../db/sessions';
import { getTodayRoutineId, setTodayRoutineId, clearTodayRoutine } from '../db/todayRoutine';
import MonthCalendar from '../components/MonthCalendar';

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function pickNextRoutine(routines: Routine[], sessions: Session[]): Routine | undefined {
  if (routines.length === 0) return undefined;
  const lastUsed = new Map<string, number>();
  for (const s of sessions) {
    if (s.routineName && !lastUsed.has(s.routineName)) lastUsed.set(s.routineName, s.startedAt);
  }
  return [...routines].sort(
    (a, b) => (lastUsed.get(a.name) ?? 0) - (lastUsed.get(b.name) ?? 0),
  )[0];
}

function fmtDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function HomeScreen() {
  const navigate = useNavigate();
  const [, setTick] = useState(0);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showBackdatePick, setShowBackdatePick] = useState(false);
  const bump = () => setTick((n) => n + 1);
  const routines = useLiveQuery(() => listRoutines(), []) ?? [];
  const sessions = useLiveQuery(() => listFinishedSessions(), []) ?? [];
  const active = useLiveQuery(() => getActiveSession(), []);

  const today = new Date();
  const workoutDays = new Set(
    sessions.map((s) => new Date(s.startedAt)).map((d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`),
  );
  const daySessions = selectedDate
    ? sessions.filter((s) => sameDay(new Date(s.startedAt), selectedDate))
    : [];
  const next = pickNextRoutine(routines, sessions);
  const todayId = getTodayRoutineId();
  const todayRoutine = routines.find((r) => r.id === todayId);

  function chooseToday(r: Routine) {
    setTodayRoutineId(r.id);
    bump();
  }

  function resetToday() {
    clearTodayRoutine();
    bump();
  }

  useEffect(() => {
    const onVisible = () => bump();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  async function begin(routine?: Routine) {
    await startSession(routine);
    navigate('/session');
  }

  const canBackdate = selectedDate !== null && selectedDate.getTime() <= today.getTime();

  async function beginBackdate(routine?: Routine) {
    if (!selectedDate) return;
    if (active) {
      window.alert('진행 중인 운동을 먼저 완료하세요');
      return;
    }
    const noon = new Date(
      selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 12,
    ).getTime();
    await startSession(routine, noon);
    navigate('/session');
  }

  async function discardActive() {
    if (active && window.confirm('진행 중이던 세션을 버릴까요?')) await discardSession(active.id);
  }

  return (
    <div className="screen">
      <h1 className="screen-title">
        {today.getMonth() + 1}월 {today.getDate()}일, 오늘도 해볼까요? 💪
      </h1>

      {active ? (
        <div className="startcard">
          <div className="t">진행 중인 운동이 있어요</div>
          <div className="s">{active.routineName ?? '오늘 운동'} · {fmtDate(active.startedAt)} 시작</div>
          <button className="go" onClick={() => navigate('/session')}>이어서 하기</button>
          <button className="go" style={{ marginTop: 8, background: 'rgba(255,255,255,0.2)', color: '#fff' }} onClick={discardActive}>
            버리기
          </button>
        </div>
      ) : (
        <div className="startcard">
          {routines.length === 0 ? (
            <>
              <div className="t">첫 운동을 시작해보세요</div>
              <div className="s">관리 탭에서 루틴을 만들면 여기에 떠요</div>
              <button className="go" onClick={() => begin()}>빈 세션으로 시작</button>
            </>
          ) : todayRoutine ? (
            <>
              <div className="t">오늘은 {todayRoutine.name}</div>
              <div className="s">{todayRoutine.items.length}개 운동</div>
              <button className="go" onClick={() => begin(todayRoutine)}>운동 시작하기</button>
              <button
                className="go" style={{ marginTop: 8, background: 'rgba(255,255,255,0.2)', color: '#fff' }}
                onClick={resetToday}
              >
                다시 선택
              </button>
            </>
          ) : (
            <>
              <div className="t">오늘 뭐 할까요?</div>
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {routines.map((r) => (
                  <button key={r.id} className="go" onClick={() => chooseToday(r)}>
                    {r.name}{next?.id === r.id ? ' ⭐ 추천' : ''}
                  </button>
                ))}
                <button
                  className="go" style={{ background: 'rgba(255,255,255,0.2)', color: '#fff' }}
                  onClick={() => begin()}
                >
                  빈 세션으로 시작
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="card">
        <div className="card-h">달력</div>
        <MonthCalendar
          workoutDays={workoutDays}
          selectedDate={selectedDate}
          onSelectDate={(d) => { setSelectedDate(d); setShowBackdatePick(false); }}
        />
        {selectedDate && (
          <div style={{ marginTop: 12 }}>
            {daySessions.map((s) => (
              <div
                key={s.id} className="hist-row" style={{ cursor: 'pointer' }}
                onClick={() => navigate(`/summary/${s.id}`)}
              >
                <span>{s.routineName ?? '오늘 운동'} · {s.entries.length}개 운동</span>
                <span className="d">보기 ›</span>
              </div>
            ))}
            {daySessions.length === 0 && <div className="empty">이 날은 운동 기록이 없어요</div>}
            {canBackdate && (
              <>
                <button
                  className="btn btn-ghost" style={{ marginTop: 10 }}
                  onClick={() => setShowBackdatePick(!showBackdatePick)}
                >
                  ＋ 이 날짜에 기록 추가
                </button>
                {showBackdatePick && (
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {routines.map((r) => (
                      <button key={r.id} className="btn btn-ghost" onClick={() => void beginBackdate(r)}>
                        {r.name}
                      </button>
                    ))}
                    <button className="btn btn-ghost" onClick={() => void beginBackdate()}>빈 세션</button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-h">최근 운동</div>
        {sessions.slice(0, 5).map((s) => (
          <div
            key={s.id} className="hist-row" style={{ cursor: 'pointer' }}
            onClick={() => navigate(`/summary/${s.id}`)}
          >
            <span>{s.routineName ?? '오늘 운동'} · {s.entries.length}개 운동</span>
            <span className="d">{fmtDate(s.startedAt)}</span>
          </div>
        ))}
        {sessions.length === 0 && <div className="empty">아직 기록이 없어요</div>}
      </div>
    </div>
  );
}
