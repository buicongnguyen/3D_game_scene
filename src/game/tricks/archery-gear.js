// The archery round's props (docs/RURAL-TRICKS.md): the bamboo bow, the practice arrow, the skin-coloured finger parts that curl
// round the bow's grip and the string on Mika's hands, and the soft dot for the aim arc. All procedural, cheap and merged:
//   bow      one dynamic limb tube (rewritten when the draw changes), one dynamic string tube, one static grip mesh, one bead
//   arrow    one merged geometry shared by every arrow of the pool (tip at the origin, the shaft behind it along -z)
//   fingers  one small merged mesh per hand
// Bow frame: +y up the bow, +z toward the target, +x to the archer's left; the limbs and the string come back toward -z.
import * as THREE from 'three';
import { Kit } from '../../world/archery.js';
import { nockAt } from '../../actors/archer-rig.js';

const V3 = THREE.Vector3;
export const BOW = {
  half: 0.42,          // half the bow's height (a bow of 0.84 m for a kid)
  rings: 21,           // rings along the limb tube
  radial: 6,
  brace: 0.13,         // the string's distance behind the grip with no draw (= STANCE.nockBrace)
  flex: 0.075,         // how much further the limb tips come back at a full draw
  flare: 0.04,         // the recurve: the tips curl forward again
  restX: 0.03, restY: 0.03,   // where the arrow lies, from the bow's centre (left of the grip, on top of it)
  cant: 0.3,           // radians the bow is turned about the arrow's line
};
const SKIN = '#f6c29c';

