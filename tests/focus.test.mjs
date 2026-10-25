// Focus mode bookkeeping (src/engine/focus.js) and the round-light profile (src/game/round-light.js): what is switched
// off for a mini game round comes back exactly, whatever the order of entering and leaving, and after an error.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Stubs, Hidden, FocusStack, enterFocus, exitFocus, exitAllFocus, focusSupported } from '../src/engine/focus.js';
import { RoundLight, ROUND_FLOOR, TOWN_EVERY } from '../src/game/round-light.js';

// ---- a stand-in game: just enough of Game for focus mode to switch things off (nothing is drawn in Node)
class Sys { constructor() { this.n = 0; } update() { this.n++; return 'real'; } }
function fakeGame() {
  const canvas = { listeners: new Set(), addEventListener(t, f) { this.listeners.add(f); }, removeEventListener(t, f) { this.listeners.delete(f); } };
  const g = {
    scene: { children: [], traverse() {} },
    renderer: { renderWorld() {}, focus: null, shadowDirty: false, renderer: { copyFramebufferToTexture() {}, domElement: canvas, shadowMap: { needsUpdate: false } } },
    railway: new Sys(), kite: new Sys(), underwater: new Sys(), riverbed: new Sys(), interiors: new Sys(), celebrate: new Sys(), lights: new Sys(), grass: new Sys(), player: new Sys(),
    world: { n: 0, lamps: ['lamp'], update() { this.n++; return { night: 0.25 }; } },
    structures: { n: 0, update() { this.n++; }, cull() { this.n++; }, lampReflections() { return ['fresh']; } },
    foliage: { n: 0, update() { this.n++; }, updateShadows() { this.n++; } },
    assets: { n: 0, setGlow() { this.n++; } },
    fx: { t: 0, n: 0, glow: { n: 0, update() { this.n++; } }, soft: { n: 0, update() { this.n++; } }, update() { this.n++; } },
  };
  g.player.pos = { x: 0, y: 0, z: 0 };
  return g;
}
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const METHODS = [['railway', 'update'], ['kite', 'update'], ['underwater', 'update'], ['riverbed', 'update'], ['interiors', 'update'], ['celebrate', 'update'], ['lights', 'update'], ['grass', 'update'],
  ['player', 'update'], ['world', 'update'], ['structures', 'update'], ['structures', 'cull'], ['structures', 'lampReflections'], ['foliage', 'update'], ['foliage', 'updateShadows'], ['assets', 'setGlow'], ['fx', 'update']];
/** Every method focus mode may stand in for: the function itself and whether it is the object's own. */
const snap = g => METHODS.map(([o, k]) => [g[o][k], own(g[o], k)]);
const game = () => { const g = fakeGame(); g.was = snap(g); return g; };
const clean = g => { assert.deepEqual(snap(g), g.was); return true; };

test('Stubs: methods are replaced and put back exactly, inherited ones stay inherited', () => {
  const s = new Stubs(), a = new Sys(), b = { update: () => 'own' }, keep = b.update;
  assert.equal(s.set(a, 'update', () => 'stub'), true);
  assert.equal(s.set(b, 'update', () => 'stub'), true);
  assert.equal(s.set(null, 'update', () => {}), false);
  assert.equal(s.set(a, 'nothing', () => {}), false);
  assert.equal(a.update(), 'stub'); assert.equal(b.update(), 'stub'); assert.equal(a.n, 0);
  s.restore();
  assert.equal(own(a, 'update'), false, 'an inherited method is inherited again');
  assert.equal(a.update(), 'real');
  assert.equal(b.update, keep, 'an own method is the same function again');
  assert.equal(s.size, 0);
  s.restore();                                   // twice is harmless
  // the original can still be reached while the stand-in is on (the still picture needs the real culling once)
  s.set(a, 'update', () => 'stub'); s.set(b, 'update', () => 'stub');
  const n0 = a.n;
  assert.equal(s.real(a, 'update')(), 'real'); assert.equal(a.n, n0 + 1);
  assert.equal(s.real(b, 'update')(), 'own');
  assert.equal(s.real(a, 'nothing'), null); assert.equal(s.real(null, 'update'), null);
  assert.equal(s.real(new Sys(), 'update')(), 'real', 'not stood in for: the method itself');
  s.restore();
  assert.equal(a.update(), 'real');
});

