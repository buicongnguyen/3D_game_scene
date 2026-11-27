// Sing & Play (docs/SING-AND-PLAY.md): where she may perform, the camera man's plan and follower, Record's file type and
// captions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canPerform, FLAT } from '../src/game/singplay/flat.js';
import { planShots, createCameraMan, damp, shotAt } from '../src/game/perform/camera-man.js';
import { createBeatClock } from '../src/game/perform/beat-clock.js';
import { planPerformance } from '../src/game/perform/plan.js';
import { pickType, srtFromLyrics } from '../src/game/perform/recorder.js';

const env = (heightAt, o = {}) => ({ heightAt, waterY: 0, solid: () => false, room: null, swimming: false, ...o });
const P = { x: 0, y: 5, z: 0 };

test('perform only on flat, dry, open ground (and in rooms only with room to spare)', () => {
  assert.deepEqual(canPerform(P, env(() => 5)), { ok: true });
  assert.equal(canPerform(P, env((x) => 5 + x * .4)).reason, 'steep', 'a 22 deg hillside');
  assert.equal(canPerform(P, env((x) => 5 + x * .1)).ok, true, 'a gentle 6 deg slope is fine');
  assert.equal(canPerform(P, env((x, z) => (Math.hypot(x, z) > 1.2 ? 5.5 : 5))).reason, 'steep', 'a step up beside her');
  assert.equal(canPerform(P, env((x) => (x > 1 ? -1 : 5))).reason, 'water', 'the river bank');
  assert.equal(canPerform({ ...P, y: .1 }, env(() => .1)).reason, 'water', 'at the water line');
  assert.equal(canPerform(P, env(() => 5, { swimming: true })).reason, 'water');
  assert.equal(canPerform(P, env(() => 5, { solid: (x, z, r) => r >= FLAT.room })).reason, 'room', 'a wall or a trunk within reach');
  const room = { min: { x: -2, z: -2 }, max: { x: 2, z: 2 } };
  assert.equal(canPerform(P, env(() => 5, { room })).ok, true, 'the middle of a 4 m room');
  assert.equal(canPerform({ ...P, x: 1.2 }, env(() => 5, { room })).reason, 'room', 'too near its wall');
  assert.equal(canPerform(P, env(() => 5, { room: { min: { x: -1, z: -1 }, max: { x: 1, z: 1 } } })).reason, 'room', 'a closet');
});

const BAR = 2.4, song = { id: 'cam-song', bpm: 100, offset: 0, duration: 40 * BAR, mood: 'uplifting' };
const sections = [['intro', 0, 4], ['verse', 4, 12], ['pre', 12, 16], ['chorus', 16, 24], ['bridge', 24, 32], ['chorus', 32, 36], ['outro', 36, 40]].map(([kind, a, b]) => ({ kind, t: a * BAR, e: b * BAR }));
const lines = []; for (const s of sections) if (/verse|pre|chorus/.test(s.kind)) for (let t = s.t + .2; t < s.e - 1; t += BAR * 2) lines.push({ t, e: t + BAR * 1.4, text: 'la la la', section: s.kind === 'chorus' ? 'Chorus' : 'Verse' });
const clock = createBeatClock(song, { sections, lyrics: { lines } }), plan = planPerformance(song, clock, { lines });
const shots = planShots(plan, clock);

test('the camera man: a shot per section, close-ups on chorus lines, an orbit in the bridge, the reveal last', () => {
  assert.deepEqual(planShots(plan, clock), shots, 'the same plan every time');
  assert.equal(shots[0].kind, 'wide');
  assert.equal(shots.at(-1).kind, 'reveal');
  for (let i = 1; i < shots.length; i++) { assert.ok(Math.abs(shots[i].t0 - shots[i - 1].t1) < 1e-9, 'shots tile the song'); if (shots[i].kind !== 'close') assert.notEqual(shots[i].kind, shots[i - 1].kind); }
  for (const l of lines.filter(x => x.section === 'Chorus')) assert.equal(shotAt(shots, l.t + .3).kind, 'close', `close-up on the chorus line at ${l.t.toFixed(1)}`);
  assert.equal(shotAt(shots, 28 * BAR).kind, 'orbit');
  assert.equal(shotAt(shots, 14 * BAR).kind, 'push');
});

test('the camera follows the same path at 30, 60 and 144 Hz (away from its cuts: no shake, no frame-rate wobble)', () => {
  const run = hz => { const cam = { position: { x: 0, y: 0, z: 0, copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; } }, lookAt() {} }, man = createCameraMan(shots), out = [];
    const subj = { x: 0, y: 0, z: 0, facing: 0 }; for (let t = 0; t < 30; t += 1 / hz) { man.update(1 / hz, t, subj, cam); if (Math.abs(t * 10 - Math.round(t * 10)) < .5 / hz * 10) out.push([+t.toFixed(1), cam.position.x, cam.position.y, cam.position.z]); }
    return new Map(out.map(([t, ...p]) => [t, p])); };
  const a = run(150);
  for (const hz of [30, 60, 144]) { const b = run(hz); let worst = 0; for (const [t, p] of b) { const q = a.get(t), nearCut = shots.some(x => t >= x.t0 - .05 && t < x.t0 + .25); if (q && !nearCut) worst = Math.max(worst, Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])); } assert.ok(worst < .12, `${hz} Hz within ${worst.toFixed(3)} m of 150 Hz`); }
  const [x] = damp(1, 0, 0, 4, .5), [y] = damp(damp(1, 0, 0, 4, .25)[0], damp(1, 0, 0, 4, .25)[1], 0, 4, .25);
  assert.ok(Math.abs(x - y) < 1e-12, 'the follower is exact in one step or two');
});

test('Record: mp4 where the browser writes it, else webm; captions on the video clock', () => {
  assert.equal(pickType(m => m.startsWith('video/mp4')).ext, 'mp4');
  assert.equal(pickType(m => m.startsWith('video/webm')).ext, 'webm');
  assert.equal(pickType(() => false), null);
  const srt = srtFromLyrics({ lines: [{ t: 1, e: 2.5, text: 'Hello' }, { t: 61.25, e: 63, text: 'Xin chào' }] }, .5);
  assert.equal(srt, '1\r\n00:00:00,500 --> 00:00:02,000\r\nHello\r\n\r\n2\r\n00:01:00,750 --> 00:01:02,500\r\nXin chào\r\n');
  assert.equal(srtFromLyrics({ lines: [{ t: 1, e: 2, text: 'gone' }] }, 5), '', 'lines before the take are left out');
});
