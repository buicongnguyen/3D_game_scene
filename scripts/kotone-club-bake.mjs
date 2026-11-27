// Kotone's Club vocabulary: the Avatar Studio's Club-mode moves (Moves v2: the club dance loops, the three mic moves the
// lead singer layers over her dance, and the celebration moments) solved on Kotone's own skeleton and skin, checked with
// the Studio's joint rules (R1-R11), and appended to her show pack public/models/moves-kotone.glb (Club* / Mic* / Moment*).
// The mic grip fit (where the handle sits in her right fist) goes to src/content/kotone-club-fit.js.
//
// The solver is the Studio's own code (src/moves-v2/core.js and friends), copied READ-ONLY into .tools/club-solver (never
// run in the Studio's folder). Kotone's game bone names need three small patches there (spine1 + chest, shin, the mouthO
// morph for the lip centre): this script applies them when it copies.
//   node scripts/kotone-club-bake.mjs --vendor <Avatar Studio folder>   (copy + patch the solver into .tools/club-solver)
//   node scripts/kotone-club-bake.mjs                                    (bake, check, write the pack and the fit)
// Run it again after art/blender/vroid_mixamo.py rebuilds kotone.glb / moves-kotone.glb (the rig and the pack).
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { AnimationMixer, Matrix4, Quaternion, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { CLUB_BAKE } from '../src/content/kotone-club.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOLVER = path.join(ROOT, '.tools', 'club-solver');
const arg = n => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : null; };
// key thinning (art/blender/trim_clips.mjs factor) for arms, fingers, spine and head; hips and legs stay exact (thinned, the
// planted feet skated: 9-58 cm/s at factors 0.4-2.4; exact: 0.1-1.6 cm/s, the solver's own)
const TRIM_DEFAULT = 2.4, EXACT_BONES = '^(hips|thigh_[LR]|shin_[LR]|foot_[LR]|toe_[LR])$';
const TRIM = Number(arg('trim') ?? TRIM_DEFAULT);

if (arg('vendor')) {
  const studio = arg('vendor'), files = ['src/moves-v2/core.js', 'src/moves-v2/kit.js', 'src/moves-v2/club-kit.js', 'src/authored-clap.js', 'src/motion-provenance.js',
    'src/anatomy-joint-check.js', 'src/joint-rules.js', 'src/joint-rule-profiles.js', 'src/foot-contact.js', 'src/foot-support.js', 'src/gymnast-proportions.js', 'src/util/math.js'];
  for (const f of files) { await fs.mkdir(path.dirname(path.join(SOLVER, f)), { recursive: true }); await fs.copyFile(path.join(studio, f), path.join(SOLVER, f)); }
  const moves = path.join(studio, 'src/moves-v2/moves');
  await fs.mkdir(path.join(SOLVER, 'src/moves-v2/moves'), { recursive: true });
  for (const f of await fs.readdir(moves)) if (f.endsWith('.js')) await fs.copyFile(path.join(moves, f), path.join(SOLVER, 'src/moves-v2/moves', f));
  await fs.mkdir(path.join(SOLVER, 'src/strings'), { recursive: true });
  await fs.writeFile(path.join(SOLVER, 'src/i18n.js'), "export const t = key => String(key).split('.').pop();\n");
  await fs.writeFile(path.join(SOLVER, 'src/strings/move-labels.js'), '\n');
  const core = path.join(SOLVER, 'src/moves-v2/core.js');
  let src = await fs.readFile(core, 'utf8');
  src = src.replace("bone('spine2|upperchest', 'Spine2')", "bone('spine2|upperchest|chest', 'Spine2')")
    .replace('bone(`calf_${s}|lowerleg_${s}`', 'bone(`calf_${s}|lowerleg_${s}|shin_${s}`')
    .replace('m.morphTargetDictionary.face_pucker ?? m.morphTargetDictionary.face_lip_close, d = key', 'm.morphTargetDictionary.face_pucker ?? m.morphTargetDictionary.face_lip_close ?? m.morphTargetDictionary.mouthO, d = key');
  await fs.writeFile(core, src);
  console.log('solver copied to', SOLVER);
  process.exit(0);
}

