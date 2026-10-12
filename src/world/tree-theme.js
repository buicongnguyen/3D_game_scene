// A cosmetic scenery option. Keep the original scatter records for collisions, quests,
// wildlife and saves; only the foliage renderer receives these substitute records.
export const TROPICAL_TREES = ['tree-vn-mango', 'tree-vn-bamboo', 'tree-vn-coconut'];
const SPECIES = ['tree-vn-mango', 'tree-vn-bamboo', 'tree-vn-mango', 'tree-vn-coconut'];
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
  if (!enabled || record.far || record.orchard || record.story) return record;
  if (record.model !== 'tree-broadleaf-a' && record.model !== 'tree-broadleaf-b') return record;
  // The southern lowlands leave the northern beetle grove, forest spider trails,
  // orchard, shrine and mountain silhouettes in their original scenery.
  if (record.z < -35 || record.z > 125 || record.y < 0.9 || record.y > 35) return record;
  const hash = (Math.imul(Math.round(record.x * 16), 73856093)
    ^ Math.imul(Math.round(record.z * 16), 19349663)) >>> 0;
  if (hash & 1) return record;
  return {
    ...record,
    sourceModel: record.model,
    model: SPECIES[(hash >>> 1) % SPECIES.length],
    // Imports are 8 m tall; retain the 8 / 8.5 m donor heights used by kite collisions.
    s: record.s * (record.model === 'tree-broadleaf-b' ? 8.5 / 8 : 1),
  };
}
