# 동작 애니메이션 + 근육맵 설계

날짜: 2026-09-22

## 목적

세션 히어로에서 운동 동작을 3프레임 플립북으로 반복 재생하고, 옆에 소형 인체 근육맵을 붙여 자극 부위(주동근)를 라임색 펄스로 표시한다.

## 사용자 확정

- 애니메이션은 **세션 히어로만** (썸네일·목록은 정지 frame-1 유지)
- 근육맵은 **히어로 옆 나란히** (주동근 펄스 + 협응근 은은한 표시, 앞/뒤 모습 자동 선택)

## 소스·데이터 (스파이크 검증)

- workout-guide 302종 **전부 frame-1/2/3 SVG 완비** — 매칭 297종 모두 애니메이션 가능
- manifest에 primaryMuscle(20어휘) + secondaryMuscles(288/302)
- 근육맵 폴리곤: [react-body-highlighter](https://github.com/giavinh79/react-body-highlighter) (MIT) — SVG 폴리곤을 **벤더링**해 자체 컴포넌트로 (의존성 추가 없이, 소스 파일에 MIT 저작권 고지 주석 유지 + 마이 탭 출처 줄에 추가)

## 구성 요소

### 1. 파이프라인 확장 (`scripts/build-illustrations.mjs`)

- 매칭된 운동마다 frame-2·frame-3도 복사: `public/illustrations/<id>-2.svg`, `<id>-3.svg` (frame-1은 기존 `<id>.svg` 유지 — 썸네일 호환). **규약: illustration 필드가 있으면 -2/-3도 반드시 존재** (파이프라인이 3개 모두 복사 실패 시 해당 운동 매칭 자체를 스킵)
- 근육 메타 기록: 매칭 항목에 `muscles?: string[]` — **우리 근육맵 영역 id 어휘로 변환해 저장** (첫 원소 = 주동근, 이후 = 협응근). 변환 불가 어휘(Mobility 등)는 생략
- manifest 근육 → 영역 id 매핑 표는 MuscleMap의 영역 id와 단일 원천 공유 (`src/data/muscle-regions.ts`의 상수를 스크립트가 import 불가하므로, 스크립트에 동일 표를 두고 **테스트로 두 표의 일치를 고정**)

### 2. 데이터

- `Exercise.muscles?: string[]` (선택 필드 — 스키마 무변경, 백업 자동 왕복)
- `seedLibrary` 동기화 필드에 muscles 추가, `LIBRARY_VERSION` 5→6

### 3. `src/components/MuscleMap.tsx` (신규)

- 벤더링한 앞/뒤 인체 폴리곤 + 영역 id (chest, front-deltoids, back-deltoids, trapezius, upper-back, lower-back, biceps, triceps, forearm, abs, obliques, quadriceps, hamstring, gluteal, adductor, abductors, calves)
- props `{ muscles?: string[]; bodyPart: BodyPart }`:
  - muscles 있으면 → 주동근(첫 원소) 영역 `mm-primary`(라임 펄스), 나머지 `mm-secondary`(정적 은은한 라임)
  - 없으면 → bodyPart 폴백 매핑(가슴→chest 등 그룹)을 주동근급으로 표시
  - 앞/뒤 뷰는 **주동근이 속한 면**으로 자동 선택 (양면 걸치면 주동근 우선)
- 펄스는 CSS `@keyframes`(opacity), `@media (prefers-reduced-motion: reduce)`에서 정적 하이라이트로
- 접근성: `role="img"` + `aria-label="자극 부위: {주동근 한국어명}"` — 영역 id → 한국어명 표 포함

### 4. `src/components/ExerciseHero.tsx` (신규, 세션 전용)

- illustration 있으면: 3프레임 핑퐁 재생(1→2→3→2, 프레임당 450ms). 프레임 상태는 **컴포넌트 내부** — 세션 화면 재렌더 유발 금지(기존 '매초 재조회 금지' 테스트 보호)
- 3프레임 겹쳐두고 opacity 토글(디코드 깜빡임 방지), `document.hidden`이면 일시정지, reduced-motion이면 frame-1 정지
- illustration 없으면: 기존 픽토그램 히어로
- 레이아웃: `[애니메이션 flex:1, h170] [근육맵 w≈110]` 가로 배치 — SessionScreen 히어로 자리를 이 컴포넌트로 교체 (단독 그룹일 때만 렌더되는 기존 조건 유지)

### 5. 출처

- 마이 탭 출처 줄에 `· 근육맵: react-body-highlighter (MIT)` 추가

## 에러/엣지

- -2/-3 프레임 로드 실패: 해당 프레임 스킵하고 성공 프레임만 순환(1프레임만 성공 시 정지) — onError로 프레임 제외
- 슈퍼세트(그룹 2+): 기존처럼 히어로 자체가 없음 — 변화 없음
- 커스텀 운동: 픽토그램 + bodyPart 근육맵
- 애니메이션 프레임은 런타임 캐시(illustrations/ 규칙 기존 적용) — 프리캐시 제외 유지

## 테스트

- 파이프라인: -2/-3 생성 수 = illustration 수, muscles 필드 어휘가 영역 id 집합에 포함(두 매핑 표 일치 테스트)
- MuscleMap: muscles 주동근 펄스 클래스/aria, bodyPart 폴백, 앞·뒤 자동 선택
- ExerciseHero: fake timers로 프레임 순환(1→2→3→2), reduced-motion 정지, hidden 일시정지, illustration 없음 → 픽토그램
- SessionScreen: 히어로 교체 후 기존 37개 무변경 통과(특히 매초 재조회 금지 테스트) + 근육맵 렌더 1개
- seedLibrary v6 muscles 동기화 + 백업 왕복

## 범위 제외 (YAGNI)

- 썸네일 애니메이션, 재생 속도 설정, 근육맵 탭 인터랙션, GIF/비디오 내보내기
