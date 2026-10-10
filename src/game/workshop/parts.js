// The Kite workshop's things, made of plain three.js shapes (no model files): motors, propellers, the battery, the
// switch, wire, a spoon and a clothes peg, the kite frame on the bench, the level, and the motor kit the real Star
// Kite carries once it is built. Every thing is ONE merged mesh with its colours (and, on the bench, its light) baked
// into the vertices, so a part is one draw call and looks the same at noon, at night and on the Low tier.
//
// Frame units: the kite frame is about 1.4 wide. Parts stand on y = 0 with "up the screen" along -Z.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SOCKETS, CORNERS, WRONG_PLACES } from './rules.js';

export const COLORS = {
  yellow: '#ffcf33', green: '#3fc45a', blue: '#3d8bff', pink: '#ff6fb1', red: '#f0372e', black: '#2a2a36',
  cw: '#ff8a2a', ccw: '#8a5cf0', steel: '#3a4256', silver: '#cfd6df', brass: '#dcaa48', wood: '#7a4a2a', woodLight: '#a8703f',
  cream: '#fff1d6', sail: '#e2432f', sailDark: '#c93525', felt: '#f3ead7', white: '#ffffff', battery: '#ffd23f',
};

const LIGHT = new THREE.Vector3(0.5, 0.75, 0.45).normalize();
const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), S = new THREE.Vector3(), C = new THREE.Color();

/**
 * One coloured piece: geometry moved to `at` [x, y, z, rx, ry, rz, sx, sy, sz] and painted `hex`.
 * baked: a soft light from the upper right is multiplied in (bench parts, drawn unlit); otherwise the plain colour
 * (the flying kite's kit, lit by the world).
 */
function piece(geo, hex, at = [], baked = true, lo = 0.6) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  if (g === geo) g = geo.clone();
  const [x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1] = at;
  M.compose(P.set(x, y, z), Q.setFromEuler(E.set(rx, ry, rz)), S.set(sx, sy, sz));
  g.applyMatrix4(M);
  if (g.attributes.uv) g.deleteAttribute('uv');
  const n = g.attributes.normal, count = g.attributes.position.count;
  const col = new Float32Array(count * 3);
  C.set(hex);
  for (let i = 0; i < count; i++) {
    let k = 1;
    if (baked) {
      const d = n.getX(i) * LIGHT.x + n.getY(i) * LIGHT.y + n.getZ(i) * LIGHT.z;
      k = lo + (1 - lo) * Math.max(0, d) + 0.12 * Math.max(0, n.getY(i)) - 0.06;
    }
    col[i * 3] = C.r * k; col[i * 3 + 1] = C.g * k; col[i * 3 + 2] = C.b * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (geo.index) geo.dispose?.();
  return g;
}

const cyl = (r0, r1, h, seg = 18) => new THREE.CylinderGeometry(r0, r1, h, seg);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

let BENCH_MAT = null;
/** The one unlit, vertex-coloured material every bench part shares. */
export function benchMaterial() {
  return BENCH_MAT ??= new THREE.MeshBasicMaterial({ name: 'Workshop part', vertexColors: true, side: THREE.DoubleSide });
}

function mesh(pieces, name, mat = benchMaterial()) {
  const g = mergeGeometries(pieces, false);
  for (const p of pieces) p.dispose();
  const m = new THREE.Mesh(g, mat);
  m.name = `workshop:${name}`;
  m.castShadow = false;
  m.receiveShadow = false;
  return m;
}

