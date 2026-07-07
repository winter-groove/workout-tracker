import type { IconKey } from '../types';

const PATHS: Record<IconKey, JSX.Element> = {
  barbell: (
    <>
      <line x1="2" y1="12" x2="22" y2="12" />
      <rect x="4" y="7" width="3" height="10" rx="1" />
      <rect x="17" y="7" width="3" height="10" rx="1" />
    </>
  ),
  dumbbell: (
    <>
      <rect x="3" y="10" width="5" height="4" rx="1" />
      <rect x="16" y="10" width="5" height="4" rx="1" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </>
  ),
  machine: (
    <>
      <rect x="5" y="4" width="14" height="16" rx="2" />
      <line x1="9" y1="9" x2="15" y2="9" />
      <line x1="9" y1="14" x2="15" y2="14" />
    </>
  ),
  cable: (
    <>
      <line x1="12" y1="2" x2="12" y2="10" />
      <circle cx="12" cy="13" r="3" />
      <path d="M9 16 L7 22 M15 16 L17 22" />
    </>
  ),
  bodyweight: (
    <>
      <circle cx="12" cy="5" r="2.5" />
      <line x1="12" y1="8" x2="12" y2="15" />
      <line x1="12" y1="10" x2="6" y2="13" />
      <line x1="12" y1="10" x2="18" y2="13" />
      <line x1="12" y1="15" x2="8" y2="21" />
      <line x1="12" y1="15" x2="16" y2="21" />
    </>
  ),
};

export default function ExerciseIcon({ iconKey, size = 30 }: { iconKey: IconKey; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24" width={size} height={size}
      stroke="#2563eb" fill="none" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round"
    >
      {PATHS[iconKey]}
    </svg>
  );
}
