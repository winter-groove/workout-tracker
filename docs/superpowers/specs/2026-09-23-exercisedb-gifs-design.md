# ExerciseDB 동작 GIF 통합 — 설계

날짜: 2026-09-23 · 상태: 승인(사용자 "1번으로 가자")

## 배경

세션 히어로의 3프레임 SVG 애니메이션(Everkinetic 선화)은 프레임별 그림 스케일이 달라 사람이 커졌다 작아졌다 보이고, 사용자는 그림체 자체도 마음에 들지 않는다고 했다. GIF 소스 12곳을 라이선스·비용·커버리지로 비교한 결과, 사용자는 **ExerciseDB 무료 티어**(플랜핏류 앱과 같은 2D 일러스트 GIF)를 선택했다.

## 소스 사실 (2026-09-23 직접 확인)

- API: `https://oss.exercisedb.dev/api/v1/exercises?limit=25&after=<exerciseId>` — 총 1,500종, 페이지당 최대 25, 커서 `after`, 약 10페이지마다 429(5초 대기 후 재시도로 통과)
- 항목: `exerciseId, name, gifUrl(https://static.exercisedb.dev/media/<id>.gif), bodyParts[], equipments[], targetMuscles[], secondaryMuscles[]`
- GIF: 180×180, 12프레임, 3초 루프(양 끝 포즈 1초 홀드), 50~125KB, 흰 배경, 워터마크 없음
- 이용 조건(swagger 설명문 원문): 허용 = "Personal projects, prototypes, educational tools, non-commercial apps" / 불허 = 상용·수익화 / 미디어 180p GIF 한정 / "Credit to AscendAPI is required when using this dataset in any project"
- **회색 지대**: 파일을 내려받아 자체 호스팅하는 것을 명시적으로 허용·금지하지 않음. 이 앱은 무료·비상업·개인용이고 출처를 표기하므로 "dataset 사용"으로 보고 자체 호스팅한다. 향후 이의가 있으면 $199 Starter(자체 호스팅·상용 명시)로 전환하면 파일만 교체하면 되도록 경로를 설계한다.

## 결정

1. **데이터 획득**: 파이프라인 스크립트가 API를 순회해 `.tmp-exercisedb/manifest.json`(gitignore)을 만들고, 매칭된 운동의 GIF만 `public/gifs/<id>.gif`로 내려받아 커밋한다(멱등: 파일 있으면 스킵, 300ms 간격, 429 백오프).
2. **포스터**: 목록 썸네일·reduced-motion용 정지 이미지를 `public/gifs/<id>.webp`(180×180, GIF 첫 프레임=홀드 포즈)로 파이프라인에서 생성한다(python3+Pillow 헬퍼 — 개발 시점 도구, 런타임 의존 없음).
3. **매칭 원칙(정밀 우선)**: 정확 일치 → 괄호 한정어 제거 후 유일 후보 → 완화(그쪽 이름 토큰 중 장비어를 뺀 나머지 ⊆ 우리 libId 토큰, 부위·장비 호환) → 후보 복수면 매칭하지 않고 로그(별칭표로 사람이 결정). 별칭표 `scripts/gif-aliases.json`(`{libId: exerciseId|null}`), 존재하지 않는 id는 즉시 오류.
4. **근육 메타**: 기존 `muscles`(Everkinetic)가 있으면 유지, 없고 GIF가 매칭되면 ExerciseDB target/secondary → 우리 17영역 어휘로 변환해 채운다(주동근 첫 원소).
5. **데이터 모델**: `Exercise.gif?: string`(예 `gifs/bench-press.gif`) 추가만. 포스터 경로는 `.gif→.webp` 치환으로 유도(필드 추가 없음). `LIBRARY_VERSION` 6→7, 동기화에 `gif` 포함. 백업 포맷 무변경.
6. **렌더 우선순위**: 히어로 = GIF(흰 패널) > 선화 2포즈 크로스페이드 > 픽토그램. 썸네일 = 포스터 webp > 선화 SVG > 픽토그램.
7. **선화 폴백 개선**: 문제의 2번 프레임을 버리고 1↔3 프레임 크로스페이드(650ms 간격·380ms ease-in-out) — 파이프라인은 frame-2 복사 중단, 기존 `*-2.svg` 삭제, 프레임 규약은 `<id>.svg`+`<id>-3.svg`.
8. **reduced-motion**: GIF 대신 포스터 webp를 정지 표시. 근육맵 정적(기존 규칙 유지).
9. **캐시**: SW 런타임 CacheFirst `/gifs/.+\.(gif|webp)$` → `exercise-gifs`(maxEntries 1500), 프리캐시 제외(`globIgnores: gifs/**`). 실사 `public/exercises/*.webp`(17MB, 렌더 안 됨)와 그 캐시 규칙은 삭제한다(백로그 처리). `imagePath` 필드는 데이터 모델 무변경 원칙에 따라 그대로 둔다.
10. **출처 표기**: 마이 탭 출처 줄 맨 앞에 `운동 동작 GIF: ExerciseDB (AscendAPI)`(ascendapi.com 링크) 추가. 기존 CC BY-SA·MIT 줄 유지.

## 불변 원칙(기존 마스터 스펙 승계)

데이터 모델·스키마·백업 무변경(optional 필드 추가만), 기능 제거 0, 코치=순수 함수, 기존 테스트 무변경 통과(명시된 갱신 제외), 새 npm 의존성 금지, UI 한국어, 토큰 색만(GIF 패널 흰색 `#FFFFFF`는 GIF 배경과의 이음새 때문에 예외로 허용), 단계 완료 시 배포 가능.

## 성공 기준

- GIF 매칭 ≥ 350종(추정 정확 197 + 완화·별칭), 오매칭 0(최종 리뷰 전수 재계산)
- `gif` 있는 운동은 `public/gifs/<id>.gif`와 `<id>.webp`가 모두 존재(테스트로 고정)
- 세션 히어로에서 GIF가 흰 패널 안에 매끄럽게 재생되고, 운동 전환 시 이전 GIF 잔상 없음
- 프리캐시 9 entries 유지, 기존 테스트 전부 통과
