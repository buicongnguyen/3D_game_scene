// © 2026 Bui Cong Nguyen · solluxlabs.com
import * as THREE from 'three';

// Faces that read from a distance and from any light (the VRoid people: one skinned mesh, one atlas, one alpha-tested
// material; art/blender/vroid_mixamo.py). Two parts, both free at draw time (no draws, no materials, no textures):
//
// 1. Thin strokes that survive minification (patchFaceMaterial). The eyes' lines, lashes, brows and irises are thin dark
//    strokes on alpha-tested shells over the face. Far away the atlas is read from a small mip where a stroke thinner than
//    the pixel averages to an alpha under the 0.5 cut-off: the shell is discarded, the skin under it shows and the face
//    goes blank, while a supersampled picture of the same frame still shows the dark marks (the pixel is partly covered).
//    On a multisampled frame (PC: Medium, High) the face's own fragments use alpha to coverage: near (mip level under
//    `from`), the edge sharpened at the cut-off (fwidth: crisp close-ups); far, the cut-off is done on four reads a level
//    finer spread over the pixel, and the part of them that passes (^ `pow`: a thin stroke counts a little more, as a
//    supersampled picture shrunk for the eye shows it) becomes the pixel's coverage, in the stroke's own colour. The hair
//    and clothes keep the plain cut-off (partial coverage let the skin show through the fringe). Without multisampling
//    (Low) nothing changes: every all-or-nothing rule measured (a lower far cut-off, the four-read majority, a mip bias,
//    a screen dither) drew too-dark bars or broken dashes and flickered more than the plain cut-off.
// 2. Anime face shading (faceNormals). The face's normals are bent toward an ellipsoid set in the head (flat in front),
//    `k` of the way: a side sun lights the face as one soft surface instead of splitting it down the nose; the hair and
//    the body keep their own normals. Computed once a model at load (engine/assets.js prepare), shared by every clone
//    and copied by the rows' joined meshes (game/perform/row-merge.js).
// Measured against supersampled frames: face-speech-motion references/faces-at-distance.md (2026-11-28, round 2).
// Switches: ?faceFeatures=off, ?faceShade=off (A/B); FACE_LOOK.uFaceOn and setFaceShade() at run time (the probes).

/** Uniforms shared by every patched material (and the rows' copies of it). */
export const FACE_LOOK = {
  uFaceFrom: { value: 0.5 },   // mip level where the far rule starts
  uFaceSpan: { value: 2 },     // levels over which it reaches its full effect
  uFacePow: { value: 0.7 },    // far coverage = the part of the pixel the strokes cover ^ pow
  uFaceAniso: { value: 1 },    // the atlas' anisotropy (so the level is the one an anisotropic read picks; game.js)
  uFaceOn: { value: 1 },       // 0: the plain cut-off (measuring)
};
/** The shading bend: share of the ellipsoid's normal, ellipsoid half-axes (m: across, up, depth), centre behind the eyes. */
export const FACE_SHADE = Object.freeze({ k: 0.8, axes: [0.15, 0.18, 0.086], back: 0.01, down: 0.01 });

const q = typeof location !== 'undefined' ? location.search || '' : '';
export const FACE_FEATURES_ON = !/[?&]faceFeatures=off\b/.test(q);
export const FACE_SHADE_ON = !/[?&]faceShade=off\b/.test(q);

const MAP_FRAG = /* glsl */`
#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	#if defined( USE_ALPHATEST ) && defined( ALPHA_TO_COVERAGE )
	// the mip level the read used (the footprint's minor axis, as an anisotropic filter picks it): how far the face is
	vec2 fGx = dFdx( vMapUv ), fGy = dFdy( vMapUv ), fTx = vec2( textureSize( map, 0 ) ), fDx = fGx * fTx, fDy = fGy * fTx;
	float fMaj = max( dot( fDx, fDx ), dot( fDy, fDy ) ), fMin = min( dot( fDx, fDx ), dot( fDy, fDy ) );
	float faceLod = 0.5 * log2( max( max( fMaj / ( uFaceAniso * uFaceAniso ), fMin ), 1e-8 ) );
	float faceFar = uFaceOn * step( 0.5, vFace ) * clamp( ( faceLod - uFaceFrom ) / uFaceSpan, 0.0, 1.0 );
	if ( faceFar > 0.0 ) {
		// the cut-off on four reads a level finer across the pixel: the part of it the strokes cover, in their own colour
		// (not the stroke averaged with the clear texels around it)
		vec4 fAcc = vec4( 0.0 );
		for ( int i = 0; i < 4; i ++ ) {
			vec2 o = vec2( float( i & 1 ) - 0.5, float( i >> 1 ) - 0.5 ) * 0.5;
			vec4 t = textureGrad( map, vMapUv + o.x * fGx + o.y * fGy, fGx * 0.5, fGy * 0.5 );
			float p = step( alphaTest, t.a );
			fAcc += vec4( t.rgb * p, p );
		}
		if ( fAcc.a > 0.0 ) sampledDiffuseColor.rgb = mix( sampledDiffuseColor.rgb, fAcc.rgb / fAcc.a, faceFar );
		sampledDiffuseColor.a = mix( sampledDiffuseColor.a, fAcc.a * 0.25, faceFar );
	}
	#endif
	diffuseColor *= sampledDiffuseColor;
#endif
`;
const ALPHA_FRAG = /* glsl */`
#ifdef USE_ALPHATEST
	#if defined( ALPHA_TO_COVERAGE ) && defined( USE_MAP )
	{
		// the face: near, a sharpened edge at the cut-off; far, the covered part of the pixel as its coverage. The rest (hair,
		// clothes): the plain cut-off, all or nothing
		float fA = clamp( diffuseColor.a, 0.0, 1.0 );
		float fSharp = clamp( ( fA - alphaTest ) / max( fwidth( fA ), 1e-4 ) + 0.5, 0.0, 1.0 );
		diffuseColor.a = vFace > 0.5 && uFaceOn > 0.5 ? mix( fSharp, pow( fA, uFacePow ), faceFar ) : step( alphaTest, fA );
		if ( diffuseColor.a < 0.02 ) discard;
	}
	#else
	if ( diffuseColor.a < alphaTest ) discard;
	#endif
#endif
`;

