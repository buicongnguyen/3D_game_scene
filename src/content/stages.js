// Sing & Play's ready-made stages (game/singplay/stages-row.js): open ground where Kotone performs Solo, with 4 or with 8.
// facing: the camera's view after a jump, in radians (0 = toward +z): she stands with her back to the camera looking at
// that view, and Perform turns her (and the group) half round to face the camera (game/singplay/singplay.js
// performFacing), so the view is the backdrop behind them. (Until 2026-11-28 facing was her own turn while performing;
// each stage keeps its spot and its backdrop, the stored facing turned half round, except Star hill, which now films
// the valley.)
// Each spot was picked with the game's own room checks at the performing turn (facing + pi; game/singplay/flat.js
// canPerform + canGroup for 4 and 8, the real heights and colliders, in the browser) and still passes 0.6 m off in any
// direction and 0.1 rad turned either way.
// tests/singplay.test.mjs checks them again on the terrain and building data.
import { N_ } from '../i18n/i18n.js';

export const STAGES = Object.freeze([
  { id: 'station', name: N_('Station stage'), x: -91, z: 99.5, facing: 0 },                // Hoshi Station behind them
  { id: 'shrine', name: N_('Shrine yard'), x: 62, z: -147, facing: Math.PI },              // the Forest Shrine behind them
  { id: 'meadow', name: N_('Kite meadow'), x: -29, z: 79, facing: Math.PI * 1.5 },         // the open meadow north of Kawabe
  { id: 'river', name: N_('Riverside'), x: -16.3, z: -55.6, facing: Math.PI / 2 },         // the low bank by Ōta Mill, the river behind them
  { id: 'kawabe', name: N_('Village square'), x: -45, z: 20, facing: 0 },                  // the middle of Kawabe
  { id: 'hill', name: N_('Star hill'), x: -59, z: 159, facing: Math.PI },                  // the stargazing hill, the valley below behind them
  { id: 'orchard', name: N_('Orchard slope'), x: 80, z: -85, facing: -1.55 },              // a 12 deg hillside by the orchard gate, the valley below (feet fitted: perform/ground-fit.js)
].map(Object.freeze));
