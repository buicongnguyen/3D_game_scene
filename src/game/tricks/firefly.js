// Firefly jar (docs/RURAL-TRICKS.md trick 1): summer night at the paddy edge. Sweep the bug net through a firefly while
// it glows (they blink on a rhythm, so timing matters); caught ones fly into the jar, which glows brighter with each.
// Ten make a lantern: Mika carries the jar along Grandma's dark path, its light reveals a note, and then every firefly
// goes home, drifting up out of the jar. ambient(): a blinking swarm over the paddies on summer nights.
//
// Drawing: one THREE.Points draw call per swarm (additive soft dots, per-firefly glow and size attributes written each
// frame for ≤ 48 points), one pooled light for the jar, a ground glow disc for the finale. Nothing allocates per frame.
import * as THREE from 'three';
import { N_ } from '../../i18n/i18n.js';
import { inHours } from '../../content/tricks.js';

const MAX = 48;                // fireflies in a round's swarm (live + flying + in the jar)
const START = 30;              // how many fly when the round begins
const KEEP = 14;               // fresh ones drift in while fewer than this are free
const CAP = 15;                // a full jar ends the round early
const LANTERN = 10;            // caught fireflies that make the jar a lantern (the finale)
const RADIUS = 8;              // the swarm's spread around the place
const FLY_TIME = 0.55;         // seconds from the net into the jar

// blink rhythm: a short flash then darkness; glow 0..1 at time t for one firefly (lit = fraction of the period)
export function blink(t, period, phase, lit = 0.32) {
  const f = ((t / period + phase) % 1 + 1) % 1;
  return f < lit ? Math.sin(Math.PI * f / lit) : 0;
}
/** A firefly can be caught while it glows at least this much. */
export const CATCHABLE = 0.3;

const VERT = `
attribute float aGlow;
attribute float aSize;
uniform float uScale;
varying float vGlow;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uScale * (0.3 + aGlow) / max(0.6, -mv.z);
  vGlow = aGlow;
}`;
const FRAG = `
varying float vGlow;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  a = a * a * (0.12 + vGlow * 1.25);
  vec3 c = mix(vec3(0.45, 0.62, 0.16), vec3(1.0, 0.97, 0.5), vGlow);
  gl_FragColor = vec4(c, a);
}`;

