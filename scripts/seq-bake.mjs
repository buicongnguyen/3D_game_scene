// © 2026 Bui Cong Nguyen · solluxlabs.com
// The dance-sequence packs (content/dance-sequences.js; docs/SING-AND-PLAY.md "Dance sequences"): the whole Mixamo takes
// retargeted by art/blender/seq_takes.py (.tools/seq/raw/takes-<who>.glb) are cut into beat-measured loops on each body by
// Avatar Studio Club mode's own prep (src/club/dance-prep.js prepareClubDance: tempo, loop window, facing, in-place root,
// beat warp, seam, foot lock, floor, hand clearance, joint repair; floor work grounded on the whole skin), copied
// READ-ONLY into .tools/club-solver like the Moves v2 solver (scripts/kotone-club-bake.mjs). Kotone measures each take's
// timing; nam-1 shares it (the same loop window and beat grid), so both rows' steps land on the same beats.
// Checked on every clip before it ships (60 Hz, the joint-speed rule at the fastest beat-sync rate 1.2x; a clip whose only
// break is a roll speed at 1.2x is kept with the fastest rate it passes, 1.1 or 1.0: the plan never plays it faster, `maxRate`):
//   joints   the Studio's joint rules R1-R11 (anatomy-joint-check.js): no frame breaks one
//   slide    standing loops: planted toes (within 4 mm of the floor) move <= 1.5 cm/s p95 over the ground
//   floor    the lowest skin point against the rest floor: standing <= 1.5 cm under it; floor work <= 2.5 cm (soft contact)
//   copies   the joint rules again on every body that may dance the clip as a copy of that rig (game/perform/troupe.js
//            makeCopier, the game's own copy with its leg solve): Kotone's rig is copied by the front row and by any lead
//            who is not Kotone (the seven members and the Night Star), nam-1's by the back row (nu-1, nam-3, nam-2, and Saki
//            when a back-row singer leads); a clip that breaks a rule on one of them is kept, with that body in its `fails`,
//            and the plan leaves it out of any routine that body copies (game/perform/plan.js sequenceBlocks `bodies`)
// A clip that fails on a body is left out of that body's packs (the plan then plays the step's other takes). Floor work
// only goes into nam-1's packs: the front row (Kotone's rig) never goes down to the floor.
// Writes public/models/moves-seq-<style>-kotone.glb / -nam1.glb (the pack's armature from moves-kotone / moves-vroid-nam1,
// so joints, order and rest are the shipped ones; keys thinned like the Club bake: hips and legs exact, floor work's arms
// and spine exact too; rotations 16-bit), src/content/dance-seq-fit.js (each clip's tempo, loop and stance) and the report
// .tools/seq/report.json.
//   node scripts/seq-bake.mjs --vendor <Avatar Studio folder>   (dance-prep and its helpers into .tools/club-solver)
//   node scripts/seq-bake.mjs [--blender <blender.exe>]          (the raw takes first when missing; then prep, check, packs)
//   node scripts/seq-bake.mjs --only SeqYmca,SeqWave             (report only for these: no packs written)
import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { AnimationClip, AnimationMixer, Quaternion, QuaternionKeyframeTrack, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { SEQ_TAKES, SEQUENCES, SEQ_STYLES, styleClips } from '../src/content/dance-sequences.js';
import { skinPoints, lowestPoint } from '../src/game/perform/floor-blend.js';
import { reach } from '../src/game/perform/foot-hold.js';
import { makeCopier, restPose } from '../src/game/perform/troupe.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOLVER = path.join(ROOT, '.tools', 'club-solver'), SEQ = path.join(ROOT, '.tools', 'seq'), MODELS = path.join(ROOT, 'public/models');
const arg = n => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : null; };
export const SEQ_CHECK = Object.freeze({ hz: 60, fastest: 1.2, slower: [1.1, 1], planted: .004, slideCmS: 1.5, sinkCm: 1.5, floorSinkCm: 2.5 });
const TRIM = 2.4, EXACT_STAND = '^(hips|thigh_[LR]|shin_[LR]|foot_[LR]|toe_[LR])$',
  EXACT_FLOOR = '^(hips|spine|spine1|chest|neck|head|shoulder_[LR]|upperarm_[LR]|forearm_[LR]|hand_[LR]|thigh_[LR]|shin_[LR]|foot_[LR]|toe_[LR])$';
