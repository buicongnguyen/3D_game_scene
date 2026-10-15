// The Morning exercise moves at runtime: the clip packs made by art/blender/exercise_moves.py (public/models/
// exercise-<person>.glb: that person's armature, no mesh, one animation per move) are loaded only when a round starts
// and handed to the people taking part. A pack's bones and rest pose are those of its person to the bit, so the same
// pack plays on the standard and on the light model (src/engine/people.js).
//
// Anybody without a pack of their own (a new person built later on the same skeleton: the dance teacher, the boy
// dancer) borrows the pack of the closest body. The bones keep their own lengths; only the hips track is moved to the
// borrower's hip height and scaled with it, so a taller or shorter body still stands on the ground (retargetClip).
import * as THREE from 'three';

/** The people who have a pack of their own (art/blender/exercise_moves.py PEOPLE). */
export const PACKS = ['rin', 'mika', 'villager-kid', 'villager-man'];
export const packName = who => `exercise-${who}`;

const hipsOf = root => {
  let h = null;
  root?.traverse?.(o => { if (!h && (o.isBone || o.type === 'Object3D' || o.isObject3D) && o.name === 'hips') h = o; });
  return h;
};

/** How high the hips of a model stand above its root (its bind pose), in the model's own units. */
export function hipHeight(root) {
  const h = hipsOf(root);
  return h ? Math.abs(h.position.y) || 0 : 0;
}

/**
 * The pack whose body is closest to this model's: by hip height, among the packs that are loaded.
 * heights: { rin: 0.68, mika: 0.65, ... } (hip heights of the loaded packs).
 */
export function closestPack(height, heights) {
  let best = null, d = Infinity;
  for (const [who, h] of Object.entries(heights)) {
    const e = Math.abs(Math.log(Math.max(1e-3, height) / Math.max(1e-3, h)));
    if (e < d) { d = e; best = who; }
  }
  return best;
}

/**
 * A pack's clip made ready for one model. Only the rotations of the bones and the hips' place are kept (a pack also
 * carries constant positions and scales for every bone: the mixer would spend time on them for nothing, and on a
 * borrower they would stretch its bones to the pack's lengths). borrowed: the clip comes from another body, so the
 * hips track is moved from the pack's hip height to the model's and its sway scaled to match.
 */
export function retargetClip(clip, { srcHips, dstHips, borrowed = false } = {}) {
  const tracks = [];
  const k = borrowed && srcHips && dstHips ? dstHips.y / (srcHips.y || 1) : 1;
  for (const t of clip.tracks) {
    const dot = t.name.lastIndexOf('.'), node = t.name.slice(0, dot), prop = t.name.slice(dot + 1);
    if (prop === 'quaternion') { tracks.push(t); continue; }
    if (prop !== 'position' || node !== 'hips') continue;
    if (!borrowed || !srcHips || !dstHips) { tracks.push(t); continue; }
    const v = t.values.slice();
    for (let i = 0; i < v.length; i += 3) {
      v[i] = dstHips.x + (v[i] - srcHips.x) * k;
      v[i + 1] = dstHips.y + (v[i + 1] - srcHips.y) * k;
      v[i + 2] = dstHips.z + (v[i + 2] - srcHips.z) * k;
    }
    tracks.push(new THREE.VectorKeyframeTrack(t.name, t.times, v));
  }
  const out = new THREE.AnimationClip(clip.name, clip.duration, tracks);
  out.userData = { ...(clip.userData || {}), borrowed };
  return out;
}

/**
 * Every clip of a loaded pack (a GLTF result) made ready for `model` (the person's root). packRoot: the pack's scene
 * (its hips rest place); borrowed: the pack belongs to another body. Returns Map name -> AnimationClip.
 */
export function prepareMoves(pack, model, packRoot = pack?.scene, borrowed = false) {
  const out = new Map();
  if (!pack?.animations?.length) return out;
  const src = hipsOf(packRoot)?.position, dst = hipsOf(model)?.position;
  for (const c of pack.animations) out.set(c.name, retargetClip(c, { srcHips: src, dstHips: dst, borrowed }));
  return out;
}

/** Give an Animator (actors/animator.js) these clips; returns a function that takes them away again. */
export function lendClips(anim, clips) {
  if (!anim?.clips || !clips?.size) return () => {};
  const added = [];
  for (const [name, clip] of clips) if (!anim.clips.has(name)) { anim.clips.set(name, clip); added.push(name); }
  return () => {
    for (const name of added) {
      const a = anim.actions.get(name);
      if (a) {
        a.stop();
        if (anim.current === a) { anim.current = null; anim.currentName = ''; }
        if (anim.oneShot?.action === a) anim.oneShot = null;
        anim.mixer.uncacheAction(a.getClip(), anim.root);
        anim.actions.delete(name);
      }
      const clip = anim.clips.get(name);
      if (clip) anim.mixer.uncacheClip(clip);
      anim.clips.delete(name);
    }
  };
}
