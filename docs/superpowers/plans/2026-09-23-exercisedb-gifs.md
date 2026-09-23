# ExerciseDB 동작 GIF 통합 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 세션 히어로와 목록 썸네일에 ExerciseDB 무료 티어의 2D 동작 GIF를 통합하고, 선화 폴백은 2포즈 크로스페이드로 바꾼다.

**Architecture:** 빌드 시점 파이프라인(`scripts/build-gifs.mjs`)이 ExerciseDB API를 순회·매칭해 `public/gifs/<id>.gif`와 포스터 `<id>.webp`를 만들고 라이브러리 JSON에 `gif` 필드를 기록한다. 런타임은 `Exercise.gif` 유무로 렌더 경로를 고른다(GIF 흰 패널 > 선화 2포즈 > 픽토그램). SW는 gifs/를 런타임 CacheFirst로 캐시한다.

**Tech Stack:** Node 22(fetch), python3+Pillow(포스터 생성, 개발 도구), React 18, Vite PWA(workbox), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-23-exercisedb-gifs-design.md`

## Global Constraints

- 새 npm 의존성 금지. python3+Pillow는 파이프라인(개발 시점) 전용 — 없으면 명확한 오류 메시지로 중단
- 데이터 모델: `Exercise.gif?: string`(형식 `gifs/<id>.gif`) 추가만. 백업 포맷 무변경. `imagePath` 유지
- 매칭은 정밀 우선: 후보가 복수면 자동 매칭하지 않는다. 별칭표(`scripts/gif-aliases.json`)의 없는 libId/exerciseId는 즉시 throw
- 이용 조건: 비상업·출처 표기 — 마이 탭 출처 줄에 `운동 동작 GIF: ExerciseDB (AscendAPI)` 링크(https://ascendapi.com) 필수
- 프레임 규약 변경: 선화는 `<id>.svg` + `<id>-3.svg`(frame-2 폐기). `gif` 있으면 `public/gifs/<id>.gif`·`<id>.webp` 모두 존재
- 애니메이션 상태는 컴포넌트 내부(SessionScreen 재렌더 금지 — 기존 '매초 재조회 금지' 테스트 무변경 통과)
- `prefers-reduced-motion: reduce` → GIF 대신 포스터 정지, 선화도 정지
- 기존 테스트 무변경 통과. 허용된 갱신만: ExerciseHero.test(3프레임→2포즈), exercise-library.test(-2/-3 규약→-3 규약), exercises.test(v6→v7), ManageScreen.test(출처 단언 추가), ExerciseImage.test(포스터 케이스 추가)
- UI 한국어, 토큰 색만 — 단 GIF 패널 배경 `#FFFFFF`는 GIF 흰 배경 이음새 때문에 예외 허용
- 테스트: `npx vitest run <파일>` / 전체 `npm test`

---

### Task 1: GIF 파이프라인 + 데이터

**Files:**
- Create: `scripts/build-gifs.mjs`, `scripts/gif-poster.py`, `scripts/gif-aliases.json`
- Modify: `src/types.ts`(`gif?: string`), `src/data/exercise-library.json`(산출물), `.gitignore`(`.tmp-exercisedb/`, `public/gifs/*.tmp`), `src/data/exercise-library.test.ts`(테스트 2개 추가)
- Create(산출물): `public/gifs/<id>.gif`, `public/gifs/<id>.webp`

**Interfaces:**
- Produces: 라이브러리 항목의 `gif: "gifs/<id>.gif"`(있는 경우), 없던 항목의 `muscles`(GIF 매칭 + ExerciseDB 근육 변환), `Exercise.gif?: string`
- 포스터 경로 규약: `gif.replace(/\.gif$/, '.webp')` — 런타임(Task 2)이 이 규약으로 유도

- [ ] **Step 1: 매니페스트 확보**

`.tmp-exercisedb/manifest.json`이 이미 있으면 재사용(컨트롤러가 스크래치패드에서 복사해 둠). 없으면 스크립트가 순회한다:

```js
// scripts/build-gifs.mjs (발췌) — 순회
const API = 'https://oss.exercisedb.dev/api/v1/exercises';
const UA = 'workout-tracker-pipeline (personal, non-commercial; contact via repo)';
async function fetchManifest() {
  const all = []; let after = '';
  while (true) {
    const r = await fetch(`${API}?limit=25${after ? `&after=${after}` : ''}`, { headers: { 'User-Agent': UA } });
    if (r.status === 429) { await sleep(5000); continue; }
    if (!r.ok) throw new Error(`ExerciseDB HTTP ${r.status}`);
    const j = await r.json();
    all.push(...j.data.map((e) => ({ id: e.exerciseId, name: e.name, gifUrl: e.gifUrl, bodyParts: e.bodyParts, equipments: e.equipments, target: e.targetMuscles, secondary: e.secondaryMuscles })));
    if (!j.meta.hasNextPage || !j.meta.nextCursor) break;
    after = j.meta.nextCursor; await sleep(350);
  }
  return all; // 1,500 기대
}
```

- [ ] **Step 2: 매핑표 (스크립트 상단 상수, 그대로 사용)**

```js
// 그쪽 equipments[0] → 우리 equipment 허용 목록 (모르는 값은 비호환)
const EQUIP_COMPAT = new Map([
  ['barbell', ['바벨']], ['olympic barbell', ['바벨']], ['ez barbell', ['바벨']], ['trap bar', ['바벨']],
  ['dumbbell', ['덤벨']],
  ['cable', ['케이블']],
  ['leverage machine', ['머신']], ['smith machine', ['머신']], ['sled machine', ['머신']],
  ['stepmill machine', ['머신']], ['elliptical machine', ['머신']], ['stationary bike', ['머신']],
  ['upper body ergometer', ['머신']], ['skierg machine', ['머신']],
  ['body weight', ['맨몸']], ['assisted', ['맨몸']], ['weighted', ['맨몸']],
  ['band', ['기타']], ['resistance band', ['기타']], ['kettlebell', ['기타']], ['medicine ball', ['기타']],
  ['stability ball', ['기타']], ['bosu ball', ['기타']], ['roller', ['기타']], ['wheel roller', ['기타']],
  ['rope', ['기타']], ['hammer', ['기타']], ['tire', ['기타']],
]);
// 그쪽 bodyParts[0] → 우리 부위 (cardio/neck은 매칭 대상 아님)
const PART_COMPAT = new Map([
  ['chest', '가슴'], ['back', '등'], ['upper legs', '하체'], ['lower legs', '하체'],
  ['shoulders', '어깨'], ['upper arms', '팔'], ['lower arms', '팔'], ['waist', '코어'],
]);
// 이름 토큰 중 '장비어' — 완화 매칭에서 그쪽 이름에 추가로 있어도 되는 토큰 (한정어 incline/seated 등은 절대 아님)
const EQUIP_WORDS = new Set(['barbell', 'dumbbell', 'cable', 'lever', 'smith', 'sled', 'band', 'kettlebell', 'ez', 'olympic', 'weighted', 'assisted', 'machine', 'bodyweight']);
// 그쪽 근육 어휘 → 우리 근육맵 영역 id (src/data/muscle-regions.ts의 17개만)
const MUSCLE_TO_REGION = new Map([
  ['pectorals', ['chest']], ['upper chest', ['chest']], ['chest', ['chest']], ['serratus anterior', ['obliques']],
  ['lats', ['upper-back']], ['latissimus dorsi', ['upper-back']], ['upper back', ['upper-back']], ['rhomboids', ['upper-back']], ['back', ['upper-back', 'lower-back']],
  ['traps', ['trapezius']], ['trapezius', ['trapezius']], ['levator scapulae', ['trapezius']],
  ['lower back', ['lower-back']], ['spine', ['lower-back']],
  ['delts', ['front-deltoids']], ['deltoids', ['front-deltoids']], ['shoulders', ['front-deltoids']], ['rotator cuff', ['back-deltoids']], ['rear deltoids', ['back-deltoids']],
  ['biceps', ['biceps']], ['brachialis', ['biceps']],
  ['triceps', ['triceps']],
  ['forearms', ['forearm']], ['wrist extensors', ['forearm']], ['wrist flexors', ['forearm']], ['wrists', ['forearm']], ['grip muscles', ['forearm']], ['hands', ['forearm']],
  ['abs', ['abs']], ['abdominals', ['abs']], ['lower abs', ['abs']], ['core', ['abs', 'obliques']], ['obliques', ['obliques']],
  ['quads', ['quadriceps']], ['quadriceps', ['quadriceps']],
  ['hamstrings', ['hamstring']],
  ['glutes', ['gluteal']],
  ['calves', ['calves']], ['soleus', ['calves']], ['shins', ['calves']],
  ['adductors', ['adductor']], ['inner thighs', ['adductor']], ['groin', ['adductor']],
  ['abductors', ['abductors']], ['hip flexors', ['abductors']],
  // 매핑 없음(빈 배열): cardiovascular system, feet, ankles, ankle stabilizers, sternocleidomastoid
]);
```