// ---------------------------------------------------------------------------------------------- bench parts
/** A chunky outrunner motor with a coloured base ring and cap. The propeller sits at y = MOTOR_TOP. */
export const MOTOR_TOP = 0.15;
export function motorPieces(hex, baked = true, seg = 18, k = 1, leads = true) {
  const s = v => v * k;
  return [
    piece(cyl(s(0.09), s(0.096), s(0.03), seg), hex, [0, s(0.015), 0], baked),
    piece(cyl(s(0.07), s(0.076), s(0.08), seg), COLORS.steel, [0, s(0.07), 0], baked),
    piece(cyl(s(0.075), s(0.075), s(0.016), seg), COLORS.silver, [0, s(0.075), 0], baked),
    piece(cyl(s(0.052), s(0.068), s(0.028), seg), hex, [0, s(0.124), 0], baked),
    piece(cyl(s(0.015), s(0.015), s(0.04), 8), COLORS.silver, [0, s(0.15), 0], baked),
    // three bolts on the cap, and its two leads (toward +Z: down the screen on the tray, along the spar once mounted)
    ...[0, 1, 2].map(i => piece(cyl(s(0.009), s(0.009), s(0.008), 6), COLORS.steel, [s(0.036) * Math.sin(i * 2.094), s(0.141), s(0.036) * Math.cos(i * 2.094)], false)),
    ...(leads ? [piece(box(s(0.018), s(0.014), s(0.07)), COLORS.red, [s(-0.016), s(0.012), s(0.118)], baked), piece(box(s(0.018), s(0.014), s(0.07)), COLORS.black, [s(0.016), s(0.012), s(0.118)], baked)] : []),
  ];
}
export function makeMotor(color) { return mesh(motorPieces(COLORS[color] || color), 'motor'); }

/** One propeller blade along +X: tapered, swept and twisted (the leading edge up for its spin). */
function bladeGeometry(sign, len = 0.17, wid = 0.06) {
  const g = new THREE.BoxGeometry(len, 0.012, wid, 8, 1, 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = (p.getX(i) + len / 2) / len;
    const taper = t < 0.75 ? 1 - 0.25 * t : (1 - 0.25 * 0.75) * Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.75) / 0.25, 2)) * 0.75 + 0.25);
    let y = p.getY(i), z = p.getZ(i) * taper;
    const a = sign * (0.62 - 0.44 * t);
    const cy = y * Math.cos(a) - z * Math.sin(a), cz = y * Math.sin(a) + z * Math.cos(a);
    y = cy; z = cz + sign * 0.022 * Math.sin(t * Math.PI);
    p.setXYZ(i, p.getX(i) + len / 2 + 0.02, y, z);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * A two-blade propeller. dir 'cw' spins clockwise seen from above (orange), 'ccw' the other way (violet); a white
 * arrow round the hub shows which. Spin it with rotation.y (clockwise is negative).
 */
export function makeProp(dir) {
  const cw = dir === 'cw', hex = cw ? COLORS.cw : COLORS.ccw, sign = cw ? 1 : -1;
  const parts = [
    piece(bladeGeometry(sign), hex, [0, 0.024, 0]),
    piece(bladeGeometry(sign), hex, [0, 0.024, 0, 0, Math.PI, 0]),
    piece(cyl(0.036, 0.04, 0.034, 14), COLORS.steel, [0, 0.017, 0]),
    piece(cyl(0.02, 0.02, 0.008, 10), hex, [0, 0.038, 0]),
  ];
  // the arrow: most of a ring with a head. A ring laid flat runs counter-clockwise on screen as its angle grows.
  const from = 0.5, sweep = 4.3;
  const ring = new THREE.RingGeometry(0.082, 0.108, 28, 1, from, sweep).rotateX(-Math.PI / 2);
  const end = from + sweep, r = 0.095;
  const head = new THREE.CircleGeometry(0.045, 3).rotateX(-Math.PI / 2);
  // the triangle's point is along +X: turn it to the ring's tangent at its end
  const arrow = [piece(ring, COLORS.white, [0, 0.05, 0], false), piece(head, COLORS.white, [r * Math.cos(end), 0.05, -r * Math.sin(end), 0, end + Math.PI / 2, 0], false)];
  if (cw) for (const a of arrow) a.scale(1, 1, -1);
  parts.push(...arrow);
  return mesh(parts, `prop-${dir}`);
}

