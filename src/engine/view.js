import { Frustum, Matrix4, Sphere } from 'three';

// What the camera sees, for things that need not be there while nobody looks.
//
// On a portrait phone the view is a narrow wedge, and most of the valley's people and animals stand beside or behind it
// while Mika walks. They were still animated (a mixer, 57-84 bindings, 100 us each on a phone) and their bones still
// walked by the matrix pass (matrices.js), only for three.js to throw their meshes away unseen. A watcher here (an NPC
// that asked for it, actors/npc.js) is asked once per drawn frame, right before the matrix pass and with the camera
// that is about to draw, whether it is out of view; when it is, its body is hidden (no walk, no animation) and it
// catches up the frame it comes back. The test uses the camera of the frame itself, so nothing is ever a frame late.
//
// `?view=off` switches it off (everybody is always shown, as before).

const frustum = new Frustum(), pv = new Matrix4(), ball = new Sphere();
const watchers = new Set();
const never = () => false;

export const View = {
  enabled: true,
  ready: false,

  /** Take the frustum of `camera`, then let every watcher decide (call once per drawn frame, before the matrix pass). */
  update(camera) {
    if (!this.enabled) { for (const w of watchers) if (w.unseen) w.cull(never); return; }    // (switched off while running: show everyone)
    if (!camera) return;
    camera.updateMatrixWorld();
    pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(pv);
    this.ready = true;
    for (const w of watchers) if (w.cull(View.hides) === false) watchers.delete(w);
  },

  /** Is a ball of radius `r` at (x, y, z) wholly outside the view? */
  outside(x, y, z, r) {
    if (!this.ready) return false;
    ball.center.set(x, y, z); ball.radius = r;
    return !frustum.intersectsSphere(ball);
  },

  /**
   * Should something at (x, y, z) be hidden now? With a margin that differs by direction, so nothing flickers at the
   * edge of the view: it stays shown until it is more than HIDE_R metres outside, and comes back as soon as it is
   * within SHOW_R (more than the size of the largest body, so it is posed before any of it is on screen).
   */
  hides(x, y, z, wasHidden) {
    return View.outside(x, y, z, wasHidden ? SHOW_R : HIDE_R);
  },

  watch(w) { watchers.add(w); return w; },
  unwatch(w) { watchers.delete(w); },
  get count() { return watchers.size; },
};

export const SHOW_R = 3, HIDE_R = 4.5;
