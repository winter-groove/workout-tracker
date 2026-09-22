# 운동 일러스트 도입 설계 (실사 → 플랜핏풍 일러스트)

날짜: 2026-09-22

## 목적

운동 이미지(현 실사 사진)를 오픈소스 동작 일러스트로 교체한다. 매칭되지 않는 운동은 기존 픽토그램으로 폴백 — 어떤 화면에도 실사 사진이 남지 않는다.

## 소스 (스파이크 검증 완료)

- **bryllim/workout-guide** (에버키네틱 계열): 302종 × 3프레임, 512² 투명 SVG, **흰색 단색**(다크 테마 무보정 호환), 개당 ~15KB
- 라이선스 **CC BY-SA 4.0** → 마이 탭 하단 출처 표기 필수
- 단순 이름 매칭은 736개 중 33%이고 오매칭 존재(펙덱→나비 스트레칭) → **검증 규칙 + 수동 별칭표** 필수

## 구성 요소

### 1. 파이프라인 `scripts/build-illustrations.mjs` (오프라인 1회성 도구)

- 입력: workout-guide 저장소(shallow clone to temp)의 `manifest.json` + `assets/*/frame-1.svg`, 우리 `src/data/exercise-library.json`, 별칭표 `scripts/illustration-aliases.json`
- 매칭 규칙 (순서대로, 오매칭 제로가 목표 — 놓치면 픽토그램이라 안전, 오매칭은 눈에 보이는 버그):
  1. `isStretch: true` 항목 전체 제외
  2. 별칭표 우선: `{ "<우리 libId>": "<그쪽 slug>" }` (값 `null` = 명시적 제외)
  3. 자동: libId 정규화 == slug 정규화 (정확 일치만 — 포함 매칭 금지)
  4. 자동 완화: 토큰 부분집합 일치는 **장비 호환 AND 근육→부위 호환일 때만** (Chest→가슴, Lats/Upper Back/Lower Back→등, Quadriceps/Hamstrings/Glutes/Calves→하체, Shoulders→어깨, Biceps/Triceps/Forearms→팔, Abs/Obliques/Core→코어; 장비: Barbell→바벨, Dumbbell→덤벨, Machine/Smith→머신, Cable→케이블, Bodyweight/None→맨몸, 그 외→기타 허용)
- 출력: `public/illustrations/<우리 id>.svg` (frame-1 복사) + `exercise-library.json` 매칭 항목에 `illustration: 'illustrations/<id>.svg'` 기록(재실행 시 비매칭 항목의 잔존 필드 제거) + 매칭 통계 출력
- 별칭표의 libId·slug 오타는 스크립트가 에러로 중단

### 2. 데이터·동기화

- `Exercise.illustration?: string` (선택 필드 — 스키마 무변경)
- `seedLibrary` 동기화 필드에 `illustration` 추가 (isHidden/isFavorite/unit은 계속 보존), `LIBRARY_VERSION` 4→5 — 기존 설치에 자동 반영
- 백업 왕복 자동 보존 (테스트로 고정)

### 3. UI — 실사 완전 제거

- `ExerciseImage`: `illustration` 있으면 SVG `<img>`(기존 히어로/썸네일 틀 유지), 없으면 `ExerciseIcon` 픽토그램. **imagePath(사진)는 더 이상 렌더하지 않음** (데이터 필드는 백업 호환 위해 유지)
- `public/exercises/` 사진 파일(17MB)은 이번 사이클에서 삭제하지 않음 — 일러스트 정착 확인 후 후속 정리 (롤백 안전성)
- `vite.config.ts` runtimeCaching에 `illustrations/` CacheFirst 추가(사진 규칙과 동일 패턴), precache 제외 유지

### 4. 별칭 큐레이션 (별도 태스크)

- 1순위: `legacy-55` 전부 — 사용자 주력 운동, **100% 커버 목표** (그쪽 카탈로그에 실물이 없는 항목만 `null`)
- 2순위: 자동 매칭 실패분 중 한국 헬스장 상용 운동 위주 최대한
- 큐레이터 규칙: manifest의 equipment/primaryMuscle이 우리 항목과 모순이면 매핑 금지, 확신 없으면 빼기(픽토그램이 오매칭보다 낫다)

### 5. 출처 표기

- 마이 탭 최하단: `운동 일러스트: Workout Guide(Bryl Lim) · Everkinetic — CC BY-SA 4.0` + 링크

## 에러/엣지

- 일러스트 로드 실패(파일 유실): ExerciseImage 기존 onError 폴백 경로로 픽토그램
- 커스텀 운동: 변화 없음(픽토그램)
- 라이브러리 재생성(build-library) 시 illustration 필드 보존 확인

## 테스트

- ExerciseImage: illustration 우선 렌더 / 없으면 픽토그램 / 사진(imagePath만 있는 항목)은 렌더 안 함
- seedLibrary v5 동기화가 illustration 반영 + 사용자 필드 보존
- 백업 왕복 illustration 보존
- 파이프라인 자체는 커밋 전 실행 결과(통계·검증 에러 0)로 게이트

## 범위 제외 (YAGNI)

- 3프레임 애니메이션, 사진 파일 삭제, 근육 하이라이트 색 변환, svgo 최적화
