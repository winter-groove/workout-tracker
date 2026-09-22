# 운동 일러스트 도입 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 실사 사진을 오픈소스 동작 일러스트(흰색 단색 SVG)로 교체 — 파이프라인으로 매칭·복사하고, 비매칭은 픽토그램 폴백, 실사는 어떤 화면에도 렌더하지 않는다.

**Architecture:** `scripts/build-illustrations.mjs`가 workout-guide(shallow clone)의 manifest를 읽어 별칭표+검증 규칙(장비·부위 호환)으로 매칭, `public/illustrations/<id>.svg` 생성 + `exercise-library.json`에 `illustration` 필드 기록. seedLibrary v5가 기존 설치에 동기화. ExerciseImage는 일러스트→픽토그램 순서로만 렌더.

**Tech Stack:** Node(스크립트), React 18 + TypeScript, vitest

**Spec:** `docs/superpowers/specs/2026-09-22-exercise-illustrations-design.md`

## Global Constraints

- **오매칭 제로 원칙**: 자동 매칭은 (a) 정규화 정확 일치 또는 (b) slug 토큰 ⊆ libId 토큰 이면서 장비·부위 모두 호환일 때만. 포함(substring) 매칭 금지. `isStretch` 제외. 모르는 장비/근육 값은 비호환 취급
- 별칭표 `scripts/illustration-aliases.json`: `{ "<libId>": "<slug>" | null }` — 존재하지 않는 libId/slug는 스크립트가 에러로 중단
- Dexie 스키마 무변경(`illustration?: string` 선택 필드), 백업 왕복 보존, legacy-55 데이터 파일 무변경
- 실사(imagePath)는 데이터에 유지하되 렌더 금지, `public/exercises/` 삭제 금지(후속 정리)
- CC BY-SA 4.0 출처 표기(마이 탭 하단), UI 한국어, 새 npm 의존성 금지
- 테스트: `npx vitest run <파일>` / 전체 `npm test` (현재 227)

---

### Task 1: 파이프라인 + 타입 + v5 동기화

**Files:**
- Create: `scripts/build-illustrations.mjs`, `scripts/illustration-aliases.json`(빈 객체 `{}`로 시작)
- Modify: `src/types.ts`, `src/db/exercises.ts`
- Generated(커밋): `public/illustrations/*.svg`, `src/data/exercise-library.json`(illustration 필드)
- Test: `src/db/exercises.test.ts`(1개 추가), `src/db/backup.test.ts`(1개 추가)

**Interfaces (Produces):**
- `Exercise.illustration?: string`
- `LIBRARY_VERSION = 5`, seedLibrary 동기화 필드에 `illustration` 포함
- 실행: `node scripts/build-illustrations.mjs` → 통계 출력(자동 정확/자동 완화/별칭/제외/총 매칭)

- [ ] **Step 1: 실패하는 테스트 작성**

`src/db/exercises.test.ts` 끝에:

```ts
test('seedLibrary v5 동기화가 illustration을 반영하고 사용자 필드를 보존한다', async () => {
  await seedLibrary();
  await setExerciseUnit('lib-bench-press', 'lb');
  await db.exercises.update('lib-bench-press', { illustration: undefined, isFavorite: true });
  await db.meta.put({ key: 'libraryVersion', value: 0 });
  await seedLibrary();
  const ex = await db.exercises.get('lib-bench-press');
  // 라이브러리 json에 illustration이 있으면 반영된다 (T1 시점엔 별칭표가 비어도 bench-press는 자동 정확 일치)
  expect(ex?.illustration).toBe('illustrations/bench-press.svg');
  expect(ex?.unit).toBe('lb');
  expect(ex?.isFavorite).toBe(true);
});
```

`src/db/backup.test.ts` 끝에:

```ts
test('운동 illustration 필드가 백업 왕복에서 보존된다', async () => {
  await seedLibrary();
  await db.exercises.update('lib-squat', { illustration: 'illustrations/x.svg' });
  const dump = await exportData();
  await db.delete();
  await db.open();
  await importData(dump);
  expect((await db.exercises.get('lib-squat'))?.illustration).toBe('illustrations/x.svg');
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/db/exercises.test.ts src/db/backup.test.ts`
Expected: 신규 2개 FAIL (illustration 필드·동기화 없음)

- [ ] **Step 3: 구현**

`src/types.ts` — `Exercise`의 `unit?: 'kg' | 'lb';` 아래에:

```ts
  illustration?: string; // 내장 운동 일러스트: 'illustrations/<id>.svg' (없으면 픽토그램)
```

