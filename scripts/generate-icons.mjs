import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
  <rect width="512" height="512" rx="112" fill="#3182F6"/>
  <g stroke="#fff" stroke-width="28" stroke-linecap="round" fill="#fff">
    <line x1="96" y1="256" x2="416" y2="256"/>
    <rect x="128" y="168" width="44" height="176" rx="14"/>
    <rect x="340" y="168" width="44" height="176" rx="14"/>
    <rect x="72" y="200" width="32" height="112" rx="12"/>
    <rect x="408" y="200" width="32" height="112" rx="12"/>
  </g>
  <g fill="#fff" font-family="'Apple SD Gothic Neo', 'AppleGothic', sans-serif" font-weight="800" font-size="88">
    <text x="52" y="132" text-anchor="start">명</text>
    <text x="460" y="132" text-anchor="end">보</text>
    <text x="52" y="472" text-anchor="start">품</text>
    <text x="460" y="472" text-anchor="end">쌈</text>
  </g>
</svg>`;

await mkdir('public/icons', { recursive: true });
for (const size of [192, 512]) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(`public/icons/icon-${size}.png`);
  console.log(`✓ icon-${size}.png`);
}
