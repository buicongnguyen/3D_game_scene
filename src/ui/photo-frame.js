import { frameLayout } from '../game/photo.js';

// Photo mode's frames, drawn with a 2D context: once over the live view (a canvas on top of the game, redrawn only
// when something about it changes) and once into the saved file. Both go through this one function with the same
// layout (game/photo.js frameLayout, lengths in fractions of the short side), so the file looks like the preview.

const PAPER = '#fffdf6', CREAM = '#f6ecd6', GOLD = '#f2b53a', GOLD_DEEP = '#d98b1f', INK = '#1c2340';

/**
 * The heading font of the page, read on every drawing (they are rare): each language sets its own on <body>
 * (body.lang-ko / lang-ja / lang-vi --head), so the caption is in the game's lettering in every language.
 */
const head = () => (typeof getComputedStyle === 'function' && getComputedStyle(document.body || document.documentElement).getPropertyValue('--head').trim())
  || "'Fredoka', 'Nunito', system-ui, sans-serif";

function star(ctx, x, y, r, rot = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
    ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

/** Fill everything outside `inner` (a border), with a hair of shadow on the picture's edge. */
function border(ctx, L, color) {
  const { w, h, inner: i } = L;
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.rect(i.x, i.y, i.w, i.h);
  ctx.fillStyle = color; ctx.fill('evenodd');
  ctx.strokeStyle = 'rgba(28, 35, 64, 0.18)'; ctx.lineWidth = Math.max(1, L.m * 0.002);
  ctx.strokeRect(i.x, i.y, i.w, i.h);
  ctx.restore();
}

/**
 * Text on the picture itself (not on paper) gets a soft dark halo so it reads on snow and on sky alike. `max`: the
 * free width. A long line first gets a smaller font (down to 72%), then only its place is shortened: the season after
 * the last " · " always stays.
 */
function caption(ctx, L, text, { onPhoto = false, color = INK, max = 0 } = {}) {
  const c = L.caption;
  if (!c || !text) return;
  ctx.save();
  ctx.textAlign = c.align; ctx.textBaseline = 'middle';
  max = max || (c.align === 'center' ? L.inner.w * 0.8 : L.inner.w * 0.62);
  const font = size => `600 ${size}px ${head()}`;
  ctx.font = font(c.size);
  let t = text;
  const full = ctx.measureText(t).width;
  if (full > max) {
    ctx.font = font(c.size * Math.max(0.72, max / full));
    if (ctx.measureText(t).width > max) {
      const cut = text.lastIndexOf(' · '), tail = cut > 0 ? text.slice(cut) : '';
      let place = cut > 0 ? text.slice(0, cut) : text;
      while (place.length > 1 && ctx.measureText(place + '…' + tail).width > max) place = place.slice(0, -1).trimEnd();
      t = place + '…' + tail;
    }
  }
  if (onPhoto) { ctx.shadowColor = 'rgba(0, 0, 0, 0.55)'; ctx.shadowBlur = c.size * 0.35; ctx.fillStyle = '#fff'; }
  else ctx.fillStyle = color;
  ctx.fillText(t, c.x, c.y);
  ctx.restore();
}

/** A left-aligned caption with nothing to its right: as wide as the picture, with the same margin on both sides. */
const freeLeft = L => L.inner.x + L.inner.w - L.caption.x - (L.caption.x - L.inner.x);

/**
 * The postcard's stamp: white paper with a perforated edge. The bites are punched on a small canvas of its own, so
 * they can only take the stamp away (on the saved file the context already holds the photo, and a bite there would
 * be a black hole in the JPEG); the stamp then goes on with its shadow following the perforation.
 */
function stamp(ctx, x, y, s) {
  const r = s * 0.06, pad = Math.ceil(s * 0.12 + r), sh = s * 1.15;
  const c = (ctx.canvas?.ownerDocument || document).createElement('canvas');
  c.width = Math.ceil(s + 2 * pad); c.height = Math.ceil(sh + 2 * pad);
  const k = c.getContext('2d');
  k.fillStyle = '#fff'; k.fillRect(pad, pad, s, sh);
  k.globalCompositeOperation = 'destination-out';
  const n = 8, seen = new Set();
  for (let i = 0; i <= n; i++) {
    for (const [px, py] of [[pad + i * s / n, pad], [pad + i * s / n, pad + sh], [pad, pad + i * sh / n], [pad + s, pad + i * sh / n]]) {
      const key = `${Math.round(px * 4)},${Math.round(py * 4)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      k.beginPath(); k.arc(px, py, r, 0, Math.PI * 2); k.fill();
    }
  }
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.25)'; ctx.shadowBlur = s * 0.06;
  ctx.drawImage(c, x - pad, y - pad);
  ctx.restore();
  c.width = 0;
}

/**
 * Draw `frame` ('none' | 'polaroid' | 'postcard' | 'film' | 'stars') on a w x h context. caption: the line to write
 * ('' for none); grid: the rule-of-thirds lines (the preview only, never the file).
 */
export function drawFrame(ctx, w, h, frame, text = '', { grid = false } = {}) {
  const L = frameLayout(w, h, frame), m = L.m;
  if (frame === 'polaroid') {
    border(ctx, L, PAPER);
    ctx.save();
    ctx.font = `600 ${L.mark.size}px ${head()}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillStyle = GOLD_DEEP;
    const markW = ctx.measureText('★ Starline').width;
    ctx.fillText('★ Starline', L.mark.x, L.mark.y);
    ctx.restore();
    // the caption has the paper up to the mark
    caption(ctx, L, text, { max: L.mark.x - markW - L.caption.size * 0.6 - L.caption.x });
  } else if (frame === 'postcard') {
    border(ctx, L, CREAM);
    const { x, y, s } = L.stamp;
    stamp(ctx, x, y, s);
    ctx.save();
    // on the stamp: a sky, a star and its value
    const g = ctx.createLinearGradient(0, y + s * 0.1, 0, y + s * 1.05);
    g.addColorStop(0, '#22325e'); g.addColorStop(1, '#e88f6a');
    ctx.fillStyle = g; ctx.fillRect(x + s * 0.12, y + s * 0.12, s * 0.76, s * 0.91);
    ctx.fillStyle = '#ffd66b'; star(ctx, x + s * 0.5, y + s * 0.5, s * 0.22); ctx.fill();
    ctx.font = `700 ${s * 0.13}px ${head()}`; ctx.textAlign = 'right'; ctx.fillStyle = '#fff'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('12', x + s * 0.82, y + s * 0.98);
    // a postmark's two wavy lines beside it
    ctx.strokeStyle = 'rgba(28, 35, 64, 0.35)'; ctx.lineWidth = Math.max(1, s * 0.025);
    for (let k = 0; k < 2; k++) {
      ctx.beginPath();
      for (let i = 0; i <= 12; i++) { const px = x - s * 0.95 + i * s * 0.07, py = y + s * (0.42 + k * 0.2) + Math.sin(i * 1.3) * s * 0.03; ctx[i ? 'lineTo' : 'moveTo'](px, py); }
      ctx.stroke();
    }
    ctx.restore();
    caption(ctx, L, text, { onPhoto: true, max: freeLeft(L) });
  } else if (frame === 'film') {
    const { band, hole, wide } = L;
    ctx.save();
    ctx.fillStyle = '#16130f';
    if (wide) { ctx.fillRect(0, 0, w, band); ctx.fillRect(0, h - band, w, band); } else { ctx.fillRect(0, 0, band, h); ctx.fillRect(w - band, 0, band, h); }
    // sprocket holes along both bands
    ctx.fillStyle = 'rgba(255, 247, 232, 0.88)';
    const long = wide ? w : h, step = hole.w + hole.gap, count = Math.floor(long / step), off = (long - count * step + hole.gap) / 2;
    for (let k = 0; k < count; k++) {
      const a = off + k * step;
      for (const side of [0, 1]) {
        const c = side ? (wide ? h - band / 2 : w - band / 2) : band / 2;
        if (wide) roundRect(ctx, a, c - hole.h / 2, hole.w, hole.h, hole.h * 0.25);
        else roundRect(ctx, c - hole.h / 2, a, hole.h, hole.w, hole.h * 0.25);
        ctx.fill();
      }
    }
    ctx.restore();
    caption(ctx, L, text, { onPhoto: true, max: freeLeft(L) });
  } else if (frame === 'stars') {
    const c = L.corner;
    ctx.save();
    ctx.strokeStyle = GOLD; ctx.lineWidth = Math.max(1.5, m * 0.006); ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(60, 30, 0, 0.45)'; ctx.shadowBlur = m * 0.01;
    for (const [sx, sy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const x = sx ? w - c * 0.35 : c * 0.35, y = sy ? h - c * 0.35 : c * 0.35, dx = sx ? -1 : 1, dy = sy ? -1 : 1;
      ctx.beginPath(); ctx.moveTo(x + dx * c, y); ctx.lineTo(x, y); ctx.lineTo(x, y + dy * c); ctx.stroke();
      ctx.fillStyle = GOLD; star(ctx, x, y, c * 0.28); ctx.fill();
      ctx.fillStyle = '#fff3c4'; star(ctx, x + dx * c * 0.62, y + dy * c * 0.02, c * 0.09); ctx.fill();
      star(ctx, x + dx * c * 0.02, y + dy * c * 0.62, c * 0.09); ctx.fill();
    }
    ctx.restore();
    caption(ctx, L, text, { onPhoto: true });
  }
  if (grid) {
    const i = L.inner;
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)'; ctx.lineWidth = Math.max(1, m * 0.0025);
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)'; ctx.shadowBlur = 2;
    ctx.beginPath();
    for (const k of [1, 2]) {
      ctx.moveTo(i.x + i.w * k / 3, i.y); ctx.lineTo(i.x + i.w * k / 3, i.y + i.h);
      ctx.moveTo(i.x, i.y + i.h * k / 3); ctx.lineTo(i.x + i.w, i.y + i.h * k / 3);
    }
    ctx.stroke();
    ctx.restore();
  }
}
