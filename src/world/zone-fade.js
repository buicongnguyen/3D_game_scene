// A play zone's edge in the ground's own shaders (docs/PLAY-ZONES-PLAN.md, world/zone-backdrop.js): the terrain and the
// river are dithered away between two radii round the zone, so the baked far view behind them shows through without
// a hard line and without sorting transparent ground. Outside a zone the radii are huge and nothing is discarded.
import * as THREE from 'three';

/** One uniform shared by every material that fades: x, z of the zone's middle, the radius the fade starts and ends at. */
export const ZONE_FADE = { value: new THREE.Vector4(0, 0, 1e9, 2e9) };

/** Declarations (put after #include <common> in a fragment shader). */
export const ZONE_FADE_PARS = /* glsl */`
  uniform vec4 uZoneFade;
  const float ZONE_BAYER[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
  void zoneFade(vec3 wpos) {
    float d = distance(wpos.xz, uZoneFade.xy);
    if (d <= uZoneFade.z) return;
    float t = (d - uZoneFade.z) / max(uZoneFade.w - uZoneFade.z, 0.001);
    ivec2 c = ivec2(mod(gl_FragCoord.xy, 4.0));
    if (t >= 1.0 || (ZONE_BAYER[c.x + c.y * 4] + 0.5) / 16.0 < t) discard;
  }`;

/** Start fading at r0, gone at r1 (metres from the zone's middle). */
export function setZoneFade(zone, r0, r1) { ZONE_FADE.value.set(zone.x, zone.z, r0, r1); }
