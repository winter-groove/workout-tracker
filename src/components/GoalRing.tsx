// 주간 목표 진행 링 (홈·기록 공용)
export default function GoalRing({ done, goal }: { done: number; goal: number }) {
  const pct = goal > 0 ? Math.min(1, done / goal) : 0;
  const C = 2 * Math.PI * 24;
  return (
    <svg width="58" height="58" viewBox="0 0 58 58" role="img" aria-label={`주간 목표 ${goal}회 중 ${done}회 완료`}>
      <circle cx="29" cy="29" r="24" fill="none" stroke="var(--border)" strokeWidth="7" />
      <circle
        cx="29" cy="29" r="24" fill="none" stroke="var(--accent)" strokeWidth="7" strokeLinecap="round"
        strokeDasharray={`${C * pct} ${C}`} transform="rotate(-90 29 29)"
      />
      <text x="29" y="34" textAnchor="middle" fontSize="15" fontWeight="800" fill="var(--text)">{done}/{goal}</text>
    </svg>
  );
}
