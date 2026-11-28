// Sing & Play's ready-made stages (game/singplay/stages-row.js): flat open ground where Kotone performs Solo, with 4 or
// with 8 at the facing given (facing: her turn in radians, 0 = toward +z; the camera man films her from the front).
// Each spot was picked with the game's own room checks (game/singplay/flat.js canPerform + canGroup for 4 and 8, the
// real heights and colliders, in the browser) and still passes 0.6 m off in any direction and 0.1 rad turned either way.
// tests/singplay.test.mjs checks them again on the terrain and building data.
import { N_ } from '../i18n/i18n.js';

export const STAGES = Object.freeze([
  { id: 'station', name: N_('Station stage'), x: -91, z: 99.5, facing: Math.PI },          // in front of Hoshi Station, facing the valley
  { id: 'shrine', name: N_('Shrine yard'), x: 62, z: -147, facing: 0 },                    // before the Forest Shrine, her back to it
  { id: 'meadow', name: N_('Kite meadow'), x: -29, z: 79, facing: Math.PI / 2 },           // the open meadow north of Kawabe
  { id: 'river', name: N_('Riverside'), x: -16.3, z: -55.6, facing: Math.PI * 1.5 },       // the low bank by Ōta Mill, the river behind her
  { id: 'kawabe', name: N_('Village square'), x: -45, z: 20, facing: Math.PI },            // the middle of Kawabe
  { id: 'hill', name: N_('Star hill'), x: -59, z: 159, facing: Math.PI },                  // the stargazing hill above the valley (scenic)
].map(Object.freeze));