/** An arrow with the tip at the origin and the shaft behind it (-z), 0.8 long: bamboo, a blunt rubber tip, a nock, three vanes. */
export function arrowGeometry() {
  const k = new Kit(), L = 0.8;
  k.add(new THREE.CylinderGeometry(0.013, 0.013, L, 6), '#ead7a4', 0, 0, -L / 2, Math.PI / 2, 0, 0);
  k.add(new THREE.SphereGeometry(0.024, 8, 6), '#ff7a2a', 0, 0, 0.0);
  k.add(new THREE.CylinderGeometry(0.0185, 0.0165, 0.07, 8), '#ff7a2a', 0, 0, -0.045, Math.PI / 2, 0, 0);
  k.add(new THREE.CylinderGeometry(0.0145, 0.0145, 0.05, 8), '#e8553d', 0, 0, -L + 0.2, Math.PI / 2, 0, 0);          // the cresting band
  k.add(new THREE.CylinderGeometry(0.0175, 0.014, 0.034, 8), '#2b2530', 0, 0, -L + 0.012, Math.PI / 2, 0, 0);         // the nock
  // a vane: a rake-edged trapezoid lying along the shaft (z), standing out from it (local y), then turned round the shaft
  const vane = (color, i) => {
    const r = 0.012, h = 0.03, z0 = -L + 0.04, z1 = -L + 0.19, pts = [[z0, r], [z1, r], [z1 - 0.05, r + h], [z0 + 0.02, r + h]];
    const pos = [], P = t => pos.push(0, t[1], t[0]);
    P(pts[0]); P(pts[1]); P(pts[2]); P(pts[0]); P(pts[2]); P(pts[3]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    g.rotateZ(i * Math.PI * 2 / 3);
    k.add(g, color, 0, 0, 0);
  };
  vane('#fff6e0', 0); vane('#e8553d', 1); vane('#e8553d', 2);
  return k.merge();
}

/** The bamboo bow: returns { root, set(draw), nock (a world-free vector in the bow frame), own: [things to dispose] }. */
export function makeBow() {
  const N = BOW.rings, RAD = BOW.radial, H = BOW.half;
  const pos = new Float32Array(N * RAD * 3), nor = new Float32Array(N * RAD * 3), col = new Float32Array(N * RAD * 3), idx = [];
  for (let r = 0; r < N - 1; r++) for (let a = 0; a < RAD; a++) {
    const a2 = (a + 1) % RAD, i0 = r * RAD + a, i1 = r * RAD + a2, i2 = (r + 1) * RAD + a, i3 = (r + 1) * RAD + a2;
    idx.push(i0, i2, i1, i1, i2, i3);
  }
  // bamboo colour: golden, with a darker node at each fifth and the tips stained
  const C = new THREE.Color();
  const profile = new Float32Array(N);
  for (let r = 0; r < N; r++) {
    const f = Math.abs(r / (N - 1) * 2 - 1);
    profile[r] = (r === 0 || r === N - 1) ? 0.017 : (r === 1 || r === N - 2) ? 0.0105 : 0.0235 * (1 - 0.52 * f ** 1.2);
    const node = [0.3, 0.62, 0.84].some(n => Math.abs(f - n) < 0.045);
    C.set(f > 0.93 ? '#7a4a22' : node ? '#a8741f' : f < 0.12 ? '#c8923a' : '#e0b04e');
    for (let a = 0; a < RAD; a++) { const i = (r * RAD + a) * 3; col[i] = C.r; col[i + 1] = C.g; col[i + 2] = C.b; }
  }
  const g = new THREE.BufferGeometry();
  const pa = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage), na = new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('position', pa); g.setAttribute('normal', na); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(idx);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, emissive: '#4a2a08', emissiveIntensity: 0.22 });
  const limb = new THREE.Mesh(g, mat);
  limb.frustumCulled = false; limb.castShadow = false;

  // the string: a thin tube of 3 points (tip, nock, tip), 4 sides
  const SR = 4, spos = new Float32Array(3 * SR * 3), sidx = [];
  for (let s = 0; s < 2; s++) for (let a = 0; a < SR; a++) {
    const a2 = (a + 1) % SR, i0 = s * SR + a, i1 = s * SR + a2, i2 = (s + 1) * SR + a, i3 = (s + 1) * SR + a2;
    sidx.push(i0, i2, i1, i1, i2, i3);
  }
  const sg = new THREE.BufferGeometry();
  const sp = new THREE.BufferAttribute(spos, 3).setUsage(THREE.DynamicDrawUsage);
  sg.setAttribute('position', sp); sg.setIndex(sidx);
  const smat = new THREE.MeshBasicMaterial({ color: '#fff3d6', side: THREE.DoubleSide });
  const string = new THREE.Mesh(sg, smat);
  string.frustumCulled = false;

  // the grip: a red leather wrap with two dark bands, and the arrow rest (a small block on the left of the top)
  const k = new Kit();
  k.add(new THREE.CylinderGeometry(0.031, 0.031, 0.15, 10), '#c2441f', 0, 0, 0);
  k.add(new THREE.CylinderGeometry(0.0325, 0.0325, 0.012, 10), '#4a2a14', 0, 0.081, 0);
  k.add(new THREE.CylinderGeometry(0.0325, 0.0325, 0.012, 10), '#4a2a14', 0, -0.081, 0);
  k.add(new THREE.CylinderGeometry(0.0325, 0.0325, 0.01, 10), '#f4d98a', 0, 0.035, 0);
  k.add(new THREE.CylinderGeometry(0.0325, 0.0325, 0.01, 10), '#f4d98a', 0, -0.035, 0);
  k.box(0.022, 0.012, 0.05, '#4a2a14', 0.03, 0.062, 0.0);                                                // the arrow rest
  const grip = new THREE.Mesh(k.merge(), mat);
  grip.frustumCulled = false; grip.castShadow = false;
  // the bead on the string where the arrow is nocked
  const bk = new Kit();
  bk.add(new THREE.SphereGeometry(0.0095, 6, 5), '#e8a838', 0, 0, 0);
  const bead = new THREE.Mesh(bk.merge(), mat);
  bead.frustumCulled = false; bead.castShadow = false;

  const root = new THREE.Group();
  root.name = 'archery:bow';
  root.add(limb, string, grip, bead);
  const b = { root, pa, na, sp, bead, nock: new V3(BOW.restX, BOW.restY, -BOW.brace), tip: new V3(), draw: NaN, profile, own: [g, mat, sg, smat, grip.geometry, bead.geometry] };

  /** Bend the bow for a draw (0..1; a little below 0 or above 1 is the rebound): the tips come back, the string's middle further. */
  b.set = draw => {
    if (b.draw === draw) return;
    b.draw = draw;
    const P = pa.array, Nn = na.array, tipZ = BOW.brace + BOW.flare + BOW.flex * draw;
    const zAt = f => -tipZ * Math.abs(f) ** 1.8 + BOW.flare * Math.max(0, (Math.abs(f) - 0.7) / 0.3) ** 2;
    for (let r = 0; r < N; r++) {
      const f = r / (N - 1) * 2 - 1, y = f * H, z = zAt(f), rad = profile[r];
      // the limb's tangent in the y-z plane: the ring's plane stands square to it
      const dz = (zAt(f + 0.01) - zAt(f - 0.01)) / (0.02 * H), len = Math.hypot(1, dz), ty = 1 / len, tz = dz / len;
      for (let a = 0; a < RAD; a++) {
        const ph = a / RAD * Math.PI * 2, ca = Math.cos(ph), sa = Math.sin(ph), i = (r * RAD + a) * 3;
        // (ca along x; sa along the normal of the tangent in the y-z plane: (0, -tz, ty))
        P[i] = ca * rad; P[i + 1] = y - sa * rad * tz; P[i + 2] = z + sa * rad * ty;
        Nn[i] = ca; Nn[i + 1] = -sa * tz; Nn[i + 2] = sa * ty;
      }
    }
    pa.needsUpdate = true; na.needsUpdate = true;
    // the string: tips at the limb ends, the middle at the nock point (the tube's rings face the bow's side)
    const tz0 = zAt(1), nkz = -nockAt(draw), S = sp.array, R = 0.0042;
    const pts = [[0, H, tz0], [BOW.restX * 0, BOW.restY, nkz], [0, -H, tz0]];
    for (let s = 0; s < 3; s++) for (let a = 0; a < SR; a++) {
      const ph = a / SR * Math.PI * 2 + Math.PI / 4, i = (s * SR + a) * 3;
      S[i] = pts[s][0] + Math.cos(ph) * R; S[i + 1] = pts[s][1]; S[i + 2] = pts[s][2] + Math.sin(ph) * R;
    }
    sp.needsUpdate = true;
    b.nock.set(0, BOW.restY, nkz);
    bead.position.copy(b.nock);
    b.tip.set(0, H, tz0);
  };
  b.set(0);
  return b;
}

