// PLAY ZONES (docs/PLAY-ZONES-PLAN.md): a mini game opened from the title builds only its own corner of the valley.
//
// A zone is a circle { x, z, r } around the game's place (zone-shape.js). Inside it every builder makes exactly what
// the full valley makes (they are all deterministic); outside it the valley is only suggested: the hills and mountains
// at a coarse step under fog, no buildings, trees or people. This file holds the pure parts (Node-testable).
import { HeightGrid, rawHeight } from './heightfield.js';
import { TERRAIN, BUILDINGS, LAMPS, rail } from './layout.js';
import { smoothstep, lerp } from '../engine/spline.js';
import { outside, inZone, touchesZone } from './zone-shape.js';
import { ARCHITECTURE, CHARACTERS } from '../content/models.js';

export { outside, inZone, touchesZone, zoneFromParam } from './zone-shape.js';

/** Grid step of the far landscape outside a zone (metres). */
export const COARSE_STEP = 12;
/** Width of the band where the exact ground eases into the far landscape (metres). */
export const BLEND = 18;
/** How far past a zone's edge things are still built: what shows through the fog at the edge (metres). */
export const VIEW_MARGIN = 24;
/** Railway models: built when the line runs within the zone (plus the view margin). */
export const RAIL_MODELS = ['viaduct-span', 'viaduct-abutment', 'viaduct-broken', 'viaduct-repair', 'lamp-viaduct', 'sleeper', 'kobo', 'coach', 'tunnel-portal'];

/**
 * The haze of a zone (FogExp2 density): about 60 % at the edge of what is built (the zone plus the view margin), over
 * 80 % at twice the radius, so the empty valley beyond reads as distance, not as an edge. zone.fog scales it.
 */
export const zoneFog = zone => (zone.fog ?? 1) / (zone.r + VIEW_MARGIN);
/** The soft wall: Mika is eased back from this far inside the zone's edge (metres). */
export const WALL_IN = 5;

/**
 * One frame of the soft wall, in place on `pos` and `vel` ({x, z}): inside (zone.r - WALL_IN) nothing happens; past it
 * the outward part of her speed is taken away and she is eased back toward the middle, harder the further she went;
 * she never gets past (zone.r - 1). -> true when the wall acted (the caller may say why)
 */
export function wallStep(zone, pos, vel, dt) {
  const dx = pos.x - zone.x, dz = pos.z - zone.z, d = Math.hypot(dx, dz), edge = zone.r - WALL_IN;
  if (d <= edge || d === 0) return false;
  const nx = dx / d, nz = dz / d;
  const out = vel.x * nx + vel.z * nz;
  if (out > 0) { vel.x -= nx * out; vel.z -= nz * out; }
  const over = d - edge, back = Math.min(over, (1.5 + 2.5 * over) * dt);
  let to = d - back;
  if (to > zone.r - 1) to = zone.r - 1;
  pos.x = zone.x + nx * to; pos.z = zone.z + nz * to;
  return true;
}

/**
 * The trees, bushes, rocks and flowers a zone keeps: those inside it (plus the margin), and the far forests on the rim
 * unless a baked far view already shows them (`far` false).
 */
export function zonePlaced(placed, zone, margin = VIEW_MARGIN, far = true) {
  const keep = o => inZone(zone, o.x, o.z, margin);
  const out = {};
  for (const [k, list] of Object.entries(placed)) out[k] = list.filter(o => (far && k === 'trees' && o.far) || keep(o));
  return out;
}

/**
 * The models a zone loads, out of the valley's boot list: buildings and lamps only where one stands in or near the
 * zone, the railway's only where the line passes. Anything else asked for becomes a placeholder box, which the zone
 * build removes when it lies outside (tests/zone-browser.mjs fails on a placeholder inside a zone).
 */
export function zoneModels(zone, boot, margin = VIEW_MARGIN) {
  const near = new Set();
  for (const b of [...BUILDINGS, ...LAMPS]) if (b.model && touchesZone(zone, b.x, b.z, 16, margin)) near.add(b.model);
  const r = rail.nearest(zone.x, zone.z, zone.r + margin + 40);
  const railNear = !!r && r.d <= zone.r + margin;
  const keep = n => (ARCHITECTURE.includes(n) ? near.has(n) : RAIL_MODELS.includes(n) ? railNear : !LAZY_MODELS.includes(n));
  return [...new Set([...boot.filter(keep), ...(zone.models || [])])];
}

/**
 * People and animals a zone does not load up front: every one of them is an NPC (actors/npc.js), which in a zone
 * fetches its model when it first comes into view. Mika, Tamo and the small pooled critters stay in the boot list.
 */
export const LAZY_MODELS = [...CHARACTERS.filter(n => n !== 'mika' && n !== 'tamo'),
  'fox', 'bear', 'sheep', 'chicken', 'crow', 'rabbit', 'crab', 'fish-trout', 'fish-koi', 'fish-starfin', 'cat', 'duck', 'deer', 'cow', 'pig', 'goat', 'dog'];

/**
 * The height function a zone's grid is baked from: the exact terrain (rawHeight) out to the zone's edge, the coarse
 * far landscape beyond the blend band, eased between the two so nothing steps. Away from the zone this costs a grid
 * lookup instead of the river and railway distance tests that make rawHeight expensive.
 */
export function zoneHeightFn(zone, coarse = new HeightGrid(COARSE_STEP, TERRAIN)) {
  return (x, z, step) => {
    const d = outside(zone, x, z);
    if (d <= 0) return rawHeight(x, z, step);
    const far = coarse.meshHeightAt(x, z);
    if (d >= BLEND) return far;
    return lerp(rawHeight(x, z, step), far, smoothstep(0, BLEND, d));
  };
}
