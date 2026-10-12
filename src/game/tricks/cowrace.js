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
import { makeRig, removeRig, ridingMaterial, SEAT, KID_SEAT, playGait, riderPose, riderClip, seatRider, ensureSeated, hipsHeight, seatHeight } from '../../actors/cow-rig.js';
import { RaceCard, icon } from '../../actors/cow-help.js';
import { addCss, disposeRigs } from './util.js';
import { SITE } from '../../content/cowtrack.js';
import { TRACK, PRACTICE_BEAT, newRace, stepRace, tap, tapKind, beatPhase, placeNow, result, raceScore } from './rules-cowrace.js';
import { tapLabel, coachLine, COACH_TAPS, ghostDue, GHOST_SHOW, STARS_NOTE } from './rules-cowhelp.js';

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
#cowRace .strip i.me{top:-2px;width:26px;height:26px;margin-left:-13px;z-index:2;box-shadow:0 0 0 3px #fff,0 3px 8px rgba(40,20,0,.35)}
#cowRace .strip i.me u{position:absolute;left:50%;top:29px;transform:translateX(-50%);text-decoration:none;padding:0 7px;border-radius:9px;background:#c2541c;color:#fff;font:700 11px/16px Nunito,sans-serif;white-space:nowrap}
#cowRace .strip i.me svg{position:absolute;left:3px;top:3px;width:20px;height:20px}
#cowRace .strip b{position:absolute;right:4px;top:-1px;font-size:15px}
#cowRace .strip .m1{position:absolute;top:2px;height:18px;border-radius:5px;background:#7a5230;opacity:.55}
#cowRace .info{position:absolute;left:50%;top:calc(112px + env(safe-area-inset-top,0px));transform:translateX(-50%);display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:5px 6px;max-width:min(560px,92vw)}
#cowRace .place{padding:2px 14px;border-radius:14px;background:#fff7e8e6;font:600 20px Fredoka,Nunito,sans-serif;color:#c2541c;min-height:26px}
#cowRace .place:empty{display:none}
#cowRace .chip{display:flex;align-items:center;gap:4px;height:24px;padding:0 8px 0 5px;border-radius:12px;background:#fff7e8e6;box-shadow:0 2px 8px rgba(40,20,0,.18);font:700 11px Nunito,sans-serif;white-space:nowrap;color:#5a3a22;transition:opacity .2s}
#cowRace .chip .ic{display:flex;width:16px;height:16px}#cowRace .chip .ic svg{width:16px;height:16px}
#cowRace .chip .bar{width:34px;height:7px;border-radius:4px;background:#5a3a2222;overflow:hidden}
#cowRace .chip .bar i{display:block;height:100%;width:0;border-radius:4px;background:#e4584a}
#cowRace .chip.boost .bar i{background:#5fcf68}
#cowRace .chip.streak .v{min-width:18px;color:#c2541c;font-size:12px}
#cowRace .chip.off{opacity:.5}
#cowRace .chip.hot{box-shadow:0 0 0 2px #f2a51a,0 2px 8px rgba(40,20,0,.18)}
#cowRace .chip.bad{box-shadow:0 0 0 2px #e4584a,0 2px 8px rgba(40,20,0,.18);color:#b02a1c}
#cowRace .helpbtn{pointer-events:auto;width:34px;height:34px;padding:0;border:0;border-radius:50%;background:#f08a3c;color:#fff;font:700 20px/34px Fredoka,Nunito,sans-serif;box-shadow:0 3px 0 #b8581c,0 4px 10px rgba(40,20,0,.3);touch-action:manipulation}
#cowRace .say{position:absolute;left:50%;top:calc(146px + env(safe-area-inset-top,0px));transform:translateX(-50%);max-width:min(380px,88vw);padding:7px 14px;border-radius:16px;background:#fffdf6f2;box-shadow:0 4px 14px rgba(40,20,0,.25);text-align:center;opacity:0;transition:opacity .25s}
#cowRace .say.on{opacity:1}
#cowRace .big{position:absolute;left:50%;top:38%;transform:translate(-50%,-50%);font:600 84px Fredoka,Nunito,sans-serif;color:#fff;text-shadow:0 4px 0 #c2541c,0 8px 18px rgba(40,20,0,.4);opacity:0}
#cowRace .beat{--r:84px;position:absolute;left:50%;bottom:calc(92px + env(safe-area-inset-bottom,0px));width:var(--r);height:var(--r);margin-left:calc(var(--r) / -2);opacity:0;transition:opacity .25s}
#cowRace.racing .beat{opacity:1}
#cowRace .beat.lg{--r:116px}
#cowRace .beat .core{position:absolute;inset:calc(var(--r) * .26);border-radius:50%;border:5px solid #fff;background:#f08a3ccc;box-shadow:0 2px 8px rgba(40,20,0,.35);display:flex;align-items:center;justify-content:center}
#cowRace .beat .core svg{width:56%;height:56%}
#cowRace .beat .core.good{background:#5fcf68}#cowRace .beat .core.ok{background:#f2c542}#cowRace .beat .core.bad{background:#e4584a}
#cowRace .beat .core.now{border-color:#fff3b0;box-shadow:0 0 0 4px #ffffff99,0 2px 8px rgba(40,20,0,.35)}
#cowRace .beat .shrink{position:absolute;inset:0;border-radius:50%;border:4px solid #fff;box-shadow:0 0 0 2px #c2541c66;will-change:transform}
#cowRace .beat .pop{position:absolute;left:50%;bottom:calc(100% + var(--r) * .5 + 8px);transform:translateX(-50%);font:600 30px Fredoka,Nunito,sans-serif;color:#fff;text-shadow:0 2px 0 #c2541c,0 3px 10px rgba(40,20,0,.45);opacity:0;white-space:nowrap}
#cowRace .beat .cap{position:absolute;left:50%;bottom:calc(100% + var(--r) * .5 + 46px);transform:translateX(-50%);padding:3px 12px;border-radius:12px;background:#fffdf6f2;box-shadow:0 2px 8px rgba(40,20,0,.25);font:700 14px Nunito,sans-serif;white-space:nowrap;opacity:0;transition:opacity .3s}
#cowRace .beat .cap.on{opacity:1}
#cowRace .beat .ghost{position:absolute;left:calc(100% + var(--r) * .5 + 14px);top:50%;transform:translateY(-50%);display:none;align-items:center;gap:8px;padding:6px 10px;border-radius:14px;background:#fffdf6f2;box-shadow:0 3px 10px rgba(40,20,0,.28);white-space:nowrap}
#cowRace:not(.touch) .beat .ghost.show{display:flex}
#cowRace .ghost .kc{display:inline-block;min-width:26px;padding:3px 7px;border-radius:7px;background:#fff;border:2px solid #b89a78;border-bottom-width:4px;font:700 13px Nunito,sans-serif;text-align:center;transition:transform .08s}
#cowRace .ghost.press .kc{transform:translateY(3px);background:#ffd08a;border-bottom-width:2px}
#cowRace .ghostf{position:absolute;right:calc(44px + env(safe-area-inset-right,0px));bottom:calc(252px + env(safe-area-inset-bottom,0px));width:44px;height:56px;display:none;transition:transform .09s;filter:drop-shadow(0 3px 4px rgba(40,20,0,.35))}
#cowRace.touch .ghostf.show{display:block}
#cowRace .ghostf.press{transform:translateY(16px) scale(.94)}
#cowRace .giddy{position:absolute;right:calc(14px + env(safe-area-inset-right,0px));bottom:calc(196px + env(safe-area-inset-bottom,0px));min-width:104px;min-height:70px;padding:6px 14px;border:0;border-radius:22px;font:700 20px Fredoka,Nunito,sans-serif;
 color:#fff;background:#f08a3c;box-shadow:0 5px 0 #b8581c,0 8px 18px rgba(40,20,0,.32);pointer-events:auto;touch-action:none;user-select:none;-webkit-user-select:none;display:none;align-items:center;justify-content:center;gap:7px;transition:transform .08s,filter .08s}
