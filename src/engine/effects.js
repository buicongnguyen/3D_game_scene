// Shared uniforms for world-space material effects (snow cover on up-facing surfaces, foliage wind).
export const FX = {
  uTime: { value: 0 },
  uSnow: { value: 0 },
  uWind: { value: 1 },
};

const patched = new WeakSet();

/**
 * Patch a standard material in place: winter snow on up-facing surfaces and optional wind sway.
 * wind: 0 = rigid, 1 = foliage (sways above ~1.5 m), 2 = grass/flowers (sways from the ground up).
 */
export function patchMaterial(material, { wind = 0, snow = 1 } = {}) {
  if (!material || patched.has(material) || !material.isMeshStandardMaterial) return material;
  patched.add(material);
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (sh, r) => {
    prev?.(sh, r);
    sh.uniforms.uTime = FX.uTime;
    sh.uniforms.uSnow = FX.uSnow;
    sh.uniforms.uWind = FX.uWind;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime, uWind;
        varying vec3 vSnowN;
        varying float vSnowH;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          mat4 im = mat4(1.0);
          #ifdef USE_INSTANCING
            im = instanceMatrix;
          #endif
          vec3 base = (modelMatrix * im * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          vSnowN = normalize(mat3(modelMatrix * im) * objectNormal);
          vSnowH = (modelMatrix * im * vec4(transformed, 1.0)).y;
          ${wind ? `
          float hgt = max(transformed.y - ${wind === 1 ? '1.4' : '0.0'}, 0.0);
          float ph = base.x * 0.21 + base.z * 0.17;
          float sway = sin(uTime * 1.35 + ph) * 0.6 + sin(uTime * 2.7 + ph * 1.7) * 0.25;
          float amt = ${wind === 1 ? '0.022' : '0.12'} * uWind * hgt * ${wind === 1 ? '1.0' : 'hgt * 2.5'};
          transformed.x += sway * amt;
          transformed.z += cos(uTime * 1.1 + ph) * amt * 0.6;` : ''}
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uSnow;
        varying vec3 vSnowN;
        varying float vSnowH;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        ${snow ? `{
          float up = smoothstep(0.35, 0.75, vSnowN.y);
          float s = uSnow * up * smoothstep(-0.2, 0.3, vSnowH);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.96, 1.0), s * 0.92);
        }` : ''}`);
  };
  material.customProgramCacheKey = () => `fx${wind}${snow}`;
  material.needsUpdate = true;
  return material;
}
