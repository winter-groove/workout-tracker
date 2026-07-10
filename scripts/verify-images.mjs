import { readFile, access } from 'node:fs/promises';

const library = JSON.parse(await readFile('src/data/exercise-library.json', 'utf8'));
let missing = 0;
for (const x of library) {
  try {
    await access(`public/exercises/${x.id}.webp`);
  } catch {
    console.error(`missing: ${x.id}`);
    missing++;
  }
}
if (missing > 0) {
  console.error(`❌ 이미지 ${missing}개 누락`);
  process.exit(1);
}
console.log(`✓ 이미지 ${library.length}개 전수 확인`);
