// Measures the valley's rim as seen from every sky spot (content/skyspots.js) at several altitudes, from the terrain
// and the tree crowns. `node scripts/measure-horizon.mjs [--json]`. The `lift` of each spot is chosen from this table.
import { SKY_SPOTS } from '../src/content/skyspots.js';
import { sharedGrid } from '../src/world/roads.js';
import { scatter } from '../src/world/scatter.js';
import { TERRAIN } from '../src/world/layout.js';
import { horizonProfile, worstIn, clearAltitude } from '../src/content/horizon.js';

const grid = sharedGrid();
const heightAt = (x, z) => grid.heightAt(x, z);
const TREE_H = { 'tree-broadleaf-a': 8, 'tree-broadleaf-b': 8.5, 'tree-cedar': 12, 'tree-pine': 7, 'tree-maple': 5.5, 'tree-sakura': 6, 'tree-peach': 3.8, 'tree-chestnut': 7 };
const placed = scatter(heightAt, (x, z) => grid.slopeAt(x, z) < 36, 1);
const trees = placed.trees.map(t => { const h = (TREE_H[t.model] || 7) * t.s; return { x: t.x, z: t.z, top: t.y + h, r: h * 0.42 }; });
const SOUTH = [[100, 260]];            // where the low groups sit (south, and a little east and west of it)
const LEVELS = [0, 20, 40, 60, 80, 100, 120, 140, 160, 180, 200];
const inside = (x, z) => x >= TERRAIN.minX && x <= TERRAIN.maxX && z >= TERRAIN.minZ && z <= TERRAIN.maxZ;

const baseY = s => (s.on === 'deck' ? s.y : s.on === 'gallery' ? heightAt(s.x, s.z) + 11 : heightAt(s.x, s.z)) + 1.5;
const rows = [];
for (const s of SKY_SPOTS) {
  const y0 = baseY(s), row = { id: s.id, y0: +y0.toFixed(1), at: {} };
  for (const a of LEVELS) {
    const prof = horizonProfile({ heightAt, x: s.x, z: s.z, eyeY: y0 + a, obstacles: trees, inside });
    const bare = horizonProfile({ heightAt, x: s.x, z: s.z, eyeY: y0 + a, inside });
    row.at[a] = { all: +worstIn(prof).toFixed(1), south: +worstIn(prof, SOUTH).toFixed(1), bareAll: +worstIn(bare).toFixed(1), bareSouth: +worstIn(bare, SOUTH).toFixed(1) };
  }
  const f = (max, arcs, key) => clearAltitude(a => horizonProfile({ heightAt, x: s.x, z: s.z, eyeY: y0 + a, obstacles: trees, inside }), max, LEVELS, arcs);
  row.need = { jp8all: f(8, null), jp8south: f(8, SOUTH), vn6south: f(6, SOUTH), vn6all: f(6, null) };
  rows.push(row);
}
if (process.argv.includes('--json')) console.log(JSON.stringify(rows, null, 1));
else {
  console.log('spot'.padEnd(14), 'y0'.padStart(5), LEVELS.map(a => `+${a}`.padStart(11)).join(''), '   (worst rim angle all-round / south arc, deg, with trees)');
  for (const r of rows) console.log(r.id.padEnd(14), String(r.y0).padStart(5), LEVELS.map(a => `${r.at[a].all}/${r.at[a].south}`.padStart(11)).join(''));
  console.log('\nlowest clear altitude (m above the spot) | all-round <=8 | south <=8 | south <=6 | all-round <=6');
  for (const r of rows) {
    const c = k => { const n = r.need[k]; return `${n.clear ? n.alt : '>' + LEVELS.at(-1)} (${n.worst.toFixed(1)})`; };
    console.log(r.id.padEnd(14), c('jp8all').padEnd(12), c('jp8south').padEnd(12), c('vn6south').padEnd(12), c('vn6all'));
  }
  console.log('\nterrain only (no trees), worst all-round / south:');
  for (const r of rows) console.log(r.id.padEnd(14), LEVELS.map(a => `${r.at[a].bareAll}/${r.at[a].bareSouth}`.padStart(11)).join(''));
}
