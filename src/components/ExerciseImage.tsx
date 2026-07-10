import { useState } from 'react';
import type { Exercise } from '../types';
import ExerciseIcon from './ExerciseIcon';

export function exerciseImageUrl(ex: Exercise): string | undefined {
  return ex.imagePath ? import.meta.env.BASE_URL + ex.imagePath : undefined;
}

export default function ExerciseImage({ exercise, className }: { exercise: Exercise; className?: string }) {
  const [failed, setFailed] = useState(false);
  const url = exerciseImageUrl(exercise);
  if (url && !failed) {
    return (
      <img
        src={url} alt={exercise.name} className={className} loading="lazy"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <div className={className ?? 'thumb-icon'}>
      <ExerciseIcon iconKey={exercise.iconKey ?? 'barbell'} />
    </div>
  );
}
