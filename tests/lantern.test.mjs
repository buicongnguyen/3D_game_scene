// Where Mika carries her lantern (src/actors/lantern-carry.js): the rule, the reasons, the sway.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CARRY, SWAY, Reasons, darkLatch, resolveCarry, clipKind, makeSway, stepSway, stepBlend, ease, restLean, lanternLight } from '../src/actors/lantern-carry.js';

const free = { body: false, aim: false, hands: false, held: 0, worn: 0, dark: false, freeFor: 9 };

test('by day it is worn, after dark it is held, once she is free', () => {
  assert.equal(resolveCarry({ ...free, dark: false }, 'held'), 'worn');
  assert.equal(resolveCarry({ ...free, dark: true }, 'worn'), 'held');
});

test('never by herself in mid-action: the state waits until she has been free for a moment', () => {
  for (const prev of ['worn', 'held']) {
    assert.equal(resolveCarry({ ...free, dark: prev === 'worn', freeFor: 0 }, prev), prev);
    assert.equal(resolveCarry({ ...free, dark: prev === 'worn', freeFor: CARRY.settle - 0.01 }, prev), prev);
    assert.notEqual(resolveCarry({ ...free, dark: prev === 'worn', freeFor: CARRY.settle }, prev), prev);
  }
  assert.equal(resolveCarry({ ...free, dark: true, freeFor: undefined }, 'worn'), 'worn');
});

test('the dark has hysteresis: it does not flip at the threshold', () => {
  assert.equal(darkLatch(CARRY.darkOn - 0.01, false), false);
  assert.equal(darkLatch(CARRY.darkOn, false), true);
  assert.equal(darkLatch(CARRY.darkOn - 0.1, true), true);
  assert.equal(darkLatch(CARRY.darkOff, true), false);
  assert.ok(CARRY.darkOn - CARRY.darkOff >= 0.15);
  // a level that trembles around the threshold changes the answer once
  let d = false, flips = 0;
  for (let i = 0; i < 200; i++) { const n = CARRY.darkOn + (i % 2 ? 0.03 : -0.03); const was = d; d = darkLatch(n, d); if (d !== was) flips++; }
  assert.equal(flips, 1);
  // dusk to night and back to morning: one change each way
  d = false; flips = 0;
  for (let i = 0; i <= 400; i++) { const n = i <= 200 ? i / 200 : (400 - i) / 200; const was = d; d = darkLatch(n, d); if (d !== was) flips++; }
  assert.equal(flips, 2);
});

test('priorities: body > asked held > aiming > asked worn > hand gesture > the dark', () => {
  const night = { ...free, dark: true };
  // hands busy at night: on the belt at once (no waiting), and it stays there while the gesture lasts
  assert.equal(resolveCarry({ ...night, hands: true, freeFor: 0 }, 'held'), 'worn');
  // an activity that asked for free hands
  assert.equal(resolveCarry({ ...night, worn: 1 }, 'held'), 'worn');
  // the night river: in her hand even by day, even while she cheers, even with the round's own "worn"
  assert.equal(resolveCarry({ ...free, held: 1, worn: 1, hands: true, freeFor: 0 }, 'worn'), 'held');
  // aiming holds it out, also by day and during a "worn" activity
  assert.equal(resolveCarry({ ...free, aim: true, worn: 1, freeFor: 0 }, 'worn'), 'held');
  // swimming, sitting, climbing, hanging from the kite: always on the belt
  assert.equal(resolveCarry({ ...night, body: true, held: 1, aim: true }, 'held'), 'worn');
});

test('clips: which ones free her hands, which ones carry', () => {
  for (const c of ['Cast', 'Reel', 'Cheer', 'Stir', 'Talk', 'Hammer', 'Pet', 'Interact']) assert.equal(clipKind(c), 'hands', c);
  for (const c of ['Sit', 'SitFloor', 'Swim', 'Tread', 'Hang']) assert.equal(clipKind(c), 'body', c);
  for (const c of ['Idle', 'Walk', 'Run', 'Jump', 'Fall', 'Land']) assert.equal(clipKind(c), 'carry', c);
  assert.equal(clipKind('Aim'), 'aim');
  assert.equal(clipKind('SomethingNew'), 'other');
});

test('reasons are kept by key: asking twice is one wish, releasing an unknown key is harmless', () => {
  const r = new Reasons();
  r.want('worn', 'fishing'); r.want('worn', 'fishing');
  assert.deepEqual([r.worn, r.held], [1, 0]);
  r.want('held', 'river');
  assert.deepEqual([r.worn, r.held], [1, 1]);
  r.want('held', 'fishing');                 // the same key changes its mind
  assert.deepEqual([r.worn, r.held], [0, 2]);
  r.release('nobody'); r.release('fishing'); r.release('fishing');
  assert.deepEqual([r.worn, r.held], [0, 1]);
  r.want('auto', 'river');
  assert.deepEqual([r.worn, r.held, r.keys().length], [0, 0, 0]);
  r.want('sideways', 'x');
  assert.equal(r.keys().length, 0);
});

