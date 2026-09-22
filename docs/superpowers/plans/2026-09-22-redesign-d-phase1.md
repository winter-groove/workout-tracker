# D 리디자인 Phase 1 — 다크 테마 기반 + 3탭 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 앱 전체를 다크+라임 테마로 전환하고 탭을 홈/기록/마이 3탭(SVG 아이콘)으로 개편, PWA 매니페스트·앱 아이콘 다크화 — 화면 구조는 무변경.

**Architecture:** `styles.css`의 기존 변수명(`--blue`, `--gray-*` 등)을 다크 값 별칭으로 재매핑해 컴포넌트 무수정 일괄 전환. 별칭으로 구분이 사라지는 지점(페이지 배경 vs 카드 내 채움, 완료 세트, 활성 탭, 체크박스)만 명시 교체.

**Tech Stack:** React 18 + TypeScript, vite-plugin-pwa, sharp(아이콘 생성), vitest

**Spec:** `docs/superpowers/specs/2026-09-22-redesign-d-master.md` (Phase 1 절)

## Global Constraints

- 데이터 모델·Dexie 스키마·백업 포맷 무변경, 기능 제거 0
- 화면 구조·문구는 이 계획에 명시된 것 외 무변경 — 기존 테스트는 App.test.tsx의 '관리'→'마이' 1건만 갱신, 나머지 200개 무변경 통과
- 본문 텍스트 대비 4.5:1 이상 (다크 배경 기준 — 토큰 표는 스펙 참조)
- 아이콘은 인라인 스트로크 SVG (이모지 금지), UI 문구 한국어, 새 npm 의존성 금지
- 테스트 실행: `npx vitest run <파일경로>` (전체는 `npm test`, 현재 200개)

---

### Task 1: 다크 토큰 재매핑 — styles.css 전면 교체

**Files:**
- Modify: `src/styles.css` (전체 교체)
- Test: 기존 전체 테스트 **무변경 통과가 게이트** (CSS는 테스트가 단언하지 않음 — 신규 테스트 없음)

**Interfaces:**
- Produces: CSS 변수 `--bg --surface --surface-2 --border --text --text-2 --muted --accent --on-accent --positive --warn --danger` (Phase 2~4와 Task 2가 사용). 구 변수명은 별칭으로 유지되어 기존 컴포넌트 인라인 `var(...)` 사용처가 그대로 동작

- [ ] **Step 1: styles.css 전체를 다음으로 교체**

