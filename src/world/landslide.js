// The landslide scar (public/models/landslide.glb, built by build_landslide() in art/blender/railway_river.py).
// Pure (no three.js), shared by the runtime and Node tests.
//
// A 2 m terrain grid cannot trace the scar's steep walls, so the model is the visible ground in its footprint:
// this module mirrors the model's analytic ground (same formulas, same vertex lattice, same triangle split) so
//  - the terrain is shaped into the wooded spur the scar is torn out of, and sunk out of sight under the raw earth
//    (slideTerrain, applied in heightfield.js landHeight), while its edge exactly covers the model's outer rim;
//  - the height grid's heightAt() returns the model surface there, so Mika, trees and pickups stand on it.
// Keep the constants and formulas in sync with the Blender builder.

import { clamp, lerp, smoothstep, fbm } from '../engine/spline.js';

// Placement (model origin = toe of the debris lobe; uphill is -Z, i.e. Blender +Y) and the builder's constants.
// The footprint edges (x -62/-38, z -162/-180) lie on the 6 m lines shared by the 2 m and 3 m terrain grids.
export const SLIDE = {
  x: -50, z: -168, y: 7.7,
  x0: -12, x1: 12, y0: -6, y1: 12,   // footprint in model space (x right, y uphill)
  run: 12.5, rise: 9,                // the hillside rises 9 m over 12.5 m (at most ~41 deg), then a plateau
  head: 9.4, hc: 2.6,                // headscarp line at the centre; the crown arcs 2.6 m downhill at the sides
  w0: 3.0, wmax: 7.8,                // scar half-width at the chute mouth and at its widest (a spoon-shaped scar)
};
const S = SLIDE;

/** Collision shapes printed by the Blender build (LANDSLIDE_SOLIDS), model space:
 *  ['rock', x, y, r, top] | ['log', ax, ay, az, bx, by, bz, r] | ['stump', x, y, r, top]. */
export const SLIDE_SOLIDS = [
  ['rock', -2.78, 4.85, 0.7, 2.07], ['rock', -4.92, 6.17, 0.62, 3.07], ['rock', -0.18, 3.15, 1.18, 1.79],
  ['rock', 2.01, 2.42, 1.09, 1.51], ['rock', -3.09, 1.07, 0.96, 1.37], ['rock', 3.53, 6.83, 0.8, 3.47],
  ['rock', 4.31, 8.01, 0.38, 3.63], ['rock', 2.17, 6.19, 0.52, 2.61], ['rock', -0.86, 7.55, 0.61, 3.23],
  ['rock', 3.08, 0.65, 0.84, 1.51], ['rock', 2.79, -2.37, 0.83, 1.61], ['rock', 0.41, 0.36, 1.06, 1.7],
  ['rock', 0.46, -0.76, 0.95, 1.55], ['rock', -2.15, -2.17, 0.98, 1.97], ['rock', 5.2, -0.85, 0.69, 1.34],
  ['rock', -3.18, -2.47, 0.77, 1.19], ['rock', -3.32, -2.03, 0.95, 2.01], ['rock', -3.01, 0.02, 0.96, 1.47],
  ['rock', 2.07, -2.24, 1.12, 1.88], ['rock', -0.06, -2.55, 0.79, 1.47], ['log', 1.2, 8.6, 4.37, -2, 1.2, 0.78, 0.42],
  ['log', -6.2, -2.4, 0.52, 4.6, -1, 1, 0.36], ['log', 5.5, 5, 2.49, 1.8, 0.6, 0.46, 0.28], ['stump', -8.8, 8.5, 0.4, 8],
];

/** Trees and bushes that keep the spur wooded right up to the scar (its face is too steep for the scatter),
 *  model space: [model, x, y, scale, lean (deg, toward the scar)]. */
export const SLIDE_DRESSING = [
  // along the crest above the headscarp (one cedar already leaning out over the drop)
  ['tree-cedar', 3.2, 10.9, 1.0, 13], ['tree-cedar', -5.8, 11.6, 1.05, 0], ['tree-maple', 0.2, 12.9, 1.0, 0],
  ['tree-cedar', 7.4, 11.4, 1.1, 0], ['tree-cedar', -2.4, 15.6, 1.2, 0], ['tree-pine', 10.8, 14.2, 1.0, 0],
  ['tree-maple', -10.2, 13.2, 0.95, 0],
  // the flanks either side of the scar
  ['tree-cedar', -11.2, 7.2, 1.0, 0], ['tree-maple', -13.6, 2.6, 0.9, 0], ['tree-cedar', 11.6, 7.8, 1.05, 0],
  ['tree-maple', 13.8, 2.8, 0.85, 0], ['tree-cedar', 12.4, 4.4, 0.95, 0],
  ['bush-a', -9.6, 4.2, 1.0, 0], ['bush-b', 9.9, 6.0, 0.9, 0], ['bush-a', 9.4, 1.4, 0.8, 0], ['bush-b', -9.2, 9.4, 0.9, 0],
];

