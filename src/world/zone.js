// PLAY ZONES (docs/PLAY-ZONES-PLAN.md): a mini game opened from the title builds only its own corner of the valley.
//
// A zone is a circle { x, z, r } around the game's place (zone-shape.js). Inside it every builder makes exactly what
// the full valley makes (they are all deterministic); outside it the valley is only suggested: the hills and mountains
// at a coarse step under fog, no buildings, trees or people. This file holds the pure parts (Node-testable).
import { HeightGrid, rawHeight } from './heightfield.js';
import { TERRAIN, BUILDINGS, LAMPS, rail } from './layout.js';
import { smoothstep, lerp } from '../engine/spline.js';
import { outside, inZone, touchesZone } from './zone-shape.js';
import { ARCHITECTURE } from '../content/models.js';

export { outside, inZone, touchesZone, zoneFromParam } from './zone-shape.js';

/** Grid step of the far landscape outside a zone (metres). */
export const COARSE_STEP = 12;
/** Width of the band where the exact ground eases into the far landscape (metres). */
export const BLEND = 18;
/** How far past a zone's edge things are still built: what shows through the fog at the edge (metres). */
export const VIEW_MARGIN = 24;
/** Railway models: built when the line runs within the zone (plus the view margin). */
export const RAIL_MODELS = ['viaduct-span', 'viaduct-abutment', 'viaduct-broken', 'viaduct-repair', 'lamp-viaduct', 'sleeper', 'kobo', 'coach', 'tunnel-portal'];

/** The trees, bushes, rocks and flowers a zone keeps: those inside it (plus the view margin), and the far forests on the rim. */
export function zonePlaced(placed, zone, margin = VIEW_MARGIN) {
  const keep = o => inZone(zone, o.x, o.z, margin);
  const out = {};
  for (const [k, list] of Object.entries(placed)) out[k] = list.filter(o => (k === 'trees' && o.far) || keep(o));
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
  return boot.filter(n => (ARCHITECTURE.includes(n) ? near.has(n) : RAIL_MODELS.includes(n) ? railNear : true));
}

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
