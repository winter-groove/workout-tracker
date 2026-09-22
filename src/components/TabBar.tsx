import { NavLink } from 'react-router-dom';

export default function TabBar() {
  const cls = ({ isActive }: { isActive: boolean }) => (isActive ? 'active' : '');
  return (
    <nav className="tabbar">
      <NavLink to="/" className={cls} end>
        <span className="ic">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/></svg>
        </span>
        홈
      </NavLink>
      <NavLink to="/history" className={cls}>
        <span className="ic">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 20V5"/><path d="M4 20h16"/><path d="M9 16v-5M14 16V8M19 16v-3"/></svg>
        </span>
        기록
      </NavLink>
      <NavLink to="/manage" className={cls}>
        <span className="ic">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="8.5" r="3.4"/><path d="M5 20c1.5-3.4 4-5 7-5s5.5 1.6 7 5"/></svg>
        </span>
        마이
      </NavLink>
    </nav>
  );
}
