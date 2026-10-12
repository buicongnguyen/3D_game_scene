// NodeIO validates embedded images without browser APIs. Browser QA checks their rendered pixels.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';

export async function checkImportedModel(bytes, contract) {
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const doc = await io.readBinary(new Uint8Array(bytes)), root = doc.getRoot();
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8'));
  assert.equal(json.images.length, 1, 'one embedded atlas');
  assert.ok(json.images.every(i => Number.isInteger(i.bufferView) && !i.uri), 'self-contained image buffer');
  const images = root.listTextures().map(t => Buffer.from(t.getImage()));
  assert.equal(images.length, 1);
  for (const image of images) {
    assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'valid PNG signature');
    assert.equal(image.readUInt32BE(16), 2048, 'atlas width');
    assert.equal(image.readUInt32BE(20), 1024, 'atlas height');
  }
  const materials = root.listMaterials();
  assert.ok(materials.length <= 4, 'at most four materials');
  assert.deepEqual(materials.map(m => m.getName()).sort(), [...contract.mats].sort());
  let masked = 0, tris = 0, darkestAO = 1;
  for (const mat of materials) {
    assert.equal(mat.getAlphaMode(), mat.getBaseColorTexture() ? 'MASK' : 'OPAQUE', 'cutout, never alpha blending');
    if (mat.getBaseColorTexture()) {
      masked++;
      assert.equal(mat.getDoubleSided(), true, 'leaf cards render from either side');
    }
    assert.equal(mat.getMetallicFactor(), 0);
    assert.deepEqual(mat.getEmissiveFactor(), [0, 0, 0]);
  }
  assert.equal(masked, 1, 'one leaf card material');
  for (const node of root.listNodes()) {
    if (!node.getMesh()) continue;
    const matrix = node.getWorldMatrix();
    for (const primitive of node.getMesh().listPrimitives()) {
      const positions = primitive.getAttribute('POSITION'), colors = primitive.getAttribute('COLOR_0');
      assert.ok(colors, 'every primitive carries ray-traced AO');
      tris += (primitive.getIndices()?.getCount() ?? positions.getCount()) / 3;
      const color = [], pos = [];
      for (let i = 0; i < colors.getCount(); i++) {
        colors.getElement(i, color);
        assert.ok(color.every(v => Number.isFinite(v) && v >= 0 && v <= 1), 'finite AO color');
        darkestAO = Math.min(darkestAO, ...color.slice(0, 3));
      }
      for (let i = 0; i < positions.getCount(); i++) {
        positions.getElement(i, pos);
        assert.ok(pos.every(Number.isFinite));
        const x = matrix[0]*pos[0]+matrix[4]*pos[1]+matrix[8]*pos[2]+matrix[12];
        const y = matrix[1]*pos[0]+matrix[5]*pos[1]+matrix[9]*pos[2]+matrix[13];
        const z = matrix[2]*pos[0]+matrix[6]*pos[1]+matrix[10]*pos[2]+matrix[14];
        assert.ok(Math.hypot(x, z) <= (y <= 5 ? .345 : 3.255), `collider/crown fit at height ${y}`);
      }
      // A long triangle can extend outside the cylinder at y=5 even when every
      // vertex below that plane fits. Check its actual clipped surface edges.
      const indices = primitive.getIndices();
      const point = i => {
        positions.getElement(indices ? indices.getScalar(i) : i, pos);
        return [matrix[0]*pos[0]+matrix[4]*pos[1]+matrix[8]*pos[2]+matrix[12],
          matrix[1]*pos[0]+matrix[5]*pos[1]+matrix[9]*pos[2]+matrix[13],
          matrix[2]*pos[0]+matrix[6]*pos[1]+matrix[10]*pos[2]+matrix[14]];
      };
      for (let i = 0; i < (indices?.getCount() ?? positions.getCount()); i += 3) {
        const triangle = [point(i), point(i+1), point(i+2)];
        for (let edge = 0; edge < 3; edge++) {
          const a = triangle[edge], b = triangle[(edge+1)%3];
          if ((a[1] < 5 && b[1] > 5) || (b[1] < 5 && a[1] > 5)) {
            const t = (5-a[1])/(b[1]-a[1]);
            assert.ok(Math.hypot(a[0]+(b[0]-a[0])*t, a[2]+(b[2]-a[2])*t) <= .345, 'full lower surface fits the collider');
          }
        }
      }
    }
  }
  assert.ok(tris > 0 && tris <= contract.tris, `${tris} triangles, budget ${contract.tris}`);
  assert.ok(darkestAO < .99, 'AO is baked, not a constant white attribute');
  const bounds = getBounds(root.getDefaultScene());
  assert.ok(Math.abs(bounds.min[1]) < .002 && Math.abs(bounds.max[1] - 8) < .002, '8 m height and ground contact');
  assert.equal(root.listAnimations().length, 0, 'static decorative tree');
  return {
    tris, bounds, materials: materials.map(m => [m.getName(), m.getAlphaMode(), m.getDoubleSided()]).sort(),
    imageHashes: images.map(b => createHash('sha256').update(b).digest('hex')),
  };
}
