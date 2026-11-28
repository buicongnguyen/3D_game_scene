// © 2026 Bui Cong Nguyen · solluxlabs.com
// Singing with a hand mic over a dance, after Avatar Studio Club mode ("Club singing": src/club/club-singing.js and
// club-singers.js micLayer). On sung lines the mic moves' neck, head, arms, hands and fingers are laid over the running
// dance by a weight (up 0.45 s before a line, held through gaps under 2.4 s, down after); the legs, hips and spine keep
// dancing on the beat. While the mic shows, the right fingers keep the mic move's grip even between lines.
// Done by hand after the mixer (evaluate each mic clip's bone tracks, slerp the bone): a mixer weight would share the
// arms with the dance instead of taking them, and three's mixer skips a value that did not change, so restore() puts the
// dance pose back before the next mixer write.
import * as THREE from 'three';
import { MIC_SETS } from '../../content/kotone-club.js';

export const SINGING = Object.freeze({ pre: .45, post: .35, hold: 2.4, up: .22, down: .55, micFade: .5 });
const CHORUS = /chorus|hook|refrain|điệp|drop/i, BUILD = /pre-?chorus|build/i;
export const isChorus = label => CHORUS.test(String(label || '')) && !BUILD.test(String(label || ''));

/** <id>.lyrics.json -> { t, e, chorus, count } line windows (section labels carry to the lines after them), or null. */
export function vocalLines(lyrics) {
  const src = Array.isArray(lyrics?.lines) ? lyrics.lines : null; if (!src?.length) return null;
  const list = []; let label = '';
  for (const l of src) {
    if (typeof l?.section === 'string' && l.section) label = l.section;
    const t = Number(l?.t), e = Number(l?.e);
    if (!Number.isFinite(t) || !Number.isFinite(e) || e < t || (list.length && t < list.at(-1).t)) continue;
    list.push({ t, e, chorus: isChorus(label) });
  }
  if (!list.length) return null;
  const n = list.length, out = { t: new Float64Array(n), e: new Float64Array(n), chorus: new Uint8Array(n), count: n };
  list.forEach((l, i) => { out.t[i] = l.t; out.e[i] = l.e; out.chorus[i] = l.chorus ? 1 : 0; });
  return out;
}
export function lineIndexAt(lines, t) {
  if (!lines?.count || !(t >= lines.t[0])) return -1;
  let lo = 0, hi = lines.count - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lines.t[mid] <= t) lo = mid; else hi = mid - 1; }
  return lo;
}
/** 0..1: the mic weight wanted at t (1 from `pre` before a line to `post` after it and through gaps under `hold`). */
export function leadTarget(lines, t) {
  const i = lineIndexAt(lines, t + SINGING.pre); if (i < 0) return 0;
  if (t <= lines.e[i] + SINGING.post) return 1;
  const next = i + 1 < lines.count ? lines.t[i + 1] : Infinity;
  return next - lines.e[i] < SINGING.hold ? 1 : 0;
}
/** The mic move for t from a style's set (content/kotone-club.js MIC_SETS; 'mix': the sway on verse lines, a punch or a
 *  crowd wave on chorus lines): verse and chorus lines each alternate through their list by line. */
export function micClipFor(lines, t, set = MIC_SETS.mix) {
  const i = lineIndexAt(lines, t + SINGING.pre);
  if (i < 0) return set.verse[0];
  const list = lines.chorus[i] ? set.chorus : set.verse;
  return list[i % list.length];
}
/** Loop beats per song beat for a move authored at 120 BPM: the one that keeps its speed nearest 1. */
export const micFold = bpm => { const r = (bpm > 0 ? bpm : 120) / 120; let best = 1, d = Infinity; for (const m of [1, .5, 2]) { const x = Math.abs(Math.log(m * r)); if (x < d - 1e-9) { d = x; best = m; } } return best; };

const UPPER = /^(neck|head|shoulder_[LR]|upperarm_[LR]|forearm_[LR]|hand_[LR]|(thumb|index|middle|ring|pinky)[1-4]_[LR])$/;
/** The layer over `root` from the mic clips (Map id -> AnimationClip); restRoot: an armature at rest (the pack's own:
 *  a bone a mic clip leaves at rest has no track there and reads this). */
export function micLayer(root, clips, restRoot = null) {
  const upper = new Map();
  root.traverse(o => { if (o.isBone && UPPER.test(o.name) && !upper.has(o.name)) upper.set(o.name, { bone: o, grip: /^(thumb|index|middle|ring|pinky)\d_R$/.test(o.name), interp: new Map(), saved: new THREE.Quaternion(), touched: false }); });
  for (const [id, clip] of clips) for (const tr of clip.tracks) {
    const m = /^(.+)\.quaternion$/.exec(tr.name), e = m && upper.get(m[1]); if (e) e.interp.set(id, tr.createInterpolant());
  }
  const bones = [...upper.values()].filter(e => e.interp.size), qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
  for (const e of bones) e.rest = (restRoot?.getObjectByName(e.bone.name) || e.bone).quaternion.clone();
  const loops = new Map([...clips].map(([id, c]) => [id, c.duration]));
  const read = (e, id, t, out) => { const ip = e.interp.get(id); return ip ? out.fromArray(ip.evaluate(t)) : out.copy(e.rest); };
  return {
    bones: bones.length,
    loop: id => loops.get(id) || 4,
    /** cur / prev: clip ids, tc / tp their times, xf 0..1 (prev -> cur), w: the upper-body weight, g: the grip weight. */
    apply(cur, tc, prev, tp, xf, w, g) {
      for (const e of bones) {
        const weight = e.grip ? Math.max(w, g) : w; if (weight < 1e-3) continue;
        e.saved.copy(e.bone.quaternion); e.touched = true;
        read(e, cur, tc, qa);
        if (prev && xf < 1) { read(e, prev, tp, qb); qa.copy(qb.slerp(qa, xf)); }
        e.bone.quaternion.slerp(qa, weight);
      }
    },
    restore() { for (const e of bones) if (e.touched) { e.bone.quaternion.copy(e.saved); e.touched = false; } },
  };
}