test('Stubs: the same method stubbed twice unwinds in order; a replacement made by somebody else is left alone', () => {
  const s = new Stubs(), a = new Sys();
  s.set(a, 'update', () => 1); s.set(a, 'update', () => 2);
  assert.equal(a.update(), 2);
  s.restore();
  assert.equal(own(a, 'update'), false);
  const t = new Stubs(), b = new Sys(), theirs = () => 'theirs';
  t.set(b, 'update', () => 'mine');
  b.update = theirs;                             // (a test harness wrapped it meanwhile)
  t.restore();
  assert.equal(b.update, theirs);
});

test('Hidden: every object gets its own visibility back', () => {
  const h = new Hidden(), a = { visible: true }, b = { visible: false }, c = { visible: true };
  h.hide([a, b, null]); h.hide([a, c]);
  assert.deepEqual([a.visible, b.visible, c.visible], [false, false, false]);
  h.restore();
  assert.deepEqual([a.visible, b.visible, c.visible], [true, false, true]);
});

test('FocusStack: the session entered last is in force; leaving it brings the one before back', () => {
  const log = [], st = new FocusStack({ on: s => log.push(`on ${s.id}`), off: s => log.push(`off ${s.id}`) });
  const a = { id: 'a' }, b = { id: 'b' };
  st.enter(a); st.enter(a);                      // twice: still once
  assert.deepEqual(log, ['on a']);
  st.enter(b);
  assert.deepEqual(log, ['on a', 'off a', 'on b']);
  assert.equal(st.exit(b), true);
  assert.equal(st.exit(b), false, 'leaving twice does nothing');
  assert.deepEqual(log, ['on a', 'off a', 'on b', 'off b', 'on a']);
  st.exit(a);
  assert.equal(st.active, null);
  assert.equal(log.at(-1), 'off a');
});

test('FocusStack: leaving a session that is not on top does not disturb the one in force', () => {
  const log = [], st = new FocusStack({ on: s => log.push(`on ${s.id}`), off: s => log.push(`off ${s.id}`) });
  const a = { id: 'a' }, b = { id: 'b' };
  st.enter(a); st.enter(b);
  log.length = 0;
  st.exit(a);
  assert.deepEqual(log, []);
  assert.equal(st.active, b);
  st.exit(b);
  assert.deepEqual(log, ['off b']);
  assert.equal(st.active, null);
});

test('FocusStack: a session that cannot start is undone and the one below stays in force', () => {
  const log = [], st = new FocusStack({ on: s => { if (s.bad) throw new Error('no'); log.push(`on ${s.id}`); }, off: s => log.push(`off ${s.id}`) });
  const a = { id: 'a' }, bad = { id: 'x', bad: true };
  const err = console.error; console.error = () => {};
  try { st.enter(a); st.enter(bad); } finally { console.error = err; }
  assert.equal(bad.dead, true);
  assert.equal(st.active, a);
  assert.deepEqual(log, ['on a', 'off a', 'off x', 'on a']);
});

