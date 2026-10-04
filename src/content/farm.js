// The farm animals of Kawabe and Takamori: cows, pigs, goats and dogs (models: art/blender/build_animals.py).
// [id, kind, x, z, facing, roam radius]: they graze, doze and amble within `radius` metres of where they start. The dogs
// have no radius: they take to Mika and trot along beside her while she is near home. Checked by tests/farm.test.mjs.
export const FARM = [
  // Kawabe: cows in the meadow south of the main street (the rice paddies are to the west), goats on the slope below the mill road
  ['cow1', 'cow', -42, 70, 1.2, 6], ['cow2', 'cow', -49, 76, 2.4, 6],
  ['goat1', 'goat', -62, -24, 0.5, 6], ['goat2', 'goat', -66, -20, 2.2, 6],
  ['dog1', 'dog', -46, 42, 1.6, 0],
  // Takamori: cows by the pasture road, pigs behind the houses, goats on the hillside
  ['cow3', 'cow', 140, -8, 0.4, 6], ['cow4', 'cow', 145, -2, 3.6, 6],
  ['pig1', 'pig', 140, 24, 2, 4], ['pig2', 'pig', 143, 28, 4, 4], ['pig3', 'pig', 146, 16, 0.8, 4],
  ['goat3', 'goat', 100, 44, 1.1, 6], ['goat4', 'goat', 104, 48, 3.9, 6],
  ['dog2', 'dog', 112, 14, 4.1, 0],
  // Sora's cottage: the old dog on the garden path
  ['dog3', 'dog', -52, 134, 0.2, 0],
];

/** How each kind moves and sounds. `walk` is the speed (m/s) its Walk clip is authored for, so the feet do not slide. */
export const FARM_KINDS = {
  cow: { model: 'cow', walk: 0.7, speed: 0.7, graze: 'Graze', call: 'Moo', calls: 0.012, near: 16, scale: 1 },
  pig: { model: 'pig', walk: 0.9, speed: 0.9, graze: 'Snuffle', call: 'Oink', calls: 0.016, near: 14, scale: 1 },
  goat: { model: 'goat', walk: 1.0, speed: 1.0, graze: 'Graze', call: 'Bleat', calls: 0.014, near: 14, scale: 1 },
  dog: { model: 'dog', walk: 1.1, speed: 1.1, run: 4.5, graze: 'Sit', call: 'Bark', calls: 0.006, near: 18, scale: 1 },
};

/**
 * What a grazing animal does next: a pure choice (testable). `night` (0..1) makes them doze, `near` is Mika within
 * earshot (they look up and may call), `rand` returns 0..1.
 */
export function nextAction(kind, { night = 0, near = false, rested = true }, rand = Math.random) {
  const r = rand();
  if (night > 0.6 && r < 0.75) return { action: 'sleep', time: 12 + rand() * 20 };
  if (near && rested && rand() < 0.22) return { action: 'call', time: 2.2 };
  if (r < 0.5) return { action: 'graze', time: 4 + rand() * 6 };
  if (r < 0.72) return { action: 'idle', time: 2.5 + rand() * 4 };
  return { action: 'walk', time: 0 };
}
