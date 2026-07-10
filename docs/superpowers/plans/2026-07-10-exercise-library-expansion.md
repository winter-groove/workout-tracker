# 운동 라이브러리 대확장 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 운동 라이브러리를 55개 → 근력 계열 전체(~700개, 한국어 이름)로 확장하고 이미지를 런타임 캐싱으로 전환한다.

**Architecture:** free-exercise-db를 필터·매핑해 라이브러리 JSON을 생성하는 스크립트(`build-library.mjs`) + 번역 맵(`library-ko.json`, 컨트롤러가 번역 에이전트 배치로 생성). 기존 55개 id·이름은 불변(스냅샷 테스트로 고정), `LIBRARY_VERSION=2`로 기존 사용자에 신규만 추가. 이미지는 프리캐시에서 제외하고 workbox 런타임 캐싱.

**Tech Stack:** Node(스크립트), sharp(기존), React + Dexie, vitest

**스펙:** `docs/superpowers/specs/2026-07-10-exercise-library-expansion-design.md`

## Global Constraints

- DB 스키마(`src/db/db.ts`) 변경 금지, 새 npm 의존성 추가 금지, UI 문구는 한국어
- **기존 55개 항목의 id·libId·name 절대 불변** (세션 기록이 `lib-<id>` 참조)
- 필터: `category ∈ {strength, powerlifting, olympic weightlifting, strongman, plyometrics}`, `images[0]` 없는 항목 제외
- 기구 매핑: barbell·e-z curl bar→바벨, dumbbell→덤벨, machine→머신, cable→케이블, body only→맨몸, 그 외→기타
- 부위 매핑(primaryMuscles[0]): chest→가슴; lats·middle back·lower back·traps→등; quadriceps·hamstrings·glutes·calves·adductors·abductors→하체; shoulders→어깨; biceps·triceps·forearms→팔; abdominals→코어; 그 외/누락→기타
- 라이브러리 전체 이름 중복 금지, 번역 누락·id 충돌 시 빌드 스크립트가 에러 종료
- 테스트 실행: `npx vitest run <파일경로>` (전체는 `npm test`)

---

### Task 1: build-library.mjs + 검증 스크립트

**Files:**
- Create: `scripts/build-library.mjs`
- Create: `scripts/verify-images.mjs`
- Modify: `package.json` (scripts에 `build-library`, `verify-images` 추가)

**Interfaces:**
- Consumes: `scripts/library-ko.json` (Task 2가 생성 — `{ "<libId>": "<한국어 이름>" }`)
- Produces: `npm run build-library` → `src/data/exercise-library.json` 갱신 (기존 55 + 신규, 각 항목 `{id, libId, name, bodyPart, equipment}`), `npm run verify-images` → 라이브러리 전 항목의 webp 존재 확인

- [ ] **Step 1: build-library.mjs 작성**

```js
import { readFile, writeFile } from 'node:fs/promises';

const DB_URL = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json';
const CATEGORIES = new Set(['strength', 'powerlifting', 'olympic weightlifting', 'strongman', 'plyometrics']);
const EQUIP_MAP = new Map([
  ['barbell', '바벨'], ['e-z curl bar', '바벨'],
  ['dumbbell', '덤벨'], ['machine', '머신'], ['cable', '케이블'], ['body only', '맨몸'],
]);
const MUSCLE_MAP = new Map([
  ['chest', '가슴'],
  ['lats', '등'], ['middle back', '등'], ['lower back', '등'], ['traps', '등'],
  ['quadriceps', '하체'], ['hamstrings', '하체'], ['glutes', '하체'],
  ['calves', '하체'], ['adductors', '하체'], ['abductors', '하체'],
  ['shoulders', '어깨'],
  ['biceps', '팔'], ['triceps', '팔'], ['forearms', '팔'],
  ['abdominals', '코어'],
]);

const library = JSON.parse(await readFile('src/data/exercise-library.json', 'utf8'));
const ko = JSON.parse(await readFile('scripts/library-ko.json', 'utf8'));
const all = await (await fetch(DB_URL)).json();

const existingLibIds = new Set(library.map((x) => x.libId));
const existingIds = new Set(library.map((x) => x.id));
const names = new Set(library.map((x) => x.name));

const candidates = all.filter(
  (e) => CATEGORIES.has(e.category) && e.images?.[0] && !existingLibIds.has(e.id),
);

const missing = candidates.filter((e) => !ko[e.id]);
if (missing.length > 0) {
  console.error(`❌ 번역 누락 ${missing.length}건:`);
  for (const m of missing) console.error(`  "${m.id}": "",  // ${m.name}`);
  process.exit(1);
}

