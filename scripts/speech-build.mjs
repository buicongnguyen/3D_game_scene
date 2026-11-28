// The house scenes' baked voices (docs/TRAVEL-LANGUAGE-PLAN.md §8). The TTS engines run offline (tools/tts/bake.py);
// the game ships only public/speech/<lang>/<scene>/<nn>.m4a and one public/speech/<lang>/index.json per language.
//   node scripts/speech-build.mjs --lines            write .tools/speech/lines.json (what bake.py speaks)
//   node scripts/speech-build.mjs --import [langs]   read .tools/speech/report-<lang>.json (bake.py) -> index.json
//   node scripts/speech-build.mjs --check            every line has a clip whose hash matches its text + voice
// A clip's hash `h` = sha1(text | voice profile): change a line or a cast voice and --check (npm test) fails until rebaked.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { SCENES, LEARN_LANGS, lineKey } from '../src/content/scenes/index.js';
import { CAST_VOICES, voiceKey } from '../src/content/scenes/cast-voices.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPEECH = path.join(ROOT, 'public/speech');
const TOOLS = path.join(ROOT, '.tools/speech');

/** What a voice reads: the line without decorations (ellipses become a pause). */
export const spoken = t => String(t || '').replace(/…/g, ', ').replace(/\s+,/g, ',').replace(/\s+/g, ' ').trim();
export const hashOf = (text, profile) => crypto.createHash('sha1').update(`${spoken(text)}|${voiceKey(profile)}`).digest('hex').slice(0, 16);

/** Every line to bake: [{ key, scene, i, who, kind, lang, text, voice, h, file }]. */
export function bakeList(langs = LEARN_LANGS) {
  const out = [];
  for (const s of SCENES) s.lines.forEach((l, i) => {
    for (const lang of langs) {
      const cv = CAST_VOICES[l.who], profile = cv?.[lang];
      const key = lineKey(s.id, i);
      out.push({ key, scene: s.id, i, who: l.who, kind: cv?.kind || null, lang, text: spoken(l[lang]), voice: profile || null, h: hashOf(l[lang], profile), file: `${key}.m4a` });
    }
  });
  return out;
}

/** Problems with the shipped clips of `lang` (an empty list = all good). */
export function checkLang(lang) {
  const idx = path.join(SPEECH, lang, 'index.json');
  if (!fs.existsSync(idx)) return [`${lang}: no public/speech/${lang}/index.json`];
  const man = JSON.parse(fs.readFileSync(idx, 'utf8')), bad = [];
  for (const b of bakeList([lang])) {
    const e = man.lines?.[b.key];
    if (!e) { bad.push(`${lang} ${b.key}: no clip`); continue; }
    if (e.h !== b.h) bad.push(`${lang} ${b.key}: text or voice changed since the bake (rebake)`);
    if (!fs.existsSync(path.join(SPEECH, lang, e.f))) bad.push(`${lang} ${b.key}: missing ${e.f}`);
  }
  return bad;
}

function importLang(lang) {
  const rp = path.join(TOOLS, `report-${lang}.json`);
  if (!fs.existsSync(rp)) { console.log(`${lang}: no ${path.relative(ROOT, rp)}`); return; }
  const rep = JSON.parse(fs.readFileSync(rp, 'utf8'));
  const want = new Map(bakeList([lang]).map(b => [b.key, b]));
  const lines = {};
  let bytes = 0;
  for (const [key, r] of Object.entries(rep.lines || {})) {
    const b = want.get(key);
    if (!b) continue;
    const f = path.join(SPEECH, lang, r.f || b.file);
    if (!fs.existsSync(f)) { console.warn(`${lang} ${key}: ${r.f} not found`); continue; }
    if (r.h !== b.h) console.warn(`${lang} ${key}: baked from older text/voice`);
    bytes += fs.statSync(f).size;
    lines[key] = { f: r.f || b.file, d: Math.round(r.d * 100) / 100, h: r.h, env: r.env };
  }
  const engines = [...new Set(Object.values(rep.lines || {}).map(r => r.engine).filter(Boolean))];
  const out = { v: 1, lang, engines, licence: rep.licence || null, built: new Date().toISOString().slice(0, 10), review: lang === 'en' ? 'ok' : 'draft', lines };
  fs.writeFileSync(path.join(SPEECH, lang, 'index.json'), JSON.stringify(out) + '\n');
  console.log(`${lang}: ${Object.keys(lines).length}/${want.size} clips, ${(bytes / 1024).toFixed(0)} KB`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes('--lines')) {
    fs.mkdirSync(TOOLS, { recursive: true });
    const list = bakeList();
    fs.writeFileSync(path.join(TOOLS, 'lines.json'), JSON.stringify(list, null, 1) + '\n');
    console.log(`${list.length} lines -> .tools/speech/lines.json`);
  } else if (args.includes('--import')) {
    const langs = args.filter(a => LEARN_LANGS.includes(a));
    for (const l of langs.length ? langs : LEARN_LANGS) importLang(l);
  } else {
    const bad = LEARN_LANGS.flatMap(checkLang);
    for (const b of bad) console.log(b);
    console.log(bad.length ? `${bad.length} problems` : 'speech: all clips match');
    if (args.includes('--check') && bad.length) process.exit(1);
  }
}