/** A fat round battery lying along Z, + (red, with a white plus) up the screen. Half its length is BATTERY_HALF. */
export const BATTERY_HALF = 0.13;
export function batteryPieces(baked = true, k = 1, seg = 16) {
  const s = v => v * k, R = Math.PI / 2;
  return [
    piece(cyl(s(0.062), s(0.062), s(0.2), seg), COLORS.battery, [0, s(0.064), 0, R, 0, 0], baked),
    piece(cyl(s(0.064), s(0.064), s(0.05), seg), COLORS.steel, [0, s(0.064), s(0.05), R, 0, 0], baked),
    piece(cyl(s(0.064), s(0.064), s(0.036), seg), COLORS.red, [0, s(0.064), s(-0.1), R, 0, 0], baked),
    piece(cyl(s(0.024), s(0.024), s(0.02), 10), COLORS.silver, [0, s(0.064), s(-0.128), R, 0, 0], baked),
    piece(cyl(s(0.064), s(0.064), s(0.03), seg), COLORS.black, [0, s(0.064), s(0.115), R, 0, 0], baked),
    // + and - on top
    piece(box(s(0.056), s(0.008), s(0.016)), COLORS.white, [0, s(0.128), s(-0.045)], false),
    piece(box(s(0.016), s(0.008), s(0.056)), COLORS.white, [0, s(0.128), s(-0.045)], false),
    piece(box(s(0.05), s(0.008), s(0.016)), COLORS.white, [0, s(0.13), s(0.05)], false),
  ];
}
export function makeBattery() { return mesh(batteryPieces(), 'battery'); }

/** The switch: a base, and a rocker (its own mesh and material: red off, green on). */
export function makeSwitch() {
  const g = new THREE.Group();
  g.name = 'workshop:switch';
  g.add(mesh([
    piece(box(0.12, 0.036, 0.15), COLORS.steel, [0, 0.018, 0]),
    piece(box(0.094, 0.01, 0.124), COLORS.silver, [0, 0.04, 0]),
  ], 'switch-base'));
  const mat = new THREE.MeshBasicMaterial({ name: 'Workshop rocker', vertexColors: true, color: COLORS.red });
  const rocker = mesh([piece(box(0.058, 0.034, 0.09), '#ffffff', [0, 0, 0])], 'switch-rocker', mat);
  rocker.position.y = 0.058;
  rocker.rotation.x = 0.32;      // off: the near end up
  g.add(rocker);
  g.userData.rocker = rocker;
  return g;
}

export function makeWireCoil() {
  const R = Math.PI / 2, t = (r, tube) => new THREE.TorusGeometry(r, tube, 7, 22);
  return mesh([
    piece(t(0.088, 0.017), COLORS.red, [0, 0.018, 0, R, 0, 0]),
    piece(t(0.055, 0.017), COLORS.yellow, [0, 0.018, 0, R, 0, 0]),
    piece(t(0.074, 0.017), COLORS.blue, [0, 0.048, 0, R, 0, 0]),
    piece(cyl(0.012, 0.012, 0.09, 6), COLORS.red, [0.11, 0.018, 0.02, R, 0, 0.5]),
    piece(cyl(0.016, 0.016, 0.03, 8), COLORS.silver, [0.128, 0.018, -0.03, R, 0, 0.5]),
  ], 'wire');
}

export function makeSpoon() {
  return mesh([
    piece(new THREE.SphereGeometry(1, 14, 8), COLORS.silver, [0, 0.018, -0.07, 0, 0, 0, 0.055, 0.018, 0.072]),
    piece(new THREE.SphereGeometry(1, 12, 6), '#9aa6b4', [0, 0.031, -0.07, 0, 0, 0, 0.038, 0.005, 0.052], false),
    piece(box(0.024, 0.012, 0.17), COLORS.silver, [0, 0.012, 0.05]),
    piece(cyl(0.02, 0.02, 0.012, 12), COLORS.silver, [0, 0.012, 0.135]),
  ], 'spoon');
}

export function makePeg() {
  return mesh([
    piece(box(0.026, 0.024, 0.2), '#e7bd7c', [-0.018, 0.012, 0, 0, 0.09, 0]),
    piece(box(0.026, 0.024, 0.2), '#d9a965', [0.018, 0.012, 0, 0, -0.09, 0]),
    piece(new THREE.TorusGeometry(0.03, 0.008, 6, 14), COLORS.silver, [0, 0.02, 0.01, 0, Math.PI / 2, 0]),
    piece(box(0.07, 0.008, 0.012), COLORS.silver, [0, 0.03, 0.01]),
  ], 'peg');
}

