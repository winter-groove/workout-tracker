import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Routine } from '../types';
import { listExercises, setExerciseHidden, deleteCustomExercise } from '../db/exercises';
import { listRoutines, deleteRoutine, newRoutine } from '../db/routines';
import { exportData, importData } from '../db/backup';
import { getRestSeconds, setRestSeconds } from '../db/settings';
import ExerciseImage from '../components/ExerciseImage';
import AddExerciseForm from '../components/AddExerciseForm';
import RoutineEditor from '../components/RoutineEditor';

export default function ManageScreen() {
  const [editing, setEditing] = useState<Routine | null>(null);
  const [addingEx, setAddingEx] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [exQuery, setExQuery] = useState('');
  const [rest, setRest] = useState(getRestSeconds());
  const fileRef = useRef<HTMLInputElement>(null);
  const routines = useLiveQuery(() => listRoutines(), []) ?? [];
  const exercises = useLiveQuery(() => listExercises({ includeHidden: true }), []) ?? [];

  const visibleExercises = (showHidden ? exercises : exercises.filter((e) => !e.isHidden))
    .filter((e) => exQuery.trim() === '' || e.name.includes(exQuery.trim()));

  async function doExport() {
    const data = await exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const d = new Date();
    a.download = `workout-backup-${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function doImport(file: File) {
    if (!window.confirm('가져오기는 현재 데이터를 전부 교체합니다. 계속할까요?')) return;
    try {
      const raw: unknown = JSON.parse(await file.text());
      await importData(raw);
      window.alert('가져오기 완료!');
    } catch (e) {
      window.alert(`가져오기 실패: ${e instanceof Error ? e.message : '알 수 없는 오류'}`);
    }
  }

  return (
    <div className="screen">
      <h1 className="screen-title">관리</h1>

      <div className="card">
        <div className="card-h">루틴 템플릿</div>
        {routines.map((r) => (
          <div key={r.id} className="hist-row">
            <span>{r.name} · {r.items.length}개 운동</span>
            <span>
              <button className="btn-sm btn btn-ghost" onClick={() => setEditing(r)}>편집</button>{' '}
              <button
                className="btn-sm btn btn-danger"
                onClick={() => window.confirm(`'${r.name}' 루틴을 삭제할까요?`) && void deleteRoutine(r.id)}
              >
                삭제
              </button>
            </span>
          </div>
        ))}
        {routines.length === 0 && <div className="empty">루틴을 만들어두면 홈에서 바로 시작할 수 있어요</div>}
        <button className="btn btn-primary" style={{ marginTop: 10 }} onClick={() => setEditing(newRoutine())}>
          ＋ 루틴 만들기
        </button>
      </div>

      <div className="card">
        <div className="card-h">내 운동 목록</div>
        <label style={{ fontSize: 12, color: 'var(--gray-5)' }}>
          <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} /> 숨긴 운동 표시
        </label>
        <input
          className="search" placeholder="운동 이름 검색" style={{ marginTop: 8 }}
          value={exQuery} onChange={(e) => setExQuery(e.target.value)}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          {visibleExercises.map((ex) => (
            <div key={ex.id} className="ex-row" style={{ boxShadow: 'none', border: '1px solid var(--gray-1)' }}>
              <ExerciseImage exercise={ex} />
              <div>
                <div className="nm">{ex.name}{ex.isHidden ? ' (숨김)' : ''}</div>
                <div className="sb">{ex.bodyPart} · {ex.equipment}{ex.isCustom ? ' · 직접 등록' : ''}</div>
              </div>
              <div className="right">
                {ex.isCustom ? (
                  <button
                    className="btn-sm btn btn-danger"
                    onClick={() => window.confirm(`'${ex.name}'을(를) 삭제할까요?`) && void deleteCustomExercise(ex.id)}
                  >
                    삭제
                  </button>
                ) : (
                  <button className="btn-sm btn btn-ghost" onClick={() => void setExerciseHidden(ex.id, !ex.isHidden)}>
                    {ex.isHidden ? '보이기' : '숨기기'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        {addingEx ? (
          <div style={{ marginTop: 10 }}>
            <AddExerciseForm onSaved={() => setAddingEx(false)} />
          </div>
        ) : (
          <button className="btn btn-ghost" style={{ marginTop: 10 }} onClick={() => setAddingEx(true)}>
            ＋ 운동 직접 등록
          </button>
        )}
      </div>

      <div className="card">
        <div className="card-h">설정</div>
        <div className="field">
          <label htmlFor="rest-sec">세트 간 휴식 시간 (초)</label>
          <input
            id="rest-sec" type="number" inputMode="numeric" min="10" step="10"
            value={rest}
            onChange={(e) => {
              const n = Number(e.target.value) || 90;
              setRest(n);
              setRestSeconds(n);
            }}
          />
        </div>
      </div>

      <div className="card">
        <div className="card-h">데이터 백업</div>
        <div className="btn-row">
          <button className="btn btn-ghost" onClick={doExport}>내보내기</button>
          <button className="btn btn-ghost" onClick={() => fileRef.current?.click()}>가져오기</button>
        </div>
        <input
          ref={fileRef} type="file" accept="application/json" style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void doImport(f);
            e.target.value = '';
          }}
        />
      </div>

      {editing && <RoutineEditor routine={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
