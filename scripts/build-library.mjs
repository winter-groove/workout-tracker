import { readFile, writeFile } from 'node:fs/promises';

const DB_URL = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json';
const CATEGORIES = new Set(['strength', 'powerlifting', 'olympic weightlifting', 'strongman', 'plyometrics']);
const EQUIP_MAP = new Map([
  ['barbell', '바벨'], ['e-z curl bar', '바벨'],
  ['dumbbell', '덤벨'], ['machine', '머신'], ['cable', '케이블'], ['body only', '맨몸'],
]);
const MUSCLE_MAP = new Map([
  ['chest', '가슴'],
  ['lats', '등'], ['middle back', '등'], ['lower back', '등'], ['traps', '등'],
  ['quadriceps', '하체'], ['hamstrings', '하체'], ['glutes', '하체'],
  ['calves', '하체'], ['adductors', '하체'], ['abductors', '하체'],
  ['shoulders', '어깨'],
  ['biceps', '팔'], ['triceps', '팔'], ['forearms', '팔'],
  ['abdominals', '코어'],
]);

const library = JSON.parse(await readFile('src/data/exercise-library.json', 'utf8'));
const ko = JSON.parse(await readFile('scripts/library-ko.json', 'utf8'));
const all = await (await fetch(DB_URL)).json();

const existingLibIds = new Set(library.map((x) => x.libId));
const existingIds = new Set(library.map((x) => x.id));
const names = new Set(library.map((x) => x.name));

const candidates = all.filter(
  (e) => CATEGORIES.has(e.category) && e.images?.[0] && !existingLibIds.has(e.id),
);

const missing = candidates.filter((e) => !ko[e.id]);
if (missing.length > 0) {
  console.error(`❌ 번역 누락 ${missing.length}건:`);
  for (const m of missing) console.error(`  "${m.id}": "",  // ${m.name}`);
  process.exit(1);
}

const added = [];
for (const e of candidates) {
  const id = e.id.toLowerCase().replaceAll('_', '-').replaceAll('/', '-');
  if (existingIds.has(id)) {
    console.error(`❌ id 충돌: ${id} (libId ${e.id})`);
    process.exit(1);
  }
  const name = ko[e.id].trim();
  if (name === '' || names.has(name)) {
    console.error(`❌ 이름 중복/빈값: "${name}" (libId ${e.id})`);
    process.exit(1);
  }
  existingIds.add(id);
  names.add(name);
  added.push({
    id,
    libId: e.id,
    name,
    bodyPart: MUSCLE_MAP.get(e.primaryMuscles?.[0]) ?? '기타',
    equipment: EQUIP_MAP.get(e.equipment) ?? '기타',
  });
}

const out = [...library, ...added];
await writeFile('src/data/exercise-library.json', JSON.stringify(out, null, 2) + '\n');
console.log(`✓ 총 ${out.length}개 (기존 ${library.length} + 신규 ${added.length})`);
