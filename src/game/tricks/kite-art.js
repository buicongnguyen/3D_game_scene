// The kites of "Make and fly a kite", drawn here (no model files): the painted Japanese kaku-dako, the Vietnamese flute
// kite (diều sáo), the hawk kite (tonbi-dako) and the box kite. A flat kite is one painted sheet (a canvas with the kite's
// outline cut out of it) on a frame of bamboo sticks merged into one mesh; the box kite is real boxes. Every kite comes
// as a group with three named parts, `Frame`, `Paper` and `Tail` (the third thing tied on: tails, the flutes, the bridle),
// so the build can show them one by one. The same paintings, small, are the pictures of the chooser.
// Units: the kite's longest side is 1, +Y its top, +Z its face.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const BAMBOO = '#b08a4a', INK = '#2a1a12';
const TAU = Math.PI * 2;

// ------------------------------------------------------------------------------------------------ the paintings
// each paints in the kite's own units: x 0..w to the right, y 0..h down
const dot = (c, x, y, r, fill) => { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = fill; c.fill(); };
const poly = (c, pts) => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); };

/** The plain diamond as the valley's own kite model is painted: cream paper, a red edge, a red sun and a little blue bird. */
function paintDiamond(c) {
  const out = [[0.4, 0.02], [0.78, 0.36], [0.4, 0.98], [0.02, 0.36]];
  poly(c, out); c.fillStyle = '#fff1d6'; c.fill();
  c.strokeStyle = '#e8432b'; c.lineWidth = 0.045; c.lineJoin = 'round'; c.stroke();
  dot(c, 0.4, 0.3, 0.085, '#e8432b');
  c.fillStyle = '#e8432b';
  for (let i = 0; i < 8; i++) { const a = i * TAU / 8; poly(c, [[0.4 + Math.cos(a - 0.2) * 0.115, 0.3 + Math.sin(a - 0.2) * 0.115], [0.4 + Math.cos(a) * 0.16, 0.3 + Math.sin(a) * 0.16], [0.4 + Math.cos(a + 0.2) * 0.115, 0.3 + Math.sin(a + 0.2) * 0.115]]); c.fill(); }
  c.beginPath(); c.ellipse(0.4, 0.62, 0.062, 0.1, 0.25, 0, TAU); c.fillStyle = '#3f63c8'; c.fill();
  poly(c, [[0.34, 0.6], [0.27, 0.63], [0.34, 0.66]]); c.fillStyle = '#ffa630'; c.fill();
  dot(c, 0.385, 0.565, 0.016, '#fff');
}

function paintKaku(c) {
  const w = 0.78, h = 1;
  c.fillStyle = '#27407a'; c.fillRect(0, 0, w, h);                 // the indigo edge
  c.fillStyle = '#fff4d8'; c.fillRect(0.045, 0.045, w - 0.09, h - 0.09);
  // a Daruma: the round red wishing doll
  c.beginPath(); c.ellipse(0.39, 0.55, 0.3, 0.37, 0, 0, TAU); c.fillStyle = '#e2432b'; c.fill();
  c.beginPath(); c.ellipse(0.39, 0.44, 0.215, 0.19, 0, 0, TAU); c.fillStyle = '#ffe9c9'; c.fill();
  c.lineCap = 'round'; c.strokeStyle = INK; c.lineWidth = 0.04;
  c.beginPath(); c.moveTo(0.2, 0.37); c.quadraticCurveTo(0.28, 0.29, 0.355, 0.36); c.stroke();
  c.beginPath(); c.moveTo(0.58, 0.37); c.quadraticCurveTo(0.5, 0.29, 0.425, 0.36); c.stroke();
  for (const x of [0.295, 0.485]) { dot(c, x, 0.45, 0.058, '#fff'); c.lineWidth = 0.012; c.stroke(); dot(c, x, 0.455, 0.028, INK); }
  c.lineWidth = 0.022;
  c.beginPath(); c.moveTo(0.39, 0.5); c.quadraticCurveTo(0.335, 0.59, 0.265, 0.545); c.stroke();      // the moustache
  c.beginPath(); c.moveTo(0.39, 0.5); c.quadraticCurveTo(0.445, 0.59, 0.515, 0.545); c.stroke();
  c.strokeStyle = '#ffd23f'; c.lineWidth = 0.03;                    // gold on the belly
  c.beginPath(); c.arc(0.39, 0.93, 0.2, Math.PI * 1.25, Math.PI * 1.75); c.stroke();
  c.beginPath(); c.arc(0.39, 0.97, 0.13, Math.PI * 1.22, Math.PI * 1.78); c.stroke();
}

