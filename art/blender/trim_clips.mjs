// Thin the clips of a GLB that art/blender/vroid_mixamo.py wrote (the glTF exporter keys every bone on every frame).
//   node art/blender/trim_clips.mjs <file.glb> [tolerance factor, default 1] [clip name pattern: only these clips]
//     [bone pattern: keys kept exact (only still tracks dropped): legs of moves solved with planted feet]
// Per clip: only rotations and the hips' position are kept (no bone grows or moves away from its parent); a rotation
// track that never leaves the bone's rest (< 0.05 deg) is dropped (the mixer then leaves the bone at rest, the same
// pose); the keys left are thinned greedily: a key goes when the line between its neighbours stays within TOL of every
// key it replaces (an angle for rotations, a distance for the hips). Prints one JSON line: tracks and keys before/after.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';

const DEG = Math.PI / 180;
// fingers and toes are small on screen; the body is not
const K = Number(process.argv[3] || 1);        // tolerance factor (the dance pack: looser)
const TOL = name => K * (/^(thumb|index|middle|ring|pinky)\d|^toe/.test(name) ? 2 * DEG : /^(eye_|head_end|grip_R)/.test(name) ? 2 * DEG : 0.5 * DEG);
const POS_TOL = 0.0015;

const file = process.argv[2];
const ONLY = process.argv[4] ? new RegExp(process.argv[4]) : null;   // (scripts/kotone-club-bake.mjs thins only the clips it added)
// thinning each bone on its own lets a planted foot wander (the errors of hips, thigh, shin and foot add up at the sole:
// Kotone's Club loops skated 25-58 cm/s at factors 1-2.4, 0.1-1.6 cm/s unthinned), so those bones can be kept exact
const EXACT = process.argv[5] ? new RegExp(process.argv[5]) : null;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(file);
const root = doc.getRoot();

const qAngle = (a, i, b, j) => {
  const d = Math.abs(a[i] * b[j] + a[i + 1] * b[j + 1] + a[i + 2] * b[j + 2] + a[i + 3] * b[j + 3]);
  return 2 * Math.acos(Math.min(1, d));
};
function slerp(v, i, j, t, out) {
  let ax = v[i], ay = v[i + 1], az = v[i + 2], aw = v[i + 3], bx = v[j], by = v[j + 1], bz = v[j + 2], bw = v[j + 3];
  let c = ax * bx + ay * by + az * bz + aw * bw;
  if (c < 0) { c = -c; bx = -bx; by = -by; bz = -bz; bw = -bw; }
  let s0 = 1 - t, s1 = t;
  if (c < 0.9999) { const o = Math.acos(c), so = Math.sin(o); s0 = Math.sin((1 - t) * o) / so; s1 = Math.sin(t * o) / so; }
  out[0] = s0 * ax + s1 * bx; out[1] = s0 * ay + s1 * by; out[2] = s0 * az + s1 * bz; out[3] = s0 * aw + s1 * bw;
  return out;
}
/** Indices of the keys to keep. n keys of `size` floats; err(k, a, b) = error at key k on the line from a to b. */
function thin(times, n, err, tol) {
  const keep = [0];
  let a = 0;
  for (let b = 2; b < n; b++) {
    let ok = true;
    for (let k = a + 1; k < b && ok; k++) if (err(k, a, b) > tol) ok = false;
    if (!ok) { keep.push(b - 1); a = b - 1; }
  }
  if (n > 1) keep.push(n - 1);
  return keep;
}

const stats = { tracksBefore: 0, tracksAfter: 0, keysBefore: 0, keysAfter: 0 };
const q = [0, 0, 0, 0];
for (const anim of root.listAnimations()) {
  if (ONLY && !ONLY.test(anim.getName())) continue;
  for (const ch of anim.listChannels()) {
    const node = ch.getTargetNode(), path = ch.getTargetPath(), s = ch.getSampler();
    stats.tracksBefore++;
    const input = s.getInput(), output = s.getOutput();
    stats.keysBefore += input.getCount();
    const name = node?.getName() || '';
    const drop = !node || path === 'scale' || path === 'weights' || (path === 'translation' && name !== 'hips');
    const times = input.getArray(), v = output.getArray();
    if (!drop && path === 'rotation') {
      const r = node.getRotation();
      let far = 0;
      for (let k = 0; k < input.getCount(); k++) far = Math.max(far, qAngle(v, k * 4, r, 0));
      if (far < 0.05 * DEG) { ch.dispose(); continue; }
    }
    if (drop) { ch.dispose(); continue; }
    if (s.getInterpolation() !== 'LINEAR' || input.getCount() < 3) { stats.tracksAfter++; stats.keysAfter += input.getCount(); continue; }
    const n = input.getCount(), size = path === 'rotation' ? 4 : 3;
    const err = path === 'rotation'
      ? (k, a, b) => { slerp(v, a * 4, b * 4, (times[k] - times[a]) / (times[b] - times[a]), q); return qAngle(q, 0, v, k * 4); }
      : (k, a, b) => {
        const t = (times[k] - times[a]) / (times[b] - times[a]);
        let d = 0;
        for (let c = 0; c < 3; c++) { const x = v[a * 3 + c] + (v[b * 3 + c] - v[a * 3 + c]) * t - v[k * 3 + c]; d += x * x; }
        return Math.sqrt(d);
      };
    const keep = EXACT?.test(name) ? times.map((_, i) => i) : thin(times, n, err, path === 'rotation' ? TOL(name) : POS_TOL);
    const nt = new Float32Array(keep.length), nv = new Float32Array(keep.length * size);
    keep.forEach((k, i) => { nt[i] = times[k]; for (let c = 0; c < size; c++) nv[i * size + c] = v[k * size + c]; });
    s.setInput(doc.createAccessor().setType('SCALAR').setArray(nt).setBuffer(input.getBuffer()));
    // rotations as normalised 16-bit integers (glTF allows them for rotation outputs; 0.004 deg steps), positions as floats
    const out = size === 4 ? Int16Array.from(nv, x => Math.round(Math.max(-1, Math.min(1, x)) * 32767)) : nv;
    s.setOutput(doc.createAccessor().setType(size === 4 ? 'VEC4' : 'VEC3').setArray(out).setNormalized(size === 4).setBuffer(output.getBuffer()));
    stats.tracksAfter++; stats.keysAfter += keep.length;
  }
  for (const s of anim.listSamplers()) if (!anim.listChannels().some(c => c.getSampler() === s)) s.dispose();
}
await doc.transform(prune({ propertyTypes: ['Accessor'] }));
await io.write(file, doc);
console.log(JSON.stringify(stats));
