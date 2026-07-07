import { NavLink } from 'react-router-dom';

export default function TabBar() {
  const cls = ({ isActive }: { isActive: boolean }) => (isActive ? 'active' : '');
  return (
    <nav className="tabbar">
      <NavLink to="/" className={cls} end>
        <span className="ic">🏠</span>홈
      </NavLink>
      <NavLink to="/history" className={cls}>
        <span className="ic">📅</span>기록
      </NavLink>
      <NavLink to="/manage" className={cls}>
        <span className="ic">⚙️</span>관리
      </NavLink>
    </nav>
  );
}
