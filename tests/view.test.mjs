// What the camera sees (src/engine/view.js) and the people and animals that hide their bodies when nobody looks
// (actors/npc.js cull + update). A body out of view costs no animation, no matrix walk and no draw; it must never be
// hidden while any of it could be on screen, and it is posed again the frame it comes back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Group, Vector3 } from 'three';
import { View, SHOW_R, HIDE_R } from '../src/engine/view.js';
import { NPC } from '../src/actors/npc.js';

// a phone held upright: 50 degrees up and down, 390 x 844, so the view is a narrow wedge (half-width ~8.6 m at 40 m)
const phone = () => { const c = new PerspectiveCamera(50, 390 / 844, 0.5, 600); c.position.set(0, 2, 0); c.lookAt(0, 2, -50); c.updateMatrixWorld(); return c; };
const EDGE = 40 * Math.tan(Math.atan(Math.tan(25 * Math.PI / 180) * 390 / 844)), COS = Math.cos(Math.atan(Math.tan(25 * Math.PI / 180) * 390 / 844));
const beyond = d => EDGE + d / COS;       // x at 40 m ahead that is d metres outside the side plane

test('before any frame has been seen nothing is hidden', () => {
  assert.equal(View.ready, false);
  assert.equal(View.hides(500, 0, 500, false), false);
  assert.equal(View.hides(500, 0, 500, true), false);
});

test('straight ahead is in view, behind and far to the side are not', () => {
  View.update(phone());
  assert.equal(View.ready, true);
  assert.equal(View.outside(0, 1, -40, 1), false, 'ahead');
  assert.equal(View.outside(0, 1, 40, 1), true, 'behind');
  assert.equal(View.outside(60, 1, -40, 1), true, 'far to the side');
  assert.equal(View.outside(0, 1, -700, 1), true, 'past the far plane');
});

test('a margin that differs by direction: shown until well outside, back as soon as near', () => {
  View.update(phone());
  const at = d => [beyond(d), 1, -40];
  // 2 m outside the edge: inside both margins
  assert.equal(View.hides(...at(2), false), false);
  assert.equal(View.hides(...at(2), true), false);
  // between the two margins: whoever was shown stays shown, whoever was hidden stays hidden (no flicker at the edge)
  const mid = (SHOW_R + HIDE_R) / 2;
  assert.equal(View.hides(...at(mid), false), false, 'a shown body is kept');
  assert.equal(View.hides(...at(mid), true), true, 'a hidden body stays hidden');
  // well outside: hidden either way
  assert.equal(View.hides(...at(HIDE_R + 1.5), false), true);
  assert.equal(View.hides(...at(HIDE_R + 1.5), true), true);
});

test('what a hidden body would show on screen is always shown: the body radius is inside the show margin', () => {
  View.update(phone());
  // a 2.5 m body (a cow) whose edge just touches the view: the check with SHOW_R must already count it as in view
  for (const d of [0, 0.5, 1, 2, 2.5]) assert.equal(View.hides(beyond(d), 1, -40, true), false, `${d} m outside`);
});

// a person or animal without the heavy parts: only what cull() and update() read
function person(extra = {}) {
  const n = Object.create(NPC.prototype), calls = [];
  const root = new Group(), model = new Group(), parent = new Group();
  parent.add(root); root.add(model);
  Object.assign(n, { root, model, pos: new Vector3(0, 0, -40), far: false, shadow: false, visible: true, riding: false, pending: null,
    unseen: false, animAcc: 0, animTick: 0, animEvery: 1, facing: 0, targetFacing: 0, path: null,
    world: { heightAt: () => 0 }, anim: { busy: false, update: dt => calls.push(dt) } }, extra);
  n.calls = calls;
  return n;
}

test('a mid-range person out of view hides its body and keeps its clock; back in view it is posed at once', () => {
  View.update(phone());
  const n = person({ pos: new Vector3(beyond(8), 0, -40) });
  assert.equal(n.cull(View.hides), true);
  assert.equal(n.unseen, true);
  assert.equal(n.model.visible, false);
  // frames pass: no animation, the time is kept
  for (let i = 0; i < 5; i++) n.update(0.033);
  assert.deepEqual(n.calls, [], 'not animated while hidden');
  assert.ok(Math.abs(n.animAcc - 0.165) < 1e-9, 'the clock is kept');
  // she walks into the view
  n.pos.set(0, 0, -40);
  n.cull(View.hides);
  assert.equal(n.unseen, false);
  assert.equal(n.model.visible, true);
  assert.equal(n.calls.length, 1, 'posed once, now');
  assert.ok(Math.abs(n.calls[0] - 0.165) < 1e-9, 'with all the time it missed');
  assert.equal(n.animAcc, 0);
});

test('nobody in the cast is hidden who could be seen or who matters: near ones, gestures, riders, far, not built', () => {
  View.update(phone());
  const out = { pos: new Vector3(500, 0, 500) };
  for (const [why, extra] of [['casts a shadow (near)', { shadow: true }], ['mid-gesture', { anim: { busy: true, update() {} } }], ['riding', { riding: true }],
    ['far (not drawn already)', { far: true }], ['not built yet', { pending: {} }], ['away by the story', { visible: false }]]) {
    const n = person({ ...out, ...extra });
    n.cull(View.hides);
    assert.equal(n.unseen, false, why);
    assert.equal(n.model.visible, true, why);
  }
});

test('a gesture that starts while hidden shows the body again; one that is over lets it hide again', () => {
  View.update(phone());
  const n = person({ pos: new Vector3(500, 0, 500) });
  n.cull(View.hides);
  assert.equal(n.unseen, true);
  n.anim.busy = true;                       // she is asked to wave (a one-shot clip must finish: its callback may be waited for)
  n.cull(View.hides);
  assert.equal(n.unseen, false);
  assert.equal(n.model.visible, true);
  n.anim.busy = false;
  n.cull(View.hides);
  assert.equal(n.unseen, true);
});

test('people taken out of the world are dropped from the list; ?view=off shows everyone', () => {
  const n = person({ pos: new Vector3(500, 0, 500) });
  View.watch(n);
  const before = View.count;
  n.root.removeFromParent();
  View.update(phone());
  assert.equal(View.count, before - 1);
  const m = person({ pos: new Vector3(500, 0, 500) });
  View.watch(m);
  View.enabled = false;
  View.update(phone());
  assert.equal(m.unseen, false, 'off: nothing is hidden');
  View.enabled = true;
  View.update(phone());
  assert.equal(m.unseen, true, 'on again');
  View.unwatch(m);
});
