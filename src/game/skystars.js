// The star-group sky of "Look up at the sky" (game/skygaze.js): the real stars of content/constellations.js placed on
// the dome for a season's evening, over a faint background field and the Milky Way. Built once when Mika looks up,
// disposed when she looks down. One Points mesh (background, Milky Way and the group stars) and one ribbon mesh (the
// figures); a selection only rewrites two small dynamic attributes, and only while it is fading.
import * as THREE from 'three';
import { STARS, groupsUp, horizontal, worldDir, magIn, lstFor } from '../content/constellations.js';

export const R = 900;                                  // dome radius around the camera
const RAD = Math.PI / 180;
const COLOUR = { w: [1, 1, 0.96], b: [0.72, 0.84, 1], y: [1, 0.93, 0.68], o: [1, 0.78, 0.5], r: [1, 0.58, 0.45] };
const LOW_MIN = 30, MAX_LIFT = 20;                      // degrees (see the lift in buildStarSky)
const LINE_HALF = 0.0014;                              // half width of a figure line (radians of the dome)

const VERT = `
attribute float aSize;
attribute vec3 aColor;
attribute float aSel;
uniform float uPx;
uniform float uTime;
uniform float uFade;
uniform float uMin;
varying vec3 vColor;
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  float tw = 0.82 + 0.18 * sin(uTime * (1.2 + fract(position.x * 0.13) * 3.0) + position.z);
  gl_PointSize = aSize * uPx * step(uMin, aSize) * (1.0 + aSel * (0.5 + 0.12 * sin(uTime * 3.0)));
  vColor = mix(aColor, vec3(1.0, 0.86, 0.5), aSel * 0.4) * tw * uFade * (1.0 + aSel * 0.45);
}`;
const FRAG = `
varying vec3 vColor;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.05, d);
  gl_FragColor = vec4(vColor, a * a);
}`;
const LINE_VERT = `
attribute float aA;
varying vec2 vUv;
varying float vA;
void main() { vUv = uv; vA = aA; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const LINE_FRAG = `
uniform float uFade;
varying vec2 vUv;
varying float vA;
void main() {
  float e = 1.0 - abs(vUv.x - 0.5) * 2.0;
  float a = vA * uFade * smoothstep(0.0, 0.6, e);
  gl_FragColor = vec4(vec3(1.0, 0.85, 0.5) * a, a);
}`;

export function skyLevels(low) { return { field: low ? 900 : 1500, milky: low ? 1000 : 1800 }; }

/**
 * @param {{season:string, hour:number, profile:object, look:'night'|'dusk', low?:boolean}} o
 * Returns { group, points, lines, infos, uniforms, select(i), tick(dt) -> bool changed, dispose() }.
 * infos[i] = { id, group, alt, az, dir: Vector3 (the middle), stars: [{ id, dir: Vector3, mag, name }] }.
 */
export function buildStarSky({ season, hour, profile, look, low = false }) {
  const lst = lstFor(season, hour), lat = profile.lat, dusk = look === 'dusk';
  const lv = skyLevels(low);
  let seed = 20261010;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pos = [], size = [], col = [], sel = [];
  const tmp = [0, 0, 0];
  const put = (ra, dec, s, c, lift = 0) => {
    const h = horizontal(ra, dec, lst, lat);
    if (h.alt < -3) return -1;
    worldDir(h.alt + lift, h.az, tmp);
    pos.push(tmp[0] * R, tmp[1] * R, tmp[2] * R); size.push(s); col.push(c[0], c[1], c[2]); sel.push(0);
    return size.length - 1;
  };
  const tint = () => { const k = rand(); return k < 0.16 ? [0.74, 0.85, 1] : k < 0.27 ? [1, 0.86, 0.66] : [1, 1, 0.95]; };
  // the background field: faint stars all over the sky (equatorial, so it wheels with the real ones)
  for (let i = 0; i < lv.field; i++) {
    const dec = Math.asin(rand() * 2 - 1) / RAD, ra = rand() * 24, m = Math.pow(rand(), 6), c = tint(), b = 0.5 + m * 0.9;
    put(ra, dec, 2.2 + m * 4.4, [c[0] * b, c[1] * b, c[2] * b]);
  }
  // the Milky Way: a band of tiny dim stars along the galactic plane, thicker and brighter toward Sagittarius
  const eq = (ra, dec) => { const a = ra * 15 * RAD, d = dec * RAD; return [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)]; };
  const P = eq(12.857, 27.128), C = eq(17.761, -28.936), Y = [P[1] * C[2] - P[2] * C[1], P[2] * C[0] - P[0] * C[2], P[0] * C[1] - P[1] * C[0]];
  for (let i = 0; i < lv.milky; i++) {
    const th = rand() * Math.PI * 2, centre = Math.max(0, Math.cos(th)), gauss = (rand() + rand() + rand() - 1.5) * (0.1 + 0.07 * centre);
    const v = [0, 1, 2].map(k => C[k] * Math.cos(th) + Y[k] * Math.sin(th) + P[k] * gauss), l = Math.hypot(...v);
    const b = (0.2 + rand() * 0.36) * (1 + 0.7 * centre);
    put(Math.atan2(v[1], v[0]) / RAD / 15 + (v[1] < 0 && Math.atan2(v[1], v[0]) < 0 ? 24 : 0), Math.asin(v[2] / l) / RAD, 1.7 + rand() * 1.4, [0.8 * b, 0.86 * b, b]);
  }
  const bgCount = size.length;
  // the group stars: every star of every group that is up, once
  const infos = groupsUp(season, hour, profile, dusk).map(i => ({ ...i, stars: [], segs: [] }));
  // The valley is ringed by mountains that hide the low sky, so a group whose middle is lower than LOW_MIN is drawn lifted,
  // all of it by the same angle (its shape is kept), up to that height. Groups that share a star with another group stay
  // where they are (the star could not be in two places); a group may borrow another's lift (the Pointers lift with the Cross).
  const count = new Map();
  for (const i of infos) for (const id of i.group.stars) count.set(id, (count.get(id) || 0) + 1);
  const byId = Object.fromEntries(infos.map(i => [i.id, i]));
  for (const i of infos) {
    const base = byId[i.group.liftLike] || i, shared = i.group.stars.some(id => count.get(id) > 1);
    i.lift = shared ? 0 : Math.min(MAX_LIFT, Math.max(0, LOW_MIN - base.alt));
    i.dir = new THREE.Vector3(...worldDir(i.alt + i.lift, i.az));
  }
  const union = new Map();                                    // star id -> point index
  const starDir = new Map();
  for (const info of infos) {
    for (const id of info.group.stars) {
      const s = STARS[id];
      if (dusk && s.mag > 2.9) continue;
      if (!union.has(id)) {
        const mag = magIn(id, profile), c = COLOUR[s.col] || COLOUR.w, b = Math.min(1.25, 0.95 + (2 - mag) * 0.06);
        const h = horizontal(s.ra, s.dec, lst, lat);
        const idx = put(s.ra, s.dec, Math.min(15, Math.max(4, 5.2 + (3.6 - mag) * 1.9)), [c[0] * b, c[1] * b, c[2] * b], info.lift);
        union.set(id, idx);
        if (idx >= 0) starDir.set(id, new THREE.Vector3(...worldDir(h.alt + info.lift, h.az)));
      }
      if (union.get(id) >= 0) info.stars.push({ id, dir: starDir.get(id), mag: magIn(id, profile), idx: union.get(id) });
    }
  }
  // the figures: ribbons on the dome
  const lp = [], lu = [], lidx = [];
  const A = new THREE.Vector3(), B = new THREE.Vector3(), W = new THREE.Vector3(), M = new THREE.Vector3(), a2 = new THREE.Vector3(), b2 = new THREE.Vector3();
  for (const info of infos) {
    for (const [ia, ib] of info.group.lines) {
      if (!starDir.has(ia) || !starDir.has(ib) || !info.stars.some(s => s.id === ia) || !info.stars.some(s => s.id === ib)) continue;
      A.copy(starDir.get(ia)); B.copy(starDir.get(ib));
      const theta = Math.max(1e-4, A.angleTo(B)), k = Math.min(0.22, 0.014 / theta);        // leave a gap round each star
      a2.copy(A).lerp(B, k).normalize().multiplyScalar(R * 0.985); b2.copy(B).lerp(A, k).normalize().multiplyScalar(R * 0.985);
      M.copy(a2).add(b2).normalize();
      W.copy(b2).sub(a2).cross(M).normalize().multiplyScalar(R * LINE_HALF);
      const base = lp.length / 3;
      lp.push(a2.x - W.x, a2.y - W.y, a2.z - W.z, a2.x + W.x, a2.y + W.y, a2.z + W.z, b2.x - W.x, b2.y - W.y, b2.z - W.z, b2.x + W.x, b2.y + W.y, b2.z + W.z);
      lu.push(0, 0, 1, 0, 0, 1, 1, 1);
      lidx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      info.segs.push(base / 4);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new THREE.Float32BufferAttribute(size, 1));
  geo.setAttribute('aColor', new THREE.Float32BufferAttribute(col, 3));
  const selAttr = new THREE.BufferAttribute(new Float32Array(sel), 1).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aSel', selAttr);
  const uniforms = { uPx: { value: 1 }, uTime: { value: 0 }, uFade: { value: 0 }, uMin: { value: 0 } };
  const points = new THREE.Points(geo, new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  points.frustumCulled = false; points.renderOrder = 5;

  const lgeo = new THREE.BufferGeometry();
  lgeo.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
  lgeo.setAttribute('uv', new THREE.Float32BufferAttribute(lu, 2));
  const aA = new THREE.BufferAttribute(new Float32Array(lp.length / 3), 1).setUsage(THREE.DynamicDrawUsage);
  lgeo.setAttribute('aA', aA);
  lgeo.setIndex(lidx);
  const lines = new THREE.Mesh(lgeo, new THREE.ShaderMaterial({ vertexShader: LINE_VERT, fragmentShader: LINE_FRAG, uniforms: { uFade: uniforms.uFade }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
  lines.frustumCulled = false; lines.renderOrder = 6;

  const group = new THREE.Group();
  group.name = 'sky-stars';
  group.add(points, lines);

  // selection: each group has a level 0..1 that eases toward 1 (selected) or 0
  const level = infos.map(() => 0), want = infos.map(() => 0);
  const faint = dusk ? 0.06 : 0.1;
  let selected = -1, dirty = true;
  const write = () => {
    sel.fill(0);
    infos.forEach((info, gi) => { if (level[gi] > 0) for (const s of info.stars) sel[s.idx] = Math.max(sel[s.idx], level[gi]); });
    selAttr.array.set(sel); selAttr.needsUpdate = true;
    infos.forEach((info, gi) => { const v = faint + (dusk ? 0.55 : 0.8) * level[gi]; for (const s of info.segs) for (let k = 0; k < 4; k++) aA.array[s * 4 + k] = v; });
    aA.needsUpdate = true;
  };
  return {
    group, points, lines, infos, uniforms, bgCount, union,
    get selected() { return selected; },
    select(i) { selected = i; infos.forEach((_, gi) => { want[gi] = gi === i ? 1 : 0; }); },
    /** Ease the levels; true when anything changed (labels and highlights need a refresh). */
    tick(dt) {
      let moved = dirty;
      dirty = false;
      for (let gi = 0; gi < level.length; gi++) {
        const d = want[gi] - level[gi];
        if (Math.abs(d) > 0.002) { level[gi] += d * Math.min(1, dt * 5); moved = true; } else if (d !== 0) { level[gi] = want[gi]; moved = true; }
      }
      if (moved) write();
      return moved;
    },
    dispose() { group.removeFromParent(); for (const o of [points, lines]) { o.geometry.dispose(); o.material.dispose(); } },
  };
}
