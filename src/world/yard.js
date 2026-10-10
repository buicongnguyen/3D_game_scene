// The Kawabe playground yard, built in code from content/yard.js: a packed-earth court with chalk lines and a low
// net, a rail fence with painted post caps, two benches, a scoreboard post, a box of balls and shuttlecocks, a
// hopscotch grid, a seesaw, a practice kick-board and a string of pennants. No model files: everything solid and
// opaque is ONE mesh with baked vertex colours (one draw call, one shadow caster); the net's strings are one line
// mesh and the scoreboard's two faces share one small canvas texture.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { patchMaterial } from '../engine/effects.js';
import { YARD, fenceRuns, yardSolids, hopCells } from '../content/yard.js';

const WOOD = '#b98850', WOOD_DARK = '#93683a', WOOD_PALE = '#dcb98a', CHALK = '#f6f1e4';
const PAINT = ['#e2543a', '#3f8fd0', '#f2b53a', '#5fae3e', '#e0567a', '#1fa5a0'];
const C = new THREE.Color(), M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), S = new THREE.Vector3(1, 1, 1);

/** Collects coloured pieces and merges them into one geometry. */
class Kit {
  constructor() { this.parts = []; }
  add(geo, color, x, y, z, rx = 0, ry = 0, rz = 0) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    g.deleteAttribute('uv');
    M4.compose(P.set(x, y, z), Q.setFromEuler(E.set(rx, ry, rz, 'YXZ')), S);
    g.applyMatrix4(M4);
    C.set(color);
    const n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = C.r; col[i * 3 + 1] = C.g; col[i * 3 + 2] = C.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.parts.push(g);
    return this;
  }
  box(w, h, d, color, x, y, z, rx, ry, rz) { return this.add(new THREE.BoxGeometry(w, h, d), color, x, y, z, rx, ry, rz); }
  /** A flat mark on the ground (chalk): w along x, d along z. */
  flat(w, d, color, x, y, z, ry = 0) { return this.add(new THREE.PlaneGeometry(w, d), color, x, y, z, -Math.PI / 2, ry, 0); }
  merge() {
    const g = mergeGeometries(this.parts, false);
    for (const p of this.parts) p.dispose();
    this.parts.length = 0;
    return g;
  }
}

/** A shuttlecock, about 0.2 m tall, cork down (-y), feathers up; coloured by vertex. Shared by the box and the games. */
export function shuttleGeometry() {
  const k = new Kit();
  k.add(new THREE.SphereGeometry(0.045, 8, 6), '#e2543a', 0, -0.055, 0);
  k.add(new THREE.CylinderGeometry(0.036, 0.046, 0.03, 8), '#fff6e0', 0, -0.02, 0);
  k.add(new THREE.ConeGeometry(0.1, 0.17, 8, 1, true), '#fffdf4', 0, 0.075, 0, Math.PI, 0, 0);     // open feather cone, wide end up
  k.add(new THREE.ConeGeometry(0.1, 0.17, 8, 1, true), '#f7c9d8', 0, 0.076, 0, Math.PI, Math.PI / 8, 0);
  return k.merge();
}

