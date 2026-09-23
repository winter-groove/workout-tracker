import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Exercise, Session, SetRecord } from '../types';
import {
  getActiveSession, saveSession, finishSession, discardSession, buildEntry, sessionTitle, setLabels, seedForNewSet,
} from '../db/sessions';
import { listExercises, setExerciseUnit } from '../db/exercises';
import { getRestSeconds } from '../db/settings';
import {
  volume, maxWeight, fmtVolumeDelta, getPRWeight, getPreviousRecord,
} from '../db/progress';
import { kgToDisplay, displayToKg, unitFor, dropWeight, stepFor, type WeightUnit } from '../db/weightUnit';
import ExerciseHero from '../components/ExerciseHero';
import ExercisePicker, { dominantBodyPart } from '../components/ExercisePicker';
import RestTimer from '../components/RestTimer';

// 집중 존 무게 스텝(플레이트 단위) — 입력칸 미세 스텝(stepFor)과 별개
const FOCUS_STEP: Record<WeightUnit, number> = { kg: 2.5, lb: 5 };

function fmtElapsed(startedAt: number, now: number): string {
  const sec = Math.max(0, Math.floor((now - startedAt) / 1000));
  const mm = String(Math.floor(sec / 60)).padStart(2, '0');
  const ss = String(sec % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function fmtLast(sets: SetRecord[], unit: WeightUnit): string {
  return sets
    .map((s, i) => {
      const w = kgToDisplay(s.weight, unit);
      return `${s.isDrop ? '↓' : ''}${i === 0 ? `${w}${unit}` : `${w}`}×${s.reps}`;
    })
    .join(' · ');
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

function doneCountOf(session: Session): number {
  return session.entries.flatMap((e) => e.sets).filter((s) => s.completedAt !== undefined).length;
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
  const [exitOpen, setExitOpen] = useState(false);
  const [focusSel, setFocusSel] = useState<{ entryIdx: number; setIdx: number } | null>(null);
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
      // 뒤에 드랍이 이어지면 쉬지 않고 바로 진행 — 휴식은 드랍 체인이 끝난 뒤
      if (session.entries[entryIdx].sets[setIdx + 1]?.isDrop) return;
      const restSec = getRestSeconds();
      setRestTotal(restSec);
      setRestUntil(Date.now() + restSec * 1000);
    }
  }

  // 카드의 포커스 세트: 사용자가 고른 세트 > 첫 미완료 세트 > 마지막 세트
  function focusedSetIdx(entryIdx: number): number {
    if (!session) return 0;
    const sets = session.entries[entryIdx].sets;
    if (focusSel && focusSel.entryIdx === entryIdx && focusSel.setIdx < sets.length) return focusSel.setIdx;
    const firstOpen = sets.findIndex((s) => s.completedAt === undefined);
    return firstOpen === -1 ? sets.length - 1 : firstOpen;
  }

  function bumpFocused(entryIdx: number, field: 'weight' | 'reps', deltaDisplay: number, u: WeightUnit) {
    if (!session) return;
    const j = focusedSetIdx(entryIdx);
    const s = session.entries[entryIdx].sets[j];
    if (field === 'weight') {
      const next = Math.max(0, kgToDisplay(s.weight, u) + deltaDisplay);
      patchSet(entryIdx, j, { weight: displayToKg(next, u) });
    } else {
      patchSet(entryIdx, j, { reps: Math.max(0, s.reps + deltaDisplay) });
    }
  }

  function completeFocused(entryIdx: number) {
    if (!session) return;
    const j = focusedSetIdx(entryIdx);
    if (session.entries[entryIdx].sets[j].completedAt !== undefined) {
      setFocusSel(null); // 완료된 세트에 갇히지 않게 파생 포커스로 복귀
      return;
    }
    setFocusSel(null); // 완료 후엔 파생 포커스(다음 미완료)로
    toggleSet(entryIdx, j);
  }

  function addSet(entryIdx: number) {
    if (!session) return;
    const seed = seedForNewSet(session.entries[entryIdx].sets);
    const entries = session.entries.map((e, i) =>
      i !== entryIdx ? e : { ...e, sets: [...e.sets, { weight: seed.weight, reps: seed.reps }] },
    );
    void update({ ...session, entries });
  }

  function addDrop(entryIdx: number, unit: WeightUnit) {
    if (!session) return;
    const target = session.entries[entryIdx];
    const last = target.sets[target.sets.length - 1];
    if (!last) return;
    const entries = session.entries.map((e, i) =>
      i !== entryIdx
        ? e
        : {
            ...e,
            sets: [...e.sets, { weight: dropWeight(last.weight, unit), reps: last.reps, isDrop: true }],
          },
    );
    void update({ ...session, entries });
  }

  function removeSet(entryIdx: number) {
    if (!session) return;
    const target = session.entries[entryIdx];
    if (target.sets.length <= 1) {
      removeEntry(entryIdx, '마지막 세트예요. 이 운동 자체를 뺄까요?');
      return;
    }
    const last = target.sets[target.sets.length - 1];
    if (last.completedAt && !window.confirm('완료한 세트예요. 삭제할까요?')) return;
    const entries = session.entries.map((e, i) =>
      i !== entryIdx ? e : { ...e, sets: e.sets.slice(0, -1) },
    );
    void update({ ...session, entries });
    setFocusSel(null);
  }

  function removeEntry(entryIdx: number, msg?: string) {
    if (!session) return;
    const target = session.entries[entryIdx];
    const hasDone = target.sets.some((s) => s.completedAt !== undefined);
    if (!window.confirm(msg ?? (hasDone ? '완료한 세트가 있어요. 이 운동을 뺄까요?' : '이 운동을 뺄까요?'))) return;
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
    setFocusSel(null);
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
    setFocusSel(null);
  }

  async function finish() {
    if (!session) return;
    const count = doneCountOf(session);
    if (count === 0) {
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

  async function completeAndLeave() {
    if (!session) return;
    await finishSession(session);
    navigate(`/summary/${session.id}`, { replace: true });
  }

  async function discardAndLeave() {
    if (!session) return;
    await discardSession(session.id);
    navigate('/', { replace: true });
  }

  const total = groups.length;
  const doneCount = doneCountOf(session);
  const startDate = new Date(session.startedAt);
  const isBackdated = startDate.toDateString() !== new Date(now).toDateString();
  const canPair = group.length > 0 && group[group.length - 1] < session.entries.length - 1;

  return (
    <>
      <div className="topnav">
        <button onClick={() => setExitOpen(true)} aria-label="세션 종료">✕</button>
        <span className="title">{sessionTitle(session, exMap)} · <span>{total > 0 ? `${gPos + 1} / ${total}` : '운동 없음'}</span></span>
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
            const u = unitFor(gex);
            const labels = setLabels(e.sets);
            const rec = records.get(e.exerciseId);
            const doneSets = e.sets.filter((s) => s.completedAt !== undefined);
            const curVol = volume(doneSets);
            const lastVol = rec?.last ? volume(rec.last) : 0;
            const isPRNow = rec?.last !== undefined && maxWeight(doneSets) > (rec?.pr ?? 0);
            const overloadText = curVol > lastVol
              ? `볼륨 ${kgToDisplay(curVol, u)}${u} ${fmtVolumeDelta(curVol, lastVol)}`
              : `볼륨 ${kgToDisplay(curVol, u)} / 지난 ${kgToDisplay(lastVol, u)}${u}`;
            return (
              <div key={entryIdx} className="card">
                {group.length === 1 && gex && <ExerciseHero exercise={gex} />}
                <div className="ex-name">{gex?.name ?? '삭제된 운동'}</div>
                <div className="tags">
                  {gex && <span className="tag">{gex.bodyPart}</span>}
                  {gex && <span className="tag">{gex.equipment}</span>}
                  {gex && (
                    <button
                      className="btn-sm btn btn-ghost" style={{ marginLeft: 'auto' }}
                      aria-label={`${gex.name} 단위 전환`}
                      onClick={() => void setExerciseUnit(gex.id, u === 'kg' ? 'lb' : 'kg')}
                    >
                      {u} ⇄
                    </button>
                  )}
                  <button
                    className="btn-sm btn btn-ghost"
                    style={gex ? undefined : { marginLeft: 'auto' }}
                    onClick={() => removeEntry(entryIdx)}
                  >
                    운동 빼기
                  </button>
                </div>
                {rec?.last && <div className="last-pill" style={{ marginTop: 10 }}>🔥 지난번 {fmtLast(rec.last, u)}</div>}
                {rec?.last && (
                  <div className="last-pill" style={{ marginTop: 6, marginLeft: 6 }}>
                    📈 {overloadText}{isPRNow ? ' · 🏆 PR!' : ''}
                  </div>
                )}
                {e.sets.length > 0 && (() => {
                  const fj = focusedSetIdx(entryIdx);
                  const fs = e.sets[fj];
                  const allDone = e.sets.every((s) => s.completedAt !== undefined);
                  return (
                    <div className="focus-zone" role="group" aria-label="현재 세트">
                      <div className="fz-label">세트 {labels[fj]}{fs.isDrop ? ' · 드랍' : ''}</div>
                      <div className="fz-row">
                        <button className="fz-step" aria-label={`무게 ${FOCUS_STEP[u]}${u} 내리기`} onClick={() => bumpFocused(entryIdx, 'weight', -FOCUS_STEP[u], u)}>−</button>
                        <span className="fz-num">{kgToDisplay(fs.weight, u)}<span className="fz-unit">{u}</span></span>
                        <button className="fz-step" aria-label={`무게 ${FOCUS_STEP[u]}${u} 올리기`} onClick={() => bumpFocused(entryIdx, 'weight', FOCUS_STEP[u], u)}>＋</button>
                      </div>
                      <div className="fz-row">
                        <button className="fz-step" aria-label="횟수 1 내리기" onClick={() => bumpFocused(entryIdx, 'reps', -1, u)}>−</button>
                        <span className="fz-num">{fs.reps}<span className="fz-unit">회</span></span>
                        <button className="fz-step" aria-label="횟수 1 올리기" onClick={() => bumpFocused(entryIdx, 'reps', 1, u)}>＋</button>
                      </div>
                      <div className="fz-dots" role="img" aria-label={`세트 진행 ${e.sets.filter((s) => s.completedAt !== undefined).length} / ${e.sets.length}`}>
                        {e.sets.map((s, j) => (
                          <span key={j} className={`fd${s.completedAt !== undefined ? ' done' : ''}${j === fj ? ' cur' : ''}${s.isDrop ? ' drop' : ''}`} />
                        ))}
                      </div>
                      <button className="fz-go" disabled={allDone} onClick={() => completeFocused(entryIdx)}>
                        {allDone ? '모든 세트 완료' : '세트 완료'}
                      </button>
                    </div>
                  );
                })()}
                <div className="set-head" style={{ marginTop: 10 }}>
                  <span>세트</span><span>무게({u})</span><span>횟수</span><span>완료</span>
                </div>
                {e.sets.map((s, j) => (
                  <div key={j} className={`set-row ${s.completedAt ? 'done' : ''}`} style={{ marginTop: 8 }}>
                    <button
                      className={`n-btn${focusedSetIdx(entryIdx) === j ? ' on' : ''}`}
                      aria-label={`세트 ${labels[j]} 선택`}
                      onClick={() => setFocusSel({ entryIdx, setIdx: j })}
                    >
                      {labels[j]}
                    </button>
                    <input
                      type="number" inputMode="decimal" step={stepFor(u)} min="0"
                      aria-label={`세트 ${labels[j]} 무게`}
                      value={s.weight === 0 ? '' : kgToDisplay(s.weight, u)}
                      placeholder="0"
                      onFocus={(ev) => ev.currentTarget.select()}
                      onChange={(ev) => patchSet(entryIdx, j, { weight: displayToKg(Number(ev.target.value) || 0, u) })}
                    />
                    <input
                      type="number" inputMode="numeric" min="0"
                      aria-label={`세트 ${labels[j]} 횟수`}
                      value={s.reps}
                      onFocus={(ev) => ev.currentTarget.select()}
                      onChange={(ev) => patchSet(entryIdx, j, { reps: Number(ev.target.value) || 0 })}
                    />
                    <button
                      className="chk" aria-label={`세트 ${labels[j]} 완료`}
                      onClick={() => toggleSet(entryIdx, j)}
                    >
                      ✓
                    </button>
                  </div>
                ))}
                <div className="btn-row tight" style={{ marginTop: 10 }}>
                  <button className="btn btn-ghost" onClick={() => addSet(entryIdx)}>＋ 세트 추가</button>
                  <button
                    className="btn btn-ghost" disabled={e.sets.length === 0}
                    onClick={() => addDrop(entryIdx, u)}
                  >
                    ↓ 드랍 추가
                  </button>
                  <button
                    className="btn btn-ghost" onClick={() => removeSet(entryIdx)}
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
      {exitOpen && (
        <div className="sheet-backdrop" onClick={() => setExitOpen(false)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="exit-title" onClick={(e) => e.stopPropagation()}>
            <div id="exit-title" className="sheet-title">{doneCount > 0 ? '운동을 끝낼까요?' : '완료한 세트가 없어요'}</div>
            <div className="sheet-body">{doneCount > 0 ? `완료한 세트 ${doneCount}개가 기록돼요.` : '이 세션을 버리면 되돌릴 수 없어요.'}</div>
            {doneCount > 0 && <button className="btn btn-primary" onClick={completeAndLeave}>운동 완료</button>}
            <button className="btn btn-danger" onClick={discardAndLeave}>{doneCount > 0 ? '기록 버리고 나가기' : '세션 버리기'}</button>
            <button className="btn btn-ghost" onClick={() => setExitOpen(false)}>계속하기</button>
          </div>
        </div>
      )}
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
