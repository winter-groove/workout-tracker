# 동작 애니메이션 + 근육맵 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 세션 히어로에서 운동 동작을 3프레임 핑퐁으로 재생하고, 옆에 소형 근육맵(주동근 라임 펄스)을 나란히 표시한다.

**Architecture:** 파이프라인이 frame-2/3 복사 + `muscles` 필드(우리 영역 id 어휘) 기록, seedLibrary v6 동기화. `MuscleMap`(MIT 폴리곤 벤더링)과 `ExerciseHero`(내부 상태 애니메이션 — 세션 화면 재렌더 금지)는 독립 컴포넌트.

**Tech Stack:** Node 스크립트, React 18 + TypeScript, vitest

**Spec:** `docs/superpowers/specs/2026-09-22-animated-hero-design.md`

## Global Constraints

- 프레임 규약: illustration 있으면 `<id>-2.svg`·`<id>-3.svg` 반드시 존재 (파이프라인이 3개 모두 확보 못 하면 그 운동은 매칭 자체를 제외)
- 애니메이션 상태는 ExerciseHero 내부 — SessionScreen 재렌더 유발 금지 (기존 '매초 재조회 금지' 테스트 무변경 통과 필수)
- `prefers-reduced-motion: reduce` → 정지 frame-1 + 근육맵 정적 하이라이트, `document.hidden` → 일시정지
- muscles 어휘 = MuscleMap 영역 id 집합 (두 표의 일치를 테스트로 고정)
- MIT 저작권 고지: MuscleMap 소스 상단 주석 + 마이 출처 줄에 `· 근육맵: react-body-highlighter (MIT)` 추가
- 기존 테스트(현재 233개) 무변경 통과, 새 npm 의존성 금지, UI 한국어, 토큰 색만
- 테스트: `npx vitest run <파일>` / 전체 `npm test`

---

### Task 1: 파이프라인 확장 — 프레임 2·3 + muscles 필드 + v6

**Files:**
- Modify: `scripts/build-illustrations.mjs`, `src/types.ts`, `src/db/exercises.ts`
- Create: `src/data/muscle-regions.ts`
- Regenerated(커밋): `public/illustrations/*-2.svg`, `*-3.svg`, `src/data/exercise-library.json`
- Test: `src/db/exercises.test.ts`(1 갱신), `src/data/exercise-library.test.ts`(2 추가)

**Interfaces (Produces):**
- `Exercise.muscles?: string[]` (첫 원소 = 주동근, 영역 id 어휘)
- `src/data/muscle-regions.ts`: `export const MUSCLE_REGIONS = ['chest','front-deltoids','back-deltoids','trapezius','upper-back','lower-back','biceps','triceps','forearm','abs','obliques','quadriceps','hamstring','gluteal','adductor','abductors','calves'] as const;` + `export type MuscleRegion = (typeof MUSCLE_REGIONS)[number];` + `export const REGION_KO: Record<MuscleRegion, string>` (가슴/전면 어깨/후면 어깨/승모/등 상부/등 하부/이두/삼두/전완/복근/복사근/대퇴사두/햄스트링/둔근/내전근/외전근/종아리) + `export const BODYPART_REGIONS: Record<BodyPart, MuscleRegion[]>` (가슴→[chest], 등→[upper-back,lower-back,trapezius], 하체→[quadriceps,hamstring,gluteal,calves], 어깨→[front-deltoids,back-deltoids], 팔→[biceps,triceps,forearm], 코어→[abs,obliques], 기타→[abs])
- `LIBRARY_VERSION = 6`, sync 필드에 muscles 포함

- [ ] **Step 1: 실패하는 테스트 작성**

`src/data/exercise-library.test.ts` 끝에:

