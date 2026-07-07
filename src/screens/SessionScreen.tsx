import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Exercise, Session, SetRecord } from '../types';
import {
  getActiveSession, saveSession, finishSession, discardSession,
  buildEntry, getLastRecord,
} from '../db/sessions';
import { listExercises } from '../db/exercises';
import { getRestSeconds } from '../db/settings';
import ExerciseImage from '../components/ExerciseImage';
import ExercisePicker from '../components/ExercisePicker';
import RestTimer from '../components/RestTimer';

function fmtElapsed(startedAt: number, now: number): string {
  const sec = Math.max(0, Math.floor((now - startedAt) / 1000));
  const mm = String(Math.floor(sec / 60)).padStart(2, '0');
  const ss = String(sec % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function fmtLast(sets: SetRecord[]): string {
  return sets.map((s, i) => (i === 0 ? `${s.weight}kg×${s.reps}` : `${s.weight}×${s.reps}`)).join(' · ');
}

export default function SessionScreen() {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [idx, setIdx] = useState(0);
  const [restUntil, setRestUntil] = useState(0);
  const [restTotal, setRestTotal] = useState(90);
  const [showPicker, setShowPicker] = useState(false);
  const [lastRecord, setLastRecord] = useState<SetRecord[] | undefined>();
  const [now, setNow] = useState(Date.now());
  const exercises = useLiveQuery(() => listExercises({ includeHidden: true }), []) ?? [];
  const exMap = new Map(exercises.map((e) => [e.id, e]));

  useEffect(() => {
    getActiveSession().then((s) => {
      if (!s) navigate('/', { replace: true });
      else setSession(s);
    });
  }, [navigate]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const entry = session?.entries[idx];

  useEffect(() => {
    if (!entry) { setLastRecord(undefined); return; }
    getLastRecord(entry.exerciseId).then(setLastRecord);
  }, [entry?.exerciseId]);

  if (!session) return null;

  async function update(next: Session) {
    setSession(next);
    await saveSession(next);
  }

  function patchSet(setIdx: number, patch: Partial<SetRecord>) {
    if (!session || !entry) return;
    const entries = session.entries.map((e, i) =>
      i !== idx ? e : { ...e, sets: e.sets.map((s, j) => (j !== setIdx ? s : { ...s, ...patch })) },
    );
    void update({ ...session, entries });
  }

  function toggleSet(setIdx: number) {
    if (!entry) return;
    const s = entry.sets[setIdx];
    if (s.completedAt) {
      patchSet(setIdx, { completedAt: undefined });
    } else {
      patchSet(setIdx, { completedAt: Date.now() });
      const restSec = getRestSeconds();
      setRestTotal(restSec);
      setRestUntil(Date.now() + restSec * 1000);
    }
  }

  function addSet() {
    if (!session || !entry) return;
    const lastSet = entry.sets[entry.sets.length - 1] ?? { weight: 0, reps: 10 };
    const entries = session.entries.map((e, i) =>
      i !== idx ? e : { ...e, sets: [...e.sets, { weight: lastSet.weight, reps: lastSet.reps }] },
    );
    void update({ ...session, entries });
  }

  async function addExercise(ex: Exercise) {
    if (!session) return;
    setShowPicker(false);
    const newEntry = await buildEntry(ex.id);
    const next = { ...session, entries: [...session.entries, newEntry] };
    await update(next);
    setIdx(next.entries.length - 1);
  }

  async function finish() {
    if (!session) return;
    const doneCount = session.entries.flatMap((e) => e.sets).filter((s) => s.completedAt).length;
    if (doneCount === 0) {
      if (window.confirm('완료한 세트가 없어요. 세션을 버릴까요?')) {
        await discardSession(session.id);
        navigate('/', { replace: true });
      }
      return;
    }
    if (!window.confirm('운동을 완료할까요?')) return;
    await finishSession(session);
    navigate('/', { replace: true });
  }

  const ex = entry ? exMap.get(entry.exerciseId) : undefined;
  const total = session.entries.length;

  return (
    <>
      <div className="topnav">
        <button onClick={finish} aria-label="세션 종료">✕</button>
        <span className="title">{session.routineName ?? '오늘 운동'} · <span>{total > 0 ? `${idx + 1} / ${total}` : '운동 없음'}</span></span>
        <span className="clock">{fmtElapsed(session.startedAt, now)}</span>
      </div>
      <div className="progressbar">
        <div style={{ width: total > 0 ? `${((idx + 1) / total) * 100}%` : '0%' }} />
      </div>
      <div className="screen">
        {entry && ex ? (
          <>
            <div className="card">
              <ExerciseImage exercise={ex} className="hero-img" />
              <div className="ex-name">{ex.name}</div>
              <div className="tags">
                <span className="tag">{ex.bodyPart}</span>
                <span className="tag">{ex.equipment}</span>
              </div>
              {lastRecord && <div className="last-pill" style={{ marginTop: 10 }}>🔥 지난번 {fmtLast(lastRecord)}</div>}
            </div>
            <div className="card">
              <div className="set-head"><span>세트</span><span>무게(kg)</span><span>횟수</span><span>완료</span></div>
              {entry.sets.map((s, i) => (
                <div key={i} className={`set-row ${s.completedAt ? 'done' : ''}`} style={{ marginTop: 8 }}>
                  <span className="n">{i + 1}</span>
                  <input
                    type="number" inputMode="decimal" step="0.5" min="0"
                    aria-label={`세트 ${i + 1} 무게`}
                    value={s.weight}
                    onChange={(e) => patchSet(i, { weight: Number(e.target.value) || 0 })}
                  />
                  <input
                    type="number" inputMode="numeric" min="0"
                    aria-label={`세트 ${i + 1} 횟수`}
                    value={s.reps}
                    onChange={(e) => patchSet(i, { reps: Number(e.target.value) || 0 })}
                  />
                  <button
                    className="chk" aria-label={`세트 ${i + 1} 완료`}
                    onClick={() => toggleSet(i)}
                  >
                    ✓
                  </button>
                </div>
              ))}
              <button className="btn btn-ghost" style={{ marginTop: 10 }} onClick={addSet}>＋ 세트 추가</button>
            </div>
          </>
        ) : (
          <div className="empty">아래에서 운동을 추가해 시작하세요</div>
        )}
        <button className="btn btn-ghost" onClick={() => setShowPicker(true)}>＋ 운동 추가</button>
        <RestTimer until={restUntil} total={restTotal} onSkip={() => setRestUntil(0)} />
        <div className="btn-row">
          <button className="btn btn-ghost" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>이전</button>
          {idx < total - 1 ? (
            <button className="btn btn-primary" onClick={() => setIdx(idx + 1)}>다음 운동</button>
          ) : (
            <button className="btn btn-primary" style={{ background: 'var(--green)' }} onClick={finish}>운동 완료</button>
          )}
        </div>
      </div>
      {showPicker && <ExercisePicker onSelect={addExercise} onClose={() => setShowPicker(false)} />}
    </>
  );
}
