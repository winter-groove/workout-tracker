import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Exercise, Session, SetRecord } from '../types';
import {
  getActiveSession, saveSession, finishSession, discardSession, buildEntry,
} from '../db/sessions';
import { listExercises } from '../db/exercises';
import { getRestSeconds } from '../db/settings';
import {
  volume, maxWeight, fmtVolumeDelta, getPRWeight, getPreviousRecord,
} from '../db/progress';
import ExerciseImage from '../components/ExerciseImage';
import ExercisePicker, { dominantBodyPart } from '../components/ExercisePicker';
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

// 연속된 pairedWithNext로 이어지는 entry 인덱스 묶음. 마지막 entry의 flag는 무시(짝이 빠진 경우 자가 치유)
export function groupsOf(entries: { pairedWithNext?: boolean }[]): number[][] {
  const groups: number[][] = [];
  let cur: number[] = [];
  entries.forEach((e, i) => {
    cur.push(i);
    if (!e.pairedWithNext || i === entries.length - 1) {
      groups.push(cur);
      cur = [];
    }
  });
  return groups;
}

interface ExerciseRecord {
  last?: SetRecord[];
  pr: number;
}

export default function SessionScreen() {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [idx, setIdx] = useState(0);
  const [restUntil, setRestUntil] = useState(0);
  const [restTotal, setRestTotal] = useState(90);
  const [showPicker, setShowPicker] = useState(false);
  const [records, setRecords] = useState<Map<string, ExerciseRecord>>(new Map());
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

  const groups = session ? groupsOf(session.entries) : [];
  const gPos = groups.findIndex((g) => g.includes(idx));
  const group = gPos >= 0 ? groups[gPos] : [];
  const groupIds = session ? group.map((i) => session.entries[i].exerciseId) : [];
  const groupKey = groupIds.join('|');

  useEffect(() => {
    if (!session || groupIds.length === 0) {
      setRecords(new Map());
      return;
    }
    // 같은 밀리초에 생성된 직전 세션을 놓치지 않도록 +1ms 여유
    const before = session.startedAt + 1;
    let cancelled = false;
    void Promise.all(
      [...new Set(groupIds)].map(async (id) => {
        const [last, pr] = await Promise.all([
          getPreviousRecord(id, before),
          getPRWeight(id, before),
        ]);
        return [id, { last, pr }] as const;
      }),
    ).then((pairs) => {
      if (!cancelled) setRecords(new Map(pairs));
    });
    return () => {
      cancelled = true;
    };
  }, [groupKey, session?.startedAt]);

  if (!session) return null;

  async function update(next: Session) {
    setSession(next);
    await saveSession(next);
  }

  function patchSet(entryIdx: number, setIdx: number, patch: Partial<SetRecord>) {
    if (!session) return;
    const entries = session.entries.map((e, i) =>
      i !== entryIdx ? e : { ...e, sets: e.sets.map((s, j) => (j !== setIdx ? s : { ...s, ...patch })) },
    );
    void update({ ...session, entries });
  }

  function toggleSet(entryIdx: number, setIdx: number) {
    if (!session) return;
    const s = session.entries[entryIdx].sets[setIdx];
    if (s.completedAt) {
      patchSet(entryIdx, setIdx, { completedAt: undefined });
    } else {
      patchSet(entryIdx, setIdx, { completedAt: Date.now() });
      const restSec = getRestSeconds();
      setRestTotal(restSec);
      setRestUntil(Date.now() + restSec * 1000);
    }
  }

  function addSet(entryIdx: number) {
    if (!session) return;
    const target = session.entries[entryIdx];
    const last = target.sets[target.sets.length - 1] ?? { weight: 0, reps: 10 };
    const entries = session.entries.map((e, i) =>
      i !== entryIdx ? e : { ...e, sets: [...e.sets, { weight: last.weight, reps: last.reps }] },
    );
    void update({ ...session, entries });
  }

  function removeSet(entryIdx: number) {
    if (!session) return;
    const target = session.entries[entryIdx];
    if (target.sets.length <= 1) return;
    const last = target.sets[target.sets.length - 1];
    if (last.completedAt && !window.confirm('완료한 세트예요. 삭제할까요?')) return;
    const entries = session.entries.map((e, i) =>
      i !== entryIdx ? e : { ...e, sets: e.sets.slice(0, -1) },
    );
    void update({ ...session, entries });
  }

  function removeEntry(entryIdx: number) {
    if (!session) return;
    const target = session.entries[entryIdx];
    const hasDone = target.sets.some((s) => s.completedAt !== undefined);
    const msg = hasDone ? '완료한 세트가 있어요. 이 운동을 뺄까요?' : '이 운동을 뺄까요?';
    if (!window.confirm(msg)) return;
    // 그룹 마지막을 빼면 직전 flag 해제(엉뚱한 다음 운동과 묶임 방지), 중간이면 유지(그룹 축소)
    const entries = session.entries
      .map((e, i) =>
        i === entryIdx - 1 && !target.pairedWithNext && e.pairedWithNext
          ? { ...e, pairedWithNext: undefined }
          : e,
      )
      .filter((_, i) => i !== entryIdx);
    void update({ ...session, entries });
    const nextGroups = groupsOf(entries);
    const fallback = nextGroups.find((g) => g.includes(Math.min(idx, entries.length - 1)));
    setIdx(fallback ? fallback[0] : 0);
  }

  function pairWithNext() {
    if (!session || group.length === 0) return;
    const lastIdx = group[group.length - 1];
    if (lastIdx >= session.entries.length - 1) return;
    const entries = session.entries.map((e, i) =>
      i === lastIdx ? { ...e, pairedWithNext: true } : e,
    );
    void update({ ...session, entries });
  }

  function unpair() {
    if (!session) return;
    const inGroup = new Set(group);
    const entries = session.entries.map((e, i) =>
      inGroup.has(i) && e.pairedWithNext ? { ...e, pairedWithNext: undefined } : e,
    );
    void update({ ...session, entries });
  }

  async function addExercise(ex: Exercise) {
    if (!session) return;
    setShowPicker(false);
    const newEntry = await buildEntry(ex.id, 3, session.startedAt + 1);
    const next = { ...session, entries: [...session.entries, newEntry] };
    await update(next);
    setIdx(next.entries.length - 1);
  }

  async function finish() {
    if (!session) return;
    const doneCount = session.entries.flatMap((e) => e.sets).filter((s) => s.completedAt).length;
    if (doneCount === 0) {
      if (window.confirm('완료한 세트가 없어요. 세션을 버릴까요? 되돌릴 수 없어요.')) {
        await discardSession(session.id);
        navigate('/', { replace: true });
      }
      return;
    }
    if (!window.confirm('운동을 완료할까요?')) return;
    await finishSession(session);
    navigate(`/summary/${session.id}`, { replace: true });
  }

  const total = groups.length;
  const startDate = new Date(session.startedAt);
  const isBackdated = startDate.toDateString() !== new Date(now).toDateString();
  const canPair = group.length > 0 && group[group.length - 1] < session.entries.length - 1;

  return (
    <>
      <div className="topnav">
        <button onClick={finish} aria-label="세션 종료">✕</button>
        <span className="title">{session.routineName ?? '오늘 운동'} · <span>{total > 0 ? `${gPos + 1} / ${total}` : '운동 없음'}</span></span>
        <span className="clock">
          {isBackdated ? `${startDate.getMonth() + 1}/${startDate.getDate()}` : fmtElapsed(session.startedAt, now)}
        </span>
      </div>
      <div className="progressbar">
        <div style={{ width: total > 0 ? `${((gPos + 1) / total) * 100}%` : '0%' }} />
      </div>
      <div className="screen">
        {group.length > 0 ? (
          group.map((entryIdx) => {
            const e = session.entries[entryIdx];
            const gex = exMap.get(e.exerciseId);
            const rec = records.get(e.exerciseId);
            const doneSets = e.sets.filter((s) => s.completedAt !== undefined);
            const curVol = volume(doneSets);
            const lastVol = rec?.last ? volume(rec.last) : 0;
            const isPRNow = rec?.last !== undefined && maxWeight(doneSets) > (rec?.pr ?? 0);
            const overloadText = curVol > lastVol
              ? `볼륨 ${curVol}kg ${fmtVolumeDelta(curVol, lastVol)}`
              : `볼륨 ${curVol} / 지난 ${lastVol}kg`;
            return (
              <div key={entryIdx} className="card">
                {group.length === 1 && gex && <ExerciseImage exercise={gex} className="hero-img" />}
                <div className="ex-name">{gex?.name ?? '삭제된 운동'}</div>
                <div className="tags">
                  {gex && <span className="tag">{gex.bodyPart}</span>}
                  {gex && <span className="tag">{gex.equipment}</span>}
                  <button
                    className="btn-sm btn btn-ghost" style={{ marginLeft: 'auto' }}
                    onClick={() => removeEntry(entryIdx)}
                  >
                    운동 빼기
                  </button>
                </div>
                {rec?.last && <div className="last-pill" style={{ marginTop: 10 }}>🔥 지난번 {fmtLast(rec.last)}</div>}
                {rec?.last && (
                  <div className="last-pill" style={{ marginTop: 6, marginLeft: 6 }}>
                    📈 {overloadText}{isPRNow ? ' · 🏆 PR!' : ''}
                  </div>
                )}
                <div className="set-head" style={{ marginTop: 10 }}>
                  <span>세트</span><span>무게(kg)</span><span>횟수</span><span>완료</span>
                </div>
                {e.sets.map((s, j) => (
                  <div key={j} className={`set-row ${s.completedAt ? 'done' : ''}`} style={{ marginTop: 8 }}>
                    <span className="n">{j + 1}</span>
                    <input
                      type="number" inputMode="decimal" step="0.5" min="0"
                      aria-label={`세트 ${j + 1} 무게`}
                      value={s.weight === 0 ? '' : s.weight}
                      placeholder="0"
                      onFocus={(ev) => ev.currentTarget.select()}
                      onChange={(ev) => patchSet(entryIdx, j, { weight: Number(ev.target.value) || 0 })}
                    />
                    <input
                      type="number" inputMode="numeric" min="0"
                      aria-label={`세트 ${j + 1} 횟수`}
                      value={s.reps}
                      onFocus={(ev) => ev.currentTarget.select()}
                      onChange={(ev) => patchSet(entryIdx, j, { reps: Number(ev.target.value) || 0 })}
                    />
                    <button
                      className="chk" aria-label={`세트 ${j + 1} 완료`}
                      onClick={() => toggleSet(entryIdx, j)}
                    >
                      ✓
                    </button>
                  </div>
                ))}
                <div className="btn-row" style={{ marginTop: 10 }}>
                  <button className="btn btn-ghost" onClick={() => addSet(entryIdx)}>＋ 세트 추가</button>
                  <button
                    className="btn btn-ghost" disabled={e.sets.length <= 1} onClick={() => removeSet(entryIdx)}
                  >
                    − 세트 삭제
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <div className="empty">아래에서 운동을 추가해 시작하세요</div>
        )}
        <div className="btn-row">
          <button className="btn btn-ghost" onClick={() => setShowPicker(true)}>＋ 운동 추가</button>
          {canPair && (
            <button className="btn btn-ghost" onClick={pairWithNext}>🔗 다음 운동과 묶기</button>
          )}
          {group.length >= 2 && (
            <button className="btn btn-ghost" onClick={unpair}>묶기 해제</button>
          )}
        </div>
        <RestTimer until={restUntil} total={restTotal} onSkip={() => setRestUntil(0)} />
        <div className="btn-row">
          <button className="btn btn-ghost" disabled={gPos <= 0} onClick={() => setIdx(groups[gPos - 1][0])}>이전</button>
          {gPos < total - 1 ? (
            <button className="btn btn-primary" onClick={() => setIdx(groups[gPos + 1][0])}>다음 운동</button>
          ) : (
            <button className="btn btn-primary" style={{ background: 'var(--green)' }} onClick={finish}>운동 완료</button>
          )}
        </div>
      </div>
      {showPicker && (
        <ExercisePicker
          initialFilter={
            dominantBodyPart(
              session.entries
                .map((e) => exMap.get(e.exerciseId))
                .filter((e): e is Exercise => e !== undefined),
            ) ?? '전체'
          }
          onSelect={addExercise}
          onClose={() => setShowPicker(false)}
        />
      )}
    </>
  );
}