const saoPath = c => { c.beginPath(); c.moveTo(0.01, 0.2); c.bezierCurveTo(0.25, -0.03, 0.75, -0.03, 0.99, 0.2); c.bezierCurveTo(0.78, 0.6, 0.22, 0.6, 0.01, 0.2); c.closePath(); };
function paintSao(c) {
  const g = c.createLinearGradient(0, 0, 0, 0.5);
  g.addColorStop(0, '#ffe7a8'); g.addColorStop(1, '#f6b84e');
  saoPath(c); c.fillStyle = g; c.fill();
  c.save(); saoPath(c); c.clip();
  c.strokeStyle = 'rgba(160,96,40,.5)'; c.lineWidth = 0.012;       // the bamboo ribs show through the paper
  for (let x = 0.1; x < 0.95; x += 0.1) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, 0.5); c.stroke(); }
  c.fillStyle = '#e2432b'; c.beginPath(); c.moveTo(0.01, 0.2); c.lineTo(0.2, 0.02); c.lineTo(0.2, 0.5); c.fill();      // red wing tips
  c.beginPath(); c.moveTo(0.99, 0.2); c.lineTo(0.8, 0.02); c.lineTo(0.8, 0.5); c.fill();
  c.restore();
  saoPath(c); c.strokeStyle = '#a8502a'; c.lineWidth = 0.026; c.lineJoin = 'round'; c.stroke();
  for (let i = 0; i < 6; i++) { const a = i * TAU / 6; c.beginPath(); c.ellipse(0.5 + Math.cos(a) * 0.05, 0.33 + Math.sin(a) * 0.05, 0.042, 0.026, a, 0, TAU); c.fillStyle = '#f27ea0'; c.fill(); }   // a lotus
  dot(c, 0.5, 0.33, 0.026, '#ffd23f');
}

const BIRD_HALF = [[0.5, 0.0], [0.555, 0.025], [0.585, 0.1], [0.66, 0.165], [0.99, 0.265], [0.975, 0.36], [0.87, 0.365], [0.805, 0.43], [0.725, 0.4], [0.665, 0.46], [0.6, 0.43], [0.575, 0.5], [0.66, 0.68], [0.5, 0.625]];
const birdPath = c => poly(c, [...BIRD_HALF, ...BIRD_HALF.slice(1, -1).reverse().map(([x, y]) => [1 - x, y])]);
function paintBird(c) {
  birdPath(c); c.fillStyle = '#8a5a34'; c.fill();
  c.save(); birdPath(c); c.clip();
  c.fillStyle = '#e8c184'; c.beginPath(); c.ellipse(0.5, 0.31, 0.56, 0.055, 0, 0, TAU); c.fill();      // the pale bar across the wings
  c.fillStyle = '#5a3a22'; c.fillRect(0, 0, 0.14, 0.7); c.fillRect(0.86, 0, 0.14, 0.7);                // dark wing tips
  c.fillStyle = '#f6dfb0'; c.beginPath(); c.ellipse(0.5, 0.36, 0.07, 0.16, 0, 0, TAU); c.fill();       // the breast
  c.strokeStyle = '#5a3a22'; c.lineWidth = 0.014;
  for (const x of [0.44, 0.5, 0.56]) { c.beginPath(); c.moveTo(0.5, 0.52); c.lineTo(0.5 + (x - 0.5) * 2.6, 0.68); c.stroke(); }     // tail feathers
  c.restore();
  for (const x of [0.467, 0.533]) { dot(c, x, 0.06, 0.024, '#fff'); dot(c, x, 0.064, 0.012, INK); }
  poly(c, [[0.48, 0.095], [0.52, 0.095], [0.5, 0.15]]); c.fillStyle = '#ffb52e'; c.fill();
  birdPath(c); c.strokeStyle = '#5a3a22'; c.lineWidth = 0.014; c.lineJoin = 'round'; c.stroke();
}