test('enterFocus: the valley stands still while it is on and is given back exactly on exit', () => {
  const g = game();
  assert.equal(focusSupported(g), true);
  const f = enterFocus(g, { keep: [{ id: 1 }], sim: 'all', backdrop: 'plain' });
  assert.equal(f.active, true);
  assert.equal(g.focus, f); assert.equal(g.renderer.focus, f);
  assert.equal(g.world.n, 1, 'the sky is asked once for the light of the still picture');
  for (const k of ['railway', 'kite', 'underwater', 'riverbed', 'interiors', 'celebrate', 'lights', 'grass', 'player']) { g[k].update(0.016); assert.equal(g[k].n, 0, `${k} stands still`); }
  assert.deepEqual(g.world.update(0.016), { night: 0.25 }, 'the frame still gets its light');
  assert.equal(g.world.n, 1);
  g.structures.update(); g.structures.cull(); g.foliage.update(); g.foliage.updateShadows(); g.assets.setGlow('x', 1);
  assert.equal(g.structures.n + g.foliage.n + g.assets.n, 0);
  assert.deepEqual(g.structures.lampReflections(), ['lamp']);
  g.fx.update(0.016);
  assert.equal(g.fx.n, 0); assert.equal(g.fx.glow.n, 1, 'sparks still fly'); assert.equal(g.fx.soft.n, 1);
  assert.equal(g.renderer.renderer.domElement.listeners.size, 1);
  f.exit();
  assert.equal(f.active, false);
  assert.equal(g.focus, null); assert.equal(g.renderer.focus, null);
  assert.equal(clean(g), true, 'no stand-in is left on any system');
  assert.equal(g.renderer.shadowDirty, true, 'the shadow map is drawn again');
  assert.equal(g.renderer.renderer.domElement.listeners.size, 0);
  g.railway.update(); g.player.update(); g.fx.update();
  assert.deepEqual([g.railway.n, g.player.n, g.fx.n], [1, 1, 1]);
  f.exit(); exitFocus(f); exitFocus(null);       // again, and with nothing: harmless
  assert.equal(clean(g), true);
});

test("enterFocus: sim 'actors' leaves Mika alive, sim 'none' leaves everything alive", () => {
  const g = game();
  const a = enterFocus(g, { sim: 'actors', backdrop: 'plain', actors: [{ id: 'kid' }] });
  g.player.update(); g.railway.update();
  assert.deepEqual([g.player.n, g.railway.n], [1, 0]);
  assert.equal(a.actors.size, 1);
  a.exit();
  const n = enterFocus(g, { sim: 'none', backdrop: 'plain' });
  assert.equal(n.sim, null);
  g.railway.update(); g.world.update();
  assert.deepEqual([g.railway.n, g.world.n], [1, 2]);       // (1 from the first session's light, 1 now)
  n.exit();
  assert.equal(clean(g), true);
});

test('enterFocus: nested and out-of-order sessions restore exactly', () => {
  const g = game();
  const a = enterFocus(g, { sim: 'actors', backdrop: 'plain' });
  const b = enterFocus(g, { sim: 'all', backdrop: 'plain' });
  assert.equal(g.focus, b); assert.equal(a.active, false);
  g.player.update(); assert.equal(g.player.n, 0, 'the inner session holds Mika');
  b.exit();
  assert.equal(g.focus, a); assert.equal(a.active, true);
  g.player.update(); assert.equal(g.player.n, 1, 'the outer session is back: Mika lives');
  g.railway.update(); assert.equal(g.railway.n, 0);
  const c = enterFocus(g, { sim: 'all', backdrop: 'plain' });
  a.exit();                                      // the outer one leaves first
  assert.equal(g.focus, c);
  g.railway.update(); assert.equal(g.railway.n, 0);
  c.exit();
  assert.equal(g.focus, null);
  assert.equal(clean(g), true);
  // a hard reset with two open
  enterFocus(g, { backdrop: 'plain' }); enterFocus(g, { backdrop: 'plain' });
  exitAllFocus(g);
  assert.equal(g.focus, null); assert.equal(g.renderer.focus, null);
  assert.equal(clean(g), true);
});

