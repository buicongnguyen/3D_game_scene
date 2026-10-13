// What grows in the field grid west of Kawabe, and the festival lights strung round it. Pure data and maths over
// layout.js PADDIES (no three.js): read by paddies.js, checked by tests/signs.test.mjs.
import { PADDIES } from './layout.js';

/** Plots that are dry vegetable beds (leafy greens and radish in rows). */
export const VEG_BEDS = new Set(['paddy03', 'paddy12', 'paddy23']);
/**
 * The wheat field: two dry plots side by side on the top terrace, where the water is hardest to hold. Winter wheat is
 * sown in autumn, waits small and green under the snow, shoots up in spring and is golden in early summer, when the
 * rice beside it is deep green. Every plot that is neither wheat nor a vegetable bed is a flooded rice paddy.
 */
export const WHEAT_FIELDS = new Set(['paddy21', 'paddy22']);
/** Rice paddies already cut in autumn (stubble, with the sheaves drying on racks); the others stand golden until winter. */
export const CUT_IN_AUTUMN = new Set(['paddy02', 'paddy11', 'paddy20']);

/** What grows in a plot: 'rice' (flooded), 'wheat' or 'veg' (both dry). */
export const cropOf = id => (VEG_BEDS.has(id) ? 'veg' : WHEAT_FIELDS.has(id) ? 'wheat' : 'rice');
/** Does the plot hold water? Only the rice paddies do (frogs, dragonflies and the big fireflies keep to them). */
export const isFlooded = id => cropOf(id) === 'rice';

/**
 * The farming year of the two grains, season by season: what stands in the field (paddies.js draws exactly this).
 *   rice   spring: seedlings just transplanted into mirror water; summer: dense deep-green tillers; autumn: golden,
 *          the heads bending (and some plots cut, their sheaves drying on racks); winter: stubble in drained mud.
 *   wheat  autumn: just sown, the first green needles in the drill rows; winter: small tufts waiting under the snow;
 *          spring: tall, green and in ear; summer: golden, ready to cut.
 */
export const FIELD_YEAR = {
  rice: { spring: 'seedling', summer: 'green', autumn: 'golden', winter: 'stubble' },
  wheat: { spring: 'green', summer: 'golden', autumn: 'sprout', winter: 'sprout' },
};

/** Festival colours of the paper lanterns and fairy lights: red, amber, green, blue, pink. */
export const LIGHT_COLOURS = ['#ff4638', '#ffae1f', '#4fd45c', '#3fa2ff', '#ff6fbd'];

export const POST_H = 1.18;      // lantern posts stand this far above the plot's water level
export const BULBS = 5;          // fairy lights per span of string (the full count)
const SAG = 0.3;                 // how far a string hangs at mid-span

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/**
 * How densely the fields are planted and lit for a quality tier (engine/renderer.js QUALITY, or any object with the
 * same keys). Every key is optional; without them a tier gets what it always got (Low: rice and vegetables a little
 * wider apart; every tier: all the lights).
 *   cropDensity  plants per square metre against the full field, 0.15 .. 1 (Low today is about 0.6)
 *   fieldLights  0 .. 1: the share of fairy lights on each string (1 = 5 a span); 0 = no posts, lanterns or strings
 *   riceEars     false leaves out the grain heads of summer and autumn (a draw call a plot and 16 triangles a plant)
 *   fieldLightGeometry  'full' (104 triangles a light) or 'light' (the small fairy lights in 24); Low takes 'light'
 *   detail       0 .. 1: one dial for a tier that sets none of the above (0 = sparsest, 1 = full)
 * Returns { riceStepX, riceStepZ, vegSpacing, wheatStepX, wheatStepZ, broad, bulbs, lights, ears, lightGeometry };
 * broad: how much wider a plant is drawn where the field is planted wider apart (so the summer rice still closes up).
 */
export function fieldOptions(quality = {}) {
  const q = quality || {}, detail = Number.isFinite(q.detail) ? clamp(q.detail, 0, 1) : null;
  const density = Number.isFinite(q.cropDensity) ? clamp(q.cropDensity, 0.15, 1) : detail !== null ? 0.35 + 0.65 * detail : null;
  const low = q.name === 'Low';
  // metres between plants; a density spreads them evenly in both directions
  const k = density === null ? 1 : 1 / Math.sqrt(density);
  const steps = density === null ? (low ? [0.8, 0.75, 0.9] : [0.62, 0.58, 0.62]) : [0.62 * k, 0.58 * k, 0.62 * k];
  const share = Number.isFinite(q.fieldLights) ? clamp(q.fieldLights, 0, 1) : detail !== null ? 0.4 + 0.6 * detail : 1;
  return {
    riceStepX: steps[0], riceStepZ: steps[1], vegSpacing: steps[2],
    wheatStepX: 0.45 * steps[0] / 0.62, wheatStepZ: 0.4 * steps[1] / 0.58, broad: Math.min(1.6, steps[0] / 0.62),
    lights: share > 0, bulbs: share > 0 ? Math.max(1, Math.round(BULBS * share)) : 0,
    ears: q.riceEars !== false,
    lightGeometry: q.fieldLightGeometry === 'full' || q.fieldLightGeometry === 'light' ? q.fieldLightGeometry : (detail !== null ? detail < 0.5 : low) ? 'light' : 'full',
  };
}

