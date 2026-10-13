// The sky compass (src/ui/sky-compass.js): the heading maths of the Stargazing trick and of "Look up at the sky".
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  COMPASS_POINTS, COMPASS_LETTER, COMPASS_NAME, azimuthOf, azDiff, wrap360, compassIndex, compassHeld, compassName, facingText, viewOf, projectSky, horizonMarks,
} from '../src/ui/sky-compass.js';
import { worldDir } from '../src/content/constellations.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

test('azimuth: north is -z, east is +x, as the star data has it', () => {
  assert.equal(azimuthOf(0, -1), 0);
  assert.equal(azimuthOf(1, 0), 90);
  assert.equal(azimuthOf(0, 1), 180);
  assert.equal(azimuthOf(-1, 0), 270);
  // the same convention as worldDir(): a direction made from an azimuth reads back as that azimuth
  for (const az of [0, 33, 90, 147, 180, 251, 315, 359]) { const d = worldDir(20, az); assert.ok(near(azimuthOf(d[0], d[2]), az, 1e-9), `az ${az}`); }
  assert.equal(wrap360(-10), 350); assert.equal(wrap360(725), 5);
  assert.equal(azDiff(10, 350), 20); assert.equal(azDiff(350, 10), -20); assert.equal(azDiff(180, 0), 180);
});

test('the eight points: which one a heading is, and the words for it', () => {
  assert.deepEqual(COMPASS_POINTS, ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']);
  assert.deepEqual(COMPASS_LETTER, ['N', 'E', 'S', 'W']);
  assert.equal(COMPASS_NAME.length, 8);
  assert.deepEqual([0, 22, 23, 45, 90, 135, 180, 225, 270, 315, 337, 338, 359.9].map(compassIndex), [0, 0, 1, 1, 2, 3, 4, 5, 6, 7, 7, 0, 0]);
  assert.equal(compassName(318, s => s), 'north-west');
  assert.equal(compassName(191, s => s), 'south');
  // the words go through the translator, the direction filled in
  const t = (s, vars) => (vars ? `<${s}>`.replace('{dir}', vars.dir) : s.toUpperCase());
  assert.equal(facingText(1, t), '<Looking NORTH-EAST>');
});

test('the written heading does not flicker on a boundary', () => {
  assert.equal(compassHeld(20, -1), 0);
  assert.equal(compassHeld(24, 0), 0, 'two degrees past the boundary it is still north');
  assert.equal(compassHeld(26, 0), 0);
  assert.equal(compassHeld(27, 0), 1, 'well into the next eighth it changes');
  assert.equal(compassHeld(21, 1), 1, 'and does not change straight back');
  assert.equal(compassHeld(18, 1), 0);
  assert.equal(compassHeld(350, 0), 0);
  assert.equal(compassHeld(331, 0), 7);
  assert.equal(compassHeld(200, 0), 4, 'a big turn names the new heading at once');
});

test('the view: read from a direction, and where a point of the sky lands in it', () => {
  const d = worldDir(30, 120), v = viewOf(d[0], d[1], d[2], 60, 16 / 9);
  assert.ok(near(v.az, 120, 1e-9) && near(v.alt, 30, 1e-9));
  // the point looked at is the middle of the picture
  const p = projectSky(120, 30, v);
  assert.ok(p.front && near(p.x, 0, 1e-9) && near(p.y, 0, 1e-9));
  // a point higher up is higher on the screen; one to the east of a north view is on the right
  const north = { az: 0, alt: 20, fov: 60, aspect: 16 / 9 };
  assert.ok(projectSky(0, 35, north).y > 0);
  assert.ok(projectSky(20, 20, north).x > 0 && projectSky(340, 20, north).x < 0);
  // straight up from the middle by half the field of view is the top edge
  assert.ok(near(projectSky(0, 50, north).y, 1, 1e-9));
  // behind the viewer: not in the picture
  assert.equal(projectSky(180, 10, north).front, false);
});

test('the horizon marks stand on a level line and slide as the view turns', () => {
  const view = { az: 0, alt: 22, fov: 60, aspect: 2 };
  const m = horizonMarks(view);
  assert.equal(m.length, 8);
  assert.ok(m[0].on && near(m[0].x, 0, 1e-9), 'facing north, N is in the middle');
  assert.ok(m[1].on && m[7].on && m[1].x > 0 && m[7].x < 0, 'NE on the right, NW on the left');
  assert.ok(!m[2].on && !m[4].on && !m[4].front, 'east is off the side, south is behind');
  for (const k of [1, 7]) assert.ok(near(m[k].y, m[0].y, 1e-9), 'the horizon is a straight level line in a view that does not roll');
  assert.ok(near(m[0].y, -Math.tan(22 * Math.PI / 180) / Math.tan(30 * Math.PI / 180), 1e-9), 'below the middle by the tilt');
  // turn to the east: the letters slide to the left, E arrives in the middle
  const before = m[1].x;
  horizonMarks({ ...view, az: 30 }, m);
  assert.ok(m[1].x < before && m[0].x < 0);
  horizonMarks({ ...view, az: 90 }, m);
  assert.ok(m[2].on && near(m[2].x, 0, 1e-9) && !m[0].on);
  // tilted up to the pole the horizon is out of the picture: no mark shows (the rose chip is for then)
  horizonMarks({ ...view, alt: 55 }, m);
  assert.ok(m.every(k => !k.on));
  // marks may stand a little above the true horizon, to clear hills
  assert.ok(horizonMarks(view, undefined, 3)[0].y > horizonMarks(view)[0].y);
});

test('the module is safe to load without a page, and both hosts take the compass away', () => {
  const src = fs.readFileSync(new URL('../src/ui/sky-compass.js', import.meta.url), 'utf8');
  assert.ok(!/from 'three'/.test(src), 'no three.js in the shared compass');
  const gaze = fs.readFileSync(new URL('../src/game/skygaze.js', import.meta.url), 'utf8');
  assert.match(gaze, /createSkyCompass\(\{ host: el, kind: 'gaze', inside: true \}\)/, 'the viewer builds it inside its own layer');
  assert.match(gaze, /if \(!on\) \{ this\.compass\?\.remove\(\); this\.compass = null; this\.el\?\.remove\(\)/, 'and removes it wherever its layer is removed');
  assert.equal((gaze.match(/this\.ui\(false\)/g) || []).length, 1, 'the viewer has one place where its layer goes: stop()');
  const trick = fs.readFileSync(new URL('../src/game/tricks/stars.js', import.meta.url), 'utf8');
  assert.match(trick, /compass\?\.remove\(\);/, 'the trick removes it in its cleanup');
});
