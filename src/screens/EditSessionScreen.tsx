import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Exercise, Session, SessionEntry, SetRecord } from '../types';
import { db } from '../db/db';
import { saveSession, buildEntry, sessionTitle } from '../db/sessions';
import { listExercises } from '../db/exercises';
import { kgToDisplay, displayToKg, unitFor } from '../db/weightUnit';
import ExercisePicker, { dominantBodyPart } from '../components/ExercisePicker';

export default function EditSessionScreen() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [entries, setEntries] = useState<SessionEntry[]>([]);
  const [name, setName] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [pendingAdds, setPendingAdds] = useState(0);
  const [saving, setSaving] = useState(false);
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
      setName(s.routineName ?? '');
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
    setEntries(entries
      .map((e, i) => (i === entryIdx - 1 && e.pairedWithNext ? { ...e, pairedWithNext: undefined } : e))
      .filter((_, i) => i !== entryIdx));
  }

  async function addExercise(ex: Exercise) {
    if (!session) return;
    setShowPicker(false);
    setPendingAdds((n) => n + 1);
    try {
      const entry = await buildEntry(ex.id, 3, session.startedAt + 1);
      setEntries((prev) => [...prev, entry]);
    } finally {
      setPendingAdds((n) => n - 1);
    }
  }

  async function save() {
    if (!session || saving) return;
    setSaving(true);
    try {
      const fresh = await db.sessions.get(session.id);
      if (!fresh || fresh.finishedAt === undefined) {
        window.alert('세션 상태가 바뀌어 저장할 수 없어요. 다시 열어주세요.');
        navigate('/', { replace: true });
        return;
      }
      const withCompleted = entries.map((e) => ({
        ...e,
        sets: e.sets.map((s) => ({ ...s, completedAt: s.completedAt ?? session.startedAt + 1 })),
      }));
      const keep = withCompleted.map((e) => e.sets.length > 0);
      const cleaned = withCompleted
        .map((e, i) => {
          if (!keep[i]) return null;
          return e.pairedWithNext && keep[i + 1] !== true ? { ...e, pairedWithNext: undefined } : e;
        })
        .filter((e): e is (typeof withCompleted)[number] => e !== null);
      if (cleaned.length === 0) {
        window.alert('운동이 최소 1개는 있어야 해요. 기록 삭제는 기록 탭에서 할 수 있어요.');
        return;
      }
      await saveSession({
        ...session,
        routineName: name.trim() === '' ? undefined : name.trim(),
        entries: cleaned,
      });
      navigate(`/summary/${session.id}`, { replace: true });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="screen">
      <h1 className="screen-title">기록 수정</h1>
      <div className="field">
        <label htmlFor="session-name">세션 이름</label>
        <input
          id="session-name"
          placeholder={sessionTitle({ ...session, routineName: undefined, entries }, exMap)}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      {entries.map((e, i) => {
        const u = unitFor(exMap.get(e.exerciseId));
        return (
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
                  type="number" inputMode="decimal" step={u === 'lb' ? 2.5 : 0.5} min="0"
                  aria-label={`세트 ${j + 1} 무게`}
                  value={s.weight === 0 ? '' : kgToDisplay(s.weight, u)}
                  placeholder="0"
                  onFocus={(ev) => ev.currentTarget.select()}
                  onChange={(ev) => patchSet(i, j, { weight: displayToKg(Number(ev.target.value) || 0, u) })}
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
        );
      })}
      <button className="btn btn-ghost" onClick={() => setShowPicker(true)}>＋ 운동 추가</button>
      <div className="btn-row">
        <button
          className="btn btn-ghost" disabled={saving}
          onClick={() => navigate(`/summary/${session.id}`, { replace: true })}
        >
          취소
        </button>
        <button className="btn btn-primary" disabled={saving || pendingAdds > 0} onClick={() => void save()}>저장</button>
      </div>
      {showPicker && (
        <ExercisePicker
          initialFilter={
            dominantBodyPart(
              entries.map((e) => exMap.get(e.exerciseId)).filter((e): e is Exercise => e !== undefined),
            ) ?? '전체'
          }
          onSelect={(ex) => void addExercise(ex)}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}