- [ ] **Step 3: 매칭 규칙 (정밀 우선)**

```js
const norm = (s) => s.toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[_\-\/]/g, ' ').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
const tokens = (s) => new Set(norm(s).split(' ').filter(Boolean).map((t) => t.replace(/s$/, '')));
const setEq = (a, b) => a.size === b.size && [...a].every((t) => b.has(t));
const compatible = (x, e) => PART_COMPAT.get(e.bodyParts[0]) === x.bodyPart
  && (EQUIP_COMPAT.get(e.equipments[0]) ?? []).includes(x.equipment);

// 우선순위: 별칭 → 정확(토큰 집합 동일, 괄호 제거 전 이름 기준) → 괄호 제거 후 유일 후보 → 완화 → 후보 복수면 ambiguous(매칭 안 함)
// 완화: 그쪽 토큰 − EQUIP_WORDS ⊆ 우리 토큰 이고 우리 토큰 ⊆ 그쪽 토큰 이고 compatible
// 결과 stats: { alias, exact, exactStripped, relaxed, ambiguous, excluded, none, download, poster }
// ambiguous 목록은 `.tmp-exercisedb/ambiguous.txt`에 "libId → 후보 id:name | ..." 형식으로 기록 → 별칭 큐레이션 입력
```

정확 일치 단계에서는 `tokens(e.name)`(괄호 포함 원문 → norm이 괄호를 제거하므로 "crunch (hands overhead)"는 'crunch'와 동일해진다)와 `tokens(x.libId)` 비교 — 같은 정규화 키를 가진 ExerciseDB 항목이 **여러 개면** 정확 단계에서 매칭하지 않고 ambiguous로 보낸다(예: crunch 변형 다수). 하나뿐이면 매칭.

- [ ] **Step 4: 별칭 큐레이션**

`ambiguous.txt`와 `none` 중 우리 앱에서 중요한 운동(바벨·덤벨·머신 기본 리프트, 예: bench-press, squat, deadlift, overhead-press, barbell-row, lat-pulldown, leg-press, leg-extension, leg-curl, romanian-deadlift, hip-thrust, pull-up, dip, plank, crunch 등)을 우선 ExerciseDB 이름을 직접 검색해 `scripts/gif-aliases.json`에 확정한다. 확신 없으면 `null`이 아니라 **항목을 넣지 않는다**(null은 "명시적으로 GIF 없음" 의미). 목표 매칭 ≥ 350. 스크립트는 별칭 검증 후 매칭 결과를 `.tmp-exercisedb/matches.txt`(libId → id:name)로 남겨 리뷰어가 전수 확인할 수 있게 한다.

- [ ] **Step 5: 다운로드·포스터**

```js
// 멱등 다운로드: public/gifs/<id>.gif 없을 때만, 300ms 간격, 429는 5초 대기 후 재시도, 실패 3회면 throw
// 다운로드 후 python3 scripts/gif-poster.py public/gifs 실행 → 각 gif의 첫 프레임을 <id>.webp(180×180, quality 82)로 저장(이미 있으면 스킵)
// 매칭에서 빠진 기존 파일(gif/webp)은 삭제해 산출물이 매칭 결과와 정확히 일치하게 한다
```

