import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Exercise, Routine } from '../types';
import { listExercises } from '../db/exercises';
import { saveRoutine } from '../db/routines';
import ExercisePicker from './ExercisePicker';

export default function RoutineEditor({
  routine, onClose,
}: {
  routine: Routine;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Routine>({ ...routine, items: [...routine.items] });
  const [showPicker, setShowPicker] = useState(false);
  const exercises = useLiveQuery(() => listExercises({ includeHidden: true }), []) ?? [];
  const exMap = new Map(exercises.map((e) => [e.id, e]));

  function addExercise(ex: Exercise) {
    setShowPicker(false);
    if (draft.items.some((it) => it.exerciseId === ex.id)) return;
    setDraft({ ...draft, items: [...draft.items, { exerciseId: ex.id, defaultSets: 3 }] });
  }

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= draft.items.length) return;
    const items = [...draft.items];
    [items[i], items[j]] = [items[j], items[i]];
    setDraft({ ...draft, items });
  }

  function setSets(i: number, delta: number) {
    const items = draft.items.map((it, k) =>
      k !== i ? it : { ...it, defaultSets: Math.max(1, it.defaultSets + delta) },
    );
    setDraft({ ...draft, items });
  }

  async function save() {
    if (!draft.name.trim()) { window.alert('루틴 이름을 입력하세요.'); return; }
    if (draft.items.length === 0) { window.alert('운동을 하나 이상 추가하세요.'); return; }
    await saveRoutine({ ...draft, name: draft.name.trim() });
    onClose();
  }

  return (
    <div className="overlay">
      <div className="topnav">
        <button onClick={onClose} aria-label="닫기">←</button>
        <span className="title">루틴 편집</span>
        <span style={{ width: 26 }} />
      </div>
      <div className="screen">
        <div className="field">
          <label htmlFor="rt-name">루틴 이름</label>
          <input id="rt-name" value={draft.name} placeholder="예: 가슴 날"
            onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </div>
        {draft.items.map((it, i) => (
          <div key={it.exerciseId} className="card" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800 }}>{exMap.get(it.exerciseId)?.name ?? '삭제된 운동'}</div>
              <div className="stepper" style={{ marginTop: 6 }}>
                <button onClick={() => setSets(i, -1)}>−</button>
                <span>{it.defaultSets}세트</span>
                <button onClick={() => setSets(i, 1)}>＋</button>
              </div>
            </div>
            <button onClick={() => move(i, -1)} aria-label="위로">▲</button>
            <button onClick={() => move(i, 1)} aria-label="아래로">▼</button>
            <button
              style={{ color: 'var(--red)' }} aria-label="빼기"
              onClick={() => setDraft({ ...draft, items: draft.items.filter((_, k) => k !== i) })}
            >
              ✕
            </button>
          </div>
        ))}
        <button className="btn btn-ghost" onClick={() => setShowPicker(true)}>＋ 운동 추가</button>
        <button className="btn btn-primary" onClick={save}>저장</button>
      </div>
      {showPicker && <ExercisePicker onSelect={addExercise} onClose={() => setShowPicker(false)} />}
    </div>
  );
}