/** The box kite as a small drawing (the chooser's picture): two paper bands on four sticks, seen from a corner. */
function paintBox(c) {
  c.lineCap = 'round'; c.strokeStyle = BAMBOO; c.lineWidth = 0.026;
  const sticks = xs => { for (const [x, y0, y1] of xs) { c.beginPath(); c.moveTo(x, y0); c.lineTo(x, y1); c.stroke(); } };
  // each band: its inside (seen through the open top), then the two sides that face us
  const band = (y, a, b, inside) => {
    poly(c, [[0.2, y + 0.08], [0.5, y + 0.16], [0.8, y + 0.08], [0.5, y]]); c.fillStyle = inside; c.fill();
    poly(c, [[0.2, y + 0.08], [0.5, y + 0.16], [0.5, y + 0.42], [0.2, y + 0.34]]); c.fillStyle = a; c.fill();
    poly(c, [[0.5, y + 0.16], [0.8, y + 0.08], [0.8, y + 0.34], [0.5, y + 0.42]]); c.fillStyle = b; c.fill();
  };
  sticks([[0.5, 0.02, 0.9]]);                                           // the stick at the back
  band(0.52, '#ffcf45', '#e0a422', '#b9841a');
  sticks([[0.2, 0.06, 0.9], [0.8, 0.06, 0.9]]);
  band(0.04, '#e8432b', '#b8301f', '#8f2417');
  sticks([[0.5, 0.18, 0.98]]);                                          // the stick nearest to us
}

/**
 * The kites. w / h: the sheet's size (longest side 1); size: how big it is flown, against the plain diamond; tails: where
 * the long ribbons are tied [x, y, length] (from the middle, +Y up); steps: the three things the build ties on.
 */
export const KITE_ART = {
  diamond: { w: 0.8, h: 1, paint: paintDiamond, size: 1, tails: [[0, -0.478, 1]] },
  kaku: { w: 0.78, h: 1, paint: paintKaku, size: 1.05, tails: [[-0.3, -0.5, 1.15], [0.3, -0.5, 1.15]] },
  sao: { w: 1, h: 0.5, paint: paintSao, size: 1.3, tails: [] },
  bird: { w: 1, h: 0.68, paint: paintBird, size: 1.25, tails: [] },
  box: { w: 1, h: 1, paint: paintBox, size: 1.05, tails: [] },
};

function sheet(art, S) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const c = cv.getContext('2d');
  c.scale(S / art.w, S / art.h);
  art.paint(c);
  return cv;
}

const thumbs = new Map();
/** The chooser's picture of a kite: an image url (made once). */
export function kiteThumb(id) {
  if (thumbs.has(id)) return thumbs.get(id);
  const art = KITE_ART[id] || KITE_ART.diamond, S = 128, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const c = cv.getContext('2d'), k = (S - 12) * (art.tails.length ? 0.78 : 1);
  c.translate((S - art.w * k) / 2, art.tails.length ? 4 : (S - art.h * k) / 2);
  c.scale(k, k);
  // the tails first, so the kite lies over their knots
  c.lineCap = 'round'; c.lineWidth = 0.035;
  for (const [x, y, len] of art.tails) {
    const x0 = art.w / 2 + x, y0 = art.h / 2 - y;
    for (let i = 0; i < 5; i++) {
      c.strokeStyle = i % 2 ? '#fff6e0' : '#e8432b';
      c.beginPath(); c.moveTo(x0 + Math.sin(i * 1.7) * 0.035, y0 + i * 0.055 * len); c.lineTo(x0 + Math.sin((i + 1) * 1.7) * 0.035, y0 + (i + 1) * 0.055 * len); c.stroke();
    }
  }
  art.paint(c);
  if (id === 'sao') {
    // the three flutes on its back
    c.lineCap = 'butt';
    for (const [y, l, t] of [[0.215, 0.3, 0.07], [0.135, 0.22, 0.058], [0.07, 0.15, 0.046]]) {
      c.strokeStyle = '#8a5a2a'; c.lineWidth = t + 0.014; c.beginPath(); c.moveTo(0.5 - l / 2 - 0.007, y); c.lineTo(0.5 + l / 2 + 0.007, y); c.stroke();
      c.strokeStyle = '#d9b06a'; c.lineWidth = t; c.beginPath(); c.moveTo(0.5 - l / 2, y); c.lineTo(0.5 + l / 2, y); c.stroke();
    }
  }
  const url = cv.toDataURL('image/png');
  thumbs.set(id, url);
  return url;
}

