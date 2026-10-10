// The journal's Map page: a storybook top-down map of Hoshi Valley with live markers for Mika, the Fallen Stars,
// Sora's treasures, the Star Lamps and the current goal.
// - The land is painted once per season into an offscreen canvas (ImageData) from the height grid, the ground splat
//   and the planted trees, and cached for the session. The painting is spread over a few frames (~10 ms each) and
//   shows up row by row, so opening the page never stalls.
// - Roads, rails, roofs and names are vectors drawn at the current zoom, so they stay crisp; that layer is cached
//   until the view changes.
// - The markers are redrawn every frame while the page is open (a light rAF loop that stops by itself when the
//   journal closes or another tab is chosen).
// Pure at import time (no DOM access), so Node tests can import ui.js.

import { PLACES, PATHS, BUILDINGS, LAMPS, FALLEN_STARS, rail, RAIL_PORTALS, VIADUCT, VIADUCT_SPANS, DOCKS, STONES, PADDIES, FERRY } from '../world/layout.js';
import { PALETTES } from '../world/seasons.js';
import { VEG_BEDS } from '../world/fields.js';
import { DECIDUOUS } from '../world/scatter.js';
import { fbm, clamp, smoothstep as sstep } from '../engine/spline.js';
import { STAR_POEM, KEEPSAKES, TREASURES, huntProgress } from '../game/story.js';
import { tx, N_, getLang } from '../i18n/i18n.js';

const RES = 2.5;                                          // land raster: pixels per metre
const CROP = { x0: -236, x1: 236, z0: -250, z1: 220 };   // painted area: the valley plus a fringe of hills
const FIT = { x0: -205, x1: 205, z0: -221, z1: 195 };    // "Whole valley": everything the player can reach
const AROUND = 150;                                       // "Around Mika": metres across the short side
const MAX_SCALE = 7;                                      // closest zoom, CSS px per metre
const ROOM_Y = 300;                                       // anything higher is inside a home (rooms hang at y 600)

const INK = '#3b2a1a';
const PAPER = '#f4e6c6';
const MIKA = '#e0567a';
const WARM = [255, 238, 176], COOL = [34, 62, 96];      // hillshade tints: sunlit slopes, shaded slopes

// Place names on the map (the villages larger). dx/dy: screen offset in label-font units; align: text anchor.
const LABELS = [
  { at: PLACES.kawabe, dx: 0, dy: 0.2, text: N_('Kawabe'), village: true },
  { at: PLACES.takamori, dx: 0, dy: 1.3, text: N_('Takamori'), village: true },
  { at: PLACES.station, dx: 0, dy: -1.25, text: N_('Hoshi Station') },
  { at: PLACES.cottage, dx: 0, dy: 1.4, text: N_("Sora's cottage") },
  { at: { x: -17.6, z: -45 }, dx: 0, dy: 1.5, text: N_("Ōta's mill") },
  { at: PLACES.pasture, dx: 0, dy: 1.7, text: N_('Sheep pasture') },
  { at: PLACES.orchard, dx: 0, dy: 0.2, text: N_('Peach orchard') },
  { at: PLACES.halt, dx: 1.1, dy: 0.1, align: 'left', text: N_('Takamori Halt') },
  { at: PLACES.shrine, dx: 0, dy: -1.5, text: N_('Forest Shrine') },
  { at: PLACES.landslide, dx: 0, dy: 1.5, text: N_('Landslide scar') },
  { at: PLACES.engineShed, dx: 0, dy: -1.6, text: N_('Engine shed') },
  { at: PLACES.viaductLamp, dx: 0, dy: 2.2, text: N_('Viaduct Lamp') },
];

// Roof colours (Kawabe: red-brown kawara tiles; Takamori: teal and blue roofs; see art/blender/build_architecture.py).
const ROOF = {
  'kawabe-house-a': '#b4513a', 'kawabe-house-b': '#a5452f', 'kawabe-shop': '#c0643c', mill: '#9c4a31', boathouse: '#8a5a3a',
  'takamori-house-a': '#3f9c86', 'takamori-house-b': '#4d86b8', bakery: '#e08a3c', belltower: '#2f8a78',
  station: '#6d5a9e', platform: '#e2d6bd', 'signal-cottage': '#c2573e', 'engine-shed': '#6b5b4e', shrine: '#d2472e', torii: '#e0452a',
};

const HOME_NAME = Object.fromEntries(KEEPSAKES.map(k => [k.home, k.where]));
const HINT = { musicBox: 'musicBox', compass: 'compass', tree: 'acorn' };   // hunt id -> TREASURES entry with a hint

// Everything that isn't per-map-instance survives tab switches: the painted land and the chosen view.
let LAND = null;                       // landJob(): { key, canvas, season, done, row, step(ms) }
const VIEW = { mode: 'valley', cx: 0, cz: 0, s: 0 };

const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const cap = s => (s ? s.charAt(0).toLocaleUpperCase() + s.slice(1) : s);
const rgb = hex => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c, k = 1) => `rgb(${Math.round(clamp(c[0] * k, 0, 255))},${Math.round(clamp(c[1] * k, 0, 255))},${Math.round(clamp(c[2] * k, 0, 255))})`;

// ------------------------------------------------------------------ the land raster
/**
 * Paint the valley: height-shaded ground, water, contours and trees, fading into paper outside the valley.
 * Returns a job whose step(ms) paints rows for about that long and reveals them (north to south), so the first
 * opening never stalls a frame for long; trees go on once the rows under them are finished.
 */
