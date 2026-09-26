import * as THREE from 'three';
import { lightingAt } from './seasons.js';

const toLinear = rgb => new THREE.Color().setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);

const SKY_VS = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww; // far plane: drawn last, only where nothing else is
  }`;

const SKY_FS = /* glsl */`
  uniform vec3 uZenith, uHorizon, uSunDir, uSunColor, uMoonDir, uCloudLit, uCloudShade;
  uniform float uTime, uStars, uNight, uCover, uSunVis;
  uniform int uOct;
  varying vec3 vDir;
  float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float hash13(vec3 p3) { p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f);
    return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float s = 0., a = .5;
    for (int i = 0; i < 6; i++) { if (i >= uOct) break; s += a * vnoise(p); p = p * 2.07 + vec2(1.7, 9.2); a *= .5; }
    return s;
  }
  void main() {
    vec3 d = normalize(vDir);
    float y = d.y;
    float t = pow(clamp(y, 0., 1.), 0.42);
    vec3 col = mix(uHorizon, uZenith, t);
    // warm horizon glow toward the sun at low sun angles
    float sd = max(dot(d, uSunDir), 0.);
    float low = 1. - smoothstep(0.05, 0.45, uSunDir.y);
    col += uSunColor * pow(sd, 6.) * 0.35 * low * (1. - uNight) * smoothstep(-0.2, 0.25, y + 0.1);
    col = mix(col, uHorizon * 0.85, smoothstep(0.0, -0.25, y));
    // sun disc + halo (HDR, feeds bloom)
    col += uSunColor * (pow(sd, 32.) * 0.35 + pow(sd, 400.) * 1.2) * uSunVis;
    col += uSunColor * smoothstep(0.99955, 0.9998, sd) * 18. * uSunVis;
    // night sky: stars + milky way + moon
    if (uStars > 0.01) {
      vec3 sp = d * 180.;
      vec3 cell = floor(sp);
      float h = hash13(cell);
      vec3 f = fract(sp) - 0.5 - (vec3(hash13(cell + 3.1), hash13(cell + 7.7), hash13(cell + 1.3)) - .5) * .6;
      float star = step(0.972, h) * smoothstep(0.22, 0.0, length(f));
      float tw = 0.6 + 0.4 * sin(uTime * (1.5 + h * 4.) + h * 60.);
      vec3 sc = mix(vec3(1., .85, .7), vec3(.75, .85, 1.), hash13(cell + 5.));
      float band = exp(-pow(dot(d, normalize(vec3(0.5, 0.35, -0.8))), 2.) * 9.);
      float mw = band * smoothstep(0.35, 0.85, fbm(d.xz / (abs(d.y) + .3) * 3.)) ;
      col += (sc * star * tw * (1.2 + band * 1.5) + vec3(.35, .4, .75) * mw * 0.22) * uStars * smoothstep(-0.05, 0.2, y);
      float md = dot(d, normalize(uMoonDir));
      col += vec3(1.0, .96, .88) * smoothstep(0.99935, 0.99955, md) * 3.0 * uStars;
      col += vec3(.45, .55, .9) * pow(max(md, 0.), 200.) * 0.5 * uStars;
    }
    // clouds: a painted cumulus deck, lit toward the sun, darker undersides
    if (y > 0.0) {
      vec2 uv = d.xz / (y + 0.12) * 1.25 + vec2(uTime * 0.006, uTime * 0.002);
      float n = fbm(uv * 1.1);
      float n2 = fbm(uv * 1.1 + uSunDir.xz * 0.12);
      float c = smoothstep(0.62 - uCover * 0.35, 0.86 - uCover * 0.2, n);
      float lit = clamp(0.55 + (n - n2) * 5.0, 0., 1.);
      vec3 cc = mix(uCloudShade, uCloudLit, lit);
      cc += uSunColor * pow(sd, 10.) * 0.35 * (1. - c) * (1. - uNight);
      col = mix(col, cc, c * smoothstep(0.0, 0.14, y) * 0.95);
    }
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

export class Sky {
  constructor(scene, renderer, quality) {
    this.scene = scene;
    this.renderer = renderer;
    this.uniforms = {
      uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color(1, 1, 1) },
      uMoonDir: { value: new THREE.Vector3(-0.45, 0.62, 0.52) },
      uCloudLit: { value: new THREE.Color(1, 1, 1) }, uCloudShade: { value: new THREE.Color(0.7, 0.75, 0.85) },
      uTime: { value: 0 }, uStars: { value: 0 }, uNight: { value: 0 }, uCover: { value: 0.45 }, uSunVis: { value: 1 },
      uOct: { value: quality.clouds },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: SKY_VS, fragmentShader: SKY_FS,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(4000, 48, 24), mat);
    this.mesh.renderOrder = 100;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    // Light rig: one key light (sun or moon) with a player-following shadow box, plus sky fill.
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.035;
    this.setShadow(quality);
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbfdfff, 0x6b7f3c, 1);
    scene.add(this.hemi);
    scene.fog = new THREE.FogExp2(0xbfdfff, 0.0014);

    // Environment map from a sky-only scene (reflections on glossy paint, glass and water).
    this.envScene = new THREE.Scene();
    this.envSky = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), new THREE.ShaderMaterial({
      uniforms: { ...this.uniforms, uOct: { value: 2 }, uStars: { value: 0 } },
      vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false,
    }));
    this.envScene.add(this.envSky);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envRT = null;
    this.lastEnvKey = '';
    this.state = null;
  }

  setShadow(q) {
    const s = this.sun.shadow;
    s.mapSize.set(q.shadow, q.shadow);
    s.map?.dispose(); s.map = null;
    const r = q.shadowRange;
    Object.assign(s.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: 420 });
    s.camera.updateProjectionMatrix();
    this.shadowRange = r;
  }

  /** season: name; hour: 0..24; focus: Vector3 around which shadows are rendered. */
  update(dt, season, hour, focus, cover = 0.45) {
    const L = lightingAt(season, hour);
    this.state = L;
    const u = this.uniforms;
    u.uTime.value += dt;
    u.uZenith.value.copy(toLinear(L.zenith));
    u.uHorizon.value.copy(toLinear(L.horizon));
    u.uSunDir.value.set(L.sunDir.x, L.sunDir.y, L.sunDir.z).normalize();
    u.uSunColor.value.copy(toLinear(L.sunColor));
    u.uStars.value = L.stars;
    u.uNight.value = L.night;
    u.uSunVis.value = THREE.MathUtils.smoothstep(L.sunDir.y, -0.04, 0.03) * (1 - L.night);
    u.uCover.value = cover;
    const hz = u.uHorizon.value;
    u.uCloudLit.value.setRGB(1, 1, 1).lerp(u.uSunColor.value, 0.35).multiplyScalar(1 - L.night * 0.85);
    u.uCloudShade.value.copy(hz).lerp(u.uZenith.value, 0.35).multiplyScalar(0.92);
    this.mesh.position.copy(focus);

    // key light
    const ld = new THREE.Vector3(L.lightDir.x, Math.max(L.lightDir.y, 0.1), L.lightDir.z).normalize();
    this.sun.color.copy(toLinear(L.sunColor));
    this.sun.intensity = L.sunIntensity;
    // snap the shadow box to its texel grid so shadows don't shimmer while the player moves
    const texel = (this.shadowRange * 2) / this.sun.shadow.mapSize.x;
    const snapped = focus.clone();
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), ld.clone().negate(), new THREE.Vector3(0, 1, 0));
    const inv = m.clone().invert();
    snapped.applyMatrix4(inv);
    snapped.x = Math.round(snapped.x / texel) * texel;
    snapped.y = Math.round(snapped.y / texel) * texel;
    snapped.applyMatrix4(m);
    this.sun.target.position.copy(snapped);
    this.sun.position.copy(snapped).addScaledVector(ld, 200);
    this.sun.target.updateMatrixWorld();

    this.hemi.color.copy(u.uZenith.value).lerp(new THREE.Color(1, 1, 1), 0.35);
    this.hemi.groundColor.setRGB(0.36, 0.34, 0.22).multiplyScalar(1 - L.night * 0.7);
    this.hemi.intensity = L.hemi * 1.25;
    this.scene.fog.color.copy(toLinear(L.fog));
    this.scene.fog.density = 0.0012 + L.night * 0.0006;
    this.scene.environmentIntensity = L.env;

    // regenerate the environment map when the light changes noticeably
    const key = `${season}:${Math.round(hour * 4)}`;
    const now = performance.now();
    if (key !== this.lastEnvKey && (now - (this.lastEnvAt || 0) > 600 || key.split(':')[0] !== this.lastEnvKey.split(':')[0])) {
      this.lastEnvAt = now;
      this.lastEnvKey = key;
      this.envSky.material.uniforms.uStars.value = 0;
      const rt = this.pmrem.fromScene(this.envScene, 0, 0.1, 1000);
      this.envRT?.dispose();
      this.envRT = rt;
      this.scene.environment = rt.texture;
    }
    return L;
  }
}