```css
:root {
  /* D 리디자인 다크 토큰 */
  --bg: #0E1013;
  --surface: #17191E;
  --surface-2: #22262E;
  --border: #262A32;
  --text: #F2F4F6;
  --text-2: #C6CCD4;
  --muted: #9AA3AF;
  --accent: #C9EB3A;
  --on-accent: #14170A;
  --positive: #8FBF3C;
  --positive-bg: #1C2418;
  --warn: #E0A85C;
  --danger: #E96A6A;
  --danger-bg: #2A1A1C;
  --radius: 16px;
  /* 구 토큰 별칭 — 컴포넌트 무수정 일괄 전환용 (신규 코드는 위 토큰 사용) */
  --blue: var(--accent);
  --blue-bg: var(--surface-2);
  --navy: #1C1F25;
  --gray-9: var(--text);
  --gray-7: var(--text-2);
  --gray-5: var(--muted);
  --gray-3: #4A505A;
  --gray-2: var(--border);
  --gray-1: var(--surface-2);
  --green: var(--positive);
  --green-bg: var(--positive-bg);
  --red: var(--danger);
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Pretendard', sans-serif;
  background: var(--bg);
  color: var(--text);
  -webkit-tap-highlight-color: transparent;
}
#root { height: 100%; }
button { font: inherit; border: none; background: none; cursor: pointer; color: inherit; }
input, select { font: inherit; }

.app { max-width: 480px; margin: 0 auto; min-height: 100dvh; display: flex; flex-direction: column; }
.screen { flex: 1; padding: 16px 16px 90px; display: flex; flex-direction: column; gap: 14px; }
.screen-title { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; padding-top: 8px; }

.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; }
.card-h { font-size: 13px; font-weight: 800; color: var(--text-2); margin-bottom: 10px; }

.btn { display: block; width: 100%; text-align: center; padding: 14px; border-radius: 14px; font-size: 15px; font-weight: 800; }
.btn-primary { background: var(--accent); color: var(--on-accent); }
.btn-ghost { background: var(--surface-2); color: var(--text-2); }
.btn-danger { background: var(--danger-bg); color: var(--danger); }
.btn-row { display: flex; gap: 8px; }
.btn-row .btn { flex: 1; }
.btn-sm { display: inline-block; width: auto; padding: 8px 14px; font-size: 13px; border-radius: 10px; }
/* 버튼 3개가 한 줄에 들어가는 좁은 화면(360px~)용 — 세로 터치 영역은 유지하고 가로만 줄인다 */
.btn-row.tight .btn { padding: 14px 6px; font-size: 13.5px; white-space: nowrap; }

.tag { font-size: 11px; font-weight: 600; color: var(--text-2); background: var(--surface-2); border-radius: 6px; padding: 3px 8px; }
.last-pill { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; color: var(--positive); background: var(--positive-bg); border-radius: 8px; padding: 6px 10px; }

.tabbar { position: fixed; bottom: 0; left: 0; right: 0; max-width: 480px; margin: 0 auto; display: flex; background: var(--surface); border-top: 1px solid var(--border); padding: 8px 0 max(20px, env(safe-area-inset-bottom)); z-index: 10; }
.tabbar a { flex: 1; text-align: center; font-size: 10.5px; font-weight: 700; color: var(--muted); text-decoration: none; }
.tabbar a.active { color: var(--accent); }
.tabbar .ic { display: flex; justify-content: center; margin-bottom: 3px; }

.startcard { background: var(--surface); border: 1px solid var(--border); border-radius: 20px; padding: 18px; color: var(--text); }
.startcard .t { font-size: 17px; font-weight: 800; }
.startcard .s { font-size: 12.5px; color: var(--muted); margin-top: 4px; }
.startcard .go { margin-top: 14px; background: var(--accent); color: var(--on-accent); border-radius: 12px; text-align: center; padding: 11px; font-size: 14px; font-weight: 800; width: 100%; }

.weekrow { display: flex; justify-content: space-between; }
.day { text-align: center; font-size: 11px; color: var(--muted); font-weight: 600; }
.day .dot { width: 32px; height: 32px; border-radius: 50%; margin: 6px auto 0; background: var(--surface-2); display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; color: var(--muted); }
.day .dot.on { background: var(--accent); color: var(--on-accent); }
.day .dot.today { border: 2px solid var(--accent); color: var(--accent); background: var(--surface); }
.day .dot.future { background: transparent; color: var(--gray-3); }
.cal-head { display: flex; justify-content: space-between; align-items: center; font-size: 14px; font-weight: 800; margin-bottom: 10px; }
.cal-head button { background: none; border: none; font-size: 13px; color: var(--accent); padding: 4px 10px; cursor: pointer; }
.day button.dot { border: none; padding: 0; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
.day .dot.sel { box-shadow: 0 0 0 2px var(--accent); }

.hist-row { display: flex; justify-content: space-between; align-items: center; font-size: 13.5px; font-weight: 600; padding: 8px 0; border-bottom: 1px solid var(--border); }
.hist-row:last-child { border-bottom: none; }
.hist-row .d { color: var(--muted); font-weight: 500; }

.set-view { display: grid; grid-template-columns: 40px 1fr 1fr; gap: 6px; text-align: center; font-size: 13.5px; font-weight: 600; }

.topnav { display: flex; justify-content: space-between; align-items: center; padding: 10px 16px; background: var(--surface); position: sticky; top: 0; z-index: 5; }
.topnav .title { font-weight: 700; font-size: 14px; }
.topnav .clock { color: var(--accent); font-weight: 700; font-variant-numeric: tabular-nums; }
.topnav button { font-size: 18px; color: var(--muted); padding: 4px; }
.progressbar { height: 3px; background: var(--border); }
.progressbar > div { height: 100%; background: var(--accent); transition: width 0.3s; }

.hero-img { width: 100%; height: 170px; object-fit: cover; display: block; border-radius: 14px; background: var(--surface-2); }
.hero-icon { width: 100%; height: 120px; border-radius: 14px; background: linear-gradient(135deg, #1E2430, #232031); display: flex; align-items: center; justify-content: center; }
.ex-name { font-size: 19px; font-weight: 800; letter-spacing: -0.3px; margin-top: 10px; }
.tags { display: flex; align-items: center; gap: 6px; margin-top: 6px; }

.set-head, .set-row { display: grid; grid-template-columns: 32px 1fr 1fr 44px; gap: 6px; align-items: center; text-align: center; }
.set-head { font-size: 11px; color: var(--muted); font-weight: 600; }
.set-row .n { font-size: 13px; font-weight: 700; color: var(--muted); }
.set-row input { width: 100%; background: var(--surface-2); border: none; border-radius: 10px; padding: 10px 0; font-size: 15px; font-weight: 800; text-align: center; font-variant-numeric: tabular-nums; color: var(--text); }
.set-row input:focus { outline: 2px solid var(--accent); }
.set-row.done input { background: #232A18; color: var(--accent); }
.set-row .chk { width: 30px; height: 30px; border-radius: 9px; margin: 0 auto; border: 2px solid var(--gray-3); background: var(--surface); color: transparent; font-size: 14px; font-weight: 800; display: flex; align-items: center; justify-content: center; }
.set-row.done .chk { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }

.rest { background: var(--navy); color: var(--text); border-radius: 14px; padding: 12px 16px; display: flex; align-items: center; gap: 12px; position: sticky; bottom: 90px; }
.rest .lbl { font-size: 12px; font-weight: 700; color: var(--muted); }
.rest .time { font-size: 20px; font-weight: 800; font-variant-numeric: tabular-nums; }
.rest .bar { flex: 1; height: 6px; border-radius: 3px; background: #333B45; overflow: hidden; }
.rest .bar > div { height: 100%; background: var(--accent); border-radius: 3px; transition: width 1s linear; }
.rest .skip { font-size: 12px; font-weight: 700; color: var(--muted); }

.overlay { position: fixed; inset: 0; background: var(--bg); z-index: 20; max-width: 480px; margin: 0 auto; display: flex; flex-direction: column; overflow-y: auto; }
.search { background: var(--surface-2); border: 1px solid var(--border); border-radius: 12px; padding: 11px 14px; font-size: 14px; width: 100%; color: var(--text); }
.chips { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 2px; }
.chip { font-size: 12.5px; font-weight: 700; color: var(--text-2); background: var(--surface-2); border: 1px solid var(--border); border-radius: 999px; padding: 7px 14px; white-space: nowrap; }
.chip.on { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }

.ex-row { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 10px; display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; }
.ex-row img, .ex-row .thumb-icon { width: 56px; height: 56px; border-radius: 12px; object-fit: cover; background: linear-gradient(135deg, #1E2430, #232031); flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
.ex-row .nm { font-size: 15px; font-weight: 800; letter-spacing: -0.3px; }
.ex-row .sb { font-size: 12px; color: var(--muted); margin-top: 2px; }
.ex-row .right { margin-left: auto; flex-shrink: 0; }

.field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
.field label { font-size: 12px; font-weight: 700; color: var(--text-2); }
.field input, .field select { background: var(--surface-2); border: none; border-radius: 10px; padding: 11px 12px; font-size: 14px; width: 100%; color: var(--text); }
.icon-picks { display: flex; gap: 8px; }
.icon-pick { width: 44px; height: 44px; border-radius: 10px; background: var(--surface-2); display: flex; align-items: center; justify-content: center; border: 2px solid transparent; }
.icon-pick.on { border-color: var(--accent); background: var(--surface-2); }

.stepper { display: inline-flex; align-items: center; gap: 10px; }
.stepper button { width: 28px; height: 28px; border-radius: 8px; background: var(--surface-2); font-weight: 800; font-size: 16px; }
.stepper span { font-weight: 800; min-width: 20px; text-align: center; }

.empty { text-align: center; color: var(--muted); font-size: 13px; padding: 30px 0; }
```