`src/db/exercises.ts`:
- `LIBRARY_VERSION`을 `5`로
- seedLibrary의 신규 행 생성 map에 `...(x.illustration ? { illustration: x.illustration } : {})` 추가
- 동기화 비교/갱신에 illustration 포함:

```ts
    if (
      cur.name !== x.name || cur.bodyPart !== x.bodyPart || cur.equipment !== x.equipment
      || cur.illustration !== x.illustration
    ) {
      updates.push({
        ...cur,
        name: x.name,
        bodyPart: x.bodyPart as BodyPart,
        equipment: x.equipment as Equipment,
        illustration: x.illustration,
      });
    }
```

(라이브러리 json 항목엔 illustration이 없을 수 있으므로 `x.illustration`은 `string | undefined` — 그대로 대입해 비매칭 항목의 잔존 값도 지워지게 한다)

`scripts/illustration-aliases.json` 신규:

```json
{}
```

`scripts/build-illustrations.mjs` 신규 (전체):

```js
import { cp, mkdir, readFile, rm, writeFile, access } from 'node:fs/promises';
import { execSync } from 'node:child_process';

const REPO = 'https://github.com/bryllim/workout-guide.git';
const TMP = '.tmp-workout-guide';
const OUT = 'public/illustrations';

// 그쪽 근육 → 우리 부위 (모르는 값은 비호환)
const MUSCLE_TO_PART = new Map([
  ['Chest', '가슴'],
  ['Lats', '등'], ['Upper Back', '등'], ['Lower Back', '등'], ['Traps', '등'],
  ['Quadriceps', '하체'], ['Hamstrings', '하체'], ['Glutes', '하체'], ['Calves', '하체'], ['Adductors', '하체'], ['Abductors', '하체'],
  ['Shoulders', '어깨'],
  ['Biceps', '팔'], ['Triceps', '팔'], ['Forearms', '팔'],
  ['Abs', '코어'], ['Obliques', '코어'], ['Core', '코어'],
]);
// 그쪽 장비 → 우리 장비 (배열 = 허용 목록, 모르는 값은 비호환)
const EQUIP_COMPAT = new Map([
  ['Barbell', ['바벨']],
  ['Dumbbell', ['덤벨']],
  ['Machine', ['머신']], ['Smith Machine', ['머신']],
  ['Cable', ['케이블']],
  ['Bodyweight', ['맨몸']], ['None', ['맨몸']],
  ['Kettlebell', ['기타']], ['Band', ['기타']], ['Plate', ['기타']], ['Other', ['기타']],
]);

const norm = (s) => s.toLowerCase().replace(/[_\-]/g, ' ').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
const tokens = (s) => new Set(norm(s).split(' '));
const subset = (a, b) => [...a].every((t) => b.has(t));

try { await access(TMP); } catch { execSync(`git clone --depth 1 ${REPO} ${TMP}`, { stdio: 'inherit' }); }

const manifest = JSON.parse(await readFile(`${TMP}/packages/workout-guide/manifest.json`, 'utf8'));
const lib = JSON.parse(await readFile('src/data/exercise-library.json', 'utf8'));
const aliases = JSON.parse(await readFile('scripts/illustration-aliases.json', 'utf8'));

const bySlug = new Map(manifest.filter((m) => !m.isStretch).map((m) => [m.slug, m]));
const byNorm = new Map([...bySlug.values()].map((m) => [norm(m.slug), m]));

// 별칭표 검증 — 오타는 즉시 중단
const libIds = new Set(lib.map((x) => x.libId));
for (const [libId, slug] of Object.entries(aliases)) {
  if (!libIds.has(libId)) throw new Error(`별칭표: 없는 libId "${libId}"`);
  if (slug !== null && !bySlug.has(slug)) throw new Error(`별칭표: 없는 slug "${slug}" (libId ${libId})`);
}

function compatible(entry, m) {
  const part = MUSCLE_TO_PART.get(m.primaryMuscle);
  const equips = EQUIP_COMPAT.get(m.equipment);
  return part === entry.bodyPart && Array.isArray(equips) && equips.includes(entry.equipment);
}

const stats = { alias: 0, exact: 0, relaxed: 0, excluded: 0, none: 0 };
const picks = new Map(); // our id → their slug

for (const x of lib) {
  if (Object.prototype.hasOwnProperty.call(aliases, x.libId)) {
    const slug = aliases[x.libId];
    if (slug === null) { stats.excluded++; continue; }
    picks.set(x.id, slug);
    stats.alias++;
    continue;
  }
  const n = norm(x.libId);
  const exact = byNorm.get(n);
  if (exact) { picks.set(x.id, exact.slug); stats.exact++; continue; }
  let hit = null;
  for (const m of bySlug.values()) {
    if (subset(tokens(m.slug), tokens(x.libId)) && compatible(x, m)) { hit = m; break; }
  }
  if (hit) { picks.set(x.id, hit.slug); stats.relaxed++; } else { stats.none++; }
}

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
for (const [id, slug] of picks) {
  await cp(`${TMP}/packages/workout-guide/assets/${slug}/frame-1.svg`, `${OUT}/${id}.svg`);
}

const next = lib.map((x) => {
  const { illustration: _drop, ...rest } = x;
  return picks.has(x.id) ? { ...rest, illustration: `illustrations/${x.id}.svg` } : rest;
});
await writeFile('src/data/exercise-library.json', `${JSON.stringify(next, null, 2)}\n`);

console.log(`✓ 매칭 ${picks.size}/${lib.length} (별칭 ${stats.alias}, 정확 ${stats.exact}, 완화 ${stats.relaxed}, 제외 ${stats.excluded}, 미매칭 ${stats.none})`);
```