```python
# scripts/gif-poster.py — 사용: python3 scripts/gif-poster.py public/gifs
import sys, os
from PIL import Image
d = sys.argv[1]
n = 0
for f in sorted(os.listdir(d)):
    if not f.endswith('.gif'): continue
    out = os.path.join(d, f[:-4] + '.webp')
    if os.path.exists(out): continue
    im = Image.open(os.path.join(d, f)); im.seek(0)
    im.convert('RGB').save(out, 'WEBP', quality=82, method=6); n += 1
print(f'poster {n}개 생성')
```

라이브러리 JSON 기록: 매칭된 항목에 `gif: "gifs/<우리 id>.gif"`; `muscles`는 **기존 값이 있으면 유지**, 없으면 `regionsFor(target, secondary)`(주동근 먼저, 중복 제거, 빈 배열이면 필드 생략). 매칭되지 않은 항목의 기존 `gif`는 제거(멱등).

- [ ] **Step 6: 타입·테스트**

`src/types.ts` `Exercise`에 `gif?: string; // gifs/<id>.gif — ExerciseDB 동작 GIF(포스터는 .webp 치환)` 추가.

`src/data/exercise-library.test.ts`에 추가:

```ts
test('gif가 있으면 gifs/<id>.gif 형식이고 gif·webp 파일이 모두 존재한다', () => {
  const withGif = library.filter((x) => x.gif);
  expect(withGif.length).toBeGreaterThanOrEqual(350);
  for (const x of withGif) {
    expect(x.gif).toBe(`gifs/${x.id}.gif`);
    expect(fs.existsSync(path.join('public', x.gif!))).toBe(true);
    expect(fs.existsSync(path.join('public', x.gif!.replace(/\.gif$/, '.webp')))).toBe(true);
  }
});

test('public/gifs에 라이브러리가 참조하지 않는 고아 파일이 없다', () => {
  const referenced = new Set(library.filter((x) => x.gif).flatMap((x) => [path.basename(x.gif!), path.basename(x.gif!).replace(/\.gif$/, '.webp')]));
  for (const f of fs.readdirSync('public/gifs')) expect(referenced.has(f)).toBe(true);
});
```

기존 muscles 어휘 테스트는 그대로 통과해야 한다(새로 채워진 muscles도 17영역 어휘만).

- [ ] **Step 7: 실행·검증·커밋**

`node scripts/build-gifs.mjs` → 통계 출력 확인(매칭 ≥ 350, ambiguous 목록 검토 후 별칭 보강 → 재실행). `npx vitest run src/data/exercise-library.test.ts`, `npm test`, `npx tsc --noEmit` 전부 통과.

```bash
git add scripts/build-gifs.mjs scripts/gif-poster.py scripts/gif-aliases.json src/types.ts src/data/exercise-library.json src/data/exercise-library.test.ts .gitignore public/gifs
git commit -m "feat: ExerciseDB 동작 GIF 파이프라인 — 매칭·다운로드·포스터, gif 필드"
```

---

### Task 2: 런타임 — 히어로 GIF, 썸네일 포스터, 선화 2포즈 폴백, seedLibrary v7

**Files:**
- Modify: `src/components/ExerciseHero.tsx`, `src/components/ExerciseHero.test.tsx`, `src/components/ExerciseImage.tsx`, `src/components/ExerciseImage.test.tsx`, `src/db/exercises.ts`(v7), `src/db/exercises.test.ts`(v6→v7 테스트 갱신), `scripts/build-illustrations.mjs`(frame-2 복사 중단), `src/data/exercise-library.test.ts`(-2/-3 규약 → -3 규약), `public/illustrations/*-2.svg` 삭제

**Interfaces:**
- Consumes: `Exercise.gif`, 포스터 규약 `.gif→.webp`(Task 1)
- Produces: `ExerciseHero`/`ExerciseImage` 렌더 우선순위, `LIBRARY_VERSION = 7`