// ------------------------------------------------------------------ the model's ground (mirror of the builder)
const wob =(a, b, s) => 0.5 * Math.sin(a * 1.31 + b * 0.47 + s) + 0.35 * Math.sin(a * 0.53 - b * 1.19 + s * 2.3)
  + 0.15 * Math.sin((a + b) * 2.03 + s * 0.7);

/** Undisturbed hillside height above SLIDE.y at model-space y (flat in front, plateau behind). */
export function slideGround(y) {
  const t = clamp(y / S.run, 0, 1);
  return S.rise * (0.4 * t * t * (3 - 2 * t) + 0.6 * t);
}
const scarW = y => S.w0 + (S.wmax - S.w0) * Math.sin(clamp((y + 2) / 10, 0, 1) * Math.PI / 2) ** 1.3;
/** Half-width of the scar at model-space y. */
export const scarEdge = y => scarW(y) * (1 + 0.08 * wob(y * 0.55, 0, 7));
const headLine = x => S.head - S.hc * (x / S.wmax) * (x / S.wmax);

/** How deep the chute is cut below the old hillside at model-space (x, y). */
export function scarDepth(x, y) {
  const u = Math.abs(x) / scarEdge(y);
  if (u >= 1) return 0;
  let D = (0.7 + 3.1 * clamp((y + 1.5) / (S.head + 1.5), 0, 1) ** 1.2) * smoothstep(-2.5, -0.5, y);
  const hy = headLine(x);
  if (y > hy) D *= Math.max(0, 1 - (y - hy) / 0.7);
  return D * (1 - u ** 4);
}

/** Debris piled on the old ground at model-space (x, y). */
export function lobeHeight(x, y) {
  const f = Math.max(0, 1 - Math.hypot(x / 8.5, (y - 0.2) / (y < 0.2 ? 5.0 : 3.6)));
  return 1.6 * f ** 1.4 * (1 + 0.3 * wob(x * 0.45, y * 0.5, 4));
}

/** Raw earth (the model's Earth material) rather than turf at model-space (x, y). */
export const isEarth = (x, y) => scarDepth(x, y) > 0.12 || lobeHeight(x, y) > 0.12;

function analytic(x, y) {
  const d = scarDepth(x, y), lb = lobeHeight(x, y);
  const k = smoothstep(0.05, 0.5, d + lb);
  return slideGround(y) - d + lb + k * (0.16 * wob(x * 0.75, y * 0.7, 3) + 0.08 * wob(x * 1.7, y * 1.5, 9));
}

// the builder's vertex lattice (rows packed tight across the arc of the headscarp), evaluated once
const XS = [], YS = [];
for (let i = 0; i < 45; i++) XS.push(S.x0 + (S.x1 - S.x0) * i / 44);
for (let j = 0; j < 21; j++) YS.push(S.y0 + (6.2 - S.y0) * j / 20);
for (let j = 1; j < 13; j++) YS.push(6.2 + 0.35 * j);
for (let j = 1; j < 4; j++) YS.push(10.4 + (S.y1 - 10.4) * j / 3);
const NX = XS.length, DX = XS[1] - XS[0];
const H = new Float64Array(NX * YS.length);
for (let j = 0; j < YS.length; j++) for (let i = 0; i < NX; i++) H[j * NX + i] = analytic(XS[i], YS[j]);

/** Model ground height above SLIDE.y at model-space (x, y), on the model's own triangles; null outside. */
export function slideLocalHeight(x, y) {
  if (!(x >= S.x0 && x <= S.x1 && y >= S.y0 && y <= S.y1)) return null;
  const i = Math.min(NX - 2, Math.floor((x - S.x0) / DX));
  let j = 0;
  while (j < YS.length - 2 && y > YS[j + 1]) j++;
  const u = (x - XS[i]) / (XS[i + 1] - XS[i]), v = (y - YS[j]) / (YS[j + 1] - YS[j]);
  const a = j * NX + i, z00 = H[a], z10 = H[a + 1], z01 = H[a + NX], z11 = H[a + NX + 1];
  // triangles (00, 10, 11) and (00, 11, 01), as the builder makes them
  return u >= v ? z00 + (z10 - z00) * u + (z11 - z10) * v : z00 + (z11 - z01) * u + (z01 - z00) * v;
}

/** World (x, z) -> model space {x, y}. */
export const toSlide = (x, z) => ({ x: x - S.x, y: S.z - z });
/** World (x, z) of a model-space point. */
export const fromSlide = (lx, ly) => ({ x: S.x + lx, z: S.z - ly });

