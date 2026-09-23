import { access, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const API = 'https://oss.exercisedb.dev/api/v1/exercises';
const UA = 'workout-tracker-pipeline (personal, non-commercial; contact via repo)';
const TMP = '.tmp-exercisedb';
const OUT = 'public/gifs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 그쪽 equipments[0] → 우리 equipment 허용 목록 (모르는 값은 비호환)
const EQUIP_COMPAT = new Map([
  ['barbell', ['바벨']], ['olympic barbell', ['바벨']], ['ez barbell', ['바벨']], ['trap bar', ['바벨']],
  ['dumbbell', ['덤벨']],
  ['cable', ['케이블']],
  ['leverage machine', ['머신']], ['smith machine', ['머신']], ['sled machine', ['머신']],
  ['stepmill machine', ['머신']], ['elliptical machine', ['머신']], ['stationary bike', ['머신']],
  ['upper body ergometer', ['머신']], ['skierg machine', ['머신']],
  ['body weight', ['맨몸']], ['assisted', ['맨몸']], ['weighted', ['맨몸']],
  ['band', ['기타']], ['resistance band', ['기타']], ['kettlebell', ['기타']], ['medicine ball', ['기타']],
  ['stability ball', ['기타']], ['bosu ball', ['기타']], ['roller', ['기타']], ['wheel roller', ['기타']],
  ['rope', ['기타']], ['hammer', ['기타']], ['tire', ['기타']],
]);
// 그쪽 bodyParts[0] → 우리 부위 (cardio/neck은 매칭 대상 아님)
const PART_COMPAT = new Map([
  ['chest', '가슴'], ['back', '등'], ['upper legs', '하체'], ['lower legs', '하체'],
  ['shoulders', '어깨'], ['upper arms', '팔'], ['lower arms', '팔'], ['waist', '코어'],
]);
// 이름 토큰 중 '장비어' — 완화 매칭에서 그쪽 이름에 추가로 있어도 되는 토큰 (한정어 incline/seated 등은 절대 아님)
const EQUIP_WORDS = new Set(['barbell', 'dumbbell', 'cable', 'lever', 'smith', 'sled', 'band', 'kettlebell', 'ez', 'olympic', 'weighted', 'machine', 'bodyweight']);
// 그쪽 근육 어휘 → 우리 근육맵 영역 id (src/data/muscle-regions.ts의 17개만)
const MUSCLE_TO_REGION = new Map([
  ['pectorals', ['chest']], ['upper chest', ['chest']], ['chest', ['chest']], ['serratus anterior', ['obliques']],
  ['lats', ['upper-back']], ['latissimus dorsi', ['upper-back']], ['upper back', ['upper-back']], ['rhomboids', ['upper-back']], ['back', ['upper-back', 'lower-back']],
  ['traps', ['trapezius']], ['trapezius', ['trapezius']], ['levator scapulae', ['trapezius']],
  ['lower back', ['lower-back']], ['spine', ['lower-back']],
  ['delts', ['front-deltoids']], ['deltoids', ['front-deltoids']], ['shoulders', ['front-deltoids']], ['rotator cuff', ['back-deltoids']], ['rear deltoids', ['back-deltoids']],
  ['biceps', ['biceps']], ['brachialis', ['biceps']],
  ['triceps', ['triceps']],
  ['forearms', ['forearm']], ['wrist extensors', ['forearm']], ['wrist flexors', ['forearm']], ['wrists', ['forearm']], ['grip muscles', ['forearm']], ['hands', ['forearm']],
  ['abs', ['abs']], ['abdominals', ['abs']], ['lower abs', ['abs']], ['core', ['abs', 'obliques']], ['obliques', ['obliques']],
  ['quads', ['quadriceps']], ['quadriceps', ['quadriceps']],
  ['hamstrings', ['hamstring']],
  ['glutes', ['gluteal']],
  ['calves', ['calves']], ['soleus', ['calves']], ['shins', ['calves']],
  ['adductors', ['adductor']], ['inner thighs', ['adductor']], ['groin', ['adductor']],
  ['abductors', ['abductors']], ['hip flexors', ['abductors']],
  // 매핑 없음(빈 배열): cardiovascular system, feet, ankles, ankle stabilizers, sternocleidomastoid
]);

async function fetchManifest() {
  const all = []; let after = '';
  while (true) {
    const r = await fetch(`${API}?limit=25${after ? `&after=${after}` : ''}`, { headers: { 'User-Agent': UA } });
    if (r.status === 429) { await sleep(5000); continue; }
    if (!r.ok) throw new Error(`ExerciseDB HTTP ${r.status}`);
    const j = await r.json();
    all.push(...j.data.map((e) => ({ id: e.exerciseId, name: e.name, gifUrl: e.gifUrl, bodyParts: e.bodyParts, equipments: e.equipments, target: e.targetMuscles, secondary: e.secondaryMuscles })));
    if (!j.meta.hasNextPage || !j.meta.nextCursor) break;
    after = j.meta.nextCursor; await sleep(350);
  }
  return all; // 1,500 기대
}

async function loadManifest() {
  try {
    return JSON.parse(await readFile(`${TMP}/manifest.json`, 'utf8'));
  } catch {
    await mkdir(TMP, { recursive: true });
    const all = await fetchManifest();
    await writeFile(`${TMP}/manifest.json`, `${JSON.stringify(all, null, 2)}\n`);
    return all;
  }
}

const norm = (s) => s.toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[_\-\/]/g, ' ').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
// 동의어: ExerciseDB의 'lever'(레버리지 머신)는 우리 어휘의 'machine'과 같은 키로 취급 — 양쪽 토큰화 모두 이 함수를 거치므로 자동으로 양측에 적용됨
const tokens = (s) => new Set(norm(s).split(' ').filter(Boolean).map((t) => t.replace(/s$/, '')).map((t) => (t === 'lever' ? 'machine' : t)));
const setEq = (a, b) => a.size === b.size && [...a].every((t) => b.has(t));
const compatible = (x, e) => PART_COMPAT.get(e.bodyParts[0]) === x.bodyPart
  && (EQUIP_COMPAT.get(e.equipments[0]) ?? []).includes(x.equipment);

