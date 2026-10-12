// The "How to play" card (src/ui/howto.js): every game of the Mini games menu that has no guide of its own has a card,
// every row names a real control and a real picture, the lines are short enough for the narrow phone card, and each
// device (keyboard and mouse, touch, gamepad) gets its own glyphs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { HOWTO, PICS, chips, deviceOf, rowsHtml } from '../src/ui/howto.js';
import { buildCatalogue } from '../src/content/minigames.js';

const INPUTS = ['move', 'lr', 'creep', 'act', 'hold', 'jump', 'tap', 'aim', 'sow', null];
const OWN_GUIDE = new Set(['trick:archery', 'trick:cowrace', 'trick:swimming']);       // these bring a guide of their own
const keyOf = e => (e.kind === 'fish' ? 'fish' : e.id);

test('every mini game with no guide of its own has a How to play card', () => {
  const missing = buildCatalogue().filter(e => e.kind === 'trick' || e.kind === 'yard' || e.kind === 'fish')
    .filter(e => !OWN_GUIDE.has(e.id) && !HOWTO[keyOf(e)]).map(e => e.id);
  assert.deepEqual(missing, []);
});

test('a card belongs to a game that exists', () => {
  const ids = new Set(buildCatalogue().map(keyOf));
  for (const id of Object.keys(HOWTO)) assert.ok(ids.has(id), `${id} is not in the Mini games menu`);
});

test('rows: two or three, a known control, a known picture, a short line', () => {
  for (const [id, rows] of Object.entries(HOWTO)) {
    assert.ok(rows.length >= 2 && rows.length <= 3, `${id}: ${rows.length} rows`);
    assert.ok(rows.some(r => r.in), `${id}: no control at all`);
    for (const r of rows) {
      assert.ok(INPUTS.includes(r.in), `${id}: control ${r.in}`);
      assert.ok(PICS[r.pic], `${id}: picture ${r.pic}`);
      assert.ok(r.text.length >= 8 && r.text.length <= 46, `${id}: "${r.text}" is ${r.text.length} characters`);
      assert.match(r.text, /[.!?]$/, `${id}: "${r.text}" is a sentence`);
    }
  }
});

test('each device gets its own glyphs', () => {
  for (const [id, rows] of Object.entries(HOWTO)) for (const r of rows) {
    const [k, t, p] = ['key', 'touch', 'pad'].map(d => chips(r, d));
    if (!r.in) { assert.equal(k + t + p, '', `${id}: a rule row shows no control`); continue; }
    for (const html of [k, t, p]) assert.ok(html.length > 0, `${id}: ${r.in} has no glyph`);
    assert.notEqual(k, t, `${id}: ${r.in} is the same on keyboard and touch`);
  }
  assert.match(chips({ in: 'act' }, 'key'), />E</);
  assert.match(chips({ in: 'act' }, 'pad'), />X</);            // input.js: pad button 2 is "act", button 0 is "jump"
  assert.match(chips({ in: 'jump' }, 'pad'), />A</);
  assert.match(chips({ in: 'jump' }, 'key'), />Space</);
  assert.match(chips({ in: 'hold', touch: 'Reel' }, 'touch'), />Reel</);
});

test('the device follows the gamepad, then the touch screen', () => {
  assert.equal(deviceOf({ lastDevice: 'keyboard' }, false), 'key');
  assert.equal(deviceOf({ lastDevice: 'keyboard' }, true), 'touch');
  assert.equal(deviceOf({ lastDevice: 'touch' }, false), 'touch');
  assert.equal(deviceOf({ lastDevice: 'gamepad' }, true), 'pad');
  assert.equal(deviceOf(null, false), 'key');
});

test('the rows draw as one list item each, with a picture', () => {
  const html = rowsHtml(HOWTO['yard:tug'], 'key');
  assert.equal(html.match(/<li>/g).length, HOWTO['yard:tug'].length);
  assert.equal(html.match(/<svg /g).length, HOWTO['yard:tug'].length);
});