/** The bodies that copy each rig (content/troupe.js castOf: who can stand in that rig's row, or sing lead over it). */
const COPIES = Object.freeze({ kotone: ['vroid-nu3', 'vroid-nu5', 'vroid-nu4', 'vroid-nu1', 'vroid-nam1', 'vroid-nam3', 'vroid-nam2', 'vroid-nightstar'], 'nam-1': ['vroid-nu1', 'vroid-nam3', 'vroid-nam2', 'vroid-nu3'] });
/** The two bodies: the front row's source (Kotone) and the back row's (nam-1). */
const RIGS = Object.freeze([
  { who: 'kotone', model: 'kotone', template: 'moves-kotone', raw: 'takes-kotone', suffix: 'kotone', floor: false },
  { who: 'nam-1', model: 'vroid-nam1', template: 'moves-vroid-nam1', raw: 'takes-nam1', suffix: 'nam1', floor: true },
]);

if (arg('vendor')) {
  const studio = arg('vendor'), files = ['src/club/dance-prep.js', 'src/club/take-joint-repair.js', 'src/club/floor-joint-repair.js', 'src/foot-lock-core.js',
    'src/hand-body-clearance.js', 'src/music-loop-seam.js', 'src/legacy-repair-policy.js', 'src/slide-arm-clearance.js'];
  if (!fss.existsSync(path.join(SOLVER, 'src/moves-v2/core.js'))) throw new Error('vendor the Moves v2 solver first: node scripts/kotone-club-bake.mjs --vendor <studio>');
  for (const f of files) { await fs.mkdir(path.dirname(path.join(SOLVER, f)), { recursive: true }); await fs.copyFile(path.join(studio, f), path.join(SOLVER, f)); }
  console.log('club prep copied to', SOLVER);
  process.exit(0);
}

const imp = p => import(pathToFileURL(path.join(SOLVER, p)).href);
const { prepareClubDance, danceTree } = await imp('src/club/dance-prep.js');
const { createAnatomyCheck } = await imp('src/anatomy-joint-check.js');
await MeshoptDecoder.ready; await MeshoptEncoder.ready;

async function loadGlb(file) {   // textures stripped (Node has no image decoder; the prep reads bones and skin)
  const bytes = await fs.readFile(file), size = bytes.readUInt32LE(12), json = JSON.parse(bytes.subarray(20, 20 + size));
  const strip = v => { if (!v || typeof v !== 'object') return; for (const k of Object.keys(v)) { if (/Texture$/.test(k)) delete v[k]; else strip(v[k]); } };
  json.materials?.forEach(strip); delete json.textures; delete json.images; delete json.samplers;
  json.extensionsRequired = (json.extensionsRequired || []).filter(x => !/texture/i.test(x));
  const enc = Buffer.from(JSON.stringify(json)), pad = Buffer.alloc(Math.ceil(enc.length / 4) * 4, 32); enc.copy(pad);
  const bin = Buffer.concat([Buffer.alloc(20), pad, bytes.subarray(20 + size)]);
  [0x46546c67, 2, bin.length, pad.length, 0x4e4f534a].forEach((v, i) => bin.writeUInt32LE(v, i * 4));
  const l = new GLTFLoader(); l.setMeshoptDecoder(MeshoptDecoder);
  return l.parseAsync(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.length), '');
}

// the raw takes (Blender) when missing
const takeList = Object.entries(SEQ_TAKES).map(([k, v]) => [k, v.stem, v.tile || 0]);
for (const r of RIGS) {
  const out = path.join(SEQ, 'raw', `${r.raw}.glb`);
  if (fss.existsSync(out)) continue;
  const blender = arg('blender') || 'C:/tools/blender/blender-5.2.5-windows-x64/blender.exe';
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(path.join(SEQ, 'takes.json'), JSON.stringify(takeList));
  console.log('retargeting the takes onto', r.who, '(Blender)');
  execFileSync(blender, ['-b', '--factory-startup', '--python', path.join(ROOT, 'art/blender/seq_takes.py'), '--', '--list', path.join(SEQ, 'takes.json'), '--out', out,
    ...(r.who === 'kotone' ? [] : ['--member', r.who])], { stdio: 'inherit' });
}

