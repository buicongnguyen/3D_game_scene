// Derive distant tropical tree meshes from the documented, already imported models.
// node art/build-tropical-lods.mjs [output-dir]  (default: public/models)
import assert from 'node:assert/strict';
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { compactPrimitive, getBounds, prune, transformMesh } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(process.argv[2] || path.join(root, 'public/models'));
mkdirSync(output, { recursive: true });
await Promise.all([MeshoptDecoder.ready, MeshoptSimplifier.ready]);
MeshoptSimplifier.useExperimentalFeatures = true;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const settings = {
  bamboo: { ratio: .12, error: .05, budget: 700 },
  coconut: { ratio: .12, error: .03, budget: 150 },
  mango: { ratio: .2, error: .06, budget: 130 },
};
const summary = [];

// Flat-normal and unused UV seams otherwise pin the small opaque shaft rings.
// Weld only coincident positions, average their baked AO, then recalculate normals.
function weldOpaque(doc, primitive) {
  const pos = primitive.getAttribute('POSITION'), color = primitive.getAttribute('COLOR_0');
  const positions = [], colors = [], counts = [], map = new Map(), remap = [];
  const v = [], c = [];
  for (let i = 0; i < pos.getCount(); i++) {
    pos.getElement(i, v); color.getElement(i, c);
    const key = v.map(n => Math.round(n * 1e6)).join(',');
    let j = map.get(key);
    if (j === undefined) {
      j = positions.length / 3; map.set(key, j); positions.push(...v);
      colors.push(...c); counts.push(1);
    } else { counts[j]++; for (let k = 0; k < c.length; k++) colors[j * c.length + k] += c[k]; }
    remap[i] = j;
  }
  for (let j = 0; j < counts.length; j++) for (let k = 0; k < color.getElementSize(); k++) colors[j * color.getElementSize() + k] /= counts[j];
  const indices = primitive.getIndices().getArray();
  primitive.setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(positions)));
  primitive.setAttribute('COLOR_0', doc.createAccessor().setType(color.getType()).setArray(new Float32Array(colors)));
  primitive.setAttribute('NORMAL', null).setAttribute('TEXCOORD_0', null);
  primitive.setIndices(doc.createAccessor().setType('SCALAR').setArray(Uint32Array.from(indices, i => remap[i])));
}

