// Focus mode: while a mini game that does not need the valley runs, the valley stops costing anything.
//
//   const focus = enterFocus(game, { keep: [marbles, shooter, …], backdrop: 'blur', sim: 'all' });
//   …the round…
//   focus.exit();
//
// What it does while it is on:
//   - the picture behind: the valley is drawn ONCE from the round's camera (with `hide` and the kept objects out of it),
//     copied to a texture and shown as a still backdrop: 'frozen' as it was, 'blur' softened and a little darker so the
//     play area stands out, 'plain' a flat colour (nothing is captured). It is taken again by itself when the camera or
//     the size of the picture changes (a phone turned on its side, the view button) and after a lost graphics context.
//   - every frame only the kept objects are drawn, lit by the valley's own lights, straight to the screen: no terrain,
//     no trees, no water, no people, no shadow pass, no bloom or grade passes.
//   - the simulation behind stands still (sim: 'all' | 'actors' | 'none'): the train, the water and sky, the lights
//     pool, the foliage and grass culling, the buildings and, through Director.update, town life, animals, pickups and
//     the rest. 'actors' leaves Mika and the people in `actors` alive (tug of war, rope, sack race); 'all' stops Mika too.
//   - hold: true is for a round whose own board covers the screen: after the still picture nothing is drawn at all.
// exit() gives everything back exactly; it may be called twice, late, or after an error. Sessions nest: the one entered
// last is the one in force, and leaving it brings the one before back. Where focus cannot work (no WebGL renderer, a
// failure while drawing) the game simply renders as usual.
//
// The bookkeeping (Stubs, FocusStack) is plain JavaScript and tested in Node (tests/focus.test.mjs).
import * as THREE from 'three';
import { updateWorldSubtrees } from './matrices.js';

/** Swap methods on live objects for stand-ins and put the originals back, exactly (own properties stay own, inherited stay inherited). */
export class Stubs {
  constructor() { this.list = []; }
  set(obj, key, fn) {
    if (!obj || typeof obj[key] !== 'function') return false;
    const own = Object.prototype.hasOwnProperty.call(obj, key);
    this.list.push({ obj, key, own, prev: own ? obj[key] : undefined, fn });
    obj[key] = fn;
    return true;
  }
  restore() {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const { obj, key, own, prev, fn } = this.list[i];
      if (obj[key] !== fn) continue;            // somebody else replaced it meanwhile: theirs stays
      if (own) obj[key] = prev; else delete obj[key];
    }
    this.list.length = 0;
  }
  get size() { return this.list.length; }
  /** The method as it was before it was stood in for (bound), or as it is when it was not. */
  real(obj, key) {
    if (!obj) return null;
    const e = this.list.find(x => x.obj === obj && x.key === key);
    const f = !e ? obj[key] : e.own ? e.prev : Object.getPrototypeOf(obj)?.[key];
    return typeof f === 'function' ? f.bind(obj) : null;
  }
}

/** Remember the `visible` of some objects, hide them, and put every one back as it was. */
export class Hidden {
  constructor() { this.was = new Map(); }
  hide(objs) { for (const o of objs || []) if (o && !this.was.has(o)) { this.was.set(o, o.visible); o.visible = false; } }
  restore() { for (const [o, v] of this.was) o.visible = v; this.was.clear(); }
}

/**
 * Which session is in force. `on(session)` / `off(session)` are called so that at most one is on at a time: entering a
 * second one turns the first off, leaving the second turns the first back on. Leaving twice, or leaving one that is
 * not on top, never disturbs the others.
 */
