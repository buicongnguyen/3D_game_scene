// © 2026 Bui Cong Nguyen · solluxlabs.com
// The Explore moves pack's joint pass (docs/EXPLORE-AND-SHOW.md "Play as"): the Mixamo takes baked by
// art/blender/vroid_mixamo.py (--packlist art/blender/explore_moves.json) break a few anatomy rules here and there (a finger
// knuckle bent back, a deep squat's thighs past 75 deg apart, a spine bent past 70 deg forward). This pass resamples every
// clip at 30 Hz on the pack's own rig (Saki) and, frame by frame:
//   fingers   all hold one relaxed pose (Saki's own Idle at its first frame), so no take's stray knuckle survives
//   a rule    broken: the bones that make that joint are eased toward their rest (one weight per bone, the largest that
//             passes, found by halving) until Avatar Studio's checker (R1-R11, .tools/club-solver) finds nothing; the
//             weights are then smoothed over time (a window minimum, then a short average) so nothing pops, and the
//             frame checked again
// and writes the clips back (float keys, then art/blender/trim_clips.mjs thins them). Hips travel is left as it was.
//   node scripts/explore-moves-fix.mjs <raw pack glb> <out glb> [--body vroid-nu3] [--hz 30] [--trim 1]
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'meshoptimizer';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d = null) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const [IN, OUT] = process.argv.slice(2).filter((x, i, a) => !x.startsWith('--') && !(i > 0 && a[i - 1].startsWith('--')));
const BODY = arg('body', 'vroid-nu3'), HZ = Number(arg('hz', 30)), TRIM = arg('trim', '1');
if (!IN || !OUT) { console.error('usage: explore-moves-fix.mjs <raw pack glb> <out glb>'); process.exit(2); }
await MeshoptDecoder.ready;
const { createAnatomyCheck } = await import(pathToFileURL(path.join(ROOT, '.tools/club-solver/src/anatomy-joint-check.js')).href);

async function loadGlb(file) {   // textures stripped (Node has no image decoder)
  const bytes = await fs.readFile(file), size = bytes.readUInt32LE(12), json = JSON.parse(bytes.subarray(20, 20 + size));
  const strip = v => { if (!v || typeof v !== 'object') return; for (const k of Object.keys(v)) { if (/Texture$/.test(k)) delete v[k]; else strip(v[k]); } };
  json.materials?.forEach(strip); delete json.textures; delete json.images; delete json.samplers;
  json.extensionsRequired = (json.extensionsRequired || []).filter(x => !/texture/i.test(x));
  json.extensionsUsed = (json.extensionsUsed || []).filter(x => !/texture/i.test(x));
  const enc = Buffer.from(JSON.stringify(json)), pad = Buffer.alloc(Math.ceil(enc.length / 4) * 4, 32); enc.copy(pad);
  const bin = Buffer.concat([Buffer.alloc(20), pad, bytes.subarray(20 + size)]);
  [0x46546c67, 2, bin.length, pad.length, 0x4e4f534a].forEach((v, i) => bin.writeUInt32LE(v, i * 4));
  const l = new GLTFLoader(); l.setMeshoptDecoder(MeshoptDecoder);
  return l.parseAsync(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.length), '');
}

const pack = await loadGlb(IN), bodyG = await loadGlb(path.join(ROOT, 'public/models', `${BODY}.glb`)), body = bodyG.scene;
const bones = new Map(); body.traverse(o => { if (o.isBone && !bones.has(o.name)) bones.set(o.name, o); });
const rest = new Map([...bones].map(([n, b]) => [n, b.quaternion.clone()]));
const FINGER = /^(thumb|index|middle|ring|pinky)[1-4]_[LR]$/;
// the relaxed hand: the body's own Idle at its first frame
const relaxed = new Map();
{ const idle = bodyG.animations.find(c => c.name === 'Idle'), m = new THREE.AnimationMixer(body); m.clipAction(idle).play(); m.setTime(0); for (const [n, b] of bones) if (FINGER.test(n)) relaxed.set(n, b.quaternion.clone()); m.stopAllAction(); m.uncacheRoot(body); for (const [n, b] of bones) b.quaternion.copy(rest.get(n)); }
body.updateMatrixWorld(true);
const check = createAnatomyCheck(body);

