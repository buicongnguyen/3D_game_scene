import * as THREE from 'three';

// A small living face for a character whose model carries it (the VRoid visitor, art/blender/vroid_lite.py): three
// morph targets on the one skinned mesh ('blink', 'mouthA', 'mouthO') and two eye bones ('eye_L', 'eye_R').
//   blink  every 2.5-6 s (a double blink now and then)
//   mouth  flaps while one of her lines is on screen (speak(text): about 0.07 s a letter, 1-5 s), A with a touch of O
//   eyes   look at a point (Mika's head) when it is near and in front, else straight ahead; clamped to a small cone
// Cost: one uniform array per frame and two bone rotations; nothing at all while `enabled` is false (far away, out of
// view, or the Low tier's far ring: the director switches it).

const ID = new THREE.Quaternion();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _s = new THREE.Vector3(), _v = new THREE.Vector3(), _w = new THREE.Vector3(), _e = new THREE.Vector3();

const EYE_CONE = 0.3;           // radians (~17 degrees) an eye may turn from straight ahead
const LOOK_NEAR = 7;            // metres: farther than this she looks ahead

export class Face {
  /** -> Face, or null when the model has no face rig. */
  static attach(model) {
    let mesh = null;
    model.traverse(o => { if (!mesh && o.isSkinnedMesh && o.morphTargetDictionary && 'blink' in o.morphTargetDictionary) mesh = o; });
    if (!mesh) return null;
    return new Face(model, mesh);
  }

  constructor(model, mesh) {
    this.model = model;
    this.mesh = mesh;
    const d = mesh.morphTargetDictionary;
    this.ix = { blink: d.blink, a: d.mouthA ?? -1, o: d.mouthO ?? -1 };
    this.eyes = ['eye_L', 'eye_R'].map(n => model.getObjectByName(n)).filter(Boolean).map(bone => {
      // the eye's forward (the model's +Z) in the bone's own frame, from the bind pose
      const i = mesh.skeleton.bones.indexOf(bone);
      const bind = new THREE.Matrix4().copy(mesh.skeleton.boneInverses[i]).invert();
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion().setFromRotationMatrix(bind).invert()).normalize();
      return { bone, rest: bone.quaternion.clone(), fwd };
    });
    this.enabled = true;
    this.t = 0;
    this.nextBlink = 1 + Math.random() * 3;
    this.blinkT = -1;
    this.twice = false;
    this.talkT = 0;
    this.mouth = 0;
    this.look = 0;              // 0 ahead .. 1 at the target
    this.target = null;
  }

  /** Her line is on screen: move the lips for about as long as it takes to say. */
  speak(text = '') {
    this.talkT = Math.min(5, Math.max(1, String(text).length * 0.07));
  }

  quiet() { this.talkT = 0; }

  /** Look at this world point (or null for straight ahead). */
  lookAt(p) { this.target = p; }

  setEnabled(on) {
    if (on === this.enabled) return;
    this.enabled = on;
    if (!on) {
      const m = this.mesh.morphTargetInfluences;
      m[this.ix.blink] = 0; if (this.ix.a >= 0) m[this.ix.a] = 0; if (this.ix.o >= 0) m[this.ix.o] = 0;
      this.mouth = 0;
      for (const e of this.eyes) e.bone.quaternion.copy(e.rest);
    }
  }

  /** After the animation mixer has posed the body for this frame. */
  update(dt) {
    if (!this.enabled) return;
    this.t += dt;
    const m = this.mesh.morphTargetInfluences;
    // blink: 0.07 s down, 0.09 s up
    this.nextBlink -= dt;
    if (this.nextBlink <= 0 && this.blinkT < 0) { this.blinkT = 0; this.twice = Math.random() < 0.18; }
    let lid = 0;
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      const b = this.blinkT;
      lid = b < 0.07 ? b / 0.07 : Math.max(0, 1 - (b - 0.07) / 0.09);
      if (b > 0.16) {
        this.blinkT = -1;
        this.nextBlink = this.twice ? 0.12 : 2.5 + Math.random() * 3.5;
        this.twice = false;
      }
    }
    m[this.ix.blink] = lid;
    // mouth: syllables at ~6 a second with uneven heights, eased in and out
    this.talkT = Math.max(0, this.talkT - dt);
    const want = this.talkT > 0 ? 0.25 + 0.55 * Math.abs(Math.sin(this.t * 9.5)) * (0.65 + 0.35 * Math.sin(this.t * 3.1)) : 0;
    this.mouth += (want - this.mouth) * Math.min(1, dt * 18);
    if (this.ix.a >= 0) m[this.ix.a] = this.mouth * 0.8;
    if (this.ix.o >= 0) m[this.ix.o] = this.talkT > 0 ? this.mouth * 0.3 * (0.5 + 0.5 * Math.sin(this.t * 2.3)) : 0;
    // eyes
    if (!this.eyes.length) return;
    let aim = 0;
    if (this.target) {
      _v.setFromMatrixPosition(this.eyes[0].bone.matrixWorld);
      _w.copy(this.target).sub(_v);
      if (_w.lengthSq() < LOOK_NEAR * LOOK_NEAR) aim = 1;
    }
    this.look += (aim - this.look) * Math.min(1, dt * 4);
    for (const e of this.eyes) {
      e.bone.quaternion.copy(e.rest);
      if (this.look < 0.01 || !this.target) continue;
      // last frame's head matrix (never update world matrices here: the engine walks them itself, engine/matrices.js,
      // and forcing the walk from a bone up to the scene broke the frame)
      e.bone.parent.matrixWorld.decompose(_v, _qp, _s);
      _q.copy(_qp).multiply(e.rest);                     // the eye's neutral world rotation
      const cur = _e.copy(e.fwd).applyQuaternion(_q);
      _v.setFromMatrixPosition(e.bone.matrixWorld);
      const to = _w.copy(this.target).sub(_v).normalize();
      const ang = cur.angleTo(to);
      if (!(ang < 1.2) || ang < 1e-4) continue;          // behind her: straight ahead
      // turn toward the target, at most EYE_CONE, eased by `look`: world = q2 * qh * rest -> local = qh^-1 * q2 * qh * rest
      _q2.setFromUnitVectors(cur, to).slerp(ID, 1 - Math.min(1, EYE_CONE / ang) * this.look);
      e.bone.quaternion.copy(_qp.invert().multiply(_q2).multiply(_q));
    }
  }
}

/** The switch for all faces: `?face=off` turns them off (to measure what they cost). */
Face.on = !(typeof location !== 'undefined' && /[?&]face=off\b/.test(location.search || ''));