const added = [];
for (const e of candidates) {
  const id = e.id.toLowerCase().replaceAll('_', '-').replaceAll('/', '-');
  if (existingIds.has(id)) {
    console.error(`❌ id 충돌: ${id} (libId ${e.id})`);
    process.exit(1);
  }
  const name = ko[e.id].trim();
  if (name === '' || names.has(name)) {
    console.error(`❌ 이름 중복/빈값: "${name}" (libId ${e.id})`);
    process.exit(1);
  }
  existingIds.add(id);
  names.add(name);
  added.push({
    id,
    libId: e.id,
    name,
    bodyPart: MUSCLE_MAP.get(e.primaryMuscles?.[0]) ?? '기타',
    equipment: EQUIP_MAP.get(e.equipment) ?? '기타',
  });
}

const out = [...library, ...added];
await writeFile('src/data/exercise-library.json', JSON.stringify(out, null, 2) + '\n');
console.log(`✓ 총 ${out.length}개 (기존 ${library.length} + 신규 ${added.length})`);
```

(재실행 안전: 이미 추가된 libId는 `existingLibIds`로 제외되어 0건 추가)

- [ ] **Step 2: verify-images.mjs 작성**

```js
import { readFile, access } from 'node:fs/promises';

const library = JSON.parse(await readFile('src/data/exercise-library.json', 'utf8'));
let missing = 0;
for (const x of library) {
  try {
    await access(`public/exercises/${x.id}.webp`);
  } catch {
    console.error(`missing: ${x.id}`);
    missing++;
  }
}
if (missing > 0) {
  console.error(`❌ 이미지 ${missing}개 누락`);
  process.exit(1);
}
console.log(`✓ 이미지 ${library.length}개 전수 확인`);
```

- [ ] **Step 3: package.json scripts 추가**

`"scripts"`에 추가:

```json
"build-library": "node scripts/build-library.mjs",
"verify-images": "node scripts/verify-images.mjs"
```

- [ ] **Step 4: 스크립트 동작 확인 (번역 맵 없이 에러 종료 확인)**

Run: `echo '{}' > scripts/library-ko.json && npm run build-library; rm scripts/library-ko.json`
Expected: `❌ 번역 누락 N건` (N ≈ 600~700) 출력 후 exit 1 — 누락 목록에 libId와 영문 이름 표시

- [ ] **Step 5: 커밋**

```bash
git add scripts/build-library.mjs scripts/verify-images.mjs package.json
git commit -m "feat: 라이브러리 생성·이미지 검증 스크립트"
```

---

### Task 2: 번역 맵 생성 (컨트롤러 직접 수행 — 구현 서브에이전트 아님)

**Files:**
- Create: `scripts/library-ko.json`

**Interfaces:**
- Consumes: Task 1의 build-library가 출력하는 누락 목록 (libId + 영문 이름)
- Produces: `{ "<libId>": "<한국어 이름>" }` 전체 맵

- [ ] **Step 1: 신규 대상 목록 추출** — `npm run build-library`를 빈 맵으로 실행해 누락 목록(libId, 영문 이름)을 파일로 저장

- [ ] **Step 2: 번역 배치 디스패치** — 컨트롤러가 목록을 ~100개 단위 배치로 나눠 번역 에이전트들에 병렬 디스패치 (레포 수정 없음, JSON 반환만). 번역 규칙:
  - 헬스장 관용 외래어 표기: Bench Press→벤치프레스, Deadlift→데드리프트, Lying→라잉, Seated→시티드, Standing→스탠딩, Incline→인클라인, Decline→디클라인, Close-Grip→클로즈그립, Wide-Grip→와이드그립, One-Arm→원암, Alternating→얼터네이팅 등
  - 기구·변형 구분이 영문 이름에 있으면 유지 (Barbell/Dumbbell/Cable/Smith Machine → 바벨/덤벨/케이블/스미스머신)
  - 간결하게 (수식어 최소), 전각 괄호 대신 공백 구분
- [ ] **Step 3: 맵 조립·중복 해소** — 배치 결과를 합쳐 `scripts/library-ko.json` 작성. 맵 내부 + 기존 55개 이름과의 중복을 검사해 중복은 구분어(기구/그립/각도)를 붙여 해소
- [ ] **Step 4: 검증** — `npm run build-library` 실행이 성공(`✓ 총 N개`)할 때까지 누락·중복을 수정
- [ ] **Step 5: 커밋**

```bash
git add scripts/library-ko.json src/data/exercise-library.json
git commit -m "feat: 운동 라이브러리 확장 — 근력 계열 전체 한국어 번역"
```

---

### Task 3: 스냅샷·시드 v2 + 테스트

**Files:**
- Create: `src/data/legacy-55.json` (확장 전 55개 스냅샷 — Task 2 이전 상태의 라이브러리)
- Modify: `src/db/exercises.ts` (`LIBRARY_VERSION = 2`)
- Test: `src/data/exercise-library.test.ts` (확장), Create: `src/db/exercises.test.ts`

**Interfaces:**
- Consumes: Task 2가 갱신한 `exercise-library.json`
- Produces: 없음

- [ ] **Step 1: 스냅샷 생성** — git 이력에서 확장 전 파일을 추출:

```bash
git show 58bc444:src/data/exercise-library.json > src/data/legacy-55.json
```

- [ ] **Step 2: 실패하는 테스트 작성**

`src/data/exercise-library.test.ts`에 추가:

```ts
import legacy from './legacy-55.json';

