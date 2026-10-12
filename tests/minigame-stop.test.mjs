import test from 'node:test';
import assert from 'node:assert/strict';
import { stoppableGame, stopGame } from '../src/ui/minigame-stop.js';
import { Tricks } from '../src/game/tricks.js';
import { Yard } from '../src/game/yard/round.js';

const card = () => ({ classList: { contains: () => true, add() {}, remove() {} } });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const tick = () => new Promise(r => setImmediate(r));

test('Stop routes every runner through normal cleanup, releases held input and rejects stale owners', () => {
  for (const kind of ['trick', 'yard', 'fish', 'cook', 'sky', 'workshop']) {
    const calls = [], d = { game: { input: { releaseAll: () => calls.push('input') } }, ui: {}, endMinigame: () => calls.push('cook') };
    if (kind === 'trick') d.tricks = { round: { ctx: {} }, quitRound: () => calls.push(kind) };
    if (kind === 'yard') d.yard = { round: {}, quit: () => calls.push(kind) };
    if (kind === 'fish') d.minigame = { kind, m: { quit: () => { calls.push(kind); return true; } } };
    if (kind === 'cook') d.minigame = { kind };
    if (kind === 'sky') d.sky = { active: {}, stop: hard => { assert.equal(hard, false); calls.push(kind); } };
    if (kind === 'workshop') { d.workshop = { active: true, ctx: {}, s: {}, quit: () => calls.push(kind) }; d.tricks = { round: { ctx: {} } }; }
    const target = stoppableGame(d); assert.equal(target.kind, kind);
    assert.equal(stopGame(d, { ...target, token: {} }), false); assert.deepEqual(calls, []);
    assert.equal(stopGame(d, target), true); assert.deepEqual(calls, ['input', kind]);
    d.ui.overlay = 'pause'; assert.equal(stoppableGame(d), null);
  }
});

test('completed cards and already leaving sessions do not expose a second cancellation', () => {
  const d = { game: {}, ui: {}, tricks: { round: { ctx: { quit: true } } } };
  assert.equal(stoppableGame(d), null);
  d.workshop = { active: true, ctx: {}, s: { done: true } }; assert.equal(stoppableGame(d), null);
  delete d.workshop; d.minigame = { kind: 'fish', m: { phase: 'leaving' } }; assert.equal(stoppableGame(d), null);
  delete d.minigame; d.yard = { round: {}, el: { card: { classList: { contains: () => false } } } }; assert.equal(stoppableGame(d), null);
  d.yard.el.card = card(); d.yard.guide = { isOpen: true }; assert.equal(stoppableGame(d), null);
});

test('a partial-score rural adapter cannot award a stopped round and cleanup still runs', async t => {
  const previous = globalThis.document;
  globalThis.document = { body: { classList: { remove() {} } }, getElementById: () => null };
  t.after(() => { if (previous) globalThis.document = previous; else delete globalThis.document; });
  const calls = [], state = { tricks: {} }, g = { world: { heightAt: () => 0 }, input: { releaseAll() {} }, player: { carry: { want() {}, release: () => calls.push('carry') } }, follow: { clearCutscene: () => calls.push('camera') } };
  const d = { game: g, q: { state }, ui: { prompt() {}, toast() { throw Error('aborted score toast'); } }, ground: { release() {} }, save() {}, audio: { star() { throw Error('aborted stars'); }, good() { throw Error('aborted reward'); } } };
  const runner = Object.assign(Object.create(Tricks.prototype), { d, g, round: null, loops: new Set(), moveHooks: new Set(), el: { card: card(), hud: card(), hint: { ...card(), style: {} } }, teacherOf: () => null, hud() {}, hideHint() {}, results() { throw Error('aborted results card'); }, module: async () => ({ async play(ctx) { await ctx.loop(() => undefined); calls.push('adapter cleanup'); return { score: 100, quit: false }; } }) });
  const playing = runner.play('firefly'); await tick();
  assert.equal(runner.quitRound(), true); assert.equal(runner.quitRound(), false);
  const result = await playing;
  assert.equal(result.quit, true); assert.equal(state.tricks.firefly.plays, 0); assert.equal(state.tricks.firefly.stars, 0);
  assert.equal(runner.round, null); assert.equal(runner.loops.size, 0); assert.equal(g.player.locked, false);
  assert.ok(calls.includes('adapter cleanup') && calls.includes('camera') && calls.includes('carry'));
});

