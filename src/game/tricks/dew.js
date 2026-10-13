// Dew webs at dawn (docs/RURAL-TRICKS.md trick 13): spring to autumn, at the forest edge on the west trail.
// At sunrise six spider webs hang between dry stems, strung with dew. They are almost invisible until Mika is close
// and has the sun behind her; then every drop lights up. Walk, find each one and photograph it ({act}): a flash and a
// framed shot. Score: 10 a web and a bonus for finding them all quickly. Rules: ./rules-dew.js.
//
// Drawing: the webs are the `spider-web` model (or procedural thread lines), one material pair per web so each fades on
// its own; all the dew drops of all webs are one Points draw call (their glow is a uniform per web); the stems are one
// InstancedMesh. Nothing allocates per frame.
import * as THREE from 'three';
import { N_, tx } from '../../i18n/i18n.js';
import { inHours } from '../../content/tricks.js';
import { sunDirection } from '../../world/seasons.js';
import { DEW, webSpots, webVisibility, photoCheck, nearestWeb, dewScore, dewLevel, photoPerfect, dryTimes, dryness } from './rules-dew.js';
import { addCss } from './util.js';

const V3 = THREE.Vector3;
const DAWN = 6.0;              // the hour look of the round
const WEB_R = 0.62;            // web radius in metres
const DROPS = 34;              // dew drops per web
const SHOT_TIME = 1.5;         // seconds the framed shot is held

const CSS = `
#dewAim{position:fixed;left:0;top:0;width:120px;height:120px;margin:-60px 0 0 -60px;z-index:14;pointer-events:auto;cursor:pointer;touch-action:manipulation;
 background:
  linear-gradient(#fff,#fff) 0 0/26px 3px no-repeat,linear-gradient(#fff,#fff) 0 0/3px 26px no-repeat,
  linear-gradient(#fff,#fff) 100% 0/26px 3px no-repeat,linear-gradient(#fff,#fff) 100% 0/3px 26px no-repeat,
  linear-gradient(#fff,#fff) 0 100%/26px 3px no-repeat,linear-gradient(#fff,#fff) 0 100%/3px 26px no-repeat,
  linear-gradient(#fff,#fff) 100% 100%/26px 3px no-repeat,linear-gradient(#fff,#fff) 100% 100%/3px 26px no-repeat;
 filter:drop-shadow(0 1px 3px rgba(0,0,0,.55))}
#dewAim.side{opacity:.45}
#dewAim.best{filter:drop-shadow(0 0 5px #ffd23f) drop-shadow(0 1px 3px rgba(0,0,0,.55)) sepia(1) saturate(6) hue-rotate(-12deg)}
#dewAim span{position:absolute;left:50%;top:100%;transform:translateX(-50%);margin-top:8px;white-space:nowrap;padding:4px 10px;border-radius:999px;
 background:rgba(255,253,246,.95);color:#4a3020;font:700 14px Nunito,system-ui,sans-serif}
#dewAim.hidden,#dewShot.hidden{display:none}
#dewFlash{position:fixed;inset:0;z-index:28;background:#fff;opacity:0;pointer-events:none}
#dewShot{position:fixed;inset:0;z-index:27;pointer-events:none;display:flex;align-items:center;justify-content:center}
#dewShot .f{width:min(62vw,62vh);height:min(62vw,62vh);border:12px solid #fffdf6;border-bottom-width:46px;border-radius:6px;position:relative;
 box-shadow:0 0 0 200vmax rgba(20,24,40,.5),0 10px 30px rgba(0,0,0,.45);transform:rotate(-2deg);animation:dewShot .35s both}
#dewShot .c{position:absolute;left:0;right:0;bottom:-38px;text-align:center;color:#5a3a22;font:600 18px Fredoka,Nunito,sans-serif}
@keyframes dewShot{from{transform:rotate(3deg) scale(1.25);opacity:0}to{transform:rotate(-2deg) scale(1);opacity:1}}
#dewDots{position:fixed;left:50%;top:calc(66px + env(safe-area-inset-top,0px));transform:translateX(-50%);z-index:15;display:flex;gap:6px;padding:5px 10px;border-radius:999px;
 background:rgba(255,247,232,.9);box-shadow:0 4px 12px rgba(40,20,0,.2);zoom:var(--ui-scale,1)}
#dewDots i{width:14px;height:14px;border-radius:50%;background:#e4d5b6;transition:background .3s,transform .3s}
#dewDots i.on{background:#58b7e8;transform:scale(1.2);box-shadow:0 0 6px #9fdcff}
#dewDots i.best{background:#ffd23f;box-shadow:0 0 6px #ffe89a}
#dewDots i.gone{background:none;box-shadow:inset 0 0 0 2px #cdb98f;opacity:.7}
@media (max-width:520px){#dewDots{top:calc(114px + env(safe-area-inset-top,0px))}}
`;

