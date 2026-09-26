import * as THREE from 'three';

// Procedural materials need the equivalent of texture mipmaps. Suppress grain
// above the pixel footprint instead of letting it sparkle as the camera moves.
export const SURFACE_FILTER_GLSL = `
float surfaceNoise(vec2 p) {
  float footprint = max(length(dFdx(p)), length(dFdy(p)));
  float detail = 1.0 - smoothstep(0.35, 1.0, footprint);
  return pn2(p) * detail;
}
`;

export function sceneSamples(quality, mobile, maxSamples) {
  const requested = mobile ? (quality >= 3 ? 2 : 0) : (quality >= 3 ? 4 : quality === 2 ? 2 : 0);
  return Math.min(requested, maxSamples);
}

// Keep close-up first-person geometry, but don't spend the aerial depth buffer
// on twelve centimetres in front of a camera looking hundreds of metres away.
export function updateViewDepth(camera, cinematic) {
  const near = cinematic ? 1.2 : .12;
  if (camera.near === near) return;
  camera.near = near;
  camera.updateProjectionMatrix();
}

export function updateModelLighting(sun, ambient, sunHeight) {
  const daylight = THREE.MathUtils.smoothstep(sunHeight, -.08, .20);
  // Sun altitude sets direction, not a second cosine attenuation of irradiance.
  // Standard materials already apply N dot L; the old extra factor left the
  // entire train almost black at the tour's normal fourteen-degree sun angle.
  sun.intensity = 2.2 * THREE.MathUtils.smoothstep(sunHeight, 0, .16);
  ambient.intensity = THREE.MathUtils.lerp(.32, 1.25, daylight);
}

export function trainMaterial(source) {
  const material = source.clone();
  // No environment map is rendered in this scene. Use a weathered, diffuse
  // railway finish instead of mirror-like metal reflecting a black environment.
  const finishes = {
    'locomotive enamel': [.05, .64, 1.35],
    'railway steel': [.25, .66, 1.12],
    'brass fittings': [.40, .52, 1.10],
    'dark blue window glass': [.05, .40, 1],
  };
  const finish = finishes[material.name];
  if (finish) {
    [material.metalness, material.roughness] = finish;
    material.color.multiplyScalar(finish[2]);
  }
  return material;
}