실행: `node scripts/build-illustrations.mjs` → 생성물 확인(`ls public/illustrations | wc -l`, `grep -c illustration src/data/exercise-library.json` 일치), 통계를 리포트에 기록. `.tmp-workout-guide`는 `.gitignore`에 추가.

주의: manifest 구조는 배열이 아닐 수 있음 — 실제 파일을 열어 최상위가 `{ exercises: [...] }`류면 그에 맞게 한 줄 조정(구조 확인 결과를 리포트에).

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/db/exercises.test.ts src/db/backup.test.ts` 후 `npm test`
Expected: 전부 PASS (229). exercise-library.test.ts의 스키마 테스트가 illustration 필드로 깨지면 안 됨(추가 검증: 있으면 `illustrations/<id>.svg` 형식인지 테스트 1개를 exercise-library.test.ts에 추가해도 좋음 — 선택)

- [ ] **Step 5: 커밋**

```bash
git add scripts/build-illustrations.mjs scripts/illustration-aliases.json src/types.ts src/db/exercises.ts src/db/exercises.test.ts src/db/backup.test.ts src/data/exercise-library.json public/illustrations .gitignore
git commit -m "feat: 운동 일러스트 파이프라인 — 검증 매칭·자산 생성, seedLibrary v5 동기화"
```

---

### Task 2: 별칭 큐레이션 (legacy-55 100% + 상용 확대)

**Files:**
- Modify: `scripts/illustration-aliases.json`
- Regenerated: `public/illustrations/*.svg`, `src/data/exercise-library.json`

- [ ] **Step 1: 큐레이션**

1. `src/data/legacy-55.json`의 55개 libId 중 T1 자동 매칭에 실패한 전부에 대해, `.tmp-workout-guide/packages/workout-guide/manifest.json`의 slug·equipment·primaryMuscle을 대조해 별칭 작성. **그쪽 카탈로그에 대응 운동이 정말 없을 때만 `null`** (null 사유를 리포트에 한 줄씩)
2. 나머지 미매칭 중 한국 헬스장 상용 운동(레그 컬/익스텐션, 케이블 크로스오버, 사이드 레터럴 레이즈, 바벨 컬, 트라이셉스 익스텐션, 풀업/딥스, 런지, 카프 레이즈, 페이스 풀, 시티드 로우 등)을 최대한 매핑
3. 규칙: manifest의 equipment/primaryMuscle이 우리 항목과 모순이면 매핑 금지. 확신 없으면 빼기 — 픽토그램이 오매칭보다 낫다. 동작이 사실상 동일한 변형(그립 차이 등)은 같은 slug 재사용 허용

- [ ] **Step 2: 재실행·검증**

`node scripts/build-illustrations.mjs` → 별칭 검증 에러 0, 통계 기록(legacy-55 커버리지 별도 계산해 리포트: 55개 중 몇 개가 illustration을 갖는지 — jq/node로 산출). `npm test` 전체 PASS 유지

- [ ] **Step 3: 커밋**

```bash
git add scripts/illustration-aliases.json src/data/exercise-library.json public/illustrations
git commit -m "feat: 일러스트 별칭 큐레이션 — legacy-55 우선 커버 + 상용 운동 확대"
```

---

### Task 3: UI 전환 — 일러스트 우선, 실사 렌더 제거, 캐싱·출처

**Files:**
- Modify: `src/components/ExerciseImage.tsx`(전체 교체), `vite.config.ts`, `src/screens/ManageScreen.tsx`
- Test: `src/components/ExerciseImage.test.tsx`(갱신+추가), `src/screens/ManageScreen.test.tsx`(1개 추가)

- [ ] **Step 1: 테스트 갱신·추가**

`src/components/ExerciseImage.test.tsx` — 기존 테스트를 열어 imagePath(사진) 렌더를 단언하는 테스트는 **일러스트 체계로 갱신**하고, 다음을 보장하도록 재구성 (기존 파일 구조·헬퍼를 따라 작성):

```tsx
test('illustration이 있으면 SVG 이미지를 렌더한다', () => {
  render(<ExerciseImage exercise={{ ...base, illustration: 'illustrations/bench-press.svg' }} />);
  const img = screen.getByRole('img', { name: base.name });
  expect(img).toHaveAttribute('src', expect.stringContaining('illustrations/bench-press.svg'));
});

test('illustration이 없으면 imagePath가 있어도 사진 대신 픽토그램을 렌더한다', () => {
  render(<ExerciseImage exercise={{ ...base, imagePath: 'exercises/x.webp', illustration: undefined }} />);
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
});

test('illustration 로드 실패 시 픽토그램으로 폴백한다', () => {
  render(<ExerciseImage exercise={{ ...base, illustration: 'illustrations/broken.svg' }} />);
  fireEvent.error(screen.getByRole('img'));
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
});
```

(`base`는 기존 테스트 파일의 Exercise 픽스처 재사용; 픽토그램은 `<img>`가 아닌 svg 컨테이너이므로 `queryByRole('img')` null이 판별 기준 — 기존 파일이 다른 판별을 쓰면 그 방식을 따르되 사진 미렌더 단언은 유지)

`src/screens/ManageScreen.test.tsx` 끝에:

```tsx
test('마이 탭 하단에 일러스트 출처가 표기된다', async () => {
  renderScreen();
  expect(await screen.findByText(/Workout Guide/)).toBeInTheDocument();
  expect(screen.getByText(/CC BY-SA 4\.0/)).toBeInTheDocument();
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/components/ExerciseImage.test.tsx src/screens/ManageScreen.test.tsx`
Expected: 신규·갱신분 FAIL

- [ ] **Step 3: 구현**

`src/components/ExerciseImage.tsx` 전체 교체:

```tsx
import { useState } from 'react';
import type { Exercise } from '../types';
import ExerciseIcon from './ExerciseIcon';

// 일러스트가 있으면 그것만 렌더 — 실사(imagePath)는 더 이상 사용하지 않는다 (스펙: 실사 제거)
export function exerciseImageUrl(ex: Exercise): string | undefined {
  return ex.illustration ? import.meta.env.BASE_URL + ex.illustration : undefined;
}

export default function ExerciseImage({ exercise, className }: { exercise: Exercise; className?: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const url = exerciseImageUrl(exercise);
  if (url && failedUrl !== url) {
    return (
      <img
        src={url} alt={exercise.name} className={className} loading="lazy"
        onError={() => setFailedUrl(url)}
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

`vite.config.ts` — 기존 exercises 런타임 캐시 규칙과 동일 패턴으로 `illustrations/` 규칙 추가(캐시명 `exercise-illustrations`), precache glob에 svg 미포함 확인.

`src/screens/ManageScreen.tsx` — 데이터 백업 카드 아래(화면 최하단)에:

```tsx
      <div className="d" style={{ fontSize: 11, textAlign: 'center', padding: '4px 0 8px' }}>
        운동 일러스트: <a href="https://github.com/bryllim/workout-guide" style={{ color: 'var(--muted)' }}>Workout Guide</a>(Bryl Lim) · Everkinetic — CC BY-SA 4.0
      </div>
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/components/ExerciseImage.test.tsx src/screens/ManageScreen.test.tsx src/components/ExercisePicker.test.tsx src/screens/SessionScreen.test.tsx`
Expected: 전부 PASS (픽커·세션 히어로가 ExerciseImage 공유 — 회귀 확인)

- [ ] **Step 5: 커밋**

```bash
git add src/components/ExerciseImage.tsx src/components/ExerciseImage.test.tsx vite.config.ts src/screens/ManageScreen.tsx src/screens/ManageScreen.test.tsx
git commit -m "feat: 일러스트 우선 렌더로 전환 — 실사 렌더 제거, 런타임 캐싱, CC BY-SA 출처 표기"
```

---

### Task 4: 전체 검증

- [ ] **Step 1:** `npm test` 전체 PASS, `npx tsc --noEmit`, `npm run build`(precache에 svg 미포함·용량 확인)
- [ ] **Step 2:** 실패 시 수정 후 `git add -A src && git commit -m "fix: 일러스트 통합 검증 수정"`
