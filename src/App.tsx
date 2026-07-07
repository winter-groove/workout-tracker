import { HashRouter, Routes, Route, useLocation } from 'react-router-dom';
import TabBar from './components/TabBar';
import HomeScreen from './screens/HomeScreen';
import SessionScreen from './screens/SessionScreen';
import HistoryScreen from './screens/HistoryScreen';
import ManageScreen from './screens/ManageScreen';
import SummaryScreen from './screens/SummaryScreen';

function Shell() {
  const location = useLocation();
  const inSession = location.pathname === '/session';
  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/session" element={<SessionScreen />} />
        <Route path="/history" element={<HistoryScreen />} />
        <Route path="/manage" element={<ManageScreen />} />
        <Route path="/summary/:sessionId" element={<SummaryScreen />} />
      </Routes>
      {!inSession && <TabBar />}
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  );
}
