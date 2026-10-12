// A cosmetic scenery option. Keep the original scatter records for collisions, quests,
// wildlife and saves; only the foliage renderer receives these substitute records.
import { river } from './layout.js';

export const TROPICAL_TREES = ['tree-vn-mango', 'tree-vn-bamboo', 'tree-vn-coconut'];
export const TROPICAL_BUSHES = ['bush-vn-fern', 'bush-vn-banana'];
const SPECIES = ['tree-vn-mango', 'tree-vn-bamboo', 'tree-vn-mango', 'tree-vn-coconut'];
// Gameplay canopy heights (actors/kite.js). Taller donors stretch vertically only,
// keeping the imported lower trunks inside the original collision cylinders.
const TREE_HEIGHTS = { 'tree-broadleaf-a': 8, 'tree-broadleaf-b': 8.5, 'tree-cedar': 12,
  'tree-pine': 7, 'tree-maple': 5.5, 'tree-sakura': 6, 'tree-peach': 3.8, 'tree-chestnut': 7 };
// The web support candidates in actors/critters.js and beetle grove in game/tricks/beetles.js.
const WEB_TRAILS = [[-44, -92], [-30, -106], [-48, -62], [62, -122], [53, -121], [100, -96], [-50, -140]];
// Same river arc as scenes.party1 / Celebrate.blossomWave; these sakura supply the petals.
const blossomStart = river.nearest(1.2, -45.6).s, blossomEnd = river.nearest(8, 60).s;
const inside = (r, x, z, radius) => Math.hypot(r.x - x, r.z - z) <= radius;
const hashAt = r => (Math.imul(Math.round(r.x * 16), 73856093)
  ^ Math.imul(Math.round(r.z * 16), 19349663)) >>> 0;
const KEY = 'starline-opt-tropicalTrees';
const listeners = new Set();
let tropical;

export function getTropicalTrees() {
  if (tropical === undefined) {
    try { tropical = JSON.parse(localStorage.getItem(KEY)) === true; } catch { tropical = false; }
  }
  return tropical;
}

export function onTreeThemeChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function setTropicalTrees(enabled) {
  const next = enabled === true;
  if (getTropicalTrees() === next) return;
  tropical = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* keep the choice for this session */ }
  for (const fn of listeners) fn(next);
}

export function treeForTheme(record, enabled) {
  if (!enabled || record.orchard || record.story || !TREE_HEIGHTS[record.model]) return record;
  if (!record.far) {
    if (inside(record, 92, -103, 28) || WEB_TRAILS.some(([x, z]) => inside(record, x, z, 22))) return record;
    // Shrine scenery and the maple butterfly scene at (61, -121).
    if ((record.model === 'tree-cedar' || record.model === 'tree-maple') && inside(record, 62, -157, 55)) return record;
    if (record.model === 'tree-maple' && inside(record, 61, -121, 26)) return record;
    if (record.model === 'tree-sakura') {
      const bank = river.nearest(record.x, record.z, 90);
      if (bank && bank.s > Math.min(blossomStart, blossomEnd) - 12
        && bank.s < Math.max(blossomStart, blossomEnd) + 12) return record;
    }
  }
  const heightRatio = TREE_HEIGHTS[record.model] / 8;
  const widthRatio = Math.min(1, heightRatio);
  return {
    ...record,
    sourceModel: record.model,
    model: SPECIES[(hashAt(record) >>> 1) % SPECIES.length],
    s: record.s * widthRatio,
    sy: (record.sy ?? 1) * heightRatio / widthRatio,
  };
}

export function bushForTheme(record, enabled) {
  if (!enabled || record.orchard || record.story || !['bush-a', 'bush-b'].includes(record.model)) return record;
  return { ...record, sourceModel: record.model, model: TROPICAL_BUSHES[(hashAt(record) >>> 1) % TROPICAL_BUSHES.length] };
}
