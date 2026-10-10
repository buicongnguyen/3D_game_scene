// "Look up at the sky": at the lamp towers and a few high, open places (content/skyspots.js) Mika can stop and look
// up. The camera tilts from behind her to the sky. By night: a deep star field and shooting stars to wish on (the action
// key while one is falling; the wishes are counted in the save). At dusk: the first stars, earlier beside a lit lamp.
// By day: the clouds, a few birds, and a line saying the stars come out at night. The story clock is never touched.
// Leave any time: move, Jump, Backspace, Esc or the "Look down" button; Mika is free the moment she looks down.
//
// Drawing: one Points mesh for the stars, one small ribbon mesh for the pooled shooting stars, one Points for their
// heads and one tiny mesh for the birds. All of it is built when Mika looks up and disposed when she looks down;
// nothing is allocated per frame.
import * as THREE from 'three';
import { SKY_SPOTS, LAMP_STEP, skyLook, cleanWishes, wishLineIndex } from '../content/skyspots.js';
import { tx, N_ } from '../i18n/i18n.js';

const R = 900;                          // star dome radius around the camera
const ELEV = 37 * Math.PI / 180;        // how far up the view centre is
const STREAKS = 4;                      // pooled shooting stars
const BIRDS = 6;
const PRIO = -0.3;                      // anything else within reach wins the prompt (talks, doors, signs, the lamp itself)

// Mika's thought after a wish (the first, then every third)
const WISH_LINES = [
  N_("Quick, a wish! …Done. I'm not telling."),
  N_("In the city I counted four stars. Here I've lost count twice."),
  N_('That one was for everybody in the valley.'),
  N_('I wished for a warm peach bun. Priorities.'),
  N_('Tamo says every wish lands somewhere. I hope mine lands here.'),
  N_("The lamps down there, the stars up here. Nobody's lost tonight."),
  N_('Another one. The sky is showing off.'),
  N_('I wished to remember this exactly as it is.'),
];
const LINES = {
  night: [N_('So many stars. Press {act} when one falls, and make a wish.'), N_('Keep watching. They fall every few seconds out here.')],
  dusk: [N_('Almost dark. The first stars are coming out.'), N_('Come back when it is night: the whole sky fills up, and the stars fall.')],
  duskLamp: [N_('The first stars are early tonight. The lamp must have woken them.'), N_('Come back when it is night: the whole sky fills up, and the stars fall.')],
  day: [N_('Big slow clouds. One looks like a sheep. One looks like a bun.'), N_('The stars come out after dark. Come back tonight and look up again.')],
  dayLamp: [N_('Big slow clouds. One looks like a sheep. One looks like a bun.'), N_('After dark the lamp towers light the way home, and the stars come out to watch.')],
  snow: [N_('Snowflakes on my nose. Somewhere above them, the stars are waiting for dark.'), N_('The stars come out after dark. Come back tonight and look up again.')],
  rain: [N_('Rain on my face. No stars tonight, but the lamp towers still shine.')],
};

const CSS = `
#skyGaze{position:fixed;inset:0;z-index:15;pointer-events:none;font:700 16px Nunito,system-ui,sans-serif;zoom:var(--ui-scale,1)}
#skyGaze .line{position:absolute;left:50%;bottom:calc(96px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);max-width:min(520px,88vw);
 padding:10px 16px;border-radius:18px;background:rgba(20,26,54,.78);color:#fff;text-align:center;box-shadow:0 6px 18px rgba(0,0,0,.3);transition:opacity .4s}
#skyGaze .line.wish{background:rgba(255,214,107,.95);color:#3b1c05}
#skyGaze .count{position:absolute;left:50%;top:calc(16px + env(safe-area-inset-top,0px));transform:translateX(-50%);padding:6px 14px;border-radius:999px;
 background:rgba(20,26,54,.7);color:#ffe9a8;font:600 17px Fredoka,Nunito,sans-serif;white-space:nowrap}
#skyGaze .count.pop{animation:skyPop .5s}
#skyGaze .down{position:absolute;left:50%;bottom:calc(30px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);pointer-events:auto;cursor:pointer;
 padding:9px 18px;border:0;border-radius:999px;background:rgba(255,253,246,.94);color:#4a3020;font:700 15px Nunito,system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.3);white-space:nowrap}
#skyGaze .down kbd{font:700 12px Nunito,sans-serif;padding:1px 6px;border-radius:5px;background:#0002;margin-left:8px}
body.touch #skyGaze .line{bottom:calc(150px + env(safe-area-inset-bottom,0px))}
body.touch #skyGaze .down{left:16px;transform:none;bottom:auto;top:calc(16px + env(safe-area-inset-top,0px));padding:11px 18px}
@media (max-width:560px){body.touch #skyGaze .count{left:auto;right:16px;transform:none}}
#skyGaze .hide{opacity:0}
body.sky-gaze #objective,body.sky-gaze #inventory,body.sky-gaze #marker,body.sky-gaze #compass,body.sky-gaze #prompt,body.sky-gaze #toasts,body.sky-gaze #leap{visibility:hidden}
body.sky-gaze .bark{display:none}
@media (max-width:560px){body.sky-gaze #clock{visibility:hidden}}
@keyframes skyPop{0%{filter:brightness(1)}40%{filter:brightness(1.9)}100%{filter:brightness(1)}}
`;