const imp = p => import(pathToFileURL(path.join(SOLVER, p)).href);
const { rig, bakeMove, micHandle, handTriangles } = await imp('src/moves-v2/core.js');
const { createAnatomyCheck } = await imp('src/anatomy-joint-check.js');

async function loadGlb(file) {   // textures stripped (Node has no image decoder; the solver reads only bones and skin)
  const bytes = await fs.readFile(file), size = bytes.readUInt32LE(12), json = JSON.parse(bytes.subarray(20, 20 + size));
  const strip = v => { if (!v || typeof v !== 'object') return; for (const k of Object.keys(v)) { if (/Texture$/.test(k)) delete v[k]; else strip(v[k]); } };
  json.materials?.forEach(strip); delete json.textures; delete json.images; delete json.samplers;
  json.extensionsRequired = (json.extensionsRequired || []).filter(x => !/texture/i.test(x));
  const enc = Buffer.from(JSON.stringify(json)), pad = Buffer.alloc(Math.ceil(enc.length / 4) * 4, 32); enc.copy(pad);
  const bin = Buffer.concat([Buffer.alloc(20), pad, bytes.subarray(20 + size)]);
  [0x46546c67, 2, bin.length, pad.length, 0x4e4f534a].forEach((v, i) => bin.writeUInt32LE(v, i * 4));
  return new GLTFLoader().parseAsync(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.length), '');
}