```ts
import { MUSCLE_REGIONS } from './muscle-regions';

test('일러스트 매칭 운동은 -2/-3 프레임 규약을 지킨다', () => {
  // 파이프라인 산출물 규약: illustration이 있으면 애니 프레임 파일명이 유도 가능해야 함
  const withIllu = library.filter((x) => x.illustration);
  expect(withIllu.length).toBeGreaterThan(0);
  for (const x of withIllu) {
    expect(x.illustration).toMatch(/^illustrations\/[a-z0-9-]+\.svg$/);
  }
});

test('muscles 필드는 근육맵 영역 id 어휘만 사용하고 주동근이 첫 원소다', () => {
  const withMuscles = library.filter((x) => Array.isArray(x.muscles));
  expect(withMuscles.length).toBeGreaterThan(200); // 매칭 297 중 대부분
  const regionSet = new Set<string>(MUSCLE_REGIONS);
  for (const x of withMuscles) {
    expect(x.muscles!.length).toBeGreaterThan(0);
    for (const m of x.muscles!) expect(regionSet.has(m)).toBe(true);
  }
});
```

`src/db/exercises.test.ts`의 v5 동기화 테스트를 v6·muscles 포함으로 갱신 (illustration 단언 유지 + `expect(ex?.muscles?.[0]).toBe('chest');` 추가 — bench-press의 주동근).

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/data/exercise-library.test.ts src/db/exercises.test.ts`
Expected: 신규·갱신 FAIL (muscle-regions 모듈·muscles 필드 없음)

- [ ] **Step 3: 구현**

1. `src/data/muscle-regions.ts` — 위 Interfaces대로 생성 (BodyPart 타입은 `../types`에서 import)
2. `src/types.ts` — `illustration?: string;` 아래에 `muscles?: string[]; // 근육맵 영역 id — 첫 원소가 주동근`
3. `src/db/exercises.ts` — `LIBRARY_VERSION = 6`; 신규 행 생성과 동기화 비교·갱신에 muscles 추가 (illustration과 동일 패턴 — 배열 비교는 `JSON.stringify(cur.muscles) !== JSON.stringify(x.muscles)`)
4. `scripts/build-illustrations.mjs`:
   - manifest 근육 → 영역 id 매핑 표 추가 (Chest→['chest'], Shoulders→['front-deltoids'], Rear Delts→['back-deltoids'], Upper Back→['upper-back','trapezius'], Back→['upper-back','lower-back'], Lats→['upper-back'], Lower Back→['lower-back'], Posterior Chain→['hamstring','gluteal','lower-back'], Hamstrings→['hamstring'], Quads→['quadriceps'], Glutes→['gluteal'], Calves→['calves'], Adductors→['adductor'], Hips→['gluteal','abductors'], Legs→['quadriceps','hamstring','gluteal'], Biceps→['biceps'], Triceps→['triceps'], Forearms→['forearm'], Core→['abs','obliques'], Mobility→[])
   - picks 확정 후: 각 매칭 운동에 대해 frame-1/2/3 세 파일이 모두 존재할 때만 유지(하나라도 없으면 picks에서 제거하고 통계에 'frames 미비'로 집계), `<id>.svg`(frame-1)·`<id>-2.svg`·`<id>-3.svg` 복사
   - muscles 계산: primaryMuscle 매핑(순서 유지) + secondaryMuscles 매핑을 뒤에 이어붙이고 중복 제거; 결과가 비면 필드 생략. `illustration`과 함께 `muscles`도 기록(비매칭 항목에선 제거)
   - 실행: `node scripts/build-illustrations.mjs` — `.tmp-workout-guide`가 없으면 스크립트가 clone함(기존 동작). 산출: SVG 수 = 매칭 수 × 3 확인
