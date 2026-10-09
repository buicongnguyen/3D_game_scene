// Fast-forward the pure quest engine to a step (used by the autopilot's --from=<step>). The engine lives in the game
// (src/game/fastforward.js), which Explore mode uses too.
export { stateAt } from '../../src/game/fastforward.js';

// Where to stand when resuming at a step.
export const RESUME_AT = {
  c1: [-40, 20], c2: [26.5, 30], c3: [85, -74], c4: [-120, 110], e: [-95, 116],
};
