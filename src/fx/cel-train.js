import * as THREE from 'three';
import { GlowLines, Draw } from './cel-lines.js';
import { GlowPoints, KIND, U } from './cel-sprites.js';

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const X = v3(1, 0, 0), Y = v3(0, 1, 0), Z = v3(0, 0, 1);

const GOLD = [2.2, 1.55, 0.7];
const WHITE = [1.9, 1.8, 1.55];
const BLUE = [0.9, 1.35, 2.2];
const ROSE = [2.4, 1.0, 1.5];
const LANTERNS = [[2.4, 0.9, 0.5], [2.4, 1.7, 0.4], [1.2, 2.0, 0.7], [0.8, 1.3, 2.4], [2.3, 0.8, 1.6]];

const QUAD_VS = /* glsl */`
  attribute vec4 aCol;
  attribute float aRound;
  varying vec2 vUv;
  varying vec4 vCol;
  varying float vRound, vFace;
  void main() {
    vUv = uv; vCol = aCol; vRound = aRound;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    // panes on the far side of the car are dimmed so the near windows read cleanly
    vFace = dot(normalize(normalMatrix * normal), normalize(-mv.xyz));
    gl_Position = projectionMatrix * mv;
  }`;
const QUAD_FS = /* glsl */`
  uniform float uOpacity, uTime;
  varying vec2 vUv;
  varying vec4 vCol;
  varying float vRound, vFace;
  void main() {
    vec2 q = vUv * 2.0 - 1.0;
    float a = vRound > 0.5 ? exp(-dot(q, q) * 2.2) * smoothstep(1.0, 0.55, length(q)) : smoothstep(1.0, 0.7, abs(q.x)) * smoothstep(1.0, 0.7, abs(q.y));
    float fl = 0.9 + 0.1 * sin(uTime * 7.0 + vCol.a * 30.0);
    a *= uOpacity * fl * (0.18 + 0.82 * smoothstep(-0.15, 0.35, vFace));
    if (a < 0.003) discard;
    gl_FragColor = vec4(vCol.rgb, a);
  }`;

