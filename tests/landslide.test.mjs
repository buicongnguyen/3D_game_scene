// The landslide scar model is the visible ground over its footprint (src/world/landslide.js): the terrain is sunk
// out of sight under its raw earth, covers its outer rim, and heightAt() follows the model's own surface.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HeightGrid } from '../src/world/heightfield.js';
import { SLIDE, slideLocalHeight, slideSurfaceAt, isEarth } from '../src/world/landslide.js';
import { FALLEN_STARS } from '../src/world/layout.js';

const S = SLIDE;
// a patch of the world grid around the slide (same vertex positions as the full TERRAIN grid)
const gridFor = step => new HeightGrid(step, { minX: -320 + step * Math.floor(210 / step), maxX: 10, minZ: -330 + step * Math.floor(100 / step), maxZ: -120 });

for (const step of [2, 3]) {
  test(`landslide on a ${step} m grid: the sunk terrain never shows through the raw earth and covers the model's rim`, () => {
    const g = gridFor(step);
    let worst = -Infinity;
    for (let lx = S.x0; lx <= S.x1 + 1e-9; lx += 0.2) for (let ly = S.y0; ly <= S.y1 + 1e-9; ly += 0.2) {
      if (!isEarth(lx, ly)) continue;
      const x = S.x + lx, z = S.z - ly;
      worst = Math.max(worst, g.meshHeightAt(x, z) - slideSurfaceAt(x, z));
    }
    assert.ok(worst < -0.02, `terrain pokes through the scar (by ${worst.toFixed(3)} m)`);
    const rim = [];
    for (let l = S.y0; l <= S.y1 + 1e-9; l += 0.1) rim.push([S.x0, l], [S.x1, l]);
    for (let l = S.x0; l <= S.x1 + 1e-9; l += 0.1) rim.push([l, S.y0], [l, S.y1]);
    for (const [lx, ly] of rim) {
      const x = S.x + lx, z = S.z - ly;
      assert.ok(g.meshHeightAt(x, z) >= slideSurfaceAt(x, z) - 1e-4, `model rim exposed at ${lx.toFixed(1)}, ${ly.toFixed(1)}`);
    }
  });
}

test('heightAt follows the scar model where it covers the terrain, and the terrain everywhere else', () => {
  const g = gridFor(2);
  for (const [lx, ly] of [[0, 6], [-3, 4], [2, 8.8], [0, -2], [5, 0]]) {
    const x = S.x + lx, z = S.z - ly;
    assert.ok(Math.abs(g.heightAt(x, z) - slideSurfaceAt(x, z)) < 1e-9, `feet on the model at ${lx}, ${ly}`);
  }
  for (const [x, z] of [[-70, -168], [-50, -150], [-30, -190]]) assert.equal(g.heightAt(x, z), g.meshHeightAt(x, z));
  // the headscarp is a wall, not a ramp
  assert.ok(g.slopeAt(S.x, S.z - (S.head + 0.35)) > 55, 'the headscarp is too steep to walk up');
  const star = FALLEN_STARS.find(s => s.id === 'fs6');
  assert.ok(!isEarth(star.x - S.x, S.z - star.z), 'the landslide star sits on the crest turf, not in the scar');
});

test('landslide.js mirrors the ground mesh of public/models/landslide.glb exactly', async () => {
  const buf = readFileSync(new URL('../public/models/landslide.glb', import.meta.url));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const gltf = await new Promise((res, rej) => new GLTFLoader().parse(ab, '', res, rej));
  const DX = (S.x1 - S.x0) / 44;
  let n = 0, worst = 0;
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse(o => {
    if (!o.isMesh || o.material.name !== 'Turf') return;   // the ground mesh's turf: every vertex is on its lattice
    const p = o.geometry.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k), y = -p.getZ(k), z = p.getY(k);
      const col = (x - S.x0) / DX;
      if (Math.abs(col - Math.round(col)) > 1e-3) continue;
      n++;
      worst = Math.max(worst, Math.abs(slideLocalHeight(x, y) - z));
    }
  });
  assert.ok(n > 500, `found the ground lattice (${n} vertices)`);
  assert.ok(worst < 2e-3, `JS mirror is off the model by ${worst.toFixed(4)} m: rebuild or resync src/world/landslide.js`);
});
