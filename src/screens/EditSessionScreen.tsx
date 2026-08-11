import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Exercise, Session, SessionEntry, SetRecord } from '../types';
import { db } from '../db/db';
import { saveSession, buildEntry, sessionTitle, setLabels, dropHeadCleaned } from '../db/sessions';
import { listExercises } from '../db/exercises';
import { kgToDisplay, displayToKg, unitFor, dropWeight, stepFor, type WeightUnit } from '../db/weightUnit';
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

  function addDrop(entryIdx: number, unit: WeightUnit) {
    setEntries(entries.map((e, i) => {
      if (i !== entryIdx) return e;
      const last = e.sets[e.sets.length - 1];
      if (!last) return e;
      return {
        ...e,
        sets: [...e.sets, { weight: dropWeight(last.weight, unit), reps: last.reps, isDrop: true }],
      };
    }));
  }

  function addSet(entryIdx: number) {
    setEntries(entries.map((e, i) => {
      if (i !== entryIdx) return e;
      // 마지막 non-drop 세트를 시드로, 없으면 마지막 세트, 둘 다 없으면 기본값
      let seed = { weight: 0, reps: 10 };
      for (let j = e.sets.length - 1; j >= 0; j--) {
        if (!e.sets[j].isDrop) {
          seed = e.sets[j];
          break;
        }
      }
      if (seed.weight === 0 && e.sets.length > 0) {
        seed = e.sets[e.sets.length - 1];
      }
      return { ...e, sets: [...e.sets, { weight: seed.weight, reps: seed.reps }] };
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
        sets: dropHeadCleaned(
          e.sets.map((s) => ({ ...s, completedAt: s.completedAt ?? session.startedAt + 1 })),
        ),
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
        const labels = setLabels(e.sets);
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
                <span className="n">{labels[j]}</span>
                <input
                  type="number" inputMode="decimal" step={stepFor(u)} min="0"
                  aria-label={`세트 ${labels[j]} 무게`}
                  value={s.weight === 0 ? '' : kgToDisplay(s.weight, u)}
                  placeholder="0"
                  onFocus={(ev) => ev.currentTarget.select()}
                  onChange={(ev) => patchSet(i, j, { weight: displayToKg(Number(ev.target.value) || 0, u) })}
                />
                <input
                  type="number" inputMode="numeric" min="0"
                  aria-label={`세트 ${labels[j]} 횟수`}
                  value={s.reps}
                  onFocus={(ev) => ev.currentTarget.select()}
                  onChange={(ev) => patchSet(i, j, { reps: Number(ev.target.value) || 0 })}
                />
                <button className="chk" aria-label={`세트 ${labels[j]} 삭제`} onClick={() => removeSet(i, j)}>
                  ×
                </button>
              </div>
            ))}
            <div className="btn-row tight" style={{ marginTop: 10 }}>
              <button className="btn btn-ghost" onClick={() => addSet(i)}>＋ 세트 추가</button>
              <button
                className="btn btn-ghost" disabled={e.sets.length === 0}
                onClick={() => addDrop(i, u)}
              >
                ↓ 드랍 추가
              </button>
            </div>
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