function regionsFor(target, secondary) {
  const seen = new Set();
  const out = [];
  for (const m of [...(target ?? []), ...(secondary ?? [])]) {
    for (const r of MUSCLE_TO_REGION.get(m) ?? []) {
      if (!seen.has(r)) { seen.add(r); out.push(r); }
    }
  }
  return out;
}

// 매칭 우선순위: 별칭 → 정확(토큰 집합 동일) → 정확-충돌시 괄호 없는 유일 후보 → 완화 → 그래도 복수면 ambiguous, 0개면 none
function classify(x, manifest) {
  const xt = tokens(x.libId);
  const exactCands = manifest.filter((e) => setEq(tokens(e.name), xt) && compatible(x, e));
  if (exactCands.length === 1) return { tier: 'exact', match: exactCands[0] };
  if (exactCands.length > 1) {
    const bare = exactCands.filter((e) => !e.name.includes('('));
    if (bare.length === 1) return { tier: 'exactStripped', match: bare[0] };
  }
  const relaxedCands = manifest.filter((e) => {
    const et = tokens(e.name);
    const core = new Set([...et].filter((t) => !EQUIP_WORDS.has(t)));
    return [...core].every((t) => xt.has(t)) && [...xt].every((t) => et.has(t)) && compatible(x, e);
  });
  if (relaxedCands.length === 1) return { tier: 'relaxed', match: relaxedCands[0] };
  const cands = relaxedCands.length > 0 ? relaxedCands : exactCands;
  if (cands.length > 1) return { tier: 'ambiguous', candidates: cands };
  return { tier: 'none' };
}

async function downloadOne(id, url) {
  const dest = `${OUT}/${id}.gif`;
  try { await access(dest); return false; } catch { /* 없음 → 다운로드 */ }
  const tmp = `${dest}.tmp`;
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (r.status === 429) { lastErr = new Error('429 Too Many Requests'); await sleep(5000); continue; }
      if (!r.ok) { lastErr = new Error(`HTTP ${r.status}`); await sleep(300); continue; }
      const buf = Buffer.from(await r.arrayBuffer());
      await writeFile(tmp, buf);
      await rename(tmp, dest);
      await sleep(300);
      return true;
    } catch (e) {
      lastErr = e;
      await sleep(300);
    }
  }
  throw new Error(`GIF 다운로드 실패(3회 재시도) id=${id}: ${lastErr?.message ?? lastErr}`);
}

function runPoster() {
  let out;
  try {
    out = execFileSync('python3', ['scripts/gif-poster.py', OUT], { encoding: 'utf8' });
  } catch (e) {
    throw new Error(`포스터 생성 실패 — python3/Pillow 설치를 확인하세요: ${e.message}`);
  }
  process.stdout.write(out);
  const m = out.match(/poster (\d+)개/);
  return m ? Number(m[1]) : 0;
}

// ---- 실행 ----

const manifest = await loadManifest();
const lib = JSON.parse(await readFile('src/data/exercise-library.json', 'utf8'));
const aliases = JSON.parse(await readFile('scripts/gif-aliases.json', 'utf8'));

const libIds = new Set(lib.map((x) => x.libId));
const manifestById = new Map(manifest.map((e) => [e.id, e]));
for (const [libId, id] of Object.entries(aliases)) {
  if (!libIds.has(libId)) throw new Error(`별칭표: 없는 libId "${libId}"`);
  if (id !== null && !manifestById.has(id)) throw new Error(`별칭표: 없는 ExerciseDB id "${id}" (libId ${libId})`);
}

