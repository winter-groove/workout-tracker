import { useState } from 'react';
import type { Exercise } from '../types';
import ExerciseIcon from './ExerciseIcon';

// 일러스트가 있으면 그것만 렌더 — 실사(imagePath)는 더 이상 사용하지 않는다 (스펙: 실사 제거)
export function exerciseImageUrl(ex: Exercise): string | undefined {
  return ex.illustration ? import.meta.env.BASE_URL + ex.illustration : undefined;
}

export default function ExerciseImage({ exercise, className }: { exercise: Exercise; className?: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const url = exerciseImageUrl(exercise);
  if (url && failedUrl !== url) {
    return (
      <img
        src={url} alt={exercise.name} className={className} loading="lazy"
        onError={() => setFailedUrl(url)}
      />
    );
  }
  return (
    <div className={className ?? 'thumb-icon'}>
      <ExerciseIcon iconKey={exercise.iconKey ?? 'barbell'} />
    </div>
  );
}
