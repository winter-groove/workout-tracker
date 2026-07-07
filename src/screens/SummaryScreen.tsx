import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Session } from '../types';
import { db } from '../db/db';
import { listExercises } from '../db/exercises';
import { summarizeEntry, fmtVolumeDelta, fmtWeightDelta, type EntryProgress } from '../db/progress';

function fmtDate(ts: number): string {
  const d = new Date(ts);
  const day = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  return `${d.getMonth() + 1}/${d.getDate()} (${day})`;
}

export default function SummaryScreen() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [progress, setProgress] = useState<EntryProgress[]>([]);
  const exercises = useLiveQuery(() => listExercises({ includeHidden: true }), []) ?? [];
  const exMap = new Map(exercises.map((e) => [e.id, e]));

  useEffect(() => {
    if (!sessionId) {
      navigate('/', { replace: true });
      return;
    }
    db.sessions.get(sessionId).then(async (s) => {
      if (!s || s.finishedAt === undefined) {
        navigate('/', { replace: true });
        return;
      }
      const list = await Promise.all(
        s.entries.map((e) => summarizeEntry(e.exerciseId, e.sets, s.startedAt)),
      );
      setSession(s);
      setProgress(list);
    });
  }, [sessionId, navigate]);

  if (!session) return null;

  return (
    <div className="screen">
      <h1 className="screen-title">운동 완료 🎉</h1>
      <div className="card">
        <div className="card-h">{session.routineName ?? '오늘 운동'} · {fmtDate(session.startedAt)} · {session.entries.length}개 운동</div>
        {session.entries.map((e, i) => {
          const p = progress[i];
          if (!p) return null;
          const line = p.prevVolume === undefined
            ? `볼륨 ${p.volume}kg · 최고 ${p.maxWeight}kg · 첫 기록`
            : `볼륨 ${p.volume}kg ${fmtVolumeDelta(p.volume, p.prevVolume)} · 최고 ${p.maxWeight}kg ${fmtWeightDelta(p.maxWeight, p.prevMaxWeight ?? 0)}`;
          return (
            <div key={i} className="hist-row" style={{ display: 'block' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{exMap.get(e.exerciseId)?.name ?? '삭제된 운동'}</span>
                {p.isPR && <span>🏆 PR</span>}
              </div>
              <div className="d" style={{ fontSize: 12.5, marginTop: 2 }}>{line}</div>
            </div>
          );
        })}
      </div>
      <button className="btn btn-primary" onClick={() => navigate('/')}>확인</button>
    </div>
  );
}