/** The kite frame lying flat with its paper sail under it: spine, two crossed spars, brass sockets, the battery rail. */
export const FRAME = { socketY: 0.04, railY: 0.036, rail: [-0.36, 0.16], seat: { x: 0, y: 0.47 }, lug: { x: 0, y: -0.64 }, top: 0.7, bottom: -0.84, half: 0.7 };
export function makeFrame() {
  const R = -Math.PI / 2, parts = [];
  const flat = (pts, hex, y) => {
    const sh = new THREE.Shape(pts.map(([x, v]) => new THREE.Vector2(x, v)));
    parts.push(piece(new THREE.ShapeGeometry(sh).rotateX(R), hex, [0, y, 0], false));
  };
  const nose = [0, 0.68], tail = [0, -0.72], l = [-0.64, 0.1], r = [0.64, 0.1];
  flat([nose, r, tail, l], COLORS.cream, 0.002);
  const k = 0.9, cy = 0.02, sc = ([x, v]) => [x * k, cy + (v - cy) * k];
  flat([sc(nose), sc(r), sc(tail)], COLORS.sail, 0.004);
  flat([sc(nose), sc(tail), sc(l)], COLORS.sailDark, 0.004);
  // the tail: a cord and two paper bows
  parts.push(piece(box(0.012, 0.006, 0.16), '#8a6a4a', [0.02, 0.004, 0.78, 0, 0.25, 0]));
  for (const [x, v, hex] of [[0.015, -0.76, COLORS.brass], [0.04, -0.82, COLORS.cream]]) {
    flat([[x, v], [x - 0.07, v + 0.035], [x - 0.07, v - 0.035]], hex, 0.006);
    flat([[x, v], [x + 0.07, v + 0.035], [x + 0.07, v - 0.035]], hex, 0.006);
  }
  // spine and spars
  parts.push(piece(box(0.04, 0.028, 1.36), COLORS.wood, [0, 0.016, 0.02]));
  for (const c of CORNERS) {
    const s = SOCKETS[c], len = Math.hypot(s.x, s.y);
    parts.push(piece(box(0.034, 0.026, len), COLORS.woodLight, [s.x / 2, 0.018, -s.y / 2, 0, Math.atan2(s.x, -s.y) + Math.PI, 0]));
    parts.push(piece(cyl(0.082, 0.09, 0.016, 20), COLORS.brass, [s.x, 0.032, -s.y]));
    parts.push(piece(new THREE.TorusGeometry(0.112, 0.012, 6, 26), COLORS.brass, [s.x, 0.03, -s.y, Math.PI / 2, 0, 0]));
  }
  // hub, nose cap, tail lug, the switch's seat and the battery rail with its ticks
  parts.push(piece(cyl(0.06, 0.066, 0.016, 16), COLORS.brass, [0, 0.036, 0]));
  parts.push(piece(cyl(0.035, 0.04, 0.02, 12), COLORS.brass, [0, 0.03, -WRONG_PLACES.nose.y - 0.06]));
  parts.push(piece(cyl(0.04, 0.045, 0.02, 12), COLORS.brass, [0, 0.03, -FRAME.lug.y]));
  parts.push(piece(box(0.14, 0.008, 0.17), '#5a3a22', [0, 0.034, -FRAME.seat.y]));
  const [r0, r1] = FRAME.rail;
  parts.push(piece(box(0.085, 0.008, r1 - r0 + 0.3), '#f1d9a0', [0, 0.034, -(r0 + r1) / 2]));
  for (let v = r0 - 0.1; v <= r1 + 0.101; v += 0.1) parts.push(piece(box(0.085, 0.004, 0.008), '#b08a4a', [0, 0.04, -v], false));
  return mesh(parts, 'frame');
}