// which bones make each joint the checker names (eased toward rest when it breaks a rule)
function bonesOf(v) {
  const j = v.joint, s = (j.match(/_([LR])\b/) || [])[1];
  if (v.rule === 'R8') return ['spine', 'spine1', 'chest'];
  if (v.rule === 'R9') return ['neck', 'head'];
  if (v.rule === 'R10' || /^thigh_/.test(j)) return [`thigh_${s}`];
  if (v.rule === 'R1') return [`shin_${s}`];
  if (v.rule === 'R2' || /^forearm_/.test(j)) return [`forearm_${s}`];
  if (v.rule === 'R5' || /^wrist_/.test(j)) return [`hand_${s}`];
  if (v.rule === 'R7' || /^upperarm_/.test(j)) return [`upperarm_${s}`, `shoulder_${s}`];
  if (v.rule === 'R3' || v.rule === 'R4') { const f = j.split('.')[0]; return [f]; }
  if (v.rule === 'R11' && /thigh~thigh|knee/.test(j)) return ['thigh_L', 'thigh_R'];
  if (v.rule === 'R11' && /hand|fore/.test(j)) { const side = (j.match(/_([LR])/) || [])[1] || 'L'; return [`upperarm_${side}`, `forearm_${side}`]; }
  return [];
}
// (2 deg / 2 mm of head-room: the keys are thinned afterwards and other bodies differ a little)
const violations = () => check.check({ dt: 0, slackDeg: 2 }).filter(v => !/Speed/.test(v.joint));
const keyOf = v => `${v.rule} ${v.joint}`;

/** Fix one pose (bones posed now): -> Map bone -> weight (1 = as taken, 0 = rest). */
function fixPose() {
  const w = new Map();
  for (let pass = 0; pass < 6; pass++) {
    body.updateMatrixWorld(true);
    const V = violations(); if (!V.length) break;
    for (const v of V) {
      if (v.rule === 'R11' && /thigh~thigh/.test(v.joint)) { w.set('thigh_L', w.get('thigh_L') ?? 1); spread(v); continue; }
      const list = bonesOf(v).filter(n => bones.has(n)); if (!list.length) continue;
      const orig = new Map(list.map(n => [n, bones.get(n).quaternion.clone()]));
      const set = k => { for (const n of list) bones.get(n).quaternion.copy(rest.get(n)).slerp(orig.get(n), k); body.updateMatrixWorld(true); };
      const breaks = () => violations().some(x => keyOf(x) === keyOf(v));
      let lo = 0, hi = 1;
      for (let i = 0; i < 9; i++) { const mid = (lo + hi) / 2; set(mid); if (breaks()) hi = mid; else lo = mid; }
      set(lo * 0.97);   // (a little head-room)
      for (const n of list) w.set(n, (w.get(n) ?? 1) * lo * 0.97);
    }
  }
  return w;
}

/** Knees brushing each other (R11 thigh~thigh): both thighs turned outward about the body's forward axis, the least that
 *  clears them (up to 15 deg). */
const _q = new THREE.Quaternion(), _p = new THREE.Quaternion(), FWD = new THREE.Vector3(0, 0, 1);
function turnWorld(b, angle) {
  b.parent.getWorldQuaternion(_p);
  const d = _q.setFromAxisAngle(FWD, angle);
  b.quaternion.premultiply(_p.clone().invert().multiply(d).multiply(_p));
}
function spread(v) {
  const L = bones.get('thigh_L'), Rr = bones.get('thigh_R'), qL = L.quaternion.clone(), qR = Rr.quaternion.clone();
  const set = a => { L.quaternion.copy(qL); Rr.quaternion.copy(qR); turnWorld(L, a); turnWorld(Rr, -a); body.updateMatrixWorld(true); };
  const breaks = () => violations().some(x => keyOf(x) === keyOf(v));
  let lo = 0, hi = 15 * Math.PI / 180; set(hi); if (breaks()) return;
  for (let i = 0; i < 9; i++) { const mid = (lo + hi) / 2; set(mid); if (breaks()) lo = mid; else hi = mid; }
  set(hi * 1.15);
}