test('enterFocus: the kept list can grow and shrink during a round', () => {
  const g = fakeGame(), o1 = { id: 1 }, o2 = { id: 2 };
  const f = enterFocus(g, { keep: [o1, null], backdrop: 'plain' });
  f.dirty = false;
  f.keep(o2, [o1]);
  assert.equal(f.kept.size, 2); assert.equal(f.dirty, true);
  f.dirty = false;
  f.drop(o1); f.drop(o1);
  assert.equal(f.kept.size, 1); assert.equal(f.dirty, true);
  f.exit();
  assert.equal(f.kept.size, 0);
});

test('enterFocus: where it is not possible the handle does nothing and nothing is touched', () => {
  const g = game();
  delete g.renderer.renderWorld;
  assert.equal(focusSupported(g), false);
  const f = enterFocus(g, { keep: [{}] });
  assert.equal(f.active, false);
  f.keep({}).drop({}); f.hide({}); f.recapture(); f.exit();
  assert.equal(g.focus, undefined);
  assert.equal(clean(g), true);
  assert.equal(enterFocus(null).active, false);
  // switched off by hand (to measure what it gains)
  const off = game(); off.params = new URLSearchParams('focus=off');
  assert.equal(enterFocus(off, {}).active, false);
});

test('enterFocus: an error while a system is switched off still leaves the game whole', () => {
  const g = game();
  g.world.update = () => { throw new Error('sky fell'); };
  g.was = snap(g);
  const err = console.error; console.error = () => {};
  let f;
  try { f = enterFocus(g, { sim: 'all' }); } finally { console.error = err; }
  assert.equal(f.active, false, 'the caller gets the do-nothing handle');
  assert.equal(g.focus ?? null, null); assert.equal(g.renderer.focus, null);
  assert.equal(clean(g), true);
  f.exit();
});

test('a focus still refreshes cell culling with its actual camera before each changed picture', () => {
  const g = fakeGame(), camera = new THREE.PerspectiveCamera(55, 16 / 9, .35, 4600);
  const calls = [], pictures = [];
  g.camera = new THREE.PerspectiveCamera(); // The round may capture from a camera other than the follow camera.
  g.renderer.q = { propDist: 100, buildDist: 300 };
  g.renderer.renderer.getDrawingBufferSize = out => out.set(1280, 720);
  g.structures.cull = (at, q, view) => {
    assert.equal(at, camera.position); assert.equal(q, g.renderer.q);
    assert.equal(view, camera, 'a stale follow-camera frustum must not hide the round backdrop');
    calls.push(view.matrixWorld.elements.slice());
  };
  g.renderer.renderWorld = () => {
    assert.equal(calls.length, pictures.length + 1, 'cell visibility is refreshed before drawing');
    pictures.push(calls.at(-1));
  };
  const f = enterFocus(g, { hold: true, sim: 'all' });
  camera.position.set(250, 30, -100); camera.lookAt(200, 0, -110);
  f.render(g.renderer, g.scene, camera);
  f.render(g.renderer, g.scene, camera);
  assert.equal(pictures.length, 1, 'an unchanged still needs no new culling or draw');
  camera.position.set(500, 40, 100); camera.lookAt(450, 0, 90);
  f.render(g.renderer, g.scene, camera);
  assert.equal(pictures.length, 2); assert.notDeepEqual(pictures[0], pictures[1]);
  f.exit();
});

// ---- round-light
function lightGame({ quality = 'low', night = 0 } = {}) {
  const R = { floor: 0, floors: [], qualityName: quality, q: { bloom: true }, bloom: { enabled: true }, setFloor(n) { this.floor = n; this.floors.push(n); } };
  return { renderer: R, fx: { weatherHold: false }, night, params: new URLSearchParams() };
}

