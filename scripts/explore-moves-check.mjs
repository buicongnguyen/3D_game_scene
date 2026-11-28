// © 2026 Bui Cong Nguyen · solluxlabs.com
// The Explore moves pack (public/models/moves-explore.glb) on the singer bodies, measured in Node (no browser): every clip
// made ready for each body exactly as the game does it (src/actors/body-moves.js bodyMoves), played at 60 Hz, then
//   joints   Avatar Studio's anatomy checker (R1-R11, read-only copy in .tools/club-solver: run
//            `node scripts/kotone-club-bake.mjs --vendor <studio>` first) on every frame: frames with a finding, the rules
//   feet     the lower ankle's height over the body's own rest ankle height (grounded clips: min / max cm), the sink of
//            a toe below the floor (cm)
//   hips     the hips' height over the root (cm: mean, min, max), e.g. Sit against the 0.45 m seat contract
//   node scripts/explore-moves-check.mjs [--pack <glb>] [--who nu-3,kotone,nam-1] [--clips Jump,Swim] [--out <json>]
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'meshoptimizer';
import { bodyMoves, hipsOver } from '../src/actors/body-moves.js';
import { member } from '../src/content/troupe.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d = null) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const PACK = path.resolve(ROOT, arg('pack', 'public/models/moves-explore.glb'));
const WHO = (arg('who', 'nu-3,kotone,nam-1')).split(',');
const ONLY = arg('clips') ? new Set(arg('clips').split(',')) : null;
const HZ = 60;
// clips that keep both feet on the ground (their sink and ankle lift are measured)
const GROUNDED = new Set(['Land', 'Sit', 'SitGrass', 'SitFloor', 'Crouch', 'CrouchWalk', 'CrouchReach', 'CrouchReachHold', 'Kneel', 'Pickup', 'Interact', 'Pet']);
await MeshoptDecoder.ready;

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

let chk = null;
try { ({ createAnatomyCheck: chk } = await import(pathToFileURL(path.join(ROOT, '.tools/club-solver/src/anatomy-joint-check.js')).href)); }
catch { console.warn('no joint checker in .tools/club-solver (run kotone-club-bake.mjs --vendor)'); }

const pack = await loadGlb(PACK);
const rows = [], all = {};
for (const id of WHO) {
  const m = member(id); if (!m) { console.warn('unknown', id); continue; }
  const g = await loadGlb(path.join(ROOT, 'public/models', `${m.file}.glb`)), body = g.scene;
  const clips = bodyMoves(pack, body, pack.scene), over = hipsOver(body);
  const hips = body.getObjectByName('hips'), toes = ['toe_L', 'toe_R'].map(n => body.getObjectByName(n)), feet = ['foot_L', 'foot_R'].map(n => body.getObjectByName(n));
  body.updateMatrixWorld(true);
  const floor = Math.min(...toes.map(t => t.getWorldPosition(new THREE.Vector3()).y)), ankle0 = Math.min(...feet.map(f => f.getWorldPosition(new THREE.Vector3()).y));
  const check = chk ? chk(body) : null;
  for (const [name, clip] of clips) {
    if (ONLY && !ONLY.has(name)) continue;
    const mixer = new THREE.AnimationMixer(body), a = mixer.clipAction(clip); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.play();
    const st = { frames: 0, jointFrames: 0, joints: {}, sink: 0, ankleMin: Infinity, ankleMax: -Infinity, hipsMin: Infinity, hipsMax: -Infinity, hipsSum: 0 };
    check?.reset?.();
    const n = Math.max(2, Math.ceil(clip.duration * HZ));
    for (let i = 0; i <= n; i++) {
      mixer.setTime(Math.min(clip.duration - 1e-4, i / HZ));
      body.updateMatrixWorld(true);
      st.frames++;
      const hy = hips.getWorldPosition(new THREE.Vector3()).y;
      st.hipsMin = Math.min(st.hipsMin, hy); st.hipsMax = Math.max(st.hipsMax, hy); st.hipsSum += hy;
      if (GROUNDED.has(name)) {
        const ty = Math.min(...toes.map(t => t.getWorldPosition(new THREE.Vector3()).y)), ay = Math.min(...feet.map(f => f.getWorldPosition(new THREE.Vector3()).y));
        st.sink = Math.max(st.sink, floor - ty); st.ankleMin = Math.min(st.ankleMin, ay - ankle0); st.ankleMax = Math.max(st.ankleMax, ay - ankle0);
      }
      if (check?.supported) {
        const v = check.check({ dt: i ? 1 / HZ : 0 });
        if (v.length) st.jointFrames++;
        for (const x of v) { const k = `${x.rule} ${x.joint}`; st.joints[k] = Math.max(st.joints[k] || 0, +(x.amount - x.limit).toFixed(1)); }
      }
    }
    mixer.stopAllAction(); mixer.uncacheRoot(body);
    const row = { who: id, clip: name, sec: +clip.duration.toFixed(2), jointFrames: st.jointFrames, frames: st.frames,
      hipsCm: `${Math.round(st.hipsSum / st.frames * 100)} (${Math.round(st.hipsMin * 100)}..${Math.round(st.hipsMax * 100)})`, restHipsCm: Math.round(over * 100),
      sinkCm: GROUNDED.has(name) ? +(st.sink * 100).toFixed(1) : '', ankleCm: GROUNDED.has(name) ? `${(st.ankleMin * 100).toFixed(1)}..${(st.ankleMax * 100).toFixed(1)}` : '',
      joints: Object.entries(st.joints).map(([k, v]) => `${k} +${v}`).join('; ') };
    rows.push(row); (all[id] ??= {})[name] = { ...row, joints: st.joints };
  }
}
console.table(rows.map(({ who, clip, sec, jointFrames, frames, hipsCm, restHipsCm, sinkCm, ankleCm }) => ({ who, clip, sec, jointFrames, frames, hipsCm, restHipsCm, sinkCm, ankleCm })));
for (const r of rows) if (r.joints) console.log(`${r.who} ${r.clip}: ${r.joints}`);
const total = rows.reduce((s, r) => s + r.jointFrames, 0);
console.log(JSON.stringify({ pack: path.relative(ROOT, PACK), bodies: WHO, clips: rows.length, jointFrames: total }));
if (arg('out')) await fs.writeFile(path.resolve(ROOT, arg('out')), JSON.stringify({ pack: path.relative(ROOT, PACK), bodies: WHO, jointFrames: total, rows: all }, null, 1));
process.exitCode = total ? 1 : 0;