/** The undisturbed hillside (world y) the scar is cut into, at world (x, z) inside the footprint, else null. */
export function slideHillAt(x, z) {
  const lx = x - S.x, ly = S.z - z;
  return lx >= S.x0 && lx <= S.x1 && ly >= S.y0 && ly <= S.y1 ? S.y + slideGround(ly) : null;
}

/** The model's visible ground (world y) at world (x, z), or null outside its footprint. */
export function slideSurfaceAt(x, z) {
  const h = slideLocalHeight(x - S.x, S.z - z);
  return h === null ? null : S.y + h;
}

// ------------------------------------------------------------------ terrain shaping
const SIDE_FALL = 22;    // the spur blends back into the natural ground over this many metres either side
const FRONT_FALL = 10;   // ... in front of the lobe
const BACK_END = 44;     // the ridge runs back into the mountains and fades out by here (model y)
const MARGIN = 0.14;     // the sunk terrain stays at least this far under the raw earth

// How far linear interpolation between grid vertices `step` apart sags below the hillside, around y.
function sag(y, step) {
  let worst = 0;
  const y0 = Math.floor(y / step) * step;
  for (const a of [y0 - step, y0]) {
    const ga = slideGround(a), gb = slideGround(a + step);
    for (let k = 1; k < 12; k++) {
      const t = k / 12;
      worst = Math.max(worst, slideGround(a + step * t) - lerp(ga, gb, t));
    }
  }
  return worst;
}

// Highest the terrain may be at a grid vertex (model space) so that no grid triangle touching raw earth pokes
// through it: the lowest earth surface within reach of the vertex's triangles, minus a margin.
function sinkBound(x, y, step) {
  const R = step * Math.SQRT2 + 0.15, d = 0.25;
  let lo = Infinity;
  for (let qy = Math.max(S.y0, y - R); qy <= Math.min(S.y1, y + R); qy += d) {
    const w = Math.sqrt(Math.max(0, R * R - (qy - y) * (qy - y)));
    for (let qx = Math.max(S.x0, x - w); qx <= Math.min(S.x1, x + w); qx += d) {
      if (scarDepth(qx, qy) <= 0.02 && lobeHeight(qx, qy) <= 0.02) continue;
      const h = slideLocalHeight(qx, qy);
      if (h < lo) lo = h;
    }
  }
  return lo - MARGIN;
}

/**
 * Terrain around and under the slide (applied in landHeight): the hillside the scar is torn out of, a wooded
 * spur running back into the northern mountains, blended into the natural ground `h`; inside the model's
 * footprint the grid sinks under the chute and lobe. `step` is the height grid spacing (2 or 3 m).
 */
export function slideTerrain(h, x, z, step = 2) {
  const lx = x - S.x, ly = S.z - z;
  const dx = Math.max(0, Math.abs(lx) - S.x1), dFront = Math.max(0, S.y0 - ly);
  if (dx >= SIDE_FALL || dFront >= FRONT_FALL || ly > BACK_END + 20) return h;
  // the spur: the model's hillside (+ a little cover) whose face curves back either side of the scar into a
  // rounded nose, and a crowned ridge rising gently behind the plateau into the mountains; beyond the model the
  // face also eases off so its flanks can carry trees
  const back = 0.02 * dx * dx;
  let hill = S.y + slideGround((ly - back) * S.run / (S.run + 0.8 * dx)) + 0.08 + sag(ly, step);
  if (ly > S.y1) hill += 0.07 * (ly - S.y1) - 1.8 * smoothstep(S.y1, S.y1 + 16, ly) * (lx / 18) ** 2;
  // natural lumps, zero on the model's rim so the rim stays exactly covered
  const outside = Math.max(dx, dFront, ly - S.y1);
  if (outside > 0) hill += smoothstep(0, 6, outside) * (1.1 * fbm(x / 19 + 4, z / 19 - 1) + 0.35 * fbm(x / 6.5 - 2, z / 6.5 + 5));
  if (ly > S.y1) hill = Math.max(hill, h);
  const w = (1 - smoothstep(0, SIDE_FALL, dx)) * (1 - smoothstep(0, FRONT_FALL, dFront)) * (1 - smoothstep(BACK_END, BACK_END + 20, ly));
  let out = lerp(h, hill, w);
  // strictly inside the footprint (the rim vertices stay up and cover the model's edge)
  if (lx > S.x0 + 0.01 && lx < S.x1 - 0.01 && ly > S.y0 + 0.01 && ly < S.y1 - 0.01) out = Math.min(out, S.y + sinkBound(lx, ly, step));
  return out;
}
