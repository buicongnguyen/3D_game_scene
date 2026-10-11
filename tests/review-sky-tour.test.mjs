// Regressions found in the review of the sky gazing, the scene tour, the kite workshop and the Grandma story's words.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SkyGaze } from '../src/game/skygaze.js';
import { BARKS } from '../src/content/barks.js';
import { fits } from '../src/game/barks.js';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src');
const read = f => fs.readFileSync(path.join(SRC, f), 'utf8').replace(/\r\n/g, '\n');
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.js') ? [path.join(d, e.name)] : []));

test('graphics tier names are compared the way they are spelled (renderer.q.name is "Low", qualityName is "low")', () => {
  for (const file of walk(SRC)) {
    const text = fs.readFileSync(file, 'utf8');
    assert.ok(!/\bq\??\.name\s*===?\s*'(low|medium|high)'/.test(text), `${path.relative(SRC, file)}: q.name is capitalised ("Low", "Medium", "High")`);
    assert.ok(!/qualityName\s*===?\s*'(Low|Medium|High)'/.test(text), `${path.relative(SRC, file)}: qualityName is lower case`);
  }
});

test('sky gazing: the saved star groups are cleaned once, not every frame while a group is read', () => {
  const starRec = SkyGaze.prototype.starRec;
  const self = { recOk: null, st: { starGroups: { learned: ['crux', 'bogus', 'crux'] } } };
  const a = starRec.call(self);
  assert.deepEqual(a.learned, ['crux']);
  assert.equal(starRec.call(self), a, 'the same record comes back (nothing allocated per frame)');
  assert.equal(self.st.starGroups, a);
  a.learned.push('orion');
  assert.deepEqual(starRec.call(self).learned, ['crux', 'orion'], 'what was learned stays in the record');
  self.st.starGroups = 'garbage';                      // another slot or a hand-edited save swapped it
  assert.deepEqual(starRec.call(self).learned, []);
});

test('sky gazing: on a phone the line of thought is not stretched between the top and the bottom of the screen', () => {
  const css = read('game/skygaze.js').split('const CSS = `')[1].split('`;')[0];
  assert.match(css, /#skyGaze \.line\{[^}]*width:max-content/, 'a line sized to its text, not to half the screen');
  assert.match(css, /body\.touch #skyGaze\.sg-on \.line\{[^}]*bottom:auto/, 'the touch rule that sets a top must free the bottom');
  assert.match(css, /#skyGaze \.down\{[^}]*min-height:44px/, 'Look down is a finger-sized button');
  assert.match(css, /@media \(orientation:landscape\) and \(max-height:520px\)\{[^@]*body\.touch #skyGaze \.sg-card\{[^}]*left:auto/, 'a phone on its side puts the card at the side');
});

test('the scene tour: a refused play() that only means "interrupted by a pause" does not abandon the video', () => {
  const tour = read('game/tour.js');
  assert.ok(!/play\(\)\.catch\(\(\) => this\.vFallback\(\)\)/.test(tour), 'play() rejections go through playFailed');
  assert.match(tour, /playFailed\(e\) \{ if \(e\?\.name !== 'AbortError'\) this\.vFallback\(\); \}/);
});

test('the Grandma story: nobody sells lamp oil before the spring (the flood took it)', () => {
  const oil = BARKS.filter(b => /oil/i.test(b.text) && !b.story);
  for (const b of oil) {
    if (/half price/.test(b.text)) assert.equal(fits(b, 'any', { season: 'winter', hour: 22, chapter: 0, place: null, weather: null }), false, `"${b.text}" in the prologue`);
  }
});
