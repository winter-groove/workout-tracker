import type { BodyPart } from '../types';

export const MUSCLE_REGIONS = [
  'chest', 'front-deltoids', 'back-deltoids', 'trapezius', 'upper-back', 'lower-back',
  'biceps', 'triceps', 'forearm', 'abs', 'obliques',
  'quadriceps', 'hamstring', 'gluteal', 'adductor', 'abductors', 'calves',
] as const;
export type MuscleRegion = (typeof MUSCLE_REGIONS)[number];

export const REGION_KO: Record<MuscleRegion, string> = {
  chest: '가슴',
  'front-deltoids': '전면 어깨',
  'back-deltoids': '후면 어깨',
  trapezius: '승모',
  'upper-back': '등 상부',
  'lower-back': '등 하부',
  biceps: '이두',
  triceps: '삼두',
  forearm: '전완',
  abs: '복근',
  obliques: '복사근',
  quadriceps: '대퇴사두',
  hamstring: '햄스트링',
  gluteal: '둔근',
  adductor: '내전근',
  abductors: '외전근',
  calves: '종아리',
};

export const BODYPART_REGIONS: Record<BodyPart, MuscleRegion[]> = {
  가슴: ['chest'],
  등: ['upper-back', 'lower-back', 'trapezius'],
  하체: ['quadriceps', 'hamstring', 'gluteal', 'calves'],
  어깨: ['front-deltoids', 'back-deltoids'],
  팔: ['biceps', 'triceps', 'forearm'],
  코어: ['abs', 'obliques'],
  기타: ['abs'],
};
