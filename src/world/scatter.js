// Deterministic vegetation & rock placement (pure; Node-testable). Returns plain records.
import { rng, fbm, smoothstep } from '../engine/spline.js';
import { river, riverHalfWidth, rail, BUILDINGS, CLEARINGS, ORCHARD, TERRAIN, PLACES } from './layout.js';

export const DECIDUOUS = new Set(['tree-broadleaf-a', 'tree-broadleaf-b', 'tree-maple', 'tree-sakura', 'tree-peach', 'tree-chestnut']);

const REGIONS = [
  // name, test(x, z) -> weight, species mix
  { name: 'kawabe', w: (x, z) => 1 - smoothstep(60, 110, Math.hypot(x + 45, z - 20)), mix: { 'tree-sakura': 3.5, 'tree-broadleaf-a': 3, 'tree-maple': 2, 'tree-pine': 1.2 } },
  { name: 'north', w: (x, z) => smoothstep(-80, -110, z), mix: { 'tree-cedar': 3, 'tree-maple': 3, 'tree-broadleaf-b': 2.5, 'tree-chestnut': 1.2, 'tree-broadleaf-a': 1 } },
  { name: 'west', w: (x, z) => smoothstep(-95, -140, x), mix: { 'tree-pine': 3, 'tree-broadleaf-a': 3, 'tree-cedar': 2, 'tree-sakura': 0.8 } },
  { name: 'east', w: (x, z) => smoothstep(140, 165, x), mix: { 'tree-broadleaf-b': 3, 'tree-cedar': 3, 'tree-sakura': 1.2 } },
  { name: 'takamori', w: (x, z) => 1 - smoothstep(45, 90, Math.hypot(x - 115, z - 8)), mix: { 'tree-sakura': 3, 'tree-broadleaf-b': 3, 'tree-maple': 1 } },
  { name: 'gorge', w: (x, z) => smoothstep(95, 130, z), mix: { 'tree-pine': 4, 'tree-broadleaf-a': 2, 'tree-maple': 1 } },
  { name: 'meadow', w: () => 0.25, mix: { 'tree-broadleaf-a': 3, 'tree-broadleaf-b': 2, 'tree-sakura': 1 } },
];

function pick(mix, r) {
  let total = 0;
  for (const k in mix) total += mix[k];
  let x = r * total;
  for (const k in mix) { x -= mix[k]; if (x <= 0) return k; }
  return Object.keys(mix)[0];
}

function rimR(x, z) {
  const u = x / 196, v = (z + 15) / 206;
  return Math.sqrt(Math.sqrt(u ** 4 + v ** 4));
}

/** Forest density 0..1 at (x, z). */
export function forestDensity(x, z) {
  let d = 0.05;
  d = Math.max(d, 0.8 * smoothstep(-85, -115, z));             // northern forest
  d = Math.max(d, 0.62 * smoothstep(-100, -150, x));           // western foothills
  d = Math.max(d, 0.55 * smoothstep(145, 170, x));             // eastern hills
  d = Math.max(d, 0.5 * smoothstep(128, 150, z));              // southern gorge
  const r = rimR(x, z);
  d = Math.max(d, 0.75 * smoothstep(0.86, 0.96, r) * (1 - smoothstep(1.3, 1.5, r)));
  // groves and glades
  d *= 0.45 + 1.0 * smoothstep(-0.25, 0.3, fbm(x / 55 + 4, z / 55 - 8));
  return Math.min(1, d);
}

function nearBuilding(x, z, pad) {
  for (const b of BUILDINGS) if (Math.hypot(x - b.x, z - b.z) < pad + 8) return true;
  return false;
}

/**
 * isFree(x, z) -> boolean supplied by the caller (paths/splat/slope/height). heightAt(x, z) for y.
 * Returns { trees: [{model, x, y, z, rot, s}], rocks, bushes, flowers, reeds }.
 */