const g = await loadGlb(path.join(ROOT, 'public/models/kotone.glb')), root = g.scene; root.updateMatrixWorld(true);
const rg = rig(root); if (!rg) throw new Error('Kotone: the solver does not recognise the skeleton');
const rest = new Map([...rg.all.values()].map(b => [b.name, { q: b.quaternion.clone(), p: b.position.clone() }]));
const cacheMap = new Map(), cache = { has: k => cacheMap.has(k), get: k => cacheMap.get(k), set: (k, v) => cacheMap.set(k, v) };
const chk = createAnatomyCheck(root); if (!chk.supported) throw new Error(`joint check: ${chk.reason}`);
const baked = [], failing = [], report = {}, stance = {};
const restYaw = n => root.getObjectByName(n).getWorldQuaternion(new Quaternion()).invert();
const yawRest = { hips: restYaw(rg.hips.name), chest: restYaw('chest') };
const yawNow = n => { const f = new Vector3(0, 0, 1).applyQuaternion(root.getObjectByName(n).getWorldQuaternion(new Quaternion()).multiply(yawRest[n])); return Math.abs(Math.atan2(f.x, f.z)) * 180 / Math.PI; };
for (const [name, id] of Object.entries(CLUB_BAKE)) {
  const move = (await imp(`src/moves-v2/moves/${id}.js`)).default, clip = bakeMove(root, move, { rig: rg, cache, hz: 30 });
  if (!clip) throw new Error(`${id}: no bake`);
  // joint rules at 60 Hz, played at up to 1.2x (the fastest beat-sync rate)
  const mixer = new AnimationMixer(root), a = mixer.clipAction(clip); a.play();
  const N = Math.round(clip.duration * 60), worst = {};
  for (let i = 0; i <= N; i++) {
    mixer.setTime(i / N * clip.duration); root.updateMatrixWorld(true);
    for (const v of chk.check({ dt: i ? clip.duration / N / 1.2 : 0 })) { const k = `${v.rule} ${v.joint}`, over = v.amount - v.limit; if (!worst[k] || over > worst[k].over) worst[k] = { amount: +v.amount.toFixed(1), limit: v.limit, t: +(i / N * clip.duration).toFixed(2), over }; }
  }
  if (name === 'MicSway') {   // the mic grip: the solver's own handle on her right fist, in grip_R's space, at the first frame
    mixer.setTime(0); root.updateMatrixWorld(true);
    const a2 = rg.arms.R, Hd = micHandle(a2, 'R', handTriangles(root, a2.hand)), hq = a2.hand.getWorldQuaternion(new Quaternion()), hp = a2.hand.getWorldPosition(new Vector3());
    const grip = root.getObjectByName('grip_R'), toGrip = new Matrix4().copy(grip.matrixWorld).invert();
    const cW = Hd.centre.clone().applyQuaternion(hq).add(hp), upW = Hd.axis.clone().applyQuaternion(hq);
    const c = cW.clone().applyMatrix4(toGrip), up = cW.clone().add(upW).applyMatrix4(toGrip).sub(c), scale = up.length(); up.normalize();
    report.micFit = { centre: c.toArray().map(x => +x.toFixed(5)), up: up.toArray().map(x => +x.toFixed(5)), scale: +scale.toFixed(5), radius: +Hd.r.toFixed(4), half: +Hd.half.toFixed(4) };
  }
  // the stance it starts in (feet, metres from her rest centre) and how much it turns and lifts: plan.js orders loops by it
  { const st = { hipYaw: 0, chestYaw: 0, lift: 0 }, ys = [];
    for (let i = 0; i <= 60; i++) { mixer.setTime(i / 60 * clip.duration); root.updateMatrixWorld(true);
      if (i === 0) st.feet = ['foot_L', 'foot_R'].map(n => root.getObjectByName(n).getWorldPosition(new Vector3())).map(p => [+p.x.toFixed(3), +p.z.toFixed(3)]);
      st.hipYaw = Math.max(st.hipYaw, yawNow('hips')); st.chestYaw = Math.max(st.chestYaw, yawNow('chest')); ys.push(rg.hips.getWorldPosition(new Vector3()).y); }
    st.hipYaw = +st.hipYaw.toFixed(1); st.chestYaw = +st.chestYaw.toFixed(1); st.lift = +(Math.max(...ys) - Math.min(...ys)).toFixed(3); stance[name] = st; }
  a.stop(); mixer.uncacheRoot(root);
  for (const [b, r] of rest) { const o = root.getObjectByName(b); o.quaternion.copy(r.q); o.position.copy(r.p); } root.updateMatrixWorld(true);
  // keep only what moves: a track that never leaves the rest pose is dropped (the mixer leaves that bone at rest)
  const tracks = [];
  for (const t of clip.tracks) {
    const [bone, prop] = t.name.split('.'), r = rest.get(bone), n = prop === 'quaternion' ? 4 : 3, v = t.values;
    if (prop === 'position' && bone !== rg.hips.name) continue;
    let still = true, atRest = true; const ref = prop === 'quaternion' ? r.q.toArray() : r.p.toArray();
    for (let i = 0; i < v.length; i += n) for (let k = 0; k < n; k++) { if (Math.abs(v[i + k] - v[k]) > 1e-5) still = false; if (Math.abs(Math.abs(v[i + k]) - Math.abs(ref[k])) > 1e-5) atRest = false; }
    if (still && atRest) continue;
    tracks.push({ bone, path: prop === 'quaternion' ? 'rotation' : 'translation', times: still ? [t.times[0], t.times.at(-1)] : Array.from(t.times), values: still ? [...v.slice(0, n), ...v.slice(0, n)] : Array.from(v) });
  }
  baked.push({ name, id, duration: clip.duration, tracks });
  report[name] = Object.fromEntries(Object.entries(worst).map(([k, w]) => [k, { amount: w.amount, limit: w.limit, t: w.t }]));
  if (Object.keys(worst).length) failing.push(name);
  console.log(name.padEnd(16), id.padEnd(22), `${tracks.length} tracks`, Object.keys(worst).length ? `JOINTS ${JSON.stringify(report[name])}` : 'joints ok');
}
await fs.mkdir(path.join(ROOT, '.tools'), { recursive: true });
await fs.writeFile(path.join(ROOT, '.tools/kotone-club-joints.json'), JSON.stringify(report, null, 1));
if (failing.length) { console.error('joint rules broken:', failing.join(', ')); process.exit(1); }

