// The village archery range, built in code from content/archery.js: a shooting board and chalk line, a quiver stand and a
// bench, a rope-and-flag cordon down both sides, three straw targets on tripods (painted rings in kids' colours), a rail for
// the sliding target, a hay-bale wall with a tall net, a banner and the wind sock. No model files. Everything solid and still
// is ONE mesh with baked vertex colours; each target is one more (so a round can fold it down), the wind sock is a small
// mesh whose 40 vertices are rewritten from the wind each frame, and the target numbers share one small canvas texture.
// The arrows the round shoots are drawn by game/tricks/archery.js (pooled); this file only owns the scenery.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { patchMaterial } from '../engine/effects.js';
import { ARCHERY, toWorld, archerySolids } from '../content/archery.js';

const WOOD = '#b98850', WOOD_DARK = '#93683a', WOOD_PALE = '#dcb98a';
const STRAW = '#e6c46c', STRAW_DARK = '#c79d45', STRING = '#8a6a30';
const ROPE = '#f3e9d0', FLAGS = ['#e8553d', '#fff6e0', '#ffc93a', '#4aa3df', '#fff6e0'];
// ring value (1..10, outermost first) -> its colour: cream, sky, grass, red, sun; each pair a light and a deeper shade
export const RING_COLOURS = ['#fff4dc', '#f0e2bd', '#7cc4f2', '#55a8e0', '#77cf5c', '#58b244', '#f46e52', '#e2492f', '#ffe052', '#ffbf1c'];
const C = new THREE.Color(), M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), S = new THREE.Vector3(1, 1, 1);
const UP = new THREE.Vector3(0, 1, 0);

/** Collects coloured pieces and merges them into one geometry. */
export class Kit {
  constructor() { this.parts = []; }
  add(geo, color, x, y, z, rx = 0, ry = 0, rz = 0) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    g.deleteAttribute('uv');
    M4.compose(P.set(x, y, z), Q.setFromEuler(E.set(rx, ry, rz, 'YXZ')), S);
    g.applyMatrix4(M4);
    this.paint(g, color);
    this.parts.push(g);
    return this;
  }
  paint(g, color) {
    C.set(color);
    const n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = C.r; col[i * 3 + 1] = C.g; col[i * 3 + 2] = C.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  box(w, h, d, color, x, y, z, rx, ry, rz) { return this.add(new THREE.BoxGeometry(w, h, d), color, x, y, z, rx, ry, rz); }
  /** A thin round rod between two points. */
  rod(ax, ay, az, bx, by, bz, r, color, seg = 6) {
    const dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.hypot(dx, dy, dz) || 1e-3;
    const g = new THREE.CylinderGeometry(r, r, len, seg).toNonIndexed();
    g.deleteAttribute('uv');
    M4.compose(P.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), Q.setFromUnitVectors(UP, E_dir.set(dx / len, dy / len, dz / len)), S);
    g.applyMatrix4(M4);
    this.paint(g, color);
    this.parts.push(g);
    return this;
  }
  merge() {
    const g = mergeGeometries(this.parts, false);
    for (const p of this.parts) p.dispose();
    this.parts.length = 0;
    return g;
  }
}
const E_dir = new THREE.Vector3();

/**
 * One straw target, in its own frame: origin on the ground below the face, +z toward the shooter, +y up. r: the face's
 * painted radius. The head leans back a little on its tripod.
 */
