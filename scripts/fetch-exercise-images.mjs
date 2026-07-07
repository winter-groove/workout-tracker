import { mkdir, readFile } from 'node:fs/promises';
import sharp from 'sharp';

const DB_URL = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json';
const IMG_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';

const library = JSON.parse(await readFile('src/data/exercise-library.json', 'utf8'));
const all = await (await fetch(DB_URL)).json();
const byId = new Map(all.map((e) => [e.id, e]));

const bad = library.filter((x) => !byId.has(x.libId));
if (bad.length > 0) {
  console.error('❌ free-exercise-db에 존재하지 않는 libId:');
  for (const b of bad) {
    const first = b.libId.split(/[_-]/)[0].toLowerCase();
    const candidates = all
      .filter((e) => e.id.toLowerCase().includes(first))
      .slice(0, 8)
      .map((e) => e.id);
    console.error(`  - ${b.libId}  (후보: ${candidates.join(', ') || '없음'})`);
  }
  console.error('src/data/exercise-library.json의 libId를 후보로 교체한 뒤 다시 실행하세요.');
  process.exit(1);
}

await mkdir('public/exercises', { recursive: true });
for (const x of library) {
  const entry = byId.get(x.libId);
  const imgPath = entry.images?.[0];
  if (!imgPath) {
    console.error(`❌ ${x.libId}: 이미지가 없습니다`);
    process.exit(1);
  }
  const res = await fetch(IMG_BASE + imgPath);
  if (!res.ok) {
    console.error(`❌ ${x.libId}: 이미지 다운로드 실패 (${res.status})`);
    process.exit(1);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await sharp(buf).resize(640).webp({ quality: 75 }).toFile(`public/exercises/${x.id}.webp`);
  console.log(`✓ ${x.id}`);
}
console.log(`완료: ${library.length}개 이미지 → public/exercises/`);
