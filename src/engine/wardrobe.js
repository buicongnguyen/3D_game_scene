import * as THREE from 'three';
import { lookOf, SKIN, PROPORTIONS, clampProportion } from '../content/performers.js';
import { tintLite, isLite } from './people.js';

// Outfits, skin tones and body shape for the dance game's performers (docs/PERFORMERS.md, content/performers.js).
// Works on a clone from the model library (Assets.clone): every change is made on that clone only (materials it tints
// are copied for it first), so two performers built from one file can wear different looks.
//
//   applyLook(model, 'nabi', 'street')    show that look's parts, recolour them; false for a model with no wardrobe
//   setSkin(model, 'porcelain' | '#hex')  the skin tone
//   setShape(model, 'shape_waist', 0.7)   a body-shape morph, 0..1 (0.5 = as designed)
//   setProportions(model, { legs: 1.04, head: 0.96 })   bone proportions (see PROPORTIONS for the ranges)
//
// A light person (People: Light, engine/people.js) is one mesh in its default look: it takes skin and look colours
// (palette tint) but cannot change parts or shape; applyLook then returns false.

const SLOT = /^(Top|Bottom|Shoes|Hat)_[A-Za-z0-9]+$/;
const V = new THREE.Vector3();
const M4 = new THREE.Matrix4();
const Q = new THREE.Quaternion();

/** The wardrobe parts of a model: { 'Top_crop': Object3D, … } (the outermost node of each part). */
export function wardrobeParts(model) {
  const out = {};
  model?.traverse?.(o => {
    if (o.isBone || !SLOT.test(o.name)) return;
    if (o.parent && SLOT.test(o.parent.name)) return;
    out[o.name] = o;
  });
  return out;
}

export const hasWardrobe = model => Object.keys(wardrobeParts(model)).length > 0;

/** Meshes of the model that are visible (or would be): the body and the shown parts. */
function meshesOf(root) {
  const out = [];
  root.traverse(o => { if (o.isMesh) out.push(o); });
  return out;
}

/** This model's own copy of a material (made once), so tinting one performer never recolours another. */
function own(model, mesh, i) {
  const map = (model.userData.ownMats ??= new Map());
  const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const m = list[i];
  if ([...map.values()].includes(m)) return m;
  if (map.has(m)) {
    // the same file material on another part (Top_crop and Top_long share 'Top'): it takes this model's copy too
    const c = map.get(m);
    if (Array.isArray(mesh.material)) mesh.material[i] = c; else mesh.material = c;
    return c;
  }
  const c = m.clone();
  c.userData = { ...m.userData, baseColor: m.color.clone() };
  map.set(m, c);
  if (Array.isArray(mesh.material)) mesh.material[i] = c; else mesh.material = c;
  return c;
}

/** Set colours by material name on every mesh of the model (`tint`: { name: '#hex' }; names not given go back to the file's). */
function recolour(model, tint, names) {
  for (const mesh of meshesOf(model)) {
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    list.forEach((m, i) => {
      if (!names.has(m.name)) return;
      const c = own(model, mesh, i);
      if (tint[c.name]) c.color.set(tint[c.name]);
      else if (c.userData.baseColor) c.color.copy(c.userData.baseColor);
    });
  }
}

function liteTint(model, more) {
  const t = (model.userData.liteTint = { ...(model.userData.liteTint || {}), ...more });
  return tintLite(model, t);
}

/**
 * Dress a performer in a look (content/performers.js). Unknown look ids fall back to the performer's default.
 * Returns true when parts were switched, false for a model without a wardrobe (a light person or a stand-in).
 */
export function applyLook(model, performerId, lookId) {
  const look = lookOf(performerId, lookId);
  if (!model || !look) return false;
  model.userData.look = look.id;
  if (isLite(model)) { liteTint(model, look.tint); return false; }
  const parts = wardrobeParts(model);
  if (!Object.keys(parts).length) return false;
  for (const [name, o] of Object.entries(parts)) o.visible = look.parts.includes(name);
  // recolour: every name any look of this performer may set, so a change of look also resets what the new one leaves out
  const names = new Set(Object.keys(look.tint));
  for (const k of model.userData.tinted || []) names.add(k);
  model.userData.tinted = [...names];
  recolour(model, look.tint, names);
  return true;
}