test('RoundLight: on with the first owner, off with the last, everything as it was', () => {
  const g = lightGame(), L = new RoundLight(g);
  L.hold('menu');
  assert.equal(L.on, true);
  assert.equal(g.renderer.floor, ROUND_FLOOR); assert.equal(g.fx.weatherHold, true);
  L.hold('trick'); L.hold('trick');
  assert.deepEqual(g.renderer.floors, [ROUND_FLOOR], 'a second owner switches nothing again');
  L.frame(0.016);
  assert.equal(g.renderer.bloom.enabled, false, 'by day the Low tier drops bloom');
  L.release('trick');
  assert.equal(L.on, true, 'the menu still holds it');
  L.release('menu'); L.release('menu');
  assert.equal(L.on, false);
  assert.equal(g.renderer.floor, 0); assert.equal(g.fx.weatherHold, false); assert.equal(g.renderer.bloom.enabled, true);
});

test('RoundLight: a floor set by somebody else (the scene tour) is kept and given back', () => {
  const g = lightGame(), L = new RoundLight(g);
  g.renderer.floor = 3;
  L.hold('yard');
  assert.equal(g.renderer.floor, 3, 'never lighter than what was asked before');
  L.release('yard');
  assert.equal(g.renderer.floor, 3);
});

test('RoundLight: bloom stays at night and on the desktop tiers', () => {
  const n = lightGame({ night: 0.9 }), L = new RoundLight(n);
  L.hold('trick'); L.frame(0.016);
  assert.equal(n.renderer.bloom.enabled, true);
  n.night = 0; L.frame(0.016);
  assert.equal(n.renderer.bloom.enabled, false);
  n.night = 1; L.frame(0.016);
  assert.equal(n.renderer.bloom.enabled, true, 'a round that turns to night (fireflies) gets its glow back');
  const d = lightGame({ quality: 'high' }), D = new RoundLight(d);
  D.hold('trick'); D.frame(0.016);
  assert.equal(d.renderer.bloom.enabled, true);
});

test('RoundLight: Town Life gets all the time that passed, every few frames', () => {
  const g = lightGame(), L = new RoundLight(g);
  L.hold('trick');
  let ran = 0, time = 0;
  for (let i = 0; i < TOWN_EVERY * 5; i++) { const t = L.frame(0.02); if (t > 0) { ran++; time += t; } }
  assert.equal(ran, 5);
  assert.ok(Math.abs(time - TOWN_EVERY * 5 * 0.02) < 1e-9, 'no time is lost');
  // a long hitch is not passed on as one giant step
  let big = 0;
  for (let i = 0; i < TOWN_EVERY; i++) big = L.frame(1) || big;
  assert.equal(big, 0.25);
});

test('RoundLight: switched off by hand it does nothing', () => {
  const g = lightGame(); g.params = new URLSearchParams('roundlight=off');
  const L = new RoundLight(g);
  L.hold('trick');
  assert.equal(L.on, false); assert.equal(g.renderer.floor, 0); assert.equal(g.fx.weatherHold, false);
  L.release('trick');
  assert.equal(L.on, false);
});

test('RoundLight: the menu lets go a little after a game, unless the next one starts first', async () => {
  const g = lightGame(), L = new RoundLight(g);
  L.hold('menu');
  L.releaseLater('menu', 0.03);
  assert.equal(L.on, true);
  L.hold('menu');                                // the next game was picked
  await new Promise(r => setTimeout(r, 60));
  assert.equal(L.on, true);
  L.releaseLater('menu', 0.02);
  await new Promise(r => setTimeout(r, 60));
  assert.equal(L.on, false);
  L.releaseLater('menu', 0.01);                  // not held: nothing to do
  assert.equal(L.linger, null);
});

test('focus is for phones and slow machines: a strong desktop keeps the live valley', async () => {
  const { focusWanted } = await import('../src/engine/focus.js');
  assert.equal(focusWanted('low', false), true);
  assert.equal(focusWanted('medium', false), false);
  assert.equal(focusWanted('high', false), false);
  assert.equal(focusWanted('high', true), true, 'a desktop whose frames run slow gets the still picture too');
  assert.equal(focusWanted(undefined, false), true);
});