function landJob(game, season) {
  const grid = game.world.grid, sp = game.world.splat;
  const P = PALETTES[season] || PALETTES.summer, frozen = season === 'winter';
  const W = Math.round((CROP.x1 - CROP.x0) * RES), H = Math.round((CROP.z1 - CROP.z0) * RES), px = 1 / RES;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(W, H), d = img.data;
  // heights with a one-pixel ring for the gradients, computed a few rows ahead of the painting
  const W2 = W + 2, hs = new Float32Array(W2 * (H + 2));
  let hRows = 0;
  const heightRows = upto => {
    for (; hRows <= Math.min(upto, H + 1); hRows++) {
      const z = CROP.z0 + (hRows - 0.5) * px, o = hRows * W2 + 1;
      for (let i = -1; i <= W; i++) hs[o + i] = grid.heightAt(CROP.x0 + (i + 0.5) * px, z);
    }
  };
  // coarse painterly noise (every 4 m), sampled bilinearly
  const NS = 4, nw = Math.ceil((CROP.x1 - CROP.x0) / NS) + 2, nh = Math.ceil((CROP.z1 - CROP.z0) / NS) + 2, noise = new Float32Array(nw * nh);
  for (let j = 0; j < nh; j++) for (let i = 0; i < nw; i++) noise[j * nw + i] = fbm((CROP.x0 + i * NS) / 38 + 5, (CROP.z0 + j * NS) / 38 - 3, 3);
  const noiseAt = (x, z) => {
    const fx = (x - CROP.x0) / NS, fz = (z - CROP.z0) / NS, i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, o = j * nw + i;
    return (noise[o] * (1 - u) + noise[o + 1] * u) * (1 - v) + (noise[o + nw] * (1 - u) + noise[o + nw + 1] * u) * v;
  };
  const g0 = rgb(P.grass[0]), g1 = rgb(P.grass[1]), g2 = rgb(P.grass[2]), forest = rgb(P.forest), sand = rgb(P.sand), dirt = rgb(P.dirt), rock = rgb(P.rock);
  const hills = mix3(rgb(P.needles), forest, 0.35), peak = mix3(rock, [236, 232, 226], 0.25), snow = [250, 252, 255], paper = rgb(PAPER);
  const shallow = frozen ? [214, 236, 248] : [104, 196, 236], deep = frozen ? [170, 210, 236] : [38, 128, 205], foam = frozen ? [240, 248, 255] : [214, 243, 255];
  // light from the north-west, a little high
  const Lx = -0.52, Ly = 0.72, Lz = -0.46, Ll = Math.hypot(Lx, Ly, Lz), lx = Lx / Ll, ly = Ly / Ll, lz = Lz / Ll;
  const sd = sp?.data, sw = sp?.w, sh = sp?.h;
  const splat = (x, z, out) => {
    if (!sd) return false;
    const fx = x - sp.x0 - 0.5, fz = z - sp.z0 - 0.5, i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= sw - 1 || j >= sh - 1) return false;
    const u = fx - i, v = fz - j, o = (j * sw + i) * 4, o2 = o + sw * 4;
    for (let c = 0; c < 4; c++) out[c] = ((sd[o + c] * (1 - u) + sd[o + 4 + c] * u) * (1 - v) + (sd[o2 + c] * (1 - u) + sd[o2 + 4 + c] * u) * v) / 255;
    return true;
  };
  // every colour is mixed in place in C (no per-pixel allocations: this runs for about 1.4 million pixels)
  const S = new Float64Array(4), C = new Float64Array(3), contour = [70, 60, 40];
  const mix = (col, t) => { if (t <= 0) return; C[0] += (col[0] - C[0]) * t; C[1] += (col[1] - C[1]) * t; C[2] += (col[2] - C[2]) * t; };
  const set = col => { C[0] = col[0]; C[1] = col[1]; C[2] = col[2]; };
  let seed = 12345;
  const paintRow = j => {
    const z = CROP.z0 + (j + 0.5) * px;
    for (let i = 0; i < W; i++) {
      const x = CROP.x0 + (i + 0.5) * px, k = (j + 1) * W2 + i + 1, h = hs[k];
      const dx = (hs[k + 1] - hs[k - 1]) * RES * 0.5, dz = (hs[k + W2] - hs[k - W2]) * RES * 0.5;
      if (h < 0.02) {
        // water: deeper is darker; a pale rim where it meets the bank
        set(shallow); mix(deep, sstep(0.1, 2.1, -h));
        if (h > -0.3) mix(foam, 0.55 * sstep(-0.3, 0.02, h));
      } else {
        const n = noiseAt(x, z);
        set(g0);
        if (n < 0) mix(g2, Math.min(1, -n * 2.6)); else mix(g1, Math.min(1, n * 2.6));
        if (splat(x, z, S)) {
          mix(forest, S[2] * 0.5);
          mix(dirt, S[0] * 0.35);
          mix(sand, S[1]);
          mix(rock, clamp(1 - S[3] - S[1] * 1.2 - S[0], 0, 1) * 0.5);
        } else mix(rock, sstep(0.58, 0.97, Math.sqrt(dx * dx + dz * dz)) * 0.7);   // slopes of 30..44 degrees
        // the rim: wooded foothills, then pale rock, then snow on the tall peaks
        mix(hills, sstep(26, 48, h) * 0.55);
        mix(peak, sstep(58, 120, h) * 0.85);
        mix(snow, sstep(frozen ? 60 : 130, frozen ? 110 : 190, h));
        // contour lines every 5 m (every 25 m a little darker)
        const gr = Math.sqrt(dx * dx + dz * dz) + 1e-4, f = h / 5, dist = Math.abs(f - Math.round(f)) * 5, w = gr * px * 0.85;
        if (dist < w && h > 0.6) mix(contour, (1 - dist / w) * (Math.round(f) % 5 === 0 ? 0.22 : 0.11));
      }
      // hillshade, clamped and tinted like paint: sunny slopes warm, shaded ones cool, never black
      // (water keeps a gentle shade of its bed)
      const nl = Math.sqrt(dx * dx + 1 + dz * dz), dot = (-dx * lx + ly - dz * lz) / nl;
      const shade = clamp(1 + (dot - ly) * (h < 0.02 ? 0.35 : 1.05), 0.74, 1.2);
      if (shade > 1) mix(WARM, (shade - 1) * 0.9); else mix(COOL, (1 - shade) * 0.55);
      // fade into paper outside the reachable valley
      const out = Math.max(FIT.x0 - x, x - FIT.x1, FIT.z0 - z, z - FIT.z1, 0);
      const fade = out > 0 ? sstep(0, 30, out) * 0.78 : 0;
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
      const grain = (1 + ((seed >>> 16) / 65536 - 0.5) * 0.045) * shade, keep = 1 - fade;
      const o = (j * W + i) * 4;
      d[o] = (C[0] * keep + paper[0] * fade) * grain;
      d[o + 1] = (C[1] * keep + paper[1] * fade) * grain;
      d[o + 2] = (C[2] * keep + paper[2] * fade) * grain;
      d[o + 3] = 255;
    }
  };
  const trees = (game.placed?.trees || []).filter(t => t.x > CROP.x0 - 4 && t.x < CROP.x1 + 4 && t.z > CROP.z0 - 4 && t.z < CROP.z1 + 4).sort((a, b) => a.z - b.z);
  let row = 0, ti = 0;
  const job = {
    canvas, season, done: false, row: 0, ms: 0,
    step(budget) {
      const t0 = performance.now(), from = row;
      while (row < H && performance.now() - t0 < budget) {
        const until = Math.min(H, row + 8);
        heightRows(until + 1);
        for (let j = row; j < until; j++) paintRow(j);
        row = until;
      }
      if (row > from) ctx.putImageData(img, 0, 0, 0, from, W, row - from);
      // trees whose crown and shadow lie wholly on finished rows (a crown and its shadow reach < 6 m south)
      const zDone = row >= H ? Infinity : CROP.z0 + row * px - 6, batch = [];
      while (ti < trees.length && trees[ti].z < zDone) batch.push(trees[ti++]);
      if (batch.length) paintTrees(ctx, batch, P, season);
      job.row = row;
      job.ms += performance.now() - t0;
      job.done = row >= H;
      return job.done;
    },
  };
  return job;
}

