import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { BODY_PARTS } from '../types';
import type { BodyPart, Exercise } from '../types';
import { listExercises } from '../db/exercises';
import ExerciseImage from './ExerciseImage';
import AddExerciseForm from './AddExerciseForm';

type Filter = BodyPart | '전체';

export default function ExercisePicker({
  onSelect, onClose,
}: {
  onSelect: (ex: Exercise) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('전체');
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
