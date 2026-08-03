# 무게 단위 kg/lb 설계

날짜: 2026-08-03

## 목적

파운드(lb) 사용자 지원 — 전역 단위 설정으로 입력·표시를 lb로 전환하되 데이터는 kg로 통일.

## 요구사항 (사용자 확정)

- 관리 탭 설정에서 kg ↔ lb 전환, 기존 기록 전부가 선택 단위로 표시
- **저장은 항상 kg(canonical)** — 백업·과부하 비교·PR 판정 로직 무변경, 단위 전환이 기록 의미를 바꾸지 않음

## 구성 요소

### 1. `src/db/weightUnit.ts` (신규 — settings.ts 패턴)

```ts
export type WeightUnit = 'kg' | 'lb';
export const KG_PER_LB = 0.45359237;
getWeightUnit(): WeightUnit           // localStorage 'wt-weight-unit', 기본 'kg'
setWeightUnit(u: WeightUnit): void
kgToDisplay(kg: number): number       // 현재 단위로 변환 후 소수 1자리 반올림
displayToKg(v: number): number        // 입력값을 kg로 변환 후 소수 2자리 반올림
```

왕복 보장: 45lb 입력 → 20.41kg 저장 → 45.0lb 표시. kg 모드는 항등(소수 1자리 반올림만).

### 2. `progress.ts` — `fmtWeightDelta` 단위 인지

화살표는 kg 원값 비교 유지, 표시 숫자는 `kgToDisplay(cur) - kgToDisplay(prev)`(소수 1자리)로 변환하고 라벨은 현재 단위. kg 모드 출력은 기존과 동일(기존 테스트 무변경). `fmtVolumeDelta`(%)는 단위 무관 — 무변경.

### 3. 화면 적용 (표시·입력만 — 저장 경로는 displayToKg 경유)

- **SessionScreen**: set-head 라벨 `무게(kg)` → `무게(${unit})`, 입력 value=`kgToDisplay(weight)`(0이면 빈칸 유지)·onChange=`displayToKg`·step kg 0.5/lb 2.5, `🔥 지난번` 문자열(`fmtLast`)과 `📈 볼륨` pill 값 변환
- **EditSessionScreen**: 무게 입력 동일 처리
- **SummaryScreen**: `볼륨 Xkg`·`최고 Ykg` 값·라벨 변환
- **HistoryScreen**: 세트 문자열(`fmtSets` — 숫자만 변환), `볼륨`·`최고` 줄 변환
- **ManageScreen 설정 카드**: `무게 단위` select(kg/lb) — 즉시 저장, 화면들은 렌더 시 단위 조회(탭 전환 시 자동 반영)

### 4. 반올림 규칙

- 표시: 단위 변환 후 소수 1자리 (불필요한 .0은 JS 숫자 표기상 자동 생략)
- 저장: kg 소수 2자리 — lb 왕복 오차 방지에 충분, PR 동등 비교 안정(같은 lb 입력은 항상 같은 kg)

## 에러/엣지 케이스

- 단위 전환 후 과거 kg 기록(lb 비정수)은 소수 표시 허용 (예: 60kg → 132.3lb)
- lb 저장값을 kg 모드로 보면 20.41→20.4 표시 (저장값 불변)
- 볼륨도 동일 계수 변환 (Σ는 kg 기준 계산 후 표시만 변환)
- 백업·getPreviousRecord·PR·프리필: kg 그대로 — 무영향

## 테스트

- weightUnit 단위: 기본 kg, 토글 영속, 변환 왕복(45lb↔20.41kg↔45.0lb), kg 항등
- fmtWeightDelta lb 모드 출력, kg 모드 기존 출력 불변
- SessionScreen lb 모드: 라벨·pill·입력 표시 lb, 입력 저장은 kg (toBeCloseTo)
- SummaryScreen·HistoryScreen lb 표시, ManageScreen 토글 저장
- 단위 관련 테스트는 종료 시 localStorage 정리 (kg 기본 복원)
- 기존 157개 테스트 무변경 통과 (kg 기본이므로)

## 범위 제외 (YAGNI)

- 세트별 혼합 단위, 플레이트 계산기, 자동 지역 감지