const DROP_VERT = `
attribute float aWeb;
attribute float aPhase;
uniform float uVis[${DEW.maxWebs}];
uniform float uScale;
uniform float uTime;
varying float vA;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float vis = uVis[int(aWeb + 0.5)];
  float tw = 0.55 + 0.45 * sin(uTime * (2.0 + aPhase * 3.0) + aPhase * 40.0);
  gl_PointSize = uScale * (0.045 + 0.05 * tw) * (0.4 + 0.6 * vis) / max(0.5, -mv.z);
  vA = vis * (0.35 + 0.65 * tw);
}`;
const DROP_FRAG = `
varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(mix(vec3(0.75, 0.9, 1.0), vec3(1.0, 0.97, 0.85), a), a * a * vA * 1.6);
}`;

/** Thread lines of a web in its own plane (XY, facing +Z), radius 1: spokes and sagging rings. Positions for LineSegments. */
function webLines() {
  const out = [], spokes = 12, rings = 5;
  const pt = (a, r) => [Math.cos(a) * r, Math.sin(a) * r, 0];
  for (let i = 0; i < spokes; i++) out.push(0, 0, 0, ...pt(i / spokes * Math.PI * 2, 1.06));
  for (let k = 1; k <= rings; k++) {
    for (let i = 0; i < spokes; i++) {
      const a0 = i / spokes * Math.PI * 2, a1 = (i + 1) / spokes * Math.PI * 2, r = k / rings;
      // each ring thread sags a little toward the hub between two spokes
      const mid = pt((a0 + a1) / 2, r * 0.93);
      out.push(...pt(a0, r), ...mid, ...mid, ...pt(a1, r));
    }
  }
  return out;
}

/** The web model sized and turned so that its face is +Z, its hub at the origin and its radius 1 (or null). */
function webModel(assets) {
  const m = assets.clone('spider-web');
  if (!m) return null;
  m.updateMatrixWorld(true);
  const box = new THREE.Box3();
  m.traverse(o => { if (o.isMesh) { o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld)); } });
  const size = box.getSize(new V3());
  const fit = new THREE.Group();
  fit.add(m);
  // the thinnest axis is the face normal: turn it to +Z (same rule as actors/critters.js)
  let plane = Math.max(size.x, size.y);
  if (size.x <= size.y && size.x <= size.z) { fit.rotation.y = -Math.PI / 2; plane = Math.max(size.y, size.z); }
  else if (size.y <= size.z) { fit.rotation.x = Math.PI / 2; plane = Math.max(size.x, size.z); }
  fit.scale.setScalar(2 / (plane || 0.6));
  return fit;
}

