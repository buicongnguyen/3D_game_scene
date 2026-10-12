// Extract the three documented Xom Nong Trai assets; the source repository is read-only.
// node art/import-vietnam-trees.mjs <source-repo> <blender.exe>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize, prune, getBounds } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';
import { readFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [source, blender] = process.argv.slice(2);
if (!source || !blender) throw Error('Usage: node art/import-vietnam-trees.mjs <source-repo> <blender.exe>');
const manifest = JSON.parse(readFileSync(path.join(root, 'art/sources/vietnam-trees.json'), 'utf8'));
for (const file of manifest.files) {
  const bytes = readFileSync(path.join(source, file.path));
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (hash !== file.sha256) throw Error(`Source hash mismatch: ${file.path}`);
}
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const staging = path.join(root, '.tools/vietnam/staging');
mkdirSync(staging, { recursive: true });
for (const asset of manifest.models) {
  const doc = await io.read(path.join(source, asset.source)), r = doc.getRoot();
  const target = r.listNodes().find(n => n.getName() === asset.node);
  if (!target) throw Error(`Missing source node ${asset.node}`);
  for (const scene of r.listScenes()) for (const n of scene.listChildren()) if (n !== target) scene.removeChild(n);
  await doc.transform(prune(), dequantize());
  for (const ext of r.listExtensionsUsed()) if (ext.extensionName === 'EXT_meshopt_compression') ext.dispose();
  for (const mat of r.listMaterials()) {
    if (!asset.materials[mat.getName()]) throw Error(`Unexpected material ${mat.getName()}`);
    mat.setName(asset.materials[mat.getName()]);
  }
  const bounds = getBounds(target), scale = 8 / (bounds.max[1] - bounds.min[1]);
  const scene = r.getDefaultScene();
  scene.removeChild(target);
  const parent = doc.createNode('Root').setScale([scale, scale, scale]).setTranslation([0, -bounds.min[1] * scale, 0]);
  target.setName(asset.name); parent.addChild(target); scene.addChild(parent);
  await io.write(path.join(staging, `${asset.name}.glb`), doc);
}
execFileSync(blender, ['-b', '--factory-startup', '--python', path.join(root, 'art/blender/import_vietnam_trees.py'), '--', staging, path.join(root, 'public/models')], { stdio: 'inherit' });
