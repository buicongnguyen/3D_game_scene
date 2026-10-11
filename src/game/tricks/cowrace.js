// Cow race (trick `cowrace`): the village cow race on the Takamori north pasture, in the spirit of the ox races of An Giang.
// Four cows, four lanes, a 56 m track with a mud patch and fresh grass. Mika rides one (Giddy-up on the beat of her
// hooves), Kenta, Yui and Daichi ride the others. Rules (pure, tested): ./rules-cowrace.js.
//
// Drawing: the track, the ropes, the pennants, the gate and the stands are a few merged vertex-coloured meshes built once
// (when Mika comes within sight, or for a round) and freed when she leaves. The spectators are two instanced meshes. The
// four cows and the three riders are pooled for a round (clones of the cow and kid models) and released at every exit.
import * as THREE from 'three';
import { N_, tx } from '../../i18n/i18n.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { NPC } from '../../actors/npc.js';
import { makeRig, removeRig, ridingMaterial, SEAT, KID_SEAT, playGait, riderPose } from '../../actors/cow-rig.js';
import { addCss, disposeRigs } from './util.js';
import { SITE } from '../../content/cowtrack.js';
import { TRACK, BEAT, newRace, stepRace, tap, placeNow, result, raceScore } from './rules-cowrace.js';

const V3 = THREE.Vector3;
/** The track: it starts at (x0, z) and runs east (+X). Lane 0 is the north-most (left when you look east is north). */
export { SITE };
const LANE_COLORS = ['#e2572b', '#3a8fd8', '#f2b53a', '#5fae3e'];
const KID_TINTS = [3, 8, 12];                               // villagerTint seeds: three different shirts

const ordinal = n => [N_('1st place'), N_('2nd place'), N_('3rd place'), N_('4th place')][Math.max(0, Math.min(3, n - 1))];

const CSS = `
#cowRace{position:fixed;inset:0;z-index:14;pointer-events:none;zoom:var(--ui-scale,1);font:700 15px Nunito,system-ui,sans-serif;color:#5a3a22;display:none}
#cowRace.on{display:block}
#cowRace .strip{position:absolute;left:50%;top:calc(64px + env(safe-area-inset-top,0px));transform:translateX(-50%);width:min(340px,76vw);height:22px;border-radius:12px;background:#fff7e8e6;box-shadow:0 3px 12px rgba(40,20,0,.22)}
#cowRace .strip i{position:absolute;top:4px;width:14px;height:14px;margin-left:-7px;border-radius:50%;box-shadow:0 0 0 2px #fff;transition:none}
#cowRace .strip b{position:absolute;right:4px;top:-1px;font-size:15px}
#cowRace .strip .m1{position:absolute;top:2px;height:18px;border-radius:5px;background:#7a5230;opacity:.55}
#cowRace .place{position:absolute;left:50%;top:calc(92px + env(safe-area-inset-top,0px));transform:translateX(-50%);padding:2px 14px;border-radius:14px;background:#fff7e8e6;font:600 20px Fredoka,Nunito,sans-serif;color:#c2541c}
#cowRace .ring{position:absolute;left:50%;bottom:calc(88px + env(safe-area-inset-bottom,0px));width:84px;height:84px;margin-left:-42px}
#cowRace .ring .core{position:absolute;inset:22px;border-radius:50%;border:5px solid #fff;background:#f08a3ccc;box-shadow:0 2px 8px rgba(40,20,0,.35)}
#cowRace .ring .core.good{background:#5fcf68}#cowRace .ring .core.ok{background:#f2c542}#cowRace .ring .core.bad{background:#e4584a}
#cowRace .ring .shrink{position:absolute;inset:0;border-radius:50%;border:4px solid #fff;box-shadow:0 0 0 2px #c2541c66;will-change:transform}
#cowRace .combo{position:absolute;left:50%;bottom:calc(180px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);display:flex;gap:4px}
#cowRace .combo i{width:12px;height:12px;border-radius:50%;background:#fff7e8aa;box-shadow:0 0 0 2px #fff6}
#cowRace .combo i.on{background:#f2a51a}
#cowRace .puff{position:absolute;left:50%;bottom:calc(200px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);width:120px;height:8px;border-radius:5px;background:#fff7e899;overflow:hidden}
#cowRace .puff i{display:block;height:100%;width:0;background:#e4584a;transition:none}
#cowRace .say{position:absolute;left:50%;top:calc(132px + env(safe-area-inset-top,0px));transform:translateX(-50%);max-width:min(380px,88vw);padding:7px 14px;border-radius:16px;background:#fffdf6f2;box-shadow:0 4px 14px rgba(40,20,0,.25);text-align:center;opacity:0;transition:opacity .25s}
#cowRace .say.on{opacity:1}
#cowRace .big{position:absolute;left:50%;top:38%;transform:translate(-50%,-50%);font:600 84px Fredoka,Nunito,sans-serif;color:#fff;text-shadow:0 4px 0 #c2541c,0 8px 18px rgba(40,20,0,.4);opacity:0}
#cowRace .pop{position:absolute;left:50%;bottom:calc(228px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);font:600 26px Fredoka,Nunito,sans-serif;color:#fff;text-shadow:0 2px 0 #c2541c;opacity:0}
#cowRace .giddy{position:absolute;right:calc(14px + env(safe-area-inset-right,0px));bottom:calc(196px + env(safe-area-inset-bottom,0px));min-width:104px;min-height:70px;border:0;border-radius:22px;font:700 20px Fredoka,Nunito,sans-serif;
 color:#fff;background:#f08a3c;box-shadow:0 5px 0 #b8581c,0 8px 18px rgba(40,20,0,.32);pointer-events:auto;touch-action:none;user-select:none;-webkit-user-select:none;display:none}
#cowRace.touch .giddy{display:block}
@media (max-width:560px){#cowRace .strip{left:calc(12px + env(safe-area-inset-left,0px));transform:none;width:calc(100vw - 150px)}#cowRace .place{left:calc(12px + env(safe-area-inset-left,0px));transform:none}#cowRace .say{top:calc(134px + env(safe-area-inset-top,0px))}#cowRace .ring,#cowRace .combo,#cowRace .puff{left:34%}}
#cowRace .giddy:active{transform:translateY(4px)}
`;

