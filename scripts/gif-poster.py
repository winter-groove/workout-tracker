# scripts/gif-poster.py — 사용: python3 scripts/gif-poster.py public/gifs
import sys, os
from PIL import Image
d = sys.argv[1]
n = 0
for f in sorted(os.listdir(d)):
    if not f.endswith('.gif'): continue
    out = os.path.join(d, f[:-4] + '.webp')
    if os.path.exists(out): continue
    im = Image.open(os.path.join(d, f)); im.seek(0)
    fr = im.convert('RGBA')
    bg = Image.new('RGBA', fr.size, (255, 255, 255, 255))
    Image.alpha_composite(bg, fr).convert('RGB').save(out, 'WEBP', quality=82, method=6); n += 1
print(f'poster {n}개 생성')