/** The bench: planks (a small drawn texture) under everything, and the tray's felt with a wooden rim. */
export function plankTexture() {
  const n = 256, c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d');
  g.fillStyle = '#c99a62'; g.fillRect(0, 0, n, n);
  for (let i = 0; i < 4; i++) {
    g.fillStyle = ['#c4935b', '#cfa169', '#bf8d55', '#cb9c64'][i];
    g.fillRect(0, i * 64, n, 62);
    g.strokeStyle = 'rgba(90,55,25,.22)'; g.lineWidth = 1.2;
    for (let k = 0; k < 5; k++) {
      const y = i * 64 + 8 + k * 11 + (i * 3 % 5);
      g.beginPath(); g.moveTo(0, y);
      for (let x = 0; x <= n; x += 32) g.lineTo(x, y + Math.sin((x + i * 40 + k * 17) * 0.05) * 2.2);
      g.stroke();
    }
    g.fillStyle = 'rgba(70,40,15,.5)'; g.fillRect(0, i * 64 + 62, n, 2);
    g.fillRect((i * 97 + 40) % n, i * 64, 2, 62);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** A tray (w x h, frame units) with a rim; the felt is at y = 0.012. */
export function makeTray(w, h) {
  const rim = 0.03, hw = w / 2, hh = h / 2;
  return mesh([
    piece(box(w, 0.012, h), COLORS.felt, [0, 0.006, 0]),
    piece(box(w + rim * 2, 0.04, rim), '#8a5a34', [0, 0.02, -hh - rim / 2]),
    piece(box(w + rim * 2, 0.04, rim), '#8a5a34', [0, 0.02, hh + rim / 2]),
    piece(box(rim, 0.04, h), '#9a683e', [-hw - rim / 2, 0.02, 0]),
    piece(box(rim, 0.04, h), '#9a683e', [hw + rim / 2, 0.02, 0]),
  ], 'tray');
}

/** The spirit level: a vial along Z with two marks (their own mesh, so they can turn green) and a bubble. */
export const LEVEL = { half: 0.17, travel: 0.11 };
export function makeLevel() {
  const g = new THREE.Group();
  g.name = 'workshop:level';
  const R = Math.PI / 2;
  g.add(mesh([
    piece(box(0.1, 0.02, LEVEL.half * 2 + 0.08), '#5a3a22', [0, 0.01, 0]),
    piece(cyl(0.034, 0.034, LEVEL.half * 2, 14), '#c9f08a', [0, 0.05, 0, R, 0, 0], true, 0.75),
    piece(new THREE.SphereGeometry(0.034, 12, 8), '#c9f08a', [0, 0.05, -LEVEL.half], true, 0.75),
    piece(new THREE.SphereGeometry(0.034, 12, 8), '#c9f08a', [0, 0.05, LEVEL.half], true, 0.75),
  ], 'level-vial'));
  const markMat = new THREE.MeshBasicMaterial({ name: 'Workshop marks', color: '#3a2a1a' });
  const marks = new THREE.Mesh(mergeGeometries([box(0.085, 0.006, 0.01).translate(0, 0.086, -0.04), box(0.085, 0.006, 0.01).translate(0, 0.086, 0.04)]), markMat);
  marks.name = 'workshop:level-marks';
  g.add(marks);
  const bubble = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshBasicMaterial({ name: 'Workshop bubble', color: '#ffffff' }));
  bubble.name = 'workshop:level-bubble';
  bubble.scale.set(0.026, 0.012, 0.032);
  bubble.position.y = 0.08;
  g.add(bubble);
  g.userData.bubble = bubble;
  g.userData.marks = marks;
  return g;
}

/** A plug or socket for the wiring step: a coloured button with a white collar (sockets are rings). */
export function makePlug(color, socket) {
  const hex = COLORS[color] || color;
  if (socket) {
    return mesh([
      piece(cyl(0.052, 0.056, 0.016, 18), COLORS.white, [0, 0.008, 0], false),
      piece(cyl(0.04, 0.04, 0.02, 18), hex, [0, 0.012, 0], false),
      piece(cyl(0.017, 0.017, 0.024, 10), '#1c1c24', [0, 0.014, 0], false),
    ], 'socket');
  }
  return mesh([
    piece(cyl(0.052, 0.056, 0.016, 18), COLORS.white, [0, 0.008, 0], false),
    piece(new THREE.SphereGeometry(0.04, 14, 8), hex, [0, 0.022, 0, 0, 0, 0, 1, 0.7, 1]),
  ], 'plug');
}

/** A wire along `pts` (THREE.Vector3[], the parent's space). */
export function makeWire(pts, color, radius = 0.015, seg = 20) {
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
  const g = new THREE.TubeGeometry(curve, Math.max(4, seg), radius, 6, false);
  const m = mesh([piece(g, COLORS[color] || color, [], true, 0.72)], `wire-${color}`);
  return m;
}

/** A soft round shadow to sit under a part. */
let SHADOW = null;
export function makeShadow(r = 0.12) {
  SHADOW ??= {
    geo: new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2),
    mat: new THREE.MeshBasicMaterial({ name: 'Workshop shadow', color: '#3a2410', transparent: true, opacity: 0.22, depthWrite: false }),
  };
  const m = new THREE.Mesh(SHADOW.geo, SHADOW.mat);
  m.name = 'workshop:shadow';
  m.scale.set(r, 1, r);
  m.renderOrder = 1;
  return m;
}

