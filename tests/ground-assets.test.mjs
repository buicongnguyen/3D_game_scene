import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GROUND_CLIPS } from './asset-contracts.mjs';

const durations = { Crouch: 3, CrouchWalk: 0.9, CrouchReach: 0.8, CrouchReachHold: 1.5, Kneel: 3, Pickup: 1, SitGrass: 4 };
for (const name of ['mika', 'villager-kid']) test(`${name} ground actions preserve the rig and reach their actual targets`, async () => {
  const b = readFileSync(new URL(`../public/models/${name}.glb`, import.meta.url));
  const g = await new Promise((res, rej) => new GLTFLoader().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', res, rej));
  const boneNames = new Set(); g.scene.traverse(o => { if (o.isBone) boneNames.add(o.name); });
  assert.equal(boneNames.size, name === 'mika' ? 22 : 19, 'no new bones: Low merged skins keep the same rig');
  for (const clip of g.animations.filter(c => GROUND_CLIPS.includes(c.name))) {
    assert.ok(Math.abs(clip.duration - durations[clip.name]) < 1e-6, clip.name);
    const root = clip.tracks.find(t => t.name === 'root.position');
    if (root) assert.ok([...root.values].every(v => Math.abs(v) < 1e-6), `${clip.name}: root stays grounded and in place`);
  }
  const wrist = g.scene.getObjectByName('hand_R'), k = name === 'mika' ? 1 : 1.2 / 1.45;
  const at = (clip, seconds) => {
    const mixer = new THREE.AnimationMixer(g.scene), action = mixer.clipAction(g.animations.find(c => c.name === clip));
    action.play(); mixer.setTime(seconds); g.scene.updateMatrixWorld(true);
    const p = wrist.getWorldPosition(new THREE.Vector3()); action.stop(); mixer.stopAllAction(); return p;
  };
  const grab = at('Pickup', 12 / 30);
  assert.ok(grab.y < 0.15 * k, `grab reaches low object at documented frame 12: ${grab.y}`);
  assert.ok(grab.z > 0.37 * k, `grab is in front of the feet: ${grab.z}`);
  const reach = at('CrouchReach', 0.4);
  // The back folds less than in the first version so that her face stays visible while she watches her hand.
  assert.ok(reach.z > 0.43 * k && reach.y < 0.28 * k, `actual wrist reaches forward/down: ${reach.toArray()}`);
  const head = g.scene.getObjectByName('head'), face = new THREE.Vector3();
  for (const [clip, seconds, least] of [['CrouchReach', 0.4, -0.5], ['CrouchReachHold', 0.5, -0.5], ['Pickup', 0.4, -0.85], ['Crouch', 1, -0.2], ['Kneel', 1, -0.45]]) {
    const mixer = new THREE.AnimationMixer(g.scene), action = mixer.clipAction(g.animations.find(c => c.name === clip));
    action.play(); mixer.setTime(seconds); g.scene.updateMatrixWorld(true);
    face.set(0, 0, 1).transformDirection(head.matrixWorld);
    action.stop(); mixer.stopAllAction();
    assert.ok(face.y > least, `${clip}: her face is not buried in her knees (forward.y ${face.y.toFixed(2)})`);
  }
  const chest = at('Pickup', 0.88);
  assert.ok(chest.y > grab.y + 0.45 * k, 'pickup lifts the object toward the chest');
});

test('all fourteen ground clips pass seam, ground-surface and 0.6 m/s foot-contact validation', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const output = execFileSync(process.execPath, ['art/blender/validate_glb.mjs', '--clips-only', GROUND_CLIPS.join(','), 'mika', 'villager-kid'], { cwd: root, encoding: 'utf8' });
  assert.match(output, /0 error\(s\) in 2 model\(s\)/);
  assert.match(output, /0 ERR, 0 WARN/);
});
