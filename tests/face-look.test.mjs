// © 2026 Bui Cong Nguyen · solluxlabs.com
// Faces at a distance, round 2 (actors/face-look.js): which vertices are the face, the bent face normals and their A/B
// switch, the material patch (its shader pieces, alpha to coverage following the frame) and the rows' joined meshes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { faceMask, bendNormals, faceNormals, faceNormalsOf, setFaceShade, faceShadeOn, patchFaceMaterial, setFaceA2C, FACE_LOOK, FACE_SHADE } from '../src/actors/face-look.js';
import { RowMesh, canMerge } from '../src/game/perform/row-merge.js';

test('the face: the parts a face morph moves, up to where they end, held by the head or an eye', () => {
  // 0-2 a face triangle (vertex 1 moves), 3-5 a second face part that does not move (an ear: kept, it comes before the
  // end of the moving run), 6-8 a moving triangle, 9-11 the body after it (never), and vertex 4 is held by the neck
  const index = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const moving = i => i === 1 || i === 7;
  const head = i => (i === 4 ? 0.3 : i < 9 ? 1 : 0);
  assert.deepEqual([...faceMask(12, index, moving, head)], [1, 1, 1, 1, 0, 1, 1, 1, 1, 0, 0, 0]);
  // nothing moves: no face
  assert.ok(faceMask(12, index, () => false, head).every(x => x === 0));
});

test('bent normals: the face turns toward the head-front ellipsoid, the rest keeps its own, all unit length', () => {
  const c = [0, 1.5, 0], pos = new Float32Array([0, 1.5, FACE_SHADE.axes[2], 0.06, 1.5, 0.07, 0, 1.5, -0.1]);
  // a nose side lit from the side (normal along +x) on the front; a cheek; a vertex off the mask
  const nor = new Float32Array([1, 0, 0, 0.9, 0, 0.436, 1, 0, 0]);
  const out = bendNormals(pos, nor, Uint8Array.from([1, 1, 0]), c);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(Math.hypot(out[i * 3], out[i * 3 + 1], out[i * 3 + 2]) - 1) < 1e-6);
  assert.ok(out[2] > 0.6 && out[0] < 0.4, `the front faces forward (${[...out.slice(0, 3)].map(x => x.toFixed(2))})`);
  assert.ok(out[5] > nor[5], 'the cheek turns toward the front');
  assert.deepEqual([...out.slice(6)], [1, 0, 0], 'off the face: as authored');
});

/** A small skinned "person": a head bone with two eye bones, a face quad with a blink morph, a body quad below. */
function person(x = 0) {
  const root = new THREE.Bone(); root.name = 'hips';
  const head = new THREE.Bone(); head.name = 'head'; head.position.y = 1.5; root.add(head);
  const eL = new THREE.Bone(); eL.name = 'eye_L'; eL.position.set(0.03, 0.06, 0.03); head.add(eL);
  const eR = new THREE.Bone(); eR.name = 'eye_R'; eR.position.set(-0.03, 0.06, 0.03); head.add(eR);
  const g = new THREE.BufferGeometry();
  const P = [-0.05, 1.5, 0.1, 0.05, 1.5, 0.1, 0.05, 1.62, 0.1, -0.05, 1.62, 0.1, -0.2, 0.9, 0.05, 0.2, 0.9, 0.05, 0.2, 1.3, 0.05, -0.2, 1.3, 0.05];
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(16).fill(0.5), 2));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
  g.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
  const blink = new Float32Array(24); blink[2 * 3 + 1] = -0.004; blink[3 * 3 + 1] = -0.004;
  g.morphAttributes.position = [new THREE.BufferAttribute(blink, 3)]; g.morphTargetsRelative = true;
  const m = new THREE.SkinnedMesh(g, new THREE.MeshStandardMaterial({ name: 'VRoid atlas', map: new THREE.Texture(), alphaTest: 0.5, side: THREE.DoubleSide }));
  m.morphTargetDictionary = { blink: 0 }; m.morphTargetInfluences = [0];
  const top = new THREE.Group(); top.position.x = x; top.add(root); top.add(m); top.updateMatrixWorld(true);
  m.bind(new THREE.Skeleton([root, head, eL, eR]), m.matrixWorld);
  return { top, m };
}

