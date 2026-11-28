// The baked scene voices (scripts/speech-build.mjs): every line has a clip whose hash matches its text and voice, the
// clips are small, and a house stays inside its download budget (docs/TRAVEL-LANGUAGE-PLAN.md §8.3).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { checkLang } from '../scripts/speech-build.mjs';
import { LEARN_LANGS, SCENES } from '../src/content/scenes/index.js';

test('every scene line has a matching clip in every learning language', () => {
  for (const lang of LEARN_LANGS) assert.deepEqual(checkLang(lang), [], `${lang}: rebake (node scripts/speech-build.mjs)`);
});

test('clips are small; one house scene is at most 250 KB a language; the index is small', () => {
  for (const lang of LEARN_LANGS) {
    const idxPath = path.join('public/speech', lang, 'index.json');
    assert.ok(fs.statSync(idxPath).size < 40 * 1024, `${lang} index.json`);
    const idx = JSON.parse(fs.readFileSync(idxPath, 'utf8'));
    for (const s of SCENES) {
      let total = 0;
      for (const [k, e] of Object.entries(idx.lines)) {
        if (!k.startsWith(`${s.id}/`)) continue;
        const n = fs.statSync(path.join('public/speech', lang, e.f)).size;
        assert.ok(n <= 25 * 1024, `${lang} ${k}: ${n} B`);
        assert.ok(e.d > 0.3 && e.d < 9, `${lang} ${k}: ${e.d} s`);
        total += n;
      }
      assert.ok(total <= 250 * 1024, `${lang} ${s.id}: ${total} B`);
    }
  }
});
