// Review fixes in the yards and the Mini games menu (kept apart from the older yard tests so they read as one change).
import test from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Views } from '../src/game/yard/views.js';
import * as O from '../src/game/yard/oanquan.js';
import { MinigameMenu } from '../src/game/minigame-menu.js';
import { Quest } from '../src/game/quest.js';
import { stateAt } from '../src/game/fastforward.js';

test('two yards playing the same game at once keep their own pieces (rope jumping is at Kawabe and Takamori)', () => {
  const scene = new THREE.Scene(), views = new Views(scene, {});
  const a = views.get('rope', 'kawabe'), b = views.get('rope', 'takamori');
  assert.notEqual(a, b, 'one rope per yard');
  assert.equal(views.get('rope', 'kawabe'), a, 'made once, then kept');
  a.attach({ x: -20, z: 12, rot: 0 }, 0); b.attach({ x: 114, z: -24, rot: 0 }, 0);
  assert.notDeepEqual(a.S, b.S, 'each is on its own stage');
  const shown = v => v.items.some(o => o.visible);
  for (const v of [a, b]) for (const o of v.items) o.visible = true;
  views.hideAll('kawabe');
  assert.ok(!shown(a), 'the Kawabe pieces are hidden');
  assert.ok(shown(b), 'a new game at Kawabe does not take the Takamori rope off the screen');
  views.hideAll();
  assert.ok(!shown(b), 'with no owner everything goes');
  // the unowned form still works (a look with no yard)
  assert.equal(views.get('tug'), views.get('tug'));
});

test('the oan quan hint squares are worked out once per position, not once per frame', () => {
  const sim = new O.OanSim({ seed: 3, players: [{ id: 'mika', human: true }, { id: 'v3' }], level: 'normal' });
  for (let i = 0; i < 400 && sim.state !== 'think'; i++) sim.step(1 / 60);
  assert.equal(sim.state, 'think');
  const first = sim.hintSquares();
  assert.ok(first.length > 0 && first.every(sq => sq >= 1 && sq <= 5));
  assert.equal(sim.hintSquares(), first, 'the same list while nothing moved');
  sim.step(1 / 60, { pick: first[0] });
  sim.step(1 / 60, { dir: 1 });
  for (let i = 0; i < 4000 && !(sim.state === 'think' && sim.mover === 0 && sim.board.turns > 0); i++) sim.step(1 / 60);
  const second = sim.hintSquares();
  assert.notEqual(second, first, 'a new position gets a new answer');
  assert.ok(second.every(sq => sim.board.dan[sq] > 0), 'and it only names squares with pebbles');
});

test('a story save lends the Mini games its friends too, so a friend already met does not "arrive" again every round', () => {
  const real = stateAt('c1.cogs', 'alone', 'grandma');
  real.friends = { rabbit: true, grasshopper: true };
  const quest = new Quest(real, { story: real.story });
  const player = { pos: new THREE.Vector3(1, 2, 3), facing: 0.5 };
  const director = { quest, game: { player, follow: { yaw: 0, pitch: 0.3 }, interiors: null }, ui: {}, explore: false, tamoAround: () => false };
  const menu = new MinigameMenu(director);
  menu.borrow();
  assert.notEqual(director.quest, quest, 'the valley is borrowed');
  assert.deepEqual(director.quest.state.friends, { rabbit: true, grasshopper: true }, 'the friends travel along');
  director.quest.state.friends.mantis = true;
  assert.equal(real.friends.mantis, undefined, 'a copy: a friend met inside the menu never reaches the real save');
});

test('the scene tour cannot start under a yard round, a Mini games launch or the kite workshop (tour.js needs a DOM, so its source is read)', () => {
  const src = fs.readFileSync(new URL('../src/game/tour.js', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('  blocked() {'), src.indexOf('  openPicker()'));
  for (const what of ['d.yard?.round', 'd.minigameMenu?.running', 'd.workshop?.active', 'd.tricks?.round', 'd.minigame']) assert.ok(body.includes(what), `blocked() looks at ${what}`);
});
