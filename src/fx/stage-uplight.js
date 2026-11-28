// © 2026 Bui Cong Nguyen · solluxlabs.com
// The performers' stage light (docs/SHOW-EFFECTS.md "Stage light on the performers"; owner 2026-11-28: "in the night,
// maybe we need to add light from the ground to shine up on their bodies and faces ... or make their performance area
// lit so we can see their faces"). The show effects (fx/show-fx.js) light the scene but not the people; at night the
// performers stood dark against it. No three.js light is added (a light recompiles every lit material and costs every
// fragment of the valley): the performers' own material (the VRoid atlas, and the rows' joined copies of it,
// game/perform/row-merge.js) gets three terms in its fragment shader, driven by a few shared uniforms:
//   key    footlights along the stage front (a line on the ground in front of the group): strongest on the feet and
//          legs, falling off with distance and with height, still clearly on the face (the light seems to come from a
//          little higher on the upper body: a front-below key, not a horror-film light from the floor); facing term with
//          a soft wrap, nothing on the back of the body. Warm white with a breath of the section's colour.
//   fill   the stage area lit as a whole (front of house: from the audience and above), half-Lambert squared so it
//          keeps the body's shape and never looks flat or unlit; faces a little brighter (their bent normals,
//          actors/face-look.js, and the face mask)
//   rim    a soft rim in the section's colour (pink / blue / gold) on the silhouette, toward the stage front only
// Everything inside the formation's area only (a box with a soft edge, from the feet to above the hair): watchers and
// villagers are outside it (and wear other materials), a VRoid visitor elsewhere in the valley is never lit.
// Cost: no draw, no light, no texture, no extra program (the terms are part of the VRoid program from its first
// compile, behind one uniform test: off by day and when Show effects is Off, the branch is skipped). The CPU writes
// these uniforms once a frame during a show (fx/show-fx.js update). The world position and normal come from three's
// own varyings (vViewPosition, normal) and the view matrix: no vertex shader change, nothing added to the varyings.
// Switches: ?uplight=off (not patched, no footlights: the "before" pictures), ?uplight=key|fill|both, STAGE_MIX (key /
// fill / rim / ground at run time: the probes and tests/perf/show-perf.mjs --what=uplight, through ShowFX.light.mix).
import * as THREE from 'three';

/** The look (metres, linear light; irradiance in three's units, like a directional light's intensity). */
export const UP = Object.freeze({
  gap: 1.0,        // the footlights' line in front of the front-most performer (m)
  src: 0.12,       // their height over the ground (m)
  rise: 0.45,      // the light seems to come from this share of the fragment's height higher up (a front-below key)
  d0: 2.2,         // distance falloff: 1 / (1 + (d / d0)^2)
  top: 0.6,        // share of the key left at head height (1.7 m)
  wrap: 0.3,       // soft wrap of the facing term
  fillUp: 0.9,     // the fill comes from the audience and above (forward + this much up)
  face: 0.22,      // faces this much brighter (the face mask of actors/face-look.js)
  margin: 0.85,    // the lit area reaches this far past the outer performers (m)
  border: 0.7,     // its soft edge (m)
  key: 2.4,        // the key's strength (at the feet of the front row: ~2)
  fill: 0.45,      // the fill's strength
  rim: 1.4,        // the rim's strength
  keyWash: 0.14,   // share of the section colour in the key
  fillWash: 0.1,   // and in the fill
  pulse: 0.1,      // the key's lift on the beat
  pool: 0.3,       // the warm pool of light on the stage ground (fx/show-fx.js glow cards)
  // night (the valley's 0..1, world/seasons.js lightingAt) over which the light fades in: only after the sun is down.
  // 0.65 is the sun on the horizon (19:00, the end of Sunset; at dawn the night value is under 0.65 before sunrise at
  // 5:36), 0.95 about 20:10, real night. (Owner 2026-11-28: "in the daytime we maybe don't need the light ... with the
  // light added, all characters seem too bright": it used to fade in over 0.05-0.6, i.e. 17:40-18:55, the whole sunset
  // hour, so by 18:40 the performers stood in nearly full footlights under a still-orange sky.)
  nightFrom: 0.65, nightTo: 0.95,
});
const KEY = new THREE.Color(1.0, 0.86, 0.72), FILL = new THREE.Color(1.0, 0.9, 0.8);

