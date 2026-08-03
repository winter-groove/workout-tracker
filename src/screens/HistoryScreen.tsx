import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import type { SetRecord } from '../types';
import { listFinishedSessions, deleteSession, getExerciseHistory, sessionTitle } from '../db/sessions';
import { listExercises } from '../db/exercises';
import {
  annotateHistory, fmtVolumeDelta, fmtWeightDelta, summarizeSession, type EntryProgress,
} from '../db/progress';
import { getWeightUnit, kgToDisplay } from '../db/weightUnit';

function fmtDate(ts: number): string {
  const d = new Date(ts);
  const day = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  return `${d.getMonth() + 1}/${d.getDate()} (${day})`;
}

function fmtSets(sets: SetRecord[]): string {
  return sets.map((s) => `${kgToDisplay(s.weight)}×${s.reps}`).join(', ');
}

export default function HistoryScreen() {
  const navigate = useNavigate();
  const [filterId, setFilterId] = useState('');
  const [openId, setOpenId] = useState('');
  const [openSummary, setOpenSummary] = useState<{ id: string; list: EntryProgress[] } | null>(null);
  const sessions = useLiveQuery(() => listFinishedSessions(), []) ?? [];
  const exercises = useLiveQuery(() => listExercises({ includeHidden: true }), []) ?? [];
  const history = useLiveQuery(
    () => (filterId ? getExerciseHistory(filterId) : Promise.resolve(null)),
    [filterId],
  );
  const exMap = new Map(exercises.map((e) => [e.id, e]));
  const annotations = history ? annotateHistory(history.map((h) => h.sets)) : [];
  const unit = getWeightUnit();

  useEffect(() => {
    const s = sessions.find((x) => x.id === openId);
    if (!s) {
      setOpenSummary(null);
      return;
    }
    let cancelled = false;
    void summarizeSession(s).then((list) => {
      if (!cancelled) setOpenSummary({ id: s.id, list });
    });
    return () => { cancelled = true; };
  }, [openId, sessions]);

  async function remove(id: string) {
    if (window.confirm('이 기록을 삭제할까요?')) await deleteSession(id);
  }

  return (
    <div className="screen">
      <h1 className="screen-title">기록</h1>

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
              ? `볼륨 ${kgToDisplay(a.volume)}${unit} · 첫 기록`
              : `볼륨 ${kgToDisplay(a.volume)}${unit} ${fmtVolumeDelta(a.volume, a.prevVolume)} · 최고 ${kgToDisplay(a.maxWeight)}${unit} ${fmtWeightDelta(a.maxWeight, a.prevMaxWeight ?? 0)}`;
            return (
              <div key={session.id} className="hist-row" style={{ display: 'block' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{fmtSets(sets)}</span>
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
                <span>{sessionTitle(s, exMap)} · {s.entries.length}개 운동 {openId === s.id ? '▴' : '▾'}</span>
                <span className="d">{fmtDate(s.startedAt)}</span>
              </div>
              {openId === s.id && (
                <div style={{ marginTop: 8 }}>
                  {s.entries.map((e, i) => {
                    const p = openSummary?.id === s.id ? openSummary.list[i] : undefined;
                    const line = p
                      ? (p.prevVolume === undefined
                          ? `볼륨 ${kgToDisplay(p.volume)}${unit} · 최고 ${kgToDisplay(p.maxWeight)}${unit} · 첫 기록`
                          : `볼륨 ${kgToDisplay(p.volume)}${unit} ${fmtVolumeDelta(p.volume, p.prevVolume)} · 최고 ${kgToDisplay(p.maxWeight)}${unit} ${fmtWeightDelta(p.maxWeight, p.prevMaxWeight ?? 0)}`)
                      : null;
                    return (
                      <div key={i} className="hist-row" style={{ display: 'block' }}>
                        <div style={{ fontWeight: 700 }}>
                          {exMap.get(e.exerciseId)?.name ?? '삭제된 운동'}{p?.isPR ? ' 🏆' : ''}
                        </div>
                        <div className="set-view d" style={{ marginTop: 6 }}>
                          <span>세트</span><span>무게({unit})</span><span>횟수</span>
                        </div>
                        {e.sets.map((set, j) => (
                          <div key={j} className="set-view" style={{ marginTop: 4 }}>
                            <span className="d">{j + 1}</span>
                            <span>{kgToDisplay(set.weight)}</span>
                            <span>{set.reps}</span>
                          </div>
                        ))}
                        {line && <div className="d" style={{ fontSize: 12, marginTop: 6 }}>{line}</div>}
                      </div>
                    );
                  })}
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
