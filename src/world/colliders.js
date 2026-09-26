// Kinematic collision world (pure; Node-testable).
// Solids are vertical prisms: oriented boxes and cylinders spanning [y0, y1].
// A solid with walkable=true can be stood on (its top y1 becomes ground).

const CELL = 8;
const key = (i, j) => i * 73856093 ^ j * 19349663;

export class Colliders {
  constructor() {
    this.items = [];
    this.grid = new Map();
    this.nextId = 1;
    this.stamp = 0;
    this.scratch = [];
  }

  _insert(it) {
    const r = it.kind === 'box' ? Math.hypot(it.hw, it.hd) : it.r;
    const i0 = Math.floor((it.x - r) / CELL), i1 = Math.floor((it.x + r) / CELL);
    const j0 = Math.floor((it.z - r) / CELL), j1 = Math.floor((it.z + r) / CELL);
    it.cells = [];
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = key(i, j);
      if (!this.grid.has(k)) this.grid.set(k, []);
      this.grid.get(k).push(it);
      it.cells.push(k);
    }
  }

  /** Oriented box: centre (x, z), half extents hw (local X) and hd (local Z), rotation rotY degrees. */
  box(x, z, hw, hd, rotDeg, y0, y1, opts = {}) {
    const r = (rotDeg || 0) * Math.PI / 180;
    const it = { id: this.nextId++, kind: 'box', x, z, hw, hd, c: Math.cos(r), s: Math.sin(r), y0, y1, enabled: true, ...opts };
    this.items.push(it);
    this._insert(it);
    return it;
  }

  cylinder(x, z, r, y0, y1, opts = {}) {
    const it = { id: this.nextId++, kind: 'cyl', x, z, r, y0, y1, enabled: true, ...opts };
    this.items.push(it);
    this._insert(it);
    return it;
  }

  remove(it) {
    if (!it) return;
    it.enabled = false;
    for (const k of it.cells) {
      const list = this.grid.get(k);
      const i = list.indexOf(it);
      if (i >= 0) list.splice(i, 1);
    }
  }

  enable(it) {
    if (!it || it.enabled) return;
    it.enabled = true;
    this._insert(it);
  }

  /** Move an existing solid (e.g. the ferry deck). */
  move(it, x, z, y0, y1) {
    this.remove(it);
    it.x = x; it.z = z;
    if (y0 !== undefined) { it.y0 = y0; it.y1 = y1; }
    it.enabled = true;
    this._insert(it);
  }

  /** Solids in the 3x3 cells around (x, z). Returns a shared array (valid until the next call). */
  near(x, z) {
    const out = this.scratch;
    out.length = 0;
    const stamp = ++this.stamp;
    const i = Math.floor(x / CELL), j = Math.floor(z / CELL);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const list = this.grid.get(key(i + a, j + b));
      if (list) for (const it of list) if (it.enabled && it._stamp !== stamp) { it._stamp = stamp; out.push(it); }
    }
    return out;
  }

  /** Local coordinates of a point relative to a box. */
  static local(it, x, z) {
    const dx = x - it.x, dz = z - it.z;
    return [dx * it.c - dz * it.s, dx * it.s + dz * it.c];
  }

  /** Is (x, z) inside the footprint, inflated by `pad`? */
  static contains(it, x, z, pad = 0) {
    if (it.kind === 'cyl') return Math.hypot(x - it.x, z - it.z) < it.r + pad;
    const [lx, lz] = Colliders.local(it, x, z);
    return Math.abs(lx) < it.hw + pad && Math.abs(lz) < it.hd + pad;
  }

  /**
   * Highest walkable surface under (x, z) that the feet can step onto from footY
   * (at most `step` above the feet). Returns {y, item} or null.
   */
  groundAt(x, z, footY, step = 0.5, pad = 0) {
    let best = null;
    for (const it of [...this.near(x, z)]) {
      if (!it.walkable || it.y1 > footY + step) continue;
      if (!Colliders.contains(it, x, z, pad)) continue;
      if (!best || it.y1 > best.y) best = { y: it.y1, item: it };
    }
    return best;
  }

  /**
   * Push a vertical capsule (radius, feet at footY, height) out of every solid it overlaps.
   * Solids whose top is within `step` of the feet are ignored (you step up onto them instead).
   * Returns {x, z, hit} with the corrected position.
   */
  resolve(x, z, radius, footY, height, step = 0.5) {
    let hit = null;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const it of [...this.near(x, z)]) {
        if (it.y1 <= footY + step || it.y0 >= footY + height) continue;
        if (it.kind === 'cyl') {
          const dx = x - it.x, dz = z - it.z, d = Math.hypot(dx, dz), min = it.r + radius;
          if (d < min && d > 1e-6) { x = it.x + dx / d * min; z = it.z + dz / d * min; moved = true; hit = it; }
          continue;
        }
        const [lx, lz] = Colliders.local(it, x, z);
        const ox = it.hw + radius - Math.abs(lx), oz = it.hd + radius - Math.abs(lz);
        if (ox <= 0 || oz <= 0) continue;
        // rounded corners: outside both faces -> push along the corner normal
        let nlx = lx, nlz = lz;
        const cx = Math.abs(lx) - it.hw, cz = Math.abs(lz) - it.hd;
        if (cx > 0 && cz > 0) {
          const d = Math.hypot(cx, cz);
          if (d >= radius) continue;
          const k = radius / d;
          nlx = Math.sign(lx) * (it.hw + cx * k);
          nlz = Math.sign(lz) * (it.hd + cz * k);
        } else if (ox < oz) nlx = Math.sign(lx || 1) * (it.hw + radius);
        else nlz = Math.sign(lz || 1) * (it.hd + radius);
        // back to world
        x = it.x + nlx * it.c + nlz * it.s;
        z = it.z - nlx * it.s + nlz * it.c;
        moved = true;
        hit = it;
      }
      if (!moved) break;
    }
    return { x, z, hit };
  }

  /**
   * Segment test for cameras and line of sight: first solid hit between a and b (3D points).
   * Returns the fraction t in [0, 1] or 1 if clear. Only tests `blocksView` solids.
   */
  raycast(ax, ay, az, bx, by, bz, ignore = null) {
    const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.5) + 1;
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t, y = ay + (by - ay) * t;
      for (const it of this.near(x, z)) {
        if (!it.blocksView || (ignore && it.id !== undefined && ignore.has(it.id))) continue;
        if (y < it.y0 || y > it.y1) continue;
        if (Colliders.contains(it, x, z, 0.15)) return t;
      }
    }
    return 1;
  }
}