/** A highlight ring (selection, focus, a socket waiting for its part). */
export function makeRing(hex = '#ffffff', r0 = 0.11, r1 = 0.14) {
  const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ name: 'Workshop ring', color: hex, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false }));
  m.name = 'workshop:ring';
  m.renderOrder = 5;
  return m;
}

/** A blurred propeller disc for the spin-up (drawn once, shared). */
export function makeBlurDisc(hex) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(0.19, 24).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ name: 'Workshop disc', color: hex, transparent: true, opacity: 0, depthWrite: false }));
  m.name = 'workshop:disc';
  m.renderOrder = 3;
  return m;
}

// ---------------------------------------------------------------------------------------------- on the real kite
/**
 * The kit the Star Kite carries once it is built, in the kite model's own space (art: rotors at x ±0.64, y 0.72,
 * z ±0.56): a motor pod with a coloured cap under each rotor, the battery on the mast and a wire to each pod.
 * One merged mesh, lit by the world. low: fewer sides and no wires' sag (the Low tier).
 */
export function makeKiteKit(low = false) {
  const seg = low ? 8 : 14, parts = [];
  const rotors = [[0.64, 0.56, 'yellow'], [-0.64, 0.56, 'green'], [0.64, -0.56, 'blue'], [-0.64, -0.56, 'pink']];
  for (const [x, z, color] of rotors) {
    // upside down under the rotor hub: the coloured cap looks at the ground, where Mika and the camera are
    parts.push(piece(cyl(0.062, 0.068, 0.085, seg), COLORS.steel, [x, 0.655, z], false));
    parts.push(piece(cyl(0.076, 0.058, 0.034, seg), COLORS[color], [x, 0.596, z], false));
    // a collar in the same colour just under the blades: it shows from above, between them
    parts.push(piece(cyl(0.082, 0.082, 0.016, seg), COLORS[color], [x, 0.702, z], false));
  }
  // the battery across the mast, + to the right
  const by = 0.6, R = Math.PI / 2;
  parts.push(piece(cyl(0.062, 0.062, 0.2, seg), COLORS.battery, [0, by, -0.02, 0, 0, R], false));
  parts.push(piece(cyl(0.064, 0.064, 0.04, seg), COLORS.red, [0.11, by, -0.02, 0, 0, R], false));
  parts.push(piece(cyl(0.064, 0.064, 0.034, seg), COLORS.black, [-0.105, by, -0.02, 0, 0, R], false));
  parts.push(piece(box(0.05, 0.02, 0.06), COLORS.steel, [0, by + 0.055, -0.02], false));
  parts.push(piece(new THREE.SphereGeometry(0.016, 8, 6), '#7dff8a', [0, by + 0.07, -0.02], false));
  for (const [x, z, color] of rotors) {
    const a = new THREE.Vector3(Math.sign(x) * 0.06, by + 0.02, -0.02), b = new THREE.Vector3(x * 0.93, 0.64, z * 0.93);
    const mid = a.clone().lerp(b, 0.5); mid.y -= low ? 0 : 0.05;
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    parts.push(piece(new THREE.TubeGeometry(curve, low ? 3 : 8, 0.016, low ? 4 : 5, false), COLORS[color], [], false));
  }
  const mat = new THREE.MeshStandardMaterial({ name: 'Kite motors', vertexColors: true, roughness: 0.5, metalness: 0.1 });
  const m = mesh(parts, 'kite-kit', mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** The battery gauge's little picture, drawn once (a data URL for an <img>). */
export function batteryIcon() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.lineJoin = 'round';
  g.fillStyle = '#3a4256'; g.beginPath(); g.roundRect(8, 18, 44, 28, 7); g.fill();
  g.fillStyle = '#3a4256'; g.beginPath(); g.roundRect(52, 26, 6, 12, 2); g.fill();
  g.fillStyle = '#ffd23f'; g.beginPath(); g.roundRect(12, 22, 36, 20, 4); g.fill();
  g.fillStyle = '#3a2410'; g.beginPath(); g.moveTo(33, 23); g.lineTo(23, 34); g.lineTo(30, 34); g.lineTo(27, 41); g.lineTo(38, 30); g.lineTo(31, 30); g.closePath(); g.fill();
  return c.toDataURL('image/png');
}
