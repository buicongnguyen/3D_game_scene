// The games of the Kawabe playground yard. A yard game is a small module (./footnet.js, ./keepup.js) whose default
// export is
//   { id, name, teams(kids) -> { mine, theirs, wall? }, target(level), create(opts) -> sim, bot(sim, at), focus }
// and whose sim is pure and seeded with this shape (so one round runner, ./round.js, shows them all):
//   sim.step(dt, { mx, mv, kick, pos? })      one step; Mika's stick in court space, her kick, her place
//   sim.players [{ id, team, human, u, v, moving, kickT }], sim.shuttle { on, u, y, v }
//   sim.marker { on, u, v, mine, out, tau, dur }, sim.score [a, b], sim.state, sim.server, sim.L (timing windows)
//   sim.events [{ type: 'serve' | 'windup' | 'kick' | 'whiff' | 'wall' | 'land' | 'point' | 'over', … }] (the runner empties it)
//   sim.over / sim.result() -> { won, score, rally, stars, … }
// To add a game: write its module, list it here, give it a name in content/yard.js YARD_NAMES (the save and the
// scoreboard read that) and its texts in ./round.js TEXT. Pure (Node-safe): tests/yard.test.mjs imports this.
import footnet from './footnet.js';
import keepup from './keepup.js';

export const YARD_GAMES = [footnet, keepup];
export const YARD_GAME = Object.fromEntries(YARD_GAMES.map(g => [g.id, g]));

/** The game after `id` on the scoreboard post. */
export function nextGame(id) {
  const i = YARD_GAMES.findIndex(g => g.id === id);
  return YARD_GAMES[(i + 1) % YARD_GAMES.length].id;
}

/** How gently a round is played: the very first one, then Easy mode, then as the game is meant. */
export function levelFor(rec, easy) {
  return !rec?.plays ? 'first' : easy ? 'easy' : 'normal';
}

/**
 * The kids playing by themselves: who is on the court and who watches from the bench. Foot-tennis is one against
 * one (two against two with four); the kid who sat out comes on for the loser. Keep it up takes everybody.
 * `round` counts the matches played since they came, `lastLoser` is the id that lost the last one.
 */
export function ambientRoles(game, ids, round = 0, lastLoser = null) {
  if (game === 'keepup' || ids.length < 2) return { game: 'keepup', play: ids.slice(0, 4), watch: ids.slice(4) };
  if (ids.length >= 4) return { game, play: ids.slice(0, 4), watch: ids.slice(4) };
  if (ids.length === 2) return { game, play: ids.slice(), watch: [] };
  // three: rotate the bench
  let bench = ids[round % 3];
  if (lastLoser && ids.includes(lastLoser)) bench = lastLoser;
  return { game, play: ids.filter(i => i !== bench), watch: [bench] };
}
