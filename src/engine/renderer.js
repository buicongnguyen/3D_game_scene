import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// Quality tiers. `grass` scales instanced grass, `trees` the scatter density, `shadow` the map size.
export const QUALITY = {
  low: { name: 'Low', dpr: 1.0, maxPixels: 1.3e6, shadow: 1024, shadowRange: 30, bloom: true, bloomHalf: true, msaa: 0, grass: 0.3, trees: 0.6, terrainStep: 3, clouds: 3, env: true, propDist: 80, buildDist: 300, propShadows: false },
  medium: { name: 'Medium', dpr: 1.25, maxPixels: 2.6e6, shadow: 2048, shadowRange: 42, bloom: true, bloomHalf: false, msaa: 4, grass: 0.65, trees: 0.85, terrainStep: 2, clouds: 4, env: true, propDist: 150, buildDist: 520, propShadows: true },
  high: { name: 'High', dpr: 2.0, maxPixels: 5.0e6, shadow: 4096, shadowRange: 55, bloom: true, bloomHalf: false, msaa: 4, grass: 1, trees: 1, terrainStep: 2, clouds: 5, env: true, propDist: 240, buildDist: 900, propShadows: true },
};

export function isMobile() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && window.innerWidth < 1100);
}

export function detectQuality(gl) {
  const saved = (() => { try { return localStorage.getItem('starline-quality'); } catch { return null; } })();
  if (saved && QUALITY[saved]) return saved;
  let renderer = '';
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  } catch { /* ignore */ }
  if (/SwiftShader|llvmpipe|Software|Basic Render/i.test(renderer)) return 'low';
  if (isMobile()) return 'low';
  return /RTX|Radeon RX|Apple M[2-9]|Arc/i.test(renderer) ? 'high' : 'medium';
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
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uVibrance, uSaturation, uWarm, uVignette, uNight, uFade;
    uniform vec3 uFadeColor;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      float mx = max(col.r, max(col.g, col.b)), mn = min(col.r, min(col.g, col.b));
      float sat = (mx - mn) / (mx + 1e-4);
      col = mix(vec3(l), col, uSaturation + uVibrance * (1.0 - sat));
      col *= vec3(1.0 + uWarm, 1.0 + uWarm * 0.35, 1.0 - uWarm * 0.6);
      // Night: cool the shadows but keep lamp light warm.
      col = mix(col, col * vec3(0.86, 0.94, 1.12), uNight * (1.0 - smoothstep(0.4, 1.6, l)));
      vec2 q = vUv - 0.5;
      col *= 1.0 - uVignette * smoothstep(0.35, 0.95, dot(q, q) * 2.2);
      col = mix(col, uFadeColor, uFade);
      gl_FragColor = vec4(max(col, 0.0), c.a);
    }`,
};

export class Renderer {
  constructor(canvas, qualityName) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    const gl = this.renderer.getContext();
    this.qualityName = qualityName || detectQuality(gl);
    this.q = QUALITY[this.qualityName];
    const r = this.renderer;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scale = 1; // adaptive resolution factor (0.6 .. 1)
    this.frameTimes = [];
    this.composer = null;
    this.buildComposer();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setQuality(name) {
    if (!QUALITY[name]) return;
    this.qualityName = name;
    this.q = QUALITY[name];
    try { localStorage.setItem('starline-quality', name); } catch { /* ignore */ }
    this.buildComposer();
    this.resize();
  }

  buildComposer() {
    const q = this.q;
    const size = this.renderer.getSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(Math.max(1, size.x), Math.max(1, size.y), {
      type: THREE.HalfFloatType, samples: Math.min(q.msaa, this.renderer.capabilities.maxSamples || 0),
    });
    this.composer?.dispose();
    this.bloom?.dispose();
    this.composer = new EffectComposer(this.renderer, rt);
    this.renderPass = new RenderPass(null, null);
    this.composer.addPass(this.renderPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.42, 0.55, 0.92);
    this.bloom.enabled = q.bloom;
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, this.q.dpr) * this.scale;
    if (w * h * dpr * dpr > this.q.maxPixels) dpr = Math.sqrt(this.q.maxPixels / (w * h));
    this.pixelRatio = Math.max(0.5, dpr);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.pixelRatio);
    this.composer.setSize(w, h);
    if (this.q.bloomHalf) this.bloom.resolution.set(w / 2, h / 2);
    this.onResize?.(w, h);
  }

  /** Adaptive resolution: drop the render scale when frames are consistently slow. */
  track(dt) {
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 90) return;
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const p50 = sorted[45];
    this.frameTimes.length = 0;
    const target = 1 / 50;
    if (p50 > target * 1.25 && this.scale > 0.62) { this.scale = Math.max(0.62, this.scale - 0.1); this.resize(); }
    else if (p50 < target * 0.7 && this.scale < 1) { this.scale = Math.min(1, this.scale + 0.05); this.resize(); }
  }

  render(scene, camera) {
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
    this.composer.render();
  }
}
