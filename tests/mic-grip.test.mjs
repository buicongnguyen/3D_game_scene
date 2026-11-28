// The hand mic in the lead singer's fist (game/perform/mic-grip.js, mic-prop.js, mic-layer.js, plan.js spans): the
// grip fitted on each VRoid body (the handle clear of the palm and fingers, the fingers closed round it, the thumb over
// it), the capsule aimed at the lips, and the mic in her hand for every sung line and every move danced with it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { fitMicGrip, aimMic, MIC_GRIP } from '../src/game/perform/mic-grip.js';
import { makeMic } from '../src/game/perform/mic-prop.js';
import { createBeatClock } from '../src/game/perform/beat-clock.js';
import { planPerformance, micShown } from '../src/game/perform/plan.js';
import { SINGING } from '../src/game/perform/mic-layer.js';
import { KOTONE_SONGS } from '../src/content/kotone-songs.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
async function load(file) {   // textures stripped (Node has no image decoder)
  const bytes = readFileSync(path.join(ROOT, 'public/models', file)), size = bytes.readUInt32LE(12), json = JSON.parse(bytes.subarray(20, 20 + size));
  const strip = v => { if (!v || typeof v !== 'object') return; for (const k of Object.keys(v)) { if (/Texture$/.test(k)) delete v[k]; else strip(v[k]); } };
  json.materials?.forEach(strip); delete json.textures; delete json.images; delete json.samplers;
  json.extensionsRequired = (json.extensionsRequired || []).filter(x => !/texture/i.test(x));
  const enc = Buffer.from(JSON.stringify(json)), pad = Buffer.alloc(Math.ceil(enc.length / 4) * 4, 32); enc.copy(pad);
  const bin = Buffer.concat([Buffer.alloc(20), pad, bytes.subarray(20 + size)]);
  [0x46546c67, 2, bin.length, pad.length, 0x4e4f534a].forEach((v, i) => bin.writeUInt32LE(v, i * 4));
  const l = new GLTFLoader(); l.setMeshoptDecoder(MeshoptDecoder);
  return (await l.parseAsync(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.length), '')).scene;
}

/** Nearest skin (triangle samples, all corners led by the part's bones) to the mic handle's axis, per part, minus r (mm). */
function gaps(model, mic, r, half) {
  model.updateMatrixWorld(true);
  const C = mic.getWorldPosition(new THREE.Vector3()), X = new THREE.Vector3(0, 1, 0).applyQuaternion(mic.getWorldQuaternion(new THREE.Quaternion()));
  const out = {}, a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), p = new THREE.Vector3();
  model.traverse(m => {
    if (!m.isSkinnedMesh) return;
    const si = m.geometry.attributes.skinIndex, sw = m.geometry.attributes.skinWeight, ix = m.geometry.index;
    const part = i => { let best = 0, w = 0; for (let k = 0; k < 4; k++) if (sw.getComponent(i, k) > w) { w = sw.getComponent(i, k); best = si.getComponent(i, k); } const n = m.skeleton.bones[best].name, f = /^(index|middle|ring|pinky|thumb)\d_R$/.exec(n); return f ? f[1] : n === 'hand_R' ? 'palm' : null; };
    for (let t = 0; t + 2 < ix.count; t += 3) {
      const v = [ix.getX(t), ix.getX(t + 1), ix.getX(t + 2)], k = part(v[0]); if (!k || part(v[1]) !== k || part(v[2]) !== k) continue;
      m.getVertexPosition(v[0], a).applyMatrix4(m.matrixWorld); m.getVertexPosition(v[1], b).applyMatrix4(m.matrixWorld); m.getVertexPosition(v[2], c).applyMatrix4(m.matrixWorld);
      for (const [x, y, z] of [[1, 0, 0], [0, 1, 0], [0, 0, 1], [1 / 3, 1 / 3, 1 / 3], [.5, .5, 0], [.5, 0, .5], [0, .5, .5]]) {
        p.set(0, 0, 0).addScaledVector(a, x).addScaledVector(b, y).addScaledVector(c, z).sub(C);
        const ax = p.dot(X); if (Math.abs(ax) > half + .004) continue;
        out[k] = Math.min(out[k] ?? Infinity, (p.addScaledVector(X, -ax).length() - r) * 1000);
      }
    }
  });
  return out;
}