/** Trees as little round crowns with a south-east shadow, batched by colour. */
function paintTrees(ctx, trees, P, season) {
  const bare = P.bareTrees, byColour = new Map(), shadows = new Path2D();
  const colour = t => {
    const m = t.model;
    if (bare && DECIDUOUS.has(m)) return '#9b8a78';
    if (m === 'tree-cedar' || m === 'tree-pine') return P.needles;
    if (m === 'tree-sakura') return season === 'spring' ? P.blossom : season === 'autumn' ? '#e8803a' : P.leaves;
    if (m === 'tree-maple') return P.maple;
    if (m === 'tree-peach') return season === 'spring' ? '#ffb7cf' : P.peachLeaves;
    return P.leaves;
  };
  for (const t of trees) {
    const X = (t.x - CROP.x0) * RES, Y = (t.z - CROP.z0) * RES;
    const r = (t.far ? 2.1 : 1.65) * (t.s || 1) * RES * (bare && DECIDUOUS.has(t.model) ? 0.7 : 1);
    shadows.moveTo(X + r * 0.45 + r, Y + r * 0.55);
    shadows.arc(X + r * 0.45, Y + r * 0.55, r, 0, Math.PI * 2);
    const c = colour(t);
    let b = byColour.get(c);
    if (!b) byColour.set(c, b = { crown: new Path2D(), light: new Path2D() });
    b.crown.moveTo(X + r, Y);
    b.crown.arc(X, Y, r, 0, Math.PI * 2);
    b.light.moveTo(X - r * 0.28 + r * 0.46, Y - r * 0.3);
    b.light.arc(X - r * 0.28, Y - r * 0.3, r * 0.46, 0, Math.PI * 2);
  }
  ctx.fillStyle = 'rgba(24, 40, 22, 0.3)';
  ctx.fill(shadows);
  for (const [c, b] of byColour) {
    const base = rgb(c);
    ctx.fillStyle = css(base, 0.92);
    ctx.fill(b.crown);
    ctx.fillStyle = css(mix3(base, [255, 250, 225], 0.3));
    ctx.fill(b.light);
    if (P.snow) { ctx.fillStyle = 'rgba(255, 255, 255, 0.55)'; ctx.fill(b.light); }
  }
}

const seasonOf = game => game.world?.season || game.time?.season || 'summer';
const landKey = game => `${seasonOf(game)}|${game.world?.grid?.nx}`;

/** The (maybe still painting) land for the current season. */
function landFor(game) {
  const key = landKey(game);
  if (LAND?.key !== key) LAND = Object.assign(landJob(game, seasonOf(game)), { key });
  return LAND;
}

// ------------------------------------------------------------------ glyphs (canvas)
function starPath(ctx, x, y, R, r = R * 0.46) {
  ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r : R;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}