/** The uniforms every patched material shares (one object each, by reference). */
export const UPLIGHT = {
  uUpK: { value: new THREE.Vector4(0, 0, 0, 0) },       // key, fill, rim, face boost (all 0: skipped)
  uUpKey: { value: new THREE.Color() },
  uUpFill: { value: new THREE.Color() },
  uUpRim: { value: new THREE.Color() },
  uUpO: { value: new THREE.Vector3() },                  // the stage frame's origin: the formation's centre on the ground
  uUpF: { value: new THREE.Vector4(0, 1, 0, 0) },       // forward (to the audience) on the ground: world x, z; slope dy/dx, dy/dz
  uUpBox: { value: new THREE.Vector4(1, 0, 0, 1) },     // half width, front, back (frame z), the footlights' z
};
/** Probes and pictures: each term's share (1 = as designed); ground: the footlights' glow and the pool on the ground. */
export const STAGE_MIX = { key: 1, fill: 1, rim: 1, ground: 1 };

const q = typeof location !== 'undefined' ? location.search || '' : '';
export const UPLIGHT_ON = !/[?&]uplight=off\b/.test(q);
{ const m = /[?&]uplight=(key|fill|both)\b/.exec(q); if (m) { STAGE_MIX.key = m[1] === 'fill' ? 0 : 1; STAGE_MIX.rim = STAGE_MIX.key; STAGE_MIX.fill = m[1] === 'key' ? 0 : 1; } }

const num = x => (Number.isInteger(x) ? `${x}.0` : String(x));
const PARS = /* glsl */`
uniform vec4 uUpK, uUpF, uUpBox;
uniform vec3 uUpKey, uUpFill, uUpRim, uUpO;`;
const frag = face => /* glsl */`
	// the stage light on the performers (fx/stage-uplight.js): footlights, fill and rim inside the formation's area
	if ( uUpK.x + uUpK.y + uUpK.z > 0.0 ) {
		vec3 upW = ( vec4( - vViewPosition, 0.0 ) * viewMatrix ).xyz + cameraPosition;   // this fragment in the world
		vec3 upF = vec3( uUpF.x, 0.0, uUpF.y ), upR = vec3( uUpF.y, 0.0, - uUpF.x ), upRel = upW - uUpO;
		float upX = dot( upRel, upR ), upZ = dot( upRel, upF ), upH = upRel.y - upX * uUpF.z - upZ * uUpF.w;
		float upA = ( 1.0 - smoothstep( uUpBox.x, uUpBox.x + ${num(UP.border)}, abs( upX ) ) )
			* ( 1.0 - smoothstep( uUpBox.y, uUpBox.y + ${num(UP.border)}, upZ ) ) * smoothstep( uUpBox.z - ${num(UP.border)}, uUpBox.z, upZ )
			* smoothstep( - 0.5, - 0.15, upH ) * ( 1.0 - smoothstep( 2.4, 3.2, upH ) );
		if ( upA > 0.0 ) {
			vec3 upN = normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );   // (on faces: the bent normals)
			float upHp = max( upH, 0.0 );
			// the key: toward the footlights' line in front (forward, up in the frame), its source a little higher for a higher point
			vec2 upL = vec2( max( uUpBox.w - upZ, 0.3 ), ${num(UP.src)} - ${num(1 - UP.rise)} * upHp );
			float upD2 = dot( upL, upL );
			vec3 upLd = ( upF * upL.x + vec3( 0.0, upL.y, 0.0 ) ) * inversesqrt( upD2 );
			float upKey = clamp( ( dot( upN, upLd ) + ${num(UP.wrap)} ) / ${num(1 + UP.wrap)}, 0.0, 1.0 )
				/ ( 1.0 + upD2 * ${num(+(1 / (UP.d0 * UP.d0)).toFixed(5))} ) * mix( 1.0, ${num(UP.top)}, smoothstep( 0.0, 1.7, upHp ) );
			// the fill: from the audience and above, half-Lambert squared (shape kept, nothing on the back)
			float upHl = clamp( 0.5 + 0.5 * dot( upN, normalize( vec3( uUpF.x, ${num(UP.fillUp)}, uUpF.y ) ) ), 0.0, 1.0 );
			// the rim: the silhouette on the side toward the stage front
			float upV = clamp( dot( normal, normalize( vViewPosition ) ), 0.0, 1.0 );   // (both in view space)
			float upRim = ( 1.0 - upV ) * ( 1.0 - upV ) * ( 1.0 - upV ) * smoothstep( - 0.35, 0.35, dot( upN, upF ) );
			vec3 upE = uUpKey * ( uUpK.x * upKey ) + uUpFill * ( uUpK.y * upHl * upHl ) + uUpRim * ( uUpK.z * upRim );
			${face ? 'upE *= 1.0 + uUpK.w * vFace;   // (faces a little brighter: actors/face-look.js face mask)' : ''}
			reflectedLight.directDiffuse += upA * upE * BRDF_Lambert( diffuseColor.rgb );
		}
	}`;