// ---------------------------------------------------------------------------------------------------------- geometry
const _c = new THREE.Color(), M4 = new THREE.Matrix4(), Q4 = new THREE.Quaternion(), E4 = new THREE.Euler(), P4 = new V3(), S4 = new V3(1, 1, 1);
function paint(geo, color, m) {
  if (m) geo.applyMatrix4(m);
  _c.set(color);
  const n = geo.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}
const tf = (x, y, z, rx = 0, ry = 0, rz = 0) => M4.compose(P4.set(x, y, z), Q4.setFromEuler(E4.set(rx, ry, rz)), S4.set(1, 1, 1)).clone();
const pole = (x, y, z, h, color, r = 0.05) => paint(new THREE.CylinderGeometry(r, r * 1.15, h, 6), color, tf(x, y + h / 2, z));
const slab = (x, y, z, w, h, d, color, ry = 0) => paint(new THREE.BoxGeometry(w, h, d), color, tf(x, y, z, 0, ry, 0));

/** A strip of ground following the terrain: s0..s1 along the track, `rows` lanes across, painted by colorOf(s, lane). */
function ribbon(world, s0, s1, lift, colorOf, step = 1) {
  const n = Math.max(1, Math.round((s1 - s0) / step)), rows = TRACK.lanes, pos = [], col = [], idx = [];
  const half = TRACK.lanes * TRACK.laneW / 2, wm = 0.25;
  const cols = rows + 1;
  for (let i = 0; i <= n; i++) {
    const s = s0 + (s1 - s0) * i / n;
    for (let j = 0; j <= rows; j++) {
      const z = SITE.z - half - wm + (TRACK.lanes * TRACK.laneW + wm * 2) * j / rows, x = SITE.x0 + s;
      pos.push(x, world.heightAt(x, z) + lift, z);
    }
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < rows; j++) {
    const a = i * cols + j, b = a + 1, c = a + cols, d = c + 1;
    idx.push(a, b, c, b, d, c);
    _c.set(colorOf(s0 + (s1 - s0) * (i + 0.5) / n, j));
    for (let k = 0; k < 6; k++) col.push(_c.r, _c.g, _c.b);
  }
  // flat-shaded: expand to unindexed triangles so every cell keeps its own colour
  const p2 = [], c2 = [];
  idx.forEach((v, i) => { p2.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]); c2.push(col[i * 3], col[i * 3 + 1], col[i * 3 + 2]); });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p2, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(c2, 3));
  g.computeVertexNormals();
  return g;
}