for (const who of ['kotone', 'vroid-nam1', 'vroid-nu5']) {
  test(`${who}: the mic sits in a closed fist (no skin inside the handle, fingers and thumb on it)`, async () => {
    const model = await load(`${who}.glb`), fit = fitMicGrip(model);
    assert.ok(fit && fit.q.size === 15, 'five fingers, three joints each');
    assert.ok(fit.r === MIC_GRIP.radius && fit.lip && fit.aimAt && fit.grip);
    // the fist on the bind pose, the mic on grip_R where the fit put it
    model.traverse(o => { if (o.isSkinnedMesh) o.skeleton.pose(); });
    for (const [n, q] of fit.q) model.getObjectByName(n).quaternion.copy(q);
    const mic = makeMic(model, fit); mic.show(1);
    const g = gaps(model, mic.mesh, fit.r, fit.half);
    for (const k of ['palm', 'index', 'middle', 'ring', 'pinky', 'thumb']) {
      assert.ok(g[k] > -1, `${who} ${k} ${g[k]?.toFixed(1)} mm inside the handle`);
      assert.ok(g[k] < 3, `${who} ${k} ${g[k]?.toFixed(1)} mm off the handle`);
    }
  });
}

test('the capsule aims at the lips: one wrist turn about the wrist puts the mic axis through them', async () => {
  const model = await load('kotone.glb'), fit = fitMicGrip(model), mic = makeMic(model, fit); mic.show(1);
  const hand = model.getObjectByName('hand_R');
  model.updateMatrixWorld(true);
  // lips 7 cm from the capsule, 25 deg off its axis (a head stand-in: the target is its origin)
  const C = mic.mesh.getWorldPosition(new THREE.Vector3()), X = new THREE.Vector3(0, 1, 0).applyQuaternion(mic.mesh.getWorldQuaternion(new THREE.Quaternion()));
  const side = new THREE.Vector3(0, 0, 1).cross(X).normalize(), head = new THREE.Object3D();
  head.position.copy(C).addScaledVector(X, mic.mesh.userData.headY + .07 * Math.cos(.44)).addScaledVector(side, .07 * Math.sin(.44)); head.updateMatrixWorld(true);
  const turned = aimMic(hand, mic.mesh, head, new THREE.Vector3(), 1, mic.mesh.userData.headY, 90);
  assert.ok(turned > 5 && turned < 40, `${turned.toFixed(1)} deg`);
  model.updateMatrixWorld(true);
  const C2 = mic.mesh.getWorldPosition(new THREE.Vector3()), X2 = new THREE.Vector3(0, 1, 0).applyQuaternion(mic.mesh.getWorldQuaternion(new THREE.Quaternion()));
  const off = head.position.clone().sub(C2), miss = off.clone().addScaledVector(X2, -off.dot(X2)).length();
  assert.ok(miss < .002 && off.dot(X2) > 0, `axis misses the lips by ${(miss * 1000).toFixed(1)} mm`);
  // the limit caps the turn, the singing weight scales it
  hand.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(side, .8)); model.updateMatrixWorld(true);
  const capped = aimMic(hand, mic.mesh, head, new THREE.Vector3(), .5, mic.mesh.userData.headY);
  assert.ok(capped > 0 && capped <= MIC_GRIP.aimMax * .5 + 1e-6, `${capped.toFixed(2)} deg at half weight`);
});

test('the mic is in her hand from the first line (a pickup before the first bar) and through a bow danced with it', () => {
  const dir = path.join(ROOT, 'public/songs/kotone'), read = f => JSON.parse(readFileSync(path.join(dir, f), 'utf8'));
  for (const id of ['golden-rails-en', 'golden-rails-vi']) {
    const s = KOTONE_SONGS.find(e => e.id === id), lyrics = read(`${id}.lyrics.json`);
    const clock = createBeatClock(s, { beats: read(`${id}.beats.json`), lyrics }), plan = planPerformance(s, clock, lyrics);
    for (const l of lyrics.lines) for (const t of [l.t - SINGING.pre, l.t, l.e]) assert.equal(micShown(plan, t), 1, `${id}: mic at ${t.toFixed(2)} s`);
    for (const m of plan.moments.filter(x => x.mic)) {
      const e = m.b1 >= plan.lastBar ? plan.end : m.t1;
      for (let t = m.t0; t < e; t += .1) assert.equal(micShown(plan, t), 1, `${id}: ${m.clip} without its mic at ${t.toFixed(2)} s`);
    }
  }
});