function targetGeometry(r, centreH, low) {
  const k = new Kit(), tilt = -0.17, seg = low ? 14 : 24;
  // the tripod: two front legs and a back leg meeting behind the head
  const hy = centreH - 0.1;
  k.rod(-0.42, 0, 0.42, -0.2, hy, -0.12, 0.035, WOOD_DARK);
  k.rod(0.42, 0, 0.42, 0.2, hy, -0.12, 0.035, WOOD_DARK);
  k.rod(0, 0, -0.62, 0, hy + 0.1, -0.16, 0.035, WOOD);
  k.rod(-0.3, 0.45, 0.3, 0.3, 0.45, 0.3, 0.02, WOOD_PALE);       // a brace between the front legs
  // the head (built flat, then leaned back about its middle)
  const h = new Kit(), rb = r + 0.07, th = 0.22;
  h.add(new THREE.CylinderGeometry(rb, rb, th, seg), STRAW, 0, 0, 0, Math.PI / 2, 0, 0);
  for (const z of [-0.07, 0.07]) h.add(new THREE.CylinderGeometry(rb + 0.012, rb + 0.012, 0.025, seg), STRAW_DARK, 0, 0, z, Math.PI / 2, 0, 0);   // two bands
  const z0 = th / 2 + 0.004, n = 10, w = r / n;
  for (let i = 0; i < n; i++) {                                     // ring value i + 1 is the i-th from the outside (value 1 outermost)
    const val = i + 1, outer = r - i * w, inner = val === n ? 0 : outer - w;
    // value 10 is the middle disc; the others are annuli; the colours step with the value (RING_COLOURS is outermost first)
    h.add(val === n ? new THREE.CircleGeometry(outer, seg) : new THREE.RingGeometry(inner, outer, seg), RING_COLOURS[i], 0, 0, z0 + i * 0.0005);
  }
  const head = h.merge();
  M4.compose(P.set(0, centreH, 0), Q.setFromEuler(E.set(tilt, 0, 0)), S);
  head.applyMatrix4(M4);
  k.parts.push(head);
  return k.merge();
}