export class FocusStack {
  constructor({ on = () => {}, off = () => {} } = {}) { this.items = []; this.active = null; this.on = on; this.off = off; }
  get top() { return this.items[this.items.length - 1] || null; }
  enter(s) { if (!this.items.includes(s)) this.items.push(s); this.sync(); return s; }
  exit(s) { const i = this.items.indexOf(s); if (i < 0) return false; this.items.splice(i, 1); this.sync(); return true; }
  clear() { this.items.length = 0; this.sync(); }
  sync() {
    const top = this.top;
    if (top === this.active) return;
    const was = this.active;
    this.active = null;
    if (was) { try { this.off(was); } catch (e) { console.error('[focus] restore failed', e); } }
    if (top) {
      try { this.on(top); this.active = top; }
      catch (e) {
        // could not be switched on: undo what it did and fall back to the one below (or to the plain game)
        console.error('[focus] could not start', e);
        try { this.off(top); } catch { /* ignore */ }
        const i = this.items.indexOf(top); if (i >= 0) this.items.splice(i, 1);
        top.dead = true;
        this.sync();
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------- the picture behind
const QUAD_VS = /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const SHOW_FS = /* glsl */`
  uniform sampler2D tMap; uniform float uDim, uVignette; varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tMap, vUv).rgb * uDim;
    vec2 q = vUv - 0.5;
    c *= 1.0 - uVignette * smoothstep(0.12, 0.6, dot(q, q));
    gl_FragColor = vec4(c, 1.0);
  }`;
const BLUR_FS = /* glsl */`
  uniform sampler2D tMap; uniform vec2 uStep; varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tMap, vUv).rgb * 0.227;
    c += (texture2D(tMap, vUv + uStep * 1.385).rgb + texture2D(tMap, vUv - uStep * 1.385).rgb) * 0.316;
    c += (texture2D(tMap, vUv + uStep * 3.231).rgb + texture2D(tMap, vUv - uStep * 3.231).rgb) * 0.0703;
    gl_FragColor = vec4(c, 1.0);
  }`;

class Backdrop {
  constructor() {
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.show = new THREE.ShaderMaterial({ uniforms: { tMap: { value: null }, uDim: { value: 1 }, uVignette: { value: 0 } }, vertexShader: QUAD_VS, fragmentShader: SHOW_FS, depthTest: false, depthWrite: false, toneMapped: false });
    this.blur = new THREE.ShaderMaterial({ uniforms: { tMap: { value: null }, uStep: { value: new THREE.Vector2() } }, vertexShader: QUAD_VS, fragmentShader: BLUR_FS, depthTest: false, depthWrite: false, toneMapped: false });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.show);
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.matrixWorldAutoUpdate = false;
    this.scene.add(this.quad);
    this.size = new THREE.Vector2();
    this.tex = null; this.a = null; this.b = null;
  }

  /** Copy what is on the screen now into the backdrop (softened when `blur`). */
  grab(r, blur) {
    const s = r.getDrawingBufferSize(new THREE.Vector2());
    if (!this.tex || s.x !== this.size.x || s.y !== this.size.y) {
      this.free();
      this.size.copy(s);
      this.tex = new THREE.FramebufferTexture(s.x, s.y);
      this.tex.minFilter = this.tex.magFilter = THREE.LinearFilter;
      const w = Math.max(32, Math.round(s.x / 4)), h = Math.max(32, Math.round(s.y / 4)), o = { depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
      this.a = new THREE.WebGLRenderTarget(w, h, o);
      this.b = new THREE.WebGLRenderTarget(w, h, o);
    }
    r.setRenderTarget(null);
    r.copyFramebufferToTexture(this.tex);
    if (!blur) { this.show.uniforms.tMap.value = this.tex; return; }
    // two rounds of a small separable blur at a quarter of the size: a soft, lens-like picture for one millisecond, once
    const pass = (from, to, x, y) => {
      this.blur.uniforms.tMap.value = from; this.blur.uniforms.uStep.value.set(x / to.width, y / to.height);
      r.setRenderTarget(to); r.render(this.scene, this.cam);
    };
    this.quad.material = this.blur;
    pass(this.tex, this.a, 1, 0); pass(this.a.texture, this.b, 0, 1);
    pass(this.b.texture, this.a, 1.6, 0); pass(this.a.texture, this.b, 0, 1.6);
    this.quad.material = this.show;
    r.setRenderTarget(null);
    this.show.uniforms.tMap.value = this.b.texture;
  }

  draw(r) { r.render(this.scene, this.cam); }
  free() { this.tex?.dispose(); this.a?.dispose(); this.b?.dispose(); this.tex = this.a = this.b = null; }
  dispose() { this.free(); this.quad.geometry.dispose(); this.show.dispose(); this.blur.dispose(); }
}

// ---------------------------------------------------------------------------------------------- one session
const LOOK = { frozen: { dim: 1, vignette: 0 }, blur: { dim: 0.8, vignette: 0.55 } };
const E = 1e-5;
const sameM = (a, b) => { for (let i = 0; i < 16; i++) if (Math.abs(a[i] - b[i]) > E) return false; return true; };

class FocusSession {
  constructor(game, opts) {
    this.game = game;
    this.mode = opts.hold ? 'hold' : opts.backdrop || 'frozen';
    this.sim = opts.sim === undefined ? 'all' : opts.sim === 'none' ? null : opts.sim;
    this.hold = !!opts.hold;
    this.color = new THREE.Color(opts.color || '#b89a6a');
    this.dim = opts.dim; this.vignette = opts.vignette;
    this.bakeShadows = !!opts.bakeShadows;
    this.fx = opts.fx !== false;
    this.kept = new Set(); this.hideList = new Set(opts.hide || []);
    this.actors = new Set(opts.actors || []);     // people (actors/npc.js) the round keeps alive: Director.update steps them
    this.onFrame = opts.onFrame || null;
    this.stubs = new Stubs();
    this.scene = new THREE.Scene();
    this.scene.matrixWorldAutoUpdate = false;
    this.scene.name = 'focus';
    this.dirty = true;            // the list of drawn roots has to be rebuilt
    this.shot = null;             // what the backdrop was taken with { cam, proj, w, h }
    this.captures = 0; this.frames = 0;
    this.backdrop = null;
    this.active = false; this.dead = false; this.done = false;
    for (const o of opts.keep || []) if (o) this.kept.add(o);
  }

  /** Draw this object too (anything added to the scene during the round), or stop drawing it. */
  keep(...objs) { for (const o of objs.flat()) if (o && !this.kept.has(o)) { this.kept.add(o); this.dirty = true; } return this; }
  drop(...objs) { for (const o of objs.flat()) if (this.kept.delete(o)) this.dirty = true; return this; }
  /** Leave these out of the still picture as well (people standing where the play area is). */
  hide(...objs) { for (const o of objs.flat()) if (o) this.hideList.add(o); this.shot = null; return this; }
  /** Take the still picture again on the next frame. */
  recapture() { this.shot = null; }
  exit() { exitFocus(this); }

  // ---- on / off (FocusStack)
  start() {
    const g = this.game, R = g.renderer;
    this.active = true; this.shot = null; this.dirty = true;
    if (!this.hold && this.mode !== 'plain') this.backdrop ??= new Backdrop();
    if (this.sim) {
      const s = this.stubs, none = () => {};
      // (the valley's own per-frame work in Game.frame; Director.update skips town life and the rest while game.focus.sim is set)
      s.set(g.railway, 'update', none);
      if (!g.kite?.active) s.set(g.kite, 'update', none);
      if (g.world) { const L = g.world.update(0, g.viewFocus || g.player.pos); s.set(g.world, 'update', () => L); }
      s.set(g.underwater, 'update', none); s.set(g.riverbed, 'update', none); s.set(g.interiors, 'update', none); s.set(g.celebrate, 'update', none);
      if (g.structures) { const lamps = g.world?.lamps; s.set(g.structures, 'update', none); s.set(g.structures, 'lampReflections', () => lamps); s.set(g.structures, 'cull', none); }
      s.set(g.assets, 'setGlow', none); s.set(g.lights, 'update', none);
      s.set(g.foliage, 'update', none); s.set(g.foliage, 'updateShadows', none); s.set(g.grass, 'update', none);
      // sparks and bursts still fly (they are the round's feedback); the weather behind is in the still picture
      if (g.fx) { const fx = g.fx; s.set(fx, 'update', dt => { fx.t += dt; fx.glow.update(dt); fx.soft.update(dt); }); }
      if (this.sim === 'all') s.set(g.player, 'update', none);
    }
    if (R) { R.focus = this; this.heldBefore = R.hold; }
    g.focus = this;
    const canvas = R?.renderer?.domElement;
    if (canvas?.addEventListener) { this.onRestore = () => { this.backdrop?.free(); this.shot = null; }; canvas.addEventListener('webglcontextrestored', this.onRestore); }
  }

  stop() {
    const g = this.game, R = g.renderer;
    this.active = false;
    this.stubs.restore();
    if (R?.focus === this) R.focus = null;
    if (g.focus === this) g.focus = null;
    if (R) { R.shadowDirty = true; const sm = R.renderer?.shadowMap; if (sm) sm.needsUpdate = true; }
    const canvas = R?.renderer?.domElement;
    if (this.onRestore && canvas?.removeEventListener) canvas.removeEventListener('webglcontextrestored', this.onRestore);
    this.onRestore = null;
    this.scene.children = [];
  }

  dispose() { this.backdrop?.dispose(); this.backdrop = null; this.kept.clear(); this.hideList.clear(); this.actors.clear(); }

  // ---- drawing (called by engine/renderer.js in place of the usual frame; false: draw as usual)
  /** The roots drawn each frame: the valley's lights (not those inside a kept object: they come with it) and what is kept. */
  rebuild(world) {
    const inKept = o => { for (let p = o.parent; p; p = p.parent) if (this.kept.has(p)) return true; return false; };
    const shown = o => { for (let p = o; p; p = p.parent) if (p.visible === false) return false; return true; };
    const roots = [];
    world.traverse(o => { if (o.isLight && shown(o) && !this.kept.has(o) && !inKept(o)) roots.push(o); });
    this.lights = roots.length;
    for (const o of this.kept) if (!inKept(o)) roots.push(o);
    if (this.fx && this.game.fx) for (const p of [this.game.fx.glow, this.game.fx.soft]) if (p?.points && !this.kept.has(p.points)) roots.push(p.points);
    // (their parents stay what they are: three.js only walks down from here, and the matrix pass walks up by itself)
    this.scene.children = roots;
    this.dirty = false;
  }

  stale(r, camera) {
    const s = this.shot;
    if (!s) return true;
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    return size.x !== s.w || size.y !== s.h || !sameM(camera.matrixWorld.elements, s.cam) || !sameM(camera.projectionMatrix.elements, s.proj);
  }

  mark(r, camera) {
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    this.shot = { w: size.x, h: size.y, cam: camera.matrixWorld.elements.slice(), proj: camera.projectionMatrix.elements.slice() };
    this.captures++;
  }

  render(R, world, camera) {
    const r = R.renderer;
    camera.updateMatrixWorld();
    if (this.hold) {
      // a board covers the screen: one picture of the valley, then nothing at all until the picture's size changes
      if (!this.stale(r, camera)) return true;
      this.lookFrom(R, camera);
      R.shadowDirty = true;
      R.renderWorld(world, camera);
      this.mark(r, camera);
      return true;
    }
    if (this.mode !== 'plain' && this.stale(r, camera)) this.capture(R, world, camera);
    if (this.dirty) this.rebuild(world);
    const sm = r.shadowMap;
    sm.autoUpdate = false; sm.needsUpdate = false;      // the map of the still picture stays: nothing in it moves
    const fs = this.scene;
    fs.environment = world.environment; fs.fog = world.fog; fs.environmentIntensity = world.environmentIntensity;
    if (world.environmentRotation) fs.environmentRotation.copy(world.environmentRotation);
    this.onFrame?.(this);
    updateWorldSubtrees(fs.children);
    const auto = r.autoClear;
    r.setRenderTarget(null);
    if (this.mode === 'plain') { r.setClearColor(this.color, 1); r.autoClear = true; r.clear(); }
    else { r.autoClear = true; this.backdrop.draw(r); }
    r.autoClear = false;
    r.clearDepth();
    try { r.render(fs, camera); } finally { r.autoClear = auto; }
    this.frames++;
    return true;
  }

  /**
   * What is shown depends on where the camera stands (the trees and grass near it, the buildings and props in range, the
   * lamps that get a light). That work stands still with the rest: before a still picture is taken it is done once, for
   * the camera the picture is taken from.
   */
  lookFrom(R, camera) {
    if (!this.sim) return;
    const g = this.game, s = this.stubs, at = g.player?.pos || camera.position;
    s.real(g.structures, 'cull')?.(camera.position, R.q);
    s.real(g.foliage, 'updateShadows')?.(at);
    s.real(g.foliage, 'update')?.(camera, true);
    s.real(g.grass, 'update')?.(camera.position, at);
    s.real(g.lights, 'update')?.(camera.position);
  }

  capture(R, world, camera) {
    const r = R.renderer, hid = new Hidden();
    this.lookFrom(R, camera);
    try {
      if (this.bakeShadows) {
        // the kept things stand still (Mika tying her kite): their real shadows are drawn into the picture, they are not
        hid.hide(this.hideList);
        R.shadowDirty = true; R.renderWorld(world, camera);
        hid.hide(this.kept);
        R.renderWorld(world, camera, false);
      } else {
        hid.hide(this.hideList); hid.hide(this.kept);
        R.shadowDirty = true; R.renderWorld(world, camera);
      }
    } finally { hid.restore(); }
    const look = LOOK[this.mode] || LOOK.frozen;
    this.backdrop.show.uniforms.uDim.value = this.dim ?? look.dim;
    this.backdrop.show.uniforms.uVignette.value = this.vignette ?? look.vignette;
    this.backdrop.grab(r, this.mode === 'blur');
    this.mark(r, camera);
  }
}

// ---------------------------------------------------------------------------------------------- small helpers for rounds
/** The valley's lights that are switched on (a round in focus is lit by the same lights as the picture behind it). */
function litBy(world, skip = () => false) {
  const out = [], shown = o => { for (let p = o; p; p = p.parent) if (p.visible === false) return false; return true; };
  world.traverse(o => { if (o.isLight && shown(o) && !skip(o)) out.push(o); });
  return out;
}

/**
 * A small picture of a person's face, taken from their own model as they stand now (the opponent's chip in a round
 * where nobody is drawn). Returns a data URL, or null where it cannot be made. Call it while the screen is covered:
 * the picture is drawn in a corner of the game's own canvas and copied from there.
 */
export function portraitOf(game, root, { size = 112, bg = '#ffe2b0', fov = 30 } = {}) {
  const r = game?.renderer?.renderer, world = game?.scene;
  if (!r || !world || !root || typeof document === 'undefined') return null;
  const scene = new THREE.Scene(), was = root.visible, sm = r.shadowMap, smWas = [sm.autoUpdate, sm.needsUpdate];
  const vp = r.getViewport(new THREE.Vector4()), sc = r.getScissor(new THREE.Vector4()), st = r.getScissorTest(), cc = r.getClearColor(new THREE.Color()), ca = r.getClearAlpha();
  try {
    root.visible = true;
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root), h = Math.min(1.5, Math.max(0.8, box.max.y - box.min.y));
    const head = new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y + h * 0.84, (box.min.z + box.max.z) / 2);
    // the head bone, where the model has one: the face is in the picture whatever the arms are doing
    let bone = null;
    root.traverse(o => { if (!bone && o.isBone && /head/i.test(o.name)) bone = o; });
    if (bone) { bone.getWorldPosition(head); head.y += h * 0.1; }
    const yaw = root.rotation.y, cam = new THREE.PerspectiveCamera(fov, 1, 0.05, 30);
    cam.position.set(head.x + Math.sin(yaw + 0.35) * h * 0.95, head.y + h * 0.06, head.z + Math.cos(yaw + 0.35) * h * 0.95);
    cam.lookAt(head); cam.updateMatrixWorld(true);
    scene.matrixWorldAutoUpdate = false;
    scene.environment = world.environment; scene.environmentIntensity = world.environmentIntensity; scene.fog = null;
    scene.children = [...litBy(world, o => { for (let p = o; p; p = p.parent) if (p === root) return true; return false; }), root];
    const canvas = r.domElement, px = Math.min(size, canvas.width, canvas.height), css = px / r.getPixelRatio();
    sm.autoUpdate = false; sm.needsUpdate = false;
    r.setRenderTarget(null);
    r.setViewport(0, 0, css, css); r.setScissor(0, 0, css, css); r.setScissorTest(true);
    r.setClearColor(bg, 1); r.clear();
    r.render(scene, cam);
    const c = document.createElement('canvas'); c.width = c.height = size;
    c.getContext('2d').drawImage(canvas, 0, canvas.height - px, px, px, 0, 0, size, size);
    return c.toDataURL('image/webp', 0.9);
  } catch (e) { console.warn('[focus] no portrait', e); return null; }
  finally {
    scene.children = [];
    root.visible = was;
    r.setViewport(vp); r.setScissor(sc); r.setScissorTest(st); r.setClearColor(cc, ca);
    sm.autoUpdate = smWas[0]; sm.needsUpdate = smWas[1];
  }
}

/**
 * Soft round shadows under live people in a focus round (their real shadows would need the shadow pass and the ground,
 * which are in the still picture). One instanced quad; `ground(x, z)` gives the height they lie at.
 */
export class BlobShadows {
  constructor(max = 12) {
    let tex = null;
    if (typeof document !== 'undefined') {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 3, 32, 32, 32);
      r.addColorStop(0, 'rgba(0,0,0,.5)'); r.addColorStop(0.6, 'rgba(0,0,0,.26)'); r.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = r; g.fillRect(0, 0, 64, 64);
      tex = new THREE.CanvasTexture(c);
    }
    const geo = new THREE.PlaneGeometry(2, 2); geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: '#14200c', map: tex, transparent: true, depthWrite: false, fog: false }), max);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 1; this.mesh.name = 'focus:blobs'; this.mesh.count = 0;
    this.tex = tex; this.max = max;
    this.m = new THREE.Matrix4(); this.p = new THREE.Vector3(); this.q = new THREE.Quaternion(); this.s = new THREE.Vector3();
  }
  /** who: [{ pos: Vector3-like (feet), r?: metres, show?: boolean }] */
  set(who, ground) {
    let n = 0;
    for (const w of who) {
      if (n >= this.max || w.show === false) continue;
      const gy = ground(w.pos.x, w.pos.z), up = Math.max(0, w.pos.y - gy), r = (w.r || 0.34) * (1 + Math.min(0.6, up * 0.5));
      this.p.set(w.pos.x, gy + 0.03, w.pos.z); this.s.set(r, 1, r);
      this.m.compose(this.p, this.q, this.s); this.mesh.setMatrixAt(n++, this.m);
    }
    this.mesh.count = n; this.mesh.instanceMatrix.needsUpdate = true;
  }
  dispose() { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.tex?.dispose(); }
}

