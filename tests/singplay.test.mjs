// Sing & Play (docs/SING-AND-PLAY.md): where she may perform, the camera man's plan and follower, Record's file type and
// captions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canPerform, canGroup, FLAT } from '../src/game/singplay/flat.js';
import { STAGES } from '../src/content/stages.js';
import { singHereState, HERE_REASONS } from '../src/game/singplay/sing-here.js';
import { troupeOf, leadOffset } from '../src/content/troupe.js';
import { sharedGrid, buildingSolids } from '../src/world/roads.js';
import { WATER_Y } from '../src/world/layout.js';

const STAGE = { x: -92, z: 101, facing: Math.PI };   // (singplay.js STAGE: the first visit; facing: the camera's view)
import { planShots, createCameraMan, damp, shotAt, shotPose, fromCamera, overGround, CUT, GROUND_GAP } from '../src/game/perform/camera-man.js';
import { faceCamera, LAYOUTS } from '../src/game/singplay/singplay.js';
import { createBeatClock } from '../src/game/perform/beat-clock.js';
import { planPerformance } from '../src/game/perform/plan.js';
import { pickType, srtFromLyrics } from '../src/game/perform/recorder.js';
import { captionLines, captionAt, CAPTION } from '../src/game/perform/caption.js';
import { pickSong, loadSinger, bodyFile, SINGER_KEY } from '../src/game/singplay/singplay.js';

const env = (heightAt, o = {}) => ({ heightAt, waterY: 0, solid: () => false, room: null, swimming: false, ...o });
const P = { x: 0, y: 5, z: 0 };

