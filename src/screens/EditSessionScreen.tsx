import { useEffect, useState, useRef } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Exercise, Session, SessionEntry, SetRecord } from '../types';
import { db } from '../db/db';
import { saveSession, buildEntry } from '../db/sessions';
import { listExercises } from '../db/exercises';
import ExercisePicker, { dominantBodyPart } from '../components/ExercisePicker';

export default function EditSessionScreen() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [entries, setEntries] = useState<SessionEntry[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const buildingRef = useRef<Array<{ promise: Promise<SessionEntry>; entry?: SessionEntry }>>([]);
  const exercises = useLiveQuery(() => listExercises({ includeHidden: true }), []) ?? [];
  const exMap = new Map(exercises.map((e) => [e.id, e]));

  useEffect(() => {
    if (!sessionId) {
      navigate('/', { replace: true });
      return;
    }
    db.sessions.get(sessionId).then((s) => {
      if (!s || s.finishedAt === undefined) {
        navigate('/', { replace: true });
        return;
      }
      setSession(s);
      setEntries(s.entries.map((e) => ({ ...e, sets: e.sets.map((x) => ({ ...x })) })));
    });
  }, [sessionId, navigate]);

  if (!session) return null;

  function patchSet(entryIdx: number, setIdx: number, patch: Partial<SetRecord>) {
    setEntries(entries.map((e, i) =>
      i !== entryIdx ? e : { ...e, sets: e.sets.map((s, j) => (j !== setIdx ? s : { ...s, ...patch })) },
    ));
  }

  function removeSet(entryIdx: number, setIdx: number) {
    setEntries(entries.map((e, i) =>
      i !== entryIdx ? e : { ...e, sets: e.sets.filter((_, j) => j !== setIdx) },
    ));
  }

  function addSet(entryIdx: number) {
    setEntries(entries.map((e, i) => {
      if (i !== entryIdx) return e;
      const last = e.sets[e.sets.length - 1] ?? { weight: 0, reps: 10 };
      return { ...e, sets: [...e.sets, { weight: last.weight, reps: last.reps }] };
    }));
  }

  function removeEntry(entryIdx: number) {
    setEntries(entries.filter((_, i) => i !== entryIdx));
  }

  function addExercise(ex: Exercise) {
    if (!session) return;
    setShowPicker(false);
    const promise = buildEntry(ex.id, 3, session.startedAt + 1);
    const item = { promise, entry: undefined as SessionEntry | undefined };
    buildingRef.current.push(item);
    promise.then((entry) => {
      item.entry = entry;
      flushSync(() => setEntries((prev) => [...prev, entry]));
    });
  }

  async function save() {
    if (!session) return;
    // Wait for all pending buildEntry operations to complete
    const pendingPromises = buildingRef.current.map((item) => item.promise);
    if (pendingPromises.length > 0) {
      await Promise.all(pendingPromises);
    }
    // Merge pending entries with current entries
    const allEntries = [
      ...entries,
      ...buildingRef.current.map((item) => item.entry).filter((e): e is SessionEntry => e !== undefined),
    ];
    buildingRef.current = [];
    const cleaned = allEntries
      .map((e) => ({
        ...e,
        sets: e.sets.map((s) => ({ ...s, completedAt: s.completedAt ?? session.startedAt + 1 })),
      }))
      .filter((e) => e.sets.length > 0);
    if (cleaned.length === 0) {
      window.alert('운동이 최소 1개는 있어야 해요. 기록 삭제는 기록 탭에서 할 수 있어요.');
      return;
    }
    await saveSession({ ...session, entries: cleaned });
    navigate(`/summary/${session.id}`, { replace: true });
  }

  return (
    <div className="screen">
      <h1 className="screen-title">기록 수정</h1>
      {entries.map((e, i) => (
        <div key={i} className="card">
          <div className="hist-row" style={{ borderBottom: 'none' }}>
            <span>{exMap.get(e.exerciseId)?.name ?? '삭제된 운동'}</span>
            <button
              className="btn-sm btn btn-danger"
              onClick={() => removeEntry(i)}
            >
              운동 삭제
            </button>
          </div>
          {e.sets.map((s, j) => (
            <div key={j} className="set-row" style={{ marginTop: 8 }}>
              <span className="n">{j + 1}</span>
              <input
                type="number" inputMode="decimal" step="0.5" min="0"
                aria-label={`세트 ${j + 1} 무게`}
                value={s.weight === 0 ? '' : s.weight}
                placeholder="0"
                onFocus={(ev) => ev.currentTarget.select()}
                onChange={(ev) => patchSet(i, j, { weight: Number(ev.target.value) || 0 })}
              />
              <input
                type="number" inputMode="numeric" min="0"
                aria-label={`세트 ${j + 1} 횟수`}
                value={s.reps}
                onFocus={(ev) => ev.currentTarget.select()}
                onChange={(ev) => patchSet(i, j, { reps: Number(ev.target.value) || 0 })}
              />
              <button className="chk" aria-label={`세트 ${j + 1} 삭제`} onClick={() => removeSet(i, j)}>
                ×
              </button>
            </div>
          ))}
          <button className="btn btn-ghost" style={{ marginTop: 10 }} onClick={() => addSet(i)}>
            ＋ 세트 추가
          </button>
        </div>
      ))}
      <button className="btn btn-ghost" onClick={() => setShowPicker(true)}>＋ 운동 추가</button>
      <div className="btn-row">
        <button className="btn btn-ghost" onClick={() => navigate(`/summary/${session.id}`, { replace: true })}>
          취소
        </button>
        <button className="btn btn-primary" onClick={() => void save()}>저장</button>
      </div>
      {showPicker && (
        <ExercisePicker
          initialFilter="전체"
          onSelect={addExercise}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}
