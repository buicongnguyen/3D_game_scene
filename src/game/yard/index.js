// The games of the Kawabe playground yard. A yard game is a small module (./footnet.js, ./keepup.js) whose default
// export is
//   { id, name, teams(kids) -> { mine, theirs, wall? }, target(level), create(opts) -> sim, bot(sim, at), focus }
// and whose sim is pure and seeded with this shape (so one round runner, ./round.js, shows them all):
//   sim.step(dt, { mx, mv, kick, pos? })      one step; Mika's stick in court space, her kick, her place
//   sim.players [{ id, team, human, u, v, moving, kickT }], sim.shuttle { on, u, y, v }
//   sim.marker { on, u, v, mine, out, tau, dur }, sim.score [a, b], sim.state, sim.server, sim.L (timing windows)
//   sim.events [{ type: 'serve' | 'windup' | 'kick' | 'whiff' | 'wall' | 'land' | 'point' | 'over', … }] (the runner empties it)
//   sim.over / sim.result() -> { won, score, rally, stars, … }
// A game also has: look (which view draws it, ./views.js), moves (does Mika walk about in it), roles(ids) for the kids' own play,
// ambientTeam(play, i), hud(names)/hint() on its sim, and card(result, record, names, newBest) for the results card.
// To add a game: write its module, list it here, give it a name in content/yard.js YARD_NAMES (the save and the
// scoreboard read that) and its texts in ./round.js TEXT. Pure (Node-safe): tests/yard.test.mjs imports this.
import footnet from './footnet.js';
import keepup from './keepup.js';
import volley from './volley.js';
import rope from './rope.js';
import tug from './tug.js';
import oanquan from './oanquan.js';
import sack from './sack.js';
import marbles from './marbles.js';

export const YARD_GAMES = [footnet, keepup, volley, rope, tug, oanquan, sack, marbles];
export const YARD_GAME = Object.fromEntries(YARD_GAMES.map(g => [g.id, g]));

/** The game after `id` on a yard's scoreboard post: only the yard's own `games` (content/yard.js) are cycled. */
export function nextGame(id, games = YARD_GAMES.map(g => g.id)) {
  const i = games.indexOf(id);
  return games[(i + 1) % games.length];
}

/** How gently a round is played: the very first one, then Easy mode, then as the game is meant. */
export function levelFor(rec, easy) {
  return !rec?.plays ? 'first' : easy ? 'easy' : 'normal';
}

/**
 * The kids playing by themselves: who plays and who watches from the bench, decided by the game itself (its `roles`: foot-tennis
 * is one against one, two against two with four; rope jumping needs three; a game that cannot be played with these kids
 * falls back to keep it up). `round` counts the rounds played since they came, `lastLoser` is who lost the last one.
 */
export function ambientRoles(game, ids, round = 0, lastLoser = null) {
  const G = YARD_GAME[game] || YARD_GAME.keepup;
  const r = G.roles(ids, round, lastLoser);
  return YARD_GAME[r.game] ? r : { game: 'keepup', play: ids.slice(0, 4), watch: ids.slice(4) };
}
