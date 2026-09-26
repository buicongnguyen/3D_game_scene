// Pure 2D/3D Catmull-Rom polylines with arc-length lookup and nearest-point queries.
// Used for the river, the railway and paths. No three.js dependency so Node tests can use it.

function cr(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

export class Spline {
  /** points: [[x, z] or [x, z, y]], sampled every `step` metres. */
  constructor(points, step = 1) {
    this.dims = points[0].length;
    const pts = [];
    const n = points.length;
    for (let i = 0; i < n - 1; i++) {
      const p0 = points[Math.max(i - 1, 0)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(i + 2, n - 1)];
      const seg = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      const count = Math.max(2, Math.ceil(seg / step));
      for (let k = 0; k < count; k++) {
        const t = k / count;
        const q = [];
        for (let d = 0; d < this.dims; d++) q.push(cr(p0[d], p1[d], p2[d], p3[d], t));
        pts.push(q);
      }
    }
    pts.push([...points[n - 1]]);
    this.pts = pts;
    this.len = [0];
    for (let i = 1; i < pts.length; i++) {
      this.len.push(this.len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    }
    this.length = this.len[this.len.length - 1];
    // uniform grid of segment indices for fast nearest queries
    this.cell = 16;
    this.grid = new Map();
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const x0 = Math.floor(Math.min(ax, bx) / this.cell), x1 = Math.floor(Math.max(ax, bx) / this.cell);
      const z0 = Math.floor(Math.min(az, bz) / this.cell), z1 = Math.floor(Math.max(az, bz) / this.cell);
      for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) {
        const key = gx * 73856093 ^ gz * 19349663;
        let list = this.grid.get(key);
        if (!list) this.grid.set(key, list = []);
        list.push(i);
      }
    }
  }

  /** Point at arc length s (clamped): {x, z, y?, tx, tz} with unit tangent. */
  at(s) {
    s = Math.max(0, Math.min(this.length, s));
    let lo = 0, hi = this.len.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.len[mid] <= s) lo = mid; else hi = mid;
    }
    const a = this.pts[lo], b = this.pts[hi];
    const segLen = this.len[hi] - this.len[lo] || 1;
    const t = (s - this.len[lo]) / segLen;
    const out = {
      x: a[0] + (b[0] - a[0]) * t,
      z: a[1] + (b[1] - a[1]) * t,
      tx: (b[0] - a[0]) / segLen,
      tz: (b[1] - a[1]) / segLen,
    };
    if (this.dims > 2) out.y = a[2] + (b[2] - a[2]) * t;
    return out;
  }

  /** Nearest point to (x, z): {d, s, x, z, y?, tx, tz, side} (side > 0 = left of travel direction). */
  nearest(x, z, maxDist = Infinity) {
    const c = this.cell;
    const r = Math.min(Math.ceil(maxDist / c), 64);
    const gx = Math.floor(x / c), gz = Math.floor(z / c);
    let best = null;
    const test = i => {
      const [ax, az] = this.pts[i], [bx, bz] = this.pts[i + 1];
      const dx = bx - ax, dz = bz - az;
      const l2 = dx * dx + dz * dz || 1e-9;
      let t = ((x - ax) * dx + (z - az) * dz) / l2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = ax + dx * t, pz = az + dz * t;
      const d = Math.hypot(x - px, z - pz);
      if (!best || d < best.d) best = { d, i, t, px, pz };
    };
    if (Number.isFinite(maxDist)) {
      const seen = new Set();
      for (let ix = gx - r; ix <= gx + r; ix++) for (let iz = gz - r; iz <= gz + r; iz++) {
        const list = this.grid.get(ix * 73856093 ^ iz * 19349663);
        if (!list) continue;
        for (const i of list) if (!seen.has(i)) { seen.add(i); test(i); }
      }
      if (!best || best.d > maxDist) return null;
    } else {
      for (let i = 0; i < this.pts.length - 1; i++) test(i);
    }
    const a = this.pts[best.i], b = this.pts[best.i + 1];
    const segLen = this.len[best.i + 1] - this.len[best.i] || 1;
    const tx = (b[0] - a[0]) / segLen, tz = (b[1] - a[1]) / segLen;
    const out = {
      d: best.d, s: this.len[best.i] + segLen * best.t, x: best.px, z: best.pz, tx, tz,
      side: Math.sign(tx * (z - best.pz) - tz * (x - best.px)),
    };
    if (this.dims > 2) out.y = a[2] + (b[2] - a[2]) * best.t;
    return out;
  }
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export function smoothstep(a, b, v) {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

// Deterministic PRNG (mulberry32).
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Smooth value noise (deterministic), 2D.
const PERM = (() => {
  const r = rng(1337), p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  return new Uint8Array([...p, ...p]);
})();
const GRAD = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
export function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const X = xi & 255, Y = yi & 255;
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
  const g = (h, dx, dy) => { const v = GRAD[h & 7]; return v[0] * dx + v[1] * dy; };
  const aa = PERM[PERM[X] + Y], ab = PERM[PERM[X] + Y + 1], ba = PERM[PERM[X + 1] + Y], bb = PERM[PERM[X + 1] + Y + 1];
  const u = fade(xf), v = fade(yf);
  const x1 = lerp(g(aa, xf, yf), g(ba, xf - 1, yf), u);
  const x2 = lerp(g(ab, xf, yf - 1), g(bb, xf - 1, yf - 1), u);
  return lerp(x1, x2, v) * 0.7071;
}
export function fbm(x, y, oct = 4) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += a * noise2(x * f, y * f); f *= 2.03; a *= 0.5; }
  return s;
}