test('이름이 중복 없이 유일하다', () => {
  const names = library.map((x) => x.name);
  expect(new Set(names).size).toBe(names.length);
});

test('근력 계열 전체 확장 — 600개 이상', () => {
  expect(library.length).toBeGreaterThanOrEqual(600);
});

test('기존 55개의 id·libId·이름이 보존된다', () => {
  const byId = new Map(library.map((x) => [x.id, x]));
  expect(legacy.length).toBe(55);
  for (const l of legacy) {
    const cur = byId.get(l.id);
    expect(cur?.libId).toBe(l.libId);
    expect(cur?.name).toBe(l.name);
  }
});
```

`src/db/exercises.test.ts` 생성:

```ts
import { db } from './db';
import { seedLibrary } from './exercises';
import library from '../data/exercise-library.json';
import legacy from '../data/legacy-55.json';
import type { BodyPart, Equipment } from '../types';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

test('v1 사용자 재시드: 신규만 추가되고 기존 행(숨김 포함)은 유지된다', async () => {
  await db.exercises.bulkAdd(legacy.map((x) => ({
    id: `lib-${x.id}`,
    name: x.name,
    bodyPart: x.bodyPart as BodyPart,
    equipment: x.equipment as Equipment,
    imagePath: `exercises/${x.id}.webp`,
    isCustom: false,
    isHidden: false,
  })));
  await db.exercises.update('lib-bench-press', { isHidden: true });
  await db.meta.put({ key: 'libraryVersion', value: 1 });
  await seedLibrary();
  expect(await db.exercises.count()).toBe(library.length);
  const bench = await db.exercises.get('lib-bench-press');
  expect(bench?.isHidden).toBe(true);
  expect((await db.meta.get('libraryVersion'))?.value).toBe(2);
});
```

- [ ] **Step 3: 테스트가 실패하는지 확인**

Run: `npx vitest run src/data/exercise-library.test.ts src/db/exercises.test.ts`
Expected: v1 재시드 테스트 FAIL (LIBRARY_VERSION이 아직 1이라 재시드 스킵), 나머지는 Task 2 완료 상태면 PASS

- [ ] **Step 4: LIBRARY_VERSION = 2로 변경**

`src/db/exercises.ts`의 `export const LIBRARY_VERSION = 1;` → `export const LIBRARY_VERSION = 2;`

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run src/data/exercise-library.test.ts src/db/exercises.test.ts`
Expected: PASS. 이어서 `npm test` 전체 PASS (기존 화면 테스트는 seedLibrary 결과가 커져도 무관해야 함 — 실패 시 원인 분석)

- [ ] **Step 6: 커밋**

```bash
git add src/data/legacy-55.json src/data/exercise-library.test.ts src/db/exercises.test.ts src/db/exercises.ts
git commit -m "feat: 라이브러리 v2 시드 — 기존 55개 보존 스냅샷·마이그레이션 테스트"
```

---

### Task 4: 이미지 일괄 생성

**Files:**
- Create: `public/exercises/*.webp` (~700개, 커밋 대상)

- [ ] **Step 1: 이미지 생성**

Run: `npm run fetch-images`
Expected: 라이브러리 전 항목 다운로드·변환 (수 분 소요). libId 불일치 에러 시 해당 항목의 libId 교정 후 재실행

- [ ] **Step 2: 전수 확인**

Run: `npm run verify-images`
Expected: `✓ 이미지 N개 전수 확인` (N = 라이브러리 크기)

- [ ] **Step 3: 커밋**

