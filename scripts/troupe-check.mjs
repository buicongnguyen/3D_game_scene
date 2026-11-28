// The group performance, measured in Node (no browser): a whole song played exactly as the game plays it (Kotone's
// performer with her foot hold and mic layer, the troupe copying her pose to the front row and running the back row's
// own mixer), then for every member: planted-foot slide (toe joints within 4 mm of that member's floor = planted;
// slide = their speed across the ground while planted), the joint rules on the copied poses (Avatar Studio's
// anatomy-joint-check.js, R1-R11, read-only copy in .tools/club-solver: run kotone-club-bake.mjs --vendor first), the
// sink below the floor, and the JS time of one frame's troupe pose against a full mixer per member.
//   node scripts/troupe-check.mjs [--song public/songs/kotone/golden-rails-en | .tools/test-song/ngay-nao-cung-vui] [--dir public/models] [--n 8] [--own]
//     --own: every member on its own mixer and own bake (what the shared animation saves; slide of the own bakes)
//     --style mix|kpop|cute|hiphop: the Dance choice (content/kotone-club.js DANCE_STYLES)
//     --slope DEG: on a hillside DEG steep (the back row uphill; --across: the slope runs across the formation), every
//       member's feet fitted to it (game/perform/ground-fit.js): floatCm / sinkCm = the planted toe's and ankle's height
//       over the ground under them against the dance's own height over level ground (planted: the dance's toe within
//       4 mm of its floor), slide measured on those planted frames
//   stance: the ankles' distance apart while both feet are planted, median, as % of that body's hip-joint width
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'meshoptimizer';
import { Animator } from '../src/actors/animator.js';
import { prepareMoves } from '../src/game/tricks/exercise-moves.js';
import { Performer, poseDance } from '../src/game/perform/performer.js';
import { planBacking } from '../src/game/perform/plan.js';
import { createFootHold } from '../src/game/perform/foot-hold.js';
import { Troupe, restPose } from '../src/game/perform/troupe.js';
import { troupeOf } from '../src/content/troupe.js';
import { KOTONE_SONGS } from '../src/content/kotone-songs.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d = null) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const DIR = path.resolve(ROOT, arg('dir', 'public/models')), SONG = path.resolve(ROOT, arg('song', '.tools/test-song/ngay-nao-cung-vui'));
const FEET = arg('feet', 'auto'), N = Number(arg('n', 8)), OWN = process.argv.includes('--own'), HZ = 60, FLOOR = .004, SLIDE = .015;
const SLOPE = Number(arg('slope', 0)), ACROSS = process.argv.includes('--across'), TAN = Math.tan(SLOPE * Math.PI / 180);
const ground = SLOPE ? (x, z) => (ACROSS ? x : -z) * TAN : null;
await MeshoptDecoder.ready;