// append to the pack (replacing an earlier bake of the same names)
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const packFile = path.join(ROOT, 'public/models/moves-kotone.glb'), doc = await io.read(packFile), docRoot = doc.getRoot(), buf = docRoot.listBuffers()[0];
const names = new Set(baked.map(b => b.name));
for (const an of docRoot.listAnimations()) if (names.has(an.getName())) { for (const s of an.listSamplers()) { s.getInput()?.dispose(); s.getOutput()?.dispose(); } an.dispose(); }
const nodes = new Map(docRoot.listNodes().map(n => [n.getName(), n]));
for (const b of baked) {
  const an = doc.createAnimation(b.name), timeAcc = new Map();
  for (const t of b.tracks) {
    const node = nodes.get(t.bone); if (!node) throw new Error(`pack has no node ${t.bone}`);
    const key = t.times.join(',');
    let input = timeAcc.get(key);
    if (!input) { input = doc.createAccessor().setType('SCALAR').setArray(new Float32Array(t.times)).setBuffer(buf); timeAcc.set(key, input); }
    const output = doc.createAccessor().setType(t.path === 'rotation' ? 'VEC4' : 'VEC3').setArray(new Float32Array(t.values)).setBuffer(buf);
    const s = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('LINEAR');
    an.addSampler(s).addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath(t.path).setSampler(s));
  }
}
await io.write(packFile, doc);
// thinned like the pack's other dances (art/blender/vroid_mixamo.py PACK_TOL 2.4: 1.2 deg body, 4.8 deg fingers; rotations 16-bit)
{ const { execFileSync } = await import('node:child_process');
  if (TRIM > 0) console.log(execFileSync(process.execPath, [path.join(ROOT, 'art/blender/trim_clips.mjs'), packFile, String(TRIM), `^(${[...names].join('|')})$`, EXACT_BONES], { encoding: 'utf8' }).trim()); }
// the joint rules again on the thinned, 16-bit clips as the game reads them
{ const pack = await new GLTFLoader().parseAsync((b => b.buffer.slice(b.byteOffset, b.byteOffset + b.length))(await fs.readFile(packFile)), ''), bad = [];
  for (const clip of pack.animations.filter(c => names.has(c.name))) {
    const mixer = new AnimationMixer(root), a = mixer.clipAction(clip); a.play(); const N = Math.round(clip.duration * 60); let hits = 0;
    for (let i = 0; i <= N; i++) { mixer.setTime(i / N * clip.duration); root.updateMatrixWorld(true); hits += chk.check({ dt: i ? clip.duration / N / 1.2 : 0 }).length; }
    a.stop(); mixer.uncacheRoot(root); for (const [b, r] of rest) { const o = root.getObjectByName(b); o.quaternion.copy(r.q); o.position.copy(r.p); }
    if (hits) bad.push(`${clip.name} (${hits} frames)`);
  }
  console.log(bad.length ? `thinned clips break joint rules: ${bad.join(', ')}` : `thinned clips: joints ok (${names.size} clips, 60 Hz, 1.2x)`);
  if (bad.length) process.exitCode = 1; }
const fit = report.micFit;
await fs.writeFile(path.join(ROOT, 'src/content/kotone-club-fit.js'), `// Written by scripts/kotone-club-bake.mjs: the hand mic's handle in Kotone's grip_R space (the Moves v2 solver's own
// micGrip handle on her right fist, at Mic sway's first frame). centre / up in grip_R units, scale = units per metre.
export const MIC_FIT = Object.freeze(${JSON.stringify(fit)});
// Each move's start stance (feet x / z, metres, her model space at rest centre), its largest hip and chest turn (deg) and its
// hip lift (m): game/perform/plan.js puts loops of matching stances next to each other and keeps turns and jumps off sung lines.
export const STANCE = Object.freeze(${JSON.stringify(stance)});
`);
console.log('pack', (await fs.stat(packFile)).size, 'bytes; mic fit', JSON.stringify(fit));
