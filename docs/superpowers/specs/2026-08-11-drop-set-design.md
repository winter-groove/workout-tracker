# 드랍세트 설계

날짜: 2026-08-11

## 목적

한 세트를 끝내고 쉬지 않고 무게만 낮춰 이어가는 드랍세트를 기록할 수 있게. 세트 목록의 평평한 구조를 유지하면서 "직전 세트에 이어진다"는 관계만 표현한다.

## 요구사항 (사용자 확정)

- 운동 중 `↓ 드랍 추가` 버튼 1개로 마지막 세트에 드랍을 이어 붙임, 무게는 직전 세트의 **80% 자동 프리필**(수정 가능), 연속 누르면 2단·3단 드랍
- 세트 번호 표기: 본세트 `3`, 드랍 `3-1`·`3-2` — 운동 중 화면과 기록 표 동일

## 데이터 모델

```ts
export interface SetRecord {
  weight: number;
  reps: number;
  completedAt?: number;
  isDrop?: boolean;   // true면 직전 세트에 이어지는 드랍 (휴식 없이 무게만 낮춤)
}
```

- Dexie 스키마(인덱스) 변경 없음 — `pairedWithNext`·`isFavorite`과 동일한 선택 필드 패턴
- 백업 JSON은 sessions 테이블 통째 export/import이므로 자동 왕복 (보존 테스트 추가)
- **자가 치유 원칙**: 배열 첫 세트의 `isDrop`은 무시하고 본세트로 취급 (`groupsOf`의 dangling flag 무시와 동일). 데이터 위생을 위해 쓰기 시점(`finishSession`·편집 저장·`buildEntry`)에도 선두 플래그를 정리

## 구성 요소

### 1. `src/db/sessions.ts` — 표시 라벨 + 프리필 + 정리

```ts
// 세트 표시 라벨: 본세트 1,2,3…, 드랍은 직전 본세트 번호에 -1,-2… (첫 세트의 isDrop은 무시)
export function setLabels(sets: { isDrop?: boolean }[]): string[]
```
`sessionTitle`과 같은 "표시 전용 순수 함수" 자리에 둔다.

- `buildEntry`: 지난 기록을 프리필할 때 `isDrop`도 복사(인덱스 0은 제외) — 드랍 구조가 다음 세션에 그대로 이어짐
- `finishSession`: 미완료 세트를 걷어낸 뒤 각 entry의 **선두 세트 `isDrop` 해제** (기존 `pairedWithNext` 정리와 같은 자리)

### 2. `src/db/weightUnit.ts` — 스텝·드랍 무게

```ts
export function stepFor(unit: WeightUnit): number          // lb 2.5 / kg 0.5
export const DROP_RATIO = 0.8;
export function dropWeight(kg: number, unit: WeightUnit): number
```
`dropWeight`는 **표시 단위에서** 20% 낮춘 뒤 입력 스텝에 맞춰 반올림하고 kg으로 되돌린다 — 사용자가 보는 숫자가 늘 깔끔(70kg→56kg, 132.3lb→105lb). `stepFor`는 세션·편집 화면의 인라인 삼항식을 대체(중복 제거).

### 3. `src/screens/SessionScreen.tsx`

- 세트 행 번호·aria-label에 `setLabels` 적용 (`세트 3-1 무게`/`횟수`/`완료`) — 본세트 라벨은 기존과 동일해 기존 테스트 무영향
- `↓ 드랍 추가` 버튼(세트 추가 옆): 마지막 세트 기준 `{ weight: dropWeight(last.weight, u), reps: last.reps, isDrop: true }` 추가. 세트가 없으면 비활성
- **휴식 억제**: 세트 완료 시 `sets[setIdx + 1]?.isDrop`이면 휴식 타이머를 시작하지 않음. 드랍 체인의 마지막을 완료하면 정상 휴식
- `fmtLast` 지난번 배지: 드랍 앞에 `↓` 표기 (`70kg×10 · ↓56×8`)

### 4. 기록 표시

- `SessionDetails.tsx`(기록 탭·홈 달력 공용): 세트 칸에 `setLabels` 값
- `HistoryScreen.tsx` 운동별 보기 `fmtSets`: 드랍 앞에 `↓` (`70×10, ↓56×8`)
- `EditSessionScreen.tsx`: 세트 번호·삭제 aria-label에 `setLabels` 적용 + `↓ 드랍 추가` 버튼(세트 0개면 비활성). 저장 시 선두 `isDrop` 정리

### 5. 계산 (무변경)

볼륨은 드랍도 포함(실제 수행한 일), 최고 무게·PR은 본세트가 자연히 최대라 로직 변경 없음. 총볼륨·증감·요약 화면 모두 그대로.

## 에러/엣지 케이스

- 본세트 미완료 + 드랍만 완료 → 완료 시 선두 드랍이 본세트로 정리
- 세트 삭제는 기존대로 마지막 세트 제거(드랍이면 드랍이 지워짐)
- 무게 0에서 드랍 추가 → 0 (빈칸 표시)
- lb 운동: 드랍 무게가 2.5lb 스텝에 맞춰 프리필

## 테스트

- `setLabels`: 본세트만 / 드랍 포함 / 선두 드랍 자가 치유 / 다단 드랍
- `stepFor`·`dropWeight`: kg 70→56, lb 스텝 반올림, 0→0
- SessionScreen: 드랍 추가 → `3-1` 라벨·80% 무게·`isDrop` 저장 / 뒤에 드랍이 있으면 완료 시 휴식 타이머 없음 / 드랍 완료 시 휴식 있음
- `buildEntry`: 지난 세션의 드랍 구조 프리필
- `finishSession`: 선두 드랍 플래그 정리
- 기록 탭 세트 표에 `3-1` 표시 / 편집 화면 드랍 추가 후 저장 유지
- 백업 왕복에서 `isDrop` 보존
- 기존 테스트 전부 무변경 통과

## 범위 제외 (YAGNI)

- 드랍 전용 볼륨 통계, 중간 세트에 드랍 삽입, 드랍 비율 설정 UI, 요약 화면 세트 표