const STAR_VERT = `
attribute float aSize;
attribute vec3 aColor;
uniform float uPx;
uniform float uTime;
uniform float uFade;
uniform float uMin;
varying vec3 vColor;
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  float tw = 0.8 + 0.2 * sin(uTime * (1.2 + fract(position.x * 0.13) * 3.0) + position.z);
  gl_PointSize = aSize * uPx * step(uMin, aSize);
  vColor = aColor * tw * uFade;
}`;
const STAR_FRAG = `
varying vec3 vColor;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.05, d);
  gl_FragColor = vec4(vColor, a * a);
}`;
const STREAK_VERT = `
attribute float aAlpha;
varying vec2 vUv;
varying float vA;
void main() { vUv = uv; vA = aAlpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const STREAK_FRAG = `
varying vec2 vUv;
varying float vA;
void main() {
  float across = 1.0 - abs(vUv.x - 0.5) * 2.0;
  float a = vA * pow(max(vUv.y, 0.0), 1.7) * max(across, 0.0) * across;
  gl_FragColor = vec4(mix(vec3(0.75, 0.86, 1.0), vec3(1.0, 0.97, 0.86), vUv.y) * a, a);
}`;

const V3 = THREE.Vector3;
const starMaterial = () => new THREE.ShaderMaterial({
  vertexShader: STAR_VERT, fragmentShader: STAR_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  uniforms: { uPx: { value: 1 }, uTime: { value: 0 }, uFade: { value: 0 }, uMin: { value: 0 } },
});

/** The star dome (seeded, the same sky every night): a field of faint and bright stars and the Milky Way's band. */
export function buildStars() {
  let seed = 20261010;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pos = [], size = [], col = [];
  const tint = () => { const k = rand(); return k < 0.16 ? [0.74, 0.85, 1] : k < 0.27 ? [1, 0.86, 0.66] : [1, 1, 0.95]; };
  for (let i = 0; i < 1500; i++) {
    const y = rand() * 1.04 - 0.04, a = rand() * Math.PI * 2, h = Math.sqrt(Math.max(0, 1 - y * y));
    const m = Math.pow(rand(), 6), c = tint(), b = 0.5 + m * 0.9;
    pos.push(Math.cos(a) * h * R, y * R, Math.sin(a) * h * R); size.push(2.2 + m * 5.2); col.push(c[0] * b, c[1] * b, c[2] * b);
  }
  const n = new V3(0.55, 0.42, 0.72).normalize(), e1 = new V3().crossVectors(n, new V3(0, 1, 0)).normalize(), e2 = new V3().crossVectors(n, e1), d = new V3();
  for (let i = 0; i < 1500; i++) {
    const th = rand() * Math.PI * 2, gauss = (rand() + rand() + rand() - 1.5) * (0.12 + 0.08 * Math.cos(th * 2));
    d.copy(e1).multiplyScalar(Math.cos(th)).addScaledVector(e2, Math.sin(th)).addScaledVector(n, gauss).normalize();
    const b = 0.2 + rand() * 0.36;
    if (d.y < -0.04) continue;
    pos.push(d.x * R, d.y * R, d.z * R); size.push(1.7 + rand() * 1.4); col.push(0.8 * b, 0.86 * b, b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new THREE.Float32BufferAttribute(size, 1));
  geo.setAttribute('aColor', new THREE.Float32BufferAttribute(col, 3));
  const pts = new THREE.Points(geo, starMaterial());
  pts.frustumCulled = false;
  pts.renderOrder = 5;
  return pts;
}

/** The pooled shooting stars: a ribbon (two triangles) per streak and a glowing point at each head. */
function buildStreaks() {
  const geo = new THREE.BufferGeometry();
  const uv = new Float32Array(STREAKS * 8), idx = [];
  for (let i = 0; i < STREAKS; i++) {
    uv.set([0, 0, 1, 0, 0, 1, 1, 1], i * 8);          // tail left, tail right, head left, head right
    idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 1, i * 4 + 3, i * 4 + 2);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(STREAKS * 12), 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(STREAKS * 4), 1).setUsage(THREE.DynamicDrawUsage));
  geo.setIndex(idx);
  const ribbons = new THREE.Mesh(geo, new THREE.ShaderMaterial({
    vertexShader: STREAK_VERT, fragmentShader: STREAK_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  }));
  ribbons.frustumCulled = false;
  ribbons.renderOrder = 6;
  const hgeo = new THREE.BufferGeometry();
  hgeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(STREAKS * 3), 3).setUsage(THREE.DynamicDrawUsage));
  hgeo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(STREAKS), 1).setUsage(THREE.DynamicDrawUsage));
  hgeo.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(STREAKS * 3), 3).setUsage(THREE.DynamicDrawUsage));
  const heads = new THREE.Points(hgeo, starMaterial());
  heads.material.uniforms.uFade.value = 1;
  heads.frustumCulled = false;
  heads.renderOrder = 7;
  return { ribbons, heads };
}

function buildBirds() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(BIRDS * 18), 3).setUsage(THREE.DynamicDrawUsage));
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x27303f, side: THREE.DoubleSide, fog: false, transparent: true, opacity: 0.85 }));
  m.frustumCulled = false;
  return m;
}

export class SkyGaze {
  constructor(director) {
    this.d = director;
    this.g = director.game;
    this.active = null;         // the spot Mika is looking up from
    this.locks = false;         // true while she looks up (read by director.update)
    this.returning = 0;         // seconds left of the camera's way back down
    this.spots = [];
    // scratch (nothing is allocated per frame)
    this.F = new V3(); this.Rt = new V3(); this.U = new V3(); this.eye = new V3(); this.look = new V3();
    this.a = new V3(); this.b = new V3(); this.c = new V3(); this.e = new V3(); this.q = new THREE.Quaternion(); this.qx = new THREE.Quaternion();
    this.streaks = [];
    for (let i = 0; i < STREAKS; i++) this.streaks.push({ on: false, t: 0, dur: 1, big: false, wished: false, from: new V3(), to: new V3(), head: new V3() });
    this.birds = [];
    for (let i = 0; i < BIRDS; i++) this.birds.push({ off: new V3(), phase: i * 1.7, size: 1 });
    this.onKey = e => {
      // Esc looks down instead of opening the pause menu (a menu that is already open keeps its own Esc)
      if (e.code !== 'Escape' || !this.active || this.g.paused || this.d.ui.overlay || this.d.ui.dialogueOpen) return;
      e.preventDefault(); e.stopImmediatePropagation();
      this.wantLeave = true;
    };
    for (const s of SKY_SPOTS) this.register(s);
  }

  get st() { return this.d.q?.state; }
  get wishes() { return cleanWishes(this.st?.wishes); }

  // ------------------------------------------------------------------ the places
  register(s) {
    const g = this.g, gal = g.structures.gallery;
    let x = s.x, z = s.z, y;
    if (s.on === 'gallery') { if (!gal) return; x = gal.x; z = gal.z; y = gal.y; }
    else if (s.on === 'deck') y = s.y;
    else y = g.world.heightAt(x, z);
    const spot = { ...s, pos: new V3(x, y + 1, z) };
    this.spots.push(spot);
    const when = () => this.canStart(spot);
    this.d.interact(`sky:${s.id}`, spot.pos, N_('Look up at the sky'), when, () => this.start(spot), s.r, null, PRIO, s.on === 'ground' ? 3.2 : 2);
  }

  /** May Mika look up here now? Not in the prologue, not while this lamp is the story's job, and only on her feet. */
  canStart(spot) {
    const st = this.st, g = this.g, p = g.player;
    if (!st || st.chapter < 1 || this.active || this.d.tricks?.round || this.d.scenes?.active) return false;
    if (spot.lamp && st.step === LAMP_STEP[spot.lamp]) return false;
    return p.grounded && !p.swimming && !p.mounted && !g.interiors?.active && !g.kite?.active;
  }

  /** What the sky shows now: { look: 'night' | 'dusk' | 'day' | 'rain', lampLit, snow }. */
  mode(spot) {
    const g = this.g, lampLit = !!(spot.lamp && this.st?.lamps?.[spot.lamp]);
    const season = g.shownSeason || g.time.season;
    return { look: skyLook(g.shownHour(), { lampLit, raining: g.fx?.weather === 'rain' }), lampLit, snow: season === 'winter' && !g.weatherOff };
  }

  // ------------------------------------------------------------------ looking up
  start(spot) {
    const d = this.d, g = this.g, p = g.player;
    if (this.active || !this.canStart(spot)) return;
    if (this.returning > 0) this.endReturn();
    this.active = spot;
    this.locks = true;
    this.t = 0; this.wantLeave = false; this.moved = true; this.lineT = 0; this.lineI = 0; this.thoughtT = 0; this.saveDue = false;
    this.m = this.mode(spot);
    p.vel.set(0, 0, 0);
    d.ui.prompt(null);
    // Mika turns to the tower (or the open view) and tips her head back
    // (a tower close by is kept to one side of the view, so it frames the sky instead of filling it)
    const aspect = g.camera.aspect, fx = spot.face.x - p.pos.x, fz = spot.face.z - p.pos.z, fd = Math.hypot(fx, fz);
    this.beside = !!spot.lamp && fd > 0.5 && fd < 12;        // a tower fills the left of the view: the stars fall on the right
    this.yaw = fd > 0.5 ? Math.atan2(fx, fz) - (this.beside ? (aspect < 1 ? 0.26 : 0.3) : 0) : p.facing;
    const anim = p.anim, clip = anim && ['LookUp', 'Look_Up', 'Gaze'].find(n => anim.has(n));
    this.poseWas = p.pose;
    p.carry?.want('worn', 'skygaze');        // looking up at the sky, hands free
    if (clip) p.pose = clip;
    else {
      this.head = null;
      p.model?.traverse(o => { if (!this.head && o.isBone && /head/i.test(o.name)) this.head = o; });
      this.headWrote = null;
    }
    // the camera: low behind her shoulder, tilting up until the sky fills the frame and her head stays at the bottom
    // (closer in on the deck and the gallery, where there is little floor behind her)
    const tight = spot.on === 'deck' || spot.on === 'gallery', back = tight ? 2.3 : 3.2;
    const side = tight ? 0.25 : Math.min(0.9, 0.42 * aspect), sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const pivot = this.a.copy(p.pos); pivot.y += 1.2;
    const eye = this.eye.set(p.pos.x - sin * back - cos * side, p.pos.y + (tight ? 0.6 : 0.45), p.pos.z - cos * back + sin * side);
    const hit = g.colliders.raycast(pivot.x, pivot.y, pivot.z, eye.x, eye.y, eye.z);
    if (hit < 1) eye.lerpVectors(pivot, eye, Math.max(0.3, hit - 0.12));
    const ground = spot.on === 'ground' || spot.on === 'island' ? g.world.heightAt(eye.x, eye.z) : -1e9;
    if (eye.y < ground + 0.4) eye.y = ground + 0.4;
    this.F.set(sin * Math.cos(ELEV), Math.sin(ELEV), cos * Math.cos(ELEV));
    this.Rt.crossVectors(this.F, this.b.set(0, 1, 0)).normalize();
    this.U.crossVectors(this.Rt, this.F).normalize();
    this.look.copy(eye).addScaledVector(this.F, 20);
    g.follow.yaw = this.yaw;                                 // Tamo keeps his place at her side, as seen from the new view
    g.follow.cutscene({ pos: eye, look: this.look }, 1.5);
    this.shot = g.follow.shot;
    this.build();
    document.body.classList.add('sky-gaze');
    addEventListener('keydown', this.onKey, true);
    this.ui(true);
    this.say(this.lines()[0], 6);
    this.nextStar = this.m.look === 'night' ? 2.2 : 5.5;
    d.audio.twinkle?.(1.5);
  }

  lines() {
    const m = this.m;
    if (m.look === 'rain') return LINES.rain;
    if (m.look === 'night') return LINES.night;
    if (m.look === 'dusk') return m.lampLit ? LINES.duskLamp : LINES.dusk;
    if (m.snow) return LINES.snow;
    return this.active.lamp ? LINES.dayLamp : LINES.day;
  }

  build() {
    const g = this.g, look = this.m.look;
    this.group = new THREE.Group();
    this.group.name = 'sky-gaze';
    if (look === 'night' || look === 'dusk') {
      this.stars = buildStars();
      // at dusk only the brightest few show, and faintly
      this.stars.material.uniforms.uMin.value = look === 'dusk' ? 4.3 : 0;
      this.fadeTo = look === 'dusk' ? 0.55 : 1;
      const s = buildStreaks();
      this.ribbons = s.ribbons; this.heads = s.heads;
      this.group.add(this.stars, this.ribbons, this.heads);
    }
    if (look === 'day' || look === 'dusk') {
      this.flock = buildBirds();
      this.flockX = -1.3; this.flockV = 0.11 + Math.random() * 0.05; this.flockY = 0.15 + Math.random() * 0.4;
      for (const b of this.birds) { b.off.set((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 7, (Math.random() - 0.5) * 10); b.size = 0.8 + Math.random() * 0.5; }
      this.group.add(this.flock);
    }
    for (const s of this.streaks) s.on = false;
    g.scene.add(this.group);
  }

  dispose() {
    if (!this.group) return;
    this.group.removeFromParent();
    for (const o of [this.stars, this.ribbons, this.heads, this.flock]) if (o) { o.geometry.dispose(); o.material.dispose(); }
    this.group = this.stars = this.ribbons = this.heads = this.flock = null;
  }

  // ------------------------------------------------------------------ UI
  ui(on) {
    if (typeof document === 'undefined') return;
    if (!on) { this.el?.remove(); this.el = null; return; }
    if (!document.getElementById('skyGazeCss')) {
      const s = document.createElement('style');
      s.id = 'skyGazeCss';
      s.textContent = CSS;
      document.head.appendChild(s);
    }
    const el = this.el = document.createElement('div');
    el.id = 'skyGaze';
    el.innerHTML = '<div class="count"></div><div class="line hide"></div><button class="down" type="button"></button>';
    const down = el.querySelector('.down');
    down.textContent = tx('Look down');
    if (!this.d.ui.touch) { const k = document.createElement('kbd'); k.textContent = 'Space'; down.appendChild(k); }
    const leave = e => { e.preventDefault(); e.stopPropagation(); this.wantLeave = true; };
    down.addEventListener('click', leave);
    down.addEventListener('touchstart', leave, { passive: false });
    document.body.appendChild(el);
    this.count();
  }

  count(pop) {
    const c = this.el?.querySelector('.count');
    if (!c) return;
    const n = this.wishes, show = this.m.look === 'night' || this.m.look === 'dusk' || n > 0;
    c.style.display = show ? '' : 'none';
    c.textContent = `★ ${tx('Wishes: {n}', { n })}`;
    if (pop) { c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop'); }
  }

  say(text, life = 5, wish = false) {
    const l = this.el?.querySelector('.line');
    if (!l) return;
    l.textContent = tx(text);
    l.classList.toggle('wish', wish);
    l.classList.remove('hide');
    this.lineLeft = life;
  }

  // ------------------------------------------------------------------ shooting stars
  launch(big) {
    const s = this.streaks.find(x => !x.on);
    if (!s) return;
    const cam = this.g.camera, tv = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)), th = tv * cam.aspect;
    const u0 = (this.beside ? 0.05 + Math.random() * 0.7 : (Math.random() * 2 - 1) * 0.7) * th, v0 = (0.15 + Math.random() * 0.7) * tv;
    const dir = Math.random() < 0.5 ? -1 : 1, len = big ? 1.8 : 1.25;
    const du = dir * (0.28 + Math.random() * 0.3) * Math.max(th, 0.42) * len, dv = -(0.3 + Math.random() * 0.3) * tv * len;
    s.from.copy(this.F).addScaledVector(this.Rt, u0 - du * 0.5).addScaledVector(this.U, v0 - dv * 0.35).normalize();
    s.to.copy(this.F).addScaledVector(this.Rt, u0 + du * 0.5).addScaledVector(this.U, v0 + dv * 0.65).normalize();
    Object.assign(s, { on: true, t: 0, big, wished: false, wt: 0, dur: big ? 1.9 : 0.95 + Math.random() * 0.35 });
    if (big) this.d.audio.chime?.(Math.floor(Math.random() * 6)); else this.d.audio.twinkle?.(2);
    if (!this.taught && !this.wishes) { this.taught = true; this.say(N_('A shooting star! Press {act} to wish on it.'), 4); }
  }

  /** A falling star that can still be wished on (the brightest one), or null. */
  wishable() {
    let best = null;
    for (const s of this.streaks) if (s.on && !s.wished && s.t < s.dur + 0.3 && (!best || s.big)) best = s;
    return best;
  }

  wish(s) {
    const d = this.d, st = this.st, cam = this.g.camera;
    s.wished = true; s.wt = s.t;
    st.wishes = this.wishes + 1;
    this.saveDue = true;
    this.e.copy(s.head).normalize().multiplyScalar(30).add(cam.position);
    d.fx.burst?.(this.e, { n: s.big ? 46 : 26, color: [1, 0.95, 0.62], speed: s.big ? 3 : 2, size: 0.3, gravity: 0 });
    if (s.big) d.audio.star?.(); else d.audio.good?.();
    this.count(true);
    const i = wishLineIndex(st.wishes, WISH_LINES.length);
    if (i >= 0) this.say(WISH_LINES[i], 5, true);
    else if (s.big) this.say(N_('A big one! That wish counts double. Probably.'), 4, true);
  }

  updateStreaks(dt) {
    const pos = this.ribbons.geometry.attributes.position, al = this.ribbons.geometry.attributes.aAlpha;
    const hp = this.heads.geometry.attributes.position, hs = this.heads.geometry.attributes.aSize, hc = this.heads.geometry.attributes.aColor;
    const Rr = R * 0.9;
    this.streaks.forEach((s, i) => {
      let alpha = 0;
      if (s.on) {
        s.t += dt;
        const k = Math.min(1, s.t / s.dur), tail = s.big ? 0.5 : 0.42, over = Math.max(0, s.t - s.dur);
        alpha = Math.min(1, s.t / 0.12) * Math.max(0, 1 - over / 0.4) * (s.wished ? Math.max(0, 1 - (s.t - s.wt) / 0.3) : 1);
        if (over > 0.4 || (alpha <= 0 && s.t > 0.2)) { s.on = false; alpha = 0; }
        // head and tail on the dome, the ribbon turned to face the camera (which sits at the dome's centre)
        const h = s.head.copy(s.from).lerp(s.to, k).normalize().multiplyScalar(Rr);
        const t = this.a.copy(s.from).lerp(s.to, Math.max(0, k - tail + Math.min(tail, over * 0.9))).normalize().multiplyScalar(Rr);
        const w = this.b.copy(h).sub(t).cross(h).normalize().multiplyScalar(Rr * (s.big ? 0.011 : 0.006));
        pos.setXYZ(i * 4, t.x - w.x * 0.15, t.y - w.y * 0.15, t.z - w.z * 0.15);
        pos.setXYZ(i * 4 + 1, t.x + w.x * 0.15, t.y + w.y * 0.15, t.z + w.z * 0.15);
        pos.setXYZ(i * 4 + 2, h.x - w.x, h.y - w.y, h.z - w.z);
        pos.setXYZ(i * 4 + 3, h.x + w.x, h.y + w.y, h.z + w.z);
        hp.setXYZ(i, h.x, h.y, h.z);
      }
      if (!s.on) {
        // a resting streak is folded into one point up on the dome (never at the camera, where it could not be projected)
        for (let v = 0; v < 4; v++) pos.setXYZ(i * 4 + v, 0, Rr, 0);
        hp.setXYZ(i, 0, Rr, 0);
      }
      for (let v = 0; v < 4; v++) al.setX(i * 4 + v, alpha);
      hs.setX(i, alpha > 0 ? (s.big ? 18 : 11) : 0);
      hc.setXYZ(i, alpha, alpha * 0.97, alpha * 0.88);
    });
    pos.needsUpdate = al.needsUpdate = hp.needsUpdate = hs.needsUpdate = hc.needsUpdate = true;
  }

  updateBirds(dt) {
    // a small flock crossing the view: two triangles per bird, the wing tips beating
    this.flockX += this.flockV * dt;
    if (this.flockX > 1.5) { this.flockX = -1.5; this.flockY = 0.1 + Math.random() * 0.5; }
    const cam = this.g.camera, tv = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)), th = Math.max(0.42, tv * cam.aspect), D = 130;
    const c = this.c.copy(this.F).addScaledVector(this.Rt, this.flockX * th).addScaledVector(this.U, this.flockY * tv).multiplyScalar(D).add(cam.position);
    const pos = this.flock.geometry.attributes.position;
    this.birds.forEach((b, i) => {
      const flap = Math.sin(this.t * 7 + b.phase) * 0.8 * b.size, sp = 2.2 * b.size, o = i * 6;
      const x = c.x + this.Rt.x * b.off.x + this.U.x * b.off.y + this.F.x * b.off.z, y = c.y + this.Rt.y * b.off.x + this.U.y * b.off.y + this.F.y * b.off.z,
        z = c.z + this.Rt.z * b.off.x + this.U.z * b.off.y + this.F.z * b.off.z;
      // body line runs along the flight (Rt); the wings spread along F (toward and away) and beat along U
      const set = (n, r, u, f) => pos.setXYZ(o + n, x + this.Rt.x * r + this.U.x * u + this.F.x * f, y + this.Rt.y * r + this.U.y * u + this.F.y * f, z + this.Rt.z * r + this.U.z * u + this.F.z * f);
      set(0, 0.75 * b.size, 0, 0); set(1, -0.5 * b.size, 0, 0); set(2, -0.1 * b.size, flap + sp * 0.5, sp);
      set(3, 0.75 * b.size, 0, 0); set(4, -0.5 * b.size, 0, 0); set(5, -0.1 * b.size, flap + sp * 0.5, -sp);
    });
    pos.needsUpdate = true;
  }

  // ------------------------------------------------------------------ every frame
  update(dt) {
    const d = this.d, g = this.g, p = g.player, inp = g.input;
    if (this.returning > 0) {
      // the camera's way back behind Mika: she already walks; stop early when something else takes the camera
      this.returning -= dt;
      if (this.returning <= 0 || g.follow.tracking !== this.track) this.endReturn();
    }
    if (!this.active) return;
    // anything that takes the screen ends the look at once (a cutscene, a talk, the journal, a trick). The pause menu
    // freezes the game, this included: the look simply goes on when the game does.
    if (d.busy || d.scenes?.active || d.minigame || d.tricks?.round || d.ui.overlay || d.ui.dialogueOpen || g.interiors?.active || g.follow.shot !== this.shot) { this.stop(true); return; }
    this.t += dt;
    const mv = Math.hypot(inp.move.x, inp.move.y);
    if (mv < 0.2) this.moved = false;                       // the stick must come back to rest before it can end the look
    if (this.wantLeave || inp.pressed('back') || inp.pressed('jump') || (this.t > 0.45 && !this.moved && mv > 0.45)) { this.stop(false); return; }

    // Mika: turned to the view, head tipped back
    p.vel.set(0, 0, 0);
    p.turnTo(this.yaw, dt, 7);
    const h = this.head;
    if (h) {
      // the walk cycle rewrites the head each frame (then this adds to it); a clip with no head track leaves our own value
      if (this.headWrote && h.quaternion.equals(this.headWrote)) h.quaternion.copy(this.headBase);
      else (this.headBase ??= new THREE.Quaternion()).copy(h.quaternion);
      const k = Math.min(1, this.t / 0.9);
      h.quaternion.multiply(this.qx.setFromAxisAngle(this.b.set(1, 0, 0), -0.62 * k * k * (3 - 2 * k)));
      (this.headWrote ??= new THREE.Quaternion()).copy(h.quaternion);
    }

    const look = this.m.look, cam = g.camera;
    if (this.stars) {
      // the dome rides with the camera (the birds below fly in the world)
      this.stars.position.copy(cam.position); this.ribbons.position.copy(cam.position); this.heads.position.copy(cam.position);
      const px = (g.renderer.renderer.domElement.height || innerHeight) / 720;
      const u = this.stars.material.uniforms, hu = this.heads.material.uniforms;
      u.uPx.value = hu.uPx.value = px;
      u.uTime.value = hu.uTime.value = this.t;
      u.uFade.value = this.fadeTo * Math.min(1, Math.max(0, (this.t - 0.5) / 1.6));
      // shooting stars: every few seconds at night (now and then a big one), rarely at dusk
      if (this.t > 1.4 && (this.nextStar -= dt) <= 0) {
        const night = look === 'night';
        this.launch(night && Math.random() < 0.2);
        this.nextStar = night ? 2.8 + Math.random() * 3.6 : 9 + Math.random() * 6;
      }
      this.updateStreaks(dt);
      const s = this.wishable();
      if (s && this.t > 0.4 && (inp.pressed('act') || (d.ui.touch && inp.pressed('tap')))) this.wish(s);
    }
    if (this.flock) this.updateBirds(dt);

    // the lines: Mika's thoughts take turns, gently
    if (this.lineLeft > 0 && (this.lineLeft -= dt) <= 0) { this.el?.querySelector('.line')?.classList.add('hide'); this.lineT = 0; }
    else if (this.lineLeft <= 0 && (this.lineT += dt) > (look === 'night' ? 16 : 5)) {
      const L = this.lines();
      this.lineI = (this.lineI + 1) % L.length;
      if (look !== 'night' || !this.wishes) this.say(L[this.lineI], 6);
      this.lineT = 0;
    }
  }

  /** Look down. hard = something else owns the screen now: no camera move of our own. */
  stop(hard) {
    const g = this.g, p = g.player, f = g.follow;
    if (!this.active) return;
    this.active = null;
    this.locks = false;
    removeEventListener('keydown', this.onKey, true);
    document.body.classList.remove('sky-gaze');
    this.ui(false);
    this.dispose();
    if (this.head && this.headBase) { if (this.headWrote && this.head.quaternion.equals(this.headWrote)) this.head.quaternion.copy(this.headBase); }
    this.head = this.headBase = this.headWrote = null;
    p.pose = this.poseWas;
    p.carry?.release('skygaze');
    this.d.actCooldown = 0.45;
    if (this.saveDue) { this.saveDue = false; this.d.save(); }
    if (f.shot !== this.shot) { this.shot = null; return; }  // the camera already belongs to something else
    this.shot = null;
    if (hard) { f.clearCutscene(false); return; }
    // ease back to the follow camera behind her, tracking her if she already walks off
    f.yaw = p.facing; f.pitch = 0.3;
    const pos = () => this.followPose(this.eye, false), look = () => this.followPose(this.look, true);
    f.track(pos, look, 5);
    this.track = f.tracking;
    this.returning = 0.75;
  }

  /** Where the follow camera would be (look = false) or look (true) right now. */
  followPose(out, look) {
    const f = this.g.follow, p = this.g.player, cp = Math.cos(f.pitch);
    out.set(p.pos.x, p.pos.y + 1.45, p.pos.z);
    const k = look ? 10 : -f.zoomTarget;
    out.x += Math.sin(f.yaw) * cp * k; out.y += -Math.sin(f.pitch) * k; out.z += Math.cos(f.yaw) * cp * k;
    if (!look) { const gy = this.g.world.heightAt(out.x, out.z) + 0.45; if (out.y < gy && gy < p.pos.y + 6) out.y = gy; }
    return out;
  }

  endReturn() {
    const f = this.g.follow;
    this.returning = 0;
    if (f.tracking === this.track && this.track) { f.clearCutscene(false); f.dist = f.zoomTarget; }
    this.track = null;
  }

  /** For the QA autopilot and tests. */
  debug() {
    return { head: this.head?.name || null, active: this.active?.id || null, look: this.active ? this.m.look : null, falling: !!(this.active && this.stars && this.wishable()), wishes: this.wishes, returning: this.returning > 0 };
  }
}