const only = arg('only') ? new Set(arg('only').split(',')) : null;
const names = Object.keys(SEQ_TAKES).filter(n => !only || only.has(n));

/** Each body's rest pose (to put back between clips). */
const restOf = root => { const m = new Map(); root.traverse(o => { if (o.isBone) m.set(o, { q: o.quaternion.clone(), p: o.position.clone() }); }); return m; };
const putBack = rest => { for (const [o, r] of rest) { o.quaternion.copy(r.q); o.position.copy(r.p); } };

/**
 * Planted feet held still (standing loops): the Club prep locks the take's own plants, but a Mixamo landing often comes
 * in the last few millimetres still sliding (nam-1's ready bounce: 7-10 cm/s with the toe 1-4 mm up, p95 8.8 cm/s).
 * Here every stretch where a toe joint is within PLANT.band of the floor is pinned where that contact is slowest; the
 * ankle follows the same shift by a two-bone leg solve (game/perform/foot-hold.js reach: the knee in its own bend plane,
 * the foot keeps its world turn), eased in over PLANT.easeIn keys before the touch and out over PLANT.easeOut keys
 * after the lift (the foot in the air then: no slide to see). The legs' tracks are re-keyed at 60 Hz (keyed at 30 Hz, the frames between drifted 1.5-4 cm/s).
 */
export const PLANT = Object.freeze({ band: .006, easeIn: 4, easeOut: 6, hz: 60 });
function plantFeet(root, clip, rest) {
  putBack(rest); root.updateMatrixWorld(true);
  const legs = ['L', 'R'].map(s => ({ s, thigh: root.getObjectByName(`thigh_${s}`), shin: root.getObjectByName(`shin_${s}`), foot: root.getObjectByName(`foot_${s}`), toe: root.getObjectByName(`toe_${s}`) }));
  const restToe = Math.min(...legs.map(l => l.toe.getWorldPosition(new Vector3()).y));
  const n = Math.max(2, Math.round(clip.duration * PLANT.hz)), times = Array.from({ length: n + 1 }, (_, i) => i * clip.duration / n);
  const mixer = new AnimationMixer(root), a = mixer.clipAction(clip); a.play();
  const pose = t => { mixer.setTime(t); root.updateMatrixWorld(true); };
  // pass 1: the toes and ankles at every key (the loop: key n is key 0)
  const S = legs.map(() => []);
  for (let i = 0; i < n; i++) { pose(times[i]); legs.forEach((l, j) => S[j].push({ toe: l.toe.getWorldPosition(new Vector3()), ankle: l.foot.getWorldPosition(new Vector3()) })); }
  // contact stretches (cyclic), each pinned at its slowest key
  const shift = legs.map(() => Array.from({ length: n }, () => ({ x: 0, z: 0, w: 0 })));
  legs.forEach((l, j) => {
    const on = S[j].map(f => f.toe.y < restToe + PLANT.band);
    if (on.every(Boolean) || !on.some(Boolean)) { if (on.every(Boolean)) { const c = S[j].reduce((p, f) => p.add(f.toe), new Vector3()).multiplyScalar(1 / n); for (let i = 0; i < n; i++) shift[j][i] = { x: c.x - S[j][i].toe.x, z: c.z - S[j][i].toe.z, w: 1 }; } return; }
    const start = on.findIndex((x, i) => x && !on[(i - 1 + n) % n]);   // a stretch's first key
    for (let k = 0, i = start; k < n; ) {
      if (!on[i]) { i = (i + 1) % n; k++; continue; }
      const run = []; while (on[i] && run.length < n) { run.push(i); i = (i + 1) % n; k++; }
      let best = run[0], bs = Infinity;
      for (const r of run) { const p = S[j][(r - 1 + n) % n].toe, q = S[j][(r + 1) % n].toe, sp = Math.hypot(q.x - p.x, q.z - p.z); if (sp < bs) { bs = sp; best = r; } }
      const pin = S[j][best].toe;
      const put = (idx, w) => { const f = S[j][idx].toe, cur = shift[j][idx]; if (w > cur.w) shift[j][idx] = { x: pin.x - f.x, z: pin.z - f.z, w }; };
      for (const r of run) put(r, 1);
      for (let e = 1; e <= PLANT.easeIn; e++) put((run[0] - e + n * 4) % n, 1 - e / (PLANT.easeIn + 1));
      for (let e = 1; e <= PLANT.easeOut; e++) put((run.at(-1) + e) % n, 1 - e / (PLANT.easeOut + 1));
    }
  });
  // pass 2: each key posed, the legs solved, their local turns kept
  const out = legs.map(() => ({ thigh: [], shin: [], foot: [] }));
  for (let i = 0; i <= n; i++) {
    const k = i % n; pose(times[i]);
    legs.forEach((l, j) => {
      const s = shift[j][k];
      if (s.w > 1e-4) { const w = s.w * s.w * (3 - 2 * s.w), target = l.foot.getWorldPosition(new Vector3()); target.x += s.x * w; target.z += s.z * w; reach(l.thigh, l.shin, l.foot, target); }
      for (const b of ['thigh', 'shin', 'foot']) out[j][b].push(...l[b].quaternion.toArray());
    });
  }
  a.stop(); mixer.uncacheRoot(root); putBack(rest); root.updateMatrixWorld(true);
  const tracks = clip.tracks.filter(t => !/^(thigh|shin|foot)_[LR]\.quaternion$/.test(t.name));
  legs.forEach((l, j) => { for (const b of ['thigh', 'shin', 'foot']) tracks.push(new QuaternionKeyframeTrack(`${l[b].name}.quaternion`, times, out[j][b])); });
  const c = new AnimationClip(clip.name, clip.duration, tracks); c.userData = clip.userData;
  return c;
}

