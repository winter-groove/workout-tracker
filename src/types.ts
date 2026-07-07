export const BODY_PARTS = ['가슴', '등', '하체', '어깨', '팔', '코어', '기타'] as const;
export type BodyPart = (typeof BODY_PARTS)[number];

export const EQUIPMENTS = ['바벨', '덤벨', '머신', '케이블', '맨몸', '기타'] as const;
export type Equipment = (typeof EQUIPMENTS)[number];

export const ICON_KEYS = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight'] as const;
export type IconKey = (typeof ICON_KEYS)[number];

export interface Exercise {
  id: string;            // 내장: 'lib-<slug>', 커스텀: crypto.randomUUID()
  name: string;
  bodyPart: BodyPart;
  equipment: Equipment;
  imagePath?: string;    // 내장 운동: 'exercises/<slug>.webp'
  iconKey?: IconKey;     // 커스텀 운동용 픽토그램
  isCustom: boolean;
  isHidden: boolean;
}

export interface RoutineItem {
  exerciseId: string;
  defaultSets: number;
}

export interface Routine {
  id: string;
  name: string;
  items: RoutineItem[];
}

export interface SetRecord {
  weight: number;
  reps: number;
  completedAt?: number; // epoch ms, 없으면 미완료
}

export interface SessionEntry {
  exerciseId: string;
  sets: SetRecord[];
}

export interface Session {
  id: string;
  startedAt: number;
  finishedAt?: number; // 없으면 진행 중
  routineName?: string;
  entries: SessionEntry[];
}