// ------------------------------------------------------------------------------------------------ the kites in 3D
/** A bamboo stick from (x0, y0) to (x1, y1), `t` thick, `z` behind the paper. */
function stick(x0, y0, x1, y1, t = 0.02, z = -0.012) {
  const g = new THREE.BoxGeometry(Math.hypot(x1 - x0, y1 - y0), t, t);
  g.rotateZ(Math.atan2(y1 - y0, x1 - x0));
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, z);
  return g;
}
function merged(list) { const g = mergeGeometries(list); for (const x of list) x.dispose(); return g; }

/** The painted sheet as a mesh, w x h, centred, its picture cut out by the painting's own outline. */
function paper(art, own) {
  const tex = new THREE.CanvasTexture(sheet(art, 256));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  // unlit: the valley's strong warm light would wash the painting out, and from below a kite is seen against the sun
  const mat = new THREE.MeshBasicMaterial({ map: tex, color: '#f4eee6', alphaTest: 0.5, side: THREE.DoubleSide });
  const geo = new THREE.PlaneGeometry(art.w, art.h);
  own.push(tex, mat, geo);
  const m = new THREE.Mesh(geo, mat);
  m.name = 'Paper';
  return m;
}

const FRAMES = {
  kaku: () => [stick(-0.27, -0.49, -0.27, 0.49), stick(0, -0.49, 0, 0.49), stick(0.27, -0.49, 0.27, 0.49), stick(-0.38, 0.4, 0.38, 0.4), stick(-0.38, 0, 0.38, 0), stick(-0.38, -0.4, 0.38, -0.4),
    stick(-0.38, -0.49, 0.38, 0.49, 0.014), stick(-0.38, 0.49, 0.38, -0.49, 0.014)],
  sao: () => {
    // the bowed spar along the leading edge (the painting's own curve), the spine and two short ribs
    const out = [stick(0, -0.2, 0, 0.22)], b = t => { const u = 1 - t; return [u * u * u * 0.01 + 3 * u * u * t * 0.25 + 3 * u * t * t * 0.75 + t * t * t * 0.99 - 0.5, 0.25 - (u * u * u * 0.2 + 3 * u * u * t * -0.03 + 3 * u * t * t * -0.03 + t * t * t * 0.2)]; };
    for (let i = 0; i < 8; i++) { const p = b(i / 8), q = b((i + 1) / 8); out.push(stick(p[0], p[1] - 0.012, q[0], q[1] - 0.012, 0.022)); }
    out.push(stick(-0.25, -0.13, -0.25, 0.17, 0.014), stick(0.25, -0.13, 0.25, 0.17, 0.014));
    return out;
  },
  bird: () => [stick(0, -0.3, 0, 0.33), stick(0, 0.15, 0.48, 0.06), stick(0, 0.15, -0.48, 0.06), stick(-0.15, -0.32, 0.15, -0.32, 0.014)],
  box: () => {
    const out = [], r = 0.19;
    for (const [x, z] of [[r, 0], [-r, 0], [0, r], [0, -r]]) { const g = new THREE.BoxGeometry(0.022, 1, 0.022); g.translate(x, 0, z); out.push(g); }
    for (const y of [0.34, -0.34]) for (const a of [0, Math.PI / 2]) { const g = new THREE.BoxGeometry(r * 2, 0.016, 0.016); g.rotateY(a); g.translate(0, y, 0); out.push(g); }
    return out;
  },
};