5. 마이 출처 줄은 Task 3에서 갱신 (여기선 건드리지 않음)

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/data/exercise-library.test.ts src/db/exercises.test.ts` 후 `npm test`
Expected: 전부 PASS. `ls public/illustrations | wc -l` = 매칭 수 × 3

- [ ] **Step 5: 커밋**

```bash
git add scripts/build-illustrations.mjs src/data/muscle-regions.ts src/types.ts src/db/exercises.ts src/db/exercises.test.ts src/data/exercise-library.test.ts src/data/exercise-library.json public/illustrations
git commit -m "feat: 애니 프레임(-2/-3)·근육 메타 파이프라인 — muscles 영역 id, seedLibrary v6"
```

---

### Task 2: MuscleMap 컴포넌트 (MIT 폴리곤 벤더링)

**Files:**
- Create: `src/components/MuscleMap.tsx`, `src/components/MuscleMap.test.tsx`
- Modify: `src/styles.css` (펄스 키프레임)

**Interfaces:**
- `MuscleMap({ muscles, bodyPart }: { muscles?: string[]; bodyPart: BodyPart })` default export
- Consumes: `MUSCLE_REGIONS/REGION_KO/BODYPART_REGIONS` (Task 1)

- [ ] **Step 1: 폴리곤 확보**

https://github.com/giavinh79/react-body-highlighter (MIT)를 scratchpad에 shallow clone하고 소스에서 앞/뒤 인체 폴리곤 좌표 데이터를 추출해 MuscleMap.tsx에 상수로 벤더링:
- 파일 상단에 MIT 고지 주석(원저작자·저장소 URL·라이선스 전문 링크)
- 그쪽 근육 키 → 우리 MuscleRegion id로 개명 매핑(head/neck/knees 등 비근육 영역은 윤곽용으로만, 하이라이트 대상 제외)
- viewBox·좌표는 그대로 사용, 우리 스타일만 적용

- [ ] **Step 2: 실패하는 테스트 작성**

```tsx
import { render, screen } from '@testing-library/react';
import MuscleMap from './MuscleMap';

test('muscles가 있으면 주동근이 펄스 클래스, 협응근이 보조 클래스를 받는다', () => {
  const { container } = render(<MuscleMap muscles={['chest', 'triceps']} bodyPart="가슴" />);
  expect(screen.getByRole('img', { name: '자극 부위: 가슴' })).toBeInTheDocument();
  expect(container.querySelectorAll('.mm-primary').length).toBeGreaterThan(0);
  expect(container.querySelectorAll('.mm-secondary').length).toBeGreaterThan(0);
});

test('muscles가 없으면 bodyPart 폴백으로 하이라이트한다', () => {
  const { container } = render(<MuscleMap bodyPart="하체" />);
  expect(screen.getByRole('img', { name: /자극 부위/ })).toBeInTheDocument();
  expect(container.querySelectorAll('.mm-primary').length).toBeGreaterThan(0);
});

test('주동근이 뒤쪽 근육이면 뒷모습 뷰를 렌더한다', () => {
  const { container } = render(<MuscleMap muscles={['hamstring']} bodyPart="하체" />);
  expect(container.querySelector('[data-view="back"]')).toBeInTheDocument();
});
```

- [ ] **Step 3: 구현**

- 앞뷰 영역: chest, front-deltoids, biceps, forearm(전면), abs, obliques, quadriceps, adductor, abductors, calves(전면 일부는 데이터에 따름). 뒷뷰: trapezius, back-deltoids, upper-back, lower-back, triceps, forearm(후면), gluteal, hamstring, calves. 벤더 데이터의 실제 분류를 따르고 매핑 표를 컴포넌트에 명시
- 뷰 선택: 주동근(첫 하이라이트)이 속한 뷰. 컨테이너 `<svg role="img" aria-label={"자극 부위: " + REGION_KO[primary]} data-view={view}>`
- 스타일: 기본 영역 `fill: var(--surface-2); stroke: var(--border)`; `.mm-primary { fill: var(--accent); animation: mm-pulse 1.6s ease-in-out infinite; }`; `.mm-secondary { fill: var(--accent); opacity: 0.28; }`
- `src/styles.css`에:

```css
@keyframes mm-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
.mm-primary { animation: mm-pulse 1.6s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .mm-primary { animation: none; } }
```

- [ ] **Step 4: 테스트 통과 확인 + 시각 검증**

Run: `npx vitest run src/components/MuscleMap.test.tsx` 전부 PASS.
추가 게이트: 헤드리스 크롬(스크래치패드 임시 html)으로 앞/뒤 두 뷰를 다크 배경에 렌더한 스크린샷을 찍어 리포트에 경로 기재 — 인체 실루엣이 정상인지(폴리곤 누락·좌표 붕괴 없음) 확인. 도구가 없으면 그 사실을 리포트에 명시

- [ ] **Step 5: 커밋**

```bash
git add src/components/MuscleMap.tsx src/components/MuscleMap.test.tsx src/styles.css
git commit -m "feat: MuscleMap — MIT 폴리곤 벤더링, 주동근 라임 펄스, 앞/뒤 자동 뷰"
```

---

### Task 3: ExerciseHero — 3프레임 핑퐁 + 세션 통합

**Files:**
- Create: `src/components/ExerciseHero.tsx`, `src/components/ExerciseHero.test.tsx`
- Modify: `src/screens/SessionScreen.tsx`(히어로 1줄 교체), `src/screens/ManageScreen.tsx`(출처 줄), `src/screens/ManageScreen.test.tsx`(출처 단언 갱신), `src/styles.css`

**Interfaces:**
- `ExerciseHero({ exercise }: { exercise: Exercise })` default export — 내부에서 MuscleMap 포함 렌더

- [ ] **Step 1: 실패하는 테스트 작성**

`src/components/ExerciseHero.test.tsx`:

```tsx
import { render, screen, act } from '@testing-library/react';
import { vi } from 'vitest';
import type { Exercise } from '../types';
import ExerciseHero from './ExerciseHero';

