const KEY = 'wt-weight-unit';

export type WeightUnit = 'kg' | 'lb';

export const KG_PER_LB = 0.45359237;

export function getWeightUnit(): WeightUnit {
  return localStorage.getItem(KEY) === 'lb' ? 'lb' : 'kg';
}

export function setWeightUnit(u: WeightUnit): void {
  localStorage.setItem(KEY, u);
}

// 운동별 단위 — 지정 없거나 삭제된 운동이면 전역 설정
export function unitFor(ex?: { unit?: WeightUnit }): WeightUnit {
  return ex?.unit ?? getWeightUnit();
}

// kg 저장값 → 단위 표시값 (소수 1자리). unit 생략 시 전역 설정
export function kgToDisplay(kg: number, unit: WeightUnit = getWeightUnit()): number {
  const v = unit === 'lb' ? kg / KG_PER_LB : kg;
  return Math.round(v * 10) / 10;
}

// 단위 입력값 → kg 저장값 (소수 2자리 — lb 왕복 보장). unit 생략 시 전역 설정
export function displayToKg(v: number, unit: WeightUnit = getWeightUnit()): number {
  const kg = unit === 'lb' ? v * KG_PER_LB : v;
  return Math.round(kg * 100) / 100;
}

// 세트 표 셀: lb면 kg 환산 병기
export function fmtWeightCell(kg: number, unit: WeightUnit): string {
  const v = kgToDisplay(kg, unit);
  return unit === 'lb' ? `${v} (${kgToDisplay(kg, 'kg')}kg)` : `${v}`;
}

// 요약 줄 라벨: 단위 접미사 포함, lb면 kg 병기
export function fmtWeightLabel(kg: number, unit: WeightUnit): string {
  const v = kgToDisplay(kg, unit);
  return unit === 'lb' ? `${v}lb (${kgToDisplay(kg, 'kg')}kg)` : `${v}kg`;
}
