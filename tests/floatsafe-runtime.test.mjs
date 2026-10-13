// "Float and wait" as a round (src/game/tricks/floatsafe.js) with a small stand-in page: the whole drill is played through
// the round's own input path, and finishing, Stop, an error or the long time-out all put the borrowed session back.
// Also: a Normal swimming lesson through its round (the frog stroke is a seventh skill there).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import floatsafe, { makeProps } from '../src/game/tricks/floatsafe.js';
import swimming, { POOL, frogPose, makeSwimPose } from '../src/game/tricks/swimming.js';
import { FollowCamera } from '../src/actors/camera.js';
import { floatBot, floatBest } from '../src/game/tricks/rules-floatsafe.js';
import { swimBot, SWIM_LEVELS } from '../src/game/tricks/rules-swimming.js';
import { TRICK } from '../src/content/tricks.js';
import { placeProblems } from '../src/world/roads.js';

function player() {
  const inherited = { update() { throw new Error('world physics must be bypassed in the temporary pool'); } };
  const p = Object.assign(Object.create(inherited), { pos: new THREE.Vector3(-9, 3, 53), vel: new THREE.Vector3(2, 0, -1),
    facing: .7, swimming: false, pitch: 0, speed: 2, grounded: true, locked: false, root: new THREE.Group(), pivot: new THREE.Group() });
  p.root.position.copy(p.pos); p.root.rotation.y = p.facing;
  p.anim = { currentName: 'Walk', current: { time: .7, timeScale: .8 }, cancelOneShot() {}, play(name) { this.currentName = name; }, update() {}, snap(name, { time, speed }) { this.currentName = name; this.current.time = time; this.current.timeScale = speed; } };
  return p;
}
const vector = v => v.toArray();
const playerState = p => ({ pos: vector(p.pos), vel: vector(p.vel), root: vector(p.root.position), rot: p.root.rotation.toArray(), facing: p.facing, swimming: p.swimming,
  pitch: p.pitch, speed: p.speed, grounded: p.grounded, locked: p.locked, pivot: p.pivot.rotation.toArray(), clip: p.anim.currentName,
  time: p.anim.current.time, ownUpdate: Object.hasOwn(p, 'update'), ownPose: Object.hasOwn(p, 'pose') });

class Element extends EventTarget {
  constructor() { super(); this.style = {}; this.textContent = ''; this.children = []; this.nodes = new Map(); this.classes = new Set(); this.dataset = {};
    this.classList = { add: (...xs) => xs.forEach(x => this.classes.add(x)), remove: (...xs) => xs.forEach(x => this.classes.delete(x)) }; }
  append(el) { this.children.push(el); el.parent = this; } appendChild(el) { this.append(el); }
  querySelector(s) { if (!this.nodes.has(s)) this.nodes.set(s, new Element()); return this.nodes.get(s); }
  querySelectorAll() { return []; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(e => e !== this); this.parent = null; }
  setPointerCapture() {}
}
function dom(width = 1280, height = 720) {
  const names = ['document', 'window', 'innerHeight', 'innerWidth'], previous = new Map(names.map(n => [n, Object.getOwnPropertyDescriptor(globalThis, n)]));
  const document = Object.assign(new EventTarget(), { body: new Element(), head: new Element(), hidden: false, createElement: () => new Element(), getElementById(id) { return [...this.head.children, ...this.body.children].find(e => e.id === id) || null; } });
  const window = new EventTarget(); Object.assign(globalThis, { document, window, innerHeight: height, innerWidth: width });
  return { document, window, restore() { for (const [n, d] of previous) { if (d) Object.defineProperty(globalThis, n, d); else delete globalThis[n]; } } };
}
function fixture(loop, { level = 'normal', first = false, trick = 'floatsafe' } = {}) {
  const p = player(), scene = new THREE.Scene(), assets = { clone: () => new THREE.Group() }, world = { heightAt: () => 3, quality: { mergeChars: false } };
  const camera = new THREE.PerspectiveCamera(55, 16 / 9, .1, 500); camera.position.set(-12, 6, 55);
  const follow = new FollowCamera(camera, world, {}); follow.look.set(-9, 4, 53); follow.pos.copy(camera.position);
  const input = { enabled: true, lastDevice: 'keyboard', move: { x: 0, y: 0 }, action: false, held() { return this.action; }, pressed() { return false; }, releaseAll() { this.action = false; this.move.x = this.move.y = 0; } };
  const signs = ['swimming', 'floatsafe'].map(id => { const s = { t: { id }, obj: new THREE.Group(), hidden: false }; scene.add(s.obj); return s; });
  const visitor = new THREE.Group(); visitor.name = 'npc:visitor'; visitor.position.set(POOL.x, 3, POOL.z); scene.add(visitor);
  const ctx = { game: { scene, assets, world, player: p, input, follow, easy: false }, player: p, input, first, level, ui: { touch: false }, audio: { good() {} }, director: { tricks: { signs } },
    roundTime: TRICK[trick].levels[level]?.length ?? 100, quit: false, lookChanges: [], fades: [], setNight(...args) { this.lookChanges.push(args); }, lock(on) { this.locked = on; }, hud(score) { this.score = score; },
    fade(on) { this.fades.push(on); }, loop: fn => loop(fn, ctx) };
  return { ctx, p, scene, follow, input, signs, visitor };
}