export class ArcheryBuild {
  constructor(structures) {
    const world = structures.world, A = ARCHERY, q = world.quality || {}, low = q.name === 'Low';
    const hAt = (x, z) => world.heightAt(x, z);
    const at = (u, v) => { const p = toWorld(u, v); return [p.x, p.z]; };
    const gy = (u, v) => { const [x, z] = at(u, v); return hAt(x, z); };
    this.group = new THREE.Group();
    this.group.name = 'archery';
    this.disposables = [];
    this.solids = [];
    this.A = A;
    const y0 = this.y0 = gy(0, 0);

    // ---- the ground: the lane is mown short (no tall grass, no trees), the shooting line trampled earth
    const sp = world.splat;
    if (sp) {
      const c = at((A.back - 3.5) / 2, 0);
      sp.paintRect(c[0], c[1], (A.back + 3.5) / 2, A.half + 0.4, 0, 3, 0.02, 1.4);
      const l = at(-0.4, 0);
      sp.paintRect(l[0], l[1], 1.3, 2.9, 0, 0, 0.55, 0.8);
      sp.paintRect(l[0], l[1], 1.3, 2.9, 0, 3, 0, 0.8);
    }

    const k = new Kit();
    // ---- the shooting board (three planks) and the line painted in front of it
    {
      const [bx, bz] = at(-0.25, 0);
      for (let i = 0; i < 3; i++) k.box(0.4, 0.07, 5.0, i % 2 ? WOOD : WOOD_PALE, bx + (i - 1) * 0.41, gy(-0.25, 0) + 0.035, bz);
      for (const s of [-1, 1]) k.box(1.35, 0.06, 0.12, WOOD_DARK, bx, gy(-0.25, 0) + 0.02, bz + s * 2.46);
      const [lx, lz] = at(0.9, 0);
      k.add(new THREE.PlaneGeometry(0.1, 5.6), '#fffaf0', lx, gy(0.9, 0) + 0.03, lz, -Math.PI / 2, 0, 0);
    }
    // ---- the quiver stand: a basket on a little bench of wood, arrows standing in it
    {
      const [qx, qz] = at(A.quiver.u, A.quiver.v), qy = hAt(qx, qz);
      for (const dx of [-0.2, 0.2]) for (const dz of [-0.2, 0.2]) k.box(0.05, 0.6, 0.05, WOOD_DARK, qx + dx, qy + 0.3, qz + dz);
      k.box(0.5, 0.05, 0.5, WOOD, qx, qy + 0.62, qz);
      k.add(new THREE.CylinderGeometry(0.16, 0.13, 0.5, 10), '#c79a52', qx, qy + 0.9, qz);
      k.add(new THREE.TorusGeometry(0.16, 0.018, 5, 10), '#8a5a2a', qx, qy + 1.14, qz, Math.PI / 2, 0, 0);
      const cols = ['#e8553d', '#4aa3df', '#ffc93a', '#77cf5c'];
      for (let i = 0; i < (low ? 5 : 9); i++) {
        const a = i * 2.4, rr = 0.06 * (1 + (i % 3) * 0.4), lean = 0.12 + (i % 3) * 0.05;
        k.rod(qx + Math.cos(a) * rr, qy + 1.0, qz + Math.sin(a) * rr, qx + Math.cos(a) * (rr + lean), qy + 1.7, qz + Math.sin(a) * (rr + lean), 0.01, '#d9c08a', 4);
        k.add(new THREE.ConeGeometry(0.034, 0.09, 4), cols[i % 4], qx + Math.cos(a) * (rr + lean), qy + 1.72, qz + Math.sin(a) * (rr + lean));
      }
    }
    // ---- a bench behind the line (seat 0.45 m: the Sit clip's seat), its back to the village
    {
      const [bx, bz] = at(A.bench.u, A.bench.v), by = hAt(bx, bz);
      const put = (w, h, d, col, lx, ly, lz) => k.box(w, h, d, col, bx + lz, by + ly, bz + lx);   // long side across the lane (z), seat faces west
      for (const dx of [-0.1, 0.07]) put(1.6, 0.05, 0.15, '#5aa6d6', 0, 0.425, dx);
      put(1.6, 0.14, 0.04, '#5aa6d6', 0, 0.78, 0.2);
      put(1.6, 0.1, 0.04, '#5aa6d6', 0, 0.6, 0.2);
      for (const sx of [-0.68, 0.68]) { put(0.07, 0.86, 0.07, WOOD_DARK, sx, 0.43, 0.2); put(0.07, 0.4, 0.07, WOOD_DARK, sx, 0.2, -0.1); }
    }
    // ---- the cordon: posts every few metres down both sides, a rope between them and little flags on the rope
    {
      const step = low ? 6 : 3, u1 = A.back + 0.2, u0 = -3;
      const n = Math.round((u1 - u0) / step);
      const flagStep = low ? 1.6 : 0.85;
      for (const s of [-1, 1]) {
        const v = s * A.half;
        for (let i = 0; i <= n; i++) {
          const u = u0 + (u1 - u0) * i / n, [x, z] = at(u, v), y = hAt(x, z);
          k.box(0.1, 1.15, 0.1, i % 2 ? WOOD : WOOD_DARK, x, y + 0.575, z);
          k.add(new THREE.SphereGeometry(0.075, 6, 5), FLAGS[(i + (s > 0 ? 2 : 0)) % FLAGS.length], x, y + 1.2, z);
          if (i < n) {
            const ua = u, ub = u0 + (u1 - u0) * (i + 1) / n, [xa, za] = at(ua, v), [xb, zb] = at(ub, v), ya = hAt(xa, za) + 0.98, yb = hAt(xb, zb) + 0.98;
            const mid = low ? 1 : 2, sag = 0.12;
            for (let m = 0; m < mid; m++) {
              const t0 = m / mid, t1 = (m + 1) / mid;
              const f0 = 0.98 * 0 + sag * 4 * t0 * (1 - t0), f1 = sag * 4 * t1 * (1 - t1);
              k.rod(xa + (xb - xa) * t0, ya + (yb - ya) * t0 - f0, za + (zb - za) * t0, xa + (xb - xa) * t1, ya + (yb - ya) * t1 - f1, za + (zb - za) * t1, 0.015, ROPE, 4);
            }
            const len = ub - ua, nf = Math.max(1, Math.floor(len / flagStep));
            for (let f = 0; f < nf; f++) {
              const t = (f + 0.5) / nf, fx = xa + (xb - xa) * t, fz = za + (zb - za) * t, fy = ya + (yb - ya) * t - sag * 4 * t * (1 - t);
              const tri = new THREE.BufferGeometry();
              // a pennant hanging from the rope, across the lane (its two faces seen from both sides)
              tri.setAttribute('position', new THREE.Float32BufferAttribute([-0.1, 0, 0, 0.1, 0, 0, 0, -0.26, 0], 3));
              tri.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
              k.add(tri, FLAGS[(f + i) % FLAGS.length], fx, fy - 0.02, fz, 0, Math.PI / 2, 0);
            }
          }
        }
      }
    }
    // ---- the rail for the sliding target: two tall posts and a beam
    {
      const M = A.moving, rh = 3.0;
      for (const s of [-1, 1]) { const [x, z] = at(M.u, s * 4.0); k.box(0.16, rh, 0.16, WOOD_DARK, x, hAt(x, z) + rh / 2, z); k.box(0.34, 0.1, 0.34, WOOD, x, hAt(x, z) + rh + 0.02, z); }
      const [x, z] = at(M.u, 0), y = hAt(x, z);
      k.box(0.12, 0.14, 8.4, WOOD, x, y + rh - 0.08, z);
      for (const s of [-1, 1]) { const [px, pz] = at(M.u, s * 3.15); k.rod(x, y + rh - 0.8, z + s * 4.0, px, y + rh - 0.2, pz, 0.025, WOOD_PALE); }
    }
    // ---- the backstop: a wall of hay bales, a tall green net behind a pair of posts, a banner across the top
    {
      const u = A.back + 0.55, courses = low ? 2 : 3, bw = 1.0, nb = 11;
      for (let c = 0; c < courses; c++) for (let i = 0; i < nb; i++) {
        // courses are staggered by half a bale; the end bale of a staggered course sits back one place
        const vv = (i - (nb - 1) / 2) * bw + (c % 2 ? 0.5 : 0) - (c % 2 && i === nb - 1 ? bw : 0);
        const [x, z] = at(u, vv), y = hAt(x, z) + 0.225 + c * 0.45;
        k.box(1.1, 0.44, bw - 0.03, i % 2 ? STRAW : '#dfba5f', x, y, z);
        k.box(1.12, 0.46, 0.03, STRING, x, y, z);
      }
      for (const s of [-1, 1]) { const [x, z] = at(A.back + 0.25, s * 5.3); k.box(0.2, 3.7, 0.2, WOOD_DARK, x, hAt(x, z) + 1.85, z); }
      // the net: a muted green sheet from the top of the bales to three and a half metres, ropes along its top and bottom
      const [nx, nz] = at(A.back + 0.25, 0), ny = hAt(nx, nz);
      k.box(0.03, 2.0, 10.6, '#6f9a5f', nx, ny + 2.45, nz);
      k.box(0.06, 0.08, 10.8, ROPE, nx - 0.02, ny + 3.46, nz);
      // the banner: stripes in the kids' colours with a sun in the middle
      const [bx, bz] = at(A.back - 0.05, 0), bh = ny + 3.0;
      const cols = ['#e8553d', '#fff6e0', '#ffc93a', '#fff6e0', '#4aa3df', '#fff6e0', '#ffc93a', '#fff6e0', '#e8553d'];
      cols.forEach((c, i) => k.box(0.02, 0.62, 10.4 / cols.length, c, bx, bh, bz + (i - (cols.length - 1) / 2) * (10.4 / cols.length)));
      k.add(new THREE.CircleGeometry(0.34, 16), '#e8553d', bx + 0.02, bh, bz, 0, Math.PI / 2, 0);
      k.add(new THREE.CircleGeometry(0.24, 16), '#fff6e0', bx + 0.025, bh, bz, 0, Math.PI / 2, 0);
      k.add(new THREE.CircleGeometry(0.13, 14), '#e8553d', bx + 0.03, bh, bz, 0, Math.PI / 2, 0);
    }
    // ---- the wind sock's pole, hoop and a small foot
    {
      const [x, z] = at(A.sock.u, A.sock.v), y = hAt(x, z), h = A.sock.h;
      k.add(new THREE.CylinderGeometry(0.04, 0.06, h, 8), '#f3efe4', x, y + h / 2, z);
      for (let i = 0; i < 3; i++) k.add(new THREE.CylinderGeometry(0.0425, 0.0575, 0.22, 8), '#e8553d', x, y + 0.5 + i * 0.7, z);
      k.add(new THREE.CylinderGeometry(0.2, 0.26, 0.2, 8), WOOD_DARK, x, y + 0.1, z);
      k.add(new THREE.SphereGeometry(0.07, 8, 6), '#ffc93a', x, y + h + 0.05, z);
      this.sockAt = new THREE.Vector3(x, y + h - 0.12, z);
    }

    const geo = k.merge();
    const mat = patchMaterial(new THREE.MeshStandardMaterial({ name: 'Archery paint', vertexColors: true, roughness: 0.88, metalness: 0, side: THREE.DoubleSide }));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'archery:solid';
    mesh.castShadow = q.propShadows !== false;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.disposables.push(geo, mat);
    this.mat = mat;

    // ---- the three targets (one mesh each, so a round can fold them down) and the sliding one
    this.targets = [];
    A.targets.forEach(t => this.targets.push(this.makeTarget(t, hAt, at, low)));
    this.moving = this.makeTarget({ ...A.moving, id: 'moving', v: 0 }, hAt, at, low);
    this.moving.group.visible = false;

    // ---- the wind sock
    this.makeSock();

    // ---- target numbers on little planks (a canvas, drawn once)
    if (typeof document !== 'undefined') this.makeNumbers(at, hAt);

    structures.group.add(this.group);
    const mid = at((A.back - 3) / 2, 0);
    structures.cullList.push({ obj: this.group, x: mid[0], z: mid[1], prop: true });

    // ---- what can be bumped into: the bench, the hay wall, the quiver stand, the target stands, the rail's posts, the sock's pole
    const { boxes, posts } = archerySolids(), col = structures.colliders;
    for (const b of boxes) { const y = hAt(b.x, b.z); this.solids.push(col.box(b.x, b.z, b.hw, b.hd, 0, y - 1, y + b.h)); }
    for (const p of posts) { const y = hAt(p.x, p.z); this.solids.push(col.cylinder(p.x, p.z, p.r, y - 1, y + p.h)); }
  }

