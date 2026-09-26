// Terrain height: an analytic function of the layout (pure, Node-testable) baked into a grid that
// both the terrain mesh and the character controller sample, so feet land exactly on the drawn ground.

import { river, riverHalfWidth, bankWidth, rail, RAIL_Y, SHAPES, POST_SHAPES, TERRAIN, VIADUCT, RAIL_PORTALS } from './layout.js';
import { smoothstep, lerp, fbm, clamp } from '../engine/spline.js';

function applyShape(h, s, x, z) {
  if (s.kind === 'rect') {
    const dx = Math.abs(x - s.x) - s.hw, dz = Math.abs(z - s.z) - s.hd;
    const d = Math.max(dx, dz);
    if (d >= s.f) return h;
    const w = 1 - smoothstep(0, s.f, d);
    return lerp(h, s.t, w);
  }
  if (s.kind === 'disc') {
    const d = Math.hypot(x - s.x, z - s.z);
    if (d >= s.r + s.f) return h;
    const w = 1 - smoothstep(s.r, s.r + s.f, d);
    if (s.onlyBelow && h >= s.t) return h;
    return lerp(h, s.t, w);
  }
  // ramp: project onto segment a->b
  const dx = s.bx - s.ax, dz = s.bz - s.az, l2 = dx * dx + dz * dz;
  let t = ((x - s.ax) * dx + (z - s.az) * dz) / l2;
  const tc = clamp(t, 0, 1);
  const px = s.ax + dx * tc, pz = s.az + dz * tc;
  const d = Math.hypot(x - px, z - pz) + Math.max(0, Math.abs(t - tc) * Math.sqrt(l2));
  if (d >= s.w + s.f) return h;
  const target = lerp(s.ha, s.hb, tc);
  if (s.onlyBelow && h >= target) return h;
  const w = 1 - smoothstep(s.w, s.w + s.f, d);
  return lerp(h, target, w);
}

/** Land height before the river is carved. */
export function landHeight(x, z) {
  // West terrace (~3 m) rising east to the Takamori hills (~22 m).
  let h = 3 + 19 * smoothstep(10, 94, x);
  // Forest hills to the north, gorge country to the south.
  h += 10 * smoothstep(-92, -215, z) * (0.75 + 0.5 * fbm(x / 70 + 3, z / 70));
  h = lerp(h, 15.5 + 3 * fbm(x / 50, z / 50 + 7), smoothstep(88, 112, z) * (1 - smoothstep(-130, -170, x)));
  // Western foothills rising toward the mountains behind Kawabe.
  h += 13 * smoothstep(-72, -175, x) * (0.65 + 0.5 * fbm(x / 45 - 5, z / 45));
  // Gentle rolling everywhere, plus fine lumps.
  h += 2.6 * fbm(x / 64, z / 64) + 0.55 * fbm(x / 17 + 11, z / 17 - 4);
  // Rim: forested foothills just outside the playable area, taller ridged mountains further out.
  const u = x / 196, v = (z + 15) / 206;
  const r4 = Math.sqrt(Math.sqrt(u * u * u * u + v * v * v * v)) + 0.06 * fbm(x / 45 + 20, z / 45 - 9);
  if (r4 > 0.84) {
    let rim = smoothstep(0.84, 1.12, r4) * (30 + 22 * fbm(x / 38 - 3, z / 38 + 5));
    const ridge = 1 - Math.abs(fbm(x / 110 + 7, z / 110 - 2) * 2);
    rim += smoothstep(1.08, 1.55, r4) * (70 + 95 * ridge * ridge);
    // Broad V-shaped passes where the river enters (north) and leaves (south) the bowl.
    const riverX = z < -150 ? lerp(8, 34, (z + 148) / -152) : z > 130 ? lerp(-4, -30, (z - 130) / 190) : null;
    if (riverX !== null) rim *= 1 - 0.9 * (1 - smoothstep(16, 120, Math.abs(x - riverX)));
    h += rim;
  }
  for (const s of SHAPES) h = applyShape(h, s, x, z);
  // Railway bed: embankments and cuttings, except over the viaduct (the river gorge stays open).
  const onViaduct = x > VIADUCT.x0 + 4 && x < VIADUCT.x1 - 4 && Math.abs(z - VIADUCT.z) < 14;
  if (!onViaduct) {
    const r = rail.nearest(x, z, 26);
    if (r && r.s > RAIL_PORTALS.west - 2 && r.s < RAIL_PORTALS.east + 2) {
      const bed = RAIL_Y - 0.42;
      const w = 1 - smoothstep(3.4, 3.4 + 16, r.d);
      h = lerp(h, bed, w);
    }
  }
  return h;
}

