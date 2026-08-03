const KEY = 'wt-weight-unit';

export type WeightUnit = 'kg' | 'lb';

export const KG_PER_LB = 0.45359237;

export function getWeightUnit(): WeightUnit {
  return localStorage.getItem(KEY) === 'lb' ? 'lb' : 'kg';
}

export function setWeightUnit(u: WeightUnit): void {
  localStorage.setItem(KEY, u);
}

// kg 저장값 → 현재 단위 표시값 (소수 1자리)
export function kgToDisplay(kg: number): number {
  const v = getWeightUnit() === 'lb' ? kg / KG_PER_LB : kg;
  return Math.round(v * 10) / 10;
}

// 현재 단위 입력값 → kg 저장값 (소수 2자리 — lb 왕복 보장)
export function displayToKg(v: number): number {
  const kg = getWeightUnit() === 'lb' ? v * KG_PER_LB : v;
  return Math.round(kg * 100) / 100;
}