function drawStar(ctx, x, y, R, found, t) {
  ctx.save();
  if (found) {
    ctx.globalAlpha = 0.55;
    starPath(ctx, x, y, R * 0.85);
    ctx.fillStyle = '#f3ead2'; ctx.fill();
    ctx.lineWidth = 1.2; ctx.strokeStyle = '#a08a5a'; ctx.stroke();
    ctx.globalAlpha = 0.95;
    drawCheck(ctx, x + R * 0.55, y + R * 0.5, R * 0.62);
  } else {
    const pulse = 0.5 + 0.5 * Math.sin(t * 3.2 + x * 0.05);
    const glow = ctx.createRadialGradient(x, y, 0, x, y, R * 2.3);
    glow.addColorStop(0, `rgba(255, 222, 90, ${0.55 + 0.25 * pulse})`);
    glow.addColorStop(1, 'rgba(255, 222, 90, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(x, y, R * 2.3, 0, Math.PI * 2); ctx.fill();
    starPath(ctx, x, y, R * (1 + 0.06 * pulse));
    const g = ctx.createLinearGradient(x, y - R, x, y + R);
    g.addColorStop(0, '#fff3a0'); g.addColorStop(1, '#ffc21a');
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 1.4; ctx.strokeStyle = '#9a5a0c'; ctx.lineJoin = 'round'; ctx.stroke();
  }
  ctx.restore();
}

function drawCheck(ctx, x, y, s) {
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, s * 0.62, 0, Math.PI * 2);
  ctx.fillStyle = '#1fa5a0'; ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = '#fff'; ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - s * 0.3, y + s * 0.02); ctx.lineTo(x - s * 0.08, y + s * 0.24); ctx.lineTo(x + s * 0.32, y - s * 0.22);
  ctx.lineWidth = Math.max(1.3, s * 0.2); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#fff'; ctx.stroke();
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function drawChest(ctx, x, y, s, found, count, t) {
  ctx.save();
  const w = s * 1.25, h = s * 0.95, x0 = x - w / 2, y0 = y - h / 2;
  if (!found) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.6 + y * 0.07);
    ctx.fillStyle = `rgba(255, 236, 170, ${0.35 + 0.25 * pulse})`;
    ctx.beginPath(); ctx.arc(x, y, s * 1.15, 0, Math.PI * 2); ctx.fill();
  } else ctx.globalAlpha = 0.5;
  ctx.fillStyle = 'rgba(40, 24, 10, 0.3)';
  roundRect(ctx, x0 + 1.2, y0 + 1.6, w, h, s * 0.18); ctx.fill();
  roundRect(ctx, x0, y0, w, h, s * 0.18);
  ctx.fillStyle = '#b86a2c'; ctx.fill();
  ctx.lineWidth = 1.2; ctx.strokeStyle = '#5a2e10'; ctx.stroke();
  // lid
  roundRect(ctx, x0, y0, w, h * 0.42, s * 0.18);
  ctx.fillStyle = '#d98a3e'; ctx.fill(); ctx.stroke();
  // bands and clasp
  ctx.fillStyle = '#ffd23f';
  ctx.fillRect(x0 + w * 0.2, y0, w * 0.1, h); ctx.fillRect(x0 + w * 0.7, y0, w * 0.1, h);
  ctx.fillRect(x - s * 0.13, y0 + h * 0.3, s * 0.26, h * 0.32);
  ctx.globalAlpha = 1;
  if (found) drawCheck(ctx, x + w * 0.5, y + h * 0.45, s * 0.7);
  else if (count > 1) {
    const bx = x + w * 0.55, by = y - h * 0.6, r = s * 0.5;
    ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2);
    ctx.fillStyle = INK; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `800 ${Math.round(r * 1.35)}px Nunito, system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(count), bx, by + 0.5);
  }
  ctx.restore();
}

function drawLamp(ctx, x, y, s, lit, t) {
  ctx.save();
  if (lit) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, s * 2);
    g.addColorStop(0, `rgba(255, 196, 80, ${0.6 + 0.15 * Math.sin(t * 2)})`); g.addColorStop(1, 'rgba(255, 196, 80, 0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, s * 2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.beginPath(); ctx.arc(x, y, s * 0.62, 0, Math.PI * 2);
  ctx.fillStyle = lit ? '#ffcf4a' : '#5d6a88'; ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = lit ? '#9a5a0c' : '#2b3350'; ctx.stroke();
  starPath(ctx, x, y, s * 0.42);
  ctx.fillStyle = lit ? '#fff7d0' : '#aab4cc'; ctx.fill();
  ctx.restore();
}

function drawPin(ctx, x, y, s, t) {
  ctx.save();
  const p = (t * 0.9) % 1;
  ctx.beginPath(); ctx.ellipse(x, y, s * (0.4 + p * 1.5), s * (0.2 + p * 0.75), 0, 0, Math.PI * 2);
  ctx.lineWidth = 2; ctx.strokeStyle = `rgba(255, 190, 40, ${1 - p})`; ctx.stroke();
  const bob = Math.sin(t * 4) * s * 0.12, top = y - s * 1.9 + bob, r = s * 0.62;
  ctx.fillStyle = 'rgba(40, 24, 10, 0.3)';
  ctx.beginPath(); ctx.ellipse(x, y, s * 0.35, s * 0.16, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x, y + bob * 0.3);
  ctx.bezierCurveTo(x - r * 0.35, top + r * 1.6, x - r * 1.05, top + r * 0.9, x - r, top);
  ctx.arc(x, top, r, Math.PI, 0);
  ctx.bezierCurveTo(x + r * 1.05, top + r * 0.9, x + r * 0.35, top + r * 1.6, x, y + bob * 0.3);
  const g = ctx.createLinearGradient(x, top - r, x, y);
  g.addColorStop(0, '#ffe066'); g.addColorStop(1, '#f29a1a');
  ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = '#7a3d06'; ctx.stroke();
  ctx.beginPath(); ctx.arc(x, top, r * 0.4, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
  ctx.restore();
}

function drawMika(ctx, x, y, s, facing, t, inside) {
  ctx.save();
  for (const k of [0, 0.5]) {
    const p = (t * 0.7 + k) % 1;
    ctx.beginPath(); ctx.arc(x, y, s * (1 + p * 2.2), 0, Math.PI * 2);
    ctx.lineWidth = 2.2 * (1 - p) + 0.4; ctx.strokeStyle = `rgba(224, 86, 122, ${0.8 * (1 - p)})`; ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(x + 1, y + 1.5, s * 1.05, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(30, 10, 20, 0.3)'; ctx.fill();
  ctx.beginPath(); ctx.arc(x, y, s * 1.05, 0, Math.PI * 2);
  ctx.fillStyle = MIKA; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
  if (inside) {
    // a little house: she's indoors
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(x, y - s * 0.62); ctx.lineTo(x + s * 0.6, y - s * 0.05); ctx.lineTo(x + s * 0.42, y - s * 0.05);
    ctx.lineTo(x + s * 0.42, y + s * 0.5); ctx.lineTo(x - s * 0.42, y + s * 0.5); ctx.lineTo(x - s * 0.42, y - s * 0.05); ctx.lineTo(x - s * 0.6, y - s * 0.05);
    ctx.closePath(); ctx.fill();
  } else {
    // heading: 0 = +Z (down on the map); the arrow is drawn pointing up, so turn it by (pi - facing)
    ctx.translate(x, y);
    ctx.rotate(Math.PI - facing);
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.72); ctx.lineTo(s * 0.52, s * 0.5); ctx.lineTo(0, s * 0.22); ctx.lineTo(-s * 0.52, s * 0.5);
    ctx.closePath(); ctx.fillStyle = '#fff'; ctx.fill();
  }
  ctx.restore();
}

/** A small arrow on the map's edge pointing at something out of view. */
function drawEdge(ctx, x, y, ang, colour) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(ang);
  ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-5, -7); ctx.lineTo(-2, 0); ctx.lineTo(-5, 7); ctx.closePath();
  ctx.fillStyle = colour; ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.stroke();
  ctx.restore();
}

// ------------------------------------------------------------------ glyphs (legend SVG)
const starD = (R, r = R * 0.46) => Array.from({ length: 10 }, (_, k) => { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r : R; return `${k ? 'L' : 'M'}${(Math.cos(a) * rr).toFixed(2)} ${(Math.sin(a) * rr).toFixed(2)}`; }).join('') + 'Z';
const SVG = {
  star: `<svg viewBox="-12 -12 24 24"><circle r="11" fill="#ffe27a" opacity=".45"/><path d="${starD(8.5)}" fill="#ffcf2e" stroke="#9a5a0c" stroke-width="1.4" stroke-linejoin="round"/></svg>`,
  chest: '<svg viewBox="-12 -12 24 24"><rect x="-8" y="-6" width="16" height="12" rx="2.4" fill="#b86a2c" stroke="#5a2e10" stroke-width="1.2"/><rect x="-8" y="-6" width="16" height="5" rx="2.4" fill="#d98a3e" stroke="#5a2e10" stroke-width="1.2"/><rect x="-5" y="-6" width="1.6" height="12" fill="#ffd23f"/><rect x="3.4" y="-6" width="1.6" height="12" fill="#ffd23f"/><rect x="-1.6" y="-2.4" width="3.2" height="4" fill="#ffd23f"/></svg>',
  mika: `<svg viewBox="-12 -12 24 24"><circle r="10.5" fill="none" stroke="${MIKA}" stroke-width="1.4" opacity=".5"/><circle r="7" fill="${MIKA}" stroke="#fff" stroke-width="2"/><path d="M0 -4.8L3.5 3.4L0 1.5L-3.5 3.4Z" fill="#fff"/></svg>`,
  pin: '<svg viewBox="-12 -12 24 24"><ellipse cy="9" rx="6" ry="2.4" fill="none" stroke="#ffbe28" stroke-width="1.6"/><path d="M0 9C-2 5 -7 1 -6.5 -4A6.5 6.5 0 0 1 6.5 -4C7 1 2 5 0 9Z" fill="#f7b52a" stroke="#7a3d06" stroke-width="1.4"/><circle cy="-4" r="2.6" fill="#fff"/></svg>',
  lamp: `<svg viewBox="-12 -12 24 24"><circle r="11" fill="#ffc450" opacity=".4"/><circle r="6.5" fill="#ffcf4a" stroke="#9a5a0c" stroke-width="1.5"/><path d="${starD(4.3)}" fill="#fff7d0"/></svg>`,
  found: `<svg viewBox="-12 -12 24 24"><path d="${starD(8)}" fill="#f3ead2" stroke="#a08a5a" stroke-width="1.2" opacity=".6"/><circle cx="5" cy="5" r="5" fill="#1fa5a0" stroke="#fff"/><path d="M2.4 5.2L4.3 7L7.6 3.4" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};

// ------------------------------------------------------------------ the page
export class JournalMap {
  constructor(game) {
    this.game = game;
    this.raf = 0;
    this.tick = this.tick.bind(this);
  }

