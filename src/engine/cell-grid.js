import { Box3, Frustum, Group, Matrix4, OrthographicCamera, Sphere, Vector3 } from 'three';

// Static things in squares of the map, so three.js can skip a whole square the camera cannot see.
//
// Every building and prop was its own child of `structures.group`, and three.js walks and tests each of them (and all
// their parts) every frame, twice: once for the view and again for the sun's shadow map. On a portrait phone the view
// is a narrow wedge: of ~500 structure nodes walked a frame at Takamori, ~280 drawables were tested only to be thrown
// away (docs/codex/CELL-GRID.md, PERFORMANCE_REVIEW.md). Here the static children of a group move into one Group per
// 64 m square (at the group's origin, so nothing moves in the world), and once per drawn frame, before the matrix pass
// and with the camera that is about to draw, a square is hidden when its ball is outside the view AND outside the sun's
// shadow box (a building just behind the camera still throws its shadow into the picture). three.js and the matrix pass
// (matrices.js) skip a hidden square without looking inside. The distance culling of each object stays as it is.
//
// What moves is never put in a square (the caller names it; a watchdog takes out anything that moves anyway).
// `?cells=off` (or `Cells.enabled = false` at run time) shows every square, as before.

export const CELL = 64;
const MAX_R = 60;        // anything larger (a fence line, the whole set of name boards) stays where it is
const PAD = 4;           // metres around a square's contents: doors and gates swing, wheels turn, flags flap
const VIEW_PAD = 1;      // the frustum is the frame's own: only a little slack
const DRIFT2 = 1;        // an adopted object that has moved more than 1 m is not static: it leaves its square

/** Square of (x, z) on a grid centred on the villages (Kawabe and Takamori are not cut in four). Pure. */
export const cellIndex = (x, z, cell = CELL) => [Math.floor(x / cell + 0.5), Math.floor(z / cell + 0.5)];

const box = new Box3(), ball = new Sphere(), tmp = new Sphere(), v = new Vector3();
const hasLight = o => { let lit = false; o.traverse(c => { if (c.isLight) lit = true; }); return lit; };

export class CellGrid {
  /** parent: the group whose children are sorted into squares; skip(obj): true for what must stay (it moves). */
  constructor(parent, { cell = CELL, maxR = MAX_R, skip = () => false } = {}) {
    this.parent = parent;
    this.cell = cell;
    this.maxR = maxR;
    this.skip = skip;
    this.cells = new Map();
    this.adopted = [];        // { obj, cell, at: local position when adopted }
    this.watch = 0;
    this.hidden = 0;
  }

  /** Move the static children of the parent into their squares (their world places do not change). -> how many moved */
  adopt() {
    this.parent.updateWorldMatrix(true, true);
    let n = 0;
    for (const o of [...this.parent.children]) {
      if (o.userData.cell || o.isLight || this.skip(o) || hasLight(o)) continue;
      box.setFromObject(o);   // (hidden parts too: a square's ball holds everything in it, shown or not)
      if (box.isEmpty()) continue;
      box.getBoundingSphere(ball);
      if (ball.radius > this.maxR) continue;
      const [i, j] = cellIndex(ball.center.x, ball.center.z, this.cell), key = `${i},${j}`;
      let c = this.cells.get(key);
      if (!c) {
        const group = new Group();
        group.name = `cell:${key}`;
        group.userData.cell = true;
        this.parent.add(group);
        c = { key, group, balls: [], sphere: new Sphere(), shown: true };
        this.cells.set(key, c);
      }
      c.group.add(o);         // (the square sits at the parent's origin, unrotated: the object keeps its place)
      c.balls.push(ball.clone());
      this.adopted.push({ obj: o, cell: c, at: o.position.clone() });
      n++;
    }
    for (const c of this.cells.values()) bound(c);
    return n;
  }