const stats = { alias: 0, exact: 0, exactStripped: 0, relaxed: 0, ambiguous: 0, excluded: 0, none: 0, download: 0, poster: 0 };
const picks = new Map(); // 우리 id → ExerciseDB 항목
const ambiguousLines = [];
const matchLines = [];
const noneLines = [];

for (const x of lib) {
  if (Object.prototype.hasOwnProperty.call(aliases, x.libId)) {
    const id = aliases[x.libId];
    if (id === null) { stats.excluded++; continue; }
    const entry = manifestById.get(id);
    picks.set(x.id, entry);
    matchLines.push(`${x.libId} → ${entry.id}:${entry.name} [alias]`);
    stats.alias++;
    continue;
  }
  const result = classify(x, manifest);
  if (result.tier === 'exact' || result.tier === 'exactStripped' || result.tier === 'relaxed') {
    picks.set(x.id, result.match);
    matchLines.push(`${x.libId} → ${result.match.id}:${result.match.name} [${result.tier}]`);
    stats[result.tier]++;
    continue;
  }
  if (result.tier === 'ambiguous') {
    stats.ambiguous++;
    ambiguousLines.push(`${x.libId} → ${result.candidates.map((e) => `${e.id}:${e.name}`).join(' | ')}`);
    continue;
  }
  stats.none++;
  noneLines.push(`${x.libId} (${x.name})`);
}

await mkdir(TMP, { recursive: true });
await writeFile(`${TMP}/ambiguous.txt`, ambiguousLines.length ? `${ambiguousLines.join('\n')}\n` : '');
await writeFile(`${TMP}/matches.txt`, matchLines.length ? `${matchLines.join('\n')}\n` : '');
await writeFile(`${TMP}/none.txt`, noneLines.length ? `${noneLines.join('\n')}\n` : '');

// 산출물을 매칭 결과와 정확히 일치시킴: picks에 없는 기존 gif/webp 파일 삭제
await mkdir(OUT, { recursive: true });
const keepIds = new Set(picks.keys());
for (const f of await readdir(OUT)) {
  const m = f.match(/^(.+)\.(gif|webp|tmp)$/);
  if (!m) continue;
  if (!keepIds.has(m[1])) await rm(`${OUT}/${f}`);
}

// 같은 우리 id라도 매칭 소스(ExerciseDB id)가 바뀌면 파일 존재만으로는 감지 안 됨 — 이전 소스 기록과 비교해 강제 재다운로드
const SOURCES_FILE = `${TMP}/gif-sources.json`;
let prevSources = {};
try { prevSources = JSON.parse(await readFile(SOURCES_FILE, 'utf8')); } catch { /* 최초 실행 */ }
for (const [ourId, entry] of picks) {
  if (prevSources[ourId] && prevSources[ourId] !== entry.id) {
    await rm(`${OUT}/${ourId}.gif`, { force: true });
    await rm(`${OUT}/${ourId}.webp`, { force: true });
  }
}

for (const [ourId, entry] of picks) {
  const downloaded = await downloadOne(ourId, entry.gifUrl);
  if (downloaded) stats.download++;
}

stats.poster = runPoster();

const nextSources = {};
for (const [ourId, entry] of picks) nextSources[ourId] = entry.id;
await writeFile(SOURCES_FILE, `${JSON.stringify(nextSources, null, 2)}\n`);

// 라이브러리 항목 직렬화 키 순서 고정 — 어느 파이프라인을 재실행해도 diff가 나지 않게 한다
function canonical(entry) {
  const { illustration, muscles, gif, ...base } = entry;
  return { ...base, ...(illustration ? { illustration } : {}), ...(muscles && muscles.length ? { muscles } : {}), ...(gif ? { gif } : {}) };
}

const next = lib.map((x) => {
  const matched = picks.get(x.id);
  const existingMuscles = x.muscles;
  const muscles = Array.isArray(existingMuscles) && existingMuscles.length > 0
    ? existingMuscles
    : (matched ? regionsFor(matched.target, matched.secondary) : []);
  return canonical({
    ...x,
    gif: matched ? `gifs/${x.id}.gif` : undefined,
    muscles,
  });
});
await writeFile('src/data/exercise-library.json', `${JSON.stringify(next, null, 2)}\n`);

const muscleCount = next.filter((x) => Array.isArray(x.muscles)).length;
console.log(`✓ 매칭 ${picks.size}/${lib.length} (별칭 ${stats.alias}, 정확 ${stats.exact}, 정확-괄호제거 ${stats.exactStripped}, 완화 ${stats.relaxed}, 제외 ${stats.excluded}, 모호 ${stats.ambiguous}, 미매칭 ${stats.none})`);
console.log(`  다운로드 ${stats.download}개, 포스터 ${stats.poster}개, muscles 기록 ${muscleCount}개`);
