import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { seedLibrary } from './db/exercises';
import './styles.css';

seedLibrary()
  .catch((e) => console.error('라이브러리 시딩 실패:', e))
  .finally(() => {
    ReactDOM.createRoot(document.getElementById('root')!).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  });
