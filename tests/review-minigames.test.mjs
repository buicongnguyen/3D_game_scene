// Regressions found in the 12 October 2026 review of the mini games (the browser proofs live in .tools/review/*.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MinigameMenu } from '../src/game/minigame-menu.js';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src');
const read = f => fs.readFileSync(path.join(SRC, f), 'utf8').replace(/\r\n/g, '\n');

test('the Star Kite cannot be called in the middle of a trick or yard round (G / the Kite touch button)', () => {
  // Browser proof before the fix: keep-it-up, the firefly jar and the grasshopper meadow all let G lift Mika out of the
  // round once an Explore save owned the kite (the Kite workshop game gives it). node .tools/review/kite-in-round.mjs
  const src = read('game/director.js');
  const launch = src.split('\n').find(l => l.includes("inp.pressed('kite')") && l.includes('kite.toggle()'));
  const button = src.split('\n').find(l => l.includes('this.ui.kiteButton('));
  assert.ok(launch && button, 'the kite key and its touch button are still wired in director.update');
  assert.match(src, /const inRound = !!this\.tricks\?\.round \|\| !!this\.yard\?\.round;/);
  assert.match(launch, /\(!inRound \|\| kite\.active\)/, 'no launch inside a round (a kite already flying may still land)');
  assert.match(button, /!inRound && kite\.canLaunch\(\)/, 'the touch button is not offered inside a round');
});

test('the Mini games menu does not open while the Star Kite is swooping in or carrying Mika', () => {
  const base = { quest: {}, busy: 0, minigame: null, scenes: {}, tricks: {}, yard: {}, workshop: {}, tourLock: false, sky: {} };
  const menu = (g, d = base) => Object.assign(Object.create(MinigameMenu.prototype), { d, g, running: false });
  assert.equal(menu({ player: {}, kite: { active: false } }).canOpen(), true);
  assert.equal(menu({ player: {}, kite: { active: true } }).canOpen(), false, 'the kite is arriving: she is not mounted yet');
  assert.equal(menu({ player: { mounted: {} }, kite: { active: false } }).canOpen(), false);
  assert.equal(menu({ player: {} }).canOpen(), true, 'a valley without the kite object');
});