const MATS = new Set();      // the patched materials (and the rows' copies): alpha to coverage follows the frame
let a2c = false;
/** The frame is multisampled (true) or not: the patched materials use alpha to coverage only then (engine/renderer.js
 *  buildComposer, through game.js: a tier or governor step that changes the samples switches them). */
export function setFaceA2C(on) {
  a2c = !!on && FACE_FEATURES_ON;
  for (const m of MATS) if (m.alphaToCoverage !== a2c) { m.alphaToCoverage = a2c; m.needsUpdate = true; }
}
/** A copy of a patched material (a row's) that should follow setFaceA2C too. */
export function trackFaceMaterial(m) { if (m?.userData.faceLook) { MATS.add(m); m.alphaToCoverage = a2c; } return m; }
/** A tracked copy disposed (a row's material at the show's end). */
export const untrackFaceMaterial = m => MATS.delete(m);

/** Patch a VRoid atlas material in place (once). Chains an existing onBeforeCompile. */
export function patchFaceMaterial(m) {
  if (!m || m.userData.faceLook || !FACE_FEATURES_ON) return m;
  m.userData.faceLook = true;
  MATS.add(m); m.alphaToCoverage = a2c;
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    faceShader(sh);
  };
  m.customProgramCacheKey = () => `${prevKey === THREE.Material.prototype.customProgramCacheKey ? '' : prevKey.call(m)}|face-look`;
  return m;
}
/** The fragment changes on a compiled shader (also used by the rows' material, which builds its own hook). */
export function faceShader(sh) {
  Object.assign(sh.uniforms, FACE_LOOK);
  // (the face's own vertices: aFace = 1, from faceNormals; the hair and the body keep the plain alpha test)
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float aFace;\nvarying float vFace;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvFace = aFace;');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', `#include <common>\nvarying float vFace;\nuniform float uFaceFrom, uFaceSpan, uFacePow, uFaceAniso, uFaceOn;`)
    .replace('#include <map_fragment>', MAP_FRAG)
    .replace('#include <alphatest_fragment>', ALPHA_FRAG);
}

// ------------------------------------------------------------------------------------------------- face normals
const NORMALS = new Map();   // geometry -> { orig, bent } (for setFaceShade; kept out of userData: clones copy that as JSON)
let shadeOn = FACE_SHADE_ON;

/** Is face shading on (the bent normals in use)? */
export const faceShadeOn = () => shadeOn;

/** A geometry's two normal sets ({ orig, bent }) or undefined. */
export const faceNormalsOf = g => NORMALS.get(g);
/** Forget a geometry (disposed: a row's joined mesh). */
export const forgetNormals = g => NORMALS.delete(g);

/** Swap every registered geometry's normals (true: bent, false: as authored). */
export function setFaceShade(on) {
  shadeOn = !!on;
  for (const [g, fn] of NORMALS) {
    const a = g.attributes.normal;
    if (!fn || !a) continue;
    a.array.set(shadeOn ? fn.bent : fn.orig); a.needsUpdate = true;
  }
}
/** Keep a geometry's two normal sets (orig, bent: Float32Arrays of the normal attribute's size) for setFaceShade. */
export function registerNormals(g, orig, bent) {
  NORMALS.set(g, { orig, bent });
  g.attributes.normal.array.set(shadeOn ? bent : orig);
}

/**
 * Which vertices are the face (pure): the parts of the mesh joined to a vertex that a face morph moves or an eye bone
 * carries, extended to the run of vertices they end (the VRoid build writes the face first), and only where the head
 * or an eye bone holds the vertex. -> Uint8Array (1 = face)
 *   index: triangle indices; moving(i), headWeight(i): per vertex
 */