/**
 * The skin tone: a SKIN_TONES id or a '#hex' colour. Fair tones get a soft warm inner glow (emissive, like light under
 * the skin) so they stay luminous and peachy under the valley's blue sky instead of turning grey; deeper tones less.
 */
export function setSkin(model, tone) {
  const hex = SKIN[tone]?.hex || (typeof tone === 'string' && tone.startsWith('#') ? tone : null);
  if (!model || !hex) return false;
  model.userData.skin = hex;
  if (isLite(model)) return liteTint(model, { Skin: hex });
  recolour(model, { Skin: hex }, new Set(['Skin']));
  skinGlow(model);
  return true;
}

const _hsl = { h: 0, s: 0, l: 0 };
function skinGlow(model) {
  for (const mesh of meshesOf(model)) {
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    list.forEach((m, i) => {
      if (m.name !== 'Skin') return;
      const c = own(model, mesh, i);
      c.color.getHSL(_hsl);
      const k = 0.015 + 0.035 * Math.max(0, Math.min(1, (_hsl.l - 0.45) / 0.35));
      c.emissive.copy(c.color).multiplyScalar(k);
    });
  }
}

/**
 * The performers' finish: a soft rim of light round the silhouette of the hair and clothes (view-facing fresnel; warm by
 * day, the stage's colour by night; the skin and face are left natural). rim 0..1 (0 = off), rimColor any colour. Call
 * again to change it; cheap (one shader variant for every performer).
 */
export function polish(model, { rim = 0.22, rimColor = '#fff1dc' } = {}) {
  const st = (model.userData.polish ??= { rim: { value: rim }, rimColor: { value: new THREE.Color(rimColor) } });
  st.rim.value = rim;
  st.rimColor.value.set(rimColor);
  if (st.done) return st;
  st.done = true;
  for (const mesh of meshesOf(model)) {
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    list.forEach((m, i) => {
      if (!m.isMeshStandardMaterial || m.name === 'Skin' || m.name === 'Eye white' || m.name === 'Iris' || m.name === 'Dark') return;
      const c = own(model, mesh, i);
      c.onBeforeCompile = sh => {
        sh.uniforms.uRim = st.rim;
        sh.uniforms.uRimColor = st.rimColor;
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform float uRim;\nuniform vec3 uRimColor;')
          .replace('#include <opaque_fragment>', `{
            float rimF = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
            float r2 = rimF * rimF;
            outgoingLight += uRimColor * (r2 * r2) * uRim * (0.3 + 0.7 * diffuseColor.rgb);
          }
          #include <opaque_fragment>`);
      };
      c.customProgramCacheKey = () => 'performer-rim';
      c.needsUpdate = true;
    });
  }
  return st;
}

/** A body-shape morph, v in 0..1 (0.5 = as designed). Returns how many meshes carry it. */
export function setShape(model, key, v) {
  let n = 0;
  const w = 2 * (Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0.5)) - 0.5);
  model?.traverse?.(o => {
    const i = o.morphTargetDictionary?.[key];
    if (i === undefined || !o.morphTargetInfluences) return;
    o.morphTargetInfluences[i] = w;
    n++;
  });
  (model.userData.shape ??= {})[key] = v;
  return n;
}