async function loadGlb(file) {   // textures stripped (Node has no image decoder)
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
const json = async f => { try { return JSON.parse(await fs.readFile(f, 'utf8')); } catch { return null; } };
const id = path.basename(SONG), meta = (await json(`${SONG}.song.json`)) || KOTONE_SONGS.find(e => e.id === id) || null;   // (a game song: its KOTONE_SONGS line)
const song = { song: { ...(meta || {}), id }, beats: await json(`${SONG}.beats.json`), lyrics: await json(`${SONG}.lyrics.json`), mouth: await json(`${SONG}.mouth.json`), stage: await json(`${SONG}.stage.json`), url: null };
if (!song.song.bpm && !song.beats) throw new Error(`no song at ${SONG}`);

const scene = new THREE.Scene(), formation = new THREE.Group(); scene.add(formation);
const cast = troupeOf(N), lead = cast.find(m => m.lead);
const place = (m, model) => { const x = m.x - lead.x, z = m.z - lead.z; model.position.set(x, ground ? ground(x, z) : 0, z); formation.add(model); model.updateMatrixWorld(true); };
const kg = await loadGlb(path.join(ROOT, 'public/models/kotone.glb')), kpack = await loadGlb(path.join(ROOT, 'public/models/moves-kotone.glb'));
const kModel = kg.scene; kModel.userData.clips = kg.animations; place(lead, kModel);
const npc = { model: kModel, anim: new Animator(kModel), face: null, pos: new THREE.Vector3() };
const kClips = prepareMoves(kpack, kModel, kpack.scene, false);
const members = [];
for (const m of cast) {
  if (m.lead) continue;
  const g = await loadGlb(path.join(DIR, `${m.file}.glb`)); place(m, g.scene);
  const e = { m, model: g.scene };
  if (m.source || OWN) { const p = await loadGlb(path.join(DIR, `moves-${m.file}.glb`)); e.clips = prepareMoves(p, g.scene, p.scene, false); }
  members.push(e);
}
const perf = new Performer(npc, kClips, song, { restRoot: kpack.scene, style: arg('style', 'mix'), ground });
perf.start(0);
let troupe = null, own = null;
if (OWN) {   // every member its own dancer (no copy): the cost the shared rows save, and the own bakes' slide
  const backPlan = planBacking(perf.plan, { noContact: true });
  own = members.map(e => { const plan = e.m.row === 0 ? perf.plan : backPlan, mixer = new THREE.AnimationMixer(e.model), actions = new Map();
    for (const n of new Set([...plan.blocks.map(b => b.clip), ...plan.moments.map(x => x.clip)])) { const c = e.clips.get(n); if (!c) continue; const a = mixer.clipAction(c); a.setLoop(THREE.LoopRepeat, Infinity); a.timeScale = 0; a.setEffectiveWeight(0); a.play(); actions.set(n, a); }
    return { e, plan, mixer, actions, feet: createFootHold(e.model) }; });
  perf.onPose = (dt, t) => { const t0 = performance.now(); for (const o of own) { o.feet.restore(); const f = poseDance(o.plan, perf.clock, o.actions, t); o.mixer.update(0); o.feet.update(dt, f); } msAcc += performance.now() - t0; };
} else troupe = new Troupe(perf, kModel, kpack.scene, members, { feet: FEET === 'auto' ? 'auto' : FEET === 'on', backHalf: process.argv.includes('--half'), ground });

// the joint rules (the Studio's checker) on every member, the lead included
let chk = null;
try { const { createAnatomyCheck } = await import(pathToFileURL(path.join(ROOT, '.tools/club-solver/src/anatomy-joint-check.js')).href); chk = createAnatomyCheck; } catch { console.warn('no joint checker in .tools/club-solver (run kotone-club-bake.mjs --vendor)'); }
const all = [{ m: lead, model: kModel, fit: perf.fit }, ...members];
const st = all.map(e => {
  const toes = ['toe_L', 'toe_R'].map(n => e.model.getObjectByName(n)), inv = new THREE.Matrix4().copy(e.model.matrixWorld).invert();
  const floor = Math.min(...toes.map(t => t.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv).y));
  const feet = ['foot_L', 'foot_R'].map(n => e.model.getObjectByName(n)), hip = ['thigh_L', 'thigh_R'].map(n => e.model.getObjectByName(n).getWorldPosition(new THREE.Vector3()));
  return { e, toes, feet, hipW: hip[0].distanceTo(hip[1]), stance: [], inv, floor, prev: [null, null], run: [null, null], speeds: [], slides: 0, contacts: 0, sink: 0, gFloat: 0, gSink: 0, joints: {}, jointFrames: 0, check: chk ? chk(e.model) : null };
});
const dt = 1 / HZ, end = perf.plan.end + 1;
let msAcc = 0, frames = 0;
const _v = new THREE.Vector3(), _w = new THREE.Vector3();
for (let t = 0; t < end; t += dt) {
  perf.update(dt);
  perf.before(); npc.anim.update(dt); perf.after(dt);
  frames++;
  scene.updateMatrixWorld(true);
  for (const s of st) {
    s.toes.forEach((toe, i) => {
      const L = ground ? s.e.fit?.state.legs[i] : null, p = toe.getWorldPosition(_v).applyMatrix4(s.inv), on = L ? L.toe0 < L.toeH + FLOOR : p.y < s.floor + FLOOR;
      if (L) {
        // on the hillside: toe and ankle over the ground under them now, against the dance's height over level ground
        const T = toe.getWorldPosition(_w), A = s.feet[i].getWorldPosition(new THREE.Vector3());
        if (on) for (const e of [T.y - ground(T.x, T.z) - L.toe0, A.y - ground(A.x, A.z) - L.ankle0]) { s.gFloat = Math.max(s.gFloat, e); s.gSink = Math.max(s.gSink, -e); }
        p.y = L.toe0 + s.floor - L.toeH;
      }
      s.sink = Math.max(s.sink, s.floor - p.y);
      if (on && s.prev[i]) { s.speeds.push(Math.hypot(p.x - s.prev[i].x, p.z - s.prev[i].z) / dt); }
      if (on) { if (!s.run[i]) { s.run[i] = { x: p.x, z: p.z, max: 0 }; s.contacts++; } else s.run[i].max = Math.max(s.run[i].max, Math.hypot(p.x - s.run[i].x, p.z - s.run[i].z)); }
      else if (s.run[i]) { if (s.run[i].max > SLIDE) s.slides++; s.run[i] = null; }
      s.prev[i] = on ? { x: p.x, z: p.z } : null;
    });
    if (s.prev[0] && s.prev[1]) s.stance.push(s.feet[0].getWorldPosition(_v).distanceTo(s.feet[1].getWorldPosition(_w)) / s.hipW);
    if (s.check?.supported) { const v = s.check.check({ dt }); if (v.length) s.jointFrames++; for (const x of v) { const k = `${x.rule} ${x.joint}`; s.joints[k] = Math.max(s.joints[k] || 0, +(x.amount - x.limit).toFixed(1)); } }
  }
}
const pct = (a, q) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const rows = st.map(s => ({ who: s.e.m.id, row: s.e.m.row, stancePctHip: Math.round(pct(s.stance, .5) * 100), slideP95cmS: +(pct(s.speeds, .95) * 100).toFixed(2), slideP99cmS: +(pct(s.speeds, .99) * 100).toFixed(2), slidesOver15mm: s.slides, contacts: s.contacts, sinkCm: +(s.sink * 100).toFixed(2), ...(ground ? { slopeFloatCm: +(s.gFloat * 100).toFixed(2), slopeSinkCm: +(s.gSink * 100).toFixed(2), fit: !!s.e.fit } : {}), jointFrames: s.jointFrames, joints: s.joints }));
const ms = troupe ? troupe.takeMs() : msAcc / frames;
const out = { song: id, style: perf.plan.style, members: cast.length, mode: OWN ? 'own mixer each' : `shared rows, feet ${FEET}${process.argv.includes('--half') ? ', back half rate' : ''}`, slope: SLOPE ? `${SLOPE} deg${ACROSS ? ' across' : ', back row uphill'}` : 'level', frames, msPerFrame: +ms.toFixed(4), front: perf.plan.blocks.map(b => b.clip), back: troupe?.plans.back?.blocks.map(b => b.clip) || null,
  copiers: troupe ? { front: troupe.front.map(c => ({ bones: c.bones, corrected: c.corrected, hipsK: +c.hips.k.toFixed(4), split: +c.mismatch.toFixed(4), ik: c.ik })), back: troupe.back?.copiers.map(c => ({ bones: c.bones, corrected: c.corrected, hipsK: +c.hips.k.toFixed(4), split: +c.mismatch.toFixed(4), ik: c.ik })) } : null, rows };
console.table(rows.map(({ joints, ...r }) => ({ ...r, joints: Object.keys(joints).join(' ') })));
console.log(JSON.stringify({ ...out, rows: undefined }));
await fs.mkdir(path.join(ROOT, '.tools/group'), { recursive: true });
await fs.writeFile(path.join(ROOT, `.tools/group/troupe-check-${perf.plan.style}-${OWN ? 'own' : `shared-${FEET}${process.argv.includes('--half') ? '-half' : ''}`}-${cast.length}${SLOPE ? `-slope${SLOPE}${ACROSS ? 'x' : ''}` : ''}.json`), JSON.stringify(out, null, 1));