const out = new Map();   // clip name -> { times, tracks: Map bone -> Float32Array quats, hips: Float32Array | null }
const report = {};
for (const clip of pack.animations) {
  const mixer = new THREE.AnimationMixer(body), a = mixer.clipAction(clip); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.play();
  const n = Math.max(1, Math.round(clip.duration * HZ)), times = new Float32Array(n + 1), frames = [];
  const hipsTrack = clip.tracks.find(t => t.name === 'hips.position');
  let before = 0;
  for (let i = 0; i <= n; i++) {
    const t = Math.min(clip.duration, i / HZ); times[i] = t;
    mixer.setTime(Math.min(clip.duration - 1e-4, t));
    for (const [nm, b] of bones) if (FINGER.test(nm) && relaxed.has(nm)) b.quaternion.copy(relaxed.get(nm));
    body.updateMatrixWorld(true);
    if (violations().length) before++;
    const pose = new Map([...bones].map(([nm, b]) => [nm, b.quaternion.clone()]));
    const w = fixPose();
    frames.push({ pose, w });
  }
  // the weights smoothed over time: a window minimum (+-4 frames), then a 5-frame average, so an eased joint never pops
  const names = new Set(frames.flatMap(f => [...f.w.keys()]));
  for (const nm of names) {
    const raw = frames.map(f => f.w.get(nm) ?? 1), mn = raw.map((_, i) => Math.min(...raw.slice(Math.max(0, i - 4), i + 5)));
    const avg = mn.map((_, i) => { const s = mn.slice(Math.max(0, i - 2), i + 3); return s.reduce((x, y) => x + y, 0) / s.length; });
    frames.forEach((f, i) => f.w.set(nm, Math.min(avg[i], mn[i])));
  }
  // apply, check again; any frame still breaking a rule is fixed once more on top
  let after = 0, still = {};
  const tracks = new Map([...bones.keys()].filter(nm => !/^(root|grip_R|eye_[LR])$/.test(nm)).map(nm => [nm, new Float32Array((n + 1) * 4)]));
  frames.forEach((f, i) => {
    for (const [nm, b] of bones) { const q = f.pose.get(nm); b.quaternion.copy(rest.get(nm)).slerp(q, f.w.get(nm) ?? 1); }
    body.updateMatrixWorld(true);
    if (violations().length) fixPose();
    body.updateMatrixWorld(true);
    const V = violations(); if (V.length) { after++; for (const v of V) still[keyOf(v)] = Math.max(still[keyOf(v)] || 0, v.amount - v.limit); }
    for (const [nm, arr] of tracks) bones.get(nm).quaternion.toArray(arr, i * 4);
  });
  // quaternions on one hemisphere frame to frame (no long-way slerp)
  for (const arr of tracks.values()) for (let i = 1; i <= n; i++) { let d = 0; for (let k = 0; k < 4; k++) d += arr[i * 4 + k] * arr[(i - 1) * 4 + k]; if (d < 0) for (let k = 0; k < 4; k++) arr[i * 4 + k] *= -1; }
  let hips = null;
  if (hipsTrack) { hips = new Float32Array((n + 1) * 3); const it = hipsTrack.createInterpolant(); for (let i = 0; i <= n; i++) hips.set(it.evaluate(Math.min(clip.duration, times[i])), i * 3); }
  out.set(clip.name, { times, tracks, hips });
  mixer.stopAllAction(); mixer.uncacheRoot(body);
  for (const [nm, b] of bones) b.quaternion.copy(rest.get(nm));
  report[clip.name] = { frames: n + 1, brokenBefore: before, brokenAfter: after, eased: [...names].sort(), still };
  console.log(clip.name.padEnd(16), `frames ${n + 1}`, `broken ${before} -> ${after}`, 'eased', [...names].join(',') || '-', Object.keys(still).length ? JSON.stringify(still) : '');
}

// write the clips back into the pack (gltf-transform: the same armature nodes, new samplers)
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(IN), R = doc.getRoot(), buf = R.listBuffers()[0], nodes = new Map(R.listNodes().map(nd => [nd.getName(), nd]));
// the armature's rest exactly the body's (a fresh Blender import differs in the last float bits; tests/assets.test.mjs
// checks a pack's rest against its person to the bit)
{ const body = (await io.read(path.join(ROOT, 'public/models', `${BODY}.glb`))).getRoot();
  for (const j of body.listSkins()[0].listJoints()) { const nd = nodes.get(j.getName()); if (nd) nd.setTranslation(j.getTranslation()).setRotation(j.getRotation()).setScale(j.getScale()); } }
for (const anim of R.listAnimations()) {
  const o = out.get(anim.getName()); if (!o) continue;
  for (const ch of anim.listChannels()) { anim.removeChannel(ch); ch.dispose(); }
  for (const s of anim.listSamplers()) { anim.removeSampler(s); s.dispose(); }
  const input = doc.createAccessor().setType('SCALAR').setArray(o.times).setBuffer(buf);
  const add = (nd, pathName, arr, type) => {
    const s = doc.createAnimationSampler().setInput(input).setOutput(doc.createAccessor().setType(type).setArray(arr).setBuffer(buf)).setInterpolation('LINEAR');
    anim.addSampler(s).addChannel(doc.createAnimationChannel().setTargetNode(nd).setTargetPath(pathName).setSampler(s));
  };
  for (const [nm, arr] of o.tracks) {
    const nd = nodes.get(nm); if (!nd) continue;
    // a bone that never leaves its rest needs no channel
    const r = rest.get(nm); let moves = false;
    for (let i = 0; i < arr.length && !moves; i += 4) moves = Math.abs(Math.abs(arr[i] * r.x + arr[i + 1] * r.y + arr[i + 2] * r.z + arr[i + 3] * r.w) - 1) > 1e-6;
    if (moves) add(nd, 'rotation', arr, 'VEC4');
  }
  if (o.hips && nodes.get('hips')) add(nodes.get('hips'), 'translation', o.hips, 'VEC3');
}
for (const acc of R.listAccessors()) if (!acc.listParents().some(p => p !== R)) acc.dispose();
await io.write(OUT, doc);
execFileSync('node', [path.join(ROOT, 'art/blender/trim_clips.mjs'), OUT, TRIM], { cwd: ROOT, stdio: 'inherit' });
await fs.writeFile(OUT.replace(/\.glb$/, '.fix.json'), JSON.stringify({ source: path.relative(ROOT, IN), body: BODY, hz: HZ, report }, null, 1));
console.log('wrote', path.relative(ROOT, OUT), (await fs.stat(OUT)).size, 'bytes');