export class YardBuild {
  /** structures: the world's Structures (scene group, colliders, cull list). */
  constructor(structures) {
    const world = structures.world, Y = YARD, f = Y.fence, q = world.quality || {};
    const hAt = (x, z) => world.heightAt(x, z);
    const y0 = this.y0 = hAt(Y.x, Y.z);
    this.group = new THREE.Group();
    this.group.name = 'yard';
    this.disposables = [];
    const k = new Kit();

    // ---- the ground: packed earth under the court, trodden grass round it, bare patches at the ways in
    const sp = world.splat;
    if (sp) {
      const mx = (f.x0 + f.x1) / 2, mz = (f.z0 + f.z1) / 2;
      sp.paintRect(mx, mz, (f.x1 - f.x0) / 2 - 0.3, (f.z1 - f.z0) / 2 - 0.3, 0, 3, 0.3, 1.2);
      sp.paintRect(mx, mz, (f.x1 - f.x0) / 2 - 0.3, (f.z1 - f.z0) / 2 - 0.3, 0, 0, 0.3, 1.2);
      sp.paintRect(Y.x, Y.z, Y.w / 2 + 0.5, Y.l / 2 + 0.5, 0, 3, 0, 0.8);
      sp.paintRect(Y.x, Y.z, Y.w / 2 + 0.4, Y.l / 2 + 0.4, 0, 0, 0.95, 0.9);
      sp.paintRect(Y.hop.x - 1.8, Y.hop.z, 2.3, 1.0, 0, 3, 0, 0.6);
      sp.paintRect(Y.hop.x - 1.8, Y.hop.z, 2.2, 0.9, 0, 0, 0.9, 0.7);
      for (const g of Y.gaps) {
        const m = (g.a + g.b) / 2, [gx, gz] = g.side === 'n' ? [m, f.z0] : g.side === 's' ? [m, f.z1] : [f.x0, m];
        sp.paintDisc(gx, gz, 1.1, 0, 0.8, 1.1); sp.paintDisc(gx, gz, 1.1, 3, 0, 1.1);
      }
      for (const b of Y.benches) { sp.paintDisc(b.x + 0.5, b.z, 0.8, 0, 0.7, 0.8); sp.paintDisc(b.x + 0.5, b.z, 0.8, 3, 0, 0.8); }
    }

    // ---- chalk: the court's lines (boundary, the line under the net, a short-serve line on each side)
    const lw = 0.075, ly = y0 + 0.03, hw = Y.w / 2, hl = Y.l / 2;
    for (const s of [-1, 1]) {
      k.flat(lw, Y.l + lw, CHALK, Y.x + s * hw, ly, Y.z);
      k.flat(Y.w + lw, lw, CHALK, Y.x, ly, Y.z + s * hl);
      k.flat(Y.w, lw * 0.8, CHALK, Y.x, ly, Y.z + s * 1.98);
    }
    k.flat(Y.w, lw * 0.8, CHALK, Y.x, ly, Y.z);
    // hopscotch squares in coloured chalk
    const hc = Y.hop.cell, tones = ['#f7b6c8', '#bfe0ff', '#fff0a8'];
    for (const c of hopCells()) {
      const col = tones[c.n % 3], t = 0.05;
      for (const s of [-1, 1]) {
        k.flat(hc, t, col, c.x, ly, c.z + s * (hc / 2 - t / 2));
        k.flat(t, hc, col, c.x + s * (hc / 2 - t / 2), ly, c.z);
      }
      // the square's number, as chalk dots
      const dots = Math.min(c.n, 5);
      for (let i = 0; i < dots; i++) k.flat(0.06, 0.06, CHALK, c.x - 0.14 + (i % 3) * 0.14, ly, c.z - 0.07 + Math.floor(i / 3) * 0.14);
    }
    k.add(new THREE.RingGeometry(0.34, 0.4, 14, 1, 0, Math.PI), tones[0], Y.hop.x - hc * 6, ly, Y.hop.z, -Math.PI / 2, Math.PI / 2, 0);   // "home" half-circle

    // ---- the fence: posts with painted caps and two rails
    let cap = 0;
    const low = q.name === 'Low';
    for (const [x0, z0, x1, z1] of fenceRuns()) {
      const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / (low ? 2.6 : 1.9))), alongX = z0 === z1;
      for (let i = 0; i <= n; i++) {
        const x = x0 + (x1 - x0) * i / n, z = z0 + (z1 - z0) * i / n, gy = hAt(x, z);
        k.box(0.12, f.h, 0.12, i % 2 ? WOOD : WOOD_DARK, x, gy + f.h / 2, z);
        k.box(0.16, 0.07, 0.16, PAINT[cap++ % PAINT.length], x, gy + f.h + 0.035, z);
      }
      const gy = (hAt(x0, z0) + hAt(x1, z1)) / 2, mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      const tilt = Math.atan2(hAt(x1, z1) - hAt(x0, z0), len);
      for (const ry of [0.3, 0.56]) k.box(alongX ? len : 0.05, 0.09, alongX ? 0.05 : len, WOOD_PALE, mx, gy + ry, mz, alongX ? 0 : -tilt, 0, alongX ? tilt : 0);
    }

    // ---- the net: two red posts with white caps, a white tape, a cord along the bottom
    const nx = Y.w / 2 + 0.4;
    for (const s of [-1, 1]) {
      k.add(new THREE.CylinderGeometry(0.055, 0.065, Y.netH + 0.1, 8), PAINT[0], Y.x + s * nx, y0 + (Y.netH + 0.1) / 2, Y.z);
      k.add(new THREE.SphereGeometry(0.085, 8, 6), CHALK, Y.x + s * nx, y0 + Y.netH + 0.13, Y.z);
    }
    k.box(nx * 2, 0.07, 0.025, '#ffffff', Y.x, y0 + Y.netH, Y.z);
    k.box(nx * 2, 0.025, 0.02, '#e8e2d2', Y.x, y0 + 0.52, Y.z);

    // ---- benches (seat top 0.45 m: the Sit clip's seat), bright paint
    Y.benches.forEach((b, i) => {
      const gy = hAt(b.x, b.z), c = PAINT[i ? 5 : 0], put = (w, h, d, col, lx, ly2, lz) => {
        const cs = Math.cos(b.face), sn = Math.sin(b.face);
        k.box(w, h, d, col, b.x + lx * cs + lz * sn, gy + ly2, b.z - lx * sn + lz * cs, 0, b.face, 0);
      };
      for (const dz of [-0.11, 0.06]) put(1.6, 0.05, 0.15, c, 0, 0.425, dz);
      put(1.6, 0.14, 0.04, c, 0, 0.78, -0.2);
      put(1.6, 0.1, 0.04, c, 0, 0.6, -0.2);
      for (const sx of [-0.68, 0.68]) { put(0.07, 0.86, 0.07, WOOD_DARK, sx, 0.43, -0.2); put(0.07, 0.4, 0.07, WOOD_DARK, sx, 0.2, 0.1); put(0.06, 0.05, 0.36, WOOD_DARK, sx, 0.38, -0.04); }
    });

    // ---- the scoreboard post (its two faces are a separate small textured mesh)
    const B = Y.board, by = hAt(B.x, B.z);
    for (const s of [-1, 1]) k.box(0.1, B.h, 0.1, WOOD_DARK, B.x + s * 0.63, by + B.h / 2, B.z);       // two legs, clear of the faces
    k.box(1.16, 0.74, 0.07, WOOD, B.x, by + B.h - 0.42, B.z);
    k.box(1.5, 0.06, 0.28, PAINT[0], B.x, by + B.h + 0.01, B.z);              // a little roof

    // ---- the box of balls and shuttlecocks
    const R = Y.rack, ry0 = hAt(R.x, R.z);
    k.box(0.62, 0.06, 0.96, WOOD_DARK, R.x, ry0 + 0.05, R.z);
    for (const s of [-1, 1]) { k.box(0.05, 0.42, 0.96, WOOD, R.x + s * 0.3, ry0 + 0.27, R.z); k.box(0.62, 0.42, 0.05, WOOD_PALE, R.x, ry0 + 0.27, R.z + s * 0.47); }
    k.add(new THREE.IcosahedronGeometry(0.15, 1), PAINT[0], R.x - 0.06, ry0 + 0.36, R.z - 0.22);
    k.add(new THREE.IcosahedronGeometry(0.13, 1), PAINT[2], R.x + 0.1, ry0 + 0.4, R.z + 0.02);
    k.add(new THREE.IcosahedronGeometry(0.12, 1), PAINT[1], R.x - 0.1, ry0 + 0.43, R.z + 0.27);
    const sg = shuttleGeometry();
    for (const [dx, dz, tilt] of [[0.12, -0.3, 0.5], [0.02, 0.2, -0.7], [0.16, 0.33, 0.3]]) {
      const g = sg.clone();
      M4.compose(P.set(R.x + dx, ry0 + 0.56, R.z + dz), Q.setFromEuler(E.set(tilt, dz * 3, tilt * 0.6)), S.set(1.5, 1.5, 1.5));
      g.applyMatrix4(M4);
      k.parts.push(g);
    }
    S.set(1, 1, 1);
    sg.dispose();

    // ---- the seesaw: a log, a tilted plank, two handles
    const W = Y.seesaw, sy = hAt(W.x, W.z), tilt = 0.2;
    k.add(new THREE.CylinderGeometry(0.2, 0.2, 0.46, 10), WOOD_DARK, W.x, sy + 0.2, W.z, 0, 0, Math.PI / 2);
    k.box(0.28, 0.05, W.len, PAINT[2], W.x, sy + 0.44, W.z, tilt, 0, 0);
    for (const s of [-1, 1]) {
      const dz = s * (W.len / 2 - 0.45), dy = -Math.sin(tilt) * dz;
      k.box(0.3, 0.06, 0.4, PAINT[s < 0 ? 0 : 1], W.x, sy + 0.45 + dy - s * 0.03, W.z + s * (W.len / 2 - 0.2), tilt, 0, 0);
      k.box(0.04, 0.26, 0.04, WOOD_DARK, W.x, sy + 0.58 + dy, W.z + dz, tilt, 0, 0);
      k.box(0.3, 0.04, 0.04, WOOD_DARK, W.x, sy + 0.71 + dy, W.z + dz, tilt, 0, 0);
    }

    // ---- the practice kick-board on the south fence: planks, two posts, a painted target (facing the court)
    const K = Y.wall, ky = hAt(K.x, K.z), nPl = 8, pw = K.w / nPl;
    for (let i = 0; i < nPl; i++) k.box(pw - 0.02, K.h - 0.12, 0.05, i % 2 ? WOOD_PALE : '#cfa873', K.x - K.w / 2 + pw * (i + 0.5), ky + 0.12 + (K.h - 0.12) / 2, K.z);
    for (const s of [-1, 1]) k.box(0.13, K.h + 0.15, 0.13, WOOD_DARK, K.x + s * (K.w / 2 - 0.1), ky + (K.h + 0.15) / 2, K.z + 0.09);
    [[0.62, PAINT[0]], [0.42, CHALK], [0.22, PAINT[0]]].forEach(([r, col], i) => k.add(new THREE.CircleGeometry(r, 18), col, K.x, ky + 1.05, K.z - 0.03 - i * 0.004, 0, Math.PI, 0));

    // ---- a string of pennants along the west side (two tall poles)
    const pz0 = f.z0, pz1 = f.z1, ph = 2.7, px = f.x0;
    for (const z of [pz0, pz1]) k.box(0.08, ph, 0.08, WOOD_DARK, px, hAt(px, z) + ph / 2, z);
    const nP = low ? 14 : 22, py = hAt(px, (pz0 + pz1) / 2) + ph - 0.05;
    for (let i = 0; i < nP; i++) {
      const t = (i + 0.5) / nP, z = pz0 + (pz1 - pz0) * t, sag = 0.55 * 4 * t * (1 - t);
      const tri = new THREE.BufferGeometry();
      tri.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.17, 0, 0, 0.17, 0, -0.34, 0, 0, 0, 0.17, 0, 0, -0.17, 0, -0.34, 0], 3));
      tri.setAttribute('normal', new THREE.Float32BufferAttribute([1, 0.3, 0, 1, 0.3, 0, 1, 0.3, 0, -1, 0.3, 0, -1, 0.3, 0, -1, 0.3, 0], 3));
      k.add(tri, PAINT[i % PAINT.length], px, py - sag, z);
    }

    const geo = k.merge();
    const mat = patchMaterial(new THREE.MeshStandardMaterial({ name: 'Yard paint', vertexColors: true, roughness: 0.85, metalness: 0, side: THREE.DoubleSide }));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'yard:solid';
    mesh.castShadow = q.propShadows !== false;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.disposables.push(geo, mat);

    // ---- winter: the kids sweep the court (the snowy ground would hide it); one more plane, drawn in winter only
    const wg = new THREE.PlaneGeometry(Y.w + 0.5, Y.l + 0.5);
    const wm = patchMaterial(new THREE.MeshStandardMaterial({ name: 'Yard swept court', color: '#b39472', roughness: 1, metalness: 0 }), { snow: 0 });
    const swept = this.swept = new THREE.Mesh(wg, wm);
    swept.rotation.x = -Math.PI / 2;
    swept.position.set(Y.x, y0 + 0.014, Y.z);
    swept.receiveShadow = true;
    swept.name = 'yard:swept';
    swept.visible = world.season === 'winter';
    world.seasonHooks?.push(season => { swept.visible = season === 'winter'; });
    this.group.add(swept);
    this.disposables.push(wg, wm);

    // ---- the net's strings: one line mesh (and a faint sheet behind them on the better tiers, so it reads from afar)
    const pts = [], top = y0 + Y.netH - 0.03, bot = y0 + 0.53, stepX = low ? 0.3 : 0.17;
    for (let x = -nx; x <= nx + 1e-6; x += stepX) pts.push(Y.x + x, bot, Y.z, Y.x + x, top, Y.z);
    for (let y = bot + 0.16; y < top - 0.05; y += 0.16) pts.push(Y.x - nx, y, Y.z, Y.x + nx, y, Y.z);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const lm = new THREE.LineBasicMaterial({ color: '#fbf7ea', transparent: true, opacity: 0.85 });
    this.netMats = [lm];
    const strings = new THREE.LineSegments(lg, lm);
    strings.name = 'yard:net';
    this.group.add(strings);
    this.disposables.push(lg, lm);
    if (!low) {
      const pg = new THREE.PlaneGeometry(nx * 2, top - bot);
      const pm = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false });
      this.netMats.push(pm);
      const sheet = new THREE.Mesh(pg, pm);
      sheet.position.set(Y.x, (top + bot) / 2, Y.z);
      sheet.name = 'yard:netSheet';
      this.group.add(sheet);
      this.disposables.push(pg, pm);
    }

    // ---- the scoreboard's faces: one canvas, drawn only when the score changes
    this.boardKey = null;
    if (typeof document !== 'undefined') {
      const cv = this.canvas = document.createElement('canvas');
      cv.width = 256; cv.height = 160;
      const tex = this.tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      const fm = new THREE.MeshStandardMaterial({ name: 'Yard scoreboard', map: tex, emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: 0.22, roughness: 0.9 });
      const fg = new THREE.PlaneGeometry(1.06, 0.66);
      for (const s of [1, -1]) {
        const face = new THREE.Mesh(fg, fm);
        face.position.set(B.x, by + B.h - 0.42, B.z + s * 0.04);
        face.rotation.y = s > 0 ? 0 : Math.PI;
        face.name = 'yard:board';
        this.group.add(face);
      }
      this.disposables.push(tex, fm, fg);
      this.setBoard('', '0 : 0', '');
      document.fonts?.ready?.then(() => { const key = this.boardKey; this.boardKey = null; if (key) this.setBoard(...key.split('\n')); });
    }

    structures.group.add(this.group);
    structures.cullList.push({ obj: this.group, x: Y.x, z: Y.z, prop: true });

    // ---- what can be bumped into
    const { boxes, posts } = yardSolids(), col = structures.colliders;
    this.solids = [];
    for (const b of boxes) {
      const gy = hAt(b.x, b.z);
      this.solids.push(col.box(b.x, b.z, b.hw, b.hd, 0, gy - 1, gy + b.h, b.walk ? { walkable: true, surface: 'wood' } : {}));
    }
    for (const p of posts) { const gy = hAt(p.x, p.z); this.solids.push(col.cylinder(p.x, p.z, p.r, gy - 1, gy + p.h)); }
  }

  /** The net's strings are unlit: dim them with the daylight so they do not glow in the dark. night: 0 .. 1. */
  setNight(night) {
    const k = Math.round((1 - 0.72 * Math.min(1, Math.max(0, night))) * 40) / 40;
    if (k === this.netLight) return;
    this.netLight = k;
    for (const m of this.netMats) m.color.setRGB(0.96 * k, 0.94 * k, 0.86 * k + (1 - k) * 0.12);
  }

  /** Chalk the scoreboard: a small title, the big score, a small line under it. Redrawn only when something changed. */
  setBoard(title, big, small = '') {
    const key = `${title}\n${big}\n${small}`;
    if (!this.canvas || key === this.boardKey) return;
    this.boardKey = key;
    const c = this.canvas.getContext('2d'), w = 256, h = 160;
    c.fillStyle = '#2f4a3a'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#e9d9b0'; c.lineWidth = 6; c.strokeRect(3, 3, w - 6, h - 6);
    c.fillStyle = '#f6f1e4'; c.textAlign = 'center'; c.textBaseline = 'middle';
    const fit = (text, size, y, weight = 600) => {
      let s = size;
      do { c.font = `${weight} ${s}px Fredoka, Nunito, sans-serif`; s -= 2; } while (c.measureText(text).width > w - 28 && s > 12);
      c.fillText(text, w / 2, y);
    };
    if (title) fit(title, 26, 30);
    c.fillStyle = '#ffe9a8';
    fit(big, 76, title || small ? 86 : 82, 700);
    c.fillStyle = '#d7e6d2';
    if (small) fit(small, 22, 138);
    this.tex.needsUpdate = true;
  }
}
