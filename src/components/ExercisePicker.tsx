import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { BODY_PARTS } from '../types';
import type { BodyPart, Exercise } from '../types';
import { listExercises } from '../db/exercises';
import ExerciseImage from './ExerciseImage';
import AddExerciseForm from './AddExerciseForm';

export type Filter = BodyPart | '전체';

export function dominantBodyPart(exercises: Exercise[]): BodyPart | undefined {
  const counts = new Map<BodyPart, number>();
  for (const e of exercises) counts.set(e.bodyPart, (counts.get(e.bodyPart) ?? 0) + 1);
  let best: BodyPart | undefined;
  let bestCount = 0;
  let tie = false;
  for (const [part, count] of counts) {
    if (count > bestCount) {
      best = part;
      bestCount = count;
      tie = false;
    } else if (count === bestCount) {
      tie = true;
    }
  }
  return tie ? undefined : best;
}

export default function ExercisePicker({
  onSelect, onClose, initialFilter,
}: {
  onSelect: (ex: Exercise) => void;
  onClose: () => void;
  initialFilter?: Filter;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>(initialFilter ?? '전체');
  const [adding, setAdding] = useState(false);
  const exercises = useLiveQuery(() => listExercises(), []) ?? [];

  const visible = exercises.filter(
    (e) =>
      (filter === '전체' || e.bodyPart === filter) &&
      (query.trim() === '' || e.name.includes(query.trim())),
  );

  return (
    <div className="overlay">
      <div className="topnav">
        <button onClick={onClose} aria-label="닫기">←</button>
        <span className="title">운동 추가</span>
        <span style={{ width: 26 }} />
      </div>
      <div className="screen">
        <input
          className="search" placeholder="운동 이름 검색"
          value={query} onChange={(e) => setQuery(e.target.value)}
        />
        <div className="chips">
          {(['전체', ...BODY_PARTS] as Filter[]).map((b) => (
            <button key={b} className={`chip ${filter === b ? 'on' : ''}`} onClick={() => setFilter(b)}>
              {b}
            </button>
          ))}
        </div>
        {visible.map((ex) => (
          <button key={ex.id} className="ex-row" onClick={() => onSelect(ex)}>
            <ExerciseImage exercise={ex} />
            <div>
              <div className="nm">{ex.name}</div>
              <div className="sb">{ex.bodyPart} · {ex.equipment}</div>
            </div>
          </button>
        ))}
        {visible.length === 0 && <div className="empty">검색 결과가 없어요</div>}
        {adding ? (
          <AddExerciseForm onSaved={(ex) => { setAdding(false); onSelect(ex); }} />
        ) : (
          <button className="btn btn-ghost" onClick={() => setAdding(true)}>＋ 없는 운동 직접 등록</button>
        )}
      </div>
    </div>
  );
}
