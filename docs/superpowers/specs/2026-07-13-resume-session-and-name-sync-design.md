# 세션 이어서 하기 + 라이브러리 이름 동기화 설계

날짜: 2026-07-13

## 목적

사용자 피드백 2건: (1) 실수로 "운동 완료"를 누르면 되돌릴 수 없음 → 요약 화면에서 재개 가능하게, (2) "리버스 펙덱 플라이"를 못 찾음 → 실제로는 "리버스 머신 플라이"로 존재 — 관용명으로 개명하고, 개명이 기존 사용자에게도 반영되도록 시드에 이름 동기화 추가.

## 구성 요소

### 1. `resumeSession` — `src/db/sessions.ts`

```ts
resumeSession(id: string): Promise<boolean>
  // 활성 세션이 이미 있거나, 세션이 없거나 미완료면 false (무변경)
  // 성공 시 해당 세션의 finishedAt을 제거해 활성 세션으로 되돌리고 true
```

구현: `db.sessions.get` 후 `finishedAt`을 뺀 객체로 `put` (Dexie put은 행 교체라 필드 제거됨).

### 2. 요약 화면 — `SummaryScreen.tsx`

- 하단 버튼을 `btn-row`로: `확인`(기존, primary) + **`이어서 하기`**(ghost)
- 표시 조건: `session.finishedAt`이 **오늘**(로컬 toDateString 비교)일 때만 — 과거 기록 재열람 시 미표시
- 클릭: `resumeSession(session.id)` → 실패(활성 세션 존재) 시 `alert('진행 중인 운동을 먼저 완료하세요')`, 성공 시 `/session`으로 이동(replace)
- 한계(수용): 완료 시 정리된 미체크 세트는 복구되지 않음 — 완료한 기록 보존과 이어서 추가가 목적

### 3. 개명 — `scripts/library-ko.json` + `src/data/exercise-library.json`

- `Reverse_Machine_Flyes`: `리버스 머신 플라이` → **`리버스 펙덱 플라이`** (두 파일 모두 동일하게 직접 수정 — build-library는 추가 전용이므로 재생성 불필요)
- legacy-55에 없는 항목이라 보존 테스트와 충돌 없음

### 4. 시드 이름 동기화 — `src/db/exercises.ts`

- `LIBRARY_VERSION = 3`
- `seedLibrary`가 신규 추가 후, **기존 내장(non-custom) 행의 name·bodyPart·equipment를 라이브러리 값과 다르면 갱신** (`bulkPut`). `isHidden`은 사용자 상태이므로 유지, 커스텀 운동은 건드리지 않음
- 향후 번역 교정이 기존 사용자에게 반영되는 재사용 메커니즘

## 에러/엣지 케이스

- 재개하려는데 다른 활성 세션 존재: false → alert, 아무 변화 없음
- 요약 화면을 기록 탭에서 연 과거 세션(finishedAt이 오늘 아님): 버튼 미표시
- 백데이트 세션을 오늘 완료: finishedAt은 오늘이므로 재개 가능 ✓ (startedAt은 과거 유지)
- 재개 후 다시 완료: 기존 finish 흐름 그대로 (요약 재계산)
- 이름 동기화와 세션 기록: 세션은 exerciseId만 참조하므로 개명에 영향 없음

## 테스트

- `sessions.test.ts`: resumeSession 성공(활성 세션 됨·finishedAt 제거), 활성 세션 존재 시 false·무변경, 미완료/없는 id에 false
- `SummaryScreen.test.tsx`: 오늘 완료 세션 → 버튼 표시·클릭 시 /session 이동·세션 재활성, finishedAt이 어제인 세션 → 버튼 없음, 활성 세션 존재 시 alert
- `exercises.test.ts`: v2 상태(옛 이름 행 + 숨김 1건 + 커스텀 1건) → seedLibrary → 이름 갱신·숨김 유지·커스텀 무변경·meta 3
- `exercise-library.test.ts` 또는 기존 테스트로 '리버스 펙덱 플라이' 존재 확인

## 범위 제외 (YAGNI)

- 미체크 세트 복구(완료 전 상태 스냅샷), 세션 편집(과거 세션 세트 수정), 검색 동의어 사전