  /** Render the Map page into the journal body and start the live loop. */
  mount(body, ui) {
    this.stop();
    this.ui = ui;
    const touch = !!ui?.touch;
    body.innerHTML = `<div class="jmap">
      <div class="jmap-view">
        <canvas class="jmap-canvas" aria-label="${esc(tx('Map'))}" role="img"></canvas>
        <div class="jmap-tip hidden"></div>
      </div>
      <aside class="jmap-side">
        <div class="jmap-tally"></div>
        <div class="jmap-zoom" role="group">
          <button data-zoom="valley">${esc(tx('Whole valley'))}</button><button data-zoom="mika">${esc(tx('Around Mika'))}</button>
        </div>
        <ul class="jmap-legend"></ul>
        <p class="jmap-hint">${esc(touch ? tx('Drag to move · pinch to zoom · tap a marker to see what it is') : tx('Drag to move · scroll to zoom · point at a marker to see what it is'))}</p>
      </aside>
    </div>`;
    this.body = body;
    this.view = body.querySelector('.jmap-view');
    this.canvas = body.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.tip = body.querySelector('.jmap-tip');
    this.book = body.closest('.book');
    this.book?.classList.add('mapmode');
    this.journal = body.closest('.overlay');
    this.touch = touch;
    this.fonts();
    this.sideText();
    this.bindZoom();
    this.bindPointer();
    this.cacheKey = '';
    this.anim = null;
    this.t0 = performance.now();
    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(this.view);
    this.layout();
    this.raf = requestAnimationFrame(this.tick);
    document.fonts?.ready.then(() => { this.cacheKey = ''; });
  }

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.ro?.disconnect();
    this.ro = null;
    this.book?.classList.remove('mapmode');
    clearTimeout(this.tipTimer);
  }

  /** How long painting the land took (ms), for probes. */
  landMs() { return LAND && [Math.round(LAND.ms), LAND.done]; }

  alive() {
    return this.canvas?.isConnected && !this.journal?.classList.contains('hidden') && (!this.ui || this.ui._tab === 'map');
  }

  fonts() {
    const cs = getComputedStyle(document.body);
    this.headFont = cs.getPropertyValue('--head').trim() || "'Fredoka', 'Nunito', system-ui, sans-serif";
  }

  // ---------------------------------------------------------------- side panel
  sideText() {
    const q = this.game.quest?.state;
    if (!q) return;
    const side = this.body.querySelector('.jmap-side');
    const hp = huntProgress(q);
    const lit = LAMPS.filter(l => q.lamps?.[l.id]).length;
    side.querySelector('.jmap-tally').innerHTML =
      `<div class="t"><i>${SVG.star}</i><span>${esc(tx('Fallen Stars'))}</span><b>${q.stars.length} / ${FALLEN_STARS.length}</b></div>` +
      `<div class="t"><i>${SVG.chest}</i><span>${esc(tx('Treasures'))}</span><b>${hp.found} / ${hp.total}</b></div>`;
    // the goal line repeats the objective shown on the HUD (already translated and filled in there)
    const goal = document.getElementById('objText')?.textContent?.trim();
    side.querySelector('.jmap-legend').innerHTML = [
      [SVG.mika, tx('Mika')], [SVG.pin, tx('Current goal'), goal], [SVG.lamp, tx('{n} of 4 Star Lamps', { n: lit })], [SVG.found, tx('Found')],
    ].map(([g, t, sub]) => `<li><i>${g}</i><span>${esc(t)}${sub ? `<small>${esc(sub)}</small>` : ''}</span></li>`).join('');
  }

  // ---------------------------------------------------------------- view
  layout() {
    if (!this.canvas?.isConnected) return;
    const w = this.view.clientWidth, h = this.view.clientHeight;
    if (!w || !h) return;
    // the journal may be zoomed (Settings > text size): size the backing store in real device pixels
    const zoom = this.view.getBoundingClientRect().width / w || 1;
    const dpr = Math.min(3, (window.devicePixelRatio || 1) * zoom);
    this.W = w; this.H = h; this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`; this.canvas.style.height = `${h}px`;
    this.fitScale = Math.min(w / (FIT.x1 - FIT.x0), h / (FIT.z1 - FIT.z0));
    this.cacheKey = '';
    if (VIEW.mode === 'free' && VIEW.s) this.clampView(VIEW);
    else this.setMode(VIEW.mode, false);
    this.draw(performance.now());
  }

  presetView(mode) {
    if (mode === 'mika') {
      const m = this.mikaAt();
      const s = Math.min(MAX_SCALE, Math.max(this.fitScale * 1.6, Math.min(this.W, this.H) / AROUND));
      return this.clampView({ cx: m.x, cz: m.z, s });
    }
    return { cx: (FIT.x0 + FIT.x1) / 2, cz: (FIT.z0 + FIT.z1) / 2, s: this.fitScale };
  }

  setMode(mode, animate = true) {
    VIEW.mode = mode;
    const v = this.presetView(mode);
    if (animate && VIEW.s) this.anim = { from: { cx: VIEW.cx, cz: VIEW.cz, s: VIEW.s }, to: v, t0: performance.now(), dur: 420 };
    else Object.assign(VIEW, v);
    this.body.querySelectorAll('.jmap-zoom button').forEach(b => b.classList.toggle('on', b.dataset.zoom === mode));
  }

  clampView(v) {
    v.s = clamp(v.s, this.fitScale * 0.98, MAX_SCALE);
    const hw = this.W / 2 / v.s, hh = this.H / 2 / v.s;
    const midX = (FIT.x0 + FIT.x1) / 2, midZ = (FIT.z0 + FIT.z1) / 2;
    v.cx = hw * 2 >= CROP.x1 - CROP.x0 - 20 ? midX : clamp(v.cx, CROP.x0 + 10 + hw, CROP.x1 - 10 - hw);
    v.cz = hh * 2 >= CROP.z1 - CROP.z0 - 20 ? midZ : clamp(v.cz, CROP.z0 + 10 + hh, CROP.z1 - 10 - hh);
    if (this.W / v.s > FIT.x1 - FIT.x0) v.cx = midX;
    if (this.H / v.s > FIT.z1 - FIT.z0) v.cz = midZ;
    return v;
  }

  toScreen(x, z) { return [(x - VIEW.cx) * VIEW.s + this.W / 2, (z - VIEW.cz) * VIEW.s + this.H / 2]; }
  toWorld(sx, sy) { return [(sx - this.W / 2) / VIEW.s + VIEW.cx, (sy - this.H / 2) / VIEW.s + VIEW.cz]; }

  /** Any point, brought outdoors: things inside a home (rooms hang high above the valley) go to its front door. */
  outdoors(p) {
    if (!p) return null;
    if (p.y === undefined || p.y < ROOM_Y) return p;
    const I = this.game.interiors;
    let best = null, bd = Infinity;
    for (const [id, room] of I?.rooms || []) {
      const r = room.root.position, d = (r.x - p.x) ** 2 + (r.z - p.z) ** 2;
      if (d < bd) { bd = d; best = id; }
    }
    return I?.doors.find(d => d.id === best)?.outside || null;
  }

  mikaAt() {
    const g = this.game, I = g.interiors, p = g.player.pos;
    if (I?.active) {
      const door = I.doors.find(d => d.id === I.active)?.outside;
      if (door) return { x: door.x, z: door.z, inside: I.active };
    }
    const o = this.outdoors(p) || p;
    return { x: o.x, z: o.z, inside: p.y >= ROOM_Y ? 'home' : null };
  }

  // ---------------------------------------------------------------- input
  bindZoom() {
    this.body.querySelectorAll('.jmap-zoom button').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation();
      this.setMode(b.dataset.zoom);
    }));
  }

  bindPointer() {
    const c = this.canvas, pts = new Map();
    let start = null, moved = false, pinch = null;
    const local = e => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) * this.W / r.width, (e.clientY - r.top) * this.H / r.height]; };
    const free = () => {
      VIEW.mode = 'free'; this.anim = null;
      this.body.querySelectorAll('.jmap-zoom button').forEach(b => b.classList.remove('on'));
    };
    const zoomAt = (sx, sy, k) => {
      const [wx, wz] = this.toWorld(sx, sy);
      VIEW.s = clamp(VIEW.s * k, this.fitScale * 0.98, MAX_SCALE);
      VIEW.cx = wx - (sx - this.W / 2) / VIEW.s;
      VIEW.cz = wz - (sy - this.H / 2) / VIEW.s;
      this.clampView(VIEW);
    };
    c.addEventListener('pointerdown', e => {
      c.setPointerCapture?.(e.pointerId);
      pts.set(e.pointerId, local(e));
      if (pts.size === 1) { start = local(e); moved = false; }
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2 };
        moved = true;
      }
    });
    c.addEventListener('pointermove', e => {
      const p = local(e);
      if (!pts.has(e.pointerId)) { if (e.pointerType === 'mouse') this.hover(p); return; }
      const prev = pts.get(e.pointerId);
      pts.set(e.pointerId, p);
      if (pts.size === 2 && pinch) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        free();
        VIEW.cx -= (mx - pinch.mx) / VIEW.s; VIEW.cz -= (my - pinch.my) / VIEW.s;
        zoomAt(mx, my, d / (pinch.d || d));
        pinch = { d, mx, my };
        return;
      }
      if (!moved && Math.hypot(p[0] - start[0], p[1] - start[1]) < 6) return;
      if (!moved) { moved = true; free(); this.hideTip(); }
      VIEW.cx -= (p[0] - prev[0]) / VIEW.s; VIEW.cz -= (p[1] - prev[1]) / VIEW.s;
      this.clampView(VIEW);
    });
    const up = e => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (pts.size === 0 && !moved && e.type === 'pointerup') this.tap(local(e), e.pointerType !== 'mouse');
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !pts.size) this.hideTip(); });
    c.addEventListener('wheel', e => {
      e.preventDefault();
      free();
      const [sx, sy] = local(e);
      zoomAt(sx, sy, Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0016)));
    }, { passive: false });
  }

  hit(p, radius) {
    let best = null, bd = radius;
    for (const h of this.hits || []) {
      const d = Math.hypot(h.x - p[0], h.y - p[1]) - (h.r || 0);
      if (d < bd) { bd = d; best = h; }
    }
    return best;
  }

  hover(p) {
    const h = this.hit(p, 8);
    if (h) this.showTip(h); else this.hideTip();
    this.canvas.style.cursor = h ? 'pointer' : 'grab';
  }

  tap(p, touch) {
    const h = this.hit(p, touch ? 18 : 10);
    if (!h) { this.hideTip(); return; }
    this.showTip(h);
    clearTimeout(this.tipTimer);
    if (touch) this.tipTimer = setTimeout(() => this.hideTip(), 3500);
  }

  showTip(h) {
    const tip = this.tip;
    if (this.tipFor !== h.key) {
      tip.innerHTML = `<b>${esc(h.title)}</b>` + (h.lines || []).filter(Boolean).map(l => `<span>${esc(l)}</span>`).join('');
      this.tipFor = h.key;
    }
    tip.classList.remove('hidden');
    const w = tip.offsetWidth, th = tip.offsetHeight;
    const above = h.y - (h.r || 8) - 6 - th > 2;
    const x = clamp(h.x - w / 2, 4, this.W - w - 4), y = above ? h.y - (h.r || 8) - 6 - th : h.y + (h.r || 8) + 6;
    tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(clamp(y, 2, this.H - th - 2))}px)`;
  }

  hideTip() { this.tip?.classList.add('hidden'); this.tipFor = null; }

  // ---------------------------------------------------------------- frame
  tick(now) {
    if (!this.alive()) { this.stop(); return; }
    this.raf = requestAnimationFrame(this.tick);
    try { this.draw(now); } catch (e) { if (!this.warned) { this.warned = true; console.warn('journal map:', e); } }
  }

  draw(now) {
    if (!this.W) return;
    if (this.anim) {
      const a = this.anim, k = clamp((now - a.t0) / a.dur, 0, 1), e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      // zoom in log space so the glide feels even
      VIEW.s = Math.exp(Math.log(a.from.s) + (Math.log(a.to.s) - Math.log(a.from.s)) * e);
      VIEW.cx = a.from.cx + (a.to.cx - a.from.cx) * e;
      VIEW.cz = a.from.cz + (a.to.cz - a.from.cz) * e;
      if (k >= 1) this.anim = null;
    }
    const ctx = this.ctx, t = Math.max(0, now - (this.t0 ?? now)) / 1000;
    // the first time (and after a change of season) the land paints itself in over a few frames
    const land = landFor(this.game);
    if (!land.done) land.step(10);
    const key = `${VIEW.cx.toFixed(2)}|${VIEW.cz.toFixed(2)}|${VIEW.s.toFixed(4)}|${this.W}x${this.H}@${this.dpr}|${land.key}:${land.row}|${getLang()}`;
    if (key !== this.cacheKey) { this.paintBase(land); this.cacheKey = key; }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.base, 0, 0);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawMarkers(ctx, t);
  }

  /** The static layer for the current view: land, water features, roads, rails, roofs and names. */
  paintBase(land) {
    const W = this.W, H = this.H, dpr = this.dpr, s = VIEW.s;
    if (!this.base) this.base = document.createElement('canvas');
    if (this.base.width !== this.canvas.width || this.base.height !== this.canvas.height) { this.base.width = this.canvas.width; this.base.height = this.canvas.height; }
    const ctx = this.base.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);
    const [lx, ly] = this.toScreen(CROP.x0, CROP.z0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(land.canvas, lx, ly, (CROP.x1 - CROP.x0) * s, (CROP.z1 - CROP.z0) * s);
    const season = land.season;
    const S = (x, z) => this.toScreen(x, z);
    const line = (pts, width, colour, dash) => {
      ctx.beginPath();
      pts.forEach(([x, z], i) => { const [a, b] = S(x, z); if (i) ctx.lineTo(a, b); else ctx.moveTo(a, b); });
      ctx.lineWidth = width; ctx.strokeStyle = colour; ctx.setLineDash(dash || []); ctx.stroke();
    };
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // rice paddies
    const paddy = { spring: ['#9fd39a', '#5f9a4e'], summer: ['#7cc443', '#4f8f2e'], autumn: ['#e8c253', '#a8822a'], winter: ['#e6edf4', '#b3c2d2'] }[season] || ['#7cc443', '#4f8f2e'];
    for (const p of PADDIES) {
      const [a, b] = S(p.x - p.w / 2, p.z - p.d / 2);
      const veg = VEG_BEDS.has(p.id);
      ctx.fillStyle = veg ? (season === 'winter' ? '#d9d3cc' : '#9a6a40') : paddy[0]; ctx.fillRect(a, b, p.w * s, p.d * s);
      if (veg) {
        // a vegetable bed: brown earth with green rows running north-south
        ctx.fillStyle = season === 'winter' ? '#9fb89a' : season === 'spring' ? '#a9d67a' : '#5fae3c';
        const rw = Math.max(0.8, 0.5 * s);
        for (let k = 0; k < 5; k++) ctx.fillRect(a + (1.3 + k * (p.w - 2.6) / 4) * s - rw / 2, b + 0.9 * s, rw, (p.d - 1.8) * s);
      }
      ctx.lineWidth = Math.max(0.8, 0.5 * s); ctx.strokeStyle = veg ? '#6f4a2a' : paddy[1]; ctx.setLineDash([]); ctx.strokeRect(a, b, p.w * s, p.d * s);
    }
    // footpaths: a warm sand band with a darker edge
    for (const p of PATHS) line(p.pts, Math.max(2.6, (p.w + 0.9) * s), 'rgba(150, 104, 60, 0.55)');
    for (const p of PATHS) line(p.pts, Math.max(1.5, p.w * s), season === 'winter' ? '#d9c3a2' : '#f1d9a4');
    // Rin's ferry and the stepping stones
    if (season !== 'winter') line([[FERRY.from.x, FERRY.from.z], [FERRY.to.x, FERRY.to.z]], Math.max(1, 0.35 * s), 'rgba(255, 255, 255, 0.9)', [3, 3]);
    ctx.setLineDash([]);
    ctx.fillStyle = '#8f8a82';
    for (const [x, z] of STONES) { const [a, b] = S(x, z); ctx.beginPath(); ctx.arc(a, b, Math.max(0.9, 0.55 * s), 0, Math.PI * 2); ctx.fill(); }
    for (const dk of DOCKS) {
      const r = dk.rot * Math.PI / 180, len = 3.2 * dk.n + 1;
      const [a, b] = S(dk.x, dk.z);
      ctx.save(); ctx.translate(a, b); ctx.rotate(-r);
      ctx.fillStyle = '#9a6a3c'; ctx.fillRect(-1.3 * s, 0, 2.6 * s, len * s);
      ctx.restore();
    }
    // the railway: tunnels dotted, the viaduct as a stone bridge, the line itself dark with pale sleepers
    const pts = rail.pts, L = rail.len;
    const west = L.findIndex(v => v >= RAIL_PORTALS.west), eastI = L.findIndex(v => v >= RAIL_PORTALS.east);
    const east = eastI < 0 ? pts.length - 1 : eastI;
    line(pts.slice(0, west + 1), Math.max(1.4, 1.2 * s), 'rgba(80, 60, 44, 0.45)', [2, 4]);
    line(pts.slice(east), Math.max(1.4, 1.2 * s), 'rgba(80, 60, 44, 0.45)', [2, 4]);
    ctx.setLineDash([]);
    {
      const [a, b] = S(VIADUCT.x0 - 1, VIADUCT.z - 3.4), w = (VIADUCT.x1 - VIADUCT.x0 + 2) * s, h = 6.8 * s;
      ctx.fillStyle = 'rgba(40, 30, 20, 0.28)'; ctx.fillRect(a + 1.5, b + 2, w, h);
      ctx.fillStyle = '#d8c6a2'; ctx.fillRect(a, b, w, h);
      ctx.lineWidth = 1; ctx.strokeStyle = '#7d6446'; ctx.strokeRect(a, b, w, h);
      ctx.fillStyle = '#9c8566';
      for (const c of [...VIADUCT_SPANS.map(x => x - 7), VIADUCT_SPANS[VIADUCT_SPANS.length - 1] + 7]) {
        const [px, py] = S(c - 1.2, VIADUCT.z - 4.4);
        ctx.fillRect(px, py, 2.4 * s, 8.8 * s);
      }
    }
    const main = pts.slice(west, east + 1);
    line(main, Math.max(2.4, 2.3 * s), '#5a4030');
    line(main, Math.max(0.9, 0.8 * s), '#f6ead0', [4, 4]);
    ctx.setLineDash([]);
    // roofs, with a soft shadow to the south-east
    for (const b of BUILDINGS) {
      const rec = this.game.structures?.byId.get(b.id);
      const fp = rec?.fp || [6, 6], r = (b.rot || 0) * Math.PI / 180;
      const w = (fp[0] + 1) * s, d = (fp[1] + 1) * s, [a, c] = S(b.x, b.z);
      const colour = ROOF[b.model] || '#a0643c';
      ctx.save(); ctx.translate(a + 1.2 + 0.3 * s, c + 1.6 + 0.4 * s); ctx.rotate(-r);
      ctx.fillStyle = 'rgba(30, 20, 10, 0.3)'; ctx.fillRect(-w / 2, -d / 2, w, d);
      ctx.restore();
      ctx.save(); ctx.translate(a, c); ctx.rotate(-r);
      ctx.fillStyle = colour; ctx.fillRect(-w / 2, -d / 2, w, d);
      ctx.lineWidth = Math.max(0.8, 0.18 * s); ctx.strokeStyle = css(rgb(colour), 0.6); ctx.strokeRect(-w / 2, -d / 2, w, d);
      if (b.model !== 'platform' && b.model !== 'torii' && Math.min(w, d) > 4) {
        // ridge along the long side, the lit half a touch lighter
        const along = w >= d;
        ctx.fillStyle = css(mix3(rgb(colour), [255, 240, 210], 0.22));
        if (along) ctx.fillRect(-w / 2, -d / 2, w, d / 2); else ctx.fillRect(-w / 2, -d / 2, w / 2, d);
        ctx.beginPath();
        if (along) { ctx.moveTo(-w / 2, 0); ctx.lineTo(w / 2, 0); } else { ctx.moveTo(0, -d / 2); ctx.lineTo(0, d / 2); }
        ctx.strokeStyle = css(rgb(colour), 0.55); ctx.stroke();
      }
      ctx.restore();
    }
    this.paintLabels(ctx);
    this.paintCompass(ctx);
    // a soft vignette, like the edge of an old page
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.hypot(W, H) * 0.56);
    g.addColorStop(0, 'rgba(120, 80, 30, 0)'); g.addColorStop(1, 'rgba(120, 80, 30, 0.22)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  fontSize() { return clamp(Math.min(this.W, this.H) / 38, 10, 14); }

  /** Marker size unit: a little bigger on big maps and when zoomed in. */
  unit() { return clamp(Math.min(this.W, this.H) / 420, 0.9, 1.3) * clamp(Math.sqrt(VIEW.s / this.fitScale), 1, 1.35); }

  /** Screen boxes the place names should keep clear of: every marker, and Mika. */
  markerBoxes() {
    const u = this.unit(), r = 9 * u, out = [];
    const add = (p, k = 1) => { if (!p) return; const [x, y] = this.toScreen(p.x, p.z); out.push([x - r * k, y - r * k, x + r * k, y + r * k]); };
    for (const l of LAMPS) add(l.building ? BUILDINGS.find(b => b.id === l.building) : l, 0.85);
    for (const s of FALLEN_STARS) add(s);
    let targets = [];
    try { targets = this.game.director?.huntTargets?.() || []; } catch { targets = []; }
    for (const t of targets) add(this.outdoors(t.pos));
    add(this.mikaAt(), 1.1);
    // the goal pin stands above its point
    let goal = null;
    try { goal = this.outdoors(this.game.director?.markerTarget?.()); } catch { goal = null; }
    if (goal) { const [x, y] = this.toScreen(goal.x, goal.z), s = 8 * u; out.push([x - s * 0.7, y - s * 2.6, x + s * 0.7, y + s * 0.3]); }
    return out;
  }

  paintLabels(ctx) {
    const fs = this.fontSize(), marks = this.markerBoxes(), placed = [];
    const overlap = (a, b) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const l of LABELS) {
      const size = l.village ? fs * 1.3 : fs * 0.92;
      ctx.font = `${l.village ? 700 : 600} ${size.toFixed(1)}px ${this.headFont}`;
      const text = cap(tx(l.text)), w = ctx.measureText(text).width;
      const [ax, ay] = this.toScreen(l.at.x, l.at.z);
      if (ax < -80 || ax > this.W + 80 || ay < -30 || ay > this.H + 30) continue;
      // the preferred spot first, then around the place: whichever covers the fewest markers and names
      const tries = [[l.dx || 0, l.dy || 0, l.align || 'center'], [0, 1.5, 'center'], [0, -1.5, 'center'], [1.2, 0, 'left'], [-1.2, 0, 'right'], [0, 2.6, 'center'], [0, -2.6, 'center']];
      let best = null;
      for (const [dx, dy, align] of tries) {
        const x = ax + dx * size, y = ay + dy * size, left = align === 'right' ? x - w : align === 'left' ? x : x - w / 2;
        const box = [left - 2, y - size * 0.55, left + w + 2, y + size * 0.55];
        const cost = marks.reduce((a, m) => a + overlap(box, m), 0) + placed.reduce((a, b) => a + overlap(box, b) * 3, 0)
          + (box[0] < 0 || box[2] > this.W || box[1] < 0 || box[3] > this.H ? w * size * 0.5 : 0);
        if (!best || cost < best.cost - 0.5) best = { x, y, align, box, cost };
        if (cost === 0) break;
      }
      // a minor name that would sit on another name is left out (the villages come first in the list)
      if (!l.village && placed.some(b => overlap(best.box, b) > 4)) continue;
      placed.push(best.box);
      ctx.textAlign = best.align;
      ctx.lineWidth = l.village ? 4.5 : 3.4;
      ctx.strokeStyle = 'rgba(255, 249, 234, 0.92)';
      ctx.strokeText(text, best.x, best.y);
      ctx.fillStyle = l.village ? '#7a3412' : INK;
      ctx.fillText(text, best.x, best.y);
    }
    ctx.textAlign = 'center';
  }

  paintCompass(ctx) {
    const s = clamp(Math.min(this.W, this.H) / 30, 9, 14), x = s * 1.7, y = s * 2.6;
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 249, 234, 0.85)'; ctx.fill();
    ctx.lineWidth = 1.2; ctx.strokeStyle = '#8a6a45'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y - s * 0.82); ctx.lineTo(x + s * 0.3, y); ctx.lineTo(x - s * 0.3, y); ctx.closePath();
    ctx.fillStyle = MIKA; ctx.fill();
    ctx.beginPath(); ctx.moveTo(x, y + s * 0.82); ctx.lineTo(x + s * 0.3, y); ctx.lineTo(x - s * 0.3, y); ctx.closePath();
    ctx.fillStyle = '#c9b48e'; ctx.fill();
    ctx.font = `700 ${Math.round(s * 0.95)}px ${this.headFont}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255, 249, 234, 0.95)';
    ctx.strokeText(tx('N'), x, y - s * 1.55);
    ctx.fillStyle = INK; ctx.fillText(tx('N'), x, y - s * 1.55);
    ctx.restore();
  }

  /** Live markers: lamps, treasures, stars, the current goal and Mika. Also records what can be tapped. */
  drawMarkers(ctx, t) {
    const g = this.game, q = g.quest?.state, d = g.director;
    if (!q) return;
    const u = this.unit();
    const hits = [];
    const inView = (x, y, m = 12) => x > -m && y > -m && x < this.W + m && y < this.H + m;
    // Star Lamps
    for (const l of LAMPS) {
      const b = l.building ? BUILDINGS.find(x => x.id === l.building) : l;
      const [x, y] = this.toScreen(b.x, b.z);
      if (!inView(x, y)) continue;
      const lit = !!q.lamps?.[l.id];
      drawLamp(ctx, x, y, 7 * u, lit, t);
      hits.push({ key: `lamp:${l.id}`, x, y, r: 6 * u, title: tx(l.name) });
    }
    // treasures: things inside a home share its door, so group them there
    let targets = [];
    try { targets = d?.huntTargets?.() || []; } catch { targets = []; }
    const groups = new Map();
    for (const tr of targets) {
      const p = this.outdoors(tr.pos);
      if (!p) continue;
      const k = tr.inside ? `in:${tr.inside}` : `${Math.round(p.x / 2)},${Math.round(p.z / 2)}`;
      let gr = groups.get(k);
      if (!gr) groups.set(k, gr = { x: p.x, z: p.z, inside: tr.inside, items: [] });
      gr.items.push(tr);
    }
    const tHint = tr => {
      if (tr.inside) return tx('Still in {place}.', { place: tx(HOME_NAME[tr.inside] || '') });
      if (tr.id.startsWith('letter-')) return tx('Somewhere high. Only the Star Kite reaches it.');
      const h = TREASURES.find(x => x.id === HINT[tr.id]);
      return h ? tx(h.hint) : '';
    };
    for (const [k, gr] of groups) {
      const [x, y] = this.toScreen(gr.x, gr.z);
      if (!inView(x, y)) continue;
      const left = gr.items.filter(i => !i.found);
      drawChest(ctx, x, y, 9.5 * u, !left.length, left.length, t);
      const title = gr.items.length > 1 ? cap(tx(HOME_NAME[gr.inside] || gr.items[0].name)) : tx(gr.items[0].name);
      const lines = gr.items.length > 1
        ? gr.items.map(i => `${i.found ? '✓' : '○'} ${tx(i.name)}`)
        : [gr.items[0].found ? `✓ ${tx('Found')}` : tHint(gr.items[0])];
      hits.push({ key: `t:${k}`, x, y, r: 7 * u, title, lines });
    }
    // Fallen Stars
    FALLEN_STARS.forEach((s, i) => {
      const [x, y] = this.toScreen(s.x, s.z);
      if (!inView(x, y)) return;
      const found = q.stars.includes(s.id);
      drawStar(ctx, x, y, 7 * u, found, t);
      hits.push({ key: `s:${s.id}`, x, y, r: 7 * u, title: tx(s.hint), lines: [found ? `★ ${tx(STAR_POEM[i])}` : tx('Not found yet.')] });
    });
    // the current goal (shown even while a scene is queued: the map is for planning the next walk)
    let goal = null;
    try { goal = this.outdoors(d?.markerTarget?.()); } catch { goal = null; }
    const edge = (x, y, colour) => {
      const m = 14, cx = this.W / 2, cy = this.H / 2, dx = x - cx, dy = y - cy;
      const k = Math.min((cx - m) / Math.abs(dx || 1e-6), (cy - m) / Math.abs(dy || 1e-6));
      drawEdge(ctx, cx + dx * k, cy + dy * k, Math.atan2(dy, dx), colour);
    };
    if (goal) {
      const [x, y] = this.toScreen(goal.x, goal.z);
      if (x > 8 && x < this.W - 8 && y > 22 * u && y < this.H - 4) {
        drawPin(ctx, x, y, 8 * u, t);
        const obj = document.getElementById('objText')?.textContent?.trim();
        hits.push({ key: 'goal', x, y: y - 12 * u, r: 9 * u, title: tx('Current goal'), lines: [obj] });
      } else edge(x, y, '#f29a1a');
    }
    // Mika
    const m = this.mikaAt();
    const [mx, my] = this.toScreen(m.x, m.z);
    if (inView(mx, my, 0)) {
      drawMika(ctx, mx, my, 7 * u, g.player.facing || 0, t, !!m.inside);
      hits.push({ key: 'mika', x: mx, y: my, r: 8 * u, title: tx('Mika'), lines: [m.inside && HOME_NAME[m.inside] ? cap(tx(HOME_NAME[m.inside])) : ''] });
    } else edge(mx, my, MIKA);
    this.hits = hits;
    // an open label follows its marker while the map glides
    if (this.tipFor) { const h = hits.find(x => x.key === this.tipFor); if (h) this.showTip(h); else this.hideTip(); }
  }
}
