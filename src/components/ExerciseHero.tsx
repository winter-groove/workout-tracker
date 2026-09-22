import { useEffect, useMemo, useState } from 'react';
import type { Exercise } from '../types';
import ExerciseIcon from './ExerciseIcon';
import MuscleMap from './MuscleMap';

const FRAME_MS = 450;
const SEQ = [0, 1, 2, 1]; // 핑퐁: 1→2→3→2

// 세션 히어로: 동작 3프레임 핑퐁 + 근육맵. 프레임 상태는 이 컴포넌트 내부 — 부모 재렌더 유발 금지.
export default function ExerciseHero({ exercise }: { exercise: Exercise }) {
  const urls = useMemo(() => {
    if (!exercise.illustration) return [];
    const base = import.meta.env.BASE_URL + exercise.illustration.replace(/\.svg$/, '');
    return [`${base}.svg`, `${base}-2.svg`, `${base}-3.svg`];
  }, [exercise.illustration]);
  const [step, setStep] = useState(0);
  const [dead, setDead] = useState<Set<number>>(new Set());

  const reduced = typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 운동이 바뀌면 애니 상태 초기화 — 인스턴스 재사용 시 이전 운동의 죽은 프레임/위상 잔존 방지
  useEffect(() => {
    setStep(0);
    setDead(new Set());
  }, [exercise.id]);

  useEffect(() => {
    if (urls.length === 0 || reduced) return;
    const t = setInterval(() => {
      if (document.hidden) return; // 백그라운드 일시정지
      setStep((s) => (s + 1) % SEQ.length);
    }, FRAME_MS);
    return () => clearInterval(t);
  }, [urls.length, reduced]);

  // 로드 실패 프레임은 순환에서 제외 — 현재 스텝이 죽은 프레임이면 살아있는 프레임 중 첫 번째 표시
  const liveFrame = (() => {
    const want = SEQ[step];
    if (!dead.has(want)) return want;
    const alive = [0, 1, 2].filter((i) => !dead.has(i));
    return alive.length > 0 ? alive[0] : -1;
  })();

  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
      {urls.length > 0 && liveFrame >= 0 ? (
        <div style={{ position: 'relative', flex: 1, height: 170, background: 'var(--surface-2)', borderRadius: 14, padding: 10 }}>
          {urls.map((u, i) => (
            <img
              key={u} src={u} alt={i === 0 ? `${exercise.name} 동작` : ''} aria-hidden={i !== 0}
              style={{
                position: 'absolute', inset: 10, width: 'calc(100% - 20px)', height: 'calc(100% - 20px)',
                objectFit: 'contain', opacity: i === liveFrame ? 1 : 0, transition: 'opacity 120ms linear',
              }}
              onError={() => setDead((d) => new Set(d).add(i))}
            />
          ))}
        </div>
      ) : (
        <div className="hero-icon" style={{ flex: 1, height: 170 }}>
          <ExerciseIcon iconKey={exercise.iconKey ?? 'barbell'} />
        </div>
      )}
      <div style={{ width: 108, background: 'var(--bg)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8 }}>
        <MuscleMap muscles={exercise.muscles} bodyPart={exercise.bodyPart} />
      </div>
    </div>
  );
}
