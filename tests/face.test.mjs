// The small face rig (src/actors/face.js): blinks on its own, moves the lips while a line is shown, stops when quiet or off.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Face } from '../src/actors/face.js';

function model() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  const head = new THREE.Bone(); head.name = 'head';
  const skel = new THREE.Skeleton([head]);
  const mesh = new THREE.SkinnedMesh(g, new THREE.MeshBasicMaterial());
  mesh.add(head); mesh.bind(skel);
  mesh.morphTargetDictionary = { blink: 0, mouthA: 1, mouthO: 2 };
  mesh.morphTargetInfluences = [0, 0, 0];
  const root = new THREE.Group(); root.add(mesh);
  return { root, mesh };
}

test('a model without the morphs has no face', () => {
  assert.equal(Face.attach(new THREE.Group()), null);
});

test('blinks within six seconds, lips move only while a line is shown, and switching off rests the face', () => {
  const { root, mesh } = model();
  const f = Face.attach(root);
  assert.ok(f);
  let blinked = 0, mouth = 0;
  for (let i = 0; i < 400; i++) { f.update(1 / 60); blinked = Math.max(blinked, mesh.morphTargetInfluences[0]); mouth = Math.max(mouth, mesh.morphTargetInfluences[1]); }
  assert.ok(blinked > 0.5, 'a blink');
  assert.equal(mouth, 0, 'no lips without a line');
  f.speak('Oh! Hello. I am Kotone.');
  let open = 0;
  for (let i = 0; i < 60; i++) { f.update(1 / 60); open = Math.max(open, mesh.morphTargetInfluences[1]); }
  assert.ok(open > 0.3 && open <= 0.8, `lips move (${open.toFixed(2)})`);
  f.quiet();
  for (let i = 0; i < 30; i++) f.update(1 / 60);
  assert.ok(mesh.morphTargetInfluences[1] < 0.02, 'quiet closes the mouth');
  f.speak('More words'); f.update(1 / 60);
  f.setEnabled(false);
  assert.deepEqual(mesh.morphTargetInfluences, [0, 0, 0], 'off: everything at rest');
});

// The happy face (owner 2026-11-28: "all the faces look a little sad"; "happy like the Avatar Studio anime girls").
test('a resting smile, brighter with the mood, giving way to an open or round mouth and to a blink', async () => {
  const { smileFor, SMILE } = await import('../src/actors/face.js');
  const [rest, restEyes] = smileFor(SMILE.rest), [bright, brightEyes] = smileFor(.9);
  assert.ok(rest > .3 && restEyes > .1, `rest ${rest} / ${restEyes}`);
  assert.ok(bright > rest && brightEyes > restEyes && bright <= SMILE.max && brightEyes < .4, 'brighter, never a full "^^"');
  assert.ok(smileFor(.9, .85)[0] < bright * .7, 'a wide "ah" keeps less smile (the VRoid Fun corners sit well on an open A)');
  assert.ok(smileFor(.9, 0, .7)[0] < bright * .5, 'a round "oh" keeps little smile');
  assert.equal(smileFor(.9, 0, 0, 1)[1], 0, 'no eye smile through a blink');
});

test('the face drives smile / smileEyes / browUp / wink and rests them when off; its life over a song', async () => {
  const { faceLife } = await import('../src/actors/face.js');
  const { root, mesh } = model();
  mesh.morphTargetDictionary = { blink: 0, mouthA: 1, mouthO: 2, smile: 3, smileEyes: 4, browUp: 5, wink: 6 };
  mesh.morphTargetInfluences = [0, 0, 0, 0, 0, 0, 0];
  const f = Face.attach(root);
  for (let i = 0; i < 60; i++) f.update(1 / 60);
  assert.ok(mesh.morphTargetInfluences[3] > .3, 'a resting smile');
  f.setMood(1); for (let i = 0; i < 120; i++) f.update(1 / 60);
  assert.ok(mesh.morphTargetInfluences[3] > .6, 'brighter');
  f.setEnabled(false);
  assert.deepEqual(mesh.morphTargetInfluences, [0, 0, 0, 0, 0, 0, 0]);
  // a minute of phrases (1.8 s sung, 1.2 s rest) on a bright part: grins in the gaps, brow lifts, a wink now and then
  let grin = 0, brow = 0, winks = 0, prev = 0;
  const life = faceLife(11);
  for (let i = 0; i < 3600; i++) { const t = i / 60, o = life(1 / 60, t % 3 < 1.8 ? .5 : 0, .85);
    grin = Math.max(grin, o.grin); brow = Math.max(brow, o.brow); if (o.wink > 0 && prev === 0) winks++; prev = o.wink;
    if (o.wink > 0) assert.ok(t % 3 >= 1.8, 'a wink only in the gap after a phrase'); }
  assert.ok(grin > .2 && brow > .3, `grin ${grin}, brow ${brow}`);
  assert.ok(winks >= 1 && winks <= 8, `${winks} winks in 20 phrases`);
  let calmWinks = 0; const calm = faceLife(11); prev = 0;
  for (let i = 0; i < 3600; i++) { const o = calm(1 / 60, (i / 60) % 3 < 1.8 ? .5 : 0, .55); if (o.wink > 0 && prev === 0) calmWinks++; prev = o.wink; }
  assert.equal(calmWinks, 0, 'no winks on a calm verse');
});