/** The box kite's two paper bands: four sides each, coloured per side so the box reads from any angle. */
function boxBands(own) {
  const r = 0.19, C = [[r, 0], [0, r], [-r, 0], [0, -r]], pos = [], col = [], idx = [];
  const bands = [[0.2, 0.49, [[0.89, 0.24, 0.15], [0.66, 0.15, 0.1]]], [-0.49, -0.2, [[1, 0.79, 0.25], [0.84, 0.58, 0.1]]]];
  for (const [y0, y1, cs] of bands) for (let i = 0; i < 4; i++) {
    const a = C[i], b = C[(i + 1) % 4], c = cs[i % 2], n = pos.length / 3;
    pos.push(a[0], y0, a[1], b[0], y0, b[1], b[0], y1, b[1], a[0], y1, a[1]);
    for (let k = 0; k < 4; k++) col.push(...c);
    idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  own.push(geo, mat);
  const m = new THREE.Mesh(geo, mat);
  m.name = 'Paper';
  return m;
}

/** A short red-and-white ribbon hanging from (x, y): the tails as they lie while the kite is built. */
function ribbonGeo(x, y, len) {
  const g = new THREE.PlaneGeometry(0.05, len);
  g.translate(x, y - len / 2, 0.004);
  return g;
}

/**
 * A kite of KITE_ART (not the diamond, which has a model of its own) as a group with the parts Frame, Paper and Tail.
 * userData.own: what to dispose with the round.
 */
export function buildKite(id) {
  const art = KITE_ART[id], g = new THREE.Group(), own = [];
  const bamboo = new THREE.MeshBasicMaterial({ color: '#9c7a40' });
  const fGeo = merged(FRAMES[id]());
  const frame = new THREE.Mesh(fGeo, bamboo);
  frame.name = 'Frame';
  own.push(bamboo, fGeo);
  const sail = id === 'box' ? boxBands(own) : paper(art, own);
  const tail = new THREE.Group();
  tail.name = 'Tail';
  if (id === 'sao') {
    // the flutes: three bamboo tubes across the spine, the biggest lowest, each with dark open ends
    const tube = new THREE.MeshBasicMaterial({ color: '#c99a52' }), dark = new THREE.MeshBasicMaterial({ color: '#4a2f18' });
    const parts = [], ends = [];
    for (const [y, l, r] of [[0.035, 0.3, 0.036], [0.115, 0.22, 0.03], [0.18, 0.15, 0.024]]) {
      const c = new THREE.CylinderGeometry(r, r, l, 10); c.rotateZ(Math.PI / 2); c.translate(0, y, 0.02 + r); parts.push(c);
      for (const s of [-1, 1]) { const e = new THREE.CylinderGeometry(r * 0.72, r * 0.72, 0.012, 10); e.rotateZ(Math.PI / 2); e.translate(s * (l / 2 + 0.003), y, 0.02 + r); ends.push(e); }
    }
    const a = merged(parts), b = merged(ends);
    tail.add(new THREE.Mesh(a, tube), new THREE.Mesh(b, dark));
    own.push(tube, dark, a, b);
  } else if (id === 'box' || id === 'bird') {
    // the bridle: two lines from the front stick (the spine) to the ring the flying line is tied to
    const mat = new THREE.LineBasicMaterial({ color: '#fffaf0' });
    const z = id === 'box' ? 0.19 : 0.01, y = id === 'box' ? [0.42, -0.3] : [0.24, -0.2];
    const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, y[0], z, 0, 0.06, z + 0.3, 0, 0.06, z + 0.3, 0, y[1], z], 3));
    tail.add(new THREE.LineSegments(geo, mat));
    own.push(mat, geo);
  } else {
    const mat = new THREE.MeshBasicMaterial({ color: '#ee4a2c', side: THREE.DoubleSide });
    const geo = merged(art.tails.map(([x, y, len]) => ribbonGeo(x, y, 0.3 * len)));
    tail.add(new THREE.Mesh(geo, mat));
    own.push(mat, geo);
  }
  g.add(frame, sail, tail);
  g.userData.own = own;
  return g;
}
