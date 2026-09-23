import { cp, mkdir, readFile, rm, writeFile, access } from 'node:fs/promises';
import { execSync } from 'node:child_process';

const REPO = 'https://github.com/bryllim/workout-guide.git';
const TMP = '.tmp-workout-guide';
const OUT = 'public/illustrations';

// 그쪽 근육 → 우리 부위 (모르는 값은 비호환)
// T2: 실제 manifest 어휘(Quads/Back/Legs/Rear Delts/Posterior Chain 등)로 확장 — Task 1 리포트의 갭 발견에 따름
const MUSCLE_TO_PART = new Map([
  ['Chest', '가슴'],
  ['Lats', '등'], ['Upper Back', '등'], ['Lower Back', '등'], ['Traps', '등'], ['Back', '등'],
  ['Quadriceps', '하체'], ['Quads', '하체'], ['Hamstrings', '하체'], ['Glutes', '하체'], ['Calves', '하체'],
  ['Adductors', '하체'], ['Abductors', '하체'], ['Legs', '하체'], ['Posterior Chain', '하체'],
  ['Shoulders', '어깨'], ['Rear Delts', '어깨'],
  ['Biceps', '팔'], ['Triceps', '팔'], ['Forearms', '팔'],
  ['Abs', '코어'], ['Obliques', '코어'], ['Core', '코어'],
]);
// 그쪽 장비 → 우리 장비 (배열 = 허용 목록, 모르는 값은 비호환)
// T2: manifest 실제 값은 'Resistance Band'(구 'Band'는 매치되지 않던 죽은 항목), 'Pull-up Bar' 추가 — 실제 어휘 전수 대조 결과
const EQUIP_COMPAT = new Map([
  ['Barbell', ['바벨']],
  ['Dumbbell', ['덤벨']],
  ['Machine', ['머신']], ['Smith Machine', ['머신']],
  ['Cable', ['케이블']],
  ['Bodyweight', ['맨몸']], ['None', ['맨몸']], ['Pull-up Bar', ['맨몸']],
  ['Kettlebell', ['기타']], ['Resistance Band', ['기타']], ['Plate', ['기타']], ['Other', ['기타']],
]);

// 그쪽 근육 → 우리 근육맵 영역 id (T1: MuscleMap 어휘, 근육 메타 계산용 — 부위 호환성 판정과는 별개)
const MUSCLE_TO_REGION = new Map([
  ['Chest', ['chest']],
  ['Shoulders', ['front-deltoids']],
  ['Rear Delts', ['back-deltoids']],
  ['Upper Back', ['upper-back', 'trapezius']],
  ['Back', ['upper-back', 'lower-back']],
  ['Lats', ['upper-back']],
  ['Lower Back', ['lower-back']],
  ['Posterior Chain', ['hamstring', 'gluteal', 'lower-back']],
  ['Hamstrings', ['hamstring']],
  ['Quads', ['quadriceps']],
  ['Glutes', ['gluteal']],
  ['Calves', ['calves']],
  ['Adductors', ['adductor']],
  ['Hips', ['gluteal', 'abductors']],
  ['Legs', ['quadriceps', 'hamstring', 'gluteal']],
  ['Biceps', ['biceps']],
  ['Triceps', ['triceps']],
  ['Forearms', ['forearm']],
  ['Core', ['abs', 'obliques']],
  ['Mobility', []],
]);

function regionsFor(m) {
  const primary = MUSCLE_TO_REGION.get(m.primaryMuscle) ?? [];
  const secondary = (m.secondaryMuscles ?? []).flatMap((s) => MUSCLE_TO_REGION.get(s) ?? []);
  const seen = new Set();
  const out = [];
  for (const r of [...primary, ...secondary]) {
    if (!seen.has(r)) { seen.add(r); out.push(r); }
  }
  return out;
}

const norm = (s) => s.toLowerCase().replace(/[_\-]/g, ' ').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
const tokens = (s) => new Set(norm(s).split(' '));
const subset = (a, b) => [...a].every((t) => b.has(t));

try { await access(TMP); } catch { execSync(`git clone --depth 1 ${REPO} ${TMP}`, { stdio: 'inherit' }); }

