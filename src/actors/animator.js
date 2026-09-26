import * as THREE from 'three';

/** Named-clip playback with crossfades and one-shot actions for a rigged model instance. */
export class Animator {
  constructor(root) {
    this.root = root;
    this.mixer = new THREE.AnimationMixer(root);
    this.clips = new Map((root.userData.clips || []).map(c => [c.name, c]));
    this.actions = new Map();
    this.current = null;
    this.currentName = '';
    this.oneShot = null;
    this.mixer.addEventListener('finished', e => {
      if (this.oneShot && e.action === this.oneShot.action) {
        const cb = this.oneShot.onDone;
        const next = this.oneShot.then;
        this.oneShot = null;
        if (next) this.play(next, { fade: 0.25 });
        cb?.();
      }
    });
  }

  has(name) { return this.clips.has(name); }

  action(name) {
    if (!this.actions.has(name)) {
      const clip = this.clips.get(name);
      if (!clip) return null;
      this.actions.set(name, this.mixer.clipAction(clip));
    }
    return this.actions.get(name);
  }

  /** Loop a clip (no-op if already playing). speed scales playback. */
  play(name, { fade = 0.22, speed = 1 } = {}) {
    if (this.oneShot) return;
    const a = this.action(name);
    if (!a) return;
    a.timeScale = speed;
    if (this.currentName === name) return;
    a.reset().setLoop(THREE.LoopRepeat, Infinity).setEffectiveWeight(1).play();
    if (this.current) this.current.crossFadeTo(a, fade, false);
    this.current = a;
    this.currentName = name;
  }

  /** Play a clip once, then return to `then` (or hold the last frame when hold=true). */
  once(name, { fade = 0.15, speed = 1, then = 'Idle', hold = false, onDone } = {}) {
    const a = this.action(name);
    if (!a) { onDone?.(); return false; }
    a.reset();
    a.timeScale = speed;
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    a.setEffectiveWeight(1).play();
    if (this.current && this.current !== a) this.current.crossFadeTo(a, fade, false);
    this.current = a;
    this.currentName = name;
    this.oneShot = { action: a, then: hold ? null : then, onDone };
    return true;
  }

  get busy() { return !!this.oneShot; }

  cancelOneShot() { this.oneShot = null; this.oneShotLocks = false; }

  update(dt) { this.mixer.update(dt); }
}
