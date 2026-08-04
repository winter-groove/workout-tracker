# 운동별 kg/lb 단위 + 세션 총볼륨 설계

날짜: 2026-08-04

## 목적

① 운동마다 기록 단위(kg/lb)를 따로 정할 수 있게 하고(전역 설정은 기본값 역할 유지), ② lb로 표시되는 무게에는 항상 kg 환산을 병기하며, ③ 완료 세션의 전체 총볼륨(모든 운동 볼륨 합, kg)을 요약 화면과 펼침 상세에 표시한다.

## 요구사항 (사용자 확정)

- lb 운동 조회 표시: **lb + kg 병기** — 예 `132.3lb (60kg)`
- 운동별 단위 선택: **세션 화면 토글** (한 번 바꾸면 그 운동에 저장, 이후 자동 적용)
- 총볼륨 표시 위치: **요약 화면 + 펼침 상세(SessionDetails 공용)** — 항상 kg
- 저장은 지금처럼 **항상 kg**(소수 2자리), 증감·PR 비교도 원본 kg — 불변

## 데이터 모델

- `types.ts` `Exercise`에 선택 필드 추가: `unit?: 'kg' | 'lb'` — Dexie 스키마(인덱스) 변경 없음, `isFavorite` 패턴과 동일
- 세션/세트 레코드는 무변경 (단위는 표시 속성일 뿐, 값은 kg)
- `seedLibrary`의 동기화 bulkPut은 `{ ...cur, name, bodyPart, equipment }` 스프레드라 `unit`이 자동 보존됨 — 회귀 테스트로 고정
- 백업 JSON: exercises 테이블 통째 export/import이므로 `unit` 자동 왕복 — 왕복 보존 테스트 추가

## 구성 요소

### 1. `src/db/weightUnit.ts` — 단위 파라미터화 + 헬퍼

- `kgToDisplay(kg, unit: WeightUnit = getWeightUnit())`, `displayToKg(v, unit = getWeightUnit())` — 기본값이 전역 설정이라 기존 호출부 무변경 호환
- 신규 `unitFor(ex?: { unit?: WeightUnit }): WeightUnit` — `ex?.unit ?? getWeightUnit()`. 삭제된 운동(exMap miss)은 전역 단위 fallback
- 신규 병기 포매터:
  - `fmtWeightCell(kg, unit)`: 세트 표 셀용 — lb면 `'132.3 (60kg)'`, kg면 `'60'`
  - `fmtWeightLabel(kg, unit)`: 요약 줄용 — lb면 `'132.3lb (60kg)'`, kg면 `'60kg'`

### 2. `src/db/progress.ts`

- `fmtWeightDelta(cur, prev, unit: WeightUnit = getWeightUnit())` — 증감 판단은 원본 kg, 표시 숫자·접미사는 unit. 병기 없음(증감치는 참고용)
- `fmtVolumeDelta`(%)는 단위 무관 — 무변경

### 3. `SessionScreen.tsx` — 운동별 토글 + 입력 단위

- 각 운동 카드 `.tags` 줄에(운동 빼기 버튼 앞) btn-sm 토글: 현재 유효 단위 표시 `kg ⇄`/`lb ⇄`(aria-label `{운동명} 단위 전환`), 탭하면 반대 단위를 `db.exercises.update(id, { unit })`로 저장(명시 저장 — 전역 바뀌어도 유지). useLiveQuery라 즉시 반영. `gex` 없으면(삭제된 운동) 토글 숨김
- 유효 단위 `u = unitFor(gex)`를 카드 단위로 계산: set-head `무게(u)`, 무게 input `kgToDisplay(w, u)`/`displayToKg(v, u)`, step `u==='lb' ? 2.5 : 0.5`
- 지난번 pill(`fmtLast`)·볼륨 pill(`overloadText`)도 u로 표시 (라이브 화면은 병기 없음 — 컴팩트)
- 슈퍼세트 그룹 내 카드마다 단위 독립

### 4. `EditSessionScreen.tsx`

- 무게 input을 entry별 `unitFor(exMap.get(e.exerciseId))`로 표시·환산 (토글은 없음 — 세션 화면에서만 변경)

### 5. `SessionDetails.tsx` (기록 탭·홈 달력 공용) + `SummaryScreen.tsx`

- entry별 `u = unitFor(exMap.get(e.exerciseId))`:
  - 세트 표 헤더 `무게(u)`, 무게 셀 `fmtWeightCell(set.weight, u)`
  - 요약 줄 `볼륨 fmtWeightLabel(p.volume, u) … · 최고 fmtWeightLabel(p.maxWeight, u) fmtWeightDelta(…, u)`
- **총볼륨 줄**: 요약 로드 후 entries 아래에 `총볼륨 {kgToDisplay(합, 'kg')}kg` (fontWeight 700). 합은 `summaries`의 `volume` 합(원본 kg) — 단위 혼합 세션에서도 항상 kg 하나로. 로드 전엔 생략
- SummaryScreen도 동일 규칙으로 entry 줄 표시 + card-h 아래 총볼륨 줄

### 6. `HistoryScreen.tsx` — 운동별로 보기

- 선택한 운동의 `u = unitFor(ex)`로 표시: 세트 문자열(`fmtSets`)은 단위 환산만(컴팩트 목록이라 병기 생략), 아래 요약 줄(볼륨·최고·증감)은 `fmtWeightLabel`/`fmtWeightDelta(…, u)`로 병기 적용

### 7. 전역 설정 (관리 탭)

- 기존 kg/lb select 유지 — `unit` 없는 운동의 기본 단위. 무변경

## 표시 규칙 요약

| 유효 단위 | 세트 표 셀 | 요약 줄 볼륨/최고 |
|---|---|---|
| kg | `60` | `60kg` |
| lb (운동별 또는 전역) | `132.3 (60kg)` | `132.3lb (60kg)` |

전역 lb 모드도 병기 규칙 적용 → **기존 lb 테스트는 병기 형식으로 갱신** (`'132.3'` → `/132.3 \(60kg\)/`).

## 에러/엣지 케이스

- 삭제된 운동 entry: `unitFor(undefined)` → 전역 단위
- 운동별 lb + 전역 kg(기본 조합): 그 운동만 lb 병기, 나머지 kg
- 토글 후 기존 세트 값: 내부 kg 그대로, 표시만 환산(손실 없음). lb 왕복 오차는 기존 소수 2자리 저장 규칙으로 흡수
- 총볼륨: 완료 세트 기준(EntryProgress.volume과 동일 소스) — 운동별 볼륨 줄 합과 항상 일치

## 테스트

- weightUnit: 명시 unit 파라미터 변환, `unitFor` fallback, `fmtWeightCell`/`fmtWeightLabel` kg·lb
- progress: `fmtWeightDelta` unit 파라미터
- SessionScreen: 토글 탭 → `exercises.unit` 저장 + input 환산 표시, step 변경
- SessionDetails(HistoryScreen 경유): 운동별 lb + 전역 kg 병기 표시, 총볼륨 줄
- SummaryScreen: 총볼륨 표시
- backup: `unit` 필드 왕복 보존
- exercises: seedLibrary 동기화가 `unit` 보존
- 기존 전역 lb 테스트: 병기 형식으로 갱신, 그 외 전역 kg 테스트 무변경 통과

## 범위 제외 (YAGNI)

- 관리 탭 운동별 단위 설정 UI, 세트별 단위 스냅샷 저장, 요약 화면 세트 표, 총볼륨의 직전 세션 대비 증감