const manifest = JSON.parse(await readFile(`${TMP}/packages/workout-guide/manifest.json`, 'utf8'));
const lib = JSON.parse(await readFile('src/data/exercise-library.json', 'utf8'));
const aliases = JSON.parse(await readFile('scripts/illustration-aliases.json', 'utf8'));

const bySlug = new Map(manifest.filter((m) => !m.isStretch).map((m) => [m.slug, m]));
const byNorm = new Map([...bySlug.values()].map((m) => [norm(m.slug), m]));

// 별칭표 검증 — 오타는 즉시 중단
const libIds = new Set(lib.map((x) => x.libId));
for (const [libId, slug] of Object.entries(aliases)) {
  if (!libIds.has(libId)) throw new Error(`별칭표: 없는 libId "${libId}"`);
  if (slug !== null && !bySlug.has(slug)) throw new Error(`별칭표: 없는 slug "${slug}" (libId ${libId})`);
}

function compatible(entry, m) {
  const part = MUSCLE_TO_PART.get(m.primaryMuscle);
  const equips = EQUIP_COMPAT.get(m.equipment);
  return part === entry.bodyPart && Array.isArray(equips) && equips.includes(entry.equipment);
}

const stats = { alias: 0, exact: 0, relaxed: 0, excluded: 0, none: 0, framesMissing: 0 };
const picks = new Map(); // our id → their slug

for (const x of lib) {
  if (Object.prototype.hasOwnProperty.call(aliases, x.libId)) {
    const slug = aliases[x.libId];
    if (slug === null) { stats.excluded++; continue; }
    picks.set(x.id, slug);
    stats.alias++;
    continue;
  }
  const n = norm(x.libId);
  const exact = byNorm.get(n);
  if (exact) { picks.set(x.id, exact.slug); stats.exact++; continue; }
  let hit = null;
  for (const m of bySlug.values()) {
    if (subset(tokens(m.slug), tokens(x.libId)) && compatible(x, m)) { hit = m; break; }
  }
  if (hit) { picks.set(x.id, hit.slug); stats.relaxed++; } else { stats.none++; }
}

// 프레임 1/3만 존재하면 충분 (frame-2는 은퇴 — 히어로가 1↔3 왕복으로 전환)
for (const [id, slug] of [...picks]) {
  let complete = true;
  for (const frame of [1, 3]) {
    try { await access(`${TMP}/packages/workout-guide/assets/${slug}/frame-${frame}.svg`); }
    catch { complete = false; break; }
  }
  if (!complete) { picks.delete(id); stats.framesMissing++; }
}

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
for (const [id, slug] of picks) {
  await cp(`${TMP}/packages/workout-guide/assets/${slug}/frame-1.svg`, `${OUT}/${id}.svg`);
  await cp(`${TMP}/packages/workout-guide/assets/${slug}/frame-3.svg`, `${OUT}/${id}-3.svg`);
}

const next = lib.map((x) => {
  // illustration만 벗겨내고 재부여 — muscles는 GIF-only 항목(Task 1이 ExerciseDB에서 채움)에 대해
  // 그대로 보존해야 한다. 매칭 픽에 한해서만 Everkinetic 근육을 우선 적용(아래 덮어쓰기).
  const { illustration: _dropIllu, ...rest } = x;
  if (!picks.has(x.id)) return rest;
  const slug = picks.get(x.id);
  const m = bySlug.get(slug);
  const muscles = regionsFor(m);
  return {
    ...rest,
    illustration: `illustrations/${x.id}.svg`,
    ...(muscles.length > 0 ? { muscles } : {}),
  };
});
await writeFile('src/data/exercise-library.json', `${JSON.stringify(next, null, 2)}\n`);

const muscleCount = next.filter((x) => Array.isArray(x.muscles)).length;
console.log(`✓ 매칭 ${picks.size}/${lib.length} (별칭 ${stats.alias}, 정확 ${stats.exact}, 완화 ${stats.relaxed}, 제외 ${stats.excluded}, 미매칭 ${stats.none}, frames 미비 ${stats.framesMissing})`);
console.log(`  muscles 기록 ${muscleCount}개`);
