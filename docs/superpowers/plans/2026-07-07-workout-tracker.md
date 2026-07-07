# 운동 기록 앱 (Workout Tracker) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 점진적 과부하를 위한 개인용 운동 기록 PWA — 세트별 무게×횟수 기록, 지난 기록 미리 채우기, 루틴 템플릿, 자동 휴식 타이머, 완전 오프라인 동작.

**Architecture:** React SPA(HashRouter, 탭 4화면) + Dexie(IndexedDB) 로컬 저장. 내장 운동 라이브러리는 free-exercise-db에서 스크립트로 이미지를 받아 앱에 번들. vite-plugin-pwa로 오프라인 캐시/홈화면 설치. 서버 없음.

**Tech Stack:** React 18 + TypeScript + Vite 5, Dexie 4 + dexie-react-hooks, react-router-dom 6, vite-plugin-pwa, Vitest + fake-indexeddb + Testing Library, sharp(빌드 스크립트용).

**Spec:** `docs/superpowers/specs/2026-07-07-workout-tracker-design.md`

## Global Constraints

- 모든 UI 문구는 한국어. 무게 단위 kg 고정.
- 포인트 컬러 `#3182F6`, 다크 네이비 `#191F28`, 배경 `#F2F4F6` (승인된 목업 기준).
- 런타임에 외부 네트워크 요청 금지 — 이미지·데이터 전부 번들. (이미지 다운로드는 빌드 전 스크립트에서만.)
- TypeScript `strict: true`. 테스트는 `npm test`(vitest run)로 통과해야 함.
- `vite.config.ts`의 `base: './'` + HashRouter 유지 (어떤 정적 호스팅 경로에서도 동작).
- 휴식 타이머 기본 90초, 설정에서 변경 가능.
- 세트 완료 체크마다 즉시 IndexedDB 저장 (앱 종료 후 복구 가능해야 함).
- 커밋 메시지는 conventional commits (`feat:`, `test:`, `chore:` …).

---

### Task 1: 프로젝트 스캐폴드

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.gitignore`(수정), `src/main.tsx`, `src/App.tsx`, `src/styles.css`, `src/test/setup.ts`, `src/App.test.tsx`

**Interfaces:**
- Produces: 실행 가능한 Vite 개발 서버, `npm test` 동작, 전체 앱이 쓸 CSS 클래스(styles.css). 이후 모든 태스크가 이 위에 쌓임.

- [ ] **Step 1: package.json 작성**

```json
{
  "name": "workout-tracker",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "fetch-images": "node scripts/fetch-exercise-images.mjs",
    "icons": "node scripts/generate-icons.mjs",
    "deploy": "npm run build && gh-pages -d dist"
  },
  "dependencies": {
    "dexie": "^4.0.8",
    "dexie-react-hooks": "^1.1.7",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.2"
  },
  "devDependencies": {
    "@testing-library/dom": "^10.4.0",
    "@testing-library/jest-dom": "^6.5.0",
    "@testing-library/react": "^16.0.1",
    "@types/react": "^18.3.8",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "fake-indexeddb": "^6.0.0",
    "gh-pages": "^6.1.1",
    "jsdom": "^25.0.0",
    "sharp": "^0.33.5",
    "typescript": "~5.6.2",
    "vite": "^5.4.6",
    "vite-plugin-pwa": "^0.20.5",
    "vitest": "^2.1.1"
  }
}
```

- [ ] **Step 2: tsconfig.json 작성**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src"]
}
```

- [ ] **Step 3: vite.config.ts 작성**

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      manifest: {
        name: '운동기록',
        short_name: '운동기록',
        description: '점진적 과부하를 위한 운동 기록',
        lang: 'ko',
        theme_color: '#3182F6',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
});
```

- [ ] **Step 4: index.html 작성**

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, user-scalable=no" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="theme-color" content="#3182F6" />
    <title>운동기록</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: src/styles.css 작성 (전체 앱 공용 스타일 — 이후 태스크의 컴포넌트가 이 클래스들을 사용)**

```css
:root {
  --blue: #3182f6;
  --blue-bg: #ebf3fe;
  --navy: #191f28;
  --gray-9: #191f28;
  --gray-7: #4e5968;
  --gray-5: #8b95a1;
  --gray-3: #d1d6db;
  --gray-2: #e5e8eb;
  --gray-1: #f2f4f6;
  --green: #00a86b;
  --green-bg: #e8f7f0;
  --red: #f04452;
  --radius: 16px;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Pretendard', sans-serif;
  background: var(--gray-1);
  color: var(--gray-9);
  -webkit-tap-highlight-color: transparent;
}
#root { height: 100%; }
button { font: inherit; border: none; background: none; cursor: pointer; color: inherit; }
input, select { font: inherit; }

.app { max-width: 480px; margin: 0 auto; min-height: 100dvh; display: flex; flex-direction: column; }
.screen { flex: 1; padding: 16px 16px 90px; display: flex; flex-direction: column; gap: 14px; }
.screen-title { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; padding-top: 8px; }