  /** One target: a mesh in its own frame, turned to face the shooter (local +z -> world +x, the lane's -u). */
  makeTarget(t, hAt, at, low) {
    const A = this.A, [x, z] = at(t.u, t.v ?? 0), y = hAt(x, z);
    const geo = targetGeometry(t.r, A.centreH, low);
    const grp = new THREE.Group();
    grp.name = `archery:${t.id}`;
    grp.position.set(x, y, z);
    grp.rotation.y = Math.PI / 2;
    const mesh = new THREE.Mesh(geo, this.mat);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = `archery:${t.id}:mesh`;
    grp.add(mesh);
    // a pennant on top that shows which target is being shot at
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, -0.3, 0.55, 0, 0.3, 0.55].map((v, i) => (i % 3 === 2 ? v * 0.8 : v)), 3));
    fg.setAttribute('normal', new THREE.Float32BufferAttribute([1, 0, 0, 1, 0, 0, 1, 0, 0], 3));
    const flag = new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ color: '#ff3d2e', side: THREE.DoubleSide }));
    flag.position.set(0, A.centreH + t.r + 0.55, -0.2);
    flag.rotation.set(0, 0, 0);
    flag.visible = false;
    grp.add(flag);
    this.group.add(grp);
    this.disposables.push(geo, fg, flag.material);
    return { group: grp, mesh, flag, t, base: new THREE.Vector3(x, y, z), baseY: y };
  }

  makeNumbers(at, hAt) {
    const A = this.A, cv = document.createElement('canvas');
    cv.width = 192; cv.height = 64;
    const c = cv.getContext('2d');
    A.targets.forEach((t, i) => {
      c.fillStyle = '#f7ead0'; c.fillRect(i * 64, 0, 64, 64);
      c.strokeStyle = '#93683a'; c.lineWidth = 4; c.strokeRect(i * 64 + 2, 2, 60, 60);
      c.fillStyle = '#c2441f'; c.font = '700 30px Fredoka, Nunito, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(`${t.dist}`, i * 64 + 32, 26);
      c.font = '700 15px Nunito, sans-serif'; c.fillStyle = '#7a4a22'; c.fillText('m', i * 64 + 32, 50);
    });
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const parts = [];
    A.targets.forEach((t, i) => {
      const g = new THREE.PlaneGeometry(0.5, 0.5);
      const uv = g.attributes.uv;
      for (let j = 0; j < uv.count; j++) uv.setX(j, (uv.getX(j) + i) / 3);
      const [x, z] = at(t.u - 0.9, t.v + 1.15), y = hAt(x, z);
      g.rotateY(Math.PI / 2);
      g.rotateZ(0);
      g.translate(x, y + 0.5, z);
      parts.push(g);
      // a stake under each plank
      const st = new THREE.BoxGeometry(0.06, 0.5, 0.06); st.translate(x - 0.03, y + 0.25, z);
      st.deleteAttribute('uv'); parts.push(st);
    });
    // planks have uv; the stakes do not: give every stake the plain wood corner of the canvas
    for (const g of parts) if (!g.attributes.uv) {
      const uv = new Float32Array(g.attributes.position.count * 2).fill(0.002);
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    }
    const merged = mergeGeometries(parts.map(g => (g.index ? g.toNonIndexed() : g)), false);
    for (const g of parts) g.dispose();
    const m = new THREE.MeshStandardMaterial({ name: 'Archery numbers', map: tex, roughness: 0.9, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(merged, m);
    mesh.name = 'archery:numbers';
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.disposables.push(tex, merged, m);
  }

  /** The wind sock: four tapering bands (red, white, red, white) on a hoop at the pole's top; rewritten by setWind. */
  makeSock() {
    const RAD = 8, RINGS = 5;
    const pos = new Float32Array(RINGS * RAD * 3), nor = new Float32Array(RINGS * RAD * 3), col = new Float32Array(RINGS * RAD * 3), idx = [];
    const band = ['#e8553d', '#fff6e0', '#e8553d', '#fff6e0'];
    for (let r = 0; r < RINGS; r++) for (let a = 0; a < RAD; a++) {
      C.set(band[Math.min(r, 3)]);
      col.set([C.r, C.g, C.b], (r * RAD + a) * 3);
      if (r < RINGS - 1) {
        const a2 = (a + 1) % RAD, i0 = r * RAD + a, i1 = r * RAD + a2, i2 = (r + 1) * RAD + a, i3 = (r + 1) * RAD + a2;
        idx.push(i0, i2, i1, i1, i2, i3);
      }
    }
    const g = new THREE.BufferGeometry();
    this.sockPos = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.sockNor = new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.sockPos);
    g.setAttribute('normal', this.sockNor);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    const m = new THREE.MeshStandardMaterial({ name: 'Wind sock', vertexColors: true, roughness: 0.9, side: THREE.DoubleSide, emissive: '#3a1a08', emissiveIntensity: 0.18 });
    const mesh = this.sock = new THREE.Mesh(g, m);
    mesh.name = 'archery:sock';
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    this.group.add(mesh);
    this.disposables.push(g, m);
    this.sockWind = NaN;
    this.setWind(0.4, 0);
  }

  /**
   * Blow the sock. w: the crosswind in m/s (+ toward the shooter's right, as in rules-archery.js); t: seconds (the flutter).
   * Light airs let it droop, a 4 m/s wind holds it nearly level; it points the way the wind goes.
   */
  setWind(w, t) {
    const A = this.A, o = this.sockAt, sg = w >= 0 ? 1 : -1, mag = Math.min(1, Math.abs(w) / 4.2);
    // v is toward world -z
    const RAD = 8, RINGS = 5, seg = 0.42, pa = this.sockPos.array, na = this.sockNor.array;
    let cx = o.x, cy = o.y, cz = o.z;
    const base = 0.12 + 1.33 * mag ** 0.9;
    for (let r = 0; r < RINGS; r++) {
      const kk = Math.min(r, 3), flut = Math.sin(t * (6.2 + kk * 1.3) + kk * 1.7) * 0.07 * (0.35 + mag) * (kk + 1) / 4;
      const beta = Math.min(1.5, Math.max(0.05, base * (1 - kk * 0.045 * (1 - mag)) + flut + (kk >= 2 ? (1 - mag) * 0.1 * kk : 0)));
      const s = Math.sin(beta), c = Math.cos(beta), rad = 0.2 - r * 0.027;
      // e1 across the plane (world x), e2 in the plane perpendicular to the sock's axis
      const e2y = s * sg, e2z = -c;       // e1 x dir, with dir = (0, -c, -s * sg)
      for (let a = 0; a < RAD; a++) {
        const ph = a / RAD * Math.PI * 2, ca = Math.cos(ph), sa = Math.sin(ph), i = (r * RAD + a) * 3;
        pa[i] = cx + ca * rad; pa[i + 1] = cy + sa * rad * e2y; pa[i + 2] = cz + sa * rad * e2z;
        na[i] = ca; na[i + 1] = sa * e2y; na[i + 2] = sa * e2z;
      }
      cy -= c * seg; cz -= s * sg * seg;
    }
    this.sockPos.needsUpdate = true;
    this.sockNor.needsUpdate = true;
    this.sockWind = w;
    void A;
  }

  dispose() {
    this.group.removeFromParent();
    for (const d of this.disposables) d.dispose?.();
  }
}