/** Play a prepared clip at 60 Hz and measure it on this body (joint rules, planted-foot slide, the floor, the stance). */
function measure(root, clip, { floor = false, chk, pts, restFloor, rest, rate = SEQ_CHECK.fastest }) {
  const K = SEQ_CHECK, mixer = new AnimationMixer(root), a = mixer.clipAction(clip); a.play();
  const N = Math.max(2, Math.round(clip.duration * K.hz)), dt = clip.duration / N;
  const toes = ['toe_L', 'toe_R'].map(n => root.getObjectByName(n)), feet = ['foot_L', 'foot_R'].map(n => root.getObjectByName(n)), hips = root.getObjectByName('hips');
  putBack(rest); root.updateMatrixWorld(true);
  const restToe = Math.min(...toes.map(t => t.getWorldPosition(new Vector3()).y)), hands = ['hand_L', 'hand_R'].map(n => root.getObjectByName(n));
  const restYaw = ['hips', 'chest'].map(n => root.getObjectByName(n).getWorldQuaternion(new Quaternion()).invert());
  const worst = {}, speeds = [], prev = [null, null], ys = [];
  let jointFrames = 0, low = Infinity, high = -Infinity, reach = 0, kick = 0, hipYaw = 0, chestYaw = 0, feet0 = null, handGap = Infinity;
  const v = new Vector3(), w = new Vector3();
  for (let i = 0; i <= N; i++) {
    mixer.setTime(i * dt); root.updateMatrixWorld(true);
    const hits = chk.check({ dt: i ? dt / rate : 0 });
    if (hits.length) jointFrames++;
    for (const h of hits) { const k = `${h.rule} ${h.joint}`, over = +(h.amount - h.limit).toFixed(1); if (!(worst[k] >= over)) worst[k] = over; }
    const lo = lowestPoint(root, pts) - restFloor; low = Math.min(low, lo); high = Math.max(high, lo);
    toes.forEach((t, j) => {
      const p = t.getWorldPosition(v), on = p.y < restToe + K.planted;
      if (on && prev[j]) { speeds.push(Math.hypot(p.x - prev[j].x, p.z - prev[j].z) / dt); if (process.env.SEQ_DEBUG === clip.name && speeds.at(-1) > .015) console.log('  slide', j, i, (speeds.at(-1) * 100).toFixed(1), 'cm/s at', ((p.y - restToe) * 1000).toFixed(1), 'mm'); }
      prev[j] = on ? { x: p.x, z: p.z } : null;
      kick = Math.max(kick, p.y - restToe);
    });
    for (const f of feet) { f.getWorldPosition(w); reach = Math.max(reach, Math.hypot(w.x, w.z)); }
    handGap = Math.min(handGap, hands[0].getWorldPosition(v).distanceTo(hands[1].getWorldPosition(w)));
    if (i === 0) feet0 = feet.map(f => f.getWorldPosition(new Vector3())).map(p => [+p.x.toFixed(3), +p.z.toFixed(3)]);
    ['hips', 'chest'].forEach((n, j) => { const f = new Vector3(0, 0, 1).applyQuaternion(root.getObjectByName(n).getWorldQuaternion(new Quaternion()).multiply(restYaw[j]));
      const yaw = Math.abs(Math.atan2(f.x, f.z)) * 180 / Math.PI; if (j) chestYaw = Math.max(chestYaw, yaw); else hipYaw = Math.max(hipYaw, yaw); });
    ys.push(hips.getWorldPosition(v).y);
  }
  a.stop(); mixer.uncacheRoot(root); putBack(rest); root.updateMatrixWorld(true);
  const s = speeds.sort((x, y) => x - y), p95 = s.length ? s[Math.min(s.length - 1, Math.floor(.95 * s.length))] : 0;
  const sinkCm = +(Math.max(0, -low) * 100).toFixed(2);
  const fails = [];
  if (jointFrames) fails.push('joint-rules');
  if (!floor && p95 * 100 > K.slideCmS) fails.push('planted-foot-slides');
  if (sinkCm > (floor ? K.floorSinkCm : K.sinkCm)) fails.push('sinks-into-the-floor');
  return { ok: !fails.length, fails, jointFrames, joints: worst, slideP95CmS: +(p95 * 100).toFixed(2), sinkCm, hoverCm: +(Math.max(0, low) * 100).toFixed(2), topCm: +(high * 100).toFixed(1),
    stance: { feet: feet0, hipYaw: +hipYaw.toFixed(1), chestYaw: +chestYaw.toFixed(1), lift: +(Math.max(...ys) - Math.min(...ys)).toFixed(3), reach: +reach.toFixed(3), kick: +kick.toFixed(3), handGap: +handGap.toFixed(3) } };
}

