// Release budget: meshopt-pack a copy of the whole model library and check size and integrity.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, readdirSync, statSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { TOTAL_PACKED_BYTES, CONTRACTS } from './asset-contracts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('packed model library fits the download budget and every model still loads with its clips', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'starline-pack-'));
  try {
    cpSync(path.join(ROOT, 'public/models'), dir, { recursive: true });
    execFileSync(process.execPath, [path.join(ROOT, 'scripts/pack-models.mjs'), dir], { stdio: 'pipe' });
    const files = readdirSync(dir).filter(f => f.endsWith('.glb'));
    const total = files.reduce((a, f) => a + statSync(path.join(dir, f)).size, 0);
    assert.ok(total <= TOTAL_PACKED_BYTES, `${(total / 1e6).toFixed(2)} MB packed > ${TOTAL_PACKED_BYTES / 1e6} MB`);
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    for (const f of files) {
      const b = readFileSync(path.join(dir, f));
      const gltf = await new Promise((res, rej) => loader.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', res, rej));
      const c = CONTRACTS[f.replace('.glb', '')];
      for (const clip of c?.clips ?? []) assert.ok(gltf.animations.some(a => a.name === clip), `${f} lost clip ${clip}`);
      for (const n of c?.nodes ?? []) assert.ok(gltf.scene.getObjectByName(n), `${f} lost node ${n}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