// ---------------------------------------------------------------------------------------------- the API
const STACKS = new WeakMap();
function stackOf(game) {
  let s = STACKS.get(game);
  if (!s) STACKS.set(game, s = new FocusStack({ on: f => f.start(), off: f => f.stop() }));
  return s;
}
const NOOP = Object.freeze({ active: false, dead: true, mode: '', sim: null, keep() { return this; }, drop() { return this; }, hide() { return this; }, recapture() {}, exit() {} });

/** Can this game be put into focus mode at all? */
export function focusSupported(game) {
  // (`?focus=off` or window.__STARLINE_QA__.noFocus: every round is drawn the usual way, to measure what focus gains)
  if (game?.params?.get?.('focus') === 'off' || (typeof window !== 'undefined' && window.__STARLINE_QA__?.noFocus)) return false;
  return !!game?.renderer?.renderWorld && !!game.renderer.renderer?.copyFramebufferToTexture && !!game.scene;
}

/**
 * Enter focus mode. opts:
 *   keep      objects drawn live every frame (more with handle.keep(obj), fewer with handle.drop(obj))
 *   hide      objects left out of the still picture too (the kids who stand where the play area is)
 *   backdrop  'frozen' (default) | 'blur' | 'plain' (with `color`); dim, vignette: override the look
 *   sim       'all' (default: the valley and Mika stand still) | 'actors' (Mika and `actors` stay alive) | 'none'
 *   actors    people (actors/npc.js) whose update keeps running in sim: 'actors'
 *   hold      true: the round's own board covers the screen; after one still picture nothing is drawn at all
 *   bakeShadows  true: the kept things stand still, so their real shadows go into the still picture
 *   fx        false: do not draw the spark and burst particles
 *   onFrame   called before each focus frame is drawn
 * Returns a handle { active, mode, keep, drop, hide, recapture, exit }. Never throws: where focus is not possible the
 * handle does nothing and the game is drawn as usual.
 */
export function enterFocus(game, opts = {}) {
  if (!focusSupported(game)) return NOOP;
  try {
    const s = new FocusSession(game, opts);
    stackOf(game).enter(s);
    return s.dead ? NOOP : s;
  } catch (e) { console.error('[focus] unavailable', e); return NOOP; }
}

/** Leave one session (idempotent). */
export function exitFocus(session) {
  if (!session || session.done || session === NOOP) return;
  session.done = true;
  try { stackOf(session.game).exit(session); } finally { session.dispose(); }
}

/** Leave every session of this game (a failed frame, a hard reset). */
export function exitAllFocus(game) {
  const st = STACKS.get(game);
  if (!st) return;
  const all = st.items.slice();
  st.clear();
  for (const s of all) { s.done = true; s.dispose(); }
}