export default {
  id: 'dew',

  async play(ctx) {
    const { game: g, player: p, audio, fx, trick } = ctx;
    const world = g.world, scene = g.scene, cam = g.camera;
    await ctx.ensureModels(['spider-web']);
    if (ctx.quit) return { score: 0, quit: true };
    addCss('dewCss', CSS);

    const added = [], disposables = [], dom = [];
    let cleaned = false, onAim = null, aim = null, dawnSet = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      for (const o of added) o.removeFromParent();
      for (const x of disposables) x.dispose();
      if (aim && onAim) aim.removeEventListener('pointerdown', onAim);
      for (const e of dom) e.remove();
      if (dawnSet) ctx.setNight(false);
      g.follow.clearCutscene(true);
      ctx.lock(false);
    };

    try {
      // dawn for the round (a fade hides the change), unless the valley already shows it
      const season = g.shownSeason || g.time.season;
      const isDawn = inHours(g.shownHour(), trick.hours);
      if (!isDawn) {
        ctx.lock(true);
        await ctx.fade(true, 350);
        if (ctx.quit) return { score: 0, quit: true };
        ctx.setNight(true, DAWN); dawnSet = true;
      }
      const sd = sunDirection(isDawn ? g.shownHour() : DAWN, season);
      const sl = Math.hypot(sd.x, sd.z) || 1, sunX = sd.x / sl, sunZ = sd.z / sl;

      // ---- where the webs hide: seeded spots on dry, gentle ground with nothing solid in the way
      const cx = ctx.place.x, cz = ctx.place.z;
      // (the rocks and bushes of the forest edge are no colliders: a web must not hang inside one, nor Mika stand in one to see it)
      const reach = DEW.rMax * 2, inWay = [];
      for (const [list, r] of [[g.placed?.rocks, 1.5], [g.placed?.bushes, 1.5], [g.placed?.trees, 1.6]]) {
        for (const o of list || []) if (Math.abs(o.x - cx) < reach && Math.abs(o.z - cz) < reach) inWay.push(o.x, o.z, r + (o.s || 1) * 0.9);
      }
      const ok = (ox, oz) => {
        const x = cx + ox, z = cz + oz, y = world.heightAt(x, z);
        if (y < 0.9) return false;
        for (let k = 0; k < inWay.length; k += 3) if (Math.hypot(x - inWay[k], z - inWay[k + 1]) < inWay[k + 2]) return false;
        if (Math.abs(world.heightAt(x + 1, z) - y) > 0.4 || Math.abs(world.heightAt(x, z + 1) - y) > 0.4) return false;
        for (const it of g.colliders.near(x, z)) {
          const pad = 1.4;
          if (it.kind === 'cyl' ? Math.hypot(x - it.x, z - it.z) < it.r + pad : Math.hypot(x - it.x, z - it.z) < Math.hypot(it.hw, it.hd) + pad) return false;
        }
        return true;
      };
      // the level decides how many webs, how far they spread, whether they dry and whether old webs hang among them
      const L = dewLevel(ctx.level, !!ctx.first);
      const qa = typeof window !== 'undefined' ? window.__STARLINE_QA__ : null;
      const seed = qa?.trickSeed ?? Math.floor(Math.random() * 1e6) + 1;
      const spots = webSpots(seed, Math.min(DEW.maxWebs, L.webs + L.decoys), ok, { rMax: L.rMax, gap: L.rMax > DEW.rMax ? 5 : DEW.gap });
      // (the old webs are picked evenly from among the spots, never the first one)
      const nDecoy = Math.min(L.decoys, Math.max(0, spots.length - 4));
      const decoyAt = new Set();
      for (let k = 0; k < nDecoy; k++) decoyAt.add(2 + k * Math.floor(spots.length / nDecoy));
      const isDecoy = i => decoyAt.has(i);
      const total = spots.filter((s, i) => !isDecoy(i)).length;
      const far = L.far;

      // ---- build: stems (one instanced mesh), webs (model or lines), drops (one Points)
      const stemGeo = new THREE.CylinderGeometry(0.012, 0.022, 1, 5);
      stemGeo.translate(0, 0.5, 0);
      const stemMat = new THREE.MeshStandardMaterial({ color: '#8a7a4e', roughness: 0.9 });
      const stems = new THREE.InstancedMesh(stemGeo, stemMat, Math.max(1, total * 2));
      stems.castShadow = true;
      stems.frustumCulled = false;
      disposables.push(stemGeo, stemMat, stems);          // (the mesh too: it owns the instance buffer on the GPU)
      const lineGeo = new THREE.BufferGeometry();
      lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(webLines(), 3));
      disposables.push(lineGeo);

      const dPos = new Float32Array(total * DROPS * 3), dWeb = new Float32Array(total * DROPS), dPh = new Float32Array(total * DROPS);
      const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new V3(), P = new V3(), E = new THREE.Euler();
      const webs = spots.map((s, i) => {
        const x = cx + s.x, z = cz + s.z, gy = world.heightAt(x, z);
        const yaw = Math.atan2(sunX, sunZ) + s.rot;          // the face looks (roughly) toward the sun
        const w = { i, x, z, y: gy + s.h, yaw, found: false, vis: 0, shown: -1, mats: [], obj: null, pos: new V3(x, gy + s.h, z), decoy: isDecoy(i), dry: false, dryAt: Infinity };
        const holder = new THREE.Group();
        holder.position.copy(w.pos);
        holder.rotation.y = yaw;
        holder.scale.setScalar(WEB_R);
        const model = webModel(g.assets);
        if (model) {
          model.traverse(o => {
            if (!o.isMesh) return;
            o.material = o.material.clone();
            o.material.transparent = true; o.material.depthWrite = false; o.material.opacity = 0;
            o.castShadow = false; o.receiveShadow = false; o.renderOrder = 3;
            if (w.decoy && o.material.color) o.material.color.multiplyScalar(0.72);        // an old web: dull and dusty
            w.mats.push(o.material); disposables.push(o.material);
          });
          holder.add(model);
        } else {
          const mat = new THREE.LineBasicMaterial({ color: w.decoy ? '#b9b6a6' : '#f4fbff', transparent: true, opacity: 0, depthWrite: false });
          const lines = new THREE.LineSegments(lineGeo, mat);
          lines.renderOrder = 3;
          w.mats.push(mat); disposables.push(mat);
          holder.add(lines);
        }
        scene.add(holder); added.push(holder);
        w.obj = holder;
        // two dry stems hold it, leaning a little
        const rx = Math.cos(yaw), rz = -Math.sin(yaw);
        for (let k = 0; k < 2; k++) {
          const sgn = k ? 1 : -1, px = x + rx * sgn * (WEB_R + 0.06), pz = z + rz * sgn * (WEB_R + 0.06);
          E.set((i * 0.37 % 0.16) - 0.08, 0, sgn * 0.07);
          Q.setFromEuler(E);
          S.set(1, s.h + WEB_R + 0.25 + (k ? 0.12 : 0), 1);
          P.set(px, world.heightAt(px, pz) - 0.05, pz);
          stems.setMatrixAt(i * 2 + k, M.compose(P, Q, S));
        }
        // the drops sit on the spokes and rings of the web
        for (let k = 0; k < DROPS; k++) {
          const j = i * DROPS + k;
          const ring = 0.25 + 0.75 * ((k * 7 % DROPS) / DROPS), a = (k * 2.399963) % (Math.PI * 2);
          const lx = Math.cos(a) * ring * WEB_R, ly = Math.sin(a) * ring * WEB_R;
          dPos[j * 3] = x + rx * lx; dPos[j * 3 + 1] = w.y + ly; dPos[j * 3 + 2] = z + rz * lx;
          dWeb[j] = i; dPh[j] = (k * 0.6180339) % 1;
        }
        return w;
      });
      stems.instanceMatrix.needsUpdate = true;
      scene.add(stems); added.push(stems);
      const dGeo = new THREE.BufferGeometry();
      dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
      dGeo.setAttribute('aWeb', new THREE.BufferAttribute(dWeb, 1));
      dGeo.setAttribute('aPhase', new THREE.BufferAttribute(dPh, 1));
      const uVis = new Float32Array(DEW.maxWebs);
      const dMat = new THREE.ShaderMaterial({
        vertexShader: DROP_VERT, fragmentShader: DROP_FRAG, uniforms: { uVis: { value: uVis }, uScale: { value: 300 }, uTime: { value: 0 } },
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      });
      const drops = new THREE.Points(dGeo, dMat);
      drops.frustumCulled = false;
      drops.renderOrder = 5;
      scene.add(drops); added.push(drops);
      disposables.push(dGeo, dMat);

      // ---- UI: the viewfinder over a web in reach, the found dots, the flash and the framed shot
      const mk = (id, html = '') => { const e = document.createElement('div'); e.id = id; e.innerHTML = html; document.body.appendChild(e); dom.push(e); return e; };
      aim = mk('dewAim', '<span></span>');
      aim.classList.add('hidden');
      const flash = mk('dewFlash');
      const shot = mk('dewShot', '<div class="f"><div class="c"></div></div>');
      shot.classList.add('hidden');
      const dots = mk('dewDots', '<i></i>'.repeat(total));
      let clicked = false;
      onAim = e => { e.preventDefault(); e.stopPropagation(); clicked = true; };
      aim.addEventListener('pointerdown', onAim);
      const aimText = aim.querySelector('span');
      const txPhoto = tx(N_('Photo: {act}')), txSide = tx(N_('Sun behind you!')), txBest = tx(N_('Perfect spot! {act}'));
      let aimMode = '', aimX = NaN, aimY = NaN;
      // the score on the HUD, from one reused record (asked every frame)
      const tally = { found: 0, total, seconds: 0, length: ctx.roundTime, perfect: 0, decoys: 0 };
      const scoreNow = () => { tally.found = st.found; tally.seconds = st.seconds; tally.perfect = st.perfect; tally.decoys = st.decoys; return dewScore(tally); };

      const st = { found: 0, seconds: 0, phase: 'look', near: -1, check: 'far', perfect: 0, decoys: 0, dried: 0, best: false };
      // the drying: the sunny side first, from the middle of the round on (Normal and Difficult)
      const dries = dryTimes(webs.map(w => ({ x: w.x - cx, z: w.z - cz, decoy: w.decoy })), sunX, sunZ, ctx.roundTime, L.dry);
      webs.forEach((w, i) => { w.dryAt = dries[i]; });
      let dryStart = L.dry > 0 ? ctx.roundTime * L.dry : Infinity, dryHint = 0;
      const left0 = () => webs.some(w => !w.decoy && !w.found && !w.dry);
      ctx.debug.webs = webs;
      ctx.debug.sun = { x: sunX, z: sunZ };
      ctx.debug.dew = () => ({ phase: st.phase, found: st.found, total, near: st.near, check: st.check, seconds: st.seconds, model: !!g.assets.has('spider-web'), seed,
        level: ctx.level, perfect: st.perfect, decoys: st.decoys, dried: st.dried, best: st.best, webs: webs.length });
      /** Where to stand to photograph web i (the QA autopilot walks or teleports here): 2.2 m to its sunward side. */
      ctx.debug.standFor = i => ({ x: webs[i].x + sunX * 2.2, z: webs[i].z + sunZ * 2.2 });

      if (!isDawn) { await ctx.wait(0.15); ctx.lock(false); await ctx.fade(false, 600); }
      if (ctx.quit) return { score: 0, quit: true };
      ctx.hud(0, ctx.roundTime);
      ctx.hint(ctx.first ? N_('Six webs hide between the dry stems. Keep the sun behind you and they light up. Then press {act} for a photo.')
        : L.decoys ? tx('{n} dew webs, and old ones with no dew: leave those! In line with the sun, a photo is perfect.', { n: total })
          : tx('Find the {n} dew webs. Sun behind you, then {act} for a photo.', { n: total }), 6.5);

      const sp = new V3(), camTo = new V3(), camLook = new V3();
      let left = ctx.roundTime, sinceFind = 0, nudge = 0, sideHint = 0, farHint = 0, shotT = 0, flashT = 0;
      const res = await ctx.loop(dt => {
        dMat.uniforms.uTime.value = ctx.t;
        dMat.uniforms.uScale.value = (g.renderer?.renderer?.domElement?.height || innerHeight) * 1.0;
        if (flashT > 0) { flashT -= dt; flash.style.opacity = String(Math.max(0, flashT / 0.4)); }

        // the framed shot: Mika holds still, the camera looks at the web from its bright side
        if (st.phase === 'shot') {
          ctx.groundPose?.({ kneel: true });
          shotT -= dt;
          if (shotT <= 0) {
            st.phase = 'look';
            shot.classList.add('hidden');
            g.follow.clearCutscene(true);
            ctx.lock(false);
            if (!left0()) return { done: true };
          }
          return undefined;
        }

        left -= dt; st.seconds += dt; sinceFind += dt;
        const px = p.pos.x, pz = p.pos.z;
        // the second half: the sun climbs and the webs dry, the sunny side first
        if (st.seconds >= dryStart) {
          dryStart = Infinity;
          audio.chime?.(2);
          ctx.hint(N_('Part 2: the sun is climbing! The webs on the sunny side dry first.'), 5.5);
        }
        dryHint -= dt;
        // each web shows by how close Mika is and whether the sun is behind her; found ones stay lit
        for (const w of webs) {
          const wet = w.found ? 1 : 1 - dryness(st.seconds, w.dryAt);
          if (!w.found && !w.dry && wet <= 0) {
            // dried away before she found it: its dot goes out (from the far end of the row)
            w.dry = true; st.dried++;
            dots.children[total - st.dried]?.classList.add('gone');
            if (dryHint <= 0) { dryHint = 8; ctx.hint(N_('A web has dried away. Hurry to the ones still in the shade!'), 3.5); }
          }
          const target = w.found && !w.decoy ? 1 : webVisibility(px - w.x, pz - w.z, sunX, sunZ, far) * wet;
          w.vis += (target - w.vis) * Math.min(1, dt * 5);
          uVis[w.i] = w.decoy ? 0 : w.vis;               // an old web carries no drops at all
          if (Math.abs(w.vis - w.shown) > 0.01) {
            w.shown = w.vis;
            for (const m of w.mats) m.opacity = Math.min(1, w.vis * (m.isLineBasicMaterial ? 0.85 : 1));
          }
        }
        // the web in reach: a viewfinder over it
        const n = nearestWeb(webs, px, pz);
        st.near = n;
        st.check = n < 0 ? 'far' : photoCheck(px - webs[n].x, pz - webs[n].z, sunX, sunZ);
        ctx.groundPose?.({ kneel: n >= 0 && st.check === 'ok' && Math.hypot(px - webs[n].x, pz - webs[n].z) <= 3.5 });
        st.best = L.grade && st.check === 'ok' && photoPerfect(px - webs[n].x, pz - webs[n].z, sunX, sunZ);
        const press = ctx.pressed() || clicked;
        clicked = false;
        let mode = '';
        if (st.check !== 'far') {
          sp.copy(webs[n].pos).project(cam);
          if (sp.z < 1 && Math.abs(sp.x) < 1.1 && Math.abs(sp.y) < 1.1) {
            mode = st.check;
            const ax = Math.round((sp.x * 0.5 + 0.5) * innerWidth), ay = Math.round((-sp.y * 0.5 + 0.5) * innerHeight);
            if (ax !== aimX || ay !== aimY) { aimX = ax; aimY = ay; aim.style.transform = `translate(${ax}px, ${ay}px)`; }
          } else mode = st.check === 'ok' ? 'off' : '';
        }
        if (mode === 'ok' && st.best) mode = 'best';
        if (mode !== aimMode) {
          aimMode = mode;
          aim.classList.toggle('hidden', mode !== 'ok' && mode !== 'side' && mode !== 'best');
          aim.classList.toggle('side', mode === 'side');
          aim.classList.toggle('best', mode === 'best');
          aimText.textContent = mode === 'side' ? txSide : mode === 'best' ? txBest : txPhoto;
        }
        sideHint -= dt; farHint -= dt;
        if (press) {
          if (st.check === 'ok') {
            const w = webs[n];
            if (w.decoy) {
              // an old web with no dew: the photo shows nothing, and costs a little
              w.found = true; st.decoys++; sinceFind = 0;
              flashT = 0.4; flash.style.opacity = '1';
              audio.click(); audio.miss();
              st.phase = 'shot'; shotT = SHOT_TIME * 0.8;
              ctx.lock(true);
              camTo.set(w.x + sunX * 2.1, w.y + 0.25, w.z + sunZ * 2.1);
              camLook.copy(w.pos);
              g.follow.cutscene({ pos: camTo, look: camLook }, 0.001);
              shot.querySelector('.c').textContent = tx('An old web: no dew');
              shot.classList.remove('hidden');
              aim.classList.add('hidden'); aimMode = '';
              ctx.hud(scoreNow(), left);
              ctx.hint(N_('No dew on that one: an old, empty web. Look for the sparkle first!'), 4);
              return undefined;
            }
            const perfect = st.best;
            w.found = true; st.found++; sinceFind = 0; nudge = 0;
            if (perfect) st.perfect++;
            dots.children[st.found - 1]?.classList.add('on');
            if (perfect) dots.children[st.found - 1]?.classList.add('best');
            flashT = 0.4; flash.style.opacity = '1';
            audio.click(); audio.twinkle(2); audio.good();
            if (perfect) audio.star?.();
            fx.burst?.(w.pos.clone(), { n: 14, color: [0.8, 0.95, 1], speed: 0.9, size: 0.1, gravity: 0 });
            if (!p.anim?.has('Kneel')) p.gesture('Interact', { lock: false });
            // the shot: from the sunward side, a little above, the web filling the frame
            st.phase = 'shot'; shotT = SHOT_TIME;
            ctx.lock(true);
            camTo.set(w.x + sunX * 2.1, w.y + 0.25, w.z + sunZ * 2.1);
            camLook.copy(w.pos);
            g.follow.cutscene({ pos: camTo, look: camLook }, 0.001);
            shot.querySelector('.c').textContent = `${tx('Web {n} of {total}', { n: st.found, total })}${perfect ? ' ★' : ''}`;
            shot.classList.remove('hidden');
            aim.classList.add('hidden'); aimMode = '';
            ctx.hud(scoreNow(), left);
            if (st.found === 1 && ctx.first) ctx.hint(N_('Got it! Every drop is a tiny lens. Five more to find.'), 3.5);
            else if (st.found === total) ctx.hint(total === 6 ? N_('All six! By noon the dew is gone and they vanish again.') : N_('Every web found! By noon the dew is gone and they vanish again.'), 4);
            else if (perfect && st.perfect === 1) ctx.hint(N_('A perfect photo! Right in line with the sun.'), 3.5);
            return undefined;
          }
          if (st.check === 'side' && sideHint <= 0) { sideHint = 5; audio.miss(); ctx.hint(N_('Too faint from this side. Walk round until the sun is behind you.'), 3.5); }
          else if (st.check === 'far' && farHint <= 0) { farHint = 6; ctx.hint(N_('No web close enough. Look for a glint low between two dry stems.'), 3.5); }
        }
        // nudges: a glint at the nearest web when the search drags on (sooner in the guided try)
        if (n >= 0 && sinceFind > (ctx.first ? 9 : 20)) {
          nudge -= dt;
          if (nudge <= 0) {
            nudge = 2.5;
            fx.glint?.(webs[n].pos, false);
            if (sinceFind < (ctx.first ? 9 : 20) + 3) ctx.hint(N_('There: something glinted. Go and look, with the sun at your back.'), 3.5);
          }
        }
        ctx.hud(scoreNow(), left);
        if (!left0() && st.phase === 'look') return { done: true };
        if (left <= 0) { ctx.hint(N_('The sun is up and the dew is drying. The rest will keep for another dawn.'), 3.5); return { done: true }; }
        return undefined;
      });

      const score = scoreNow();
      aim.classList.add('hidden');
      shot.classList.add('hidden');
      if (!res?.quit) await ctx.wait(1.4);
      if (!isDawn) await ctx.fade(true, 350);
      cleanup();
      if (!isDawn) await ctx.fade(false, 500);
      return {
        score, found: st.found, quit: !!res?.quit && !st.found,
        extra: st.found >= total && total > 0 ? N_('every web found') : undefined,
        detail: { level: ctx.level, found: st.found, total, perfect: st.perfect, decoys: st.decoys, dried: st.dried },
      };
    } finally {
      if (!cleaned) { cleanup(); ctx.fade(false, 300); }
    }
  },
};