주의: 위가 파일의 **전체 내용**이다 — 기존 규칙 중 빠진 것이 없는지 교체 전 `git diff`로 셀렉터 목록을 대조할 것 (`grep -oE '^\.[a-z-]+' src/styles.css | sort -u` 비교). 인라인 스타일로 색을 하드코딩한 컴포넌트(예: HomeScreen 버리기 버튼의 rgba 흰색)는 다크 위에서도 성립하므로 이 Task에서 건드리지 않는다.

- [ ] **Step 2: 테스트·빌드 확인**

Run: `npm test` → **200 passed 무변경**, `npx tsc --noEmit`, `npm run build` → 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add src/styles.css
git commit -m "feat: D 다크 테마 토큰 — 구 변수 별칭 재매핑으로 전 화면 일괄 전환"
```

---

### Task 2: 탭바 3탭 + SVG 아이콘 + '관리'→'마이'

**Files:**
- Modify: `src/components/TabBar.tsx` (전체 교체), `src/screens/ManageScreen.tsx:73`, `src/screens/HomeScreen.tsx:120`, `src/App.test.tsx:8`

**Interfaces:**
- Consumes (Task 1): `.tabbar .ic`가 SVG 컨테이너로 동작
- Produces: 탭 라벨 '홈'/'기록'/'마이' (Phase 2~4 문구 기준)

- [ ] **Step 1: 기존 테스트 갱신 (라벨 변경분만)**

`src/App.test.tsx`의 `expect(screen.getByText('관리')).toBeInTheDocument();` 를 다음으로 교체:

```tsx
  expect(screen.getByText('마이')).toBeInTheDocument();
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/App.test.tsx`
Expected: 갱신 1개 FAIL ('마이' 없음), 나머지 PASS

- [ ] **Step 3: 구현**

`src/components/TabBar.tsx` 전체 교체:

```tsx
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
```

`src/screens/ManageScreen.tsx`: `<h1 className="screen-title">관리</h1>` → `<h1 className="screen-title">마이</h1>`

`src/screens/HomeScreen.tsx`: `<div className="s">관리 탭에서 루틴을 만들면 여기에 떠요</div>` → `<div className="s">마이 탭에서 루틴을 만들면 여기에 떠요</div>`

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/App.test.tsx src/screens/ManageScreen.test.tsx src/screens/HomeScreen.test.tsx`
Expected: 전부 PASS