const bench: Exercise = {
  id: 'lib-bench-press', name: '벤치프레스', bodyPart: '가슴', equipment: '바벨',
  isCustom: false, isHidden: false,
  illustration: 'illustrations/bench-press.svg', muscles: ['chest', 'triceps'],
};

function frameOpacities(container: HTMLElement): string[] {
  return [...container.querySelectorAll<HTMLImageElement>('img')].map((i) => i.style.opacity);
}

test('3프레임을 핑퐁 순서로 순환한다 (1→2→3→2→1)', () => {
  vi.useFakeTimers();
  try {
    const { container } = render(<ExerciseHero exercise={bench} />);
    const imgs = [...container.querySelectorAll<HTMLImageElement>('img')];
    expect(imgs).toHaveLength(3);
    expect(imgs[1].src).toContain('bench-press-2.svg');
    expect(imgs[2].src).toContain('bench-press-3.svg');
    expect(frameOpacities(container)).toEqual(['1', '0', '0']);
    act(() => vi.advanceTimersByTime(450));
    expect(frameOpacities(container)).toEqual(['0', '1', '0']);
    act(() => vi.advanceTimersByTime(450));
    expect(frameOpacities(container)).toEqual(['0', '0', '1']);
    act(() => vi.advanceTimersByTime(450));
    expect(frameOpacities(container)).toEqual(['0', '1', '0']); // 핑퐁 되돌아옴
  } finally {
    vi.useRealTimers();
  }
});

test('illustration이 없으면 픽토그램 + 근육맵만 렌더한다', () => {
  const { container } = render(<ExerciseHero exercise={{ ...bench, illustration: undefined, muscles: undefined }} />);
  expect(container.querySelectorAll('img')).toHaveLength(0);
  expect(screen.getByRole('img', { name: /자극 부위/ })).toBeInTheDocument();
});

test('근육맵이 muscles 기반으로 함께 렌더된다', () => {
  render(<ExerciseHero exercise={bench} />);
  expect(screen.getByRole('img', { name: '자극 부위: 가슴' })).toBeInTheDocument();
});
```

`src/screens/ManageScreen.test.tsx` 출처 테스트에 `expect(screen.getByText(/react-body-highlighter/)).toBeInTheDocument();` 추가.

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/components/ExerciseHero.test.tsx src/screens/ManageScreen.test.tsx`
Expected: 신규 FAIL

- [ ] **Step 3: 구현**