/** Finger parts of one hand, in the hand bone's own frame (before the rig's fist squash): rings of skin round the grip / the string. */
export function makeFingers(kind, palm, bowSide) {
  // kind 'grip': four fingers round the bow's handle; 'hook': three fingers hooked on the string.
  // palm: the grip point in the hand frame (already squashed). The handle / string runs along the hand's z (thumb up).
  const k = new Kit(), grip = kind === 'grip';
  const R = grip ? 0.038 : 0.0215, tube = grip ? 0.0098 : 0.0085, zs = grip ? [-0.027, -0.009, 0.009, 0.027] : [-0.019, 0, 0.019];
  const arc = grip ? Math.PI * 1.55 : Math.PI * 1.35;
  for (const z of zs) {
    const t = new THREE.TorusGeometry(R, tube, 5, 12, arc);
    // the ring lies in the hand's x-y plane round the grip point; its opening faces the palm side (bowSide: +1 -x.. see rig)
    t.rotateZ(Math.PI / 2 + (bowSide > 0 ? 0 : Math.PI) - arc / 2 + Math.PI);
    k.add(t, SKIN, palm.x, palm.y, palm.z + z);
  }
  if (grip) {
    // the thumb lies over the fingers on the target side of the handle
    k.add(new THREE.CapsuleGeometry(0.0105, 0.04, 3, 6), SKIN, palm.x + bowSide * 0.0, palm.y + 0.0, palm.z - 0.045, Math.PI / 2, 0, 0);
  }
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 });
  const mesh = new THREE.Mesh(k.merge(), mat);
  mesh.frustumCulled = false; mesh.castShadow = false; mesh.name = `archery:${kind}`;
  return { mesh, own: [mesh.geometry, mat] };
}

// ------------------------------------------------------------------------------------------------ the balloon end
// (rules-balloons.js) Four small instanced meshes, no model files: the balloons (a pear-shaped lathe with a knot, a colour per
// instance), a soft white shine on each (it is what makes a coloured ball read as a balloon), the strings, and the sandbags
// (the ones still hanging and the ones falling). Nothing is allocated while they are drawn.
export const BALLOON_COLOURS = ['#ff3d45', '#ff7a1a', '#3fd24e', '#2b6dff', '#a25cff', '#ff5fb0'];
export const BALLOON_GOLD = '#ffc81a';
// the same colours as plain numbers, for the confetti of a pop (fx.burst takes [r, g, b])
export const BALLOON_RGB = [[1, 0.24, 0.27], [1, 0.48, 0.1], [0.25, 0.82, 0.3], [0.17, 0.43, 1], [0.64, 0.36, 1], [1, 0.37, 0.69]];
export const BALLOON_GOLD_RGB = [1, 0.8, 0.15];

