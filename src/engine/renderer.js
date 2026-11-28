// © 2026 Bui Cong Nguyen · solluxlabs.com
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { updateWorldMatrices } from './matrices.js';
import { View } from './view.js';
import { Cells } from './cell-grid.js';
import { Governor, settingsAt, governorFor } from './governor.js';
import { readResMode, saveResMode, resModeOf, resolutionPlan, pixelRatioFor, resolutionInfo, ssFor } from './resolution.js';

/**
 * Phone tier (bloomHalf): the glow blurs 3 mip levels instead of 5 (phone speed plan, step 1, owner OK 2026-11-27).
 * The two smallest mips are the wide, faint halo; they cost 4 of the 15 post draws. Their tints go to black (a factor
 * of 0 is not enough: the composite mixes each factor with its mirror by the radius), and the strength is raised a
 * little so the lights keep their brightness. The pass's own render loops honour nMips.
 */
export const LIGHT_BLOOM = { mips: 3, strengthK: 1.2 };
function lightenBloom(pass) {
  pass.nMips = LIGHT_BLOOM.mips;
  const tints = pass.compositeMaterial.uniforms.bloomTintColors.value;
  for (let i = LIGHT_BLOOM.mips; i < tints.length; i++) tints[i] = new THREE.Vector3(0, 0, 0);
  pass.strength *= LIGHT_BLOOM.strengthK;
}
import { pickQuality, gpuClass } from './quality-pick.js';
import { markSlow, SLOW_LEVEL } from './device-note.js';

// Quality tiers. `grass` scales instanced grass, `trees` the scatter density, `shadow` the map size.
export const QUALITY = {
  low: { name: 'Low', dpr: 1.0, maxPixels: 1.3e6, shadow: 1024, shadowRange: 30, bloom: true, bloomHalf: true, msaa: 0, grass: 0.3, trees: 0.6, terrainStep: 3, clouds: 3, env: true, propDist: 80, buildDist: 300, propShadows: false, npcAnim: 26, npcDraw: 75, npcShadow: 16, mergeChars: true, riverbedDist: 30, shadowEvery: 2, midDist: 140, governor: true },
  medium: { name: 'Medium', dpr: 1.25, maxPixels: 2.6e6, shadow: 2048, shadowRange: 42, bloom: true, bloomHalf: false, msaa: 4, grass: 0.65, trees: 0.85, terrainStep: 2, clouds: 4, env: true, propDist: 150, buildDist: 520, propShadows: true, npcAnim: 40, npcDraw: 115, npcShadow: 30, mergeChars: true, riverbedDist: 130, shadowEvery: 2, governor: true },
  high: { name: 'High', dpr: 2.0, maxPixels: 5.0e6, shadow: 4096, shadowRange: 55, bloom: true, bloomHalf: false, msaa: 4, grass: 1, trees: 1, terrainStep: 2, clouds: 5, env: true, propDist: 240, buildDist: 900, propShadows: true, npcAnim: 55, npcDraw: 150, npcShadow: 45, mergeChars: true, riverbedDist: 170, governor: true },
};

/**
 * Opaque draws grouped by shader program, then by material (three.js sorts them by material alone), so a frame sets each
 * program fewer times: on the phone tier 61 -> 50 program switches at Takamori and 62 -> 40 at Kawabe, about 0.8 ms
 * less work a frame at 8x CPU. Only the order of opaque, depth-tested draws changes; render order still comes first.
 */
export function programFirst(properties) {
  const pid = m => properties.get(m).currentProgram?.id ?? 1e9;
  return (a, b) => a.groupOrder - b.groupOrder || a.renderOrder - b.renderOrder || pid(a.material) - pid(b.material)
    || a.material.id - b.material.id || a.z - b.z || a.id - b.id;
}

// Bloom. Fitted to the look the valley had before three r186, whose rewritten bloom spreads about twice as much light at
// the old 0.42 / 0.55: night lanterns and sunlit snow washed out. These two numbers match night, dusk, day and snow.
export const BLOOM = { strength: 0.2, radius: 0.4, threshold: 0.92 };

export function isMobile() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && window.innerWidth < 1100);
}

/** The graphics chip's name as the browser gives it ('' when it will not say). */
export function glRendererName(gl) {
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String((ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) || '');
  } catch { return ''; }
}