`src/components/ExerciseHero.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react';
import type { Exercise } from '../types';
import ExerciseIcon from './ExerciseIcon';
import MuscleMap from './MuscleMap';

const FRAME_MS = 450;
const SEQ = [0, 1, 2, 1]; // 핑퐁: 1→2→3→2

// 세션 히어로: 동작 3프레임 핑퐁 + 근육맵. 프레임 상태는 이 컴포넌트 내부 — 부모 재렌더 유발 금지.
export default function ExerciseHero({ exercise }: { exercise: Exercise }) {
  const urls = useMemo(() => {
    if (!exercise.illustration) return [];
    const base = import.meta.env.BASE_URL + exercise.illustration.replace(/\.svg$/, '');
    return [`${base}.svg`, `${base}-2.svg`, `${base}-3.svg`];
  }, [exercise.illustration]);
  const [step, setStep] = useState(0);
  const [dead, setDead] = useState<Set<number>>(new Set());

  const reduced = typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (urls.length === 0 || reduced) return;
    const t = setInterval(() => {
      if (document.hidden) return; // 백그라운드 일시정지
      setStep((s) => (s + 1) % SEQ.length);
    }, FRAME_MS);
    return () => clearInterval(t);
  }, [urls.length, reduced]);

  // 로드 실패 프레임은 순환에서 제외 — 현재 스텝이 죽은 프레임이면 살아있는 프레임 중 첫 번째 표시
  const liveFrame = (() => {
    const want = SEQ[step];
    if (!dead.has(want)) return want;
    const alive = [0, 1, 2].filter((i) => !dead.has(i));
    return alive.length > 0 ? alive[0] : -1;
  })();

  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
      {urls.length > 0 && liveFrame >= 0 ? (
        <div style={{ position: 'relative', flex: 1, height: 170, background: 'var(--surface-2)', borderRadius: 14, padding: 10 }}>
          {urls.map((u, i) => (
            <img
              key={u} src={u} alt={i === 0 ? `${exercise.name} 동작` : ''} aria-hidden={i !== 0}
              style={{
                position: 'absolute', inset: 10, width: 'calc(100% - 20px)', height: 'calc(100% - 20px)',
                objectFit: 'contain', opacity: i === liveFrame ? 1 : 0, transition: 'opacity 120ms linear',
              }}
              onError={() => setDead((d) => new Set(d).add(i))}
            />
          ))}
        </div>
      ) : (
        <div className="hero-icon" style={{ flex: 1, height: 170 }}>
          <ExerciseIcon iconKey={exercise.iconKey ?? 'barbell'} />
        </div>
      )}
      <div style={{ width: 108, background: 'var(--surface-2)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8 }}>
        <MuscleMap muscles={exercise.muscles} bodyPart={exercise.bodyPart} />
      </div>
    </div>
  );
}
```

`src/screens/SessionScreen.tsx` — 히어로 줄 교체:
`{group.length === 1 && gex && <ExerciseImage exercise={gex} className="hero-img" />}` → `{group.length === 1 && gex && <ExerciseHero exercise={gex} />}` (import 교체 — ExerciseImage import는 다른 사용처 없으면 제거)

`src/screens/ManageScreen.tsx` 출처 줄에 ` · 근육맵: <a href="https://github.com/giavinh79/react-body-highlighter" target="_blank" rel="noreferrer" style={{ color: 'var(--muted)' }}>react-body-highlighter</a> (MIT)` 추가.

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/components/ExerciseHero.test.tsx src/components/MuscleMap.test.tsx src/screens/SessionScreen.test.tsx src/screens/ManageScreen.test.tsx`
Expected: 전부 PASS — 특히 SessionScreen 기존 37개 무변경(매초 재조회 금지 포함)

- [ ] **Step 5: 커밋**

```bash
git add src/components/ExerciseHero.tsx src/components/ExerciseHero.test.tsx src/screens/SessionScreen.tsx src/screens/ManageScreen.tsx src/screens/ManageScreen.test.tsx src/styles.css
git commit -m "feat: 세션 히어로 동작 애니메이션(3프레임 핑퐁) + 근육맵 나란히"
```

---

### Task 4: 전체 검증

- [ ] **Step 1:** `npm test` 전체 PASS, `npx tsc --noEmit`, `npm run build`(프리캐시 9 entries 유지 확인 — -2/-3도 globIgnores 적용)
- [ ] **Step 2:** 실패 시 수정 후 `git add -A src && git commit -m "fix: 애니 히어로 통합 검증 수정"`