test('perform only on level or gently sloping, dry, open ground (and in rooms only with room to spare)', () => {
  assert.deepEqual(canPerform(P, env(() => 5)), { ok: true });
  assert.equal(canPerform(P, env((x) => 5 + x * .47)).reason, 'steep', 'a 25 deg hillside');
  assert.equal(canPerform(P, env((x) => 5 + x * .1)).ok, true, 'a gentle 6 deg slope is fine');
  assert.equal(canPerform(P, env((x) => 5 + x * .32)).ok, true, 'an 18 deg hillside is fine (2026-11-28: feet fitted to it)');
  assert.equal(canPerform(P, env((x, z) => 5 + z * .32)).ok, true, 'the same hillside the other way');
  assert.equal(canPerform(P, env((x, z) => (x > .6 ? 4.4 : 5))).reason, 'steep', 'a bank: a 60 cm step within her ring');
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

test('a group on a hillside: the whole formation within 0.6 m of height, no member on ground steeper than 20 deg', () => {
  const spots = [{ x: -1.5, z: 0 }, { x: 1.5, z: 0 }, { x: -.75, z: -2 }, { x: .75, z: -2 }];
  const hill = k => env((x, z) => 5 - z * k);   // (the back row, at -z, uphill)
  assert.deepEqual(canGroup(P, 0, spots, hill(.25)), { ok: true }, '14 deg: the back row 0.5 m up, tiered');
  assert.equal(canGroup(P, 0, spots, hill(.36)).reason, 'steep', '20 deg over 2 m of depth: 0.72 m, too much');
  assert.equal(canGroup(P, 0, spots, env((x, z) => (x > 1.7 && z > -1 ? 5.3 : 5))).reason, 'steep', 'a step under one member');
  // the closer layout keeps a formation inside the range where the first will not fit
  const k = leadOffset(), eight = troupeOf(8).filter(m => !m.lead).map(m => ({ x: m.x - k.x, z: m.z - k.z }));
  const scaled = L => eight.map(o => ({ x: o.x * L.x, z: o.z * L.z })), depth = Math.max(0, ...eight.map(o => o.z)) - Math.min(0, ...eight.map(o => o.z));
  const hill17 = env((x, z) => 5 - z * (.66 / depth));   // (17 deg: the back row 0.66 m up in the first layout)
  assert.equal(canGroup(P, 0, scaled(LAYOUTS[0]), hill17).reason, 'steep', 'the first layout spans too much height');
  assert.deepEqual(canGroup(P, 0, scaled(LAYOUTS[1]), hill17), { ok: true }, 'the closer layout fits');
});

test('Perform faces the camera: her turn is the camera view turned half round', () => {
  for (const view of [0, .7, Math.PI / 2, 2.5, -1.2]) {
    const f = faceCamera({ x: Math.sin(view), y: -.3, z: Math.cos(view) });
    assert.ok(Math.abs(Math.cos(f - view - Math.PI) - 1) < 1e-9, `view ${view}`);
  }
});

// The stage list (content/stages.js): every stage holds Solo, 4 and 8 at its performing turn (the stored facing is the
// camera's view; Perform turns them half round) on the real terrain, clear of every building's collider box (the spots
// were picked in the browser with the game's full colliders: trees, fences, props).
test('every listed stage has room for Solo, a group of 4 and a group of 8 turned to face the camera', () => {
  const grid = sharedGrid(), solids = buildingSolids();
  const solid = (x, z, r) => solids.some(b => { const dx = x - b.x, dz = z - b.z, lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c; return Math.abs(lx) < b.hw + r && Math.abs(lz) < b.hd + r; });
  const world = env((x, z) => grid.heightAt(x, z), { waterY: WATER_Y, solid });
  const k = leadOffset(), spots = n => troupeOf(n).filter(m => !m.lead).map(m => ({ x: m.x - k.x, z: m.z - k.z }));
  assert.ok(STAGES.length >= 5 && STAGES.length <= 7, 'five to seven stages (one flat row, it scrolls on phones)');
  assert.equal(new Set(STAGES.map(s => s.id)).size, STAGES.length, 'ids are unique');
  assert.deepEqual({ x: STAGES[0].x, z: STAGES[0].z, facing: STAGES[0].facing }, { ...STAGE }, 'the first stage is the first-visit place');
  for (const st of STAGES) {
    const p = { x: st.x, y: grid.heightAt(st.x, st.z), z: st.z };
    assert.deepEqual(canPerform(p, world), { ok: true }, `${st.id}: Solo`);
    for (const n of [4, 8]) assert.deepEqual(canGroup(p, st.facing + Math.PI, spots(n), world), { ok: true }, `${st.id}: group of ${n}`);
    for (let i = 0; i < STAGES.length; i++) if (STAGES[i] !== st) assert.ok(Math.hypot(STAGES[i].x - st.x, STAGES[i].z - st.z) > 20, `${st.id} is a place of its own`);
  }
});

test('Sing here: Explore only, while nothing owns the game, on dry flat ground outdoors', () => {
  const ground = { heightAt: () => 5 };
  const game = (o = {}, p = {}) => ({ world: ground, zone: null, params: new URLSearchParams(o.q || ''), interiors: { active: o.room || null, rooms: new Map() }, ui: {}, follow: {}, renderer: {},
    colliders: { resolve: () => ({ hit: false }) },
    director: { quest: {}, explore: o.explore ?? true, singplay: !!o.sing, minigameMenu: { canOpen: () => o.menu ?? true }, cows: { riding: !!o.cow } },
    player: { pos: { x: 0, y: 5, z: 0 }, grounded: true, swimming: false, ...p } });
  assert.deepEqual(singHereState(game()), { show: true, ok: true });
  assert.equal(singHereState(game({ explore: false })).show, false, 'not in the story');
  assert.equal(singHereState(game({ sing: true })).show, false, 'not in the mode itself');
  assert.equal(singHereState(game({ menu: false })).show, false, 'not in a round, a scene or a ride');
  assert.equal(singHereState(game({ q: 'singplay=off' })).show, false, '?singplay=off');
  assert.equal(singHereState(game({}, { swimming: true })).reason, 'swim');
  assert.equal(singHereState(game({}, { mounted: true })).reason, 'ride');
  assert.equal(singHereState(game({ room: 'bakery' })).reason, 'indoors');
  assert.equal(singHereState(game({}, { grounded: false })).reason, 'ground');
  assert.equal(singHereState({ ...game(), world: { heightAt: x => 5 + x * .4 } }).reason, 'steep');
  for (const r of Object.keys(HERE_REASONS)) assert.ok(HERE_REASONS[r].length <= 28, `${r}: a short reason`);
});

const BAR = 2.4, song = { id: 'cam-song', bpm: 100, offset: 0, duration: 40 * BAR, mood: 'uplifting' };
const sections = [['intro', 0, 4], ['verse', 4, 12], ['pre', 12, 16], ['chorus', 16, 24], ['bridge', 24, 32], ['chorus', 32, 36], ['outro', 36, 40]].map(([kind, a, b]) => ({ kind, t: a * BAR, e: b * BAR }));
const lines = []; for (const s of sections) if (/verse|pre|chorus/.test(s.kind)) for (let t = s.t + .2; t < s.e - 1; t += BAR * 2) lines.push({ t, e: t + BAR * 1.4, text: 'la la la', section: s.kind === 'chorus' ? 'Chorus' : 'Verse' });
const clock = createBeatClock(song, { sections, lyrics: { lines } }), plan = planPerformance(song, clock, { lines });
const shots = planShots(plan, clock);

test('the camera man: cuts on bar lines, two bars at least, the open shot first, close-ups on her lines, the reveal last', () => {
  assert.deepEqual(planShots(plan, clock), shots, 'the same plan every time');
  assert.equal(shots[0].kind, 'open', 'it starts from the player\'s own view');
  assert.equal(shots.at(-1).kind, 'reveal');
  for (let i = 0; i < shots.length; i++) {
    const s = shots[i];
    assert.ok(Math.abs(s.t0 - clock.barTime(s.b)) < 1e-9 && Number.isInteger(s.b), `shot ${i} cuts on a bar line`);
    if (i) { assert.ok(Math.abs(s.t0 - shots[i - 1].t1) < 1e-9, 'shots tile the song'); assert.notEqual(s.kind, shots[i - 1].kind, 'never the same shot twice'); }
    if (i < shots.length - 1) assert.ok(s.t1 - s.t0 >= CUT.minBars * BAR - 1e-6, `shot ${i} (${s.kind}) runs two bars at least`);
    if (s.kind === 'close') assert.ok(s.t1 - s.t0 <= CUT.closeMax * BAR + 1e-6, 'a close-up is short');
  }
  for (const k of ['open', 'crane', 'landscape', 'low', 'close', 'orbit', 'push', 'reveal']) assert.ok(shots.some(s => s.kind === k), `the plan uses ${k}`);
  for (const s of sections.filter(x => x.kind === 'chorus')) {
    assert.equal(shotAt(shots, s.t + .1).kind, 'low', 'a chorus opens on the low hero shot');
    assert.ok(lines.some(l => l.t >= s.t && l.t < s.e && shotAt(shots, l.t + .3).kind === 'close'), 'a close-up on a chorus line');
  }
  assert.ok(['landscape', 'orbit'].includes(shotAt(shots, 25 * BAR).kind), 'the bridge: the landscape and the orbit');
  assert.equal(shotAt(shots, 14 * BAR).kind, 'push');
});

test('the shots: open starts at the player\'s camera, landscape looks past her, the camera stays over the ground', () => {
  const subject = { x: 10, y: 2, z: -4, facing: .6 };
  const cam = { x: subject.x + Math.sin(.6) * 6, y: 4.1, z: subject.z + Math.cos(.6) * 6 };
  subject.from = fromCamera(cam, subject);
  const open = shotPose({ t0: 0, t1: 8, kind: 'open', side: 1 }, 0, subject);
  assert.ok(Math.hypot(open.pos.x - cam.x, open.pos.y - cam.y, open.pos.z - cam.z) < 1e-6, 'the first frame is the player\'s view');
  const land = shotPose({ t0: 0, t1: 8, kind: 'landscape', side: 1 }, 2, subject);
  const toHer = Math.hypot(land.pos.x - subject.x, land.pos.z - subject.z), toLook = Math.hypot(land.pos.x - land.look.x, land.pos.z - land.look.z);
  assert.ok(toLook > toHer + 20, 'aimed far past her');
  assert.ok(Math.abs(land.focus.x - subject.x) < 1e-9, 'walls are checked toward her');
  const hill = (x, z) => z * .5, p = overGround({ x: 0, y: 0, z: 6 }, { x: 0, y: 1, z: 0 }, hill);
  assert.ok(p.y >= hill(0, 6) + GROUND_GAP - 1e-9, 'over the ground');
  for (const f of [.25, .5, .75]) assert.ok(1 + (p.y - 1) * f >= hill(0, 6 * f) + GROUND_GAP - 1e-9, 'the line of sight clears the slope');
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

test('the lyric caption: the line being sung, its word lit in time, nothing between lines', () => {
  const L = captionLines({ lines: [{ t: 2, e: 4, text: 'Off the train', words: [{ w: 'Off', t: 2, e: 2.5 }, { w: 'the', t: 2.6, e: 3 }, { w: 'train', t: 3.2, e: 4 }] }, { t: 10, e: 12, text: 'No words here' }, { t: 'x', e: 1, text: 'bad' }] });
  assert.equal(L.length, 2); assert.deepEqual(L[1].words.map(w => w.w), ['No words here'], 'a line without word times is one word');
  assert.equal(captionAt(L, 0), null);
  assert.deepEqual(captionAt(L, 2 - CAPTION.lead + .01), { i: 0, k: -1 }, 'shows a little before its first word');
  assert.deepEqual(captionAt(L, 2.7), { i: 0, k: 1 });
  assert.deepEqual(captionAt(L, 3.1), { i: 0, k: 1 }, 'a gap between words keeps the word before');
  assert.deepEqual(captionAt(L, 4.2), { i: 0, k: 3 }, 'all sung');
  assert.equal(captionAt(L, 4 + CAPTION.hold + .01), null, 'gone between lines');
  assert.deepEqual(captionAt(L, 11), { i: 1, k: 0 });
  assert.equal(captionAt([], 3), null);
});

test('Singer and Song picks: remembered per device, a picked song only where it is sung, every body built', () => {
  const store = v => ({ getItem: k => (k === SINGER_KEY ? v : null) });
  assert.equal(loadSinger(store('nu-3')), 'nu-3'); assert.equal(loadSinger(store('nobody')), 'kotone'); assert.equal(loadSinger(store(null)), 'kotone');
  assert.equal(bodyFile('nam-2', true), 'vroid-nam2.lite'); assert.equal(bodyFile('kotone', false), 'kotone'); assert.equal(bodyFile('??', false), 'kotone');
  const pool = [{ song: { id: 'a' } }, { song: { id: 'b' } }];
  assert.equal(pickSong(pool, 'b').song.id, 'b'); assert.equal(pickSong(pool, 'gone').song.id, 'a', 'a song no longer listed: the first'); assert.equal(pickSong([], 'a'), null);
});
