"""Composite a transparent portrait render over a soft radial gradient and save a 512x512 WebP.

python art/blender/portrait_post.py <in.png> <out.webp> <inner #hex> <outer #hex>
"""
import sys
from PIL import Image, ImageFilter, ImageDraw, ImageChops

src, dst, c_in, c_out = sys.argv[1:5]


def hx(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


im = Image.open(src).convert('RGBA')
W, H = im.size
a, b = hx(c_in), hx(c_out)
# radial gradient, centre slightly above the middle (behind the head), soft vignette
grad = Image.new('RGB', (W, H))
px = grad.load()
cx, cy = W * 0.46, H * 0.4
R = (W ** 2 + H ** 2) ** 0.5 * 0.62
for y in range(H):
    for x in range(W):
        t = min(1.0, ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5 / R)
        t = t * t * (3 - 2 * t)
        px[x, y] = tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))
# a faint glow halo behind the character to lift it off the background
alpha = im.split()[3]
halo = alpha.filter(ImageFilter.GaussianBlur(W * 0.03))
glow = Image.new('RGB', (W, H), tuple(min(255, int(c * 1.08 + 18)) for c in a))
grad = Image.composite(glow, grad, halo.point(lambda v: int(v * 0.45)))
out = Image.alpha_composite(grad.convert('RGBA'), im).convert('RGB')
out = out.resize((512, 512), Image.LANCZOS)
out.save(dst, 'WEBP', quality=92, method=6)
print('wrote', dst, out.size)
