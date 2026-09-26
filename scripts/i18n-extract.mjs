// Collects every player-facing English string into src/i18n/source.json (the translators' source) and
// reports coverage of each language pack. English strings are the keys (see src/i18n/i18n.js).
//   node scripts/i18n-extract.mjs            write source.json + print coverage
//   node scripts/i18n-extract.mjs --check    exit 1 if any pack misses a string or breaks a placeholder
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAST, ITEMS, CHAPTERS, DIALOGUE, CHATTER, JOURNAL, STAR_POEM, FISH, STEPS } from '../src/game/story.js';
import { FALLEN_STARS, LAMPS } from '../src/world/layout.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LANGS = ['vi', 'ko', 'ja'];

export function collect() {
  const out = new Map();
  const add = (s, ctx) => {
    if (typeof s !== 'string' || !s.trim()) return;
    const e = out.get(s) || { s, ctx: [] };
    if (ctx && !e.ctx.includes(ctx) && e.ctx.length < 3) e.ctx.push(ctx);
    out.set(s, e);
  };
  for (const [id, c] of Object.entries(CAST)) add(c.name, `character name (${id})`);
  for (const it of Object.values(ITEMS)) add(it.name, 'inventory item');
  for (const c of CHAPTERS) { add(c.title, 'chapter label'); add(c.name, 'chapter name'); }
  for (const [id, lines] of Object.entries(DIALOGUE)) {
    for (const l of lines) {
      if (l.choice) for (const o of l.choice) add(o.text, `dialogue ${id}: Mika's answer choice`);
      else add(l[1], `dialogue ${id}, spoken by ${CAST[l[0]]?.name || l[0]}`);
    }
  }
  for (const [who, list] of Object.entries(CHATTER)) for (const l of list) add(l[0], `small talk by ${CAST[who]?.name || who}`);
  for (const p of JOURNAL) { add(p.title, "Sora's journal page title"); add(p.text, "Sora's journal page (her handwriting)"); }
  for (const l of STAR_POEM) add(l, "Sora's star poem, one line (12 lines rhyme in pairs)");
  for (const f of Object.values(FISH)) add(f.name, 'fish species');
  for (const s of STEPS) {
    add(s.objective, 'quest objective (keep {placeholders} exactly)');
    for (const e of [...(s.enter || []), ...(s.exit || [])]) if (e.toast) add(e.toast, 'toast');
  }
  for (const s of FALLEN_STARS) add(s.hint, 'where a fallen star hides (journal hint)');
  for (const l of LAMPS) add(l.name, 'Star Lamp name');

  // UI strings: tx('…') literals and interaction labels in the source, data-i18n markup in index.html
  const files = [];
  const walk = d => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.js$/.test(f.name)) files.push(p); } };
  walk(path.join(ROOT, 'src'));
  const lit = `'((?:[^'\\\\]|\\\\.)*)'|"((?:[^"\\\\]|\\\\.)*)"`;
  const unq = m => (m[1] ?? m[2]).replace(/\\'/g, "'").replace(/\\"/g, '"');
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    const rel = path.relative(ROOT, f).replace(/\\/g, '/');
    for (const m of src.matchAll(new RegExp(`\\b(?:tx|N_)\\(\\s*(?:${lit})`, 'g'))) add(unq(m), `UI (${rel})`);
    // interact(id, pos, 'label', …) / target(id, pos, 'label', …) / d.target(…)
    for (const m of src.matchAll(new RegExp(`\\b(?:interact|target)\\(\\s*[^,]+,\\s*[^,]+,\\s*(?:${lit})`, 'g'))) add(unq(m), 'interaction prompt shown next to the E key');
    // loading-screen labels
    for (const m of src.matchAll(new RegExp(`onProgress\\(\\s*[^,]+,\\s*(?:${lit})`, 'g'))) add(unq(m), 'loading screen');
  }
  // minigame titles live in a small table
  const mg = fs.readFileSync(path.join(ROOT, 'src/game/minigames.js'), 'utf8');
  const titles = mg.match(/get title\(\) \{[\s\S]*?\}\[this\.phase\]/);
  if (titles) for (const m of titles[0].matchAll(new RegExp(lit, 'g'))) add(unq(m), 'fishing minigame title');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  for (const m of html.matchAll(/<(\w+)[^>]*\sdata-i18n(?=[\s>])[^>]*>([^<]*)</g)) add(m[2].trim().replace(/&amp;/g, '&'), 'menu / screen text');
  for (const m of html.matchAll(/aria-label="([^"]+)"[^>]*data-i18n-aria/g)) add(m[1], 'button label (screen readers)');
  return [...out.values()];
}

const placeholders = s => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');

export function coverage(source) {
  const res = {};
  for (const l of LANGS) {
    const p = path.join(ROOT, 'src/i18n', `${l}.json`);
    const pack = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {};
    const missing = source.filter(e => !pack[e.s]);
    const badPh = source.filter(e => pack[e.s] && placeholders(pack[e.s]) !== placeholders(e.s));
    const stale = Object.keys(pack).filter(k => !source.some(e => e.s === k));
    res[l] = { total: source.length, missing, badPh, stale };
  }
  return res;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const source = collect();
  const check = process.argv.includes('--check');
  if (!check) {
    fs.writeFileSync(path.join(ROOT, 'src/i18n/source.json'), JSON.stringify(source, null, 1) + '\n');
    console.log(`source.json: ${source.length} strings, ${source.reduce((a, e) => a + e.s.length, 0)} characters`);
  }
  let bad = 0;
  for (const [l, r] of Object.entries(coverage(source))) {
    console.log(`${l}: ${r.total - r.missing.length}/${r.total} translated, ${r.badPh.length} placeholder mismatches, ${r.stale.length} stale`);
    if (r.missing.length && r.missing.length < 12) for (const m of r.missing) console.log(`   missing: ${m.s}`);
    for (const m of r.badPh.slice(0, 10)) console.log(`   placeholders differ: ${m.s}`);
    bad += r.missing.length + r.badPh.length;
  }
  if (check && bad) process.exit(1);
}