/** Rest transforms and bind-space frames of the bones the proportions move (worked out once per model). */
function rig(model) {
  if (model.userData.propRig) return model.userData.propRig;
  let mesh = null;
  model.traverse(o => { if (!mesh && o.isSkinnedMesh) mesh = o; });
  if (!mesh) return null;
  const sk = mesh.skeleton, bones = {}, bind = {};
  sk.bones.forEach((b, i) => { bones[b.name] = b; bind[b.name] = sk.boneInverses[i].clone().invert(); });
  const need = ['root', 'neck', 'head', 'upperarm_L', 'upperarm_R', 'hand_L', 'hand_R', 'thigh_L', 'thigh_R', 'foot_L', 'foot_R', 'chest'];
  if (need.some(n => !bones[n])) return null;
  const rest = {};
  for (const n of need) rest[n] = { p: bones[n].position.clone(), s: bones[n].scale.clone() };
  const at = n => new THREE.Vector3().setFromMatrixPosition(bind[n]);
  const leg = at('thigh_L').distanceTo(at('foot_L'));
  // the character's left in each upper arm's parent (chest) frame: bind space +X, rotated into the chest's rest frame
  const chestRot = new THREE.Quaternion().setFromRotationMatrix(M4.extractRotation(bind.chest)).invert();
  const out = { L: new THREE.Vector3(1, 0, 0).applyQuaternion(chestRot), R: new THREE.Vector3(-1, 0, 0).applyQuaternion(chestRot) };
  const rootRot = bones.root.parent && !bones.root.parent.isBone ? null : null;
  return (model.userData.propRig = { bones, rest, leg, out, rootRot });
}

/**
 * Bone proportions for one performer (keys of PROPORTIONS; anything left out stays as it is). Safe to call every
 * frame or once; clips never undo it (they key rotations and the hips' position only).
 */
export function setProportions(model, opts = {}) {
  const r = rig(model);
  if (!r) return false;
  const cur = (model.userData.proportions = { ...(model.userData.proportions || {}) });
  for (const k of Object.keys(PROPORTIONS)) if (k in opts) cur[k] = clampProportion(k, opts[k]);
  const g = k => (k in cur ? cur[k] : PROPORTIONS[k][2]);
  const { bones: B, rest: R } = r;
  const height = g('height'), head = g('head'), neck = g('neck'), sh = g('shoulders'), arms = g('arms'), legs = g('legs');
  B.root.scale.copy(R.root.s).multiplyScalar(height);
  B.neck.scale.copy(R.neck.s).multiplyScalar(neck);
  B.head.scale.copy(R.head.s).multiplyScalar(head / neck);
  for (const S of ['L', 'R']) {
    B['upperarm_' + S].scale.copy(R['upperarm_' + S].s).multiplyScalar(arms);
    B['hand_' + S].scale.copy(R['hand_' + S].s).multiplyScalar(1 / arms);
    B['upperarm_' + S].position.copy(R['upperarm_' + S].p).addScaledVector(r.out[S], sh);
    B['thigh_' + S].scale.copy(R['thigh_' + S].s).multiplyScalar(legs);
    B['foot_' + S].scale.copy(R['foot_' + S].s).multiplyScalar(1 / legs);
  }
  // longer legs lift the figure so the feet stay on the ground (the root's parent frame is the model's: +Y is up)
  B.root.position.copy(R.root.p);
  const lift = (legs - 1) * r.leg;
  if (lift) {
    const parent = B.root.parent;
    V.set(0, lift, 0);
    if (parent) { parent.updateWorldMatrix(true, false); model.updateWorldMatrix(true, false); M4.copy(model.matrixWorld).invert().multiply(parent.matrixWorld); Q.setFromRotationMatrix(M4.extractRotation(M4)).invert(); V.applyQuaternion(Q); }
    B.root.position.add(V);
  }
  return true;
}

/** Everything back as the file has it (look parts all shown again is NOT done: call applyLook for that). */
export function resetBody(model) {
  const r = rig(model);
  if (r) for (const [n, t] of Object.entries(r.rest)) { r.bones[n].position.copy(t.p); r.bones[n].scale.copy(t.s); }
  model.traverse?.(o => { if (o.morphTargetInfluences) o.morphTargetInfluences.fill(0); });
  model.userData.proportions = {};
  model.userData.shape = {};
}