- [ ] **Step 1: 실패하는 테스트**

`ExerciseHero.test.tsx` — 기존 '3프레임 핑퐁' 테스트를 아래 2포즈 테스트로 **교체**, 나머지 3개 유지(운동 교체 초기화 테스트의 프레임 수 기대치는 2로 조정), 그리고 GIF 테스트 2개 추가:

```tsx
test('선화 폴백은 1↔3 프레임을 왕복한다', () => {
  vi.useFakeTimers();
  try {
    const { container } = render(<ExerciseHero exercise={bench} />); // bench: illustration만, gif 없음
    const imgs = [...container.querySelectorAll<HTMLImageElement>('img')];
    expect(imgs).toHaveLength(2);
    expect(imgs[1].src).toContain('bench-press-3.svg');
    expect(frameOpacities(container)).toEqual(['1', '0']);
    act(() => vi.advanceTimersByTime(650));
    expect(frameOpacities(container)).toEqual(['0', '1']);
    act(() => vi.advanceTimersByTime(650));
    expect(frameOpacities(container)).toEqual(['1', '0']);
  } finally { vi.useRealTimers(); }
});

test('gif가 있으면 GIF 한 장을 흰 패널에 렌더하고 선화 프레임은 렌더하지 않는다', () => {
  const { container } = render(<ExerciseHero exercise={{ ...bench, gif: 'gifs/bench-press.gif' }} />);
  const imgs = [...container.querySelectorAll<HTMLImageElement>('img')];
  expect(imgs).toHaveLength(1);
  expect(imgs[0].src).toContain('gifs/bench-press.gif');
  expect(imgs[0].alt).toBe('벤치프레스 동작');
});

test('reduced-motion이면 GIF 대신 포스터(webp)를 렌더한다', () => {
  const orig = window.matchMedia;
  window.matchMedia = ((q: string) => ({ matches: q.includes('reduced-motion'), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  try {
    const { container } = render(<ExerciseHero exercise={{ ...bench, gif: 'gifs/bench-press.gif' }} />);
    expect(container.querySelector('img')!.src).toContain('gifs/bench-press.webp');
  } finally { window.matchMedia = orig; }
});
```

`ExerciseImage.test.tsx` 추가:

```tsx
test('gif가 있으면 포스터(webp)를 썸네일로 렌더한다', () => {
  render(<ExerciseImage exercise={{ ...ex, gif: 'gifs/bench-press.gif', illustration: 'illustrations/bench-press.svg' }} />);
  expect(screen.getByRole('img').getAttribute('src')).toContain('gifs/bench-press.webp');
});
```

`exercises.test.ts` — v6 동기화 테스트를 v7로 갱신: `gif`도 리셋 후 동기화되어 `expect(ex?.gif).toBe('gifs/bench-press.gif')`(bench-press가 GIF 매칭되어 있어야 함 — Task 1 결과로 확인; 아니면 매칭된 다른 기본 리프트 id로 대체하고 리포트에 명시).

`exercise-library.test.ts` — '-2/-3 프레임 규약' 테스트를 '-3 규약'으로 갱신(`-2.svg` 기대 제거).

- [ ] **Step 2: 구현**

`ExerciseHero.tsx` 핵심 변경(기존 구조 유지, 상태 내부):
- `gifUrl = exercise.gif ? BASE_URL + exercise.gif : null`, `posterUrl = gifUrl?.replace(/\.gif$/, '.webp')`
- 선화 `urls`는 `[base.svg, base-3.svg]`, `SEQ = [0, 1]`, `FRAME_MS = 650`, img transition `opacity 380ms ease-in-out`
- 렌더 분기: `gifUrl` → `<div style={{ position:'relative', flex:1, height:170, background:'#FFFFFF', borderRadius:14, overflow:'hidden' }}><img key={exercise.id} src={reduced ? posterUrl : gifUrl} alt={`${exercise.name} 동작`} style={{ position:'absolute', inset:8, width:'calc(100% - 16px)', height:'calc(100% - 16px)', objectFit:'contain' }} onError={() => setGifDead(true)} /></div>` — `gifDead`면 선화/픽토그램 경로로 폴백; `exercise.id` 변경 시 `gifDead` 리셋(기존 reset effect에 포함). `key={exercise.id}`로 운동 전환 시 이전 GIF 잔상 방지
- 선화 경로·픽토그램 경로·근육맵 패널은 기존 그대로