```bash
git add public/exercises
git commit -m "feat: 확장 라이브러리 운동 이미지 일괄 추가"
```

---

### Task 5: 런타임 캐싱 + 이미지 fallback + 관리 탭 검색

**Files:**
- Modify: `vite.config.ts`, `src/components/ExerciseImage.tsx`, `src/screens/ManageScreen.tsx`
- Test: `src/screens/ManageScreen.test.tsx` (신규)

**Interfaces:**
- Consumes: 없음
- Produces: 없음

- [ ] **Step 1: 실패하는 테스트 작성**

`src/screens/ManageScreen.test.tsx` 생성:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { db } from '../db/db';
import { seedLibrary } from '../db/exercises';
import ManageScreen from './ManageScreen';

beforeEach(async () => {
  await db.delete();
  await db.open();
  await seedLibrary();
});

test('운동 목록을 이름으로 검색할 수 있다', async () => {
  render(<MemoryRouter><ManageScreen /></MemoryRouter>);
  await screen.findByText('벤치프레스');
  fireEvent.change(screen.getByPlaceholderText('운동 이름 검색'), { target: { value: '스쿼트' } });
  await waitFor(() => {
    expect(screen.queryByText('벤치프레스')).not.toBeInTheDocument();
    expect(screen.getByText('스쿼트')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/screens/ManageScreen.test.tsx`
Expected: FAIL — placeholder '운동 이름 검색' 없음

- [ ] **Step 3: 구현**

`src/screens/ManageScreen.tsx` — state와 필터:

```tsx
const [exQuery, setExQuery] = useState('');
```

`visibleExercises` 계산을 다음으로 교체:

```tsx
const visibleExercises = (showHidden ? exercises : exercises.filter((e) => !e.isHidden))
  .filter((e) => exQuery.trim() === '' || e.name.includes(exQuery.trim()));
```

"내 운동 목록" 카드의 `숨긴 운동 표시` label 아래에 추가:

```tsx
<input
  className="search" placeholder="운동 이름 검색" style={{ marginTop: 8 }}
  value={exQuery} onChange={(e) => setExQuery(e.target.value)}
/>
```

`src/components/ExerciseImage.tsx` — 로드 실패 시 아이콘 fallback:

```tsx
import { useState } from 'react';
import type { Exercise } from '../types';
import ExerciseIcon from './ExerciseIcon';

export function exerciseImageUrl(ex: Exercise): string | undefined {
  return ex.imagePath ? import.meta.env.BASE_URL + ex.imagePath : undefined;
}

export default function ExerciseImage({ exercise, className }: { exercise: Exercise; className?: string }) {
  const [failed, setFailed] = useState(false);
  const url = exerciseImageUrl(exercise);
  if (url && !failed) {
    return (
      <img
        src={url} alt={exercise.name} className={className} loading="lazy"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <div className={className ?? 'thumb-icon'}>
      <ExerciseIcon iconKey={exercise.iconKey ?? 'barbell'} />
    </div>
  );
}
```

`vite.config.ts` — workbox 블록 교체 (webp 프리캐시 제외 + 런타임 캐싱):

```ts
workbox: {
  globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
  maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
  runtimeCaching: [
    {
      urlPattern: /\/exercises\/.+\.webp$/,
      handler: 'CacheFirst',
      options: {
        cacheName: 'exercise-images',
        expiration: { maxEntries: 1000 },
      },
    },
  ],
},
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/screens/ManageScreen.test.tsx`
Expected: PASS. `npm run build` 실행 시 precache 항목 수가 확장 전 수준(수십 개)으로 유지되는지 출력 확인

- [ ] **Step 5: 커밋**

```bash
git add vite.config.ts src/components/ExerciseImage.tsx src/screens/ManageScreen.tsx src/screens/ManageScreen.test.tsx
git commit -m "feat: 운동 이미지 런타임 캐싱 전환, 로드 실패 fallback, 관리 탭 검색"
```

---

### Task 6: 전체 검증

**Files:** 없음 (검증만)

- [ ] **Step 1: 전체 테스트**

Run: `npm test`
Expected: 전체 PASS (기존 93 + 신규 ≈5)

- [ ] **Step 2: 빌드·프리캐시 확인**

Run: `npm run build`
Expected: 에러 없음, `precache N entries` 의 N이 확장 전 수준(webp 미포함)

- [ ] **Step 3: 실패 시 수정 후 커밋**

```bash
git add -A src scripts vite.config.ts
git commit -m "fix: 라이브러리 확장 통합 검증 수정"
```