test('the sign stands on dry ground beside the pool it shares, clear of the deck, well apart from the swimming sign', () => {
  const t = TRICK.floatsafe, s = TRICK.swimming;
  assert.deepEqual(placeProblems(t.place.x, t.place.z), []);
  const off = t.place.x - (POOL.x + 6.5);
  assert.ok(off > 2 && off < 5 && Math.abs(t.place.z - POOL.z) < POOL.apronZ, `beside the east deck, where the drill happens (${off} m from it)`);
  const gap = Math.hypot(t.place.x - s.place.x, t.place.z - s.place.z);
  assert.ok(gap > 12 && gap < 16, `as near the swimming sign as two signs may stand (${gap.toFixed(1)} m)`);
  assert.equal(t.teacher.classic, 'rin'); assert.equal(t.teacher.grandma, 'rin'); assert.deepEqual(t.seasons, s.seasons); assert.deepEqual(t.hours, s.hours);
});

test('the drill\'s own things are built from numbers and all released; the pool model library is never touched', () => {
  const group = new THREE.Group(), props = makeProps(group, { shadows: false });
  for (const k of ['bottle', 'lid', 'ball', 'stone', 'bag', 'ring', 'pole', 'breath', 'flow']) assert.ok(props[k]?.isObject3D, k);
  assert.equal(group.children.length, 9); assert.ok(group.children.every(o => !o.visible), 'nothing shows until the drill asks for it');
  let tris = 0; group.traverse(o => { if (o.isMesh && !o.isInstancedMesh) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
  assert.ok(tris < 3000, `small things: ${tris} triangles`);
  props.aimPole(5, 2.4, 1, 2, 1.4, 1); assert.equal(props.pole.visible, true); assert.ok(Math.abs(props.pole.children[0].scale.y - Math.hypot(3, 1)) < 1e-6);
  props.flowMarks(3, 0.2, 1.3); assert.equal(props.flow.visible, true);
  let gone = 0; const seen = new Set();
  group.traverse(o => { if (!o.isMesh) return; for (const r of [o.geometry, o.material]) if (!seen.has(r)) { seen.add(r); r.addEventListener('dispose', () => gone++); } });
  props.dispose(); props.dispose();
  assert.equal(group.children.length, 0); assert.equal(gone, seen.size);
});

test('the frog poses are distinct, symmetric and end in the long glide', () => {
  const F = SWIM_LEVELS.normal.frog, at = (phase, t) => frogPose({ phase, t }, F);
  assert.deepEqual(at('glide', 0.6), { out: 0, in: 0, tuck: 0, wide: 0, head: 0 }); assert.deepEqual(at('ready', 0), at('glide', 0));
  const sweep = at('pull', 0.3), breathe = at('pull', 1), whip = at('kick', F.kick * 0.35), shut = at('kick', F.kick);
  assert.ok(sweep.out > 0.5 && sweep.in < 0.2 && sweep.tuck === 0, 'the pull starts with the hands sweeping out');
  assert.ok(breathe.in === 1 && breathe.head === 1 && breathe.tuck === 1 && breathe.out === 0, 'breath: hands under the chin, head up, heels up');
  assert.ok(whip.wide > 0.95 && whip.tuck < 0.05, 'the kick opens wide'); assert.deepEqual(shut, { out: 0, in: 0, tuck: 0, wide: 0, head: 0 });
  // the poser bends left and right limbs as mirror images
  const bones = Object.fromEntries(['upperarm_L', 'upperarm_R', 'forearm_L', 'forearm_R', 'thigh_L', 'thigh_R', 'shin_L', 'shin_R', 'head', 'spine'].map(n => { const b = new THREE.Object3D(); b.name = n; return [n, b]; }));
  const model = new THREE.Group(); Object.values(bones).forEach(b => model.add(b));
  const pose = makeSwimPose({ model }); pose.want.frog = 1; Object.assign(pose.frog, breathe);
  for (let i = 0; i < 80; i++) { Object.values(bones).forEach(b => b.rotation.set(0, 0, 0)); pose.apply(0.05); }
  for (const part of ['upperarm', 'forearm', 'thigh', 'shin']) {
    const L = bones[`${part}_L`].quaternion, R = bones[`${part}_R`].quaternion;
    assert.ok(Math.abs(L.x - R.x) < 1e-6 && Math.abs(L.z + R.z) < 1e-6 && Math.abs(L.y + R.y) < 1e-6, `${part} mirrors`);
  }
  assert.ok(bones.thigh_L.quaternion.z < -0.1 && bones.shin_L.quaternion.x > 0.5, 'knees apart, heels drawn up');
});

test('a whole Normal drill through the round: every step, the rescuer\'s answers, the best score, and the session handed back', async () => {
  const env = dom(); let frames = 0; const seen = [];
  const f = fixture(async (fn, ctx) => {
    for (let i = 0; i < 9000; i++) {
      const d = ctx.debug, drill = d.drill, where = d.phase === 'drill' ? drill.step : d.phase;
      if (seen.at(-1) !== where) seen.push(where);
      let a = { act: false, mx: 0, mv: 0, pick: null };
      if (d.phase === 'edge') a.act = !ctx.input.action;
      else if (d.phase === 'drill') a = floatBot(drill, .05);
      if (a.pick !== null && a.pick !== undefined) env.window.dispatchEvent(Object.assign(new Event('keydown'), { code: `Digit${a.pick + 1}` }));
      ctx.input.action = !!a.act; ctx.input.move.x = a.mx || 0; ctx.input.move.y = -(a.mv || 0); ctx.player.update(.05);
      if (d.phase === 'drill' && drill.step !== 'rescue') assert.ok(ctx.player.pos.y < d.pool.deckY, 'in the water for the drill');
      if (d.phase === 'done' && frames % 20 === 0 && ctx.fades.at(-1) === false) assert.ok(ctx.player.pos.y >= d.pool.deckY - .01, 'dry on the deck at the end');
      const value = fn(.05); frames++; if (value !== undefined) return value;
    }
    assert.fail(`round stuck ${ctx.debug.phase} ${ctx.debug.drill.step}`);
  });
  const before = playerState(f.p), cameraBefore = vector(f.follow.camera.position), children = f.scene.children.slice();
  try {
    const result = await floatsafe.play(f.ctx);
    assert.equal(result.score, floatBest('normal')); assert.equal(result.detail.complete, true); assert.equal(result.detail.panics, 0);
    assert.deepEqual(seen, ['edge', 'slip', 'calm', 'float', 'call', 'hold', 'scull', 'reach', 'rescue', 'done']);
    assert.ok(frames > 900, 'about a minute of play at 20 fps, never a skipped drill');
    assert.deepEqual(f.ctx.fades, [true, false, true, false], 'two soft cuts: to the rescuer\'s scene and to the dry deck');
    assert.deepEqual(playerState(f.p), before); assert.deepEqual(vector(f.follow.camera.position), cameraBefore); assert.deepEqual(f.scene.children, children);
    assert.equal(f.visitor.visible, true); assert.ok(f.signs.every(s => !s.hidden && s.obj.visible)); assert.equal(f.ctx.locked, false);
    assert.equal(env.document.getElementById('floatDrill'), null); assert.equal(env.document.body.classes.has('float-round'), false);
    assert.deepEqual(f.ctx.lookChanges, [[true, 11], [false]]);
  } finally { env.restore(); }
});

test('the guided first round is the short Easy drill; a child who thrashes is calmed and still finishes, for fewer points', async () => {
  for (const fidget of [false, true]) {
    const env = dom(390, 844);
    const f = fixture(async (fn, ctx) => {
      for (let i = 0; i < 9000; i++) {
        const d = ctx.debug; let a = { act: false };
        if (d.phase === 'edge') a.act = !ctx.input.action; else if (d.phase === 'drill') a = floatBot(d.drill, .05);
        if (fidget && d.phase === 'drill' && d.drill.step === 'float' && d.drill.floatMode === 'breathe' && d.drill.floatSpent < 4) a.act = i % 4 < 2;
        ctx.input.action = !!a.act; ctx.input.move.x = a.mx || 0; ctx.player.update(.05);
        const value = fn(.05); if (value !== undefined) return value;
      }
      assert.fail('stuck');
    }, { level: 'easy', first: true });
    try {
      const r = await floatsafe.play(f.ctx);
      assert.equal(r.detail.complete, true); assert.equal(r.detail.steps, 4);
      if (fidget) { assert.ok(r.score < floatBest('first') && r.detail.panics >= 1); } else assert.equal(r.score, floatBest('first'));
      assert.deepEqual(f.ctx.fades, [true, false]);
    } finally { env.restore(); }
  }
});

test('Stop, a thrown error, a quit in the dark of a cut and the long time-out all release the pool, the props and the player', async () => {
  for (const mode of ['quit-edge', 'quit-float', 'quit-cut', 'error', 'timeout', 'pointer']) {
    const env = dom();
    const f = fixture(async (fn, ctx) => {
      const ui = env.document.getElementById('floatDrill');
      if (mode === 'pointer') {
        const act = ui.querySelector('.act'), down = new Event('pointerdown', { cancelable: true }); Object.assign(down, { pointerId: 3, button: 0 }); act.dispatchEvent(down);
        assert.equal(ctx.debug.pointerHeld, true); env.window.dispatchEvent(new Event('blur')); assert.equal(ctx.debug.pointerHeld, false);
        ctx.quit = true; return fn(.05);
      }
      if (mode === 'error') throw new Error('injected round failure');
      if (mode === 'timeout') { ctx.roundTime = -23.99; return fn(.05) ?? fn(.05); }
      for (let i = 0; i < 9000; i++) {
        const d = ctx.debug; let a = { act: false };
        if (d.phase === 'edge') a.act = !ctx.input.action; else if (d.phase === 'drill') a = floatBot(d.drill, .05);
        if (mode === 'quit-edge' || (mode === 'quit-float' && d.drill.step === 'call') || (mode === 'quit-cut' && ctx.fades.length === 1)) ctx.quit = true;
        ctx.input.action = !!a.act; ctx.input.move.x = a.mx || 0; ctx.input.move.y = -(a.mv || 0); ctx.player.update(.05);
        const value = fn(.05); if (value !== undefined) return value;
      }
      assert.fail('stuck');
    }, { level: 'normal' });
    const before = playerState(f.p), children = f.scene.children.slice();
    try {
      if (mode === 'error') await assert.rejects(floatsafe.play(f.ctx), /injected round failure/);
      else { const r = await floatsafe.play(f.ctx); if (mode === 'timeout') { assert.equal(r.detail.complete, false); assert.equal(r.score, 0); } else { assert.equal(r.quit, true); assert.equal(r.score, 0); } }
      assert.deepEqual(playerState(f.p), before, mode); assert.deepEqual(f.scene.children, children); assert.equal(f.ctx.locked, false);
      assert.equal(env.document.getElementById('floatDrill'), null); assert.equal(f.visitor.visible, true); assert.ok(f.signs.every(s => !s.hidden && s.obj.visible));
      assert.deepEqual(f.ctx.lookChanges, [[true, 11], [false]], mode);
      if (mode === 'quit-cut') assert.equal(f.ctx.fades.at(-1), false, 'the screen is never left dark');
    } finally { env.restore(); }
  }
});

test('a Normal swimming lesson through its round: seven skills with the frog stroke, the panel counts nine steps, full marks', async () => {
  const env = dom(); const seen = new Set(); let frogParts = new Set(), steps = '';
  const f = fixture(async (fn, ctx) => {
    for (let i = 0; i < 9000; i++) {
      const d = ctx.debug, local = d.local, phase = d.phase; let act = false, mx = 0, mv = 0;
      if (phase === 'check') { mx = local.x < -.1 ? 1 : 0; act = Math.abs(local.x) < .15; }
      else if (phase === 'entry') { mv = local.z > POOL.entry.z + .1 ? -1 : 0; act = local.z <= POOL.entry.z + .1; }
      else if (phase === 'lesson') { const a = swimBot(d.lesson, .05); act = !!a.act; mx = a.mx || 0; mv = a.mv || 0; seen.add(d.lesson.stage); if (d.snapshot.frog) { frogParts.add(d.snapshot.frog.part); assert.equal(ctx.player.pose, 'Idle', 'the frog stroke is posed, not a clip'); assert.ok(d.body.frog >= 0); } }
      else if (phase === 'out') act = !ctx.input.action;
      ctx.input.action = act; ctx.input.move.x = mx; ctx.input.move.y = -mv; ctx.player.update(.05);
      const value = fn(.05); steps = env.document.getElementById('swimLesson')?.querySelector('.step').textContent || steps;
      if (value !== undefined) return value;
    }
    assert.fail('stuck');
  }, { level: 'normal', trick: 'swimming' });
  const before = playerState(f.p), children = f.scene.children.slice();
  try {
    const result = await swimming.play(f.ctx);
    assert.equal(result.score, 100); assert.equal(result.detail.skills, 7); assert.equal(result.detail.complete, true);
    assert.deepEqual([...seen], ['bubbles', 'float', 'tread', 'frog', 'glide', 'turn', 'swim']); assert.deepEqual([...frogParts].sort(), ['breathe', 'glide', 'kick', 'pull']);
    assert.match(steps, /9\/9/);
    assert.deepEqual(playerState(f.p), before); assert.deepEqual(f.scene.children, children); assert.ok(f.signs.every(s => !s.hidden && s.obj.visible));
  } finally { env.restore(); }
});