- [ ] **Step 5: 커밋**

```bash
git add src/components/TabBar.tsx src/screens/ManageScreen.tsx src/screens/HomeScreen.tsx src/App.test.tsx
git commit -m "feat: 탭바 홈/기록/마이 3탭 — SVG 아이콘, 라임 활성색"
```

---

### Task 3: PWA 다크 — 매니페스트·메타·앱 아이콘

**Files:**
- Modify: `vite.config.ts:31-32`, `index.html:7`, `scripts/generate-icons.mjs`
- Regenerate: `public/icons/icon-192.png`, `public/icons/icon-512.png`

- [ ] **Step 1: 구현**

`vite.config.ts`: `theme_color: '#3182F6'` → `theme_color: '#0E1013'`, `background_color: '#ffffff'` → `background_color: '#0E1013'`

`index.html`: `<meta name="theme-color" content="#3182F6" />` → `<meta name="theme-color" content="#0E1013" />`

`scripts/generate-icons.mjs`의 `svg` 상수를 다음으로 교체 (모서리 명/보/품/쌈 유지, 다크 배경 + 라임 바벨):

```js
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
  <rect width="512" height="512" rx="112" fill="#0E1013"/>
  <g stroke="#C9EB3A" stroke-width="28" stroke-linecap="round" fill="#C9EB3A">
    <line x1="96" y1="256" x2="416" y2="256"/>
    <rect x="128" y="168" width="44" height="176" rx="14"/>
    <rect x="340" y="168" width="44" height="176" rx="14"/>
    <rect x="72" y="200" width="32" height="112" rx="12"/>
    <rect x="408" y="200" width="32" height="112" rx="12"/>
  </g>
  <g fill="#F2F4F6" font-family="'Apple SD Gothic Neo', 'AppleGothic', sans-serif" font-weight="800" font-size="88">
    <text x="52" y="132" text-anchor="start">명</text>
    <text x="460" y="132" text-anchor="end">보</text>
    <text x="52" y="472" text-anchor="start">품</text>
    <text x="460" y="472" text-anchor="end">쌈</text>
  </g>
</svg>`;
```

Run: `node scripts/generate-icons.mjs` → `✓ icon-192.png`, `✓ icon-512.png`

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 에러 없음, precache에 아이콘 포함

- [ ] **Step 3: 커밋**

```bash
git add vite.config.ts index.html scripts/generate-icons.mjs public/icons
git commit -m "feat: PWA 다크 — 매니페스트 theme_color, 앱 아이콘 다크+라임 재생성"
```

---

### Task 4: 전체 검증

- [ ] **Step 1:** `npm test` → 전체 PASS (200개 — 신규 없음, App.test 갱신 1건 포함)
- [ ] **Step 2:** `npx tsc --noEmit` → 에러 없음
- [ ] **Step 3:** 실패 시 수정 후 `git add -A src && git commit -m "fix: Phase 1 통합 검증 수정"`