/** Everything fixed at the site as a handful of meshes. Returns { group, ribbon, grass, spect, dispose() }. */
function buildSite(world) {
  const group = new THREE.Group();
  group.name = 'cowrace-site';
  const own = [];                         // geometries and materials made here
  const mat = ridingMaterial();
  const half = TRACK.lanes * TRACK.laneW / 2, zAt = lane => SITE.z - half + (lane + 0.5) * TRACK.laneW;
  const addMesh = (geo, material = mat, shadow = false) => { const m = new THREE.Mesh(geo, material); m.castShadow = shadow; m.receiveShadow = true; m.frustumCulled = false; group.add(m); own.push(geo); return m; };

  // the track: trampled earth with a lighter lane in turn, run-in before the start and run-out after the ribbon
  const earthMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  own.push(earthMat);
  addMesh(ribbon(world, -SITE.margin, TRACK.len + SITE.margin + 2, 0.045, (s, l) => (s < 0 || s > TRACK.len ? '#a5895a' : (l % 2 ? '#b08a5c' : '#a6805a'))), earthMat);
  // the lane lines painted on it, and the start and finish lines
  const lines = [];
  for (let l = 0; l <= TRACK.lanes; l++) {
    const z = SITE.z - half + l * TRACK.laneW;
    for (let s = 0; s < TRACK.len; s += 2) lines.push(slab(SITE.x0 + s + 0.9, world.heightAt(SITE.x0 + s, z) + 0.07, z, 1.1, 0.012, 0.09, '#f4ecd6'));
  }
  for (const s of [0, TRACK.len]) for (let r = 0; r < TRACK.lanes * 4; r++) lines.push(slab(SITE.x0 + s, world.heightAt(SITE.x0 + s, SITE.z) + 0.075, SITE.z - half + (r + 0.5) * TRACK.laneW / 4, 0.4, 0.012, TRACK.laneW / 4, (r + (s ? 1 : 0)) % 2 ? '#2a2a2a' : '#fbf6e6'));
  addMesh(mergeGeometries(lines), mat);

  // the mud patch: dark and wet, with lighter puddles
  const mudMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  own.push(mudMat);
  addMesh(ribbon(world, TRACK.mud[0], TRACK.mud[1], 0.06, (s, l) => (((Math.floor(s * 1.3) + l * 2) % 5 === 0) ? '#6e5238' : '#4b3220'), 0.5), mudMat);

  // lane ropes between poles, with a pennant on each span (the lane's colour)
  const parts = [];
  const tri = (a, b, c, color) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c], 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2)); g.setIndex([0, 1, 2]); return paint(g, color); };
  for (let l = 0; l <= TRACK.lanes; l++) {
    const z = SITE.z - half + l * TRACK.laneW;
    const colorA = LANE_COLORS[Math.min(l, TRACK.lanes - 1)], colorB = LANE_COLORS[Math.max(l - 1, 0)];
    const edge = l === 0 || l === TRACK.lanes;
    let prev = null;
    for (let s = 0; s <= TRACK.len; s += 4) {
      const x = SITE.x0 + s, y = world.heightAt(x, z);
      parts.push(pole(x, y, z, 0.95, '#f4ecd6', 0.04));
      parts.push(paint(new THREE.SphereGeometry(0.07, 6, 4), (s / 4) % 2 ? colorA : colorB, tf(x, y + 0.98, z)));
      const top = new V3(x, y + 0.88, z);
      if (prev) {
        // the rope sags a little between the poles: three straight pieces
        for (let k = 0; k < 3; k++) {
          const t0 = k / 3, t1 = (k + 1) / 3;
          const sag = t => -Math.sin(t * Math.PI) * 0.1;
          const a = new V3().lerpVectors(prev, top, t0); a.y += sag(t0);
          const b = new V3().lerpVectors(prev, top, t1); b.y += sag(t1);
          const len = a.distanceTo(b), mid = a.clone().add(b).multiplyScalar(0.5);
          Q4.setFromUnitVectors(new V3(0, 1, 0), b.clone().sub(a).normalize());
          parts.push(paint(new THREE.CylinderGeometry(0.018, 0.018, len, 4), edge ? '#d9553a' : '#f4ecd6', M4.compose(mid, Q4, S4.set(1, 1, 1)).clone()));
        }
        if (!edge || l === 0) {
          // a little flag hanging off the rope, in the colour of the lane it belongs to
          const m = new V3().lerpVectors(prev, top, 0.5);
          parts.push(tri([m.x - 0.25, m.y - 0.02, m.z], [m.x + 0.25, m.y - 0.02, m.z], [m.x, m.y - 0.42, m.z], (s / 4) % 2 ? colorA : '#fbf6e6'));
          parts.push(tri([m.x + 0.25, m.y - 0.02, m.z], [m.x - 0.25, m.y - 0.02, m.z], [m.x, m.y - 0.42, m.z], (s / 4) % 2 ? colorA : '#fbf6e6'));
        }
      }
      prev = top;
    }
  }
  const dbl = mat.clone(); dbl.side = THREE.DoubleSide; own.push(dbl);
  addMesh(mergeGeometries(parts), dbl);

  // the start gate and the finish banner: two posts, a beam and a chequered band; the finish ribbon is its own mesh
  const gates = [];
  for (const s of [0, TRACK.len]) {
    const x = SITE.x0 + s;
    for (const z of [SITE.z - half - 0.9, SITE.z + half + 0.9]) { const y = world.heightAt(x, z); gates.push(pole(x, y, z, 3.4, '#8a5a30', 0.12)); gates.push(paint(new THREE.SphereGeometry(0.2, 8, 6), '#f4c542', tf(x, y + 3.5, z))); }
    const yb = Math.max(world.heightAt(x, SITE.z - half), world.heightAt(x, SITE.z + half)) + 3.15;
    gates.push(slab(x, yb, SITE.z, 0.16, 0.16, TRACK.lanes * TRACK.laneW + 1.8, '#8a5a30'));
    for (let k = 0; k < 24; k++) gates.push(slab(x - 0.09, yb - 0.4, SITE.z - half - 0.6 + (k + 0.5) * (TRACK.lanes * TRACK.laneW + 1.2) / 24, 0.04, 0.5, (TRACK.lanes * TRACK.laneW + 1.2) / 24, (k + (s ? 1 : 0)) % 2 ? (s ? '#e2572b' : '#2a2a2a') : '#fbf6e6'));
  }
  addMesh(mergeGeometries(gates), mat, true);
  const fy = world.heightAt(SITE.x0 + TRACK.len, SITE.z);
  const rib = addMesh(paint(new THREE.BoxGeometry(0.03, 0.16, TRACK.lanes * TRACK.laneW + 0.6), '#e03a4a', tf(SITE.x0 + TRACK.len, fy + 1.05, SITE.z)), mat);
  const tail = addMesh(paint(new THREE.BoxGeometry(0.03, 0.5, 0.16), '#e03a4a', tf(0, 0, 0)), mat);
  tail.visible = false;

  // the stands north of the track: three rows of benches, a hay-bale wall behind and bunting poles
  const stands = [];
  const zs = SITE.z - half - 3.2;
  for (const [cx, len] of [[SITE.x0 + 14, 11], [SITE.x0 + TRACK.len - 10, 11]]) {
    for (let r = 0; r < 3; r++) {
      const z = zs - r * 0.9, y = world.heightAt(cx, z) + 0.3 + r * 0.42;
      stands.push(slab(cx, y, z, len, 0.1, 0.7, '#a8743c'));
      for (const dx of [-len / 2 + 0.3, 0, len / 2 - 0.3]) stands.push(slab(cx + dx, y - 0.2, z, 0.12, 0.4 + r * 0.42, 0.5, '#7a5230'));
    }
    for (let k = 0; k < 4; k++) stands.push(paint(new THREE.CylinderGeometry(0.42, 0.42, 0.55, 8), '#e0b64c', tf(cx - len / 2 + 1.4 + k * 2.5, world.heightAt(cx, zs - 3.4) + 0.3, zs - 3.4, Math.PI / 2, 0, 0)));
  }
  addMesh(mergeGeometries(stands), mat, true);

  // the grass bundles: one instanced mesh, eight instances (two per lane), shrunk when eaten
  const sheaf = mergeGeometries([
    paint(new THREE.ConeGeometry(0.34, 0.8, 7), '#5fb04a', tf(0, 0.4, 0)),
    paint(new THREE.ConeGeometry(0.22, 0.6, 6), '#7ccb58', tf(0.2, 0.3, 0.1, 0, 0, -0.3)),
    paint(new THREE.ConeGeometry(0.22, 0.6, 6), '#4f9a3c', tf(-0.2, 0.3, -0.1, 0, 0, 0.3)),
    paint(new THREE.TorusGeometry(0.2, 0.03, 4, 10), '#d9553a', tf(0, 0.28, 0, Math.PI / 2, 0, 0)),
  ]);
  own.push(sheaf);
  const grass = new THREE.InstancedMesh(sheaf, mat, TRACK.lanes * 2);
  grass.castShadow = false; grass.frustumCulled = false;
  const gpos = [];
  for (let l = 0; l < TRACK.lanes; l++) for (let i = 0; i < 2; i++) gpos.push([SITE.x0 + TRACK.grass[i], zAt(l)]);
  gpos.forEach(([x, z], i) => { M4.compose(P4.set(x, world.heightAt(x, z) + 0.05, z), Q4.identity(), S4.set(1, 1, 1)); grass.setMatrixAt(i, M4); });
  group.add(grass);

  // the cheering kids on the stands: bodies and heads, instanced, with their own colours
  const NS = 30;
  const bodyGeo = paint(new THREE.CylinderGeometry(0.17, 0.2, 0.55, 6), '#ffffff', tf(0, 0.28, 0)), headGeo = paint(new THREE.IcosahedronGeometry(0.16, 0), '#f1c7a1', tf(0, 0.72, 0));
  own.push(bodyGeo, headGeo);
  const bodies = new THREE.InstancedMesh(bodyGeo, mat, NS), heads = new THREE.InstancedMesh(headGeo, mat, NS);
  bodies.frustumCulled = heads.frustumCulled = false;
  const shirts = ['#e0567a', '#3a8fd8', '#f2b53a', '#5fae3e', '#8a5ad8', '#e2702a', '#1fa5a0'];
  const spect = [];
  for (let i = 0; i < NS; i++) {
    const side = i < 20;
    let x, z, y;
    if (side) { const stand = i < 10 ? 0 : 1, k = i % 10, row = k % 3; x = (stand ? SITE.x0 + TRACK.len - 10 : SITE.x0 + 14) - 5 + (k + 0.5) * 1.0; z = zs - row * 0.9; y = world.heightAt(x, z) + 0.35 + row * 0.42; }
    else { x = SITE.x0 + TRACK.len - 20 + (i - 20) * 1.1; z = SITE.z + half + 1.7 + ((i * 7) % 3) * 0.45; y = world.heightAt(x, z) + 0.05; }
    spect.push({ x, y, z, ph: i * 1.7, kind: side ? 0 : 1 });
    _c.set(shirts[i % shirts.length]);
    bodies.setColorAt(i, _c);
    _c.set(['#f1c7a1', '#e8b48a', '#d9a273'][i % 3]);
    heads.setColorAt(i, _c);
  }
  // (the vertex colour is white on the body so the instance colour shows; the head's vertex colour is multiplied too)
  group.add(bodies, heads);
  const setSpect = (t, cheer) => {
    for (let i = 0; i < NS; i++) {
      const s = spect[i], up = Math.max(0, Math.sin(t * (cheer ? 9 : 2.2) + s.ph)) * (cheer ? 0.28 : 0.04);
      M4.compose(P4.set(s.x, s.y + up, s.z), Q4.setFromEuler(E4.set(0, s.kind ? -Math.PI / 2 : Math.PI / 2 * 0 + Math.PI, 0)), S4.set(1, 1, 1));
      bodies.setMatrixAt(i, M4);
      heads.setMatrixAt(i, M4);
    }
    bodies.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = true;
  };
  setSpect(0, false);
  return {
    group, rib, tail, grass, gpos, setSpect, zAt,
    eat(i) { M4.compose(P4.set(0, -50, 0), Q4.identity(), S4.set(1, 1, 1)); grass.setMatrixAt(i, M4); grass.instanceMatrix.needsUpdate = true; },
    reset() { gpos.forEach(([x, z], i) => { M4.compose(P4.set(x, world.heightAt(x, z) + 0.05, z), Q4.identity(), S4.set(1, 1, 1)); grass.setMatrixAt(i, M4); }); grass.instanceMatrix.needsUpdate = true; rib.visible = true; tail.visible = false; },
    dispose() {
      group.parent?.remove(group);
      for (const o of own) o.dispose?.();
      bodies.dispose(); heads.dispose(); grass.dispose();
    },
  };
}

