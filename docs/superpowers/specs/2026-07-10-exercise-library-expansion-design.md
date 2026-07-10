# 운동 라이브러리 대확장 (~700개) 설계

날짜: 2026-07-10

## 목적

사용자 피드백 "운동 종류가 너무 적음"(현재 55개) 해결 — free-exercise-db(873개)에서 근력 계열 전부(~700개)를 한국어 이름으로 추가한다.

## 요구사항 (사용자 확정)

- 규모: **근력 운동 전부** — 스트레칭·유산소 제외, 나머지 전부
- 이름은 전부 한국어 (관용 외래어 표기)
- 기존 사용자에게도 자동 반영, 앱 설치 용량은 유지 (이미지 런타임 캐싱 전환)

## 데이터 소스·필터·매핑

소스: `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json` (이미지 포함, 기존 fetch 스크립트와 동일 소스)

**필터**: `category ∈ {strength, powerlifting, olympic weightlifting, strongman, plyometrics}` — `stretching`, `cardio` 제외. 첫 이미지(`images[0]`)가 없는 항목 제외.

**기구 매핑** (`equipment` 필드):

| free-exercise-db | 앱 |
|---|---|
| barbell, e-z curl bar | 바벨 |
| dumbbell | 덤벨 |
| machine | 머신 |
| cable | 케이블 |
| body only | 맨몸 |
| 그 외 전부 (kettlebell, bands, medicine ball, exercise ball, foam roll, other, null 등) | 기타 |

**부위 매핑** (`primaryMuscles[0]` 기준):

| 근육 | 부위 |
|---|---|
| chest | 가슴 |
| lats, middle back, lower back, traps | 등 |
| quadriceps, hamstrings, glutes, calves, adductors, abductors | 하체 |
| shoulders | 어깨 |
| biceps, triceps, forearms | 팔 |
| abdominals | 코어 |
| neck, 그 외/누락 | 기타 |

## 구성 요소

### 1. 번역 맵 — `scripts/library-ko.json` (신규, 커밋 대상)

`{ "<libId>": "<한국어 이름>" }` 형태. 필터를 통과한 모든 신규 libId에 대해 작성 (기존 55개 libId는 불필요 — 기존 이름 유지).

번역 규칙:
- 관용 외래어 표기: Bench Press→벤치프레스, Deadlift→데드리프트, Lying→라잉, Seated→시티드, Incline→인클라인, Close-Grip→클로즈그립 등
- 변형 구분 유지 (그립·각도·기구가 이름에 있으면 번역에도 반영)
- 라이브러리 전체(기존 55 + 신규)에서 이름 중복 금지 — 중복 발생 시 구분어 추가 (예: "덤벨 벤치프레스 (얼터네이트)")

### 2. 생성 스크립트 — `scripts/build-library.mjs` (신규)

1. exercises.json 다운로드 → 필터·매핑 적용
2. 기존 `src/data/exercise-library.json`의 55개는 **그대로 보존** (id·name·libId 불변), 이미 있는 libId는 신규에서 제외
3. 신규 항목: `id` = libId를 소문자화하고 `_`→`-` 치환한 슬러그 (충돌 시 에러로 중단), `name` = 번역 맵에서 조회 (누락 시 에러로 중단 — 누락 libId 목록 출력)
4. 최종 배열(기존 55 + 신규, 이름 중복 검사)을 `src/data/exercise-library.json`에 기록
5. `npm run build-library` 스크립트로 등록

### 3. 이미지 — 기존 `npm run fetch-images` 재실행

기존 스크립트가 라이브러리 전체를 순회하므로 그대로 재실행 → `public/exercises/*.webp` ~700개 생성·커밋 (총 10~15MB 예상, 리포·gh-pages 허용 범위).

### 4. PWA 캐싱 전환 — `vite.config.ts`

- `workbox.globPatterns`에서 `webp` 제거 (운동 이미지 프리캐시 제외 — 다른 webp 자산 없음 확인됨)
- `workbox.runtimeCaching` 추가:

```js
runtimeCaching: [{
  urlPattern: /\/exercises\/.+\.webp$/,
  handler: 'CacheFirst',
  options: {
    cacheName: 'exercise-images',
    expiration: { maxEntries: 1000 },
  },
}],
```

효과: 설치 용량 현행 유지, 이미지는 처음 표시될 때 캐시되어 이후 오프라인 표시 가능. (트레이드오프: 최초 표시는 네트워크 필요 — ExerciseImage의 기존 로드 실패 fallback 동작 확인 포함)

### 5. 시드 버전 — `src/db/exercises.ts`

`LIBRARY_VERSION = 2` — 기존 메커니즘이 신규 행만 추가 (기존 사용자 자동 반영, 사용자가 수정/숨긴 기존 행은 미변경).

### 6. 관리 탭 검색 — `ManageScreen.tsx`

운동 목록 위에 이름 검색 인풋 추가 (picker의 `운동 이름 검색`과 동일 패턴, `includes` 매칭). 700개 목록에서 숨기기 관리를 가능하게 함.

## 에러/엣지 케이스

- 번역 누락·id 충돌·이름 중복: build-library가 에러로 중단 (조용한 누락 방지)
- 기존 55개 id·이름 보존: 테스트로 고정 (세션 기록의 exerciseId 참조 보호)
- 이미지 없는 항목: 필터에서 제외되므로 발생 안 함; 런타임 로드 실패 시 ExerciseImage 기존 fallback
- 기존 사용자의 숨김/커스텀 운동: seedLibrary가 existing id를 건너뛰므로 영향 없음

## 테스트

- `exercise-library.test.ts` 확장: 전체 id·libId·**이름** 중복 없음, 부위·기구 유효, **총 개수 ≥ 600**, **기존 55개 (id, name) 스냅샷 보존**
- 이미지 전수 확인: 검증 단계에서 라이브러리 모든 id에 대응하는 `public/exercises/<id>.webp` 존재 확인 (node 스크립트)
- `seedLibrary` 버전 2 마이그레이션 테스트: 버전 1 상태(55개 시드 + 사용자 숨김 1건)에서 재시드 시 신규만 추가되고 숨김 유지
- ManageScreen 검색 테스트
- 전체 npm test + build

## 범위 제외 (YAGNI)

- 운동 상세 설명/지침 텍스트, 보조 근육 표시, 운동 난이도
- picker 가상 스크롤 (700개 렌더는 문제 시 후속)
- 스트레칭·유산소 카테고리
