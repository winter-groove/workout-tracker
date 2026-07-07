import { useEffect, useState } from 'react';

export default function RestTimer({
  until, total, onSkip,
}: {
  until: number;
  total: number;
  onSkip: () => void;
}) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  const remain = Math.max(0, Math.ceil((until - now) / 1000));
  if (remain <= 0) return null;

  const mm = Math.floor(remain / 60);
  const ss = String(remain % 60).padStart(2, '0');
  const pct = Math.round((remain / total) * 100);

  return (
    <div className="rest">
      <span className="lbl">휴식</span>
      <span className="time">{mm}:{ss}</span>
      <div className="bar"><div style={{ width: `${pct}%` }} /></div>
      <button className="skip" onClick={onSkip}>건너뛰기</button>
    </div>
  );
}