const report = { made: new Date().toISOString(), check: SEQ_CHECK, rigs: {} }, kept = {}, timings = new Map(), fit = {};
for (const r of RIGS) {
  const model = await loadGlb(path.join(MODELS, `${r.model}.glb`)), raw = await loadGlb(path.join(SEQ, 'raw', `${r.raw}.glb`));
  const root = model.scene; root.updateMatrixWorld(true);
  const tree = danceTree(root); if (!tree) throw new Error(`${r.who}: the club prep does not recognise the skeleton`);
  const chk = createAnatomyCheck(root); if (!chk.supported) throw new Error(`${r.who}: joint check ${chk.reason}`);
  const rest = restOf(root), pts = skinPoints(root), restFloor = lowestPoint(root, pts);
  const rows = report.rigs[r.who] = {}; kept[r.who] = new Map();
  for (const name of names) {
    const d = SEQ_TAKES[name];
    if (d.floor && !r.floor) { rows[name] = { skipped: 'floor work: back row only' }; continue; }
    const src = raw.animations.find(c => c.name === name); if (!src) { rows[name] = { error: 'no raw take' }; continue; }
    const t0 = performance.now();
    // the Club's standing path first; a take that breaks the joint rules there tries the floor-work path danced standing
    // ("grounded": its body joint repair, floor-joint-repair.js, brings wide lunges inside R10 / R1; the feet are planted
    // again after it), as the Club prepares its gingas
    const attempt = grounded => {
      let res;
      try { res = prepareClubDance(root, src, { tree, name, label: name, timing: process.env.SEQ_OWN ? null : timings.get(name) || null, ...(d.floor || grounded ? { floorWork: true } : d.footprint ? { footprint: true } : {}) }); }
      catch (e) { res = { clip: null, reason: `error: ${e.message}` }; }
      putBack(rest); root.updateMatrixWorld(true);
      if (!res.clip) return { res, grounded };
      if (r.who === 'kotone' && res.timing && !timings.has(name)) timings.set(name, res.timing);
      if (!d.floor) res.clip = plantFeet(root, res.clip, rest);
      const opts = { floor: !!d.floor, chk, pts, restFloor, rest };
      let chkd = measure(root, res.clip, opts), maxRate = SEQ_CHECK.fastest;
      // only a roll too fast at 1.2x: the fastest rate it passes (the plan keeps it at or under that)
      const rollOnly = c => c.fails.length === 1 && c.fails[0] === 'joint-rules' && Object.keys(c.joints).every(k => /^R6 .*rollSpeed$/.test(k));
      if (rollOnly(chkd)) for (const r2 of SEQ_CHECK.slower) { const c2 = measure(root, res.clip, { ...opts, rate: r2 }); if (c2.ok) { chkd = { ...c2, joints1_2: chkd.joints }; maxRate = r2; break; } }
      return { res, chkd, maxRate, grounded };
    };
    let A = attempt(!!d.grounded);
    const jointFail = x => (!x.res.clip && /joint-rules/.test(x.res.reason || '')) || (x.chkd && !x.chkd.ok && x.chkd.fails.includes('joint-rules'));
    if (!d.floor && !d.grounded && jointFail(A)) { const B = attempt(true); if (B.chkd?.ok) A = { ...B, first: A.res.clip ? A.chkd.fails.join(',') : A.res.reason }; }
    const { res, chkd, maxRate } = A, ms = Math.round(performance.now() - t0);
    if (!res.clip) { rows[name] = { prep: res.reason, ms, meta: res.meta ? { takeBpm: res.meta.takeBpm, jitter: res.meta.jitter } : undefined }; console.log(r.who.padEnd(7), name.padEnd(16), 'DROP', res.reason); continue; }
    const m = res.meta, how = A.grounded && !d.grounded ? ' (grounded)' : '';
    rows[name] = { ms, maxRate, path: A.grounded ? 'grounded' : d.floor ? 'floor' : 'standing', ...(A.first ? { standingPath: A.first } : {}), bpm: m.bpm, beats: m.beatsPerLoop, loop: m.loopSeconds, grid: m.stepGrid, energy: m.energy, window: m.windowTry || 1, shared: !!m.timingShared, ...chkd };
    console.log(r.who.padEnd(7), name.padEnd(16), chkd.ok ? `ok${maxRate < SEQ_CHECK.fastest ? `@${maxRate}x` : ''}${how}  ` : `FAIL ${chkd.fails.join(',')}`, `${m.bpm} bpm ${m.beatsPerLoop} beats ${m.loopSeconds}s`,
      `joints ${chkd.jointFrames} slide ${chkd.slideP95CmS} sink ${chkd.sinkCm} hover ${chkd.hoverCm}`, Object.keys(chkd.joints).length ? JSON.stringify(chkd.joints) : '');
    if (!chkd.ok) continue;
    res.clip.name = name;
    kept[r.who].set(name, res.clip);
    // the tempo and loop are the take's (shared); the stance is the first body's that keeps it
    fit[name] ||= { bpm: m.bpm, beat: m.beatSeconds, phase: m.phase, loop: m.loopSeconds, beats: m.beatsPerLoop, grid: m.stepGrid, energy: m.energy, ...(d.floor ? { floor: true } : {}), stance: chkd.stance, maxRate: {}, rigs: [] };
    fit[name].maxRate[r.suffix] = maxRate;
    fit[name].rigs.push(r.suffix);
  }
}
// the copies: every body that may dance a kept clip as a copy of its rig, the joint rules on each (60 Hz, the clip's max rate)
const bodies = new Map();
const bodyOf = async f => { if (!bodies.has(f)) { const g = await loadGlb(path.join(MODELS, `${f}.glb`)), root = g.scene; root.updateMatrixWorld(true);
  bodies.set(f, { root, rest: restPose(root), chk: createAnatomyCheck(root), bones: restOf(root) }); } return bodies.get(f); };