/** The fragment changes on a compiled shader (a lit three material: standard, physical, lambert, phong, toon). */
export function uplightShader(sh) {
  if (!sh.fragmentShader.includes('#include <lights_fragment_end>')) return;
  Object.assign(sh.uniforms, UPLIGHT);
  const face = /varying float vFace;/.test(sh.fragmentShader);
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', `#include <common>${PARS}`)
    .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>${frag(face)}`);
}

/** Patch a performer's material in place (once; chains its existing hooks and program key). */
export function patchUplight(m) {
  if (!m || m.userData.uplight || !UPLIGHT_ON) return m;
  m.userData.uplight = true;
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
  m.onBeforeCompile = (sh, r) => { prev?.call(m, sh, r); uplightShader(sh); };
  m.customProgramCacheKey = () => `${prevKey === THREE.Material.prototype.customProgramCacheKey ? '' : prevKey.call(m)}|uplight`;
  return m;
}

const smooth01 = x => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
/** How much of the light a night value gives (0 from morning through the end of sunset, 1 at real night; pure). */
export const uplightNight = night => smooth01((night - UP.nightFrom) / (UP.nightTo - UP.nightFrom));

/**
 * The lit area in the stage frame (pure): { halfW, front, back, foot } from the formation (fx/show-fx.js: the frame's
 * z = 0 is the formation's centre, the front row's line; the lead stands 0.35 m before it; +z toward the audience).
 *   group: { w, depth } (the members' spread across and front to back) or null (a solo: the singer at the centre)
 */
export function stageArea(group) {
  const w = group?.w || 0, d = group?.depth || 0, front = group ? Math.min(0.35, d) : 0;
  return { halfW: w / 2 + UP.margin, front: front + UP.margin * 0.6, back: front - d - UP.margin * 0.7, foot: front + UP.gap };
}

let owner = null;   // (the show whose light this is: the Night Star and Sing & Play each keep a ShowFX)
const U = UPLIGHT;
/** A show starts: the stage frame (world origin on the ground, facing, the ground's slope in the frame) and its area. */
export function uplightStart(show, { x, y, z, facing, tilt = [0, 0], area }) {
  owner = show;
  U.uUpO.value.set(x, y, z);
  U.uUpF.value.set(Math.sin(facing), Math.cos(facing), tilt[0], tilt[1]);
  U.uUpBox.value.set(area.halfW, area.front, area.back, area.foot);
}
/**
 * Every frame of that show. k: 0..1 (the show's fade in / out and the night); wash: the section colour (THREE.Color);
 * pulse: the beat pulse 0..1.25; level: the section's energy 0.35..1. -> the footlights' and the ground pool's share
 * (0 when it is not this show's light)
 */
export function uplightUpdate(show, k, wash, pulse = 0, level = 1) {
  if (owner !== show || !UPLIGHT_ON) return 0;
  const K = U.uUpK.value;
  if (k < 0.002) { K.set(0, 0, 0, 0); return 0; }
  const beat = 1 + UP.pulse * (pulse - 0.4);
  K.set(UP.key * k * beat * STAGE_MIX.key, UP.fill * k * STAGE_MIX.fill, UP.rim * k * (0.55 + 0.45 * level) * STAGE_MIX.rim, UP.face);
  U.uUpKey.value.copy(KEY).lerp(wash, UP.keyWash);
  U.uUpFill.value.copy(FILL).lerp(wash, UP.fillWash);
  U.uUpRim.value.copy(wash);
  return k * STAGE_MIX.ground;
}
/** The show folded away: its light off. */
export function uplightStop(show) {
  if (owner !== show) return;
  U.uUpK.value.set(0, 0, 0, 0); owner = null;
}