/** Filled glowing panes (windows, faces): quads with a soft box or radial profile. */
function glowQuads(list) {
  const geos = list.map(({ c, w, h, n, color, round }) => {
    const g = new THREE.PlaneGeometry(w, h);
    const q = new THREE.Quaternion().setFromUnitVectors(Z, n.clone().normalize());
    g.applyQuaternion(q);
    g.translate(c.x, c.y, c.z);
    const cnt = g.attributes.position.count;
    g.setAttribute('aCol', new THREE.Float32BufferAttribute(Array.from({ length: cnt }, () => [...color, Math.random()]).flat(), 4));
    g.setAttribute('aRound', new THREE.Float32BufferAttribute(new Array(cnt).fill(round ? 1 : 0), 1));
    return g;
  });
  const pos = [], uv = [], col = [], rnd = [], idx = [], nrm = [];
  let base = 0;
  for (const g of geos) {
    pos.push(...g.attributes.position.array); uv.push(...g.attributes.uv.array); nrm.push(...g.attributes.normal.array);
    col.push(...g.attributes.aCol.array); rnd.push(...g.attributes.aRound.array);
    for (const i of g.index.array) idx.push(i + base);
    base += g.attributes.position.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('aCol', new THREE.Float32BufferAttribute(col, 4));
  geo.setAttribute('aRound', new THREE.Float32BufferAttribute(rnd, 1));
  geo.setIndex(idx);
  const uniforms = { uOpacity: { value: 1 }, uTime: U.uTime };
  const mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
    uniforms, vertexShader: QUAD_VS, fragmentShader: QUAD_FS,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
  mesh.renderOrder = 6;
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}

/**
 * The Star Train: Kobo and two festival coaches drawn in starlight (glowing strokes, star nodes, lit
 * windows), with Sora smiling and waving from a coach window. Built once in local space (x forward,
 * y up, z right); `scale` blows it up to read from the valley floor.
 */
export class SkyTrain {
  constructor(scale = 3.2) {
    this.S = scale;
    this.group = new THREE.Group();
    this.group.name = 'cel:skytrain';
    this.inner = new THREE.Group();
    this.inner.scale.setScalar(scale);
    this.group.add(this.inner);
    this.group.visible = false;
    const L = [], stars = [], panes = [];
    this.wheels = [];
    this.node = (p, size = 0.5, color = WHITE) => stars.push({ x: p.x, y: p.y, z: p.z, size, color });
    const box = (x0, x1, y0, y1, z0, z1, c = GOLD, w = 1) => {
      Draw.box(L, v3(x0, y0, z0), v3(x1, y1, z1), c, w);
      for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) this.node(v3(x, y, z), 0.35);
    };

    // ---------------- Kobo (x -3.6 .. 3.6)
    box(-3.4, 3.3, 0.75, 1.05, -1.25, 1.25, GOLD, 0.8);
    // boiler
    const bx0 = -1.3, bx1 = 2.9, by = 2.05, br = 0.85;
    for (const x of [bx0, 0.6, 1.9, bx1]) Draw.circle(L, v3(x, by, 0), br, Z, Y, 18, GOLD, x === bx0 || x === bx1 ? 1 : 0.6);
    for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2, Math.PI / 4, -Math.PI / 4]) {
      const off = v3(0, Math.sin(a) * br, Math.cos(a) * br);
      Draw.line(L, v3(bx0, by, 0).add(off), v3(bx1, by, 0).add(off), GOLD, a === Math.PI / 2 ? 1 : 0.7);
    }
    Draw.circle(L, v3(2.97, by, 0), 0.52, Z, Y, 14, WHITE, 0.8);
    this.node(v3(2.99, by, 0), 0.7, WHITE);
    // chimney with a flared crown
    Draw.circle(L, v3(2.3, 2.85, 0), 0.26, X, Z, 10, GOLD, 0.8);
    Draw.circle(L, v3(2.3, 3.7, 0), 0.34, X, Z, 12, GOLD, 0.8);
    Draw.circle(L, v3(2.3, 3.92, 0), 0.44, X, Z, 12, WHITE, 1);
    for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      Draw.line(L, v3(2.3 + Math.cos(a) * 0.26, 2.85, Math.sin(a) * 0.26), v3(2.3 + Math.cos(a) * 0.34, 3.7, Math.sin(a) * 0.34), GOLD, 0.7);
      Draw.line(L, v3(2.3 + Math.cos(a) * 0.34, 3.7, Math.sin(a) * 0.34), v3(2.3 + Math.cos(a) * 0.44, 3.92, Math.sin(a) * 0.44), GOLD, 0.7);
    }
    this.chimney = v3(2.3, 4.05, 0);
    // steam dome and sand dome
    for (const [x, r] of [[0.9, 0.36], [-0.3, 0.3]]) {
      Draw.circle(L, v3(x, 2.85, 0), r, X, Z, 10, GOLD, 0.6);
      Draw.circle(L, v3(x, 2.85, 0), r, X, Y, 8, GOLD, 0.7, 0, Math.PI);
      Draw.circle(L, v3(x, 2.85, 0), r, Z, Y, 8, GOLD, 0.7, 0, Math.PI);
      this.node(v3(x, 2.85 + r, 0), 0.5);
    }
    // cab with a curved roof and windows
    box(-3.3, -1.3, 1.05, 3.45, -1.3, 1.3, GOLD, 1);
    this.roof(L, -3.45, -1.15, 3.45, 1.45, 0.4, [0, 0.75, -0.75]);
    for (const z of [-1.31, 1.31]) {
      Draw.poly(L, [v3(-2.95, 2.25, z), v3(-1.7, 2.25, z), v3(-1.7, 3.1, z), v3(-2.95, 3.1, z)], WHITE, 0.6, true);
      panes.push({ c: v3(-2.32, 2.67, z), w: 1.2, h: 0.8, n: v3(0, 0, Math.sign(z)), color: [1.4, 0.8, 0.35] });
    }
    for (const z of [-0.6, 0.6]) Draw.circle(L, v3(-1.28, 2.9, z), 0.26, Z, Y, 10, WHITE, 0.6);
    // wheels: three drivers a side and a pony truck
    for (const z of [-1.18, 1.18]) {
      for (const x of [-1.9, -0.45, 1.0]) this.wheel(L, v3(x, 0.64, z), 0.62);
      this.wheel(L, v3(2.55, 0.42, z), 0.4);
      Draw.line(L, v3(-1.9, 0.64, z * 1.08), v3(1.0, 0.64, z * 1.08), BLUE, 0.7);
    }
    // cow-catcher
    for (const z of [-1.1, -0.4, 0.4, 1.1]) Draw.line(L, v3(3.3, 0.95, z), v3(3.95, 0.15, z * 0.35), GOLD, 0.6);
    Draw.line(L, v3(3.95, 0.15, -0.4), v3(3.95, 0.15, 0.4), GOLD, 0.6);
    // headlamp
    this.headlamp = v3(3.1, 3.05, 0);
    Draw.circle(L, this.headlamp, 0.2, Z, Y, 8, WHITE, 0.8);
    this.node(this.headlamp, 1.6, [2.6, 2.2, 1.4]);

    // ---------------- coaches
    const coach = (cx, withSora) => {
      box(cx - 4.6, cx + 4.6, 0.95, 3.15, -1.4, 1.4, GOLD, 1);
      this.roof(L, cx - 4.75, cx + 4.75, 3.15, 1.52, 0.62, [0, 0.8, -0.8]);
      // festival lanterns along the eaves
      for (const z of [-1.45, 1.45]) for (let i = 0; i <= 8; i++) this.node(v3(cx - 4.4 + i * 1.1, 3.25, z), 0.42, LANTERNS[i % LANTERNS.length]);
      // windows
      const wx = [-3.5, -1.75, 0, 1.75, 3.5];
      for (const z of [-1.41, 1.41]) wx.forEach(x => {
        const soraHere = withSora && Math.abs(x - withSora.x) < 0.1 && Math.sign(z) === withSora.side;
        Draw.poly(L, [v3(cx + x - 0.6, 1.85, z), v3(cx + x + 0.6, 1.85, z), v3(cx + x + 0.6, 2.8, z), v3(cx + x - 0.6, 2.8, z)], WHITE, 0.55, true);
        panes.push({ c: v3(cx + x, 2.32, z), w: 1.3, h: 1.05, n: v3(0, 0, Math.sign(z)), color: soraHere ? [1.0, 0.55, 0.45] : [1.5, 0.95, 0.4] });
      });
      // bogies
      for (const z of [-1.22, 1.22]) for (const bx of [-3.1, 3.1]) {
        for (const d of [-0.72, 0.72]) this.wheel(L, v3(cx + bx + d, 0.44, z), 0.42);
        Draw.line(L, v3(cx + bx - 1.2, 0.62, z * 1.06), v3(cx + bx + 1.2, 0.62, z * 1.06), BLUE, 0.6);
      }
    };
    const c1 = -9.6, c2 = -20.4;
    this.soraSide = 1;
    coach(c1, { x: -1.75, side: 1 });
    coach(c2, null);
    // couplers
    for (const [a, b] of [[-3.4, c1 + 4.6], [c1 - 4.6, c2 + 4.6]]) Draw.line(L, v3(a, 1.0, 0), v3(b, 1.0, 0), BLUE, 0.7);

    this.lines = new GlowLines(L, { width: 0.16, minPx: 1.7, shimmer: 0.6 });
    this.inner.add(this.lines.mesh);
    // wheel spokes live in their own small stroke set, rewritten every frame as the wheels turn
    const spokeSegs = [];
    for (const w of this.wheels) for (let k = 0; k < 3; k++) spokeSegs.push({ a: w.c.clone(), b: w.c.clone(), color: BLUE, w: 0.55 });
    this.spokes = new GlowLines(spokeSegs, { width: 0.16, minPx: 1.4, shimmer: 0 });
    this.inner.add(this.spokes.mesh);
    this.stars = new GlowPoints(stars, { kind: KIND.SPARK, flicker: 0.35, sizeK: scale });
    this.inner.add(this.stars.points);
    const q = glowQuads(panes);
    this.panes = q;
    this.inner.add(q.mesh);
    this.buildSora(c1 - 1.75, 1);
    this.angle = 0;
  }

  /** Curved roof: end arcs through (±zHalf, yEdge) rising `rise` to the ridge, plus lengthwise lines at z = ks. */
  roof(L, x0, x1, yEdge, zHalf, rise, ks) {
    const R = (zHalf * zHalf + rise * rise) / (2 * rise), cy = yEdge + rise - R;
    const a0 = Math.acos(zHalf / R);
    for (const x of [x0, x1]) Draw.circle(L, v3(x, cy, 0), R, Z, Y, 10, WHITE, 0.9, a0, Math.PI - a0);
    for (const k of ks) {
      const y = cy + Math.sqrt(R * R - k * k);
      Draw.line(L, v3(x0, y, k), v3(x1, y, k), WHITE, k === 0 ? 0.8 : 0.5);
    }
    this.node(v3(x0, yEdge + rise, 0), 0.45);
    this.node(v3(x1, yEdge + rise, 0), 0.45);
  }

  wheel(L, c, r) {
    Draw.circle(L, c, r, X, Y, 14, BLUE, 0.8);
    this.wheels.push({ c, r });
    this.node(c, 0.3, BLUE);
  }

  /** Sora, leaning out of a coach window: a glowing face with a bun, closed happy eyes, a smile and a waving arm. */
  buildSora(x, side) {
    const K = 1.3;                         // she is drawn a little larger than life so she reads from the ground
    this.soraK = K;
    const z = side * 1.62, n = v3(0, 0, side);
    const head = v3(x, 2.9, z + side * 0.05);
    this.soraHead = head;
    const R = 0.4 * K;
    const inPlane = (dx, dy, dz = 0) => v3(head.x + dx * K, head.y + dy * K, head.z + side * dz);
    // filled "sticker" shapes (normal blending) so her face reads as a face, not a wireframe
    this.soraFills = [];
    const fill = (geo, color, at, dz, order, opacity = 0.95) => {
      if (side < 0) geo.rotateY(Math.PI);
      geo.translate(at.x, at.y, at.z + side * dz);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(...color), transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      m.renderOrder = order;
      m.userData.opacity = opacity;
      this.inner.add(m);
      this.soraFills.push(m);
      return m;
    };
    const SKIN = [1.35, 1.0, 0.82], HAIR = [1.1, 1.05, 1.3], SHAWL = [1.35, 0.5, 0.75];
    const shawl = new THREE.Shape();
    [[-0.58, -1.0], [-0.44, -0.5], [-0.14, -0.36], [0.14, -0.36], [0.44, -0.5], [0.58, -1.0]].forEach(([a, b], i) => (i ? shawl.lineTo(a * K, b * K) : shawl.moveTo(a * K, b * K)));
    fill(new THREE.ShapeGeometry(shawl), SHAWL, head, 0.0, 8);
    fill(new THREE.CircleGeometry(0.17 * K, 20), HAIR, inPlane(0.05, 0.54), 0.0, 8);
    fill(new THREE.CircleGeometry(R, 32), SKIN, head, 0.01, 8);
    fill(new THREE.RingGeometry(R * 0.62, R * 1.04, 28, 1, Math.PI * 0.08, Math.PI * 0.84), HAIR, head, 0.02, 9);
    for (const ex of [-0.23, 0.23]) fill(new THREE.CircleGeometry(0.075 * K, 16), [1.5, 0.45, 0.6], inPlane(ex, -0.09), 0.03, 9, 0.75);
    this.soraHand = fill(new THREE.CircleGeometry(0.1 * K, 16), SKIN, v3(0, 0, 0), 0.0, 9);
    // dark features: closed happy eyes and a wide smile
    const F = [], DARK = [0.42, 0.07, 0.16];
    for (const ex of [-0.15, 0.15]) Draw.circle(F, inPlane(ex, 0.04, 0.04), 0.075 * K, X, Y, 8, DARK, 1, 0, Math.PI);
    Draw.circle(F, inPlane(0, -0.03, 0.04), 0.18 * K, X, Y, 10, DARK, 1, Math.PI * 1.18, Math.PI * 1.82);
    const feat = new GlowLines(F, { width: 0.09, minPx: 1.2, shimmer: 0, solid: true, renderOrder: 10 });
    this.inner.add(feat.mesh);
    // her glowing outline
    const L = [];
    Draw.circle(L, head, R * 1.03, X, Y, 24, ROSE, 1.0);
    Draw.circle(L, inPlane(0.05, 0.54), 0.18 * K, X, Y, 12, ROSE, 0.8);
    Draw.poly(L, [inPlane(-0.58, -1.0), inPlane(-0.44, -0.5), inPlane(-0.14, -0.36), inPlane(0.14, -0.36), inPlane(0.44, -0.5), inPlane(0.58, -1.0)], ROSE, 0.9);
    const sora = new GlowLines(L, { width: 0.14, minPx: 1.7, shimmer: 0.2, renderOrder: 10 });
    this.inner.add(sora.mesh);
    const q = glowQuads([{ c: head.clone().addScaledVector(n, -0.02), w: 2.2 * K, h: 2.2 * K, n, color: [1.2, 0.55, 0.7], round: true }]);
    q.mesh.renderOrder = 7;
    this.inner.add(q.mesh);
    this.soraFill = q;
    this.soraLines = sora;
    this.soraFeat = feat;
    // waving arm: shoulder -> elbow -> hand (+ fingers)
    this.shoulder = inPlane(0.45, -0.55);
    const armSegs = [];
    for (let k = 0; k < 8; k++) armSegs.push({ a: head.clone(), b: head.clone(), color: ROSE, w: 0.9 });
    this.arm = new GlowLines(armSegs, { width: 0.16, minPx: 1.7, shimmer: 0, renderOrder: 10 });
    this.inner.add(this.arm.mesh);
    this.soraSideN = n;
    // a target for close-ups
    this.sora = new THREE.Object3D();
    this.sora.position.copy(head);
    this.inner.add(this.sora);
  }

  /** Wheels turn with distance travelled; Sora waves. */
  animate(dist, t) {
    this.angle = -dist / this.S / 0.6;
    let i = 0;
    for (const w of this.wheels) {
      for (let k = 0; k < 3; k++) {
        const a = this.angle * (0.6 / w.r) + k * Math.PI / 3;
        const d = v3(Math.cos(a) * w.r, Math.sin(a) * w.r, 0);
        this.spokes.setSegment(i++, w.c.clone().sub(d), w.c.clone().add(d));
      }
    }
    // wave: the forearm swings about the elbow
    const s = this.shoulder, side = this.soraSideN.z, K = this.soraK;
    const elbow = s.clone().add(v3(0.3 * K, 0.28 * K, side * 0.1));
    const sw = Math.sin(t * 7.5) * 0.55;
    const fore = v3(Math.sin(sw) * 0.5 * K, Math.cos(sw) * 0.5 * K, 0);
    const hand = elbow.clone().add(fore);
    this.arm.setSegment(0, s, elbow);
    this.arm.setSegment(1, elbow, hand);
    for (let k = 0; k < 5; k++) {
      const a = sw + (k - 2) * 0.38;
      this.arm.setSegment(2 + k, hand, hand.clone().add(v3(Math.sin(a) * 0.2 * K, Math.cos(a) * 0.2 * K, 0)));
    }
    this.arm.setSegment(7, hand, hand);
    this.soraHand.position.set(hand.x, hand.y, hand.z + side * 0.03);
  }

  set opacity(v) {
    for (const l of [this.lines, this.spokes, this.soraLines, this.arm, this.soraFeat]) l.opacity = v;
    for (const m of this.soraFills) { m.material.opacity = m.userData.opacity * v; m.visible = v > 0.01; }
    this.stars.intensity = v;
    this.panes.uniforms.uOpacity.value = v;
    this.soraFill.uniforms.uOpacity.value = v;
  }
}