/** A swarm of n fireflies drawn as one Points object. Each has a home, a wander, a blink rhythm and a state. */
class Swarm {
  constructor(scene, n) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.glow = new Float32Array(n);
    this.size = new Float32Array(n);
    this.home = new Float32Array(n * 3);
    this.ph = new Float32Array(n * 4);       // wander phases (3) + blink phase
    this.period = new Float32Array(n);
    this.state = new Uint8Array(n);          // 0 hidden, 1 free, 2 flying to the jar, 3 in the jar, 4 released
    this.st = new Float32Array(n);           // seconds in the current state
    this.from = new Float32Array(n * 3);     // where a flight began
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aGlow', new THREE.BufferAttribute(this.glow, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, uniforms: { uScale: { value: 300 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
    this.geo = geo;
  }

  spawn(i, x, y, z, rand = Math.random) {
    this.home[i * 3] = x; this.home[i * 3 + 1] = y; this.home[i * 3 + 2] = z;
    for (let k = 0; k < 4; k++) this.ph[i * 4 + k] = rand() * 6.283;
    this.ph[i * 4 + 3] = rand();
    this.period[i] = 1.9 + rand() * 1.6;
    this.state[i] = 1; this.st[i] = 0;
  }

  free() { let c = 0; for (let i = 0; i < this.n; i++) if (this.state[i] === 1) c++; return c; }
  slot() { for (let i = 0; i < this.n; i++) if (this.state[i] === 0 || this.state[i] === 4 && this.st[i] > 6) return i; return -1; }

  /** Move and blink everyone. jar: world point of the jar (or null). lit: blink duty (longer in the guided try). */
  update(dt, t, jar, lit, scale) {
    const P = this.pos, H = this.home, ph = this.ph;
    this.mat.uniforms.uScale.value = scale;
    for (let i = 0; i < this.n; i++) {
      const s = this.state[i], j = i * 3, q = i * 4;
      this.st[i] += dt;
      if (s === 0) { this.size[i] = 0; this.glow[i] = 0; continue; }
      if (s === 1) {
        // a lazy figure-of-eight around home, and a slow rise and fall
        const fade = Math.min(1, this.st[i] / 1.2);
        P[j] = H[j] + Math.sin(t * 0.55 + ph[q]) * 0.9 + Math.sin(t * 0.23 + ph[q + 2]) * 0.6;
        P[j + 1] = H[j + 1] + Math.sin(t * 0.8 + ph[q + 1]) * 0.35;
        P[j + 2] = H[j + 2] + Math.cos(t * 0.47 + ph[q + 2]) * 0.9 + Math.sin(t * 0.31 + ph[q]) * 0.5;
        this.glow[i] = blink(t, this.period[i], ph[q + 3], lit) * fade;
        this.size[i] = 0.85;
      } else if (s === 2) {
        const k = Math.min(1, this.st[i] / FLY_TIME), e = k * k * (3 - 2 * k);
        P[j] = this.from[j] + (jar.x - this.from[j]) * e;
        P[j + 1] = this.from[j + 1] + (jar.y + 0.12 - this.from[j + 1]) * e + Math.sin(Math.PI * k) * 0.5;
        P[j + 2] = this.from[j + 2] + (jar.z - this.from[j + 2]) * e;
        this.glow[i] = 1; this.size[i] = 0.5;
        if (k >= 1) { this.state[i] = 3; this.st[i] = 0; }
      } else if (s === 3) {
        // inside the jar: a tiny buzz, always softly lit
        P[j] = jar.x + Math.sin(t * 3.1 + ph[q]) * 0.05;
        P[j + 1] = jar.y + 0.1 + Math.sin(t * 2.3 + ph[q + 1]) * 0.06;
        P[j + 2] = jar.z + Math.cos(t * 2.7 + ph[q + 2]) * 0.05;
        this.glow[i] = 0.55 + 0.45 * Math.sin(t * 4 + ph[q + 3] * 6.28);
        this.size[i] = 0.3;
      } else if (s === 4) {
        // released: up out of the jar, spiralling apart, fading over a few seconds
        const a = Math.max(0, this.st[i]);    // a little wait in the jar first (negative time)
        P[j] = this.from[j] + Math.sin(a * 1.3 + ph[q]) * a * 0.6;
        P[j + 1] = this.from[j + 1] + a * (0.7 + (ph[q + 1] / 6.28) * 0.5);
        P[j + 2] = this.from[j + 2] + Math.cos(a * 1.3 + ph[q]) * a * 0.6;
        this.glow[i] = Math.max(0, 1 - a / 6) * (0.4 + 0.6 * blink(t, this.period[i], ph[q + 3], 0.5));
        this.size[i] = a > 6 ? 0 : 0.5;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aGlow.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
  }

  setVisible(on) { this.points.visible = on; }
  dispose() { this.points.removeFromParent(); this.geo.dispose(); this.mat.dispose(); }
}

/** Point size scale for the drawing buffer height (so the dots look the same on a phone and a monitor). */
const sizeScale = game => (game.renderer?.renderer?.domElement?.height || innerHeight) * 0.5;

function scatterHome(sw, i, c, world, rand = Math.random) {
  const a = rand() * 6.283, r = Math.sqrt(rand()) * RADIUS;
  const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
  sw.spawn(i, x, world.heightAt(x, z) + 0.6 + rand() * 1.3, z, rand);
}

// --------------------------------------------------------------------- props
function makeNet(assets) {
  const m = assets.clone('bug-net');
  if (m) return m;
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: '#a8743c', roughness: 0.8 });
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.95, 6), wood);
  stick.position.y = 0.42;
  const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.012, 5, 14), wood);
  hoop.position.y = 1.04;
  const bag = new THREE.Mesh(new THREE.ConeGeometry(0.155, 0.32, 10, 1, true), new THREE.MeshStandardMaterial({ color: '#f4f1e6', transparent: true, opacity: 0.55, side: THREE.DoubleSide, roughness: 1 }));
  bag.position.set(0, 1.04, -0.14); bag.rotation.x = -Math.PI / 2;
  g.add(stick, hoop, bag);
  g.userData.own = [wood, stick.geometry, hoop.geometry, bag.geometry, bag.material];   // made here: freed with the round
  return g;
}

function makeJar(assets) {
  const m = assets.clone('glass-jar');
  if (m) return m;
  const g = new THREE.Group();
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.24, 12, 1, true), new THREE.MeshStandardMaterial({ color: '#d9f3ff', transparent: true, opacity: 0.32, roughness: 0.1, side: THREE.DoubleSide, depthWrite: false }));
  glass.position.y = 0.12;
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.03, 12), new THREE.MeshStandardMaterial({ color: '#c79a52', roughness: 0.7 }));
  lid.position.y = 0.255;
  g.add(glass, lid);
  g.userData.own = [glass.geometry, glass.material, lid.geometry, lid.material];
  return g;
}