.card { background: #fff; border-radius: var(--radius); padding: 16px; box-shadow: 0 1px 4px rgba(25,31,40,0.06); }
.card-h { font-size: 13px; font-weight: 800; color: var(--gray-7); margin-bottom: 10px; }

.btn { display: block; width: 100%; text-align: center; padding: 14px; border-radius: 14px; font-size: 15px; font-weight: 800; }
.btn-primary { background: var(--blue); color: #fff; }
.btn-ghost { background: var(--gray-1); color: var(--gray-7); }
.btn-danger { background: #fee; color: var(--red); }
.btn-row { display: flex; gap: 8px; }
.btn-row .btn { flex: 1; }
.btn-sm { display: inline-block; width: auto; padding: 8px 14px; font-size: 13px; border-radius: 10px; }

.tag { font-size: 11px; font-weight: 600; color: var(--blue); background: var(--blue-bg); border-radius: 6px; padding: 3px 8px; }
.last-pill { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; color: var(--green); background: var(--green-bg); border-radius: 8px; padding: 6px 10px; }

.tabbar { position: fixed; bottom: 0; left: 0; right: 0; max-width: 480px; margin: 0 auto; display: flex; background: #fff; border-top: 1px solid var(--gray-1); padding: 8px 0 max(20px, env(safe-area-inset-bottom)); z-index: 10; }
.tabbar a { flex: 1; text-align: center; font-size: 10.5px; font-weight: 700; color: #b0b8c1; text-decoration: none; }
.tabbar a.active { color: var(--gray-9); }
.tabbar .ic { font-size: 20px; display: block; margin-bottom: 3px; }

.startcard { background: linear-gradient(135deg, #3182f6, #4f46e5); border-radius: 20px; padding: 18px; color: #fff; }
.startcard .t { font-size: 17px; font-weight: 800; }
.startcard .s { font-size: 12.5px; opacity: 0.85; margin-top: 4px; }
.startcard .go { margin-top: 14px; background: #fff; color: var(--blue); border-radius: 12px; text-align: center; padding: 11px; font-size: 14px; font-weight: 800; width: 100%; }

.weekrow { display: flex; justify-content: space-between; }
.day { text-align: center; font-size: 11px; color: var(--gray-5); font-weight: 600; }
.day .dot { width: 32px; height: 32px; border-radius: 50%; margin: 6px auto 0; background: var(--gray-1); display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; color: #b0b8c1; }
.day .dot.on { background: var(--blue); color: #fff; }
.day .dot.today { border: 2px solid var(--blue); color: var(--blue); background: #fff; }

.hist-row { display: flex; justify-content: space-between; align-items: center; font-size: 13.5px; font-weight: 600; padding: 8px 0; border-bottom: 1px solid var(--gray-1); }
.hist-row:last-child { border-bottom: none; }
.hist-row .d { color: var(--gray-5); font-weight: 500; }

.topnav { display: flex; justify-content: space-between; align-items: center; padding: 10px 16px; background: #fff; position: sticky; top: 0; z-index: 5; }
.topnav .title { font-weight: 700; font-size: 14px; }
.topnav .clock { color: var(--blue); font-weight: 700; font-variant-numeric: tabular-nums; }
.topnav button { font-size: 18px; color: var(--gray-5); padding: 4px; }
.progressbar { height: 3px; background: var(--gray-2); }
.progressbar > div { height: 100%; background: var(--blue); transition: width 0.3s; }

.hero-img { width: 100%; height: 170px; object-fit: cover; display: block; border-radius: 14px; background: var(--gray-1); }
.hero-icon { width: 100%; height: 120px; border-radius: 14px; background: linear-gradient(135deg, #dbeafe, #ede9fe); display: flex; align-items: center; justify-content: center; }
.ex-name { font-size: 19px; font-weight: 800; letter-spacing: -0.3px; margin-top: 10px; }
.tags { display: flex; gap: 6px; margin-top: 6px; }

.set-head, .set-row { display: grid; grid-template-columns: 32px 1fr 1fr 44px; gap: 6px; align-items: center; text-align: center; }
.set-head { font-size: 11px; color: var(--gray-5); font-weight: 600; }
.set-row .n { font-size: 13px; font-weight: 700; color: var(--gray-5); }
.set-row input { width: 100%; background: var(--gray-1); border: none; border-radius: 10px; padding: 10px 0; font-size: 15px; font-weight: 800; text-align: center; font-variant-numeric: tabular-nums; }
.set-row input:focus { outline: 2px solid var(--blue); }
.set-row.done input { background: var(--blue-bg); color: var(--blue); }
.set-row .chk { width: 30px; height: 30px; border-radius: 9px; margin: 0 auto; border: 2px solid var(--gray-3); background: #fff; color: #fff; font-size: 14px; font-weight: 800; display: flex; align-items: center; justify-content: center; }
.set-row.done .chk { background: var(--blue); border-color: var(--blue); }

.rest { background: var(--navy); color: #fff; border-radius: 14px; padding: 12px 16px; display: flex; align-items: center; gap: 12px; position: sticky; bottom: 90px; }
.rest .lbl { font-size: 12px; font-weight: 700; color: var(--gray-5); }
.rest .time { font-size: 20px; font-weight: 800; font-variant-numeric: tabular-nums; }
.rest .bar { flex: 1; height: 6px; border-radius: 3px; background: #333d4b; overflow: hidden; }
.rest .bar > div { height: 100%; background: var(--blue); border-radius: 3px; transition: width 1s linear; }
.rest .skip { font-size: 12px; font-weight: 700; color: var(--gray-5); }

.overlay { position: fixed; inset: 0; background: var(--gray-1); z-index: 20; max-width: 480px; margin: 0 auto; display: flex; flex-direction: column; overflow-y: auto; }
.search { background: #fff; border: 1px solid var(--gray-2); border-radius: 12px; padding: 11px 14px; font-size: 14px; width: 100%; }
.chips { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 2px; }
.chip { font-size: 12.5px; font-weight: 700; color: var(--gray-7); background: #fff; border: 1px solid var(--gray-2); border-radius: 999px; padding: 7px 14px; white-space: nowrap; }
.chip.on { background: var(--navy); color: #fff; border-color: var(--navy); }

.ex-row { background: #fff; border-radius: var(--radius); padding: 10px; display: flex; align-items: center; gap: 12px; box-shadow: 0 1px 4px rgba(25,31,40,0.05); width: 100%; text-align: left; }
.ex-row img, .ex-row .thumb-icon { width: 56px; height: 56px; border-radius: 12px; object-fit: cover; background: linear-gradient(135deg, #dbeafe, #ede9fe); flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
.ex-row .nm { font-size: 15px; font-weight: 800; letter-spacing: -0.3px; }
.ex-row .sb { font-size: 12px; color: var(--gray-5); margin-top: 2px; }
.ex-row .right { margin-left: auto; flex-shrink: 0; }

.field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
.field label { font-size: 12px; font-weight: 700; color: var(--gray-7); }
.field input, .field select { background: var(--gray-1); border: none; border-radius: 10px; padding: 11px 12px; font-size: 14px; width: 100%; }
.icon-picks { display: flex; gap: 8px; }
.icon-pick { width: 44px; height: 44px; border-radius: 10px; background: var(--gray-1); display: flex; align-items: center; justify-content: center; border: 2px solid transparent; }
.icon-pick.on { border-color: var(--blue); background: var(--blue-bg); }

.stepper { display: inline-flex; align-items: center; gap: 10px; }
.stepper button { width: 28px; height: 28px; border-radius: 8px; background: var(--gray-1); font-weight: 800; font-size: 16px; }
.stepper span { font-weight: 800; min-width: 20px; text-align: center; }

.empty { text-align: center; color: var(--gray-5); font-size: 13px; padding: 30px 0; }
```

- [ ] **Step 6: src/test/setup.ts, src/App.tsx, src/main.tsx, src/App.test.tsx 작성**

`src/test/setup.ts`:
```ts
import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
```

`src/App.tsx` (임시 — Task 7에서 교체):
```tsx
export default function App() {
  return <div className="app"><h1 className="screen-title">운동기록</h1></div>;
}
```

`src/main.tsx`:
```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

`src/App.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import App from './App';

test('앱이 렌더링된다', () => {
  render(<App />);
  expect(screen.getByText('운동기록')).toBeInTheDocument();
});
```

- [ ] **Step 7: 설치 및 검증**

Run: `npm install` → 성공 (경고 무시 가능)
Run: `npm test` → PASS 1 test
Run: `npm run build` → dist/ 생성 성공

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: Vite + React + TS + PWA 프로젝트 스캐폴드"
```

---

### Task 2: 타입 정의 + Dexie 스키마 + 설정 저장

**Files:**
- Create: `src/types.ts`, `src/db/db.ts`, `src/db/settings.ts`
- Test: `src/db/db.test.ts`, `src/db/settings.test.ts`

**Interfaces:**
- Produces:
  - `types.ts`: `Exercise { id; name; bodyPart: BodyPart; equipment: Equipment; imagePath?; iconKey?: IconKey; isCustom: boolean; isHidden: boolean }`, `Routine { id; name; items: RoutineItem[] }`, `RoutineItem { exerciseId: string; defaultSets: number }`, `SetRecord { weight: number; reps: number; completedAt?: number }`, `SessionEntry { exerciseId: string; sets: SetRecord[] }`, `Session { id; startedAt: number; finishedAt?: number; routineName?: string; entries: SessionEntry[] }`, 상수 `BODY_PARTS`, `EQUIPMENTS`, `ICON_KEYS`
  - `db.ts`: `db` 싱글턴 (`db.exercises`, `db.routines`, `db.sessions`, `db.meta` 테이블)
  - `settings.ts`: `getRestSeconds(): number`, `setRestSeconds(n: number): void`

- [ ] **Step 1: src/types.ts 작성**

```ts
export const BODY_PARTS = ['가슴', '등', '하체', '어깨', '팔', '코어', '기타'] as const;
export type BodyPart = (typeof BODY_PARTS)[number];

export const EQUIPMENTS = ['바벨', '덤벨', '머신', '케이블', '맨몸', '기타'] as const;
export type Equipment = (typeof EQUIPMENTS)[number];

export const ICON_KEYS = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight'] as const;
export type IconKey = (typeof ICON_KEYS)[number];

export interface Exercise {
  id: string;            // 내장: 'lib-<slug>', 커스텀: crypto.randomUUID()
  name: string;
  bodyPart: BodyPart;
  equipment: Equipment;
  imagePath?: string;    // 내장 운동: 'exercises/<slug>.webp'
  iconKey?: IconKey;     // 커스텀 운동용 픽토그램
  isCustom: boolean;
  isHidden: boolean;
}

export interface RoutineItem {
  exerciseId: string;
  defaultSets: number;
}

export interface Routine {
  id: string;
  name: string;
  items: RoutineItem[];
}

export interface SetRecord {
  weight: number;
  reps: number;
  completedAt?: number; // epoch ms, 없으면 미완료
}

export interface SessionEntry {
  exerciseId: string;
  sets: SetRecord[];
}

export interface Session {
  id: string;
  startedAt: number;
  finishedAt?: number; // 없으면 진행 중
  routineName?: string;
  entries: SessionEntry[];
}
```

- [ ] **Step 2: 실패하는 테스트 작성 — src/db/db.test.ts**

```ts
import { db } from './db';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

test('exercises에 저장하고 조회할 수 있다', async () => {
  await db.exercises.add({
    id: 'e1', name: '벤치프레스', bodyPart: '가슴', equipment: '바벨',
    isCustom: false, isHidden: false,
  });
  const found = await db.exercises.get('e1');
  expect(found?.name).toBe('벤치프레스');
});

test('sessions를 startedAt 인덱스로 정렬 조회할 수 있다', async () => {
  await db.sessions.bulkAdd([
    { id: 's1', startedAt: 100, entries: [] },
    { id: 's2', startedAt: 200, entries: [] },
  ]);
  const list = await db.sessions.orderBy('startedAt').reverse().toArray();
  expect(list.map((s) => s.id)).toEqual(['s2', 's1']);
});
```

- [ ] **Step 3: 실패 확인**

Run: `npx vitest run src/db/db.test.ts`
Expected: FAIL — `Cannot find module './db'`

- [ ] **Step 4: src/db/db.ts 구현**

```ts
import Dexie, { type Table } from 'dexie';
import type { Exercise, Routine, Session } from '../types';

export interface MetaRow {
  key: string;
  value: number;
}

export class WorkoutDB extends Dexie {
  exercises!: Table<Exercise, string>;
  routines!: Table<Routine, string>;
  sessions!: Table<Session, string>;
  meta!: Table<MetaRow, string>;

  constructor() {
    super('workout-tracker');
    this.version(1).stores({
      exercises: 'id, bodyPart',
      routines: 'id',
      sessions: 'id, startedAt',
      meta: 'key',
    });
  }
}

export const db = new WorkoutDB();
```

- [ ] **Step 5: 통과 확인**

Run: `npx vitest run src/db/db.test.ts`
Expected: PASS 2 tests

- [ ] **Step 6: 실패하는 테스트 작성 — src/db/settings.test.ts**

```ts
import { getRestSeconds, setRestSeconds } from './settings';

beforeEach(() => localStorage.clear());

test('기본 휴식 시간은 90초', () => {
  expect(getRestSeconds()).toBe(90);
});

test('휴식 시간을 저장하고 읽는다', () => {
  setRestSeconds(120);
  expect(getRestSeconds()).toBe(120);
});

test('저장된 값이 비정상이면 기본값으로 돌아간다', () => {
  localStorage.setItem('wt-rest-seconds', 'abc');
  expect(getRestSeconds()).toBe(90);
});
```

- [ ] **Step 7: 실패 확인 후 src/db/settings.ts 구현**

Run: `npx vitest run src/db/settings.test.ts` → FAIL

```ts
const KEY = 'wt-rest-seconds';
const DEFAULT = 90;

export function getRestSeconds(): number {
  const raw = localStorage.getItem(KEY);
  const n = raw === null ? NaN : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT;
}

export function setRestSeconds(n: number): void {
  localStorage.setItem(KEY, String(n));
}
```

- [ ] **Step 8: 전체 테스트 통과 확인 후 커밋**

Run: `npm test` → PASS (App 1 + db 2 + settings 3)

```bash
git add src/types.ts src/db/
git commit -m "feat: 데이터 타입, Dexie 스키마, 휴식시간 설정"
```

---

### Task 3: 내장 운동 라이브러리 데이터 + 이미지 다운로드 스크립트

**Files:**
- Create: `src/data/exercise-library.json`, `scripts/fetch-exercise-images.mjs`
- Test: `src/data/exercise-library.test.ts`

**Interfaces:**
- Produces:
  - `exercise-library.json`: `{ id, libId, name, bodyPart, equipment }[]` — `id`는 앱 내 슬러그, `libId`는 free-exercise-db의 운동 id
  - `public/exercises/<id>.webp` 이미지 파일들 (스크립트 실행 결과, git에 커밋)
  - Task 4의 시딩이 이 JSON을 import함

- [ ] **Step 1: src/data/exercise-library.json 작성**

free-exercise-db(퍼블릭 도메인)의 운동 id를 `libId`로 사용. 55개 선별:

```json
[
  { "id": "bench-press", "libId": "Barbell_Bench_Press_-_Medium_Grip", "name": "벤치프레스", "bodyPart": "가슴", "equipment": "바벨" },
  { "id": "dumbbell-bench-press", "libId": "Dumbbell_Bench_Press", "name": "덤벨 벤치프레스", "bodyPart": "가슴", "equipment": "덤벨" },
  { "id": "incline-bench-press", "libId": "Barbell_Incline_Bench_Press_-_Medium_Grip", "name": "인클라인 벤치프레스", "bodyPart": "가슴", "equipment": "바벨" },
  { "id": "incline-dumbbell-press", "libId": "Incline_Dumbbell_Press", "name": "인클라인 덤벨프레스", "bodyPart": "가슴", "equipment": "덤벨" },
  { "id": "dumbbell-fly", "libId": "Dumbbell_Flyes", "name": "덤벨 플라이", "bodyPart": "가슴", "equipment": "덤벨" },
  { "id": "cable-crossover", "libId": "Cable_Crossover", "name": "케이블 크로스오버", "bodyPart": "가슴", "equipment": "케이블" },
  { "id": "pec-deck", "libId": "Butterfly", "name": "펙덱 플라이", "bodyPart": "가슴", "equipment": "머신" },
  { "id": "chest-dips", "libId": "Dips_-_Chest_Version", "name": "딥스", "bodyPart": "가슴", "equipment": "맨몸" },
  { "id": "pushup", "libId": "Pushups", "name": "푸시업", "bodyPart": "가슴", "equipment": "맨몸" },
  { "id": "lat-pulldown", "libId": "Wide-Grip_Lat_Pulldown", "name": "랫풀다운", "bodyPart": "등", "equipment": "케이블" },
  { "id": "barbell-row", "libId": "Bent_Over_Barbell_Row", "name": "바벨 로우", "bodyPart": "등", "equipment": "바벨" },
  { "id": "seated-cable-row", "libId": "Seated_Cable_Rows", "name": "시티드 케이블 로우", "bodyPart": "등", "equipment": "케이블" },
  { "id": "one-arm-dumbbell-row", "libId": "One-Arm_Dumbbell_Row", "name": "원암 덤벨 로우", "bodyPart": "등", "equipment": "덤벨" },
  { "id": "pullup", "libId": "Pullups", "name": "풀업", "bodyPart": "등", "equipment": "맨몸" },
  { "id": "chinup", "libId": "Chin-Up", "name": "친업", "bodyPart": "등", "equipment": "맨몸" },
  { "id": "deadlift", "libId": "Barbell_Deadlift", "name": "데드리프트", "bodyPart": "등", "equipment": "바벨" },
  { "id": "straight-arm-pulldown", "libId": "Straight-Arm_Pulldown", "name": "스트레이트암 풀다운", "bodyPart": "등", "equipment": "케이블" },
  { "id": "squat", "libId": "Barbell_Squat", "name": "스쿼트", "bodyPart": "하체", "equipment": "바벨" },
  { "id": "front-squat", "libId": "Front_Barbell_Squat", "name": "프론트 스쿼트", "bodyPart": "하체", "equipment": "바벨" },
  { "id": "goblet-squat", "libId": "Goblet_Squat", "name": "고블릿 스쿼트", "bodyPart": "하체", "equipment": "덤벨" },
  { "id": "leg-press", "libId": "Leg_Press", "name": "레그 프레스", "bodyPart": "하체", "equipment": "머신" },
  { "id": "leg-extension", "libId": "Leg_Extensions", "name": "레그 익스텐션", "bodyPart": "하체", "equipment": "머신" },
  { "id": "lying-leg-curl", "libId": "Lying_Leg_Curls", "name": "라잉 레그컬", "bodyPart": "하체", "equipment": "머신" },
  { "id": "seated-leg-curl", "libId": "Seated_Leg_Curl", "name": "시티드 레그컬", "bodyPart": "하체", "equipment": "머신" },
  { "id": "barbell-lunge", "libId": "Barbell_Lunge", "name": "바벨 런지", "bodyPart": "하체", "equipment": "바벨" },
  { "id": "dumbbell-lunge", "libId": "Dumbbell_Lunges", "name": "덤벨 런지", "bodyPart": "하체", "equipment": "덤벨" },
  { "id": "romanian-deadlift", "libId": "Romanian_Deadlift", "name": "루마니안 데드리프트", "bodyPart": "하체", "equipment": "바벨" },
  { "id": "standing-calf-raise", "libId": "Standing_Calf_Raises", "name": "스탠딩 카프레이즈", "bodyPart": "하체", "equipment": "머신" },
  { "id": "hip-thrust", "libId": "Barbell_Glute_Bridge", "name": "힙 쓰러스트", "bodyPart": "하체", "equipment": "바벨" },
  { "id": "overhead-press", "libId": "Barbell_Shoulder_Press", "name": "오버헤드 프레스", "bodyPart": "어깨", "equipment": "바벨" },
  { "id": "dumbbell-shoulder-press", "libId": "Dumbbell_Shoulder_Press", "name": "덤벨 숄더프레스", "bodyPart": "어깨", "equipment": "덤벨" },
  { "id": "arnold-press", "libId": "Arnold_Dumbbell_Press", "name": "아놀드 프레스", "bodyPart": "어깨", "equipment": "덤벨" },
  { "id": "lateral-raise", "libId": "Side_Lateral_Raise", "name": "사이드 레터럴 레이즈", "bodyPart": "어깨", "equipment": "덤벨" },
  { "id": "front-raise", "libId": "Front_Dumbbell_Raise", "name": "프론트 레이즈", "bodyPart": "어깨", "equipment": "덤벨" },
  { "id": "reverse-fly", "libId": "Reverse_Flyes", "name": "리버스 플라이", "bodyPart": "어깨", "equipment": "덤벨" },
  { "id": "upright-row", "libId": "Upright_Barbell_Row", "name": "업라이트 로우", "bodyPart": "어깨", "equipment": "바벨" },
  { "id": "face-pull", "libId": "Face_Pull", "name": "페이스 풀", "bodyPart": "어깨", "equipment": "케이블" },
  { "id": "barbell-shrug", "libId": "Barbell_Shrug", "name": "바벨 슈러그", "bodyPart": "어깨", "equipment": "바벨" },
  { "id": "barbell-curl", "libId": "Barbell_Curl", "name": "바벨 컬", "bodyPart": "팔", "equipment": "바벨" },
  { "id": "dumbbell-curl", "libId": "Dumbbell_Bicep_Curl", "name": "덤벨 컬", "bodyPart": "팔", "equipment": "덤벨" },
  { "id": "hammer-curl", "libId": "Hammer_Curls", "name": "해머 컬", "bodyPart": "팔", "equipment": "덤벨" },
  { "id": "preacher-curl", "libId": "Preacher_Curl", "name": "프리처 컬", "bodyPart": "팔", "equipment": "바벨" },
  { "id": "concentration-curl", "libId": "Concentration_Curls", "name": "컨센트레이션 컬", "bodyPart": "팔", "equipment": "덤벨" },
  { "id": "triceps-pushdown", "libId": "Triceps_Pushdown", "name": "트라이셉스 푸시다운", "bodyPart": "팔", "equipment": "케이블" },
  { "id": "close-grip-bench", "libId": "Close-Grip_Barbell_Bench_Press", "name": "클로즈그립 벤치프레스", "bodyPart": "팔", "equipment": "바벨" },
  { "id": "lying-triceps-extension", "libId": "Lying_Triceps_Press", "name": "라잉 트라이셉스 익스텐션", "bodyPart": "팔", "equipment": "바벨" },
  { "id": "triceps-dips", "libId": "Dips_-_Triceps_Version", "name": "딥스(삼두)", "bodyPart": "팔", "equipment": "맨몸" },
  { "id": "overhead-triceps-extension", "libId": "Standing_Dumbbell_Triceps_Extension", "name": "오버헤드 트라이셉스 익스텐션", "bodyPart": "팔", "equipment": "덤벨" },
  { "id": "crunch", "libId": "Crunches", "name": "크런치", "bodyPart": "코어", "equipment": "맨몸" },
  { "id": "plank", "libId": "Plank", "name": "플랭크", "bodyPart": "코어", "equipment": "맨몸" },
  { "id": "hanging-leg-raise", "libId": "Hanging_Leg_Raise", "name": "행잉 레그레이즈", "bodyPart": "코어", "equipment": "맨몸" },
  { "id": "russian-twist", "libId": "Russian_Twist", "name": "러시안 트위스트", "bodyPart": "코어", "equipment": "맨몸" },
  { "id": "ab-rollout", "libId": "Ab_Roller", "name": "앱휠 롤아웃", "bodyPart": "코어", "equipment": "기타" },
  { "id": "cable-crunch", "libId": "Cable_Crunch", "name": "케이블 크런치", "bodyPart": "코어", "equipment": "케이블" },
  { "id": "kettlebell-swing", "libId": "Kettlebell_Swing", "name": "케틀벨 스윙", "bodyPart": "기타", "equipment": "기타" }
]
```

- [ ] **Step 2: 실패하는 테스트 작성 — src/data/exercise-library.test.ts**

```ts
import library from './exercise-library.json';
import { BODY_PARTS, EQUIPMENTS } from '../types';

test('id와 libId가 중복 없이 유일하다', () => {
  const ids = library.map((x) => x.id);
  const libIds = library.map((x) => x.libId);
  expect(new Set(ids).size).toBe(ids.length);
  expect(new Set(libIds).size).toBe(libIds.length);
});

test('모든 항목의 부위/기구가 유효한 값이다', () => {
  for (const x of library) {
    expect(BODY_PARTS).toContain(x.bodyPart);
    expect(EQUIPMENTS).toContain(x.equipment);
    expect(x.name.length).toBeGreaterThan(0);
  }
});
```

Run: `npx vitest run src/data/exercise-library.test.ts` → PASS (JSON을 먼저 썼으므로 바로 통과 — 데이터 검증 테스트라 순서 무방)

- [ ] **Step 3: scripts/fetch-exercise-images.mjs 작성**

libId를 free-exercise-db의 실제 목록과 대조 검증하고(오타 시 후보 제시 후 실패), 이미지를 640px webp로 변환해 `public/exercises/`에 저장:

```js
import { mkdir, readFile } from 'node:fs/promises';
import sharp from 'sharp';

const DB_URL = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json';
const IMG_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';

const library = JSON.parse(await readFile('src/data/exercise-library.json', 'utf8'));
const all = await (await fetch(DB_URL)).json();
const byId = new Map(all.map((e) => [e.id, e]));

const bad = library.filter((x) => !byId.has(x.libId));
if (bad.length > 0) {
  console.error('❌ free-exercise-db에 존재하지 않는 libId:');
  for (const b of bad) {
    const first = b.libId.split(/[_-]/)[0].toLowerCase();
    const candidates = all
      .filter((e) => e.id.toLowerCase().includes(first))
      .slice(0, 8)
      .map((e) => e.id);
    console.error(`  - ${b.libId}  (후보: ${candidates.join(', ') || '없음'})`);
  }
  console.error('src/data/exercise-library.json의 libId를 후보로 교체한 뒤 다시 실행하세요.');
  process.exit(1);
}

await mkdir('public/exercises', { recursive: true });
for (const x of library) {
  const entry = byId.get(x.libId);
  const imgPath = entry.images?.[0];
  if (!imgPath) {
    console.error(`❌ ${x.libId}: 이미지가 없습니다`);
    process.exit(1);
  }
  const res = await fetch(IMG_BASE + imgPath);
  if (!res.ok) {
    console.error(`❌ ${x.libId}: 이미지 다운로드 실패 (${res.status})`);
    process.exit(1);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await sharp(buf).resize(640).webp({ quality: 75 }).toFile(`public/exercises/${x.id}.webp`);
  console.log(`✓ ${x.id}`);
}
console.log(`완료: ${library.length}개 이미지 → public/exercises/`);
```

- [ ] **Step 4: 스크립트 실행 및 libId 교정**

Run: `npm run fetch-images`
Expected: 55개 전부 `✓` 출력. **libId 오류가 나오면** 오류 메시지의 후보 목록에서 올바른 id를 골라 JSON을 수정하고 재실행 (한국어 이름과 실제 운동이 일치하는지 후보의 이름으로 판단). 후보에 마땅한 운동이 없으면 해당 항목을 JSON에서 삭제한다.

Run: `ls public/exercises | wc -l` → JSON 항목 수와 일치

- [ ] **Step 5: Commit**

```bash
git add src/data/ scripts/ public/exercises/
git commit -m "feat: 내장 운동 라이브러리 55종 + 이미지 번들"
```

---

### Task 4: 라이브러리 시딩 + 운동 저장소 (exercises)

**Files:**
- Create: `src/db/exercises.ts`
- Test: `src/db/exercises.test.ts`

**Interfaces:**
- Consumes: `db`(Task 2), `exercise-library.json`(Task 3)
- Produces:
  - `seedLibrary(): Promise<void>` — 앱 시작 시 1회 호출, 멱등
  - `listExercises(opts?: { includeHidden?: boolean }): Promise<Exercise[]>` — 이름 가나다순
  - `addCustomExercise(input: { name: string; bodyPart: BodyPart; equipment: Equipment; iconKey: IconKey }): Promise<Exercise>`
  - `setExerciseHidden(id: string, hidden: boolean): Promise<void>`
  - `deleteCustomExercise(id: string): Promise<void>`
  - `LIBRARY_VERSION: number`

- [ ] **Step 1: 실패하는 테스트 작성 — src/db/exercises.test.ts**

```ts
import { db } from './db';
import {
  seedLibrary, listExercises, addCustomExercise,
  setExerciseHidden, deleteCustomExercise,
} from './exercises';
import library from '../data/exercise-library.json';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

test('seedLibrary는 라이브러리 전체를 넣고, 두 번 불러도 중복되지 않는다', async () => {
  await seedLibrary();
  await seedLibrary();
  const all = await db.exercises.toArray();
  expect(all.length).toBe(library.length);
  const bench = await db.exercises.get('lib-bench-press');
  expect(bench?.name).toBe('벤치프레스');
  expect(bench?.imagePath).toBe('exercises/bench-press.webp');
});

test('seedLibrary는 사용자가 숨긴 운동을 되살리지 않는다', async () => {
  await seedLibrary();
  await setExerciseHidden('lib-squat', true);
  await db.meta.delete('libraryVersion'); // 앱 업데이트로 재시딩되는 상황 재현
  await seedLibrary();
  const squat = await db.exercises.get('lib-squat');
  expect(squat?.isHidden).toBe(true);
});

test('listExercises는 숨긴 운동을 제외하고 이름순 정렬한다', async () => {
  await seedLibrary();
  await setExerciseHidden('lib-bench-press', true);
  const list = await listExercises();
  expect(list.find((e) => e.id === 'lib-bench-press')).toBeUndefined();
  const names = list.map((e) => e.name);
  expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'ko')));
});

test('커스텀 운동 추가/삭제', async () => {
  const ex = await addCustomExercise({
    name: '스미스머신 벤치', bodyPart: '가슴', equipment: '머신', iconKey: 'machine',
  });
  expect(ex.isCustom).toBe(true);
  expect((await listExercises()).some((e) => e.id === ex.id)).toBe(true);
  await deleteCustomExercise(ex.id);
  expect(await db.exercises.get(ex.id)).toBeUndefined();
});

test('내장 운동은 deleteCustomExercise로 지울 수 없다', async () => {
  await seedLibrary();
  await expect(deleteCustomExercise('lib-squat')).rejects.toThrow();
  expect(await db.exercises.get('lib-squat')).toBeDefined();
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/db/exercises.test.ts`
Expected: FAIL — `Cannot find module './exercises'`

- [ ] **Step 3: src/db/exercises.ts 구현**

```ts
import { db } from './db';
import library from '../data/exercise-library.json';
import type { BodyPart, Equipment, Exercise, IconKey } from '../types';

export const LIBRARY_VERSION = 1;

export async function seedLibrary(): Promise<void> {
  const meta = await db.meta.get('libraryVersion');
  if (meta && meta.value >= LIBRARY_VERSION) return;
  const existingIds = new Set((await db.exercises.toArray()).map((e) => e.id));
  const rows: Exercise[] = library
    .map((x) => ({
      id: `lib-${x.id}`,
      name: x.name,
      bodyPart: x.bodyPart as BodyPart,
      equipment: x.equipment as Equipment,
      imagePath: `exercises/${x.id}.webp`,
      isCustom: false,
      isHidden: false,
    }))
    .filter((r) => !existingIds.has(r.id));
  await db.exercises.bulkAdd(rows);
  await db.meta.put({ key: 'libraryVersion', value: LIBRARY_VERSION });
}

export async function listExercises(opts?: { includeHidden?: boolean }): Promise<Exercise[]> {
  const all = await db.exercises.toArray();
  const filtered = opts?.includeHidden ? all : all.filter((e) => !e.isHidden);
  return filtered.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

export async function addCustomExercise(input: {
  name: string;
  bodyPart: BodyPart;
  equipment: Equipment;
  iconKey: IconKey;
}): Promise<Exercise> {
  const ex: Exercise = {
    id: crypto.randomUUID(),
    name: input.name.trim(),
    bodyPart: input.bodyPart,
    equipment: input.equipment,
    iconKey: input.iconKey,
    isCustom: true,
    isHidden: false,
  };
  await db.exercises.add(ex);
  return ex;
}

export async function setExerciseHidden(id: string, hidden: boolean): Promise<void> {
  await db.exercises.update(id, { isHidden: hidden });
}

export async function deleteCustomExercise(id: string): Promise<void> {
  const ex = await db.exercises.get(id);
  if (!ex) return;
  if (!ex.isCustom) throw new Error('내장 운동은 삭제할 수 없습니다. 숨기기를 사용하세요.');
  await db.exercises.delete(id);
}
```

- [ ] **Step 4: 통과 확인 후 커밋**

Run: `npx vitest run src/db/exercises.test.ts` → PASS 5 tests
Run: `npm test` → 전체 PASS

```bash
git add src/db/exercises.ts src/db/exercises.test.ts
git commit -m "feat: 운동 라이브러리 시딩과 운동 저장소"
```

---

### Task 5: 세션 저장소 (핵심 로직 — 지난 기록 미리 채우기)

**Files:**
- Create: `src/db/sessions.ts`
- Test: `src/db/sessions.test.ts`

**Interfaces:**
- Consumes: `db`, 타입들(Task 2)
- Produces:
  - `getLastRecord(exerciseId: string): Promise<SetRecord[] | undefined>` — 가장 최근 **완료된** 세션에서 해당 운동의 완료 세트 목록
  - `buildEntry(exerciseId: string, defaultSets?: number): Promise<SessionEntry>` — 지난 기록으로 미리 채움, 없으면 `defaultSets`(기본 3)개의 `{weight:0, reps:10}`
  - `startSession(routine?: Routine): Promise<Session>`
  - `getActiveSession(): Promise<Session | undefined>`
  - `saveSession(session: Session): Promise<void>`
  - `finishSession(session: Session): Promise<void>` — 미완료 세트 제거, 완료 세트 없는 entry 제거, `finishedAt` 기록
  - `discardSession(id: string): Promise<void>`
  - `listFinishedSessions(): Promise<Session[]>` — 최근순
  - `deleteSession(id: string): Promise<void>`
  - `getExerciseHistory(exerciseId: string): Promise<{ session: Session; sets: SetRecord[] }[]>` — 최근순

- [ ] **Step 1: 실패하는 테스트 작성 — src/db/sessions.test.ts**

```ts
import { db } from './db';
import {
  getLastRecord, buildEntry, startSession, getActiveSession,
  saveSession, finishSession, discardSession,
  listFinishedSessions, deleteSession, getExerciseHistory,
} from './sessions';
import type { Routine, Session } from '../types';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

async function addFinishedSession(startedAt: number, exerciseId: string, sets: { weight: number; reps: number; done?: boolean }[]) {
  const s: Session = {
    id: crypto.randomUUID(),
    startedAt,
    finishedAt: startedAt + 3600_000,
    entries: [{
      exerciseId,
      sets: sets.map((x) => ({ weight: x.weight, reps: x.reps, completedAt: x.done === false ? undefined : startedAt + 1 })),
    }],
  };
  await db.sessions.add(s);
  return s;
}

test('getLastRecord는 가장 최근 완료 세션의 완료 세트를 반환한다', async () => {
  await addFinishedSession(1000, 'ex1', [{ weight: 50, reps: 10 }]);
  await addFinishedSession(2000, 'ex1', [{ weight: 60, reps: 10 }, { weight: 60, reps: 8 }]);
  const last = await getLastRecord('ex1');
  expect(last?.map((s) => s.weight)).toEqual([60, 60]);
});

test('getLastRecord는 진행 중 세션과 미완료 세트를 무시한다', async () => {
  await addFinishedSession(1000, 'ex1', [{ weight: 50, reps: 10 }]);
  await db.sessions.add({
    id: 'active', startedAt: 3000,
    entries: [{ exerciseId: 'ex1', sets: [{ weight: 100, reps: 5 }] }],
  });
  await addFinishedSession(2000, 'ex1', [
    { weight: 60, reps: 10 },
    { weight: 999, reps: 1, done: false },
  ]);
  const last = await getLastRecord('ex1');
  expect(last?.length).toBe(1);
  expect(last?.[0].weight).toBe(60);
});

test('기록이 없으면 getLastRecord는 undefined', async () => {
  expect(await getLastRecord('없는운동')).toBeUndefined();
});

test('buildEntry는 지난 기록을 미완료 상태로 미리 채운다', async () => {
  await addFinishedSession(1000, 'ex1', [{ weight: 60, reps: 10 }, { weight: 55, reps: 12 }]);
  const entry = await buildEntry('ex1');
  expect(entry.sets).toEqual([
    { weight: 60, reps: 10 },
    { weight: 55, reps: 12 },
  ]);
});

test('buildEntry는 기록이 없으면 defaultSets개의 기본 세트를 만든다', async () => {
  const entry = await buildEntry('ex1', 4);
  expect(entry.sets).toHaveLength(4);
  expect(entry.sets[0]).toEqual({ weight: 0, reps: 10 });
});

test('startSession은 루틴 순서대로 entries를 미리 채운다', async () => {
  await addFinishedSession(1000, 'ex1', [{ weight: 60, reps: 10 }]);
  const routine: Routine = {
    id: 'r1', name: '가슴 날',
    items: [{ exerciseId: 'ex1', defaultSets: 3 }, { exerciseId: 'ex2', defaultSets: 2 }],
  };
  const s = await startSession(routine);
  expect(s.routineName).toBe('가슴 날');
  expect(s.entries[0].sets[0].weight).toBe(60);
  expect(s.entries[1].sets).toHaveLength(2);
  expect(await getActiveSession()).toMatchObject({ id: s.id });
});

test('finishSession은 미완료 세트와 빈 entry를 정리하고 완료 처리한다', async () => {
  const s = await startSession();
  s.entries = [
    { exerciseId: 'ex1', sets: [{ weight: 60, reps: 10, completedAt: 1 }, { weight: 60, reps: 8 }] },
    { exerciseId: 'ex2', sets: [{ weight: 40, reps: 12 }] },
  ];
  await saveSession(s);
  await finishSession(s);
  const saved = await db.sessions.get(s.id);
  expect(saved?.finishedAt).toBeDefined();
  expect(saved?.entries).toHaveLength(1);
  expect(saved?.entries[0].sets).toHaveLength(1);
  expect(await getActiveSession()).toBeUndefined();
});

test('discardSession은 세션을 삭제한다', async () => {
  const s = await startSession();
  await discardSession(s.id);
  expect(await getActiveSession()).toBeUndefined();
});

test('listFinishedSessions는 완료 세션만 최근순으로', async () => {
  await addFinishedSession(1000, 'ex1', [{ weight: 50, reps: 10 }]);
  await addFinishedSession(2000, 'ex1', [{ weight: 60, reps: 10 }]);
  await startSession(); // 진행 중 — 제외되어야 함
  const list = await listFinishedSessions();
  expect(list).toHaveLength(2);
  expect(list[0].startedAt).toBe(2000);
});

test('deleteSession과 getExerciseHistory', async () => {
  const a = await addFinishedSession(1000, 'ex1', [{ weight: 50, reps: 10 }]);
  await addFinishedSession(2000, 'ex2', [{ weight: 30, reps: 15 }]);
  const hist = await getExerciseHistory('ex1');
  expect(hist).toHaveLength(1);
  expect(hist[0].sets[0].weight).toBe(50);
  await deleteSession(a.id);
  expect(await getExerciseHistory('ex1')).toHaveLength(0);
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/db/sessions.test.ts`
Expected: FAIL — `Cannot find module './sessions'`

- [ ] **Step 3: src/db/sessions.ts 구현**

```ts
import { db } from './db';
import type { Routine, Session, SessionEntry, SetRecord } from '../types';

export async function getLastRecord(exerciseId: string): Promise<SetRecord[] | undefined> {
  const sessions = await db.sessions.orderBy('startedAt').reverse().toArray();
  for (const s of sessions) {
    if (!s.finishedAt) continue;
    const entry = s.entries.find((e) => e.exerciseId === exerciseId);
    const done = entry?.sets.filter((x) => x.completedAt !== undefined);
    if (done && done.length > 0) return done;
  }
  return undefined;
}

export async function buildEntry(exerciseId: string, defaultSets = 3): Promise<SessionEntry> {
  const last = await getLastRecord(exerciseId);
  const sets: SetRecord[] = last
    ? last.map((s) => ({ weight: s.weight, reps: s.reps }))
    : Array.from({ length: defaultSets }, () => ({ weight: 0, reps: 10 }));
  return { exerciseId, sets };
}

export async function startSession(routine?: Routine): Promise<Session> {
  const entries: SessionEntry[] = [];
  if (routine) {
    for (const item of routine.items) {
      entries.push(await buildEntry(item.exerciseId, item.defaultSets));
    }
  }
  const session: Session = {
    id: crypto.randomUUID(),
    startedAt: Date.now(),
    routineName: routine?.name,
    entries,
  };
  await db.sessions.add(session);
  return session;
}

export async function getActiveSession(): Promise<Session | undefined> {
  const all = await db.sessions.toArray();
  return all.find((s) => s.finishedAt === undefined);
}

export async function saveSession(session: Session): Promise<void> {
  await db.sessions.put(session);
}

export async function finishSession(session: Session): Promise<void> {
  const cleaned: Session = {
    ...session,
    finishedAt: Date.now(),
    entries: session.entries
      .map((e) => ({ ...e, sets: e.sets.filter((s) => s.completedAt !== undefined) }))
      .filter((e) => e.sets.length > 0),
  };
  await db.sessions.put(cleaned);
}

export async function discardSession(id: string): Promise<void> {
  await db.sessions.delete(id);
}

export async function listFinishedSessions(): Promise<Session[]> {
  const all = await db.sessions.orderBy('startedAt').reverse().toArray();
  return all.filter((s) => s.finishedAt !== undefined);
}

export async function deleteSession(id: string): Promise<void> {
  await db.sessions.delete(id);
}

export async function getExerciseHistory(
  exerciseId: string,
): Promise<{ session: Session; sets: SetRecord[] }[]> {
  const sessions = await listFinishedSessions();
  const result: { session: Session; sets: SetRecord[] }[] = [];
  for (const session of sessions) {
    const entry = session.entries.find((e) => e.exerciseId === exerciseId);
    if (entry && entry.sets.length > 0) result.push({ session, sets: entry.sets });
  }
  return result;
}
```

- [ ] **Step 4: 통과 확인 후 커밋**

Run: `npx vitest run src/db/sessions.test.ts` → PASS 10 tests
Run: `npm test` → 전체 PASS

```bash
git add src/db/sessions.ts src/db/sessions.test.ts
git commit -m "feat: 세션 저장소 — 지난 기록 미리 채우기, 세션 완료/복구"
```

---

### Task 6: 루틴 저장소 + 백업(내보내기/가져오기)

**Files:**
- Create: `src/db/routines.ts`, `src/db/backup.ts`
- Test: `src/db/routines.test.ts`, `src/db/backup.test.ts`

**Interfaces:**
- Consumes: `db`, 타입들
- Produces:
  - `routines.ts`: `listRoutines(): Promise<Routine[]>`(이름순), `saveRoutine(r: Routine): Promise<void>`, `deleteRoutine(id: string): Promise<void>`, `newRoutine(): Routine`(빈 루틴 생성, id 발급)
  - `backup.ts`: `exportData(): Promise<BackupFile>`, `importData(raw: unknown): Promise<void>`, `interface BackupFile { version: 1; exportedAt: number; exercises: Exercise[]; routines: Routine[]; sessions: Session[] }`

- [ ] **Step 1: 실패하는 테스트 작성 — src/db/routines.test.ts**

```ts
import { db } from './db';
import { listRoutines, saveRoutine, deleteRoutine, newRoutine } from './routines';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

test('루틴 저장/수정/목록/삭제', async () => {
  const r = newRoutine();
  r.name = '가슴 날';
  r.items = [{ exerciseId: 'ex1', defaultSets: 3 }];
  await saveRoutine(r);

  r.items.push({ exerciseId: 'ex2', defaultSets: 4 });
  await saveRoutine(r);

  const list = await listRoutines();
  expect(list).toHaveLength(1);
  expect(list[0].items).toHaveLength(2);

  await deleteRoutine(r.id);
  expect(await listRoutines()).toHaveLength(0);
});

test('listRoutines는 이름순 정렬', async () => {
  const a = newRoutine(); a.name = '하체 날'; await saveRoutine(a);
  const b = newRoutine(); b.name = '가슴 날'; await saveRoutine(b);
  expect((await listRoutines()).map((r) => r.name)).toEqual(['가슴 날', '하체 날']);
});
```

- [ ] **Step 2: 실패 확인 후 src/db/routines.ts 구현**

Run: `npx vitest run src/db/routines.test.ts` → FAIL

```ts
import { db } from './db';
import type { Routine } from '../types';

export function newRoutine(): Routine {
  return { id: crypto.randomUUID(), name: '', items: [] };
}

export async function listRoutines(): Promise<Routine[]> {
  const all = await db.routines.toArray();
  return all.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

export async function saveRoutine(r: Routine): Promise<void> {
  await db.routines.put(r);
}

export async function deleteRoutine(id: string): Promise<void> {
  await db.routines.delete(id);
}
```

Run: `npx vitest run src/db/routines.test.ts` → PASS

- [ ] **Step 3: 실패하는 테스트 작성 — src/db/backup.test.ts**

```ts
import { db } from './db';
import { exportData, importData } from './backup';
import { seedLibrary } from './exercises';
import { saveRoutine, newRoutine } from './routines';
import { startSession, finishSession } from './sessions';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

test('내보내기→가져오기 왕복이 데이터를 보존한다', async () => {
  await seedLibrary();
  const r = newRoutine(); r.name = '가슴 날';
  r.items = [{ exerciseId: 'lib-bench-press', defaultSets: 3 }];
  await saveRoutine(r);
  const s = await startSession(r);
  s.entries[0].sets[0] = { weight: 60, reps: 10, completedAt: Date.now() };
  await finishSession(s);

  const backup = await exportData();
  expect(backup.version).toBe(1);

  await db.delete();
  await db.open();
  await importData(backup);

  expect(await db.exercises.count()).toBe(backup.exercises.length);
  expect((await db.routines.toArray())[0].name).toBe('가슴 날');
  expect((await db.sessions.toArray())[0].entries[0].sets[0].weight).toBe(60);
});

test('형식이 잘못된 파일은 거부하고 기존 데이터를 보존한다', async () => {
  await seedLibrary();
  const before = await db.exercises.count();
  await expect(importData({ hello: 'world' })).rejects.toThrow();
  await expect(importData(null)).rejects.toThrow();
  expect(await db.exercises.count()).toBe(before);
});
```

- [ ] **Step 4: 실패 확인 후 src/db/backup.ts 구현**

Run: `npx vitest run src/db/backup.test.ts` → FAIL

```ts
import { db } from './db';
import type { Exercise, Routine, Session } from '../types';

export interface BackupFile {
  version: 1;
  exportedAt: number;
  exercises: Exercise[];
  routines: Routine[];
  sessions: Session[];
}

export async function exportData(): Promise<BackupFile> {
  return {
    version: 1,
    exportedAt: Date.now(),
    exercises: await db.exercises.toArray(),
    routines: await db.routines.toArray(),
    sessions: await db.sessions.toArray(),
  };
}

function isBackupFile(raw: unknown): raw is BackupFile {
  if (typeof raw !== 'object' || raw === null) return false;
  const o = raw as Record<string, unknown>;
  return (
    o.version === 1 &&
    Array.isArray(o.exercises) &&
    Array.isArray(o.routines) &&
    Array.isArray(o.sessions)
  );
}

export async function importData(raw: unknown): Promise<void> {
  if (!isBackupFile(raw)) throw new Error('백업 파일 형식이 올바르지 않습니다.');
  await db.transaction('rw', db.exercises, db.routines, db.sessions, async () => {
    await db.exercises.clear();
    await db.routines.clear();
    await db.sessions.clear();
    await db.exercises.bulkAdd(raw.exercises);
    await db.routines.bulkAdd(raw.routines);
    await db.sessions.bulkAdd(raw.sessions);
  });
}
```

- [ ] **Step 5: 통과 확인 후 커밋**

Run: `npm test` → 전체 PASS

```bash
git add src/db/routines.ts src/db/routines.test.ts src/db/backup.ts src/db/backup.test.ts
git commit -m "feat: 루틴 저장소와 JSON 백업(내보내기/가져오기)"
```

---

### Task 7: 앱 셸 — 라우터, 탭바, 공용 컴포넌트

**Files:**
- Create: `src/components/TabBar.tsx`, `src/components/ExerciseIcon.tsx`, `src/components/ExerciseImage.tsx`, `src/screens/HomeScreen.tsx`(빈 껍데기), `src/screens/SessionScreen.tsx`(빈 껍데기), `src/screens/HistoryScreen.tsx`(빈 껍데기), `src/screens/ManageScreen.tsx`(빈 껍데기)
- Modify: `src/App.tsx`(교체), `src/main.tsx`(시딩 추가), `src/App.test.tsx`(교체)

**Interfaces:**
- Consumes: `seedLibrary`(Task 4)
- Produces:
  - 라우트: `/`(홈), `/session`(세션), `/history`(기록), `/manage`(관리) — HashRouter
  - `<ExerciseIcon iconKey size />` — 커스텀 운동용 SVG 픽토그램
  - `<ExerciseImage exercise className />` — imagePath 있으면 `<img>`, 없으면 아이콘. **이미지 경로는 `import.meta.env.BASE_URL + exercise.imagePath`로 조립** (이후 태스크 공통)
  - 각 스크린 컴포넌트는 default export (빈 껍데기, 이후 태스크가 내용 채움)

- [ ] **Step 1: src/components/ExerciseIcon.tsx 작성**

```tsx
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
```

- [ ] **Step 2: src/components/ExerciseImage.tsx 작성**

```tsx
import type { Exercise } from '../types';
import ExerciseIcon from './ExerciseIcon';

export function exerciseImageUrl(ex: Exercise): string | undefined {
  return ex.imagePath ? import.meta.env.BASE_URL + ex.imagePath : undefined;
}

export default function ExerciseImage({ exercise, className }: { exercise: Exercise; className?: string }) {
  const url = exerciseImageUrl(exercise);
  if (url) return <img src={url} alt={exercise.name} className={className} loading="lazy" />;
  return (
    <div className={className ?? 'thumb-icon'}>
      <ExerciseIcon iconKey={exercise.iconKey ?? 'barbell'} />
    </div>
  );
}
```

- [ ] **Step 3: src/components/TabBar.tsx 작성**

```tsx
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
```

- [ ] **Step 4: 빈 스크린 4개 작성**

`src/screens/HomeScreen.tsx`:
```tsx
export default function HomeScreen() {
  return (
    <div className="screen">
      <h1 className="screen-title">홈</h1>
    </div>
  );
}
```

`src/screens/SessionScreen.tsx`, `src/screens/HistoryScreen.tsx`, `src/screens/ManageScreen.tsx`도 동일한 구조로 제목만 `운동`, `기록`, `관리`로 작성.

- [ ] **Step 5: src/App.tsx 교체**

```tsx
import { HashRouter, Routes, Route, useLocation } from 'react-router-dom';
import TabBar from './components/TabBar';
import HomeScreen from './screens/HomeScreen';
import SessionScreen from './screens/SessionScreen';
import HistoryScreen from './screens/HistoryScreen';
import ManageScreen from './screens/ManageScreen';

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
```

- [ ] **Step 6: src/main.tsx에 시딩 추가**

```tsx
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
```

- [ ] **Step 7: src/App.test.tsx 교체**

```tsx
import { render, screen } from '@testing-library/react';
import App from './App';

test('탭바와 홈 화면이 렌더링된다', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: '홈' })).toBeInTheDocument();
  expect(screen.getByText('기록')).toBeInTheDocument();
  expect(screen.getByText('관리')).toBeInTheDocument();
});
```

- [ ] **Step 8: 검증 및 커밋**

Run: `npm test` → 전체 PASS
Run: `npm run dev` → 브라우저에서 탭 3개 전환 확인 (홈/기록/관리)

```bash
git add src/
git commit -m "feat: 앱 셸 — HashRouter, 탭바, 운동 아이콘/이미지 컴포넌트"
```

---

### Task 8: ExercisePicker + AddExerciseForm

**Files:**
- Create: `src/components/AddExerciseForm.tsx`, `src/components/ExercisePicker.tsx`
- Test: `src/components/ExercisePicker.test.tsx`

**Interfaces:**
- Consumes: `listExercises`, `addCustomExercise`(Task 4), `ExerciseImage`(Task 7)
- Produces:
  - `<AddExerciseForm onSaved={(ex: Exercise) => void} />` — 이름/부위/기구/아이콘 입력 폼
  - `<ExercisePicker onSelect={(ex: Exercise) => void} onClose={() => void} />` — 전체 화면 오버레이. 검색(이름 부분일치) + 부위 칩 필터 + "＋ 없는 운동 직접 등록" 토글로 AddExerciseForm 표시. 등록 완료 시 즉시 onSelect.

- [ ] **Step 1: 실패하는 테스트 작성 — src/components/ExercisePicker.test.tsx**

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { db } from '../db/db';
import { seedLibrary } from '../db/exercises';
import ExercisePicker from './ExercisePicker';

beforeEach(async () => {
  await db.delete();
  await db.open();
  await seedLibrary();
});

test('운동 목록이 뜨고 검색으로 좁힐 수 있다', async () => {
  render(<ExercisePicker onSelect={() => {}} onClose={() => {}} />);
  await screen.findByText('벤치프레스');
  fireEvent.change(screen.getByPlaceholderText('운동 이름 검색'), { target: { value: '스쿼트' } });
  await waitFor(() => {
    expect(screen.queryByText('벤치프레스')).not.toBeInTheDocument();
    expect(screen.getByText('스쿼트')).toBeInTheDocument();
  });
});

test('부위 칩으로 필터링된다', async () => {
  render(<ExercisePicker onSelect={() => {}} onClose={() => {}} />);
  await screen.findByText('벤치프레스');
  fireEvent.click(screen.getByRole('button', { name: '하체' }));
  await waitFor(() => {
    expect(screen.queryByText('벤치프레스')).not.toBeInTheDocument();
    expect(screen.getByText('레그 프레스')).toBeInTheDocument();
  });
});

test('운동을 탭하면 onSelect가 불린다', async () => {
  const onSelect = vi.fn();
  render(<ExercisePicker onSelect={onSelect} onClose={() => {}} />);
  fireEvent.click(await screen.findByText('스쿼트'));
  expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'lib-squat' }));
});

test('직접 등록 폼으로 커스텀 운동을 만들면 바로 선택된다', async () => {
  const onSelect = vi.fn();
  render(<ExercisePicker onSelect={onSelect} onClose={() => {}} />);
  fireEvent.click(await screen.findByText('＋ 없는 운동 직접 등록'));
  fireEvent.change(screen.getByLabelText('운동 이름'), { target: { value: '스미스머신 벤치' } });
  fireEvent.click(screen.getByRole('button', { name: '등록' }));
  await waitFor(() => {
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ name: '스미스머신 벤치', isCustom: true }),
    );
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/components/ExercisePicker.test.tsx` → FAIL

- [ ] **Step 3: src/components/AddExerciseForm.tsx 구현**

```tsx
import { useState } from 'react';
import { BODY_PARTS, EQUIPMENTS, ICON_KEYS } from '../types';
import type { BodyPart, Equipment, Exercise, IconKey } from '../types';
import { addCustomExercise } from '../db/exercises';
import ExerciseIcon from './ExerciseIcon';

export default function AddExerciseForm({ onSaved }: { onSaved: (ex: Exercise) => void }) {
  const [name, setName] = useState('');
  const [bodyPart, setBodyPart] = useState<BodyPart>('가슴');
  const [equipment, setEquipment] = useState<Equipment>('바벨');
  const [iconKey, setIconKey] = useState<IconKey>('barbell');

  async function submit() {
    if (!name.trim()) return;
    const ex = await addCustomExercise({ name, bodyPart, equipment, iconKey });
    onSaved(ex);
  }

  return (
    <div className="card">
      <div className="field">
        <label htmlFor="ex-name">운동 이름</label>
        <input id="ex-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 스미스머신 벤치" />
      </div>
      <div className="field">
        <label htmlFor="ex-body">부위</label>
        <select id="ex-body" value={bodyPart} onChange={(e) => setBodyPart(e.target.value as BodyPart)}>
          {BODY_PARTS.map((b) => <option key={b}>{b}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="ex-equip">기구</label>
        <select id="ex-equip" value={equipment} onChange={(e) => setEquipment(e.target.value as Equipment)}>
          {EQUIPMENTS.map((eq) => <option key={eq}>{eq}</option>)}
        </select>
      </div>
      <div className="field">
        <label>아이콘</label>
        <div className="icon-picks">
          {ICON_KEYS.map((k) => (
            <button key={k} type="button" className={`icon-pick ${k === iconKey ? 'on' : ''}`} onClick={() => setIconKey(k)} aria-label={k}>
              <ExerciseIcon iconKey={k} size={24} />
            </button>
          ))}
        </div>
      </div>
      <button className="btn btn-primary" onClick={submit}>등록</button>
    </div>
  );
}
```

- [ ] **Step 4: src/components/ExercisePicker.tsx 구현**

```tsx
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { BODY_PARTS } from '../types';
import type { BodyPart, Exercise } from '../types';
import { listExercises } from '../db/exercises';
import ExerciseImage from './ExerciseImage';
import AddExerciseForm from './AddExerciseForm';

type Filter = BodyPart | '전체';

export default function ExercisePicker({
  onSelect, onClose,
}: {
  onSelect: (ex: Exercise) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('전체');
  const [adding, setAdding] = useState(false);
  const exercises = useLiveQuery(() => listExercises(), []) ?? [];

  const visible = exercises.filter(
    (e) =>
      (filter === '전체' || e.bodyPart === filter) &&
      (query.trim() === '' || e.name.includes(query.trim())),
  );

  return (
    <div className="overlay">
      <div className="topnav">
        <button onClick={onClose} aria-label="닫기">←</button>
        <span className="title">운동 추가</span>
        <span style={{ width: 26 }} />
      </div>
      <div className="screen">
        <input
          className="search" placeholder="운동 이름 검색"
          value={query} onChange={(e) => setQuery(e.target.value)}
        />
        <div className="chips">
          {(['전체', ...BODY_PARTS] as Filter[]).map((b) => (
            <button key={b} className={`chip ${filter === b ? 'on' : ''}`} onClick={() => setFilter(b)}>
              {b}
            </button>
          ))}
        </div>
        {visible.map((ex) => (
          <button key={ex.id} className="ex-row" onClick={() => onSelect(ex)}>
            <ExerciseImage exercise={ex} />
            <div>
              <div className="nm">{ex.name}</div>
              <div className="sb">{ex.bodyPart} · {ex.equipment}</div>
            </div>
          </button>
        ))}
        {visible.length === 0 && <div className="empty">검색 결과가 없어요</div>}
        {adding ? (
          <AddExerciseForm onSaved={(ex) => { setAdding(false); onSelect(ex); }} />
        ) : (
          <button className="btn btn-ghost" onClick={() => setAdding(true)}>＋ 없는 운동 직접 등록</button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: 통과 확인 후 커밋**

Run: `npx vitest run src/components/ExercisePicker.test.tsx` → PASS 4 tests
Run: `npm test` → 전체 PASS

```bash
git add src/components/
git commit -m "feat: 운동 선택 화면(검색/부위 필터)과 직접 등록 폼"
```

---

### Task 9: 세션 화면 (핵심) + 휴식 타이머

**Files:**
- Create: `src/components/RestTimer.tsx`
- Modify: `src/screens/SessionScreen.tsx`(전체 교체)
- Test: `src/screens/SessionScreen.test.tsx`

**Interfaces:**
- Consumes: `getActiveSession`, `saveSession`, `finishSession`, `discardSession`, `buildEntry`(Task 5), `getLastRecord`(Task 5), `listExercises`(Task 4), `getRestSeconds`(Task 2), `ExercisePicker`(Task 8), `ExerciseImage`(Task 7)
- Produces:
  - `/session` 라우트의 완전한 세션 화면. 활성 세션이 없으면 홈으로 리다이렉트.
  - `<RestTimer until={number} onSkip={() => void} />` — `until`(epoch ms)까지 카운트다운 바, 끝나면 사라짐

- [ ] **Step 1: src/components/RestTimer.tsx 구현**

```tsx
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
```

- [ ] **Step 2: 실패하는 테스트 작성 — src/screens/SessionScreen.test.tsx**

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { db } from '../db/db';
import { seedLibrary } from '../db/exercises';
import { startSession, getActiveSession } from '../db/sessions';
import type { Routine } from '../types';
import SessionScreen from './SessionScreen';

const routine: Routine = {
  id: 'r1', name: '가슴 날',
  items: [
    { exerciseId: 'lib-bench-press', defaultSets: 2 },
    { exerciseId: 'lib-squat', defaultSets: 2 },
  ],
};

beforeEach(async () => {
  await db.delete();
  await db.open();
  await seedLibrary();
});

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/session']}>
      <SessionScreen />
    </MemoryRouter>,
  );
}

test('활성 세션의 첫 운동과 세트가 표시된다', async () => {
  await startSession(routine);
  renderScreen();
  expect(await screen.findByText('벤치프레스')).toBeInTheDocument();
  expect(screen.getByText('1 / 2')).toBeInTheDocument();
  expect(screen.getAllByLabelText(/세트 \d+ 완료/)).toHaveLength(2);
});

test('세트를 체크하면 completedAt이 저장되고 휴식 타이머가 나타난다', async () => {
  await startSession(routine);
  renderScreen();
  await screen.findByText('벤치프레스');
  fireEvent.click(screen.getByLabelText('세트 1 완료'));
  await waitFor(async () => {
    const s = await getActiveSession();
    expect(s?.entries[0].sets[0].completedAt).toBeDefined();
  });
  expect(screen.getByText('건너뛰기')).toBeInTheDocument();
});

test('무게를 수정하면 저장된다', async () => {
  await startSession(routine);
  renderScreen();
  await screen.findByText('벤치프레스');
  const weightInput = screen.getAllByLabelText(/세트 1 무게/)[0];
  fireEvent.change(weightInput, { target: { value: '72.5' } });
  await waitFor(async () => {
    const s = await getActiveSession();
    expect(s?.entries[0].sets[0].weight).toBe(72.5);
  });
});

test('다음 운동으로 이동한다', async () => {
  await startSession(routine);
  renderScreen();
  await screen.findByText('벤치프레스');
  fireEvent.click(screen.getByRole('button', { name: '다음 운동' }));
  expect(await screen.findByText('스쿼트')).toBeInTheDocument();
  expect(screen.getByText('2 / 2')).toBeInTheDocument();
});

test('지난 기록 배지가 표시된다', async () => {
  const prev = await startSession(routine);
  prev.entries[0].sets = [{ weight: 60, reps: 10, completedAt: Date.now() }];
  const { finishSession } = await import('../db/sessions');
  await finishSession(prev);

  await startSession(routine);
  renderScreen();
  expect(await screen.findByText(/지난번 60kg×10/)).toBeInTheDocument();
});
```

- [ ] **Step 3: 실패 확인**

Run: `npx vitest run src/screens/SessionScreen.test.tsx` → FAIL

- [ ] **Step 4: src/screens/SessionScreen.tsx 구현 (전체 교체)**

```tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Exercise, Session, SetRecord } from '../types';
import {
  getActiveSession, saveSession, finishSession, discardSession,
  buildEntry, getLastRecord,
} from '../db/sessions';
import { listExercises } from '../db/exercises';
import { getRestSeconds } from '../db/settings';
import ExerciseImage from '../components/ExerciseImage';
import ExercisePicker from '../components/ExercisePicker';
import RestTimer from '../components/RestTimer';

function fmtElapsed(startedAt: number, now: number): string {
  const sec = Math.max(0, Math.floor((now - startedAt) / 1000));
  const mm = String(Math.floor(sec / 60)).padStart(2, '0');
  const ss = String(sec % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function fmtLast(sets: SetRecord[]): string {
  return sets.map((s, i) => (i === 0 ? `${s.weight}kg×${s.reps}` : `${s.weight}×${s.reps}`)).join(' · ');
}

export default function SessionScreen() {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [idx, setIdx] = useState(0);
  const [restUntil, setRestUntil] = useState(0);
  const [restTotal, setRestTotal] = useState(90);
  const [showPicker, setShowPicker] = useState(false);
  const [lastRecord, setLastRecord] = useState<SetRecord[] | undefined>();
  const [now, setNow] = useState(Date.now());
  const exercises = useLiveQuery(() => listExercises({ includeHidden: true }), []) ?? [];
  const exMap = new Map(exercises.map((e) => [e.id, e]));

  useEffect(() => {
    getActiveSession().then((s) => {
      if (!s) navigate('/', { replace: true });
      else setSession(s);
    });
  }, [navigate]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const entry = session?.entries[idx];

  useEffect(() => {
    if (!entry) { setLastRecord(undefined); return; }
    getLastRecord(entry.exerciseId).then(setLastRecord);
  }, [entry?.exerciseId]);

  if (!session) return null;

  async function update(next: Session) {
    setSession(next);
    await saveSession(next);
  }

  function patchSet(setIdx: number, patch: Partial<SetRecord>) {
    if (!session || !entry) return;
    const entries = session.entries.map((e, i) =>
      i !== idx ? e : { ...e, sets: e.sets.map((s, j) => (j !== setIdx ? s : { ...s, ...patch })) },
    );
    void update({ ...session, entries });
  }

  function toggleSet(setIdx: number) {
    if (!entry) return;
    const s = entry.sets[setIdx];
    if (s.completedAt) {
      patchSet(setIdx, { completedAt: undefined });
    } else {
      patchSet(setIdx, { completedAt: Date.now() });
      const restSec = getRestSeconds();
      setRestTotal(restSec);
      setRestUntil(Date.now() + restSec * 1000);
    }
  }

  function addSet() {
    if (!session || !entry) return;
    const lastSet = entry.sets[entry.sets.length - 1] ?? { weight: 0, reps: 10 };
    const entries = session.entries.map((e, i) =>
      i !== idx ? e : { ...e, sets: [...e.sets, { weight: lastSet.weight, reps: lastSet.reps }] },
    );
    void update({ ...session, entries });
  }

  async function addExercise(ex: Exercise) {
    if (!session) return;
    setShowPicker(false);
    const newEntry = await buildEntry(ex.id);
    const next = { ...session, entries: [...session.entries, newEntry] };
    await update(next);
    setIdx(next.entries.length - 1);
  }

  async function finish() {
    if (!session) return;
    const doneCount = session.entries.flatMap((e) => e.sets).filter((s) => s.completedAt).length;
    if (doneCount === 0) {
      if (window.confirm('완료한 세트가 없어요. 세션을 버릴까요?')) {
        await discardSession(session.id);
        navigate('/', { replace: true });
      }
      return;
    }
    if (!window.confirm('운동을 완료할까요?')) return;
    await finishSession(session);
    navigate('/', { replace: true });
  }

  const ex = entry ? exMap.get(entry.exerciseId) : undefined;
  const total = session.entries.length;

  return (
    <>
      <div className="topnav">
        <button onClick={finish} aria-label="세션 종료">✕</button>
        <span className="title">{session.routineName ?? '오늘 운동'} · {total > 0 ? `${idx + 1} / ${total}` : '운동 없음'}</span>
        <span className="clock">{fmtElapsed(session.startedAt, now)}</span>
      </div>
      <div className="progressbar">
        <div style={{ width: total > 0 ? `${((idx + 1) / total) * 100}%` : '0%' }} />
      </div>
      <div className="screen">
        {entry && ex ? (
          <>
            <div className="card">
              <ExerciseImage exercise={ex} className="hero-img" />
              <div className="ex-name">{ex.name}</div>
              <div className="tags">
                <span className="tag">{ex.bodyPart}</span>
                <span className="tag">{ex.equipment}</span>
              </div>
              {lastRecord && <div className="last-pill" style={{ marginTop: 10 }}>🔥 지난번 {fmtLast(lastRecord)}</div>}
            </div>
            <div className="card">
              <div className="set-head"><span>세트</span><span>무게(kg)</span><span>횟수</span><span>완료</span></div>
              {entry.sets.map((s, i) => (
                <div key={i} className={`set-row ${s.completedAt ? 'done' : ''}`} style={{ marginTop: 8 }}>
                  <span className="n">{i + 1}</span>
                  <input
                    type="number" inputMode="decimal" step="0.5" min="0"
                    aria-label={`세트 ${i + 1} 무게`}
                    value={s.weight}
                    onChange={(e) => patchSet(i, { weight: Number(e.target.value) || 0 })}
                  />
                  <input
                    type="number" inputMode="numeric" min="0"
                    aria-label={`세트 ${i + 1} 횟수`}
                    value={s.reps}
                    onChange={(e) => patchSet(i, { reps: Number(e.target.value) || 0 })}
                  />
                  <button
                    className="chk" aria-label={`세트 ${i + 1} 완료`}
                    onClick={() => toggleSet(i)}
                  >
                    ✓
                  </button>
                </div>
              ))}
              <button className="btn btn-ghost" style={{ marginTop: 10 }} onClick={addSet}>＋ 세트 추가</button>
            </div>
          </>
        ) : (
          <div className="empty">아래에서 운동을 추가해 시작하세요</div>
        )}
        <button className="btn btn-ghost" onClick={() => setShowPicker(true)}>＋ 운동 추가</button>
        <RestTimer until={restUntil} total={restTotal} onSkip={() => setRestUntil(0)} />
        <div className="btn-row">
          <button className="btn btn-ghost" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>이전</button>
          {idx < total - 1 ? (
            <button className="btn btn-primary" onClick={() => setIdx(idx + 1)}>다음 운동</button>
          ) : (
            <button className="btn btn-primary" style={{ background: 'var(--green)' }} onClick={finish}>운동 완료</button>
          )}
        </div>
      </div>
      {showPicker && <ExercisePicker onSelect={addExercise} onClose={() => setShowPicker(false)} />}
    </>
  );
}
```

- [ ] **Step 5: 통과 확인**

Run: `npx vitest run src/screens/SessionScreen.test.tsx` → PASS 5 tests
Run: `npm test` → 전체 PASS

- [ ] **Step 6: 수동 검증**

Run: `npm run dev`
브라우저 콘솔에서 임시로 세션 생성 후 확인:
```js
// 개발자도구 콘솔 — 아직 홈 화면이 없으므로 임시 시작
const { startSession } = await import('/src/db/sessions.ts');
await startSession();
location.hash = '#/session';
```
확인 항목: 운동 추가 → 이미지/지난기록 표시 → 무게 수정 → 세트 체크 시 타이머 → 운동 완료 → 홈으로 이동.

- [ ] **Step 7: Commit**

```bash
git add src/screens/SessionScreen.tsx src/screens/SessionScreen.test.tsx src/components/RestTimer.tsx
git commit -m "feat: 운동 세션 화면 — 세트 기록, 지난 기록 표시, 휴식 타이머"
```

---

### Task 10: 홈 화면

**Files:**
- Modify: `src/screens/HomeScreen.tsx`(전체 교체)

**Interfaces:**
- Consumes: `listRoutines`(Task 6), `startSession`, `getActiveSession`, `discardSession`, `listFinishedSessions`(Task 5)
- Produces: 홈 화면 — 다음 루틴 카드, 진행 중 세션 이어하기, 주간 체크, 최근 세션 목록

- [ ] **Step 1: src/screens/HomeScreen.tsx 구현 (전체 교체)**

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Routine, Session } from '../types';
import { listRoutines } from '../db/routines';
import {
  startSession, getActiveSession, discardSession, listFinishedSessions,
} from '../db/sessions';

const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

function weekDates(now: Date): Date[] {
  const monday = new Date(now);
  const day = (now.getDay() + 6) % 7; // 월=0
  monday.setDate(now.getDate() - day);
  monday.setHours(0, 0, 0, 0);
  return DAY_LABELS.map((_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function pickNextRoutine(routines: Routine[], sessions: Session[]): Routine | undefined {
  if (routines.length === 0) return undefined;
  const lastUsed = new Map<string, number>();
  for (const s of sessions) {
    if (s.routineName && !lastUsed.has(s.routineName)) lastUsed.set(s.routineName, s.startedAt);
  }
  return [...routines].sort(
    (a, b) => (lastUsed.get(a.name) ?? 0) - (lastUsed.get(b.name) ?? 0),
  )[0];
}

function fmtDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function HomeScreen() {
  const navigate = useNavigate();
  const [showRoutinePick, setShowRoutinePick] = useState(false);
  const routines = useLiveQuery(() => listRoutines(), []) ?? [];
  const sessions = useLiveQuery(() => listFinishedSessions(), []) ?? [];
  const active = useLiveQuery(() => getActiveSession(), []);

  const today = new Date();
  const week = weekDates(today);
  const workoutDays = new Set(
    sessions.map((s) => new Date(s.startedAt)).map((d) => `${d.getMonth()}-${d.getDate()}`),
  );
  const next = pickNextRoutine(routines, sessions);

  async function begin(routine?: Routine) {
    await startSession(routine);
    navigate('/session');
  }

  async function discardActive() {
    if (active && window.confirm('진행 중이던 세션을 버릴까요?')) await discardSession(active.id);
  }

  return (
    <div className="screen">
      <h1 className="screen-title">
        {today.getMonth() + 1}월 {today.getDate()}일, 오늘도 해볼까요? 💪
      </h1>

      {active ? (
        <div className="startcard">
          <div className="t">진행 중인 운동이 있어요</div>
          <div className="s">{active.routineName ?? '오늘 운동'} · {fmtDate(active.startedAt)} 시작</div>
          <button className="go" onClick={() => navigate('/session')}>이어서 하기</button>
          <button className="go" style={{ marginTop: 8, background: 'rgba(255,255,255,0.2)', color: '#fff' }} onClick={discardActive}>
            버리기
          </button>
        </div>
      ) : (
        <div className="startcard">
          {next ? (
            <>
              <div className="t">{next.name}</div>
              <div className="s">{next.items.length}개 운동</div>
              <button className="go" onClick={() => begin(next)}>운동 시작하기</button>
            </>
          ) : (
            <>
              <div className="t">첫 운동을 시작해보세요</div>
              <div className="s">관리 탭에서 루틴을 만들면 여기에 떠요</div>
              <button className="go" onClick={() => begin()}>빈 세션으로 시작</button>
            </>
          )}
          <button
            className="go" style={{ marginTop: 8, background: 'rgba(255,255,255,0.2)', color: '#fff' }}
            onClick={() => setShowRoutinePick(!showRoutinePick)}
          >
            다른 루틴 선택
          </button>
          {showRoutinePick && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {routines.map((r) => (
                <button key={r.id} className="go" onClick={() => begin(r)}>{r.name}</button>
              ))}
              <button className="go" onClick={() => begin()}>빈 세션</button>
            </div>
          )}
        </div>
      )}

      <div className="card">
        <div className="card-h">이번 주</div>
        <div className="weekrow">
          {week.map((d, i) => {
            const done = workoutDays.has(`${d.getMonth()}-${d.getDate()}`);
            const isToday = sameDay(d, today);
            return (
              <div key={i} className="day">
                {DAY_LABELS[i]}
                <div className={`dot ${done ? 'on' : isToday ? 'today' : ''}`}>
                  {done ? '✓' : d.getDate()}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <div className="card-h">최근 운동</div>
        {sessions.slice(0, 5).map((s) => (
          <div key={s.id} className="hist-row">
            <span>{s.routineName ?? '오늘 운동'} · {s.entries.length}개 운동</span>
            <span className="d">{fmtDate(s.startedAt)}</span>
          </div>
        ))}
        {sessions.length === 0 && <div className="empty">아직 기록이 없어요</div>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 수동 검증**

Run: `npm run dev`
확인: 빈 세션 시작 → 세션 화면 이동 → ✕로 버리기 → 홈에서 "진행 중" 카드 나타남/사라짐. 세션 하나 완료 후 주간 체크와 최근 운동에 반영되는지 확인.

- [ ] **Step 3: 전체 테스트 및 커밋**

Run: `npm test` → 전체 PASS

```bash
git add src/screens/HomeScreen.tsx
git commit -m "feat: 홈 화면 — 다음 루틴 카드, 이어하기, 주간 체크, 최근 기록"
```

---

### Task 11: 기록(히스토리) 화면

**Files:**
- Modify: `src/screens/HistoryScreen.tsx`(전체 교체)

**Interfaces:**
- Consumes: `listFinishedSessions`, `deleteSession`, `getExerciseHistory`(Task 5), `listExercises`(Task 4)
- Produces: 세션 목록(최근순, 탭하면 상세 펼침+삭제), 운동별 필터 모드

- [ ] **Step 1: src/screens/HistoryScreen.tsx 구현 (전체 교체)**

```tsx
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { SetRecord } from '../types';
import { listFinishedSessions, deleteSession, getExerciseHistory } from '../db/sessions';
import { listExercises } from '../db/exercises';

function fmtDate(ts: number): string {
  const d = new Date(ts);
  const day = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  return `${d.getMonth() + 1}/${d.getDate()} (${day})`;
}

function fmtSets(sets: SetRecord[]): string {
  return sets.map((s) => `${s.weight}×${s.reps}`).join(', ');
}

export default function HistoryScreen() {
  const [filterId, setFilterId] = useState('');
  const [openId, setOpenId] = useState('');
  const sessions = useLiveQuery(() => listFinishedSessions(), []) ?? [];
  const exercises = useLiveQuery(() => listExercises({ includeHidden: true }), []) ?? [];
  const history = useLiveQuery(
    () => (filterId ? getExerciseHistory(filterId) : Promise.resolve(null)),
    [filterId],
  );
  const exMap = new Map(exercises.map((e) => [e.id, e]));

  async function remove(id: string) {
    if (window.confirm('이 기록을 삭제할까요?')) await deleteSession(id);
  }

  return (
    <div className="screen">
      <h1 className="screen-title">기록</h1>

      <div className="field">
        <label htmlFor="ex-filter">운동별로 보기</label>
        <select id="ex-filter" value={filterId} onChange={(e) => setFilterId(e.target.value)}>
          <option value="">전체 세션</option>
          {exercises.map((ex) => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
        </select>
      </div>

      {filterId && history ? (
        <div className="card">
          <div className="card-h">{exMap.get(filterId)?.name} 변화</div>
          {history.map(({ session, sets }) => (
            <div key={session.id} className="hist-row">
              <span>{fmtSets(sets)}</span>
              <span className="d">{fmtDate(session.startedAt)}</span>
            </div>
          ))}
          {history.length === 0 && <div className="empty">이 운동의 기록이 없어요</div>}
        </div>
      ) : (
        <>
          {sessions.map((s) => (
            <div key={s.id} className="card" onClick={() => setOpenId(openId === s.id ? '' : s.id)}>
              <div className="hist-row" style={{ borderBottom: openId === s.id ? undefined : 'none' }}>
                <span>{s.routineName ?? '오늘 운동'} · {s.entries.length}개 운동</span>
                <span className="d">{fmtDate(s.startedAt)}</span>
              </div>
              {openId === s.id && (
                <div style={{ marginTop: 8 }}>
                  {s.entries.map((e, i) => (
                    <div key={i} className="hist-row">
                      <span>{exMap.get(e.exerciseId)?.name ?? '삭제된 운동'}</span>
                      <span className="d">{fmtSets(e.sets)}</span>
                    </div>
                  ))}
                  <button
                    className="btn btn-danger" style={{ marginTop: 10 }}
                    onClick={(ev) => { ev.stopPropagation(); void remove(s.id); }}
                  >
                    기록 삭제
                  </button>
                </div>
              )}
            </div>
          ))}
          {sessions.length === 0 && <div className="empty">아직 완료한 운동이 없어요</div>}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 수동 검증**

Run: `npm run dev`
확인: 세션 1~2개 완료 후 기록 탭 → 목록 표시, 탭하면 상세 펼침, 운동별 필터 선택 시 날짜순 무게 변화 표시, 삭제 동작.

- [ ] **Step 3: 전체 테스트 및 커밋**

Run: `npm test` → 전체 PASS

```bash
git add src/screens/HistoryScreen.tsx
git commit -m "feat: 기록 화면 — 세션 목록, 상세 펼침, 운동별 변화 보기"
```

---

### Task 12: 관리 화면 — 운동 목록, 루틴 에디터, 설정, 백업

**Files:**
- Create: `src/components/RoutineEditor.tsx`
- Modify: `src/screens/ManageScreen.tsx`(전체 교체)

**Interfaces:**
- Consumes: `listExercises`, `setExerciseHidden`, `deleteCustomExercise`(Task 4), `listRoutines`, `saveRoutine`, `deleteRoutine`, `newRoutine`(Task 6), `exportData`, `importData`(Task 6), `getRestSeconds`, `setRestSeconds`(Task 2), `ExercisePicker`, `AddExerciseForm`(Task 8), `ExerciseImage`(Task 7)
- Produces: 관리 화면 전체. `<RoutineEditor routine onClose />` — 루틴 이름/운동 추가·제거·순서변경·세트수 편집 후 저장.

- [ ] **Step 1: src/components/RoutineEditor.tsx 구현**

```tsx
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Exercise, Routine } from '../types';
import { listExercises } from '../db/exercises';
import { saveRoutine } from '../db/routines';
import ExercisePicker from './ExercisePicker';

export default function RoutineEditor({
  routine, onClose,
}: {
  routine: Routine;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Routine>({ ...routine, items: [...routine.items] });
  const [showPicker, setShowPicker] = useState(false);
  const exercises = useLiveQuery(() => listExercises({ includeHidden: true }), []) ?? [];
  const exMap = new Map(exercises.map((e) => [e.id, e]));

  function addExercise(ex: Exercise) {
    setShowPicker(false);
    if (draft.items.some((it) => it.exerciseId === ex.id)) return;
    setDraft({ ...draft, items: [...draft.items, { exerciseId: ex.id, defaultSets: 3 }] });
  }

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= draft.items.length) return;
    const items = [...draft.items];
    [items[i], items[j]] = [items[j], items[i]];
    setDraft({ ...draft, items });
  }

  function setSets(i: number, delta: number) {
    const items = draft.items.map((it, k) =>
      k !== i ? it : { ...it, defaultSets: Math.max(1, it.defaultSets + delta) },
    );
    setDraft({ ...draft, items });
  }

  async function save() {
    if (!draft.name.trim()) { window.alert('루틴 이름을 입력하세요.'); return; }
    if (draft.items.length === 0) { window.alert('운동을 하나 이상 추가하세요.'); return; }
    await saveRoutine({ ...draft, name: draft.name.trim() });
    onClose();
  }

  return (
    <div className="overlay">
      <div className="topnav">
        <button onClick={onClose} aria-label="닫기">←</button>
        <span className="title">루틴 편집</span>
        <span style={{ width: 26 }} />
      </div>
      <div className="screen">
        <div className="field">
          <label htmlFor="rt-name">루틴 이름</label>
          <input id="rt-name" value={draft.name} placeholder="예: 가슴 날"
            onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </div>
        {draft.items.map((it, i) => (
          <div key={it.exerciseId} className="card" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800 }}>{exMap.get(it.exerciseId)?.name ?? '삭제된 운동'}</div>
              <div className="stepper" style={{ marginTop: 6 }}>
                <button onClick={() => setSets(i, -1)}>−</button>
                <span>{it.defaultSets}세트</span>
                <button onClick={() => setSets(i, 1)}>＋</button>
              </div>
            </div>
            <button onClick={() => move(i, -1)} aria-label="위로">▲</button>
            <button onClick={() => move(i, 1)} aria-label="아래로">▼</button>
            <button
              style={{ color: 'var(--red)' }} aria-label="빼기"
              onClick={() => setDraft({ ...draft, items: draft.items.filter((_, k) => k !== i) })}
            >
              ✕
            </button>
          </div>
        ))}
        <button className="btn btn-ghost" onClick={() => setShowPicker(true)}>＋ 운동 추가</button>
        <button className="btn btn-primary" onClick={save}>저장</button>
      </div>
      {showPicker && <ExercisePicker onSelect={addExercise} onClose={() => setShowPicker(false)} />}
    </div>
  );
}
```

- [ ] **Step 2: src/screens/ManageScreen.tsx 구현 (전체 교체)**

```tsx
import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Routine } from '../types';
import { listExercises, setExerciseHidden, deleteCustomExercise } from '../db/exercises';
import { listRoutines, deleteRoutine, newRoutine } from '../db/routines';
import { exportData, importData } from '../db/backup';
import { getRestSeconds, setRestSeconds } from '../db/settings';
import ExerciseImage from '../components/ExerciseImage';
import AddExerciseForm from '../components/AddExerciseForm';
import RoutineEditor from '../components/RoutineEditor';

export default function ManageScreen() {
  const [editing, setEditing] = useState<Routine | null>(null);
  const [addingEx, setAddingEx] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [rest, setRest] = useState(getRestSeconds());
  const fileRef = useRef<HTMLInputElement>(null);
  const routines = useLiveQuery(() => listRoutines(), []) ?? [];
  const exercises = useLiveQuery(() => listExercises({ includeHidden: true }), []) ?? [];

  const visibleExercises = showHidden ? exercises : exercises.filter((e) => !e.isHidden);

  async function doExport() {
    const data = await exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const d = new Date();
    a.download = `workout-backup-${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function doImport(file: File) {
    if (!window.confirm('가져오기는 현재 데이터를 전부 교체합니다. 계속할까요?')) return;
    try {
      const raw: unknown = JSON.parse(await file.text());
      await importData(raw);
      window.alert('가져오기 완료!');
    } catch (e) {
      window.alert(`가져오기 실패: ${e instanceof Error ? e.message : '알 수 없는 오류'}`);
    }
  }

  return (
    <div className="screen">
      <h1 className="screen-title">관리</h1>

      <div className="card">
        <div className="card-h">루틴 템플릿</div>
        {routines.map((r) => (
          <div key={r.id} className="hist-row">
            <span>{r.name} · {r.items.length}개 운동</span>
            <span>
              <button className="btn-sm btn btn-ghost" onClick={() => setEditing(r)}>편집</button>{' '}
              <button
                className="btn-sm btn btn-danger"
                onClick={() => window.confirm(`'${r.name}' 루틴을 삭제할까요?`) && void deleteRoutine(r.id)}
              >
                삭제
              </button>
            </span>
          </div>
        ))}
        {routines.length === 0 && <div className="empty">루틴을 만들어두면 홈에서 바로 시작할 수 있어요</div>}
        <button className="btn btn-primary" style={{ marginTop: 10 }} onClick={() => setEditing(newRoutine())}>
          ＋ 루틴 만들기
        </button>
      </div>

      <div className="card">
        <div className="card-h">내 운동 목록</div>
        <label style={{ fontSize: 12, color: 'var(--gray-5)' }}>
          <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} /> 숨긴 운동 표시
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          {visibleExercises.map((ex) => (
            <div key={ex.id} className="ex-row" style={{ boxShadow: 'none', border: '1px solid var(--gray-1)' }}>
              <ExerciseImage exercise={ex} />
              <div>
                <div className="nm">{ex.name}{ex.isHidden ? ' (숨김)' : ''}</div>
                <div className="sb">{ex.bodyPart} · {ex.equipment}{ex.isCustom ? ' · 직접 등록' : ''}</div>
              </div>
              <div className="right">
                {ex.isCustom ? (
                  <button
                    className="btn-sm btn btn-danger"
                    onClick={() => window.confirm(`'${ex.name}'을(를) 삭제할까요?`) && void deleteCustomExercise(ex.id)}
                  >
                    삭제
                  </button>
                ) : (
                  <button className="btn-sm btn btn-ghost" onClick={() => void setExerciseHidden(ex.id, !ex.isHidden)}>
                    {ex.isHidden ? '보이기' : '숨기기'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        {addingEx ? (
          <div style={{ marginTop: 10 }}>
            <AddExerciseForm onSaved={() => setAddingEx(false)} />
          </div>
        ) : (
          <button className="btn btn-ghost" style={{ marginTop: 10 }} onClick={() => setAddingEx(true)}>
            ＋ 운동 직접 등록
          </button>
        )}
      </div>

      <div className="card">
        <div className="card-h">설정</div>
        <div className="field">
          <label htmlFor="rest-sec">세트 간 휴식 시간 (초)</label>
          <input
            id="rest-sec" type="number" inputMode="numeric" min="10" step="10"
            value={rest}
            onChange={(e) => {
              const n = Number(e.target.value) || 90;
              setRest(n);
              setRestSeconds(n);
            }}
          />
        </div>
      </div>

      <div className="card">
        <div className="card-h">데이터 백업</div>
        <div className="btn-row">
          <button className="btn btn-ghost" onClick={doExport}>내보내기</button>
          <button className="btn btn-ghost" onClick={() => fileRef.current?.click()}>가져오기</button>
        </div>
        <input
          ref={fileRef} type="file" accept="application/json" style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void doImport(f);
            e.target.value = '';
          }}
        />
      </div>

      {editing && <RoutineEditor routine={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
```

- [ ] **Step 3: 수동 검증**

Run: `npm run dev`
확인 시나리오 (전 기능 관통):
1. 관리 → 루틴 만들기 → "가슴 날" + 운동 3개 추가, 세트수/순서 조정 → 저장
2. 홈 → "가슴 날" 카드 → 운동 시작 → 세트 기록 → 완료
3. 다시 시작 → **지난 기록이 미리 채워져 있는지** 확인 (핵심 요구사항)
4. 관리 → 내보내기 → JSON 다운로드 → 가져오기 → 데이터 유지 확인
5. 운동 숨기기/보이기, 커스텀 운동 등록/삭제, 휴식 시간 변경 후 세션에서 반영 확인

- [ ] **Step 4: 전체 테스트 및 커밋**

Run: `npm test` → 전체 PASS
Run: `npm run build` → 성공

```bash
git add src/
git commit -m "feat: 관리 화면 — 루틴 에디터, 운동 관리, 설정, 백업"
```

---

### Task 13: PWA 마무리 — 아이콘, 오프라인 검증, 배포

**Files:**
- Create: `scripts/generate-icons.mjs`, `public/icons/icon-192.png`, `public/icons/icon-512.png`(스크립트 산출물), `README.md`

**Interfaces:**
- Consumes: Task 1의 vite-plugin-pwa 설정 (manifest는 이미 완성)
- Produces: 설치 가능한 오프라인 PWA, 배포 절차 문서

- [ ] **Step 1: scripts/generate-icons.mjs 작성**

```js
import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
  <rect width="512" height="512" rx="112" fill="#3182F6"/>
  <g stroke="#fff" stroke-width="28" stroke-linecap="round" fill="#fff">
    <line x1="96" y1="256" x2="416" y2="256"/>
    <rect x="128" y="168" width="44" height="176" rx="14"/>
    <rect x="340" y="168" width="44" height="176" rx="14"/>
    <rect x="72" y="200" width="32" height="112" rx="12"/>
    <rect x="408" y="200" width="32" height="112" rx="12"/>
  </g>
</svg>`;

await mkdir('public/icons', { recursive: true });
for (const size of [192, 512]) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(`public/icons/icon-${size}.png`);
  console.log(`✓ icon-${size}.png`);
}
```

Run: `npm run icons` → `public/icons/icon-192.png`, `icon-512.png` 생성

- [ ] **Step 2: 프로덕션 빌드 + 오프라인 수동 검증**

Run: `npm run build && npm run preview`
확인:
1. 브라우저에서 preview URL 접속 → 개발자도구 Application 탭 → Service Worker 등록 확인, Manifest에 이름/아이콘 표시 확인
2. 전체 플로우 1회 실행 (루틴 → 세션 → 기록)
3. 개발자도구 Network → **Offline 체크** → 새로고침 → 앱이 뜨고 운동 이미지까지 표시되는지 확인
4. Lighthouse PWA 카테고리 통과 확인 (선택)

- [ ] **Step 3: README.md 작성**

```markdown
# 운동기록 (Workout Tracker)

점진적 과부하를 위한 개인용 운동 기록 PWA. 모든 데이터는 폰 로컬(IndexedDB)에만 저장됩니다.

## 개발

​```bash
npm install
npm run fetch-images   # 최초 1회: 운동 이미지 다운로드 (public/exercises/)
npm run icons          # 최초 1회: PWA 아이콘 생성
npm run dev            # 개발 서버
npm test               # 테스트
​```

## 배포 (GitHub Pages)

​```bash
# GitHub에 repo 생성 후 remote 연결이 되어 있다면:
npm run deploy         # dist/를 gh-pages 브랜치로 푸시
​```

GitHub repo → Settings → Pages → Branch를 `gh-pages`로 설정.
배포 후 폰 브라우저로 접속 → 공유 → "홈 화면에 추가"로 설치.

## 데이터 백업

관리 탭 → 데이터 백업 → 내보내기로 JSON 파일 저장. 폰을 바꾸면 가져오기로 복원.
```

(코드펜스 안의 ​``` 는 실제 파일에서는 일반 ``` 로 작성)

- [ ] **Step 4: 최종 검증 및 커밋**

Run: `npm test` → 전체 PASS
Run: `npm run build` → 성공

```bash
git add -A
git commit -m "feat: PWA 아이콘, README, 배포 준비 완료"
```

- [ ] **Step 5: 배포는 사용자와 함께**

GitHub repo 생성/연결은 사용자 계정 권한이 필요하므로, 완료 후 사용자에게 배포 희망 여부를 확인하고 진행한다 (`gh repo create workout-tracker --private` → `npm run deploy`).

---

## Self-Review 결과

- **스펙 커버리지:** 홈/세션/기록/관리 4화면(T7~T12), 지난 기록 미리 채우기(T5), 루틴 템플릿(T6, T12), 내장 라이브러리+이미지(T3, T4), 커스텀 운동+아이콘(T8), 휴식 타이머+설정(T9, T12), 세트 즉시 저장+세션 복구(T9, T10), 백업(T6, T12), PWA/오프라인(T1, T13) — 스펙의 모든 요구사항에 대응 태스크 존재.
- **의도적 단순화:** 기록 화면의 "캘린더 뷰"는 스펙에서 목록+주간 체크로 충분히 커버되어 목록형으로 구현 (스펙 문구 "날짜순 목록" 준수).
- **타입 일관성:** `SetRecord.completedAt?: number`가 완료 판정 기준으로 전 태스크에서 동일하게 사용됨. `buildEntry`/`getLastRecord` 시그니처가 T5 정의와 T9 사용처에서 일치함을 확인.