test('faceNormals on a loaded model: a face mask attribute, bent normals, and the switch back to the authored ones', () => {
  const { m } = person(), g = m.geometry, before = Float32Array.from(g.attributes.normal.array);
  assert.equal(faceNormals(m, { min: 1 }), 4, 'the face quad only (the body is held by the hips)');
  assert.deepEqual([...g.attributes.aFace.array], [255, 255, 255, 255, 0, 0, 0, 0]);
  assert.ok(faceShadeOn());
  const bent = Float32Array.from(g.attributes.normal.array);
  assert.ok(bent[2] > 0.6, 'the face now faces forward'); assert.deepEqual([...bent.slice(12)], [...before.slice(12)], 'the body as it was');
  setFaceShade(false); assert.deepEqual([...g.attributes.normal.array], [...before]);
  setFaceShade(true); assert.deepEqual([...g.attributes.normal.array], [...bent]);
  assert.equal(faceNormals(m, { min: 1 }), 0, 'once a geometry (clones share it)');
  assert.ok(faceNormalsOf(g) && !JSON.stringify(g.userData).includes('orig'), 'kept out of userData (clones copy that as JSON)');
});

test('the material patch: one hook, the face rule only under alpha to coverage, which follows the frame', () => {
  const { m } = person(), mat = patchFaceMaterial(m.material);
  assert.equal(patchFaceMaterial(mat), mat); assert.match(mat.customProgramCacheKey(), /face-look/);
  const sh = { uniforms: {}, vertexShader: '#include <common>\nvoid main() {\n#include <begin_vertex>\n}', fragmentShader: '#include <common>\n#include <map_fragment>\n#include <alphatest_fragment>' };
  mat.onBeforeCompile(sh, null);
  assert.match(sh.vertexShader, /attribute float aFace;[\s\S]*vFace = aFace;/);
  assert.match(sh.fragmentShader, /defined\( ALPHA_TO_COVERAGE \)[\s\S]*textureGrad/);
  assert.match(sh.fragmentShader, /#else\n\tif \( diffuseColor\.a < alphaTest \) discard;/, 'no multisampling: the plain cut-off');
  assert.equal(sh.uniforms.uFacePow, FACE_LOOK.uFacePow, 'shared uniforms');
  setFaceA2C(true); assert.equal(mat.alphaToCoverage, true);
  setFaceA2C(false); assert.equal(mat.alphaToCoverage, false);
});

test("a row's joined mesh keeps the face mask, both normal sets and the members' face hook", () => {
  const parent = new THREE.Group();
  const ps = [person(-1), person(1)];
  for (const p of ps) { parent.add(p.top); faceNormals(p.m, { min: 1 }); patchFaceMaterial(p.m.material); }
  ps[1].m.material = ps[0].m.material;   // (one model's clones share their material)
  parent.updateMatrixWorld(true);
  for (const p of ps) p.m.bind(p.m.skeleton, p.m.matrixWorld);
  assert.ok(canMerge(ps.map(p => p.m)));
  const row = new RowMesh(ps.map(p => p.m), parent, { atlas: false }), G = row.mesh.geometry;
  assert.deepEqual([...G.attributes.aFace.array], [255, 255, 255, 255, 0, 0, 0, 0, 255, 255, 255, 255, 0, 0, 0, 0]);
  const fn = faceNormalsOf(G); assert.ok(fn, 'the joined normals switch with the rest');
  setFaceShade(false); assert.deepEqual([...G.attributes.normal.array], [...fn.orig]);
  setFaceShade(true); assert.deepEqual([...G.attributes.normal.array], [...fn.bent]);
  const sh = { uniforms: {}, vertexShader: '#include <common>\nvoid main() {\n#include <begin_vertex>\n#include <morphtarget_vertex>\n}', fragmentShader: '#include <common>\n#include <map_fragment>\n#include <alphatest_fragment>' };
  row.mesh.material.onBeforeCompile(sh, null);
  assert.match(sh.vertexShader, /aFace[\s\S]*uRowMorph/, 'the face hook, then the row hook');
  assert.match(row.mesh.material.customProgramCacheKey(), /troupe-row-\d+\|face-look/);
  setFaceA2C(true); assert.equal(row.mesh.material.alphaToCoverage, true, 'the row copy follows the frame too'); setFaceA2C(false);
  const rm = row.mesh.material; row.dispose(); assert.equal(faceNormalsOf(G), undefined);
  setFaceA2C(true); assert.equal(rm.alphaToCoverage, false, 'a disposed row material is let go'); setFaceA2C(false);
});
