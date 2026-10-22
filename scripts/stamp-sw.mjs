// Fills the table at the top of <dist>/sw.js: the build id, the content hash of every file whose name does not change
// (models, icons, portraits) and the list of hashed assets. Run after the models are packed: `node scripts/stamp-sw.mjs dist`.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const sha = (buf, n = 10) => createHash('sha1').update(buf).digest('hex').slice(0, n);
const walk = (dir, base = '') => existsSync(dir) ? readdirSync(dir).flatMap(f => {
  const p = path.join(dir, f), r = base ? `${base}/${f}` : f;
  return statSync(p).isDirectory() ? walk(p, r) : [r];
}) : [];

export function stampTable(dist) {
  const files = {};
  for (const dir of ['models', 'icons', 'portraits', 'zones']) for (const r of walk(path.join(dist, dir), dir)) files[r] = sha(readFileSync(path.join(dist, r)));
  const assets = walk(path.join(dist, 'assets'), 'assets').sort();
  const index = readFileSync(path.join(dist, 'index.html'));
  const build = sha(JSON.stringify([sha(index, 40), files, assets]));
  return { build, files, assets };
}

export function stamp(dist) {
  const file = path.join(dist, 'sw.js');
  const src = readFileSync(file, 'utf8');
  const lines = src.split('\n');
  const i = lines.findIndex(l => l.startsWith('const STAMP = ') && l.includes('// @stamp'));
  if (i < 0) throw new Error('sw.js has no STAMP line');
  const t = stampTable(dist);
  lines[i] = `const STAMP = ${JSON.stringify(t)}; // @stamp`;
  writeFileSync(file, lines.join('\n'));
  return t;
}

if (process.argv[1] && /stamp-sw.mjs$/.test(process.argv[1])) {
  const dist = process.argv[2] || 'dist';
  const t = stamp(dist);
  console.log(`sw.js stamped: build ${t.build}, ${Object.keys(t.files).length} files, ${t.assets.length} assets`);
}
