import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { collect, coverage } from '../scripts/i18n-extract.mjs';

const source = collect();

test('i18n: source.json is up to date with the game text (run npm run i18n:extract)', () => {
  const saved = JSON.parse(fs.readFileSync(new URL('../src/i18n/source.json', import.meta.url), 'utf8')).map(e => e.s).sort();
  assert.deepEqual(saved, source.map(e => e.s).sort());
});

test('i18n: Vietnamese, Korean and Japanese cover every string and keep every placeholder', () => {
  for (const [lang, r] of Object.entries(coverage(source))) {
    assert.equal(r.missing.length, 0, `${lang} is missing ${r.missing.length}: ${r.missing.slice(0, 5).map(e => e.s).join(' | ')}`);
    assert.equal(r.badPh.length, 0, `${lang} breaks placeholders in: ${r.badPh.slice(0, 5).map(e => e.s).join(' | ')}`);
  }
});

test('i18n: translations are really translated (not copied English) and fit the UI', () => {
  for (const lang of ['vi', 'ko', 'ja']) {
    const pack = JSON.parse(fs.readFileSync(new URL(`../src/i18n/${lang}.json`, import.meta.url), 'utf8'));
    const long = source.filter(e => e.s.length > 25);
    const same = long.filter(e => pack[e.s] === e.s);
    assert.ok(same.length <= 3, `${lang}: ${same.length} long strings left in English, e.g. ${same.slice(0, 3).map(e => e.s).join(' | ')}`);
    if (lang !== 'vi') {
      const script = lang === 'ko' ? /[가-힯]/ : /[぀-ヿ一-鿿]/;
      const off = long.filter(e => pack[e.s] && !script.test(pack[e.s]));
      assert.ok(off.length <= 3, `${lang}: ${off.length} lines without ${lang} script`);
    }
    // prompts next to the E key and buttons stay short
    for (const e of source.filter(x => x.ctx.some(c => /prompt|button/.test(c)))) {
      const t = pack[e.s];
      if (t) assert.ok([...t].length <= Math.max(34, e.s.length * 1.8), `${lang}: prompt too long: ${t}`);
    }
  }
});