/** The jar's glow point: its 'Inside' node when the model has one (minus the swarm's 0.1 m lift), else its origin. */
function jarPoint(jar, out) {
  const inside = jar.userData.inside ??= jar.getObjectByName('Inside') || false;
  if (inside) { inside.getWorldPosition(out); out.y -= 0.1; } else jar.getWorldPosition(out);
  return out;
}

let glowTex = null;
function groundGlow() {
  if (!glowTex) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,250,170,0.9)'); gr.addColorStop(0.55, 'rgba(210,255,120,0.35)'); gr.addColorStop(1, 'rgba(200,255,120,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    glowTex = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(new THREE.CircleGeometry(3.4, 28), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5 }));
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 4;
  return m;
}

// --------------------------------------------------------------------- ambient
let amb = null;

export default {
  id: 'firefly',

  async play(ctx) {
    const { game: g, player: p, audio, fx, trick } = ctx;
    const world = g.world, scene = g.scene;
    await ctx.ensureModels(['bug-net', 'glass-jar', 'firefly', 'journal-page']);
    // night for the round (a fade hides the change), unless it already is
    const dark = inHours(g.shownHour(), trick.hours) && (g.night || 0) > 0.6;
    if (!dark) { await ctx.fade(true, 350); ctx.setNight(true, 22.5); await ctx.wait(0.1); await ctx.fade(false, 500); }

    // the net in Mika's right hand (her lantern waits), the jar on the ground beside the sign
    const grip = p.grip || p.model;
    const lanternWas = p.lantern?.visible;
    if (p.lantern) p.lantern.visible = false;
    const net = makeNet(g.assets);
    // grip_R carry poses from the artist: upright, and a raised catch for fireflies in the air (blended for the swing)
    if (grip !== p.model) net.rotation.set(Math.PI, 0, 0); else net.position.set(-0.28, 0.75, 0.1);
    net.traverse(o => { if (o.isMesh) o.castShadow = true; });
    grip.add(net);
    const jar = makeJar(g.assets);
    const fwd0 = new THREE.Vector3(Math.sin(p.facing), 0, Math.cos(p.facing));
    const jx = p.pos.x + fwd0.z * 1.1, jz = p.pos.z - fwd0.x * 1.1;
    jar.position.set(jx, world.heightAt(jx, jz), jz);
    scene.add(jar);
    const jarAt = new THREE.Vector3();
    const jarLight = g.lights.add({ pos: jarAt, color: '#d8ff6a', intensity: 0, range: 7 });

    const sw = new Swarm(scene, MAX);
    // everything the round put in the valley goes back, however it ends (a quit, or an error half-way)
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      g.lights.remove(jarLight);
      sw.dispose();
      jar.removeFromParent();
      net.removeFromParent();
      for (const x of [...(net.userData.own || []), ...(jar.userData.own || [])]) x.dispose();
      if (p.lantern) p.lantern.visible = lanternWas ?? true;
      g.follow.clearCutscene(true);
      ctx.lock(false);
    };
    try {
    const centre = ctx.place;
    for (let i = 0; i < START; i++) scatterHome(sw, i, centre, world);
    ctx.debug.swarm = sw;

    let caught = 0, left = ctx.roundTime, swing = 0, lastCatch = 0, missHint = 0;
    const lit = ctx.first ? 0.45 : g.easy ? 0.38 : 0.3;
    const reach = g.easy ? 1.7 : 1.4;
    const net0 = net.rotation.clone();
    const tip = new THREE.Vector3();
    ctx.hint(ctx.first ? N_('Sweep the net when a firefly glows: press {act} right next to one.') : N_('Catch them while they glow!'), 5);
    let hinted = 0;

    const catchNear = () => {
      tip.set(p.pos.x + Math.sin(p.facing) * 1.0, p.pos.y + 1.1, p.pos.z + Math.cos(p.facing) * 1.0);
      let best = -1, bd = reach, dark = -1;
      for (let i = 0; i < sw.n; i++) {
        if (sw.state[i] !== 1) continue;
        const j = i * 3;
        const dx = sw.pos[j] - tip.x, dy = (sw.pos[j + 1] - tip.y) * 0.6, dz = sw.pos[j + 2] - tip.z;
        const d = Math.hypot(dx, dy, dz);
        if (d > bd) continue;
        if (sw.glow[i] >= CATCHABLE || (sw.glow[i] > 0.05 && g.easy)) { bd = d; best = i; } else dark = i;
      }
      return { best, dark };
    };

    const res = await ctx.loop(dt => {
      left -= dt;
      const t = ctx.t;
      jarPoint(jar, jarAt);
      jarLight.intensity = Math.min(9, caught * 0.7);
      sw.update(dt, t, jarAt, lit, sizeScale(g));
      // swing the net: a quick sweep of the hand
      if (swing > 0) {
        swing -= dt; const k = Math.sin((1 - swing / 0.3) * Math.PI);
        if (grip !== p.model) net.rotation.set(Math.PI + (-2.478 - Math.PI) * k, 1.281 * k, -0.626 * k);
        else net.rotation.set(net0.x + k * 0.9, net0.y, net0.z);
      }
      else net.rotation.copy(net0);
      if (ctx.pressed() || g.input.pressed('tap')) {
        swing = 0.3;
        p.gesture('Interact', { lock: false });
        audio.stroke();
        const { best, dark } = catchNear();
        if (best >= 0) {
          sw.state[best] = 2; sw.st[best] = 0;
          sw.from.set(sw.pos.subarray(best * 3, best * 3 + 3), best * 3);
          caught++; lastCatch = t;
          audio.twinkle(1.4); audio.good();
          fx.burst(tip.clone(), { n: 10, color: [0.9, 1, 0.45], speed: 0.8, size: 0.1, gravity: -0.6 });
          if (caught === 1 && ctx.first) ctx.hint(N_('Got one! Into the jar it goes.'), 3);
          if (caught === 5) ctx.hint(N_('Halfway to a lantern. Keep going!'), 3);
          if (caught === LANTERN) ctx.hint(N_('Ten! The jar is a real lantern now.'), 3.5);
        } else if (dark >= 0 && missHint <= 0) {
          missHint = 4;
          audio.miss();
          ctx.hint(N_('Too early: it went dark. Wait for the glow, then sweep!'), 3);
        }
      }
      missHint -= dt;
      // guided try: nudges when nothing is happening
      if (ctx.first && hinted === 0 && t > 10 && caught === 0) { hinted = 1; ctx.hint(N_('Walk right up close. They glow, then go dark, then glow again.'), 4.5); }
      if (hinted < 2 && t - lastCatch > 18 && caught > 0) { hinted = 2; ctx.hint(N_('Look for a cluster of blinks. Low ones are easier.'), 4); }
      // fresh ones drift in from the edge so there is always someone to catch
      if (sw.free() < KEEP) { const i = sw.slot(); if (i >= 0) scatterHome(sw, i, centre, world); }
      ctx.hud(caught, left);
      if (left <= 0 || caught >= CAP) return { done: true };
      return undefined;
    });
    net.rotation.copy(net0);

    let note = false;
    if (!res.quit && caught >= LANTERN) note = await this.finale(ctx, { sw, jar, jarAt, jarLight, net, grip, caught });
    if (!ctx.quit) await this.release(ctx, { sw, jar, jarAt, jarLight });

    cleanup();
    if (!dark) { await ctx.fade(true, 300); ctx.setNight(false); await ctx.fade(false, 450); }
    return { score: caught, caught, extra: note ? N_('the jar lit the path') : undefined, quit: res.quit && !caught };
    } finally {
      cleanup();
    }
  },

  /** Ten fireflies: Mika carries the jar along the dark path; its light circle reveals a note from Grandma. */
  async finale(ctx, { sw, jar, jarAt, jarLight, net, grip }) {
    const { game: g, player: p, fx, audio, director: d } = ctx;
    const world = g.world;
    net.removeFromParent();
    jar.removeFromParent();
    jar.position.set(0, 0.115, -0.02);           // held by the neck (art contract)
    jar.rotation.set(grip !== p.model ? Math.PI : 0, 0, 0);
    if (grip === p.model) jar.position.set(-0.28, 0.75, 0.1);
    grip.add(jar);
    const disc = groundGlow();
    g.scene.add(disc);
    ctx.setNight(true, 23.6);
    // the note lies a few metres on toward the village (east), on dry ground
    const a = Math.atan2(1, 2.2), nx = ctx.place.x + Math.cos(a) * 7.5, nz = ctx.place.z + Math.sin(a) * 7.5;
    const note = g.assets.clone('journal-page') || new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.22), new THREE.MeshStandardMaterial({ color: '#fff6dc', side: THREE.DoubleSide }));
    note.position.set(nx, world.heightAt(nx, nz) + 0.12, nz);
    note.rotation.y = 0.6;
    note.visible = false;
    g.scene.add(note);
    ctx.debug.note = note.position;
    ctx.hint(N_('Now walk the dark path by its light. Look on the ground, toward the village.'), 5);
    let found = false, t0 = 0, nudged = false, r = null;
    try {
    r = await ctx.loop(dt => {
      t0 += dt;
      jarPoint(jar, jarAt);
      jarLight.intensity = 7 + Math.sin(ctx.t * 5) * 0.6;
      sw.update(dt, ctx.t, jarAt, 0.4, sizeScale(g));
      disc.position.set(p.pos.x, world.heightAt(p.pos.x, p.pos.z) + 0.06, p.pos.z);
      const dn = Math.hypot(note.position.x - p.pos.x, note.position.z - p.pos.z);
      note.visible = dn < 3.6;
      if (note.visible && Math.floor(ctx.t * 4) % 2 === 0) fx.glint?.(note.position, false);
      if (!nudged && t0 > 14) {
        // still wandering: the note turns up a little way ahead of her
        nudged = true;
        const f = p.facing, x = p.pos.x + Math.sin(f) * 3, z = p.pos.z + Math.cos(f) * 3;
        note.position.set(x, world.heightAt(x, z) + 0.12, z);
        ctx.hint(N_('There! Something pale in the jar-light, just ahead.'), 3.5);
      }
      if (dn < 1.4) { found = true; return true; }
      return t0 > 32 ? true : undefined;
    });
    if (!r?.quit && found) {
      audio.pickup();
      p.gesture('Interact', { lock: false });
      ctx.lock(true);
      await ctx.say('trick_firefly_note');
      ctx.lock(false);
      const st = d.q.state;
      if (st.tricks.firefly) st.tricks.firefly.note = true;
    }
    } finally {
      note.removeFromParent();
      disc.removeFromParent();
      disc.geometry.dispose(); disc.material.dispose();
      if (!note.userData.model) { note.geometry?.dispose(); note.material?.dispose?.(); }   // the stand-in page
    }
    return found;
  },

  /** Every firefly goes home: up out of the jar, spiralling apart. */
  async release(ctx, { sw, jar, jarAt, jarLight }) {
    const { game: g, player: p, audio } = ctx;
    ctx.lock(true);
    jarPoint(jar, jarAt);
    const side = new THREE.Vector3(Math.cos(p.facing), 0, -Math.sin(p.facing));
    g.follow.cutscene({ pos: p.pos.clone().addScaledVector(side, 3.2).add(new THREE.Vector3(Math.sin(p.facing) * 2.2, 1.6, Math.cos(p.facing) * 2.2)), look: jarAt.clone().add(new THREE.Vector3(0, 1.2, 0)) }, 1.2);
    for (let i = 0; i < sw.n; i++) {
      if (sw.state[i] === 1) { sw.state[i] = 4; sw.st[i] = Math.random() * 2; sw.from.set(sw.pos.subarray(i * 3, i * 3 + 3), i * 3); }
      if (sw.state[i] === 2 || sw.state[i] === 3) { sw.state[i] = 4; sw.st[i] = -Math.random() * 1.2; sw.from[i * 3] = jarAt.x; sw.from[i * 3 + 1] = jarAt.y + 0.2; sw.from[i * 3 + 2] = jarAt.z; }
    }
    ctx.hint(N_('Lid off. Goodnight, fireflies, and thank you for the light.'), 4.5);
    p.gesture('Wave', { lock: false });
    audio.chime(4);
    let t0 = 0;
    await ctx.loop(dt => {
      t0 += dt;
      jarLight.intensity = Math.max(0, 6 - t0 * 1.4);
      sw.update(dt, ctx.t, jarAt, 0.5, sizeScale(g));
      return t0 > 5 ? true : undefined;
    });
    ctx.lock(false);
  },

  /** Summer nights: a blinking swarm over the paddy edge while Mika is near (one draw call, 40 points). */
  ambient(dt, ctx) {
    const g = ctx.game;
    if (ctx.off) { amb?.sw.setVisible(false); return; }
    if (!amb) {
      amb = { sw: new Swarm(g.scene, 40), t: 0 };
      let seed = 7;
      const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 40; i++) scatterHome(amb.sw, i, ctx.place, g.world, rand);
    }
    amb.sw.setVisible(true);
    amb.t += dt;
    amb.sw.update(dt, amb.t, null, 0.3, sizeScale(g));
  },
};
