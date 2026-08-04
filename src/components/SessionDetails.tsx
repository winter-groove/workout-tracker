import { useEffect, useState } from 'react';
import type { Exercise, Session } from '../types';
import {
  fmtVolumeDelta, fmtWeightDelta, summarizeSession, type EntryProgress,
} from '../db/progress';
import { fmtWeightCell, fmtWeightLabel, unitFor } from '../db/weightUnit';

// 완료 세션의 운동별 세트 표 + 증감·PR 요약 (기록 탭·홈 달력 공용).
// 무게는 운동별 단위(unitFor)로 표시하되 lb면 kg 병기. 총볼륨은 소비처의 세션 행이 표시한다(sessionVolume).
// 요약은 마운트 단위로 로드 — 세션 전환 시 재마운트되므로 잔상/race 없음.
// 소비처 계약: 세션마다 재마운트되도록 렌더할 것(조건부 렌더 또는 key={session.id}) — 재마운트가 이전 세션 요약의 잔상 표시를 방지한다.
export default function SessionDetails({
  session, exMap,
}: {
  session: Session;
  exMap: Map<string, Exercise>;
}) {
  const [summaries, setSummaries] = useState<EntryProgress[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void summarizeSession(session).then((list) => {
      if (!cancelled) setSummaries(list);
    });
    return () => {
      cancelled = true;
    };
  }, [session.id]);

  return (
    <>
      {session.entries.map((e, i) => {
        const p = summaries?.[i];
        const u = unitFor(exMap.get(e.exerciseId));
        const line = p
          ? (p.prevVolume === undefined
              ? `볼륨 ${fmtWeightLabel(p.volume, u)} · 최고 ${fmtWeightLabel(p.maxWeight, u)} · 첫 기록`
              : `볼륨 ${fmtWeightLabel(p.volume, u)} ${fmtVolumeDelta(p.volume, p.prevVolume)} · 최고 ${fmtWeightLabel(p.maxWeight, u)} ${fmtWeightDelta(p.maxWeight, p.prevMaxWeight ?? 0, u)}`)
          : null;
        return (
          <div key={i} className="hist-row" style={{ display: 'block' }}>
            <div style={{ fontWeight: 700 }}>
              {exMap.get(e.exerciseId)?.name ?? '삭제된 운동'}{p?.isPR ? ' 🏆' : ''}
            </div>
            <div className="set-view d" style={{ marginTop: 6 }}>
              <span>세트</span><span>무게({u})</span><span>횟수</span>
            </div>
            {e.sets.map((set, j) => (
              <div key={j} className="set-view" style={{ marginTop: 4 }}>
                <span className="d">{j + 1}</span>
                <span>{fmtWeightCell(set.weight, u)}</span>
                <span>{set.reps}</span>
              </div>
            ))}
            {line && <div className="d" style={{ fontSize: 12, marginTop: 6 }}>{line}</div>}
          </div>
        );
      })}
    </>
  );
}
