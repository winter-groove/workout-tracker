import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Routine, SetRecord } from '../types';
import {
  listFinishedSessions, deleteSession, getExerciseHistory, sessionTitle, startSession, getActiveSession,
} from '../db/sessions';
import { listExercises } from '../db/exercises';
import { listRoutines } from '../db/routines';
import { annotateHistory, fmtVolumeDelta, fmtWeightDelta, sessionVolume } from '../db/progress';
import { kgToDisplay, unitFor, fmtWeightLabel, type WeightUnit } from '../db/weightUnit';
import MonthCalendar from '../components/MonthCalendar';
import SessionDetails from '../components/SessionDetails';

function fmtDate(ts: number): string {
  const d = new Date(ts);
  const day = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  return `${d.getMonth() + 1}/${d.getDate()} (${day})`;
}

function fmtSets(sets: SetRecord[], unit: WeightUnit): string {
  return sets
    .map((s) => `${s.isDrop ? '↓' : ''}${kgToDisplay(s.weight, unit)}×${s.reps}`)
    .join(', ');
}

export default function HistoryScreen() {
  const navigate = useNavigate();
  const [filterId, setFilterId] = useState('');
  const [openId, setOpenId] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showBackdatePick, setShowBackdatePick] = useState(false);
  const [openCalSessionId, setOpenCalSessionId] = useState('');
  const sessions = useLiveQuery(() => listFinishedSessions(), []) ?? [];
  const exercises = useLiveQuery(() => listExercises({ includeHidden: true }), []) ?? [];
  const routines = useLiveQuery(() => listRoutines(), []) ?? [];
  const active = useLiveQuery(() => getActiveSession(), []);
  const history = useLiveQuery(
    () => (filterId ? getExerciseHistory(filterId) : Promise.resolve(null)),
    [filterId],
  );
  const exMap = new Map(exercises.map((e) => [e.id, e]));
  const annotations = history ? annotateHistory(history.map((h) => h.sets)) : [];
  const filterUnit = unitFor(exMap.get(filterId));

  const today = new Date();
  const workoutDays = new Set(
    sessions.map((s) => new Date(s.startedAt)).map((d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`),
  );
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const daySessions = selectedDate ? sessions.filter((s) => sameDay(new Date(s.startedAt), selectedDate)) : [];
  const canBackdate = selectedDate !== null && selectedDate.getTime() <= today.getTime();

  async function remove(id: string) {
    if (window.confirm('이 기록을 삭제할까요?')) await deleteSession(id);
  }

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

  return (
    <div className="screen">
      <h1 className="screen-title">기록</h1>

      <div className="card">
        <div className="card-h">달력</div>
        <MonthCalendar
          workoutDays={workoutDays}
          selectedDate={selectedDate}
          onSelectDate={(d) => { setSelectedDate(d); setShowBackdatePick(false); setOpenCalSessionId(''); }}
        />
        {selectedDate && (
          <div style={{ marginTop: 12 }}>
            {daySessions.map((s) => (
              <div key={s.id} className="hist-row" style={{ display: 'block' }}>
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                  onClick={() => setOpenCalSessionId(openCalSessionId === s.id ? '' : s.id)}
                >
                  <span>{sessionTitle(s, exMap)} · {s.entries.length}개 운동 · 총 볼륨 {kgToDisplay(sessionVolume(s), 'kg')}kg {openCalSessionId === s.id ? '▴' : '▾'}</span>
                  <button
                    className="btn-sm btn btn-ghost"
                    onClick={(ev) => { ev.stopPropagation(); navigate(`/summary/${s.id}`); }}
                  >
                    요약 ›
                  </button>
                </div>
                {openCalSessionId === s.id && (
                  <div style={{ marginTop: 8 }}>
                    <SessionDetails key={s.id} session={s} exMap={exMap} />
                  </div>
                )}
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

      <div className="field">
        <label htmlFor="ex-filter">운동별로 보기</label>
        <select
          id="ex-filter"
          value={filterId}
          onChange={(e) => setFilterId(e.target.value)}
        >
          <option value="">전체 세션</option>
          {exercises.map((ex) => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
        </select>
      </div>

      {filterId && history ? (
        <div className="card">
          <div className="card-h">{exMap.get(filterId)?.name} 변화</div>
          {history.map(({ session, sets }, i) => {
            const a = annotations[i];
            const line = a.prevVolume === undefined
              ? `볼륨 ${fmtWeightLabel(a.volume, filterUnit)} · 첫 기록`
              : `볼륨 ${fmtWeightLabel(a.volume, filterUnit)} ${fmtVolumeDelta(a.volume, a.prevVolume)} · 최고 ${fmtWeightLabel(a.maxWeight, filterUnit)} ${fmtWeightDelta(a.maxWeight, a.prevMaxWeight ?? 0, filterUnit)}`;
            return (
              <div key={session.id} className="hist-row" style={{ display: 'block' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{fmtSets(sets, filterUnit)}</span>
                  <span className="d">{fmtDate(session.startedAt)}</span>
                </div>
                <div className="d" style={{ fontSize: 12, marginTop: 2 }}>
                  {line}{a.isPR ? ' 🏆' : ''}
                </div>
              </div>
            );
          })}
          {history.length === 0 && <div className="empty">이 운동의 기록이 없어요</div>}
        </div>
      ) : (
        <>
          {sessions.map((s) => (
            <div key={s.id} className="card" onClick={() => setOpenId(openId === s.id ? '' : s.id)}>
              <div className="hist-row" style={{ borderBottom: openId === s.id ? undefined : 'none' }}>
                <span>{sessionTitle(s, exMap)} · {s.entries.length}개 운동 · 총 볼륨 {kgToDisplay(sessionVolume(s), 'kg')}kg {openId === s.id ? '▴' : '▾'}</span>
                <span className="d">{fmtDate(s.startedAt)}</span>
              </div>
              {openId === s.id && (
                <div style={{ marginTop: 8 }}>
                  <SessionDetails key={s.id} session={s} exMap={exMap} />
                  <div className="btn-row" style={{ marginTop: 10 }}>
                    <button
                      className="btn btn-ghost"
                      onClick={(ev) => { ev.stopPropagation(); navigate(`/edit/${s.id}`); }}
                    >
                      수정하기
                    </button>
                    <button
                      className="btn btn-danger"
                      onClick={(ev) => { ev.stopPropagation(); void remove(s.id); }}
                    >
                      기록 삭제
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {sessions.length === 0 && <div className="empty">아직 완료한 운동이 없어요</div>}
        </>
      )}
    </div>
  );
}
