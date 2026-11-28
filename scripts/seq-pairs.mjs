// © 2026 Bui Cong Nguyen · solluxlabs.com
// The dance sequences' fades, checked (docs/SING-AND-PLAY.md "Dance sequences"): every take is clean on its own
// (scripts/seq-bake.mjs), but a blend of two Mixamo takes can still break a joint rule for a few frames (a pinky spread
// 1 deg over, a knee 1 deg out of its plane, a hip 1 deg past its abduction) where neither take does. Here every ordered
// pair of a style's dances (its takes and Club fill-ins, per rig) is faded exactly as the game fades it (troupe.js
// RowDancer: matchStarts, poseDance, the feet lock and the hips lift, the floor blend into floor work) at four song tempos
// and from every half beat of the first take (--step), through the fade and two beats on (a foot pinned in the fade creeps
// out after it), on the rig and on every body that copies it (makeCopier, toes), with the joint rules at 120 Hz. A pair that breaks one is written to src/content/dance-seq-pairs.js with the bodies it broke on ('self': the
// rig's own body); game/perform/plan.js then never puts the second after the first in a routine one of those bodies dances.
//   node scripts/seq-pairs.mjs --step 0.5 [--styles latin,soul] [--bpm 87,96,110,124]   (about 10 min)
// (sampled tempos: a song at another tempo plays the takes at other rates, so a fade it shows may still differ; the
// troupe check, scripts/troupe-check.mjs, runs whole songs)
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'meshoptimizer';
import { prepareMoves } from '../src/game/tricks/exercise-moves.js';
import { RowDancer, makeCopier, restPose } from '../src/game/perform/troupe.js';
import { SEQUENCES, SEQ_STYLES, SEQ_TAKES, isFloorClip } from '../src/content/dance-sequences.js';
import { SEQ_FIT } from '../src/content/dance-seq-fit.js';
import { hasClip, clipRate, PLAN } from '../src/game/perform/plan.js';
import { beatRate } from '../src/game/perform/beat-clock.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), MODELS = path.join(ROOT, 'public/models');
const arg = n => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : null; };
const STYLES = arg('styles') ? arg('styles').split(',') : SEQ_STYLES, BPMS = (arg('bpm') || '87,96,110,124').split(',').map(Number), HZ = 120, STEP = Number(arg('step') || 1);
const COPIES = Object.freeze({ kotone: ['vroid-nu3', 'vroid-nu5', 'vroid-nu4', 'vroid-nu1', 'vroid-nam1', 'vroid-nam3', 'vroid-nam2', 'vroid-nightstar'], nam1: ['vroid-nu1', 'vroid-nam3', 'vroid-nam2', 'vroid-nu3'] });
const RIGS = Object.freeze([{ rig: 'kotone', model: 'kotone', pack: 'moves-kotone' }, { rig: 'nam1', model: 'vroid-nam1', pack: 'moves-vroid-nam1' }]);
const { createAnatomyCheck } = await import(pathToFileURL(path.join(ROOT, '.tools/club-solver/src/anatomy-joint-check.js')).href);
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
const restOf = root => { const m = new Map(); root.traverse(o => { if (o.isBone || o.isObject3D) m.set(o, { q: o.quaternion.clone(), p: o.position.clone() }); }); return m; };
const putBack = rest => { for (const [o, r] of rest) { o.quaternion.copy(r.q); o.position.copy(r.p); } };

// (--styles: only those styles' pairs are checked again; the others' kept from the file as it is)
/** Fades the whole-song troupe check found (scripts/troupe-check.mjs --why) where the sampled ones here pass: a pin from
 *  the fade before still creeping out at the bar line, a state these two-block fades do not build. Kept on every run. */