function simplify(doc, primitive, config, bounds) {
  if (primitive.getMaterial().getAlphaMode() === 'MASK') return;
  // Cutout cards contain the silhouette; keep their atlas UVs and faces exact.
  weldOpaque(doc, primitive);
  const position = primitive.getAttribute('POSITION'), color = primitive.getAttribute('COLOR_0');
  const n = position.getCount();
  const locks = new Uint8Array(n), attributes = new Float32Array(n * 3);
  const v = [], c = [];
  for (let i = 0; i < n; i++) {
    position.getElement(i, v); color.getElement(i, c);
    // Keep base/top and the overall footprint, plus the authored lower-cylinder boundary.
    if (v.some((x, axis) => Math.abs(x - bounds.min[axis]) < 1e-5 || Math.abs(x - bounds.max[axis]) < 1e-5)
      || Math.abs(v[1] - 5) < 1e-5) locks[i] = 1;
    attributes.set(c.slice(0, 3), i * 3);
  }
  const input = Uint32Array.from(primitive.getIndices().getArray());
  const [simplified] = MeshoptSimplifier.simplifyWithAttributes(input, position.getArray(), 3,
    attributes, 3, [.02, .02, .02], locks,
    Math.max(3, Math.floor(input.length * config.ratio / 3) * 3), config.error);
  // Disconnected shell tips can still disappear when their incident faces collapse.
  // Retain one original incident face for any missing protected outline vertex.
  const positions = position.getArray(), trunk = /VN bamboo (dry|culm)|VN mango bark/.test(primitive.getMaterial().getName());
  const kept = [];
  for (let i = 0; i < simplified.length; i += 3) {
    const triangle = simplified.slice(i, i + 3);
    if (!trunk || triangle.every(j => positions[j * 3 + 1] > 5)) kept.push(...triangle);
  }
  // Keep the original shaft surface through the lower-cylinder boundary. A very
  // thin imported trunk can collapse to a dangling line even with endpoint locks.
  if (trunk) for (let i = 0; i < input.length; i += 3) {
    const triangle = input.slice(i, i + 3);
    if (triangle.some(j => positions[j * 3 + 1] <= 5)) kept.push(...triangle);
  }
  const used = new Set(kept);
  for (let i = 0; i < n; i++) if (locks[i] && !used.has(i)) {
    const at = input.indexOf(i); if (at < 0) continue;
    const start = at - at % 3;
    for (const j of input.slice(start, start + 3)) { kept.push(j); used.add(j); }
  }
  const unique = [], faces = new Set();
  for (let i = 0; i < kept.length; i += 3) {
    const triangle = kept.slice(i, i + 3);
    const key = triangle.map(j => [...positions.slice(j * 3, j * 3 + 3)].map(v => Math.round(v * 1e6)).join(',')).sort().join('|');
    if (!faces.has(key)) { faces.add(key); unique.push(...triangle); }
  }
  const indices = Uint32Array.from(unique);
  primitive.setIndices(doc.createAccessor().setType('SCALAR').setArray(indices));
  {
    const normals = new Float32Array(n * 3), p = position.getArray();
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
      const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
      const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const k of [a, b, c]) { normals[k] += nx; normals[k + 1] += ny; normals[k + 2] += nz; }
    }
    for (let i = 0; i < n; i++) { const k = i * 3, l = Math.hypot(normals[k], normals[k + 1], normals[k + 2]) || 1; for (let j = 0; j < 3; j++) normals[k + j] /= l; }
    primitive.setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(normals));
  }
}

for (const [species, config] of Object.entries(settings)) {
  const name = `tree-vn-${species}-lod`, doc = await io.read(path.join(root, 'public/models', `tree-vn-${species}.glb`));
  const scene = doc.getRoot().getDefaultScene(), before = getBounds(scene);
  // Bake any source node transform first. Work in Y-up metres
  // so the base, crown and 5 m lower-cylinder constraints use actual world heights.
  for (const node of doc.getRoot().listNodes()) if (node.getMesh()) transformMesh(node.getMesh(), node.getWorldMatrix());
  for (const node of doc.getRoot().listNodes()) node.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]);
  for (const node of doc.getRoot().listNodes()) if (node.getMesh()) node.setName(name);
  for (const mesh of doc.getRoot().listMeshes()) {
    mesh.setName(name);
    for (const primitive of mesh.listPrimitives()) { simplify(doc, primitive, config, before); compactPrimitive(primitive); }
  }
  await doc.transform(prune());
  const bounds = getBounds(scene), tris = doc.getRoot().listMeshes().flatMap(m => m.listPrimitives()).reduce((s, p) => s + p.getIndices().getCount() / 3, 0);
  console.log(name, doc.getRoot().listMeshes().flatMap(m => m.listPrimitives()).map(p => [p.getMaterial().getName(), p.getIndices().getCount()/3]));
  assert.ok(tris <= config.budget, `${name}: ${tris} exceeds ${config.budget}`);
  assert.ok(Math.abs(bounds.min[1]) < .002 && Math.abs(bounds.max[1] - 8) < .002, `${name}: grounded 8 m silhouette`);
  const file = path.join(output, `${name}.glb`); await io.write(file, doc);
  summary.push({ name, tris, bounds, bytes: statSync(file).size, materials: doc.getRoot().listMaterials().map(m => m.getName()) });
}
const evidence = path.join(root, '.tools/tropical-lods'); mkdirSync(evidence, { recursive: true });
writeFileSync(path.join(evidence, 'models.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
