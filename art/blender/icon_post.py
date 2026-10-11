"""Post-process icon renders (system Python + PIL): premultiplied downsample, optional glow, a thin
dark outline for readability at 48 px, WebP output and review contact sheets.

python art/blender/icon_post.py <job.json>   (written by render_icons.py)
"""
import json, os, sys
from PIL import Image, ImageChops, ImageFilter, ImageDraw, ImageFont

job = json.load(open(sys.argv[1]))
size = job['size']
OUTLINE = (29, 36, 48)


def save_small(icon, out, limit):
    """Lossless WebP; when it is over `limit` bytes, a dithered palette of 256 colours and then fewer until it fits.
    The icon that is returned is what was saved, so the review sheets show exactly the shipped pixels."""
    icon.save(out, 'WEBP', lossless=True, quality=100, method=6)
    if os.path.getsize(out) <= limit:
        return icon
    best = icon
    rgb, alpha = icon.convert('RGB'), icon.getchannel('A').point(lambda v: min(255, int(round(v / 51.0)) * 51))
    for n in (256, 192, 144, 112, 88, 64):
        pal = rgb.quantize(colors=n, method=Image.Quantize.FASTOCTREE)
        q = rgb.quantize(palette=pal, dither=Image.Dither.FLOYDSTEINBERG).convert('RGB')
        q.putalpha(alpha)
        q.save(out, 'WEBP', lossless=True, quality=100, method=6)
        best = q
        if os.path.getsize(out) <= limit:
            break
    return best
done = []
for name, path in job['raw'].items():
    im = Image.open(path).convert('RGBA')
    glow = job['glow'].get(name)
    if glow:
        # additive halo from the bright pixels (Eevee has no bloom in 4.5)
        r, g, b, a = im.split()
        lum = Image.merge('RGB', (r, g, b)).convert('L').point(lambda v: 255 if v > 200 else int(v * .25))
        halo = ImageChops.multiply(lum, a).filter(ImageFilter.GaussianBlur(im.size[0] / 28))
        halo_rgb = Image.new('RGBA', im.size, (255, 196, 70, 0))
        halo_rgb.putalpha(halo.point(lambda v: int(min(255, v * 1.6 * glow))))
        im = Image.alpha_composite(halo_rgb, im)
    small = im.convert('RGBa').resize((size, size), Image.LANCZOS).convert('RGBA')
    small = small.filter(ImageFilter.UnsharpMask(radius=1.0, percent=55, threshold=2))
    alpha = small.split()[3]
    ring = alpha.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MaxFilter(3))
    ring = ring.filter(ImageFilter.GaussianBlur(.6)).point(lambda v: int(v * .92))
    base = Image.new('RGBA', (size, size), OUTLINE + (0,))
    base.putalpha(ring)
    icon = Image.alpha_composite(base, small)
    out = os.path.join(job['out'], name + '.webp')
    icon = save_small(icon, out, job.get('limit', 12000))
    done.append((name, icon))
    print('ICON', out, os.path.getsize(out) // 1024, 'KB')

# review sheets: icons on a dark UI panel at 160 px and at 48 px
if done:
    cols = 7
    rows = (len(done) + cols - 1) // cols
    pad = 12
    sheet = Image.new('RGBA', (cols * (size + pad) + pad, rows * (size + 28 + pad) + pad + 70), (38, 44, 56, 255))
    d = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype('arial.ttf', 14)
    except OSError:
        font = ImageFont.load_default()
    for i, (n, ic) in enumerate(done):
        x = pad + (i % cols) * (size + pad)
        y = pad + (i // cols) * (size + 28 + pad)
        d.rounded_rectangle([x, y, x + size, y + size], 14, fill=(58, 66, 82, 255))
        sheet.alpha_composite(ic, (x, y))
        d.text((x + 4, y + size + 4), n, fill=(240, 236, 226, 255), font=font)
    y0 = sheet.size[1] - 62
    for i, (n, ic) in enumerate(done):
        x = pad + i * 58
        d.rounded_rectangle([x - 3, y0 - 3, x + 51, y0 + 51], 8, fill=(58, 66, 82, 255))
        sheet.alpha_composite(ic.resize((48, 48), Image.LANCZOS), (x, y0))
    prev = os.path.join(job['preview'], 'icons-sheet.png')
    sheet.save(prev)
    light = Image.new('RGBA', sheet.size, (236, 228, 212, 255))
    for i, (n, ic) in enumerate(done):
        x = pad + (i % cols) * (size + pad)
        y = pad + (i // cols) * (size + 28 + pad)
        light.alpha_composite(ic, (x, y))
    light.save(os.path.join(job['preview'], 'icons-sheet-light.png'))
    print('SHEET', prev)