/**
 * max: the most balloons up at once. Returns { root, own, draw(S, W, cam, t, fly), clear() }.
 * draw: S the stage (rules-balloons.js), W(u, v, y, out) lane -> world, cam the camera, t seconds (the wobble), fly 0..1 (the
 * end is over: what is left sails away), K the rules' sizes (BAL).
 */
export function makeBalloons(max, K) {
  const root = new THREE.Group();
  root.name = 'archery:balloons';
  // the balloon, radius 1 about its middle: round on top, drawn out below to the knot
  const pts = [];
  for (let i = 0; i <= 14; i++) {
    const a = i / 14 * Math.PI, c = Math.cos(a), s = Math.sin(a);
    pts.push(new THREE.Vector2(Math.max(0.001, s * (c < 0 ? 1 - 0.3 * c * c : 1)), c < 0 ? c * 1.06 : c * 0.98));
  }
  pts.reverse();
  const body = new THREE.LatheGeometry(pts, 18).toNonIndexed();
  body.deleteAttribute('uv');
  {
    // a little darker underneath, so it reads as round whatever the light does
    const p = body.attributes.position, col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) { const k = 0.8 + 0.2 * Math.min(1, Math.max(0, (p.getY(i) + 1) / 1.6)); col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k; }
    body.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  const kb = new Kit();
  kb.parts.push(body);
  kb.add(new THREE.ConeGeometry(0.12, 0.15, 8), '#c4c4c4', 0, -K.knot + 0.02, 0);
  const bGeo = kb.merge();
  const bMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0 });
  // a balloon glows a little with its own colour (thin rubber in daylight): never a dull ball in the shade
  bMat.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += diffuseColor.rgb * 0.3;'); };
  const balloons = new THREE.InstancedMesh(bGeo, bMat, max);
  balloons.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const shGeo = new THREE.SphereGeometry(1, 10, 6);
  const shMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.78, depthWrite: false });
  const shine = new THREE.InstancedMesh(shGeo, shMat, max);
  shine.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const stGeo = new THREE.CylinderGeometry(0.011, 0.011, 1, 5).translate(0, -0.5, 0);
  const stMat = new THREE.MeshBasicMaterial({ color: '#fff6e2' });
  const strings = new THREE.InstancedMesh(stGeo, stMat, max);
  strings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // the sandbag, radius 1: a round sack tied at the neck with a red cord
  const sack = new THREE.LatheGeometry([[0.001, -1], [0.72, -0.94], [1, -0.45], [0.96, 0.05], [0.62, 0.55], [0.3, 0.74], [0.3, 0.84], [0.46, 1.08], [0.001, 1.02]].map(p => new THREE.Vector2(p[0], p[1])), 10).toNonIndexed();
  sack.deleteAttribute('uv');
  {
    const p = sack.attributes.position, col = new Float32Array(p.count * 3), C = new THREE.Color();
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); C.set(y > 0.6 && y < 0.9 ? '#e0412c' : y < -0.5 ? '#b58a4c' : '#dcb878'); col[i * 3] = C.r; col[i * 3 + 1] = C.g; col[i * 3 + 2] = C.b; }
    sack.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  const wMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, emissive: '#3a2408', emissiveIntensity: 0.35 });
  const weights = new THREE.InstancedMesh(sack, wMat, max * 2);
  weights.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (const m of [balloons, shine, strings, weights]) { m.frustumCulled = false; m.castShadow = false; m.count = 0; root.add(m); }
  balloons.name = 'archery:balloon'; weights.name = 'archery:sandbag';
  shine.renderOrder = 2;
  const cols = BALLOON_COLOURS.map(c => new THREE.Color(c)), gold = new THREE.Color(BALLOON_GOLD);
  for (let i = 0; i < max; i++) balloons.setColorAt(i, cols[0]);
  const M = new THREE.Matrix4(), P = new V3(), Sc = new V3(), Q = new THREE.Quaternion(), Q1 = new THREE.Quaternion(), D = new V3(), Rv = new V3(), Uv = new V3();
  const AX = new V3(1, 0, 0), ONE = new THREE.Quaternion();
  const WS = K.weightR * 1.5;                   // the sandbag is drawn a little bigger than it is, so it reads from the line
  const draw = (S, W, cam, t, fly = 0) => {
    let n = 0, nw = 0;
    const B = S.balloons, top = K.ceil + K.over, self = S.spec.selfPop;
    Rv.setFromMatrixColumn(cam.matrixWorld, 0); Uv.setFromMatrixColumn(cam.matrixWorld, 1);
    for (let i = 0; i < B.length && n < max; i++) {
      const b = B[i];
      if (b.state !== 'up') continue;
      // it swells up as it is let go, and shrinks away where it leaves (off the top on Easy, over the cordon, or when the end is over)
      const age = S.t - b.born, grow = age < 0.35 ? 0.3 + 0.7 * (1 - (1 - age / 0.35) ** 2) : 1;
      let k = grow * (1 - fly);
      if (!self && b.y > top - 0.9) k *= Math.max(0, (top - b.y) / 0.9);
      const edge = K.side - Math.abs(b.v);
      if (edge < 0.7) k *= Math.max(0, edge / 0.7);
      if (b.gold) k *= 1 + 0.05 * Math.sin(t * 6 + b.ph);
      const r = b.r * k, a = S.t * 6.283 / K.swayPer + b.ph, lift = fly * fly * 5;
      W(b.u, b.sv, b.sy + lift, P);
      Q.setFromAxisAngle(AX, -0.13 * Math.cos(a));               // it leans the way it bobs
      balloons.setMatrixAt(n, M.compose(P, Q, Sc.set(r, r, r)));
      balloons.setColorAt(n, b.gold ? gold : cols[b.col % cols.length]);
      // the string and the sandbag hang straight down from the knot
      const kn = r * K.knot;
      strings.setMatrixAt(n, M.compose(D.copy(P).setY(P.y - kn * 0.96), ONE, Sc.set(k, K.string * k + 0.02, k)));
      weights.setMatrixAt(nw++, M.compose(D.copy(P).setY(P.y - kn - K.string * k), Q1.setFromAxisAngle(AX, 0.1 * Math.cos(a)), Sc.set(WS * k, WS * k, WS * k)));
      // the shine: a small soft oval on the side toward the camera, up and to the left
      D.copy(cam.position).sub(P).normalize().addScaledVector(Uv, 0.62).addScaledVector(Rv, -0.5).normalize();
      P.addScaledVector(D, r * 1.02);
      const sg = b.gold ? 1.3 : 1;
      shine.setMatrixAt(n, M.compose(P, Q.copy(cam.quaternion).multiply(Q1.setFromAxisAngle(AXZ_, 0.6)), Sc.set(r * 0.13 * sg, r * 0.24 * sg, r * 0.03)));
      n++;
    }
    for (let i = 0; i < S.weights.length && nw < max * 2; i++) {
      const w = S.weights[i];
      if (!w.on) continue;
      W(w.u, w.v, w.y, P);
      weights.setMatrixAt(nw++, M.compose(P, Q1.setFromAxisAngle(AX, w.vy * 0.25), Sc.set(WS, WS, WS)));
    }
    balloons.count = shine.count = strings.count = n;
    weights.count = nw;
    balloons.instanceMatrix.needsUpdate = shine.instanceMatrix.needsUpdate = strings.instanceMatrix.needsUpdate = weights.instanceMatrix.needsUpdate = true;
    if (balloons.instanceColor) balloons.instanceColor.needsUpdate = true;
  };
  const clear = () => { balloons.count = shine.count = strings.count = weights.count = 0; };
  return { root, draw, clear, own: [bGeo, bMat, shGeo, shMat, stGeo, stMat, sack, wMat, balloons, shine, strings, weights] };
}
const AXZ_ = new V3(0, 0, 1);

export function dotTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const x = c.getContext('2d'), gr = x.createRadialGradient(16, 16, 0, 16, 16, 15);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
