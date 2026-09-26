// Re-encode built GLBs with meshopt compression + quantization (runtime decodes with MeshoptDecoder).
//   node scripts/pack-models.mjs <dir>   (default: dist/models)
// Node names, empties, materials, skins and animations are preserved; only unused duplicate data is dropped.
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { NodeIO, PropertyType, Logger } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt, resample, dedup } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';

const dir = process.argv[2] || 'dist/models';
await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
io.setLogger(new Logger(Logger.Verbosity.WARN));

const files = readdirSync(dir).filter(f => f.endsWith('.glb'));
let before = 0, after = 0;
const t0 = Date.now();
for (const f of files) {
  const p = path.join(dir, f);
  const b0 = statSync(p).size;
  const doc = await io.read(p);
  // resample: drop redundant keyframes (clips key every bone every frame); dedup: shared accessors/materials
  await doc.transform(resample({ tolerance: 1e-4 }), dedup({ propertyTypes: [PropertyType.ACCESSOR, PropertyType.MESH, PropertyType.TEXTURE] }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(p, doc);
  const b1 = statSync(p).size;
  before += b0; after += b1;
}
console.log(`packed ${files.length} models: ${(before / 1e6).toFixed(2)} MB -> ${(after / 1e6).toFixed(2)} MB in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
