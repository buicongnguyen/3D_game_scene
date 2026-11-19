// Mika's see-through shape (actors/silhouette.js): twins that share her geometry and skeleton, drawn in the right order.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Silhouette, SIL_ORDER, BODY_ORDER, AFTER_ORDER } from '../src/actors/silhouette.js';

function fakeMika() {
  const model = new THREE.Group();
  const bone = new THREE.Bone(); model.add(bone);
  const body = new THREE.SkinnedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  body.bind(new THREE.Skeleton([bone]));
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  buckle.position.set(0, 1, 0.2);
  model.add(body, buckle);
  return { model, body, buckle };
}

test('each body mesh gets a twin with the same geometry and skeleton, drawn just before her and casting no shadow', () => {
  const { model, body, buckle } = fakeMika();
  const sil = new Silhouette(model);
  assert.equal(sil.pairs.length, 2);
  const [[, bodyTwin], [, buckleTwin]] = sil.pairs;
  assert.equal(bodyTwin.geometry, body.geometry);
  assert.equal(bodyTwin.skeleton, body.skeleton);
  assert.ok(bodyTwin.isSkinnedMesh && !buckleTwin.isSkinnedMesh);
  assert.deepEqual(buckleTwin.position.toArray(), buckle.position.toArray());
  assert.equal(bodyTwin.parent, body.parent);
  assert.ok(SIL_ORDER < BODY_ORDER && BODY_ORDER < AFTER_ORDER);
  assert.equal(bodyTwin.renderOrder, SIL_ORDER);
  assert.equal(body.renderOrder, BODY_ORDER);
  assert.equal(bodyTwin.castShadow, false);
  assert.equal(bodyTwin.material.depthFunc, THREE.GreaterDepth);
  assert.equal(bodyTwin.material.depthWrite, false);
  assert.equal(bodyTwin.material.transparent, false, 'opaque: it must draw before her, not in the sorted transparent pass');
});

test('the twins hide in cutscenes and with their own mesh', () => {
  const { model, buckle } = fakeMika();
  const sil = new Silhouette(model);
  sil.show(true);
  assert.ok(sil.pairs.every(([, t]) => t.visible));
  buckle.visible = false;
  sil.show(true);
  assert.equal(sil.pairs[1][1].visible, false);
  assert.equal(sil.pairs[0][1].visible, true);
  sil.show(false);
  assert.ok(sil.pairs.every(([, t]) => !t.visible));
});