export function detectQuality(gl) {
  const saved = (() => { try { return localStorage.getItem('starline-quality'); } catch { return null; } })();
  const renderer = glRendererName(gl);
  // the player's own choice (Settings) always wins; otherwise the GPU, the screen and the machine decide (quality-pick.js)
  return pickQuality({
    saved: saved && QUALITY[saved] ? saved : null, renderer, mobile: isMobile(),
    width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio || 1,
    deviceMemory: navigator.deviceMemory, cores: navigator.hardwareConcurrency,
  });
}

// Colour grade applied in linear HDR before tone mapping: vibrance, warm lift, vignette.
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uVibrance: { value: 0.22 },
    uSaturation: { value: 1.06 },
    uWarm: { value: 0.03 },
    uVignette: { value: 0.28 },
    uNight: { value: 0 },
    uFade: { value: 0 },
    uFadeColor: { value: new THREE.Color(0x0b1024) },
    uUnder: { value: 0 },
    uTime: { value: 0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uVibrance, uSaturation, uWarm, uVignette, uNight, uFade, uUnder, uTime;
    uniform vec3 uFadeColor;
    varying vec2 vUv;
    void main() {
      // under water the picture sways a little, like looking through moving water
      vec2 wob = vec2(sin(vUv.y * 21.0 + uTime * 1.9), cos(vUv.x * 17.0 + uTime * 1.5)) * 0.0022 * uUnder;
      vec4 c = texture2D(tDiffuse, vUv + wob);
      vec3 col = c.rgb;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      float mx = max(col.r, max(col.g, col.b)), mn = min(col.r, min(col.g, col.b));
      float sat = (mx - mn) / (mx + 1e-4);
      col = mix(vec3(l), col, uSaturation + uVibrance * (1.0 - sat));
      col *= vec3(1.0 + uWarm, 1.0 + uWarm * 0.35, 1.0 - uWarm * 0.6);
      // Night: cool the shadows but keep lamp light warm.
      col = mix(col, col * vec3(0.86, 0.94, 1.12), uNight * (1.0 - smoothstep(0.4, 1.6, l)));
      vec2 q = vUv - 0.5;
      col = mix(col, col * vec3(0.62, 0.96, 1.02) + vec3(0.0, 0.012, 0.018), uUnder * 0.75);
      col *= 1.0 - (uVignette + uUnder * 0.35) * smoothstep(0.35, 0.95, dot(q, q) * 2.2);
      col = mix(col, uFadeColor, uFade);
      gl_FragColor = vec4(max(col, 0.0), c.a);
    }`,
};

export class Renderer {
  /** opts.res: a resolution mode for this page only (?res=auto|sharp|balanced), else the saved one (engine/resolution.js). */
  constructor(canvas, qualityName, opts = {}) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    const gl = this.renderer.getContext();
    this.qualityName = QUALITY[qualityName] ? qualityName : detectQuality(gl);
    this.q = QUALITY[this.qualityName];
    // Settings > Resolution (engine/resolution.js): what the screen, the chip and the player's choice allow
    this.mobile = isMobile();
    this.gpuName = glRendererName(gl);
    this.gpu = gpuClass(this.gpuName);
    this.resMode = readResMode(opts.res);
    this.ssOn = true;           // a supersampled picture's extra pixels (the governor's first step gives them up)
    this.governor = this.q.governor ? this.makeGovernor(this.qualityName) : null;
    const r = this.renderer;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true;
    // PCF is the soft filter since three r182 (PCFSoftShadowMap is gone). Name it here, before anything is compiled:
    // three only swaps the old name over when it first draws a shadow map, and a tier that skips the shadow pass on its
    // first frame then keeps shaders that read the map as a plain texture: the GPU refuses those draws and the ground,
    // houses and people vanish (seen on the Low tier).
    r.shadowMap.type = THREE.PCFShadowMap;
    this.scale = 1; // adaptive resolution factor (0.6 .. 1)
    this.frameTimes = [];
    this.composer = null;
    this.buildComposer();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /** Opaque draws grouped by program first (programFirst); off: three.js's own order (?sort=off). */
  setProgramSort(on) { this.renderer.setOpaqueSort(on ? programFirst(this.renderer.properties) : null); }

  /**
   * Compile the shader program of everything in `scene` (hidden things too) now, behind the loading screen, instead
   * of the first time each thing is drawn: arriving somewhere new linked 1-6 programs in one frame, a stall of
   * 100-500 ms at 8x CPU. Compiled against the composer's HDR target, like every frame of the world (its programs differ
   * from ones for the screen: tone mapping, output colour space). Waits at most `maxMs` for the browser to finish.
   */
  async warm(scene, camera, maxMs = 8000) {
    const r = this.renderer, prev = r.getRenderTarget(), rt = this.composer?.renderTarget1;
    let ready;
    try { if (rt) r.setRenderTarget(rt); ready = r.compileAsync(scene, camera); }
    finally { r.setRenderTarget(prev); }
    let timer;
    await Promise.race([ready, new Promise(res => { timer = setTimeout(res, maxMs); })]);
    clearTimeout(timer);
  }

  setQuality(name) {
    if (!QUALITY[name]) return;
    const was = this.q;
    this.qualityName = name;
    this.q = QUALITY[name];
    // back from a governor step that had made the shadow map smaller: the tier's own size again
    if (this.q.shadow !== was.shadow && this.q.shadowRange === was.shadowRange) this.onShadowChange?.(this.q);
    this.governor = this.q.governor ? this.makeGovernor(name) : null; this.appliedLevel = 0; this.ssOn = true;
    if (!this.fixedScale) this.scale = 1;
    try { localStorage.setItem('starline-quality', name); } catch { /* ignore */ }
    this.buildComposer();
    this.resize();
  }

  /**
   * Settings > Resolution: 'auto' | 'sharp' | 'balanced' (engine/resolution.js), saved for this device. Takes effect at
   * once: the tier as designed again, and a governor with the mode's own ladder.
   */
  setResolutionMode(mode) {
    mode = resModeOf(mode);
    saveResMode(mode);
    if (mode === this.resMode) return;
    this.resMode = mode;
    const was = this.q;
    this.q = QUALITY[this.qualityName];
    if (this.q.shadow !== was.shadow) this.onShadowChange?.(this.q);
    this.governor = this.q.governor ? this.makeGovernor(this.qualityName) : null; this.appliedLevel = 0; this.ssOn = true;
    if (!this.fixedScale) this.scale = 1;
    if (this.q.msaa !== was.msaa || !!this.q.bloomHalf !== !!was.bloomHalf) this.buildComposer();
    else if (this.bloom) this.bloom.enabled = !!this.q.bloom;
    this.resize();
    if (this.floor) this.applyLevel();
  }

  /**
   * Settings > Advanced > Render resolution: a fixed fraction (the governor then holds still), or null for automatic, which
   * goes back to the governor's own scale at its present step (it used to stay at the old fixed one).
   */
  setFixedScale(v) {
    this.fixedScale = v || null;
    this.scale = this.fixedScale || (this.governor ? settingsAt(QUALITY[this.qualityName], this.appliedLevel || 0, this.ladder).scale : 1);
    this.resize();
  }

  /** What this tier may draw under the player's resolution choice on this device (engine/resolution.js). */
  resPlan() { return resolutionPlan(QUALITY[this.qualityName], { mode: this.resMode, mobile: this.mobile, gpu: this.gpu }); }

  /** For Settings and the performance report: the drawing buffer, the screen's own pixels, the percentage, tier and mode. */
  resolutionInfo() {
    const r = this.res || { w: innerWidth, h: innerHeight, dpr: devicePixelRatio || 1, pr: this.pixelRatio || 1 };
    return { ...resolutionInfo(r), tier: QUALITY[this.qualityName].name, mode: this.resMode, level: this.appliedLevel || 0,
      fixed: !!this.fixedScale, gpu: this.gpu, mobile: this.mobile };
  }

  buildComposer() {
    const q = this.q;
    const size = this.renderer.getSize(new THREE.Vector2());
    const samples = this.samples = Math.min(q.msaa, this.renderer.capabilities.maxSamples || 0);
    const rt = new THREE.WebGLRenderTarget(Math.max(1, size.x), Math.max(1, size.y), { type: THREE.HalfFloatType, samples });
    this.onSamples?.(samples);   // (game.js: the people's faces use alpha to coverage only on a multisampled frame)
    this.composer?.dispose();
    this.bloom?.dispose();
    this.composer = new EffectComposer(this.renderer, rt);
    this.renderPass = new RenderPass(null, null);
    this.composer.addPass(this.renderPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), BLOOM.strength, BLOOM.radius, BLOOM.threshold);
    this.bloom.enabled = q.bloom;
    if (q.bloomHalf) lightenBloom(this.bloom);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
    // photo mode's filters (engine/photo-pass.js), once it has been opened: after the output, off unless a filter is on
    if (this.photoPass) this.composer.addPass(this.photoPass);
  }

  /**
   * The pixel ratio comes from engine/resolution.js: the tier's caps, the player's resolution choice, the governor's
   * scale and supersampling. force: a pixel ratio for one photo-mode shot (game/photo.js fitShot), past all of those.
   */
  resize(force) {
    const w = window.innerWidth, h = window.innerHeight, dpr = window.devicePixelRatio || 1;
    const plan = this.resPlan();
    // (a fixed percentage from Settings > Advanced is the player's own, a share of the screen's resolution: neither
    //  Sharp's floor nor supersampling overrule it)
    const fixed = !!this.fixedScale;
    const pr = force || pixelRatioFor({ w, h, dpr, plan: fixed ? { ...plan, floor: false } : plan, scale: this.scale, ssOn: this.ssOn !== false && !fixed });
    this.pixelRatio = Math.max(0.5, pr);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.pixelRatio);
    this.composer.setSize(w, h);
    if (this.q.bloomHalf) this.bloom.resolution.set(w / 2, h / 2);
    if (force) return void this.onResize?.(w, h);
    // drawn larger than the screen (supersampled): the glow blurs at the screen's own size, so it reaches as far on screen
    // as at the screen's resolution (its blur is counted in texels of its mip chain)
    this.bloomSize = this.pixelRatio > dpr ? [Math.round(w * dpr), Math.round(h * dpr)] : null;
    if (this.bloomSize) this.bloom.setSize(...this.bloomSize);
    this.res = { w, h, dpr, pr: this.pixelRatio };
    this.onResize?.(w, h);
    this.onResolution?.(this.resolutionInfo());
  }

  makeGovernor(name) {
    const ss = ssFor({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio || 1, plan: this.resPlan() }) > 1;
    const { ladder, opts } = governorFor(name, { mode: this.resMode, mobile: this.mobile, ss });
    this.ladder = ladder;
    return new Governor({ levels: ladder.length, ...opts });
  }

  /**
   * Adaptive quality: step down the tier's ladder (governor.js) when frames are consistently slow. While the game paces
   * frames (game.js sets `pacedWork`: the last frame's own work in seconds), the Low governor judges that instead.
   */
  track(dt) {
    if (this.fixedScale) return;
    if (this.governor) {
      // Low tier: a ladder of small steps (people and prop distances, shadow rate, then resolution) instead of
      // resolution alone, because a phone is usually short of CPU, which a smaller picture does not help
      if (this.hold) return;                     // a video is showing: nothing is drawn, so there is nothing to judge
      if (this.governor.frame(this.pacedWork ?? dt) !== null) this.applyLevel();
      return;
    }
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 90) return;
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const p50 = sorted[45];
    this.frameTimes.length = 0;
    const target = 1 / 50;
    if (p50 > target * 1.25 && this.scale > 0.62) { this.scale = Math.max(0.62, this.scale - 0.1); this.resize(); }
    else if (p50 < target * 0.7 && this.scale < 1) { this.scale = Math.min(1, this.scale + 0.05); this.resize(); }
  }

  /**
   * Cinematics on the Low tier (the arrival, the live scene tour) start `n` steps down the governor's ladder: their
   * wide views cost more than play, and waiting for the governor to find that out is seconds of stutter. 0 lifts it.
   */
  // (only the Low tier and phones take a floor: a desktop on Medium or High took it too until 2026-11-28, which on the old
  //  desktop ladder meant every mini game round, the Mini games menu, the arrival flight and the scene tour at 72 %)
  setFloor(n) { this.floor = n; this.applyLevel(); }

  applyLevel() {
    if (!this.governor || this.fixedScale) return;
    const level = Math.max(this.governor.level, this.qualityName === 'low' || this.mobile ? this.floor || 0 : 0);
    if (level === (this.appliedLevel || 0)) return;
    this.appliedLevel = level;
    // far down the Low ladder by the governor's own judgement (not a cinematic's floor): remember the device as slow
    if (this.qualityName === 'low' && this.governor.level >= SLOW_LEVEL) markSlow();
    const { q, scale, ss } = settingsAt(QUALITY[this.qualityName], level, this.ladder);
    const was = this.q;
    this.q = q;
    // another sample count needs another render target; a lighter glow is built with fewer blur levels
    const rebuild = q.msaa !== was.msaa || !!q.bloomHalf !== !!was.bloomHalf;
    if (q.shadow !== was.shadow) this.onShadowChange?.(q);       // a smaller shadow map (the sky makes a new one)
    if (rebuild) this.buildComposer();
    else if (q.bloom !== was.bloom && this.bloom) this.bloom.enabled = !!q.bloom;   // (round-light.js reads q.bloom too)
    if (scale !== this.scale || ss !== this.ssOn || rebuild) { this.scale = scale; this.ssOn = ss; this.resize(); }
  }

  render(scene, camera) {
    // a recorded clip covers the view (game/video.js): the picture is the video's, nothing is drawn
    if (this.hold) { this.held = (this.held || 0) + 1; return; }
    // focus mode (engine/focus.js): a still picture of the valley and only the round's own objects on top of it
    if (this.focus) {
      try { if (this.focus.render(this, scene, camera)) return; }
      catch (e) { console.error('[focus] drawing failed: back to the usual frame', e); const f = this.focus; this.focus = null; f.exit?.(); }
    }
    this.renderWorld(scene, camera);
  }

  /**
   * One photo-mode picture at pixel ratio `pr`: drawn larger, handed to `copy(canvas)` in the same task (the drawing
   * buffer is not preserved, so it must be read before the browser shows it), then the screen's size is back and the
   * view is drawn again, so not one blank frame is shown. -> what copy returned
   */
  shoot(scene, camera, pr, copy) {
    const sp = this.pixelRatio;
    let undo = null;
    try {
      this.resize(pr);
      // pixel-sized effects keep the preview's look in the larger picture: the bloom's mip chain at the screen's size
      // (its blur reach is counted in mip texels; the composite upsamples them), point sprites scaled by the ratio
      this.bloom.setSize(...(this.bloomSize || [innerWidth * sp, innerHeight * sp]));
      undo = this.onShot?.(pr / sp) || null;
      this.renderWorld(scene, camera, false);
      return copy(this.renderer.domElement);
    } finally {
      try { undo?.(); } finally {
        this.resize();
        this.renderWorld(scene, camera, false);
      }
    }
  }

  /** The usual frame: shadows, the whole scene, bloom, grade, output. `shadows: false` keeps the shadow map as it is. */
  renderWorld(scene, camera, shadows = true) {
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
    // our own matrix pass: hidden and unmoved objects cost nothing (see matrices.js)
    // lighter tiers refresh the shadow map every other frame. The map and its matrix stay a matched pair, so nothing
    // swims; only moving shadows (people, swaying crowns) update at half the frame rate.
    const sm = this.renderer.shadowMap, every = this.shadowEvery ?? this.q.shadowEvery ?? 1;
    if (!shadows) { sm.autoUpdate = false; sm.needsUpdate = false; }
    else if (every > 1 || this.shadowDirty) { sm.autoUpdate = every <= 1; if ((this.shadowTick = (this.shadowTick || 0) + 1) % every === 0 || this.shadowDirty) { sm.needsUpdate = true; this.shadowDirty = false; } }
    else if (!sm.autoUpdate) { sm.autoUpdate = true; sm.needsUpdate = true; }
    View.update(camera);                       // out-of-view people and animals hide their bodies first (engine/view.js)
    Cells.update(camera, shadows && this.renderer.shadowMap.enabled);   // and squares of buildings nobody sees (engine/cell-grid.js)
    scene.matrixWorldAutoUpdate = this.fastMatrices === false;
    if (this.fastMatrices !== false) updateWorldMatrices(scene);
    this.composer.render();
  }
}