`ExerciseImage.tsx`: `exerciseImageUrl`을 `ex.gif ? BASE_URL + ex.gif.replace(/\.gif$/, '.webp') : ex.illustration ? BASE_URL + ex.illustration : undefined`로 확장. 실패 폴백(failedUrl → 픽토그램) 유지.

`exercises.ts`: `LIBRARY_VERSION = 7`; 신규 행 생성에 `...(x.gif ? { gif: x.gif } : {})`; 비교식에 `|| cur.gif !== x.gif`; 업데이트 객체에 `gif: x.gif`.

`build-illustrations.mjs`: 프레임 존재 검사를 `[1, 3]`으로, 복사에서 frame-2 줄 제거. 실행해 `public/illustrations`를 재생성(`-2.svg` 594→0, 총 594파일 = 297×2).

- [ ] **Step 3: 통과 확인·커밋**

`npx vitest run src/components/ExerciseHero.test.tsx src/components/ExerciseImage.test.tsx src/db/exercises.test.ts src/data/exercise-library.test.ts src/screens/SessionScreen.test.tsx` 전부 PASS(SessionScreen 37개 무변경). `npm test`, `npx tsc --noEmit`.

```bash
git add src scripts/build-illustrations.mjs public/illustrations
git commit -m "feat: 세션 히어로 GIF(흰 패널·reduced-motion 포스터) + 썸네일 포스터 + 선화 2포즈 폴백, seedLibrary v7"
```

---

### Task 3: SW 캐시·출처 표기·실사 삭제·검증

**Files:**
- Modify: `vite.config.ts`, `src/screens/ManageScreen.tsx`, `src/screens/ManageScreen.test.tsx`
- Delete: `public/exercises/` (736 webp, 17MB — 렌더되지 않는 실사)

- [ ] **Step 1: 실패하는 테스트**

`ManageScreen.test.tsx` 출처 테스트에 `expect(screen.getByText(/AscendAPI/)).toBeInTheDocument();` 추가.

- [ ] **Step 2: 구현**

`vite.config.ts`:
- `globIgnores: ['illustrations/**', 'gifs/**']`
- runtimeCaching: `exercises/*.webp` 규칙 삭제; 추가 `{ urlPattern: /\/gifs\/.+\.(gif|webp)$/, handler: 'CacheFirst', options: { cacheName: 'exercise-gifs', expiration: { maxEntries: 1500 } } }`; 기존 illustrations 규칙 유지

`ManageScreen.tsx` 출처 줄을 다음으로 교체(한 줄):
`운동 동작 GIF: <a href="https://ascendapi.com" target="_blank" rel="noreferrer" style={{ color: 'var(--muted)' }}>ExerciseDB (AscendAPI)</a> · 운동 일러스트: <a ...>Workout Guide</a>(Bryl Lim) · Everkinetic — CC BY-SA 4.0 · 근육맵: <a ...>react-body-highlighter</a> (MIT)` (기존 링크 속성 유지)

`git rm -r public/exercises`

- [ ] **Step 3: 검증·커밋**

`npm test` PASS, `npx tsc --noEmit`, `npm run build` → 출력의 `precache  9 entries` 유지 확인, `dist/sw.js`에 `gifs` 런타임 규칙 존재·프리캐시 URL에 gifs/illustrations 없음 확인(`grep -c 'gifs/' dist/sw.js`는 규칙 1건만).

```bash
git add vite.config.ts src/screens/ManageScreen.tsx src/screens/ManageScreen.test.tsx
git rm -r -q public/exercises
git commit -m "feat: gifs 런타임 캐시 + ExerciseDB 출처 표기 + 미사용 실사 17MB 삭제"
```