for (const r of RIGS) {
  const src = await bodyOf(r.model);
  const cps = await Promise.all(COPIES[r.who].map(async f => { const b = await bodyOf(f); return { f, b, cp: makeCopier(src.root, b.root, src.rest, b.rest) }; }));
  for (const [name, clip] of kept[r.who]) {
    const rate = fit[name]?.maxRate?.[r.suffix] ?? SEQ_CHECK.fastest, mixer = new AnimationMixer(src.root), a = mixer.clipAction(clip); a.play();
    const N = Math.max(2, Math.round(clip.duration * SEQ_CHECK.hz)), dt = clip.duration / N, bad = {};
    for (let i = 0; i <= N; i++) {
      mixer.setTime(i * dt); src.root.updateMatrixWorld(true);
      for (const c of cps) { c.cp.copy(); c.b.root.updateMatrixWorld(true);
        for (const h of c.b.chk.check({ dt: i ? dt / rate : 0 })) { const k = `${c.f} ${h.rule} ${h.joint}`, over = +(h.amount - h.limit).toFixed(1); if (!(bad[k] >= over)) bad[k] = over; } }
    }
    a.stop(); mixer.uncacheRoot(src.root); putBack(src.bones); src.root.updateMatrixWorld(true); for (const c of cps) { putBack(c.b.bones); c.b.root.updateMatrixWorld(true); }
    const n = Object.keys(bad).length;
    (report.copies ||= {})[`${r.who} ${name}`] = n ? bad : 'ok';
    if (!n) continue;
    // kept for the casts it fits: the plan leaves it out wherever one of these bodies copies that rig (plan.js `bodies`)
    const fails = [...new Set(Object.keys(bad).map(k => k.split(' ')[0]))].sort();
    console.log(r.who.padEnd(7), name.padEnd(16), 'copies fail on', fails.join(', '), JSON.stringify(bad));
    if (fit[name]) (fit[name].fails ||= {})[r.suffix] = fails;
  }
}
await fs.mkdir(SEQ, { recursive: true });
await fs.writeFile(path.join(SEQ, only ? 'report-only.json' : 'report.json'), JSON.stringify(report, null, 1));
if (only) process.exit(0);

