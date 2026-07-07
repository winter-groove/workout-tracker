import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { SetRecord } from '../types';
import { listFinishedSessions, deleteSession, getExerciseHistory } from '../db/sessions';
import { listExercises } from '../db/exercises';

function fmtDate(ts: number): string {
  const d = new Date(ts);
  const day = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  return `${d.getMonth() + 1}/${d.getDate()} (${day})`;
}

function fmtSets(sets: SetRecord[]): string {
  return sets.map((s) => `${s.weight}×${s.reps}`).join(', ');
}

export default function HistoryScreen() {
  const [filterId, setFilterId] = useState('');
  const [openId, setOpenId] = useState('');
  const sessions = useLiveQuery(() => listFinishedSessions(), []) ?? [];
  const exercises = useLiveQuery(() => listExercises({ includeHidden: true }), []) ?? [];
  const history = useLiveQuery(
    () => (filterId ? getExerciseHistory(filterId) : Promise.resolve(null)),
    [filterId],
  );
  const exMap = new Map(exercises.map((e) => [e.id, e]));

  async function remove(id: string) {
    if (window.confirm('이 기록을 삭제할까요?')) await deleteSession(id);
  }

  return (
    <div className="screen">
      <h1 className="screen-title">기록</h1>

      <div className="field">
        <label htmlFor="ex-filter">운동별로 보기</label>
        <select id="ex-filter" value={filterId} onChange={(e) => setFilterId(e.target.value)}>
          <option value="">전체 세션</option>
          {exercises.map((ex) => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
        </select>
      </div>

      {filterId && history ? (
        <div className="card">
          <div className="card-h">{exMap.get(filterId)?.name} 변화</div>
          {history.map(({ session, sets }) => (
            <div key={session.id} className="hist-row">
              <span>{fmtSets(sets)}</span>
              <span className="d">{fmtDate(session.startedAt)}</span>
            </div>
          ))}
          {history.length === 0 && <div className="empty">이 운동의 기록이 없어요</div>}
        </div>
      ) : (
        <>
          {sessions.map((s) => (
            <div key={s.id} className="card" onClick={() => setOpenId(openId === s.id ? '' : s.id)}>
              <div className="hist-row" style={{ borderBottom: openId === s.id ? undefined : 'none' }}>
                <span>{s.routineName ?? '오늘 운동'} · {s.entries.length}개 운동</span>
                <span className="d">{fmtDate(s.startedAt)}</span>
              </div>
              {openId === s.id && (
                <div style={{ marginTop: 8 }}>
                  {s.entries.map((e, i) => (
                    <div key={i} className="hist-row">
                      <span>{exMap.get(e.exerciseId)?.name ?? '삭제된 운동'}</span>
                      <span className="d">{fmtSets(e.sets)}</span>
                    </div>
                  ))}
                  <button
                    className="btn btn-danger" style={{ marginTop: 10 }}
                    onClick={(ev) => { ev.stopPropagation(); void remove(s.id); }}
                  >
                    기록 삭제
                  </button>
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