// ---------------------------------------------------------------------------------------------------------- the round
let site = null;      // the built scenery while Mika is near (a module singleton: a round or the ambient look)
function ensureSite(g) {
  if (site) return site;
  site = buildSite(g.world);
  g.scene.add(site.group);
  return site;
}
function freeSite() { if (site) { site.dispose(); site = null; } }

const trackPos = (world, s, lat, out) => {
  const half = TRACK.lanes * TRACK.laneW / 2;
  out.x = SITE.x0 + s; out.z = SITE.z - half + (lat + 0.5) * TRACK.laneW; out.y = world.heightAt(out.x, out.z);
  return out;
};

export default {
  id: 'cowrace',

  /** The scenery stands while Mika is within sight of it (Tricks calls this every frame inside 60 m, and once more with off when she leaves). */
  ambient(dt, ctx) {
    if (ctx.off) { if (!ctx.director.tricks?.round) freeSite(); return; }
    const s = ensureSite(ctx.game);
    if ((s.idleT = (s.idleT || 0) + dt) > 0.1) { s.idleT = 0; s.setSpect(performance.now() / 1000, false); }   // the cheering kids sway ten times a second
  },

  async play(ctx) {
    const { game: g, player: p, audio, fx, input } = ctx;
    const world = g.world, scene = g.scene, d = ctx.director;
    await ctx.ensureModels(['cow', 'villager-kid']);
    if (ctx.quit) return { score: 0, quit: true };
    addCss('cowRaceCss', CSS);

    // ---- the page: a progress strip, the beat ring, the combo pips, the puff meter and a bubble for the commentators
    const root = document.createElement('div');
    root.id = 'cowRace';
    root.innerHTML = `<div class="strip"><span class="m1"></span><b>🏁</b></div><div class="place"></div><div class="say"></div><div class="big"></div><div class="pop"></div>
      <div class="puff"><i></i></div><div class="ring"><div class="shrink"></div><div class="core"></div></div><div class="combo">${'<i></i>'.repeat(9)}</div><button class="giddy"></button>`;
    document.body.appendChild(root);
    const q = s => root.querySelector(s);
    const el = { strip: q('.strip'), m1: q('.m1'), place: q('.place'), say: q('.say'), big: q('.big'), pop: q('.pop'), puff: q('.puff i'), shrink: q('.shrink'), core: q('.core'), pips: [...root.querySelectorAll('.combo i')], giddy: q('.giddy'), dots: [] };
    const mudA = TRACK.mud[0] / TRACK.len * 100, mudB = TRACK.mud[1] / TRACK.len * 100;
    el.m1.style.left = `${(mudA * 0.92 + 4).toFixed(1)}%`; el.m1.style.width = `${((mudB - mudA) * 0.92).toFixed(1)}%`;
    for (let i = 0; i < 4; i++) {
      const dot = document.createElement('i');
      dot.style.background = LANE_COLORS[i];
      if (i === 0) { dot.style.width = dot.style.height = '18px'; dot.style.top = '2px'; dot.style.zIndex = 2; dot.style.marginLeft = '-9px'; }   // Mika's cow: a little bigger, on top
      el.strip.appendChild(dot); el.dots.push(dot);
    }
    el.giddy.textContent = tx('Giddy-up!');
    root.classList.toggle('touch', !!ctx.ui.touch);
    let giddyReq = false;
    el.giddy.addEventListener('pointerdown', e => { e.preventDefault(); giddyReq = true; });

    // ---- the pooled actors: four cows, three kid riders, Mika's seat
    const cows = [], kids = [], rigs = [];
    let S = null, race = null, cleaned = false;
    const slabs = [];                                  // the podium blocks (made at the end of a race)
    const tmp = { x: 0, y: 0, z: 0 }, v1 = new V3();
    const syncRigs = () => { for (let i = 0; i < rigs.length; i++) { cows[i].root.updateMatrixWorld(true); rigs[i].userData.update(); } };
    const seatM = new THREE.Object3D();
    const was = { zoom: g.follow.zoomTarget, pose: p.pose };
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      p.mounted = null; p.pose = was.pose ?? null;
      p.anim?.cancelOneShot();
      for (const c of cows) { c.root.parent?.remove(c.root); c.root.removeFromParent(); disposeRigs(c.root); }
      for (const k of kids) { k.root.removeFromParent(); disposeRigs(k.root); }
      for (const r of rigs) removeRig(r);
      for (const b of slabs) { scene.remove(b); b.geometry.dispose(); b.material.dispose(); }
      slabs.length = 0;
      cows.length = kids.length = rigs.length = 0;
      seatM.removeFromParent();
      root.remove();
      document.body.classList.remove('cow-race');
      S?.reset();
      S?.setSpect(0, false);
      try { g.follow.clearCutscene(true); } catch { /* ignore */ }
      g.follow.zoomTarget = was.zoom;
      // Mika stands by the sign again
      const pl = ctx.place;
      p.teleport(pl.x - 1.8, pl.z + 0.2, undefined, -Math.PI / 2 + 0.3);
      p.carry?.release('cowrace');
    };

    try {
      S = ensureSite(g);
      S.reset();
      p.carry?.want('worn', 'cowrace');
      ctx.lock(true);
      await ctx.fade(true, 350);
      if (ctx.quit) return { score: 0, quit: true };

      const makeCow = (i) => {
        const a = new NPC(scene, g.assets, world, `racecow${i}`, 'cow', { x: SITE.x0, z: SITE.z });
        a.root.scale.setScalar(1);
        a.anim?.play('Walk', { speed: 0.001 });
        cows.push(a);
        return a;
      };
      for (let i = 0; i < 4; i++) makeCow(i);
      const rig = makeRig(cows[0].root); cows[0].root.add(rig); rigs.push(rig);
      seatM.position.set(SEAT.x, SEAT.y, SEAT.z);
      cows[0].root.add(seatM);
      for (let i = 1; i < 4; i++) {
        const r = makeRig(cows[i].root); cows[i].root.add(r); rigs.push(r);
        const k = new NPC(scene, g.assets, world, `racekid${i}`, 'villager-kid', { x: SITE.x0, z: SITE.z, tint: NPC.villagerTint(KID_TINTS[i - 1]) });
        scene.remove(k.root);
        k.model.position.set(0, 0, 0);
        k.root.position.set(KID_SEAT.x, KID_SEAT.y, KID_SEAT.z);
        cows[i].root.add(k.root);
        k.riding = true;
        k.anim?.play(riderPose(k.anim));
        kids.push(k);
      }
      document.body.classList.add('cow-race');
      root.classList.add('on');

      // ---- the race and the line-up
      const assist = ctx.first ? 1 : (g.easy ? 0.5 : 0);
      race = newRace({ seed: Math.floor(Math.random() * 1e6) + 1, assist });
      const me = race.racers[0];
      if (typeof window !== 'undefined' && window.__STARLINE_QA__) window.__STARLINE_QA__.cowRace = { race, cows, kids, site: S };   // test hook (?qa=1 only)
      const place = (i, s, lat) => {
        const r = race.racers[i], a = cows[i];
        trackPos(world, s, lat, tmp);
        a.pos.set(tmp.x, tmp.y, tmp.z);
        a.root.position.copy(a.pos);
        a.facing = Math.PI / 2;
        a.root.rotation.y = a.facing;
        void r;
      };
      race.racers.forEach((r, i) => place(i, -1.8, r.lane));
      p.mounted = { obj: seatM, offset: new V3(), facingOffset: 0 };
      p.pose = riderPose(p.anim);
      const poseMika = () => {
        cows[0].root.updateMatrixWorld(true);
        seatM.getWorldPosition(p.pos);
        p.facing = cows[0].facing;
        p.root.position.copy(p.pos);
        p.root.rotation.y = p.facing;
        p.speed = me.v; p.vel.set(0, 0, 0); p.grounded = true;
        p.lastSafe.copy(cows[0].pos);
      };
      poseMika();

      // the camera: a pan down the track to the gate, then behind Mika's cow; wider on a tall phone screen
      const camPos = new V3(), camLook = new V3();
      const aspect = () => g.camera.aspect || 1.7;
      const frame = () => {
        const tall = aspect() < 0.9, back = tall ? 20 : 9.8, up = tall ? 8.8 : 5.0, ahead = tall ? 13 : 12;
        const a = cows[0], x = a.pos.x;
        const zc = SITE.z + (me.lat - (TRACK.lanes - 1) / 2) * TRACK.laneW * 0.35;
        camPos.set(Math.max(x - back, SITE.x0 - 14), a.pos.y + up, zc);
        camLook.set(x + ahead, a.pos.y + 0.9, zc);
      };
      frame();
      const finishView = { pos: new V3(SITE.x0 + TRACK.len - 14, world.heightAt(SITE.x0 + TRACK.len, SITE.z) + 5.5, SITE.z - 11), look: new V3(SITE.x0 + 4, 1.0, SITE.z) };
      g.follow.cutscene({ pos: new V3(finishView.pos.x, finishView.pos.y, finishView.pos.z), look: new V3(SITE.x0 + 40, finishView.pos.y - 3.5, SITE.z) }, 0.001);
      await ctx.wait(0.1);
      await ctx.fade(false, 450);
      if (ctx.quit) return { score: 0, quit: true };
      ctx.hintTop(true, 196);
      audio.whoosh?.(2);
      // a slow pan from the finish line to the start gate while the riders line up
      g.follow.cutscene({ pos: camPos.clone(), look: camLook.clone() }, 2.6);
      for (let i = 0; i < 4; i++) cows[i].anim?.play('Idle');
      let pan = 0;
      await ctx.loop(dt => { for (let i = 0; i < 4; i++) cows[i].anim?.update(dt); syncRigs(); poseMika(); S.setSpect(ctx.t, false); return (pan += dt) > 2.6 ? true : undefined; });
      if (ctx.quit) return { score: 0, quit: true };
      g.follow.track(() => camPos, () => camLook, 4);

      const say = (text, life = 2.6) => { el.say.textContent = text; el.say.classList.add('on'); el.sayLeft = life; };
      if (ctx.first) {
        ctx.hint(ctx.ui.touch ? N_('Tap Giddy-up when the ring closes: on the beat of her hooves!') : N_('Press E or Space when the ring closes: on the beat of her hooves!'), 5.5);
        await ctx.wait(3.2);
      }
      // ---- 3, 2, 1, go
      const flash = text => { el.big.textContent = text; el.big.style.transition = 'none'; el.big.style.opacity = '1'; el.big.style.transform = 'translate(-50%,-50%) scale(1.25)'; requestAnimationFrame(() => { el.big.style.transition = 'opacity .7s, transform .7s'; el.big.style.opacity = '0'; el.big.style.transform = 'translate(-50%,-50%) scale(0.9)'; }); };
      for (const [n, pitch] of [['3', 0.8], ['2', 0.9], ['1', 1.0]]) { flash(n); audio.blip(pitch * 1.4); await ctx.wait(0.8); if (ctx.quit) return { score: 0, quit: true }; }
      flash(tx(N_('Go!')));
      audio.whoosh?.(5); audio.good();
      S.setSpect(ctx.t, true);
      ctx.hud(0, null);
      for (let i = 0; i < 4; i++) race.racers[i].v = 0.4;

      // ---- the race
      let lastBeatN = -1, mudShown = false, tiredShown = false, said = 0, lineAt = 0, popLeft = 0, finishedMe = false, lastPlace = 0, ribbonT = 0, hintLevel = 0, ringOn = true;
      const kidSay = [N_('Come on, cow! Come ON!'), N_('Slow and steady, Moo-moo!'), N_('Look at her go!'), N_('Mud ahead! Mind your socks!'), N_('Yeah, Mika! Yeah!')];
      const pop = (text, color) => { el.pop.textContent = text; el.pop.style.color = color || '#fff'; el.pop.style.transition = 'none'; el.pop.style.opacity = '1'; el.pop.style.transform = 'translateX(-50%) translateY(0)'; popLeft = 0.5; };
      const drawStrip = () => {
        for (let i = 0; i < 4; i++) { const f = Math.min(1, Math.max(0, race.racers[i].s / TRACK.len)), q = Math.round(f * 460); if (el.dots[i]._q !== q) { el.dots[i]._q = q; el.dots[i].style.left = `${(4 + q / 5).toFixed(1)}%`; } }
      };
      const pressNow = () => { const r = giddyReq || input.pressed('act') || input.pressed('jump') || input.pressed('tap'); giddyReq = false; return r; };
      const res = await ctx.loop(dt => {
        // ---- input and rules
        if (pressNow()) {
          const grade = tap(race);
          if (grade === 'good') { pop(tx(N_('Good!')), '#bff5c2'); audio.blip(1.3 + me.combo * 0.06); el.core.className = 'core good'; }
          else if (grade === 'ok') { pop(tx(N_('Nice')), '#ffe9a0'); audio.click(); el.core.className = 'core ok'; }
          else if (grade === 'mash') { pop(tx(N_('Puff!')), '#ffb3a8'); audio.miss(); el.core.className = 'core bad'; }
          else { pop(tx(N_('Off the beat')), '#ffd2b8'); audio.miss(); el.core.className = 'core bad'; }
          ringOn = false; el.coreAt = 0.18;
        }
        stepRace(race, dt, { steer: input.move.x });
        // ---- the events of this frame
        for (const e of race.events) {
          const a = cows[e.who];
          if (e.type === 'grass') {
            S.eat(Math.max(0, Math.min(7, race.racers[e.who].lane * 2 + e.i)));
            fx.burst(v1.set(a.pos.x, a.pos.y + 1.1, a.pos.z), { n: 12, color: [0.45, 0.85, 0.3], speed: 1.6, size: 0.2, gravity: 1 });
            if (e.who === 0) { audio.good(); pop(tx(N_('Yum! Fresh grass!')), '#d5ffa8'); }
          } else if (e.type === 'mud' && e.who === 0 && !mudShown) { mudShown = true; if (ctx.first) ctx.hint(N_('Mud! Everyone slows down. Keep the beat, do not mash.'), 3.5); }
          else if (e.type === 'tired' && e.who === 0 && !tiredShown) { tiredShown = true; audio.miss(); ctx.hint(N_('Puff, puff! She is out of breath. Ease off and tap on the beat.'), 3.5); }
          else if (e.type === 'finish') {
            const who = race.racers[e.who];
            if (race.finishedCount === 1) {
              S.rib.visible = false; S.tail.visible = true;
              S.tail.position.set(SITE.x0 + TRACK.len + 0.4, world.heightAt(SITE.x0 + TRACK.len, SITE.z) + 0.8, SITE.z + (race.racers[e.who].lat - 1.5) * TRACK.laneW * 0.4);
              ribbonT = 0;
              fx.burst(v1.set(SITE.x0 + TRACK.len, world.heightAt(SITE.x0 + TRACK.len, SITE.z) + 1.2, SITE.z), { n: 40, color: [1, 0.35, 0.4], speed: 4, size: 0.3, gravity: 1.5 });
              S.setSpect(ctx.t, true);
              audio.fanfare?.();
            }
            if (e.who === 0) {
              finishedMe = true;
              say(who.place === 1 ? tx(N_('Mika is first!')) : tx(N_('Mika crosses the line!')), 2.4);
              ctx.hud(raceScore(who.place, who.finished), null);
              audio.good();
            } else if (!finishedMe) say(tx(N_('{name} is across!'), { name: who.name }), 1.8);
          }
        }
        race.events.length = 0;

        // ---- the picture: cows on the track, kids on the cows
        for (let i = 0; i < 4; i++) {
          const r = race.racers[i], a = cows[i];
          trackPos(world, r.s, r.lat, tmp);
          const lean = Math.max(-0.4, Math.min(0.4, (r.latV || 0) * 0.35));
          a.facing = Math.PI / 2 - lean;
          a.pos.set(tmp.x, tmp.y, tmp.z);
          const bob = r.v > 0.4 ? Math.abs(Math.sin(r.stride * 1.9)) * (0.012 + r.v * 0.012) : 0;
          a.root.position.set(a.pos.x, a.pos.y + bob, a.pos.z);
          a.root.rotation.y = a.facing;
          a.root.rotation.x = Math.sin(r.stride * 1.9) * 0.012;
          if (r.finished != null && r.v < 0.5) a.anim?.play('Idle', { fade: 0.4 });
          else {
            const gb = playGait(a.anim, r.v, false, 0.15);
            if (gb && i > 0) kids[i - 1].anim?.play(kids[i - 1].anim.has(gb.rider) ? gb.rider : riderPose(kids[i - 1].anim), { speed: Math.max(0.6, Math.min(1.4, r.v / gb.auth)), fade: 0.15 });
            else if (i > 0) kids[i - 1].anim?.play(riderPose(kids[i - 1].anim), { fade: 0.2 });
            if (i === 0) p.pose = gb && p.anim?.has(gb.rider) ? gb.rider : riderPose(p.anim);
          }
          a.anim?.update(dt);
          if (i > 0) kids[i - 1].anim?.update(dt);
          // mud splashes and the puffing cow
          if (r.mud && r.v > 0.8 && ((ctx.t * 7 + i) % 1) < dt * 7) fx.burst(v1.set(a.pos.x - 0.6, a.pos.y + 0.1, a.pos.z), { n: 4, color: [0.35, 0.24, 0.14], speed: 1.8, size: 0.3, gravity: 5 });
          if (r.tiredT > 0 && ((ctx.t * 3 + i) % 1) < dt * 3) fx.burst(v1.set(a.pos.x + 1.0, a.pos.y + 1.0, a.pos.z), { n: 3, color: [1, 1, 1], speed: 0.8, size: 0.28, gravity: -0.5 });
        }
        syncRigs();
        poseMika();
        frame();
        // ---- the page
        ctx.hud(raceScore(placeNow(race), null), race.t);
        drawStrip();
        const pl = placeNow(race);
        if (pl !== lastPlace) { lastPlace = pl; el.place.textContent = tx(ordinal(pl)); }
        // the ring: an outer ring closes on the core exactly at each beat
        const toBeat = BEAT - ((race.t % BEAT) + BEAT) % BEAT;            // seconds until the next footfall
        const k = 1 + Math.min(1, toBeat / BEAT) * 0.95;
        const kq = Math.round(k * 40);
        if (kq !== el.kq) { el.kq = kq; el.shrink.style.transform = `scale(${(kq / 40).toFixed(2)})`; el.shrink.style.opacity = (0.35 + (1 - Math.min(1, toBeat / BEAT)) * 0.65).toFixed(2); }
        if (el.coreAt > 0) { el.coreAt -= dt; if (el.coreAt <= 0) el.core.className = 'core'; }
        const n = Math.floor(race.t / BEAT);
        if (n !== lastBeatN) { lastBeatN = n; ringOn = true; }
        for (let i = 0; i < 9; i++) { const on = i < me.combo; if (el.pips[i]._on !== on) { el.pips[i]._on = on; el.pips[i].classList.toggle('on', on); } }
        const pw = Math.min(100, Math.round(me.puff * 100));
        if (el.pw !== pw) { el.pw = pw; el.puff.style.width = `${pw}%`; }
        if (popLeft > 0) { popLeft -= dt; el.pop.style.transition = 'opacity .45s, transform .45s'; if (popLeft <= 0) { el.pop.style.opacity = '0'; el.pop.style.transform = 'translateX(-50%) translateY(-16px)'; } }
        if (el.sayLeft > 0) { el.sayLeft -= dt; if (el.sayLeft <= 0) el.say.classList.remove('on'); }
        // the commentators
        said -= dt;
        if (said <= 0 && !finishedMe && race.t > 3) { said = 5.5; say(tx(kidSay[lineAt++ % kidSay.length]), 2.4); }
        if (ctx.first && !finishedMe) {
          if (hintLevel === 0 && race.t > 4) { hintLevel = 1; ctx.hint(N_('Steer between the lanes. Fresh grass makes her run faster!'), 3.5); }
          else if (hintLevel === 1 && me.s > TRACK.len * 0.8) { hintLevel = 2; ctx.hint(N_('Nearly there! Keep the beat to the ribbon.'), 3); }
        }
        if (S.tail.visible) { ribbonT += dt; S.tail.rotation.z = Math.sin(ribbonT * 6) * 0.3; S.tail.position.y -= dt * 0.35 * (S.tail.position.y > world.heightAt(S.tail.position.x, S.tail.position.z) + 0.1 ? 1 : 0); }
        return race.over ? { done: true } : undefined;
      });
      if (res?.quit || ctx.quit) return { score: 0, quit: true };

      // ---- the podium: the first three cows stand on blocks in front of the stands, the kids cheer
      const rs = result(race);
      ctx.hud(rs.score, null);
      ctx.hintTop(false);
      const order = race.order.slice(0, 3);
      const half = TRACK.lanes * TRACK.laneW / 2, pz = SITE.z + half + 5.2, ph = [0.7, 0.45, 0.25], px0 = SITE.x0 + TRACK.len - 12;
      order.forEach((ri, k) => {
        const a = cows[ri], px = px0 + (k === 0 ? 0 : k === 1 ? -3.4 : 3.4), z = pz;
        const y = world.heightAt(px, z);
        const blk = new THREE.Mesh(new THREE.BoxGeometry(2.4, ph[k], 2.4), new THREE.MeshStandardMaterial({ color: ['#f4c542', '#cfd6dc', '#c98a52'][k], roughness: 0.6 }));
        blk.position.set(px, y + ph[k] / 2, z); blk.receiveShadow = true; scene.add(blk); slabs.push(blk);
        a.pos.set(px, y + ph[k], z); a.facing = Math.PI + (k === 0 ? 0.25 : k === 1 ? 0.55 : -0.55); a.root.position.copy(a.pos); a.root.rotation.y = a.facing; a.root.rotation.x = 0;
        a.anim?.play('Idle', { fade: 0.2 });
        if (ri === 0) poseMika();
      });
      const camP = new V3(px0 - 1.5, world.heightAt(px0, pz) + 3.6, SITE.z - 4.5);
      const camL = new V3(px0, world.heightAt(px0, pz) + 1.5, pz);
      g.follow.cutscene({ pos: camP, look: camL }, 1.1);
      const winner = race.racers[order[0]];
      say(rs.place === 1 ? tx(N_('Mika wins the ribbon!')) : tx(N_('{name} wins the ribbon!'), { name: winner.id === 'mika' ? 'Mika' : winner.name }), 3.2);
      if (rs.place === 1) { audio.star?.(); fx.burst(v1.set(px0, world.heightAt(px0, pz) + 2.8, pz), { n: 60, speed: 5, size: 0.35, gravity: 1 }); }
      S.setSpect(0, true);
      let tp = 0;
      await ctx.loop(dt => { tp += dt; for (const a of cows) a.anim?.update(dt); for (const k of kids) k.anim?.update(dt); syncRigs(); S.setSpect(ctx.t, true); poseMika(); return tp > 3.6 ? true : undefined; });
      if (ctx.quit) return { score: rs.score, quit: false };
      await ctx.fade(true, 350);
      cleanup();
      await ctx.fade(false, 400);
      return { score: rs.score, quit: false, extra: ordinal(rs.place), detail: { place: rs.place, time: rs.time } };
    } finally {
      if (!cleaned) {
        cleanup();
        ctx.fade(false, 300);
      }
    }
  },
};
