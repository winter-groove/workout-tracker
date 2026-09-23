import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { seedLibrary } from './db/exercises';
import './styles.css';

// 삭제된 실사 이미지의 구 런타임 캐시 정리 — 없으면 no-op
if ('caches' in window) void caches.delete('exercise-images').catch(() => {});

seedLibrary()
  .catch((e) => console.error('라이브러리 시딩 실패:', e))
  .finally(() => {
    ReactDOM.createRoot(document.getElementById('root')!).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  });