/** Rows of a vegetable bed: [{ x, z0, z1 }] ridges running north-south, and where the plants stand on them. */
export function bedRows(p, spacing = 0.62) {
  const n = 7, rows = [];
  for (let k = 0; k < n; k++) {
    const x = p.x - p.w / 2 + 0.95 + k * (p.w - 1.9) / (n - 1);
    const plants = [];
    for (let z = p.z - p.d / 2 + 0.95; z <= p.z + p.d / 2 - 0.9; z += spacing) plants.push(z);
    rows.push({ x, z0: p.z - p.d / 2 + 0.6, z1: p.z + p.d / 2 - 0.6, kind: k % 2 ? 'radish' : 'leafy', plants });
  }
  return rows;
}

/**
 * Where the wheat stands: drill rows running north-south, [{ x, plants: [z...] }]. stepX: metres between rows,
 * stepZ: between the tufts of a row (a quality tier sows wider apart and draws each tuft a little broader).
 */
export function wheatRows(p, stepX = 0.45, stepZ = 0.4) {
  const rows = [], n = Math.max(2, Math.round((p.w - 1.5) / stepX));
  for (let k = 0; k <= n; k++) {
    const x = p.x - p.w / 2 + 0.75 + k * (p.w - 1.5) / n, plants = [];
    for (let z = p.z - p.d / 2 + 0.8; z <= p.z + p.d / 2 - 0.75; z += stepZ) plants.push(z);
    rows.push({ x, plants });
  }
  return rows;
}

/**
 * The drying racks of a cut paddy (Japanese hasagake: a pole on crossed legs, the sheaves hung astride it, heads
 * down) and the bundles stood up on the stubble to dry, as in Vietnam. Pure: { racks: [{ x, z, len, sheaves }], stooks: [[x, z]] }.
 * Racks run east-west, well inside the bund.
 */
export function dryingRacks(p) {
  const len = Math.min(5.4, p.w - 3.4), sheaves = Math.round(len / 0.38);
  return {
    racks: [{ x: p.x - 0.7, z: p.z - p.d * 0.22, len, sheaves }, { x: p.x + 0.8, z: p.z + p.d * 0.2, len, sheaves }],
    stooks: [[p.x + p.w * 0.36, p.z - p.d * 0.3], [p.x + p.w * 0.31, p.z - p.d * 0.36], [p.x - p.w * 0.37, p.z + p.d * 0.33], [p.x - p.w * 0.3, p.z + p.d * 0.38], [p.x - p.w * 0.36, p.z + p.d * 0.02]],
  };
}

/**
 * The lights of every plot: a lantern post on each corner of the bund, and along the west and east bunds a string of
 * fairy lights carried by a middle post. North and south sides stay open, so walking into a plot never meets a string.
 * heightAt(x, z): the ground, where known (posts then stand on it). Returns { posts: [{ x, y, z, h }], lanterns: [{ x, y, z, c, big }], wires: [[ax, ay, az, bx, by, bz]] } where c
 * indexes LIGHT_COLOURS. bulbs: fairy lights per span of string (fieldOptions; fewer on a small phone).
 */
export function fieldLights(paddies = PADDIES, heightAt = null, { bulbs = BULBS } = {}) {
  const posts = [], lanterns = [], wires = [];
  paddies.forEach((p, n) => {
    for (const sx of [-1, 1]) {
      const x = p.x + sx * p.w / 2;
      const zs = [p.z - p.d / 2, p.z, p.z + p.d / 2];
      // the hillside's foot lies over the uphill bund of some plots: posts stand on whatever is on top
      const tops = zs.map((z, k) => {
        const y = Math.max(p.t + 0.2, heightAt ? heightAt(x, z) - 0.05 : 0), top = y + POST_H - 0.2;
        posts.push({ x, y, z, h: (k === 1 ? top - 0.12 : top) - y });
        if (k !== 1) lanterns.push({ x, y: top + 0.2, z, c: (n + k + (sx > 0 ? 1 : 0)) % LIGHT_COLOURS.length, big: true });
        return top;
      });
      for (let s = 0; s < 2; s++) {
        const za = zs[s], zb = zs[s + 1], ya = tops[s] - 0.1, yb = tops[s + 1] - 0.1;
        const at = t => [x, ya + (yb - ya) * t - SAG * 4 * t * (1 - t), za + (zb - za) * t];
        for (let k = 0; k < 4; k++) wires.push([...at(k / 4), ...at((k + 1) / 4)]);
        for (let k = 0; k < bulbs; k++) {
          const [bx, by, bz] = at((k + 0.5) / bulbs);
          lanterns.push({ x: bx, y: by - 0.09, z: bz, c: (n * 2 + s * bulbs + k + (sx > 0 ? 2 : 0)) % LIGHT_COLOURS.length, big: false });
        }
      }
    }
  });
  return { posts, lanterns, wires };
}

/** How brightly the lights burn for the sky's night value (0 day .. 1 night): off by day, on from dusk. */
export function lightGlow(night) {
  const t = Math.min(1, Math.max(0, (night - 0.08) / 0.5));
  return t * t * (3 - 2 * t);
}