// the packs: per style, each body's kept clips of that style (the armature from the body's shipped pack)
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const sizes = {};
for (const style of SEQ_STYLES) for (const r of RIGS) {
  const want = styleClips(style).filter(n => kept[r.who].has(n));
  const file = path.join(MODELS, `moves-seq-${style}-${r.suffix}.glb`);
  const doc = await io.read(path.join(MODELS, `${r.template}.glb`)), dr = doc.getRoot(), buf = dr.listBuffers()[0];
  for (const an of dr.listAnimations()) { for (const s of an.listSamplers()) { s.getInput()?.dispose(); s.getOutput()?.dispose(); } an.dispose(); }
  const nodes = new Map(dr.listNodes().map(n => [n.getName(), n]));
  for (const name of want) {
    const clip = kept[r.who].get(name), an = doc.createAnimation(name), timeAcc = new Map();
    for (const t of clip.tracks) {
      const [bone, prop] = t.name.split('.'); if (prop !== 'quaternion' && !(prop === 'position' && bone === 'hips')) continue;
      const node = nodes.get(bone); if (!node) throw new Error(`pack has no node ${bone}`);
      const key = `${t.times.length}:${t.times[0]}:${t.times.at(-1)}`;
      let input = timeAcc.get(key); if (!input) { input = doc.createAccessor().setType('SCALAR').setArray(new Float32Array(t.times)).setBuffer(buf); timeAcc.set(key, input); }
      const output = doc.createAccessor().setType(prop === 'quaternion' ? 'VEC4' : 'VEC3').setArray(new Float32Array(t.values)).setBuffer(buf);
      const s = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('LINEAR');
      an.addSampler(s).addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath(prop === 'quaternion' ? 'rotation' : 'translation').setSampler(s));
    }
  }
  dr.getAsset().extras = { ...(dr.getAsset().extras || {}), generator: 'scripts/seq-bake.mjs', sequence: style,
    moves: 'Mixamo animations (the owner\'s library), retargeted by art/blender/seq_takes.py and cut into loops by Avatar Studio Club mode\'s dance prep' };
  await io.write(file, doc);
  const raw = (await fs.stat(file)).size;
  // thinned like the Club bake: standing clips with the legs and hips exact; floor work with the arms and spine exact too
  const stand = want.filter(n => !SEQ_TAKES[n].floor), floor = want.filter(n => SEQ_TAKES[n].floor);
  const trim = (list, exact) => list.length && execFileSync(process.execPath, [path.join(ROOT, 'art/blender/trim_clips.mjs'), file, String(TRIM), `^(${list.join('|')})$`, exact], { encoding: 'utf8' }).trim();
  trim(stand, EXACT_STAND); trim(floor, EXACT_FLOOR);
  sizes[`${style}-${r.suffix}`] = { clips: want.length, rawBeforeTrim: raw, bytes: (await fs.stat(file)).size };
}