test('a whole evening: fishing at dusk, then the walk home', () => {
  const r = new Reasons();
  let state = 'worn', dark = false, freeFor = 9;
  const tick = (night, o = {}) => {
    dark = darkLatch(night, dark);
    freeFor = o.busy ? 0 : freeFor + 0.1;
    state = resolveCarry({ ...free, ...o, held: r.held, worn: r.worn, dark, freeFor }, state);
    return state;
  };
  assert.equal(tick(0.1), 'worn');
  r.want('worn', 'fishing');
  for (let n = 0.1; n < 1; n += 0.05) assert.equal(tick(n, { hands: true, busy: true }), 'worn');   // night falls while she fishes
  r.release('fishing');
  assert.equal(tick(1, { busy: true }), 'worn');     // the last gesture still plays
  for (let i = 0; i < 4; i++) assert.equal(tick(1), 'worn');
  assert.equal(tick(1), 'held');                     // free for half a second: she takes it in her hand
  assert.equal(tick(1, { hands: true, busy: true }), 'worn');
});

test('the blend takes CARRY.blend seconds and stays in 0..1', () => {
  let t = 0, n = 0;
  while (t < 1 && n < 1000) { t = stepBlend(t, 'held', 1 / 60); n++; }
  assert.ok(Math.abs(n / 60 - CARRY.blend) < 0.03, `took ${n / 60}s`);
  assert.equal(stepBlend(1, 'held', 5), 1);
  assert.equal(stepBlend(0.2, 'worn', 5), 0);
  assert.equal(ease(0), 0); assert.equal(ease(1), 1); assert.equal(ease(0.5), 0.5); assert.equal(ease(7), 1);
});

test('the sway stays bounded whatever pushes it', () => {
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (const worn of [false, true]) {
    const s = makeSway();
    for (let i = 0; i < 20000; i++) {
      const dt = [1 / 144, 1 / 60, 1 / 30, 1 / 20, 0.4, 0, 1e-4][Math.floor(rnd() * 7)];
      const big = rnd() < 0.05 ? 1e6 : 60;
      let ax = (rnd() * 2 - 1) * big, az = (rnd() * 2 - 1) * big;
      if (rnd() < 0.01) ax = NaN;
      if (rnd() < 0.01) az = Infinity;
      stepSway(s, ax, az, dt, worn);
      assert.ok(Number.isFinite(s.x) && Number.isFinite(s.z) && Number.isFinite(s.vx) && Number.isFinite(s.vz));
      assert.ok(Math.abs(s.z) <= SWAY.max + 1e-9);
      if (worn) assert.ok(s.x >= -SWAY.wornOut - 1e-9 && s.x <= SWAY.wornIn + 1e-9, `worn x ${s.x}`);
      else assert.ok(Math.abs(s.x) <= SWAY.max + 1e-9);
    }
  }
});

test('the sway answers a push the right way and comes to rest', () => {
  const s = makeSway();
  for (let i = 0; i < 12; i++) stepSway(s, 0, 6, 1 / 60);        // she starts forward: the lantern lags behind
  assert.ok(s.z < -0.02, `z ${s.z}`);
  let peak = 0;
  for (let i = 0; i < 60 * 6; i++) { stepSway(s, 0, 0, 1 / 60); if (i > 60 * 5) peak = Math.max(peak, Math.abs(s.z), Math.abs(s.x)); }
  assert.ok(peak < 0.003, `still swinging: ${peak}`);
  // a steady run (footfalls at ~4.6 Hz) only makes it tremble
  const r = makeSway(); let m = 0;
  for (let i = 0; i < 600; i++) { stepSway(r, Math.sin(i / 60 * 29) * 5, Math.cos(i / 60 * 29) * 5, 1 / 60, true); if (i > 120) m = Math.max(m, Math.abs(r.x), Math.abs(r.z)); }
  assert.ok(m < 0.3, `run sway ${m}`);
  // the frame rate does not change the result much
  const a = makeSway(), b = makeSway();
  for (let i = 0; i < 30; i++) stepSway(a, 3, 0, 1 / 30);
  for (let i = 0; i < 120; i++) stepSway(b, 3, 0, 1 / 120);
  assert.ok(Math.abs(a.x - b.x) < 0.02, `${a.x} vs ${b.x}`);
});

test('sitting, the lantern leans out to rest on the seat instead of sinking into it', () => {
  assert.equal(restLean(0.5, 0.3), 0);
  assert.equal(restLean(0.3, 0.3), 0);
  const l = restLean(0.15, 0.3);
  assert.ok(Math.abs(Math.cos(l) * 0.3 - 0.15) < 1e-9);
  assert.ok(restLean(-1, 0.3) <= 1.35 && restLean(0, 0.3) <= 1.35);
  assert.equal(restLean(0.1, 0), 0);
});

test('its light: nothing by day, a smaller and dimmer pool on the belt than in her hand', () => {
  assert.equal(lanternLight(1, 0).level, 0);
  assert.equal(lanternLight(0, 0.2).level, 0);
  const worn = lanternLight(0, 1), held = lanternLight(1, 1);
  assert.ok(worn.level > 0.3 && worn.level < held.level && held.level === 1);
  assert.ok(worn.range < held.range);
  for (let b = 0; b <= 1; b += 0.1) for (let n = 0; n <= 1; n += 0.1) { const L = lanternLight(b, n); assert.ok(L.level >= 0 && L.level <= 1 && L.range > 0); }
});