test('the item chips do not sit on a round\'s own panels: hidden on phones in every round, and under the archery wind gauge', () => {
  assert.match(read('game/tricks.js'), /@media \(max-width:560px\)\{body\.trick-round #clock,body\.trick-round #inventory\{visibility:hidden\}\}/);
  assert.match(read('game/tricks/archery.js'), /body\.arch-round #inventory\{visibility:hidden\}/);
});

test('village children keep a child\'s hair colour (the shared villager palette also holds white and grey)', async () => {
  const { NPC } = await import('../src/actors/npc.js');
  const grown = new Set(['#d8d0c0', '#8a8a8a']);
  let remapped = 0;
  for (let seed = 0; seed < 80; seed++) for (const id of ['v3', 'v6', 'v10', 'v13', 'v20', 'v23', 'racekid1']) {
    const adult = NPC.villagerTint(seed), kid = NPC.kidTint(adult, id);
    assert.ok(!grown.has(kid['Villager hair']), `seed ${seed} ${id}: ${kid['Villager hair']}`);
    assert.equal(kid['Villager shirt'], adult['Villager shirt']); assert.equal(kid['Villager trousers'], adult['Villager trousers']);
    if (grown.has(adult['Villager hair'])) remapped++; else assert.equal(kid, adult, 'a child-coloured tint is left alone');
    assert.deepEqual(NPC.kidTint(adult, id), kid, 'the same child always gets the same hair');
  }
  assert.ok(remapped > 0);
  assert.match(read('actors/npc.js'), /if \(tint && model === 'villager-kid'\) tint = NPC\.kidTint\(tint, id\);/);
});

test('the top-down board games put the festival garlands away for the round and hang them again exactly as they were', async () => {
  const { Yard } = await import('../src/game/yard/round.js');
  for (const was of [true, false]) {
    const group = { visible: was }, yard = Object.assign(Object.create(Yard.prototype), { g: { celebrate: { decor: { group } } } });
    yard.garlands(true); assert.equal(group.visible, was, 'nothing to give back yet');
    yard.garlands(false); yard.garlands(false); assert.equal(group.visible, false, 'hidden once, also over a replay');
    yard.garlands(true); assert.equal(group.visible, was); assert.equal(yard.garlandsWere, undefined);
  }
  Object.assign(Object.create(Yard.prototype), { g: {} }).garlands(false);          // a valley without decorations
  const src = read('game/yard/round.js');
  assert.match(src, /this\.garlands\(G\.look !== 'board' && G\.look !== 'marbles'\);/);
  assert.match(src, /clearCutscene\(true\);\n    this\.garlands\(true\);/, 'endRound always gives them back');
});

// ---------------------------------------------------------------- second pass: the looks
test('the ropes are one thin tube whose buffers are rewritten in place (no beads, nothing allocated per frame)', async () => {
  const THREE = await import('three');
  const { TubeRope, TUG_ROPE } = await import('../src/game/yard/views.js');
  const added = [], view = { shadows: false, add: o => added.push(o), at: (u, y, v, out) => out.set(u, y, v) };
  const rope = new TubeRope(view, 24, '#c9a46a', 0.045);
  assert.equal(added.length, 1); assert.ok(rope.mesh.isMesh && !rope.mesh.isInstancedMesh, 'one ordinary mesh');
  const pos = rope.geometry.attributes.position, arr = pos.array, nor = rope.geometry.attributes.normal.array, pts = rope.pts;
  assert.equal(pos.count, 24 * 7);
  const curve = (s, o) => { o.u = -4 + 8 * s; o.v = TUG_ROPE.v; o.y = TUG_ROPE.y - 0.04 * Math.sin(Math.PI * s); };
  rope.fill(view, curve); const first = arr.slice();
  rope.fill(view, (s, o) => { curve(s, o); o.u += 0.5; });
  assert.equal(rope.geometry.attributes.position.array, arr); assert.equal(rope.geometry.attributes.normal.array, nor); assert.equal(rope.pts, pts);
  assert.ok(Math.abs(arr[0] - first[0] - 0.5) < 1e-6, 'the same vertices moved with the rope');
  for (let i = 0; i < pos.count; i++) {
    const x = arr[i * 3], y = arr[i * 3 + 1], z = arr[i * 3 + 2];
    assert.ok(Number.isFinite(x + y + z));
    assert.ok(Math.abs(Math.hypot(y - (TUG_ROPE.y - 0.04 * Math.sin(Math.PI * (x - 0.5 + 4) / 8)), z - TUG_ROPE.v) - 0.045) < 0.012, `vertex ${i} lies on the tube`);
  }
  assert.ok(!/InstancedMesh\(new THREE\.SphereGeometry\(radius/.test(read('game/yard/views.js')), 'the bead rope is gone');
  void THREE;
});

test('tug of war: hands stay on the rope between heaves, and the strain is drawn pips', async () => {
  const { Poses, POSE_KINDS } = await import('../src/game/yard/poses.js');
  const { default: tug } = await import('../src/game/yard/tug.js');
  assert.ok(POSE_KINDS.includes('grip'));
  const poses = new Poses(), body = { model: { getObjectByName: () => null }, anim: { update() {} } };
  poses.hold(body, 'grip');
  for (let i = 0; i < 600; i++) { poses.update(1 / 60); poses.hold(body, 'grip'); }
  assert.ok(poses.busy(body), 'a held pose never runs out');
  poses.start(body, 'pull'); poses.hold(body, 'grip');
  assert.equal(poses.active[0].kind, 'pull', 'a heave plays over the grip');
  for (let i = 0; i < 40; i++) { poses.update(1 / 60); poses.hold(body, 'grip'); }
  assert.equal(poses.active[0].kind, 'grip', 'and the hands go back to the rope');
  const sim = tug.create({ seed: 1, level: 'normal', target: 2, players: [{ id: 'mika', human: true, team: 0 }, { id: 'a', team: 1 }] });
  sim.fatigue = 0.6;
  const hud = sim.hud({ mine: 'Mika', theirs: 'A' });
  assert.deepEqual(hud.pips, { label: 'Strain', n: 3, of: 5 }); assert.ok(!/[▮▯]/.test(hud.sub), 'no block glyphs');
  assert.match(read('game/yard/round.js'), /this\.poses\.hold\(this\.mikaBody\(\), 'grip'\)/);
});

test('phone framings: tug along the rope, the sack race travels with Mika; wide screens see the sack race from the side', async () => {
  const { Yard } = await import('../src/game/yard/round.js');
  const { default: sack, COURSE } = await import('../src/game/yard/sack.js');
  const { default: tug } = await import('../src/game/yard/tug.js');
  const { default: footnet } = await import('../src/game/yard/footnet.js');
  assert.equal(tug.tall.mode, 'side'); assert.ok(sack.tall.follow.l < COURSE, 'a window of the course, not all 13 m');
  const y = Object.assign(Object.create(Yard.prototype), { cam: 'end', camSet: false });
  assert.equal(y.camOf(sack), 'side'); assert.equal(y.camOf(footnet), 'end'); assert.equal(y.camOf(tug), 'end');
  y.round = { G: sack }; y.el = null;
  const store = globalThis.localStorage; globalThis.localStorage = { setItem() {} };
  try { y.toggleCam(); } finally { globalThis.localStorage = store; }
  assert.equal(y.camOf(sack), 'end', 'the button flips the view she actually has'); assert.equal(y.camSet, true);
  // the travelling shot stays inside the course
  const R = { G: sack, sim: { human: { v: COURSE / 2 } } };
  const lo = y.followV({ ...R, sim: { human: { v: -COURSE / 2 } } }, sack.tall.follow), hi = y.followV(R, sack.tall.follow);
  assert.ok(hi <= (sack.focus.l - sack.tall.follow.l) / 2 + 1e-9 && lo >= -(sack.focus.l - sack.tall.follow.l) / 2 - 1e-9 && hi > lo);
});

test('o an quan: the two players sit at the long sides of the board, out of each other\'s squares', async () => {
  const { OanSim } = await import('../src/game/yard/oanquan.js');
  const sim = new OanSim({ players: [{ id: 'mika', human: true }, { id: 'kid' }] });
  const [m, k] = sim.players;
  assert.ok(m.v > 1 && k.v < -1 && Math.abs(m.u) < 1.25 && Math.abs(k.u) < 1.25, JSON.stringify([m.u, m.v, k.u, k.v]));
});

test('rounds beside the river have a soft edge, and the firefly jar never burns Mika out', async () => {
  const { keepShallow } = await import('../src/game/tricks/util.js');
  const player = { pos: { x: 0, z: 0 }, vel: { x: 1, z: 1 } }, bed = x => 1 - x * 0.5;       // the ground falls away to the east
  const hook = keepShallow(player, x => bed(x), 0.1);
  player.pos.x = 1.2; hook(); assert.equal(player.pos.x, 1.2, 'the shallows are hers');
  player.pos.x = 2.4; hook(); assert.equal(player.pos.x, 1.2, 'a step too deep is taken back'); assert.equal(player.vel.x, 0);
  player.pos.z = 3; hook(); assert.equal(player.pos.z, 3, 'she can still walk along the edge');
  const { JAR_LIGHT } = await import('../src/game/tricks/firefly.js');
  assert.ok(JAR_LIGHT <= 3);
  assert.match(read('game/tricks/firefly.js'), /tamo\.calm = 0\.3/); assert.match(read('game/tricks/firefly.js'), /if \(tamo\) tamo\.calm = 1;/);
  assert.match(read('game/tricks/river.js'), /keepShallow\(this\.player, heightAt, WATER_Y - 0\.9\)/);
  assert.match(read('game/tricks/roast.js'), /keepShallow\(this\.g\.player, heightAt, WATER_Y \+ 0\.1\)/);
});

test('cow riding: seated from the top of the hop, reins measured on the cow, the phone energy bar beside the buttons', () => {
  const src = read('actors/cow-ride.js');
  assert.match(src, /a\.root\.add\(this\.rig\);\n    this\.rig\.userData\.update\(\);/);
  assert.match(src, /if \(k >= 0\.42 && !this\.landed\)/); assert.match(src, /if \(k >= 0\.38 && !this\.leapt\)/);
  assert.match(src, /#cowUi \.tip:empty\{display:none\}/); assert.match(src, /#cowUi\.touch \.bar\{width:64px\}/);
  assert.match(read('game/director.js'), /Aim, then fit the new bulb: \{lamp\}/);
});