#cowRace .giddy svg{width:22px;height:22px;flex:none}
#cowRace.touch .giddy{display:flex}
#cowRace .giddy.hit{transform:scale(1.1);filter:brightness(1.12)}
body.cow-race #inventory{visibility:hidden}
#cowRace.fin .giddy,#cowRace.fin .ghostf{display:none!important}#cowRace.fin .beat{opacity:0}
#cowRace .giddy:active{transform:translateY(4px)}
@media (max-width:560px){#cowRace .strip{left:calc(12px + env(safe-area-inset-left,0px));transform:none;width:calc(100vw - 150px)}
 #cowRace .info{left:calc(12px + env(safe-area-inset-left,0px));transform:none;justify-content:flex-start;max-width:calc(100vw - 24px - env(safe-area-inset-left,0px))}
 #cowRace .chip{padding:0 6px 0 4px;gap:3px;font-size:10.5px}#cowRace .chip .bar{width:26px}
 #cowRace .helpbtn{width:40px;height:40px;line-height:40px}
 #cowRace .say{top:calc(190px + env(safe-area-inset-top,0px))}#cowRace .beat{left:34%}}
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
function ribbon(world, s0, s1, lift, colorOf, step = 1, bandsPerLane = 1) {
  const n = Math.max(1, Math.round((s1 - s0) / step)), rows = TRACK.lanes * bandsPerLane, pos = [], col = [], idx = [];
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
    _c.set(colorOf(s0 + (s1 - s0) * (i + 0.5) / n, j / bandsPerLane));
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

  // A mown pasture, with narrow worn hoof paths through each grassy lane. Keep
  // the whole surface in one mesh; only the gameplay mud patch is dark earth.
  const earthMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  own.push(earthMat);
  const pasture = addMesh(ribbon(world, -SITE.margin, TRACK.len + SITE.margin + 2, 0.045, (s, band) => {
    const lane = Math.floor(band), across = Math.round((band - lane) * 6);
    const worn = across === 2 || across === 3;
    if (worn) return Math.sin(s * 0.75 + lane * 2) > 0 ? '#aa9b68' : '#a29364';
    return (Math.floor(s / 5) + lane) % 2 ? '#7ea653' : '#719b4e';
  }, 1, 6), earthMat);
  pasture.name = 'cowrace-pasture';
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
  const mud = addMesh(ribbon(world, TRACK.mud[0], TRACK.mud[1], 0.06, (s, l) => (((Math.floor(s * 1.3) + l * 2) % 5 === 0) ? '#94714d' : '#795638'), 0.5), mudMat);
  mud.name = 'cowrace-mud';

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
    const touch = !!ctx.ui.touch;
    const practice = !!ctx.first;                     // the first try: a bigger, slower ring, a word for every tap, the teacher's tips

    // ---- the page: a progress strip (Mika's cow is the big marker), the meters, the beat ring, the combo, a bubble for the commentators
    const root = document.createElement('div');
    root.id = 'cowRace';
    root.innerHTML = `<div class="strip"><span class="m1"></span><b>🏁</b></div>
      <div class="info"><div class="place"></div>
        <div class="chip streak"><span class="ic">${icon('flame')}</span><span class="lb"></span><span class="v"></span></div>
        <div class="chip tired off"><span class="ic">${icon('puff')}</span><span class="lb"></span><span class="bar"><i></i></span></div>
        <div class="chip boost off"><span class="ic">${icon('grass')}</span><span class="lb"></span><span class="bar"><i></i></span></div>
        <button class="helpbtn" type="button">?</button></div>
      <div class="say"></div><div class="big"></div>
      <div class="beat${practice ? ' lg' : ''}"><div class="cap"></div><div class="pop"></div><div class="shrink"></div><div class="core">${icon('hoof')}</div>
        <div class="ghost"><span class="kc">E</span><span class="gt"></span></div></div>
      <svg class="ghostf" viewBox="0 0 32 40"><path d="M12 4a3 3 0 0 1 6 0v14l4-1a3 3 0 0 1 3 4l-2 12a6 6 0 0 1-6 5h-4a7 7 0 0 1-6-4L3 24a3 3 0 0 1 5-3l4 5z" fill="#fff" stroke="#5a3a22" stroke-width="2"/></svg>
      <button class="giddy" type="button">${icon('hoof')}<span></span></button>`;
    document.body.appendChild(root);
    const q = s => root.querySelector(s);
    const el = { strip: q('.strip'), m1: q('.m1'), place: q('.place'), say: q('.say'), big: q('.big'), shrink: q('.shrink'), core: q('.core'), beat: q('.beat'), cap: q('.cap'), pop: q('.pop'),
      ghost: q('.ghost'), ghostf: q('.ghostf'), giddy: q('.giddy'), dots: [], help: q('.helpbtn'),
      streak: q('.chip.streak'), streakV: q('.chip.streak .v'), tired: q('.chip.tired'), tiredBar: q('.chip.tired .bar i'), boost: q('.chip.boost'), boostBar: q('.chip.boost .bar i') };
    const mudA = TRACK.mud[0] / TRACK.len * 100, mudB = TRACK.mud[1] / TRACK.len * 100;
    el.m1.style.left = `${(8 + mudA * 0.84).toFixed(1)}%`; el.m1.style.width = `${((mudB - mudA) * 0.84).toFixed(1)}%`;
    for (let i = 0; i < 4; i++) {
      const dot = document.createElement('i');
      dot.style.background = LANE_COLORS[i];
      dot.style.left = '8%';
      if (i === 0) { dot.className = 'me'; dot.innerHTML = `<svg viewBox="0 0 64 68"><ellipse cx="32" cy="40" rx="15" ry="22" fill="#fff"/><ellipse cx="27" cy="36" rx="5" ry="6" fill="#3a2a22"/><ellipse cx="32" cy="13" rx="9" ry="8" fill="#fff"/><ellipse cx="32" cy="9" rx="6" ry="4" fill="#f4a6b4"/></svg><u></u>`; }   // Mika's cow: big, with her name
      el.strip.appendChild(dot); el.dots.push(dot);
    }
    const label = () => {
      el.dots[0].querySelector('u').textContent = tx('Mika');
      q('.chip.streak .lb').textContent = tx('Streak');
      q('.chip.tired .lb').textContent = tx('Tired');
      q('.chip.boost .lb').textContent = tx('Boost');
      el.giddy.lastChild.textContent = tx('Giddy-up!');
      el.help.setAttribute('aria-label', tx('How to play'));
      el.cap.textContent = tx('Tap when the ring closes');
      q('.ghost .gt').textContent = tx('Tap now!');
    };
    label();
    root.classList.toggle('touch', touch);
    let giddyReq = false, helpReq = false;
    el.giddy.addEventListener('pointerdown', e => { e.preventDefault(); giddyReq = true; });
    el.help.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); helpReq = true; });
    const card = new RaceCard(touch);
    let helpOpen = false;

    // ---- the pooled actors: four cows, three kid riders, Mika's seat
    const cows = [], kids = [], rigs = [];
    let S = null, race = null, cleaned = false, fixes = 0;
    const slabs = [];                                  // the podium blocks (made at the end of a race)
    const tmp = { x: 0, y: 0, z: 0 }, v1 = new V3();
    const syncRigs = () => { for (let i = 0; i < rigs.length; i++) { cows[i].root.updateMatrixWorld(true); rigs[i].userData.update(); } };
    const seatM = new THREE.Object3D();
    const was = { zoom: g.follow.zoomTarget, pose: p.pose };
    const qa = typeof window !== 'undefined' && window.__STARLINE_QA__ ? (window.__STARLINE_QA__.cowRace = { cows, kids, race: null, site: null, dbg: { fixes: 0, helpOpen: false, taps: 0, ghost: false, phase: 'setup' } }) : null;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      p.mounted = null; p.pose = was.pose ?? null; p.poseSpeed = 1;
      p.anim?.cancelOneShot();
      p.anim?.snap(p.anim.has(was.pose) ? was.pose : 'Idle');      // standing again on the very frame she leaves the seat
      for (const c of cows) { c.root.parent?.remove(c.root); c.root.removeFromParent(); disposeRigs(c.root); }
      for (const k of kids) { k.root.removeFromParent(); disposeRigs(k.root); }
      for (const r of rigs) removeRig(r);
      for (const b of slabs) { scene.remove(b); b.geometry.dispose(); b.material.dispose(); }
      slabs.length = 0;
      cows.length = kids.length = rigs.length = 0;
      seatM.removeFromParent();
      card.dispose();
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
      if (qa) { qa.dbg.phase = 'done'; if (window.__STARLINE_QA__.cowRace === qa) window.__STARLINE_QA__.cowRace = null; }   // (test hook only: nothing of this round is left for the next one to read)
    };

    // Every rider is posed by the same per-frame step in EVERY phase (the line-up, the hint card, the countdown, the race,
    // the podium): the animators of the cows and the kids belong to nobody else, so a phase that did not tick them left the
    // kids in their bind pose, standing on the cows' backs. After the ticks each rider is checked and corrected if it is not
    // on a ride clip (this must never fire; it is counted in fixes and logged).
    const keepSeated = () => {
      const fix = (anim, who) => { if (ensureSeated(anim, 'RideCow')) { fixes++; if (fixes <= 3) console.warn(`[cowrace] ${who} was not on a ride clip: corrected`); } };
      kids.forEach((k, i) => fix(k.anim, race?.racers[i + 1]?.id || `kid${i + 1}`));
      if (p.mounted) fix(p.anim, 'mika');
    };
    const tick = dt => {
      for (const c of cows) c.anim?.update(dt);
      for (const k of kids) k.anim?.update(dt);
      syncRigs();
      poseMika();
      keepSeated();
      if (qa) qa.dbg.fixes = fixes;
    };
    const poseMika = () => {
      if (!race) return;
      cows[0].root.updateMatrixWorld(true);
      seatM.getWorldPosition(p.pos);
      p.facing = cows[0].facing;
      p.root.position.copy(p.pos);
      p.root.rotation.y = p.facing;
      p.speed = race.racers[0].v; p.vel.set(0, 0, 0); p.grounded = true;
      p.lastSafe.copy(cows[0].pos);
    };

    // the help card ("?"): the same three steps as the intro, reopened any time; the race stands still while it is up
    let helpGrace = 0;
    const openHelp = start => new Promise(res => { helpOpen = true; helpGrace = 0; card.open(() => { helpOpen = false; res(); }, { start }); });
    /** Called by every waiting step and the race: opens the card on "?", closes it on E / Space; true while it is up. */
    const pollHelp = dt => {
      if (helpReq && !helpOpen) { helpReq = false; openHelp(!race || race.t === 0); }
      if (!helpOpen) return false;
      helpGrace += dt;
      if (helpGrace > 0.4 && (input.pressed('act') || input.pressed('jump'))) card.close();
      return true;                                   // (the frame that closes it is still a frozen one: the closing key is not a tap)
    };
    const waitLive = sec => { let t0 = 0; return ctx.loop(dt => { tick(dt); if (pollHelp(dt)) return undefined; return (t0 += dt) >= sec ? true : undefined; }); };

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
        // the seat height comes from the kid's own skeleton (hips in the bind pose = its size, hips in the ride pose), then it sits
        const bindHips = hipsHeight(k.model, k.root);
        seatRider(k.anim, 'RideCow');                  // seated before the first frame is drawn: never the bind pose
        k.root.position.y = seatHeight(bindHips, hipsHeight(k.model, k.root));
        kids.push(k);
      }
      document.body.classList.add('cow-race');
      root.classList.add('on');

      // ---- the race and the line-up
      const assist = ctx.first ? 1 : (g.easy ? 0.5 : 0);
      race = newRace({ seed: Math.floor(Math.random() * 1e6) + 1, assist, beat: practice ? PRACTICE_BEAT : undefined });
      const me = race.racers[0];
      if (qa) { qa.race = race; qa.site = S; qa.help = { open: () => { helpReq = true; }, isOpen: () => helpOpen, el }; }
      const place = (i, s, lat) => {
        const a = cows[i];
        trackPos(world, s, lat, tmp);
        a.pos.set(tmp.x, tmp.y, tmp.z);
        a.root.position.copy(a.pos);
        a.facing = Math.PI / 2;
        a.root.rotation.y = a.facing;
      };
      race.racers.forEach((r, i) => place(i, -1.8, r.lane));
      p.mounted = { obj: seatM, offset: new V3(), facingOffset: 0 };
      p.anim?.cancelOneShot();                         // a talk or a gesture still playing from before the round must not leave her standing
      p.pose = riderPose(p.anim);
      p.poseSpeed = 1;
      seatRider(p.anim, 'RideCow');
      for (let i = 0; i < 4; i++) cows[i].anim?.play('Idle');
      syncRigs();
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
      // The opening shot cranes down from high behind the start to the chase view. (It used to fly in from the finish line:
      // the camera passed just over the start gate, whose chequered beam filled the frame and hid the riders.)
      const crane = { pos: new V3(camPos.x - 9, camPos.y + 11, camPos.z), look: new V3(SITE.x0 + TRACK.len * 0.45, camLook.y, SITE.z) };
      g.follow.cutscene(crane, 0.001);
      await ctx.wait(0.1);
      await ctx.fade(false, 450);
      if (ctx.quit) return { score: 0, quit: true };
      ctx.hintTop(true, touch ? 236 : 196);
      audio.whoosh?.(2);
      // a slow pan from the finish line to the start gate while the riders line up
      g.follow.cutscene({ pos: camPos.clone(), look: camLook.clone() }, 2.6);
      let pan = 0;
      if (qa) qa.dbg.phase = 'lineup';
      await ctx.loop(dt => { S.setSpect(ctx.t, false); tick(dt); return (pan += dt) > 2.6 ? true : undefined; });
      if (ctx.quit) return { score: 0, quit: true };
      g.follow.track(() => camPos, () => camLook, 4);

      const say = (text, life = 2.6) => { el.say.textContent = text; el.say.classList.add('on'); el.sayLeft = life; };
      if (practice) {
        // the first try: the intro card, three steps with their little pictures. The race waits until it is closed.
        if (qa) qa.dbg.phase = 'intro';
        openHelp(true);
        await ctx.loop(dt => { tick(dt); return pollHelp(dt) ? undefined : true; });
        if (ctx.quit) return { score: 0, quit: true };
      }
      // ---- 3, 2, 1, go
      if (qa) qa.dbg.phase = 'countdown';
      const flash = text => { el.big.textContent = text; el.big.style.transition = 'none'; el.big.style.opacity = '1'; el.big.style.transform = 'translate(-50%,-50%) scale(1.25)'; requestAnimationFrame(() => { el.big.style.transition = 'opacity .7s, transform .7s'; el.big.style.opacity = '0'; el.big.style.transform = 'translate(-50%,-50%) scale(0.9)'; }); };
      for (const [n, pitch] of [['3', 0.8], ['2', 0.9], ['1', 1.0]]) { flash(n); audio.blip(pitch * 1.4); await waitLive(0.8); if (ctx.quit) return { score: 0, quit: true }; }
      flash(tx(N_('Go!')));
      audio.whoosh?.(5); audio.good();
      S.setSpect(ctx.t, true);
      ctx.hud(0, null);
      root.classList.add('racing');
      for (let i = 0; i < 4; i++) race.racers[i].v = 0.4;
      if (qa) qa.dbg.phase = 'race';

      // ---- the race
      const beat = race.beat;
      let lastBeatN = -1, mudShown = false, tiredShown = false, said = 0, lineAt = 0, popLeft = 0, finishedMe = false, lastPlace = 0, ribbonT = 0, hintLevel = 0;
      let taps = 0, goodRow = 0, ghostEnd = -99, ghostUntil = -1, ghostOn = false;
      const kidSay = [N_('Come on, cow! Come ON!'), N_('Slow and steady, Moo-moo!'), N_('Look at her go!'), N_('Mud ahead! Mind your socks!'), N_('Yeah, Mika! Yeah!')];
      const TONE = { good: '#bff5c2', ok: '#ffe9a0', bad: '#ffb3a8' };
      const pop = (text, color, life = 0.5) => { el.pop.textContent = text; el.pop.style.color = color || '#fff'; el.pop.style.transition = 'none'; el.pop.style.opacity = '1'; el.pop.style.transform = 'translateX(-50%) translateY(0)'; popLeft = life; };
      const popMsg = (text, color) => pop(text, color, 0.9);        // a message in the pop spot ("Yum!"): a little longer
      const drawStrip = () => {
        for (let i = 0; i < 4; i++) { const f = Math.min(1, Math.max(0, race.racers[i].s / TRACK.len)), q = Math.round(f * 460); if (el.dots[i]._q !== q) { el.dots[i]._q = q; el.dots[i].style.left = `${(8 + q / 460 * 84).toFixed(1)}%`; } }
      };
      const pressNow = () => { const r = giddyReq || input.pressed('act') || input.pressed('jump') || input.pressed('tap'); giddyReq = false; return r; };
      const setGhost = on => { ghostOn = on; el.ghost.classList.toggle('show', on); el.ghostf.classList.toggle('show', on); if (!on) { el.ghost.classList.remove('press'); el.ghostf.classList.remove('press'); } if (qa) qa.dbg.ghost = on; };
      const res = await ctx.loop(dt => {
        if (pollHelp(dt)) { tick(dt); if (qa) qa.dbg.helpOpen = true; return undefined; }          // the "?" card is up: the race waits
        // ---- input and rules
        if (pressNow() && !me.finished) {
          const grade = tap(race);
          if (grade) {
            const kind = tapKind(race, race.last.t, grade), lab = tapLabel(kind, practice);
            if (kind === 'perfect' || kind === 'good') audio.blip(1.3 + me.combo * 0.06); else if (lab.tone === 'ok') audio.click(); else audio.miss();
            pop(tx(lab.text), TONE[lab.tone]);
            el.core.className = `core ${lab.tone}`;
            el.coreAt = 0.18;
            if (practice && taps < COACH_TAPS) { const line = coachLine(kind, taps); if (line) ctx.hint(line, 3); }
            taps++;
            goodRow = lab.tone === 'good' ? goodRow + 1 : 0;
            if (ghostOn) { setGhost(false); ghostEnd = race.t; }
            if (qa) qa.dbg.taps = taps;
          }
        }
        stepRace(race, dt, { steer: input.move.x });
        // ---- the events of this frame
        for (const e of race.events) {
          const a = cows[e.who];
          if (e.type === 'grass') {
            S.eat(Math.max(0, Math.min(7, race.racers[e.who].lane * 2 + e.i)));
            fx.burst(v1.set(a.pos.x, a.pos.y + 1.1, a.pos.z), { n: 12, color: [0.45, 0.85, 0.3], speed: 1.6, size: 0.2, gravity: 1 });
            if (e.who === 0) { audio.good(); popMsg(tx(N_('Yum! Fresh grass!')), '#d5ffa8'); }
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
              root.classList.add('fin');
              say(who.place === 1 ? tx(N_('Mika is first!')) : tx(N_('Mika crosses the line!')), 2.4);
              ctx.hud(raceScore(who.place, who.finished), null);
              audio.good();
            } else if (!finishedMe) say(tx(N_('{name} is across!'), { name: who.name }), 1.8);
          }
        }
        race.events.length = 0;

        // ---- the picture: cows on the track, kids on the cows (each rider keeps a ride clip: Mika through p.pose, the kids by name)
        for (let i = 0; i < 4; i++) {
          const r = race.racers[i], a = cows[i], kid = i > 0 ? kids[i - 1] : null;
          trackPos(world, r.s, r.lat, tmp);
          const lean = Math.max(-0.4, Math.min(0.4, (r.latV || 0) * 0.35));
          a.facing = Math.PI / 2 - lean;
          a.pos.set(tmp.x, tmp.y, tmp.z);
          const bob = r.v > 0.4 ? Math.abs(Math.sin(r.stride * 1.9)) * (0.012 + r.v * 0.012) : 0;
          a.root.position.set(a.pos.x, a.pos.y + bob, a.pos.z);
          a.root.rotation.y = a.facing;
          a.root.rotation.x = Math.sin(r.stride * 1.9) * 0.012;
          if (r.finished != null && r.v < 0.5) {
            // across the line and standing: the cow stands, the rider keeps sitting (the sway clip), nobody cheers on her back
            a.anim?.play('Idle', { fade: 0.4 });
            if (kid) kid.anim?.play(riderPose(kid.anim), { fade: 0.3 }); else { p.pose = riderPose(p.anim); p.poseSpeed = 1; }
          } else {
            const gb = playGait(a.anim, r.v, false, 0.15);
            const sp = gb ? Math.max(0.6, Math.min(1.4, r.v / gb.auth)) : 1;
            if (kid) kid.anim?.play(gb ? riderClip(kid.anim, gb.rider) : riderPose(kid.anim), { speed: sp, fade: 0.15 });
            else { p.pose = gb ? riderClip(p.anim, gb.rider) : riderPose(p.anim); p.poseSpeed = sp; }
          }
          // mud splashes and the puffing cow
          if (r.mud && r.v > 0.8 && ((ctx.t * 7 + i) % 1) < dt * 7) fx.burst(v1.set(a.pos.x - 0.6, a.pos.y + 0.1, a.pos.z), { n: 4, color: [0.35, 0.24, 0.14], speed: 1.8, size: 0.3, gravity: 5 });
          if (r.tiredT > 0 && ((ctx.t * 3 + i) % 1) < dt * 3) fx.burst(v1.set(a.pos.x + 1.0, a.pos.y + 1.0, a.pos.z), { n: 3, color: [1, 1, 1], speed: 0.8, size: 0.28, gravity: -0.5 });
        }
        tick(dt);
        frame();
        // ---- the page
        ctx.hud(raceScore(placeNow(race), null), race.t);
        drawStrip();
        const pl = placeNow(race);
        if (pl !== lastPlace) { lastPlace = pl; el.place.textContent = tx(ordinal(pl)); }
        // the ring: an outer ring closes on the core exactly at each beat
        const { toBeat } = beatPhase(race.t, beat);                       // seconds until the next footfall
        const k = 1 + Math.min(1, toBeat / beat) * 0.95;
        const kq = Math.round(k * 40);
        if (kq !== el.kq) { el.kq = kq; el.shrink.style.transform = `scale(${(kq / 40).toFixed(2)})`; el.shrink.style.opacity = (0.35 + (1 - Math.min(1, toBeat / beat)) * 0.65).toFixed(2); }
        const now = toBeat < 0.07;
        if (now !== el.now) { el.now = now; el.core.classList.toggle('now', now); }
        if (el.coreAt > 0) { el.coreAt -= dt; if (el.coreAt <= 0) el.core.className = 'core'; }
        const n = Math.floor(race.t / beat);
        if (n !== lastBeatN) lastBeatN = n;
        // the caption under the first try, and the ghost: no tap for 5 s and a hand shows how, on the beat
        const capOn = ghostOn || (practice && taps < 8 && race.t < 40) || (taps < 3 && race.t > 2);
        if (capOn !== el.capOn) { el.capOn = capOn; el.cap.classList.toggle('on', capOn); }
        if (!ghostOn && !finishedMe && ghostDue(race.t, me.lastTap, taps, ghostEnd)) { setGhost(true); ghostUntil = race.t + GHOST_SHOW; }
        if (ghostOn) {
          if (race.t > ghostUntil || finishedMe) { setGhost(false); ghostEnd = race.t; }
          else { const pressed = toBeat < 0.14 || toBeat > beat - 0.02; el.ghost.classList.toggle('press', pressed); el.ghostf.classList.toggle('press', pressed); }
        }
        const pulse = touch && (ghostOn || (practice && taps < 3)) && toBeat < beat * 0.22;
        if (pulse !== el.pulse) { el.pulse = pulse; el.giddy.classList.toggle('hit', pulse); }
        // the meters: streak (taps in a row on the beat), tired (mashing), boost (fresh grass)
        const cb = Math.min(me.combo, 9);
        if (el.cb !== cb) { el.cb = cb; el.streakV.textContent = cb ? `×${cb}` : ''; el.streak.classList.toggle('off', !cb); el.streak.classList.toggle('hot', cb >= 4); }
        const pw = Math.min(100, Math.round(me.puff * 100)), tr = me.tiredT > 0;
        if (el.pw !== pw || el.tr !== tr) { el.pw = pw; el.tr = tr; el.tiredBar.style.width = `${pw}%`; el.tired.classList.toggle('off', pw < 8 && !tr); el.tired.classList.toggle('bad', tr); }
        const bq = Math.round(Math.max(0, me.boostT) / TRACK.grassBoost * 100);
        if (el.bq !== bq) { el.bq = bq; el.boostBar.style.width = `${bq}%`; el.boost.classList.toggle('off', bq <= 0); el.boost.classList.toggle('hot', bq > 0); }
        if (popLeft > 0) { popLeft -= dt; el.pop.style.transition = 'opacity .45s, transform .45s'; if (popLeft <= 0) { el.pop.style.opacity = '0'; el.pop.style.transform = 'translateX(-50%) translateY(-16px)'; } }
        if (el.sayLeft > 0) { el.sayLeft -= dt; if (el.sayLeft <= 0) el.say.classList.remove('on'); }
        // the commentators
        said -= dt;
        if (said <= 0 && !finishedMe && race.t > 3) { said = 5.5; say(tx(kidSay[lineAt++ % kidSay.length]), 2.4); }
        if (ctx.first && !finishedMe) {
          if (hintLevel === 0 && race.t > 6 && taps >= 3) { hintLevel = 1; ctx.hint(N_('Steer between the lanes. Fresh grass makes her run faster!'), 3.5); }
          else if (hintLevel === 1 && me.s > TRACK.len * 0.8) { hintLevel = 2; ctx.hint(N_('Nearly there! Keep the beat to the ribbon.'), 3); }
        }
        if (S.tail.visible) { ribbonT += dt; S.tail.rotation.z = Math.sin(ribbonT * 6) * 0.3; S.tail.position.y -= dt * 0.35 * (S.tail.position.y > world.heightAt(S.tail.position.x, S.tail.position.z) + 0.1 ? 1 : 0); }
        if (qa) qa.dbg.helpOpen = helpOpen;
        return race.over ? { done: true } : undefined;
      });
      if (res?.quit || ctx.quit) return { score: 0, quit: true };
      setGhost(false);
      root.classList.remove('racing');

      // ---- the podium: the first three cows stand on blocks in front of the stands, the kids cheer FROM THE STANDS: the riders
      // stay seated on their cows (the sway clip), nobody stands on a cow's back
      if (qa) qa.dbg.phase = 'podium';
      const rs = result(race);
      ctx.hud(rs.score, null);
      ctx.hintTop(false);
      const order = race.order.slice(0, 3);
      const half = TRACK.lanes * TRACK.laneW / 2, pz = SITE.z + half + 5.2, ph = [0.7, 0.45, 0.25], px0 = SITE.x0 + TRACK.len - 12;
      for (let i = 0; i < 4; i++) {                                    // every cow stands, every rider sits (no cow trots on the spot)
        cows[i].anim?.play('Idle', { fade: 0.2 });
        if (i > 0) kids[i - 1].anim?.play(riderPose(kids[i - 1].anim), { speed: 1, fade: 0.2 });
      }
      p.pose = riderPose(p.anim); p.poseSpeed = 1;
      order.forEach((ri, k) => {
        const a = cows[ri], px = px0 + (k === 0 ? 0 : k === 1 ? -3.4 : 3.4), z = pz;
        const y = world.heightAt(px, z);
        const blk = new THREE.Mesh(new THREE.BoxGeometry(2.4, ph[k], 2.4), new THREE.MeshStandardMaterial({ color: ['#f4c542', '#cfd6dc', '#c98a52'][k], roughness: 0.6 }));
        blk.name = 'race-podium'; blk.position.set(px, y + ph[k] / 2, z); blk.receiveShadow = true; scene.add(blk); slabs.push(blk);
        a.pos.set(px, y + ph[k], z); a.facing = Math.PI + (k === 0 ? 0.25 : k === 1 ? 0.55 : -0.55); a.root.position.copy(a.pos); a.root.rotation.y = a.facing; a.root.rotation.x = 0;
      });
      const camP = new V3(px0 - 1.5, world.heightAt(px0, pz) + 3.6, SITE.z - 4.5);
      const camL = new V3(px0, world.heightAt(px0, pz) + 1.5, pz);
      g.follow.cutscene({ pos: camP, look: camL }, 1.1);
      const winner = race.racers[order[0]];
      say(rs.place === 1 ? tx(N_('Mika wins the ribbon!')) : tx(N_('{name} wins the ribbon!'), { name: winner.id === 'mika' ? 'Mika' : winner.name }), 3.2);
      if (rs.place === 1) { audio.star?.(); fx.burst(v1.set(px0, world.heightAt(px0, pz) + 2.8, pz), { n: 60, speed: 5, size: 0.35, gravity: 1 }); }
      S.setSpect(0, true);
      let tp = 0;
      await ctx.loop(dt => { tp += dt; S.setSpect(ctx.t, true); tick(dt); return tp > 3.6 ? true : undefined; });
      if (ctx.quit) return { score: rs.score, quit: false, extra: ordinal(rs.place), detail: { place: rs.place, time: rs.time }, note: tx(STARS_NOTE) };
      await ctx.fade(true, 350);
      cleanup();
      await ctx.fade(false, 400);
      return { score: rs.score, quit: false, extra: ordinal(rs.place), detail: { place: rs.place, time: rs.time }, note: tx(STARS_NOTE) };
    } finally {
      if (!cleaned) {
        cleanup();
        ctx.fade(false, 300);
      }
    }
  },
};