/** Full analytic height (land + carved river + post-carve features). */
export function rawHeight(x, z) {
  let h = landHeight(x, z);
  const n = river.nearest(x, z, 60);
  if (n) {
    const hw = riverHalfWidth(n.z);
    // Where the river leaves the bowl through the mountains the valley opens into a wide V,
    // instead of a slot canyon with vertical walls.
    const B = Math.min(46, bankWidth(n.z) + Math.max(0, h - 22) * 1.6);
    const bed = -2.4 + 2.62 * smoothstep(hw * 0.25, hw + 1.6, n.d);
    const land = smoothstep(hw - 1.2, hw + B, n.d);
    h = lerp(bed, Math.max(h, 0.22), land);
  }
  for (const s of POST_SHAPES) h = applyShape(h, s, x, z);
  return h;
}

/** River flow at (x, z): unit direction of travel and distance from the centreline. */
export function riverFlow(x, z) {
  const n = river.nearest(x, z, 80);
  if (!n) return null;
  return { tx: n.tx, tz: n.tz, d: n.d, hw: riverHalfWidth(n.z) };
}

/**
 * Baked height grid over TERRAIN extents. Cells are split into triangles (a,b,c) and (b,d,c)
 * exactly like the terrain mesh index buffer, so heightAt() returns the rendered surface.
 */
export class HeightGrid {
  constructor(step = 2, bounds = TERRAIN, fn = rawHeight) {
    this.step = step;
    this.x0 = bounds.minX; this.z0 = bounds.minZ;
    this.nx = Math.floor((bounds.maxX - bounds.minX) / step) + 1;
    this.nz = Math.floor((bounds.maxZ - bounds.minZ) / step) + 1;
    this.h = new Float32Array(this.nx * this.nz);
    for (let j = 0; j < this.nz; j++) {
      const z = this.z0 + j * step;
      for (let i = 0; i < this.nx; i++) this.h[j * this.nx + i] = fn(this.x0 + i * step, z);
    }
  }

  static fromArray(meta, array) {
    const g = Object.create(HeightGrid.prototype);
    Object.assign(g, meta);
    g.h = array;
    return g;
  }

  get(i, j) {
    i = i < 0 ? 0 : i >= this.nx ? this.nx - 1 : i;
    j = j < 0 ? 0 : j >= this.nz ? this.nz - 1 : j;
    return this.h[j * this.nx + i];
  }

  heightAt(x, z) {
    const fx = (x - this.x0) / this.step, fz = (z - this.z0) / this.step;
    const i = Math.floor(fx), j = Math.floor(fz);
    const u = fx - i, v = fz - j;
    const a = this.get(i, j), b = this.get(i + 1, j), c = this.get(i, j + 1), d = this.get(i + 1, j + 1);
    // triangles (a, b, c) when u + v <= 1, else (b, d, c)
    if (u + v <= 1) return a + (b - a) * u + (c - a) * v;
    return d + (c - d) * (1 - u) + (b - d) * (1 - v);
  }

  /** Surface normal (unnormalised gradient form) -> {nx, ny, nz} unit. */
  normalAt(x, z) {
    const e = this.step * 0.5;
    const dx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const dz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    const nx = -dx, ny = 2 * e, nz = -dz;
    const l = Math.hypot(nx, ny, nz);
    return { nx: nx / l, ny: ny / l, nz: nz / l };
  }

  /** Slope in degrees at (x, z). */
  slopeAt(x, z) {
    const n = this.normalAt(x, z);
    return Math.acos(clamp(n.ny, -1, 1)) * 180 / Math.PI;
  }
}