export function faceMask(n, index, moving, headWeight) {
  const parent = new Int32Array(n); for (let i = 0; i < n; i++) parent[i] = i;
  const find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  for (let t = 0; t < index.length; t += 3) {
    const a = find(index[t]), b = find(index[t + 1]), c = find(index[t + 2]);
    if (a !== b) parent[b] = a;
    const a2 = find(a); if (a2 !== c) parent[c] = a2;
  }
  const seed = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (moving(i)) seed[find(i)] = 1;
  let end = -1;
  for (let i = 0; i < n; i++) if (seed[find(i)]) end = i;
  const out = new Uint8Array(n);
  for (let i = 0; i <= end; i++) if (headWeight(i) >= 0.95) out[i] = 1;
  return out;
}

/**
 * Bent normals for the face (pure): normal' = normalize(mix(normal, ellipsoid normal at p, k)), the ellipsoid in the
 * head (centre c, half-axes ax, facing +Z). -> Float32Array (a copy; vertices off the mask keep theirs)
 */
export function bendNormals(pos, nor, mask, c, ax = FACE_SHADE.axes, k = FACE_SHADE.k) {
  const out = Float32Array.from(nor);
  const [a2, b2, c2] = ax.map(x => x * x);
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    let ex = (pos[i * 3] - c[0]) / a2, ey = (pos[i * 3 + 1] - c[1]) / b2, ez = (pos[i * 3 + 2] - c[2]) / c2;
    const el = Math.hypot(ex, ey, ez) || 1; ex /= el; ey /= el; ez /= el;
    let x = nor[i * 3] * (1 - k) + ex * k, y = nor[i * 3 + 1] * (1 - k) + ey * k, z = nor[i * 3 + 2] * (1 - k) + ez * k;
    const l = Math.hypot(x, y, z) || 1;
    out[i * 3] = x / l; out[i * 3 + 1] = y / l; out[i * 3 + 2] = z / l;
  }
  return out;
}

const _m = new THREE.Matrix4(), _v = new THREE.Vector3();
/** A freshly loaded VRoid mesh: its face normals bent and its face mask set (once a geometry; clones share it). min: the
 *  fewest face vertices that count as a face. -> number of face vertices (0: left as it was) */
export function faceNormals(mesh, { min = 50 } = {}) {
  const g = mesh.geometry;
  if (!g || NORMALS.has(g) || !g.index || !g.attributes.normal || !mesh.isSkinnedMesh) return 0;
  const sk = mesh.skeleton, bones = sk.bones, ix = name => bones.findIndex(b => b.name === name);
  const eyes = ['eye_L', 'eye_R'].map(ix), head = ix('head');
  if (eyes.some(i => i < 0) || head < 0) return 0;
  // the eyes in the geometry's space: inverse(boneInverse) is the bone's bind matrix; the mesh's bind matrix undone
  const inv = new THREE.Matrix4().copy(mesh.bindMatrix).invert();
  const eyeAt = eyes.map(i => _v.setFromMatrixPosition(_m.copy(sk.boneInverses[i]).invert()).applyMatrix4(inv).toArray());
  // (the files are interleaved: positions copied out, normals moved to an attribute of their own, which the switch rewrites)
  const Pa = g.attributes.position, n = Pa.count, P = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { P[i * 3] = Pa.getX(i); P[i * 3 + 1] = Pa.getY(i); P[i * 3 + 2] = Pa.getZ(i); }
  const si = g.attributes.skinIndex, sw = g.attributes.skinWeight, own = new Set([head, ...eyes]);
  const morphs = g.morphAttributes.position || [], rel = g.morphTargetsRelative;
  const moving = i => morphs.some(M => {
    const dx = M.getX(i) - (rel ? 0 : P[i * 3]), dy = M.getY(i) - (rel ? 0 : P[i * 3 + 1]), dz = M.getZ(i) - (rel ? 0 : P[i * 3 + 2]);
    return dx * dx + dy * dy + dz * dz > 1e-10;
  }) || eyes.includes(si.getX(i)) && sw.getX(i) > 0.5;
  const headWeight = i => { let w = 0; for (let j = 0; j < 4; j++) if (own.has(si.getComponent(i, j))) w += sw.getComponent(i, j); return w; };
  const mask = faceMask(n, g.index.array, moving, headWeight);
  let count = 0; for (let i = 0; i < n; i++) count += mask[i];
  if (count < min) return 0;   // (a model without a face rig: nothing to bend)
  const c = [(eyeAt[0][0] + eyeAt[1][0]) / 2, (eyeAt[0][1] + eyeAt[1][1]) / 2 - FACE_SHADE.down, (eyeAt[0][2] + eyeAt[1][2]) / 2 - FACE_SHADE.back];
  const Na = g.attributes.normal, orig = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { orig[i * 3] = Na.getX(i); orig[i * 3 + 1] = Na.getY(i); orig[i * 3 + 2] = Na.getZ(i); }
  g.setAttribute('normal', new THREE.BufferAttribute(orig.slice(), 3));
  registerNormals(g, orig, bendNormals(P, orig, mask, c));
  // the face mask for the material (its far rule: patchFaceMaterial), 1 byte a vertex
  g.setAttribute('aFace', new THREE.BufferAttribute(Uint8Array.from(mask, x => x * 255), 1, true));
  g.userData.faceMaskCount = count;
  return count;
}
