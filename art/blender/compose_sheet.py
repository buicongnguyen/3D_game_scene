"""Compose review renders into a labelled sheet: python art/aaa/compose_sheet.py <dir> <out.png> [cols] [names...]"""
import sys, os
from PIL import Image, ImageDraw, ImageFont
src, out = sys.argv[1], sys.argv[2]
cols = int(sys.argv[3]) if len(sys.argv) > 3 else 8
names = sys.argv[4:] or sorted(f[:-4] for f in os.listdir(src) if f.endswith('.png'))
tile = 300
rows = (len(names) + cols - 1) // cols
sheet = Image.new('RGB', (cols * tile, rows * tile), (30, 34, 38))
d = ImageDraw.Draw(sheet)
try:
    font = ImageFont.truetype('arial.ttf', 18)
except OSError:
    font = ImageFont.load_default()
for i, n in enumerate(names):
    p = os.path.join(src, n + '.png')
    if not os.path.exists(p):
        continue
    im = Image.open(p).convert('RGB').resize((tile, tile))
    x, y = (i % cols) * tile, (i // cols) * tile
    sheet.paste(im, (x, y))
    d.rectangle([x, y, x + tile, y + 24], fill=(20, 22, 26))
    d.text((x + 6, y + 3), n, fill=(255, 255, 255), font=font)
sheet.save(out)
print(out, sheet.size)
