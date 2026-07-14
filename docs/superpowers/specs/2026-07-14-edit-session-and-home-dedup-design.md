# 세션 편집 화면 + 홈 중복 정리 설계

날짜: 2026-07-14

## 목적

(1) 완료된 과거 세션을 언제든 수정 — 빠뜨린 운동 추가, 잘못 넣은 운동 삭제, 세트 무게·횟수 수정. (2) 홈 "최근 운동" 카드와 기록 탭 세션 목록의 중복 제거 — 세션 목록은 기록 탭으로 일원화.

## 요구사항 (사용자 확정)

- 수정 방식: **전용 편집 화면** (재개 방식 아님 — 완료 상태 유지, 진행 중 운동과 충돌 없음)
- 편집 범위: 운동 추가/삭제 + 세트 수정/추가/삭제
- 홈: 최근 운동 카드 **제거** (달력이 날짜별 조회 담당)

## 구성 요소

### 1. `EditSessionScreen.tsx` (신규) — 라우트 `/edit/:sessionId`

- 로드: 세션 id로 조회, 없거나 **미완료면 홈으로 리다이렉트** (SummaryScreen과 동일 가드)
- 편집은 전부 **로컬 draft** (entries 깊은 복사) — 저장 전까지 DB 무변경
- 운동 카드별: 운동 이름 + `운동 삭제` 버튼, 세트 행(무게·횟수 입력 — 세션 화면과 동일 UX: 0이면 빈칸+placeholder, focus 시 전체 선택) + 세트별 `×` 삭제 + `＋ 세트 추가`(마지막 세트 복사, 없으면 0×10)
- `＋ 운동 추가`: 기존 ExercisePicker 재사용 (draft entries의 최빈 부위 초기 필터), 추가 시 `buildEntry(ex.id, 3, session.startedAt + 1)`로 그 날짜 기준 프리필
- **저장**: 세트 0개 운동 제거 → 운동 0개면 `alert('운동이 최소 1개는 있어야 해요. 기록 삭제는 기록 탭에서 할 수 있어요.')` 후 중단 → 모든 세트에 `completedAt` 보장(`?? session.startedAt + 1` — 완료 세션 불변식 유지) → `saveSession` → `/summary/:id`로 replace 이동 (요약·증감·PR 자동 재계산)
- **취소**: 변경 버리고 `/summary/:id`로 replace 이동
- startedAt·finishedAt·routineName은 유지

### 2. 요약 화면 — `SummaryScreen.tsx`

버튼 줄에 **`수정하기`** 추가 (모든 완료 세션 — 이어서 하기와 달리 날짜 제한 없음) → `/edit/:id` 이동.

### 3. `App.tsx` — `/edit/:sessionId` 라우트 추가

### 4. 홈 — `HomeScreen.tsx`

"최근 운동" 카드 전체 삭제. 시작 카드 + 달력 카드만 남음.

## 에러/엣지 케이스

- 미완료(진행 중) 세션 id로 `/edit` 접근: 홈 리다이렉트
- 편집 중 다른 탭 이동 후 복귀: draft는 화면 state라 사라짐 — 저장 전 이탈은 취소와 동일 (수용)
- 새로 추가한 세트의 completedAt: `session.startedAt + 1` (progress 계산은 존재 여부만 확인)
- 삭제된 운동(exerciseId 미해석) entry: '삭제된 운동'으로 표시, 편집·삭제 가능
- 무게 0 세트 저장 허용 (맨몸 운동 — 기존 동작과 동일)

## 테스트

- `EditSessionScreen.test.tsx` (신규): 세트 무게 수정 저장 → DB 반영·요약 복귀, 세트 × 삭제·＋ 추가 저장 반영, 운동 삭제 후 저장, 운동 추가(picker) 후 저장 시 completedAt 보장, 마지막 운동 삭제 후 저장 시 alert·무변경, 미완료 세션 리다이렉트, 취소 시 DB 무변경
- `SummaryScreen.test.tsx`: 수정하기 버튼 → `/edit` 이동
- `HomeScreen.test.tsx`: 최근 운동 카드 부재, 기존 달력 테스트의 중복 행(2개) 단언을 1개로 수정, 최근 운동 클릭 테스트 삭제

## 범위 제외 (YAGNI)

- 세션 날짜·루틴명 수정, 운동 순서 변경(드래그), 편집 이력/undo