export function scatter(heightAt, isFree, density = 1) {
  const R = rng(20260926);
  const trees = [], rocks = [], bushes = [], flowers = [], reeds = [], lilies = [];
  const blockedByLayout = (x, z, pad = 0) => {
    for (const [cx, cz, cr] of CLEARINGS) if (Math.hypot(x - cx, z - cz) < cr + pad) return true;
    if (nearBuilding(x, z, pad)) return true;
    const r = rail.nearest(x, z, 12);
    if (r && r.d < 7 + pad) return true;
    const w = river.nearest(x, z, 40);
    if (w && w.d < riverHalfWidth(w.z) + 3 + pad) return true;
    return false;
  };
  // trees on a jittered grid
  const step = 6.2 / Math.sqrt(Math.max(0.35, density));
  for (let z = TERRAIN.minZ + 20; z < TERRAIN.maxZ - 20; z += step) {
    for (let x = TERRAIN.minX + 20; x < TERRAIN.maxX - 20; x += step) {
      const jx = x + (R() - 0.5) * step * 0.9, jz = z + (R() - 0.5) * step * 0.9;
      const p = forestDensity(jx, jz);
      const roll = R();
      if (roll > p) continue;
      const y = heightAt(jx, jz);
      if (y < 0.9 || y > 175) continue;
      const far = rimR(jx, jz) > 0.97;
      if (!far && (!isFree(jx, jz) || blockedByLayout(jx, jz))) continue;
      let mix = null, best = -1;
      for (const reg of REGIONS) { const w = reg.w(jx, jz); if (w > best) { best = w; mix = reg.mix; } }
      if (far) mix = { 'tree-cedar': 3, 'tree-pine': 1.5, 'tree-broadleaf-b': 1 };
      const model = pick(mix, R());
      trees.push({ model, x: jx, y, z: jz, rot: R() * 360, s: 0.8 + R() * 0.45 + (far ? 0.25 : 0), far });
    }
  }
  // orchard
  for (let x = ORCHARD.x0; x <= ORCHARD.x1; x += ORCHARD.spacing) {
    for (let z = ORCHARD.z0; z <= ORCHARD.z1; z += ORCHARD.spacing) {
      const jx = x + (R() - 0.5) * 1.2, jz = z + (R() - 0.5) * 1.2;
      if (!isFree(jx, jz)) continue;
      trees.push({ model: 'tree-peach', x: jx, y: heightAt(jx, jz), z: jz, rot: R() * 360, s: 0.95 + R() * 0.15, orchard: true });
    }
  }
  // story chestnut trees along the forest trail
  for (const [x, z] of [[78, -104], [91, -118], [70, -97], [96, -106]]) {
    trees.push({ model: 'tree-chestnut', x, y: heightAt(x, z), z, rot: R() * 360, s: 1.05, story: 'chestnut' });
  }
  // bushes, rocks, flowers, reeds
  for (let i = 0; i < 5200 * density; i++) {
    const x = TERRAIN.minX + 60 + R() * (TERRAIN.maxX - TERRAIN.minX - 120);
    const z = TERRAIN.minZ + 60 + R() * (TERRAIN.maxZ - TERRAIN.minZ - 120);
    if (rimR(x, z) > 0.95) continue;
    const y = heightAt(x, z);
    const kind = R();
    const w = river.nearest(x, z, 30);
    const shoreD = w ? w.d - riverHalfWidth(w.z) : 99;
    if (shoreD > -1.5 && shoreD < 3.5 && y > -0.35 && y < 0.9) {
      if (!blockedByLayout(x, z, -8)) reeds.push({ model: 'reeds', x, y: Math.max(y, -0.2), z, rot: R() * 360, s: 0.8 + R() * 0.5 });
      continue;
    }
    if (y < 1 || !isFree(x, z)) continue;
    if (blockedByLayout(x, z, -4)) continue;
    const forest = forestDensity(x, z);
    if (kind < 0.18) { const s = 0.55 + R() * 0.9; rocks.push({ model: ['rock-a', 'rock-b', 'rock-c'][Math.floor(R() * 3)], x, y: y - 0.2 * s, z, rot: R() * 360, s, sy: 0.55 + R() * 0.25 }); }
    else if (kind < 0.45) bushes.push({ model: R() < 0.8 ? (R() < 0.5 ? 'bush-a' : 'bush-b') : 'hydrangea', x, y, z, rot: R() * 360, s: 0.8 + R() * 0.6 });
    else if (forest < 0.4) flowers.push({ model: R() < 0.55 ? 'flowers-a' : 'flowers-b', x, y, z, rot: R() * 360, s: 0.8 + R() * 0.5 });
  }
  // lily pads in calm water near the banks
  for (let i = 0; i < 260; i++) {
    const s = R() * river.length;
    const p = river.at(s);
    if (p.z < -200 || p.z > 180) continue;
    const side = R() < 0.5 ? -1 : 1;
    const off = riverHalfWidth(p.z) - 1.5 - R() * 2.5;
    const x = p.x - p.tz * off * side, z = p.z + p.tx * off * side;
    if (Math.hypot(x - PLACES.millIsland.x, z - PLACES.millIsland.z) < 7) continue;
    if (Math.abs(z + 112) < 5 || Math.abs(z - 30) < 6) continue;
    lilies.push({ model: 'lilypads', x, y: 0.02, z, rot: R() * 360, s: 0.7 + R() * 0.6 });
  }
  return { trees, rocks, bushes, flowers, reeds, lilies };
}
