import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { BODY_PARTS } from '../types';
import type { BodyPart, Exercise } from '../types';
import { listExercises, setExerciseFavorite } from '../db/exercises';
import { getLastDoneMap } from '../db/sessions';
import ExerciseImage from './ExerciseImage';
import AddExerciseForm from './AddExerciseForm';

export type Filter = BodyPart | '전체';

function fmtDone(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

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
  const lastDone = useLiveQuery(() => getLastDoneMap(), []) ?? new Map<string, number>();

  const visible = exercises.filter(
    (e) =>
      (filter === '전체' || e.bodyPart === filter) &&
      (query.trim() === '' || e.name.includes(query.trim())),
  );

  const favorites = visible.filter((e) => e.isFavorite);
  const recent = visible
    .filter((e) => !e.isFavorite && lastDone.has(e.id))
    .sort((a, b) => (lastDone.get(b.id) ?? 0) - (lastDone.get(a.id) ?? 0));
  const rest = visible.filter((e) => !e.isFavorite && !lastDone.has(e.id));

  function renderRow(ex: Exercise, doneAt?: number) {
    return (
      <div
        key={ex.id} className="ex-row" style={{ cursor: 'pointer' }}
        onClick={() => onSelect(ex)}
      >
        <ExerciseImage exercise={ex} />
        <div>
          <div className="nm">{ex.name}</div>
          <div className="sb">
            {ex.bodyPart} · {ex.equipment}{doneAt !== undefined ? ` · ${fmtDone(doneAt)}` : ''}
          </div>
        </div>
        <button
          aria-label={`${ex.name} 즐겨찾기`}
          style={{
            marginLeft: 'auto', background: 'none', border: 'none', padding: '0 6px',
            fontSize: 18, color: ex.isFavorite ? '#f5a623' : 'var(--gray-5)', cursor: 'pointer',
          }}
          onClick={(ev) => {
            ev.stopPropagation();
            void setExerciseFavorite(ex.id, !ex.isFavorite);
          }}
        >
          {ex.isFavorite ? '★' : '☆'}
        </button>
      </div>
    );
  }

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
        {favorites.length > 0 && (
          <>
            <div className="card-h" style={{ marginTop: 4 }}>★ 즐겨찾기</div>
            {favorites.map((ex) => renderRow(ex, lastDone.get(ex.id)))}
          </>
        )}
        {recent.length > 0 && (
          <>
            <div className="card-h" style={{ marginTop: favorites.length > 0 ? 12 : 4 }}>최근 한 운동</div>
            {recent.map((ex) => renderRow(ex, lastDone.get(ex.id)))}
          </>
        )}
        {(favorites.length > 0 || recent.length > 0) && rest.length > 0 && (
          <div className="card-h" style={{ marginTop: 12 }}>전체 운동</div>
        )}
        {rest.map((ex) => renderRow(ex))}
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
