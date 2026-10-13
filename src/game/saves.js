// The save files in the browser's storage, read and cleared without the valley: the title menu lists them before any
// 3D exists (src/main.js), and the quick-start runtime keeps its records in the Explore save (src/quick/runtime.js).
// Director's static helpers (Director.loadSave, .slots, …) are these same functions.
export const SAVE_KEY = 'starline-save-1';

/** Three save profiles and 'explore'. Slot 1 keeps the original key, so older saves appear there. */
export const saveKey = (slot = 1) => (slot === 1 ? SAVE_KEY : `starline-save-${slot}`);

export function loadSave(slot = 1) {
  try {
    const d = JSON.parse(localStorage.getItem(saveKey(slot)));
    return d && typeof d === 'object' && d.quest && typeof d.quest === 'object' ? d : null; // anything else is not a save
  } catch { return null; }
}

export function clearSave(slot = 1) { try { localStorage.removeItem(saveKey(slot)); } catch { /* ignore */ } }

export const saveSlots = () => [1, 2, 3].map(slot => ({ slot, data: loadSave(slot) }));

export function lastSlot() { try { return +localStorage.getItem('starline-last-slot') || 1; } catch { return 1; } }