// the joint rules, slide and floor again on the thinned 16-bit clips as the game reads them
const after = {};
for (const r of RIGS) {
  const model = await loadGlb(path.join(MODELS, `${r.model}.glb`)), root = model.scene; root.updateMatrixWorld(true);
  const chk = createAnatomyCheck(root), rest = restOf(root), pts = skinPoints(root), restFloor = lowestPoint(root, pts);
  for (const style of SEQ_STYLES) {
    const pack = await loadGlb(path.join(MODELS, `moves-seq-${style}-${r.suffix}.glb`));
    for (const clip of pack.animations) {
      const k = `${r.who} ${clip.name}`; if (after[k]) continue;
      const c = measure(root, clip, { floor: !!SEQ_TAKES[clip.name]?.floor, chk, pts, restFloor, rest, rate: fit[clip.name]?.maxRate?.[r.suffix] ?? SEQ_CHECK.fastest });
      after[k] = { ok: c.ok, fails: c.fails, jointFrames: c.jointFrames, slideP95CmS: c.slideP95CmS, sinkCm: c.sinkCm };
      if (!c.ok) console.log('THINNED FAIL', k, c.fails.join(','), JSON.stringify(c.joints));
    }
  }
}
report.sizes = sizes; report.thinned = after;
await fs.writeFile(path.join(SEQ, 'report.json'), JSON.stringify(report, null, 1));
const bad = Object.entries(after).filter(([, v]) => !v.ok).map(([k]) => k);
console.log(bad.length ? `thinned clips fail: ${bad.join(', ')}` : `thinned clips: all ok (${Object.keys(after).length})`);
console.log(JSON.stringify(sizes));

const round = x => Object.fromEntries(Object.entries(x).map(([k, v]) => [k, typeof v === 'number' ? +v.toFixed(5) : v]));
await fs.writeFile(path.join(ROOT, 'src/content/dance-seq-fit.js'), `// © 2026 Bui Cong Nguyen · solluxlabs.com
// Written by scripts/seq-bake.mjs: each sequence clip as the Club prep cut it (content/dance-sequences.js). bpm / beat (s)
// / phase (s into the loop where its beat grid starts) / loop (s) / beats: its own tempo and loop, so the plan plays it at
// the song's beat (game/perform/plan.js clipTiming); grid: its steps on the beat or the eighth (an eighth-grid dance never
// plays in double time); energy: leg lengths a second; stance: its first frame's feet (m), largest hip / chest turn (deg),
// hip lift, foot reach from the centre and highest toe (m), on the first body that keeps it; rigs: the packs that have it;
// maxRate: per pack, the fastest beat-sync rate its joints pass; fails: per pack, the bodies a copy of it breaks a joint
// rule on (game/perform/plan.js leaves it out of a routine those bodies dance).
export const SEQ_FIT = Object.freeze(${JSON.stringify(Object.fromEntries(Object.entries(fit).map(([k, v]) => [k, { ...round(v), stance: v.stance }])), null, 1)});
`);
if (bad.length) process.exitCode = 1;
