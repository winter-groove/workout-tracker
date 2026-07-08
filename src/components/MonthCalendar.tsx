import { useState } from 'react';

const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

// month는 0-베이스. 월요일 시작 주 단위 그리드, 앞뒤 빈 칸은 null
export function monthGrid(year: number, month: number): (Date | null)[][] {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7; // 월=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function MonthCalendar({
  workoutDays, selectedDate, onSelectDate,
}: {
  workoutDays: Set<string>;
  selectedDate: Date | null;
  onSelectDate: (d: Date) => void;
}) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  function move(delta: number) {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }

  return (
    <>
      <div className="cal-head">
        <button aria-label="이전 달" onClick={() => move(-1)}>◀</button>
        <span>{viewYear}년 {viewMonth + 1}월</span>
        <button aria-label="다음 달" onClick={() => move(1)}>▶</button>
      </div>
      <div className="weekrow">
        {DAY_LABELS.map((l) => <div key={l} className="day">{l}</div>)}
      </div>
      {monthGrid(viewYear, viewMonth).map((week, wi) => (
        <div key={wi} className="weekrow" style={{ marginTop: 4 }}>
          {week.map((d, di) => {
            if (!d) return <div key={di} className="day"><div className="dot" style={{ visibility: 'hidden' }} /></div>;
            const done = workoutDays.has(dayKey(d));
            const isToday = sameDay(d, today);
            const isSelected = selectedDate !== null && sameDay(d, selectedDate);
            return (
              <div key={di} className="day">
                <button
                  className={`dot ${done ? 'on' : isToday ? 'today' : ''}${isSelected ? ' sel' : ''}`}
                  aria-label={`${viewMonth + 1}월 ${d.getDate()}일`}
                  onClick={() => onSelectDate(d)}
                >
                  {done ? '✓' : d.getDate()}
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
}