test('yard Stop is sticky before loops exist and blocks a late winning result', async () => {
  for (const early of [true, false]) {
    const gate = deferred(), calls = [], state = { yard: { game: 'oanquan' } };
    const g = { input: { releaseAll() {} }, player: { vel: { set() {} }, carry: { want() {}, release() {} } }, follow: {} };
    const d = { game: g, q: { state }, ui: { prompt() {}, fade: () => early ? gate.promise : Promise.resolve() }, save() {}, audio: { star() { throw Error('aborted yard reward'); } } };
    const runner = Object.assign(Object.create(Yard.prototype), { d, g, round: null, loops: new Set(), el: { card: card() }, current: () => 'oanquan', ready: () => true, endRound: () => calls.push('cleanup'), async runRound() { this.round = { id: 'oanquan' }; await gate.promise; return { stars: 3, won: true, score: 100 }; } });
    const playing = runner.play({}); await tick();
    runner.quit(); gate.resolve(); const result = await playing;
    assert.equal(result.quit, true); assert.equal(state.yard.oanquan, undefined); assert.equal(runner.round, null); assert.equal(runner.locks, false); assert.deepEqual(calls, ['cleanup']);
  }
});

test('yard cancellation during Play again fade cannot start or award another round', async () => {
  const fade = deferred(), state = { yard: { game: 'oanquan' } };
  let rounds = 0;
  const g = { input: { releaseAll() {} }, player: { vel: { set() {} }, carry: { want() {}, release() {} } }, follow: {} };
  const d = { game: g, q: { state }, ui: { prompt() {}, fade: (_, ms) => ms === 220 ? fade.promise : Promise.resolve() }, save() {}, audio: { star() {} } };
  const runner = Object.assign(Object.create(Yard.prototype), { d, g, round: null, loops: new Set(), el: { card: card() }, current: () => 'oanquan', ready: () => true, endRound() {}, results: async () => true,
    async runRound() { rounds++; this.round = { id: 'oanquan' }; return { stars: 3, won: true, score: 100 }; } });
  const playing = runner.play({}); await tick();
  assert.equal(rounds, 1); assert.equal(state.yard.oanquan.plays, 1);
  runner.quit(); fade.resolve(); const result = await playing;
  assert.equal(result.quit, true); assert.equal(rounds, 1); assert.equal(state.yard.oanquan.plays, 1);
  assert.equal(runner.round, null); assert.equal(runner.loops.size, 0);
});

test('O An Quan guide freezes the live loop, resumes the same state and closes on Stop', async () => {
  const sim = { time: 12, pebbles: [5, 5, 5] }, g = { input: { pressed: () => false } };
  const guide = { isOpen: false, hide() { this.isOpen = false; } };
  const runner = Object.assign(Object.create(Yard.prototype), { d: { scenes: {} }, g, round: { id: 'oanquan', sim }, guide, loops: new Set(), ctl: {}, hintLeft: 0, el: { card: card() }, poses: { update() {} }, views: { setNight() {} } });
  const playing = runner.loop(dt => { sim.time += dt; sim.pebbles[0]++; });
  runner.update(.25); const saved = structuredClone(sim);
  guide.isOpen = true;
  for (let i = 0; i < 30; i++) runner.update(.1);
  assert.deepEqual(sim, saved); assert.equal(runner.loops.size, 1);
  guide.isOpen = false; runner.update(.25);
  assert.equal(sim.time, saved.time + .25); assert.equal(sim.pebbles[0], saved.pebbles[0] + 1);
  guide.isOpen = true; runner.quit();
  assert.equal(guide.isOpen, false); assert.equal(runner.loops.size, 0); assert.deepEqual(await playing, { quit: true });
  runner.pad = { dir: -1, hint: true, hold: true, aim: { u: 1 }, pick: 3 }; runner.gpHold = true; runner.stickDir = -1;
  runner.clearPadInput();
  assert.deepEqual(runner.pad, { dir: 0, hint: false, hold: false, aim: null, pick: null });
  assert.equal(runner.gpHold, false); assert.equal(runner.stickDir, 0);
});