  /** Show the squares that are in `view` or, with `shadow` given, in the sun's shadow box; hide the rest. */
  update(view, shadow) {
    this.check();
    let hidden = 0;
    for (const c of this.cells.values()) {
      tmp.center.copy(c.sphere.center); tmp.radius = c.sphere.radius + VIEW_PAD;
      const show = view.intersectsSphere(tmp) || (shadow !== null && shadow.intersectsSphere(c.sphere));
      if (show !== c.shown) { c.shown = show; c.group.visible = show; }
      if (!show) hidden++;
    }
    this.hidden = hidden;
  }

  showAll() {
    for (const c of this.cells.values()) if (!c.shown) { c.shown = true; c.group.visible = true; }
    this.hidden = 0;
  }

  /** The watchdog: a few adopted objects a frame. One that was taken out or moved goes back to the parent. */
  check(n = 24) {
    const list = this.adopted;
    for (let k = 0; k < n && list.length; k++) {
      if (this.watch >= list.length) this.watch = 0;
      const a = list[this.watch];
      if (a.obj.parent !== a.cell.group) { list.splice(this.watch, 1); continue; }          // removed or moved by its owner
      if (a.obj.position.distanceToSquared(a.at) > DRIFT2) {
        this.parent.add(a.obj);                       // (same place: the square is at the parent's origin)
        list.splice(this.watch, 1);
        console.warn(`[cells] ${a.obj.name || a.obj.type} moves: taken out of its square`);
        continue;
      }
      this.watch++;
    }
  }

  get count() { return this.cells.size; }
}

/** The square's ball: holds every adopted object's ball, plus a pad for what swings or turns in place. */
function bound(c) {
  box.makeEmpty();
  for (const b of c.balls) { box.expandByPoint(v.copy(b.center).addScalar(-b.radius)); box.expandByPoint(v.copy(b.center).addScalar(b.radius)); }
  box.getCenter(c.sphere.center);
  let r = 0;
  for (const b of c.balls) r = Math.max(r, c.sphere.center.distanceTo(b.center) + b.radius);
  c.sphere.radius = r + PAD;
}

// (a camera, as three.js uses for the light's shadow: a camera looks down its -z, any other object down +z)
const viewF = new Frustum(), sunF = new Frustum(), pv = new Matrix4(), sunCam = new OrthographicCamera(), from = new Vector3(), to = new Vector3();
const grids = new Set();

export const Cells = {
  enabled: true,
  /** The light whose shadow box keeps squares shown (world/sky.js sets the sun). */
  sun: null,

  add(grid) { grids.add(grid); return grid; },
  remove(grid) { grid.showAll(); grids.delete(grid); },

  /** Call once per drawn frame, before the matrix pass, with the camera that is about to draw. */
  update(camera, shadows = true) {
    if (!grids.size) return;
    if (!this.enabled || !camera) { for (const g of grids) g.showAll(); return; }
    camera.updateMatrixWorld();
    viewF.setFromProjectionMatrix(pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const shadow = shadows ? this.sunFrustum() : null;
    for (const g of grids) g.update(viewF, shadow);
  },

  /**
   * The sun's shadow box where it is this frame, worked out from the light itself. (Not with shadow.updateMatrices:
   * that would also move the matrix the picture reads the shadow map with, and on the phone tier the map is redrawn only
   * every other frame, so map and matrix must stay a pair.)
   */
  sunFrustum() {
    const s = this.sun;
    if (!s || !s.castShadow || !s.visible) return null;
    s.getWorldPosition(from);
    s.target.getWorldPosition(to);
    sunCam.position.copy(from);
    sunCam.lookAt(to);
    sunCam.updateMatrixWorld();
    return sunF.setFromProjectionMatrix(pv.multiplyMatrices(s.shadow.camera.projectionMatrix, sunCam.matrixWorldInverse));
  },

  get hidden() { let n = 0; for (const g of grids) n += g.hidden; return n; },
  get count() { let n = 0; for (const g of grids) n += g.count; return n; },
};