const FOUND = Object.freeze({ nam1: { 'SeqSamba5>SeqHouse': ['vroid-nam2', 'vroid-nam3'] } });
const out = arg('styles') ? JSON.parse(JSON.stringify((await import('../src/content/dance-seq-pairs.js')).SEQ_PAIRS)) : { kotone: {}, nam1: {} }, stats = {};
for (const R of RIGS) {
  const body = (await loadGlb(path.join(MODELS, `${R.model}.glb`))).scene; body.updateMatrixWorld(true);
  const rest = restOf(body), clips = new Map();
  const add = async f => { const p = await loadGlb(path.join(MODELS, `${f}.glb`)); for (const [k, v] of prepareMoves(p, body, p.scene, false)) clips.set(k, v); };
  await add(R.pack); for (const s of STYLES) await add(`moves-seq-${s}-${R.rig}`);
  const copies = [];
  for (const f of COPIES[R.rig]) { const root = (await loadGlb(path.join(MODELS, `${f}.glb`))).scene; root.updateMatrixWorld(true);
    copies.push({ f, root, rest: restOf(root), chk: createAnatomyCheck(root), cp: makeCopier(body, root, restPose(body), restPose(root), { toes: true }) }); }
  const selfChk = createAnatomyCheck(body);
  const seen = new Set();
  for (const style of STYLES) {
    const ids = [...new Set(SEQUENCES[style].steps.flatMap(s => s.ids))].filter(id => hasClip(id, R.rig) && clips.has(id) && (R.rig === 'nam1' || !isFloorClip(id)));
    for (const a of ids) for (const b of ids) {
      if (a === b || seen.has(`${a}>${b}`)) continue;
      seen.add(`${a}>${b}`);
      const bad = new Set(), fa = SEQ_FIT[a], beatsA = fa ? fa.beats : Math.round(clips.get(a).duration / .5);
      for (const bpm of BPMS) for (let o = 0; o < beatsA && !bad.has('self'); o += STEP) {   // (broken on the rig itself: banned for every cast)
        const ra = clipRate(a, bpm, { rig: R.rig }) || beatRate(bpm, 120), rb = clipRate(b, bpm, { rig: R.rig }) || beatRate(bpm, 120);
        const floor = isFloorClip(a) !== isFloorClip(b), fade = floor ? PLAN.floorFadeBeats : PLAN.fadeBeats;
        const P = { sequence: true, meter: 4, rate: { m: 1 }, end: 1e9, lastBar: 99, moments: [], blocks: [
          { b0: 0, b1: 2, clip: a, m: ra.m, offset: o, ...(isFloorClip(a) ? { floor: true } : {}) },
          { b0: 2, b1: 6, clip: b, m: rb.m, fade, ...(isFloorClip(b) ? { floor: true } : {}) }] };
        const clock = { beatAt: t => t * bpm / 60 };
        putBack(rest); body.updateMatrixWorld(true);
        const dancer = new RowDancer(body, clips, P, clock);
        P.blocks[0].offset = o;   // (matchStarts only moves the second take's start)
        // (from half a beat before the bar line to two beats after the fade: a foot pinned in the fade creeps out after it)
        const t0 = (8 - .5) * 60 / bpm, t1 = (8 + fade + 2) * 60 / bpm, dt = 1 / HZ;
        for (const c of copies) { putBack(c.rest); c.root.updateMatrixWorld(true); }
        let first = true;
        for (let t = t0; t <= t1; t += dt) {
          dancer.pose(dt, t); body.updateMatrixWorld(true);
          if (selfChk.check({ dt: first ? 0 : dt }).length) bad.add('self');
          for (const c of copies) { c.cp.copy(); c.root.updateMatrixWorld(true); if (c.chk.check({ dt: first ? 0 : dt }).length) bad.add(c.f); }
          first = false;
        }
        dancer.dispose(); putBack(rest); body.updateMatrixWorld(true);
      }
      stats[R.rig] = (stats[R.rig] || 0) + 1;
      if (bad.size) { out[R.rig][`${a}>${b}`] = [...bad].sort(); console.log(R.rig.padEnd(7), `${a} > ${b}`.padEnd(34), [...bad].join(', ')); }
    }
  }
}
console.log('pairs checked', JSON.stringify(stats), 'failing', Object.keys(out.kotone).length, '+', Object.keys(out.nam1).length);
for (const [rig, m] of Object.entries(FOUND)) for (const [k, v] of Object.entries(m)) out[rig][k] = [...new Set([...(out[rig][k] || []), ...v])].sort();
await fs.writeFile(path.join(ROOT, 'src/content/dance-seq-pairs.js'), `// © 2026 Bui Cong Nguyen · solluxlabs.com
// Written by scripts/seq-pairs.mjs: the fades between two dances of a sequence style (per rig: kotone = the front row's
// source, nam1 = the back row's) that break a joint rule for a few frames on one of these bodies ('self': the rig's own;
// the others: model files that copy it). game/perform/plan.js never puts B after A in a routine those bodies dance.
// 'A>B' -> [bodies]. Checked at 87, 96, 110 and 124 BPM from every half beat of A (Latin party also at 85 and 86.7 BPM from
// every quarter beat), through the fade and two beats after it, at 120 Hz; plus the fades the whole-song troupe check found
// (seq-pairs.mjs FOUND). Last run: ${BPMS.join(', ')} BPM, every ${STEP} beat${arg('styles') ? `, ${arg('styles')}` : ''}.
export const SEQ_PAIRS = Object.freeze(${JSON.stringify(out, null, 1)});
`);
