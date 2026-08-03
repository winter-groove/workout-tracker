# 운동 즐겨찾기 설계

날짜: 2026-08-03

## 목적

자주 하는 운동을 ★로 표시해 picker 최상단에서 바로 선택.

## 요구사항 (사용자 확정)

- Exercise별 즐겨찾기 토글 — picker 행과 관리 탭 양쪽
- picker 구간: ★ 즐겨찾기(가나다) → 최근 한 운동(즐겨찾기 제외) → 전체 운동. 검색·부위 칩 전 구간 적용, 빈 구간 헤더 생략

## 구성 요소

### 1. 데이터 — `Exercise.isFavorite?: boolean` (types.ts)

Dexie 스토어/인덱스 무변경, 백업 하위 호환. `src/db/exercises.ts`:

```ts
setExerciseFavorite(id: string, favorite: boolean): Promise<void>  // update({ isFavorite })
```

- `setExerciseHidden(id, true)` 시 `isFavorite: false`도 함께 설정 (숨긴 운동이 즐겨찾기 구간에 남는 모순 방지)
- 시드 v3 이름 동기화(`{...cur, ...}`)는 isFavorite 보존 — 테스트로 고정

### 2. picker — `ExercisePicker.tsx`

- 행을 `button.ex-row` → `div.ex-row`(onClick 선택)로 바꾸고 행 우측에 ☆/★ 버튼 (`aria-label="{이름} 즐겨찾기"`, stopPropagation — 중첩 button 방지 목적 포함)
- 구간: `favorites = visible.filter(isFavorite)`(listExercises의 가나다 정렬 유지) / `recent = visible.filter(!isFavorite && lastDone)` 최근순 / `rest = 나머지`
- 헤더: 즐겨찾기 있으면 `★ 즐겨찾기`, 최근 있으면 `최근 한 운동`, (즐겨찾기∪최근 존재 && rest 존재) 시 `전체 운동`
- 토글은 즉시 저장, liveQuery로 자동 반영

### 3. 관리 탭 — `ManageScreen.tsx`

각 행 우측 버튼 그룹에 ☆/★ 토글 추가 (숨기기/삭제 옆).

## 에러/엣지 케이스

- 숨김 처리 → 즐겨찾기 자동 해제. 보이기 복원 시 즐겨찾기는 해제 상태 유지(재지정 필요 — 단순 규칙)
- 즐겨찾기가 검색/부위 필터에 걸러지면 구간 자체가 생략됨 (전 구간 visible 기준)
- 커스텀 운동도 동일 동작. 백업 왕복 보존

## 테스트

- setExerciseFavorite 토글, 숨김 시 해제, 시드 동기화 보존, 백업 왕복 보존
- picker: 즐겨찾기 구간 최상단·최근에서 제외, 별 탭 시 토글되고 onSelect 미발생(전파 차단), 필터 적용
- 관리 탭: 별 토글 저장

## 범위 제외 (YAGNI)

- 즐겨찾기 정렬 커스텀, 홈/기록 노출, 즐겨찾기 전용 필터 칩
