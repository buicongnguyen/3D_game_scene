// © 2026 Bui Cong Nguyen · solluxlabs.com
// Show effects (docs/SHOW-EFFECTS.md) and the Night Star (docs/NIGHT-STAR.md): the pure cues, the draw budget rule, the
// stage set's triangle budget, the guest singer's cast, her dress-safe moves, her song hook and when she is there; the
// stage light on the performers at night (fx/stage-uplight.js): its area, the footlights, the shader patch, night only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createBeatClock } from '../src/game/perform/beat-clock.js';
import { planPerformance } from '../src/game/perform/plan.js';
import { WASH, washAt, pulseAt, cuePlan, showItems, showDraws, slotTimes, SLOTS, inWindows, countsFor, showDefault, isShowNight } from '../src/game/perform/show-cues.js';
import * as THREE from 'three';
import { buildStage, stageSize, footlightSpots } from '../src/fx/show-fx.js';
import { UP, UPLIGHT, stageArea, uplightNight, uplightShader, patchUplight, uplightStart, uplightUpdate, uplightStop } from '../src/fx/stage-uplight.js';
import { patchFaceMaterial } from '../src/actors/face-look.js';
import { lightingAt } from '../src/world/seasons.js';
import { castOf, troupeOf, troupeFiles, TROUPE, KOTONE, NIGHT_STAR, GUESTS, NAMES, LOCAL_NAMES, nameOf, member, avoidOf, singersWith, isGuest } from '../src/content/troupe.js';
import { DANCE_STYLES, CLUB_LOOPS } from '../src/content/kotone-club.js';
import { KOTONE_SONGS, showSongs, showSongsWith, songsFor } from '../src/content/kotone-songs.js';
import { catalogSongs } from '../src/content/song-catalog.js';
import { NIGHT_STAR_SHOW, nightStarState, nightStarSeen, markNightStarSeen, SEEN_KEY } from '../src/content/night-star.js';
import { STAGES } from '../src/content/stages.js';
import { singerList, loadShow, SHOW_KEY } from '../src/game/singplay/singplay.js';

const PUB = new URL('../public/', import.meta.url);
const json = f => JSON.parse(readFileSync(new URL(f, PUB), 'utf8'));
const song = KOTONE_SONGS[0];
const data = { beats: json(`${song.base}${song.id}.beats.json`), lyrics: json(`${song.base}${song.id}.lyrics.json`) };
const clock = createBeatClock(song, data);
const plan = (opts = {}) => planPerformance(song, clock, data.lyrics, opts);
const store = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };

test('the wash follows the sections (eased over a beat) and the pulse lands on the beat', () => {
  for (const s of clock.sections) {
    const mid = (s.t + s.e) / 2, w = washAt(clock, mid);
    assert.deepEqual(w.map(v => +v.toFixed(4)), [...(WASH[s.kind] || WASH.verse)].map(v => +v.toFixed(4)), `${s.kind} at ${mid.toFixed(1)} s`);
  }
  const s1 = clock.sections[1], prev = WASH[clock.sections[0].kind], now = WASH[s1.kind];
  const just = washAt(clock, s1.t + 0.01);
  assert.ok(Math.abs(just[0] - prev[0]) < 0.05, 'just past a section line: still mostly the old colour');
  const b0 = clock.beatTime(4), b1 = clock.beatTime(5);
  assert.ok(pulseAt(clock, b0 + 0.005) > 0.95, 'the pulse on the beat (a downbeat: 1.25)');
  assert.ok(pulseAt(clock, (b0 + b1) / 2) < pulseAt(clock, b0 + 0.005) * 0.2, 'decayed half way to the next beat');
  assert.equal(pulseAt(clock, -1), 0, 'nothing before the first beat');
  void now;
});

test('cues: a burst opens every chorus, fireworks and lasers only at night, lasers on dance songs or the last chorus', () => {
  const P = plan(), day = cuePlan(P, clock, { night: false }), night = cuePlan(P, clock, { night: true });
  const choruses = P.blocks.filter((b, i, a) => (b.kind === 'chorus' || b.kind === 'drop') && a[i - 1]?.section !== b.section);
  assert.ok(choruses.length >= 2, 'Golden Rails has choruses');
  for (const c of choruses) assert.ok(day.bursts.some(t => Math.abs(t - c.t0) < 1e-6), `a burst at ${c.t0.toFixed(1)} s`);
  assert.deepEqual(day.bursts, [...day.bursts].sort((a, b) => a - b), 'bursts in time order');
  assert.equal(day.fireworks, null); assert.deepEqual(day.lasers, []);
  assert.ok(night.fireworks && Math.abs(night.fireworks.t0 - choruses.at(-1).t0) < 1e-6 && night.fireworks.t1 > P.end, 'fireworks from the last chorus to the end');
  assert.equal(night.lasers.length, 1, 'a lively song: lasers on its last chorus only');
  const kpop = cuePlan(plan({ style: 'kpop' }), clock, { night: true });
  assert.equal(kpop.lasers.length, choruses.length, 'the K-pop dance style: every chorus');
  assert.ok(inWindows(kpop.lasers, kpop.lasers[0][0] + 0.1) && !inWindows(kpop.lasers, 0.5));
  // the particle slots: the newest burst of each slot that has started
  const t = night.bursts[1] + 0.5, sl = slotTimes(night.bursts, t);
  assert.equal(sl.length, SLOTS); assert.equal(sl[0], night.bursts[0]); assert.equal(sl[1], night.bursts[1]); assert.ok(sl[2] < -1e3);
});

test('what a device draws: Low with a group of 8 keeps inside the station budget (87 + 3 <= 91 draws)', () => {
  const all = showItems({ tier: 'high', night: 1, group: 8 });
  assert.deepEqual(Object.values(all).every(Boolean), true, 'PC at night: everything');
  assert.equal(showDraws(all), 6, 'six draws at most (lasers share the beams draw; fireworks only over the last chorus)');
  const day = showItems({ tier: 'low', night: 0, group: 4 });
  assert.ok(day.stage && day.particles && day.glow && !day.beams && !day.sticks && !day.fireworks, 'day: stage, glow, bursts (watchers clap)');
  const low8 = showItems({ tier: 'low', night: 1, group: 8 });
  assert.ok(low8.stage && low8.particles && low8.sticks && !low8.beams && !low8.glow && !low8.fireworks && !low8.lasers, 'Low + 8: the fill-heavy go first');
  assert.ok(87 + showDraws(low8) <= 91, `${87 + showDraws(low8)} draws at the station on Low with 8`);
  assert.ok(showDraws(showItems({ tier: 'low', night: 1, group: 4 })) <= 6);
  assert.equal(showDraws(showItems({ on: false, night: 1 })), 0, 'switched off: nothing');
  assert.ok(isShowNight(0.6) && !isShowNight(0.3));
  assert.ok(countsFor('low').beams <= 4 && countsFor('low').particles <= 200, 'phones: fewer beams and burst particles');
  assert.equal(typeof showDefault({ tier: 'low', strong: { ok: false } }), 'boolean');
});

test('the switch is remembered per device, else the default', () => {
  assert.equal(loadShow(store({ [SHOW_KEY]: '0' })), false);
  assert.equal(loadShow(store({ [SHOW_KEY]: '1' })), true);
  assert.equal(loadShow(store(), { tier: 'high' }), showDefault({ tier: 'high' }));
});

test('the stage set: budget, towers on uneven ground, a lens per beam', () => {
  for (const g of [null, { w: 4.5, depth: 0 }, { w: 6, depth: 1.8 }]) {
    const size = stageSize(g), S = buildStage(size, 0.3, -0.4, { beams: 6 });
    const tris = S.geometry.index.count / 3;
    assert.ok(tris <= 3200, `${tris} triangles (budget 3.2k: a 120-300 px prop)`);
    assert.equal(S.fixtures.length, 6); assert.equal(S.towers.length, 2);
    assert.ok(size.W >= (g?.w || 0) + 2, 'the towers stand outside the formation');
    assert.ok(size.back > (g?.depth || 0) / 2, 'the stage line behind the back row');
    const y = S.geometry.getAttribute('position'); let lo = Infinity; for (let i = 0; i < y.count; i++) lo = Math.min(lo, y.getY(i));
    assert.ok(Math.abs(lo + 0.4) < 0.05, 'a tower stands on its own ground (0.4 m lower on the right)');
    assert.equal(S.geometry.getAttribute('color').itemSize, 4, 'colour + material code in the vertices');
  }
});

test('a guest sings lead: the Night Star at the lead place, Kotone the front row source, one girl sits out', () => {
  assert.ok(isGuest(NIGHT_STAR) && member(NIGHT_STAR).file === 'vroid-nightstar');
  const c = castOf(NIGHT_STAR), lead = c.find(m => m.lead), kot = c.find(m => m.id === KOTONE);
  assert.equal(lead.id, NIGHT_STAR); assert.deepEqual([lead.x, lead.z, lead.row], [-0.75, 0.35, 0]);
  assert.equal(new Set(c.map(m => m.id)).size, 8, 'eight different people');
  assert.deepEqual(c.map(m => [m.x, m.z, m.row]), TROUPE.map(m => [m.x, m.z, m.row]), 'the same places (the room checks hold)');
  assert.ok(kot.row === 0 && kot.source && kot.pack === 'moves-kotone', 'Kotone in the front row, its source');
  assert.equal(troupeOf(4, NIGHT_STAR).length, 4);
  for (const n of [1, 4, 8]) {
    const f = troupeFiles(n, true, NIGHT_STAR);
    assert.ok(!f.some(x => x.startsWith('kotone') || x.startsWith('vroid-nightstar')), `${n}: her and Kotone's files are the mode's own`);
    assert.equal(f.length, n === 1 ? 0 : n === 4 ? 2 : 7, `${n}: the others' files`);
  }
  // names: Stella / 은하 / Tinh, used by no other singer
  assert.equal(nameOf(NIGHT_STAR, 'en'), 'Stella'); assert.equal(nameOf(NIGHT_STAR, 'ko'), '은하'); assert.equal(nameOf(NIGHT_STAR, 'vi'), 'Tinh');
  for (const L of [NAMES, LOCAL_NAMES.ko, LOCAL_NAMES.vi]) assert.equal(new Set(Object.values(L)).size, Object.values(L).length, 'no two singers share a name');
  assert.ok(!Object.values(LOCAL_NAMES.ko).includes('별'), "별 (Byeol) is the dance game's singer");
  // the Singer row: the eight until her show was seen
  assert.deepEqual(singerList(store()), singersWith([]));
  assert.ok(singerList(store({ [SEEN_KEY]: '1' })).includes(NIGHT_STAR));
  assert.ok(singerList(store(), new URLSearchParams('nightstar=1')).includes(NIGHT_STAR));
  const s = store(); assert.equal(nightStarSeen(s), false); markNightStarSeen(s); assert.equal(nightStarSeen(s), true);
});

test('her moves keep clear of her long dress: no kicks, jumps or wide steps in any style; others unchanged', () => {
  const avoid = avoidOf(NIGHT_STAR);
  assert.ok(avoid.includes('ClubJumpPoint') && avoid.includes('ClubKickBall'));
  for (const style of DANCE_STYLES) {
    const P = plan({ style, avoid });
    for (const b of P.blocks) assert.ok(!avoid.includes(b.clip), `${style}: ${b.clip} at ${b.t0.toFixed(1)} s`);
    for (const m of P.moments) assert.ok(!avoid.includes(m.clip), `${style}: moment ${m.clip}`);
    assert.ok(P.blocks.length > 4 && P.moments.some(m => m.id === 'bow'), `${style}: a whole performance with its bow`);
    // no avoid list: the plan is the one it always was
    assert.deepEqual(plan({ style }).summary, plan({ style, avoid: [] }).summary, `${style}: unchanged without a list`);
  }
  assert.ok(CLUB_LOOPS.some(d => !avoid.includes(d.clip) && d.styles.includes('cute')), 'the Cute set keeps loops for her');
  assert.equal(GUESTS.length, 1);
});

test('her song: one entry with singer "night-star" is all it takes; Kotone keeps hers', () => {
  const mine = { id: 'night-star-en', title: 'Night Star', base: 'songs/kotone/', bpm: 92, language: 'en', singer: NIGHT_STAR };
  assert.deepEqual(showSongs(KOTONE_SONGS, NIGHT_STAR, 'en').map(s => s.id), songsFor(KOTONE_SONGS, 'en').map(s => s.id), 'until hers is made: Golden Rails');
  const list = [...KOTONE_SONGS, mine];
  assert.deepEqual(showSongs(list, NIGHT_STAR, 'en').map(s => s.id), ['night-star-en'], 'hers once it is there');
  assert.ok(!showSongs(list, KOTONE, 'en').includes(mine), "Kotone's show never sings it");
  assert.ok(songsFor(list, 'en').includes(mine), "Sing & Play's Song row lists it for everyone");
});

test('her song from the song library: the catalog keeps `singer`, her show sings hers in the game language, else Golden Rails', () => {
  const INDEX = JSON.parse(readFileSync('tests/fixtures/songs-index.json', 'utf8')), BASE = 'http://127.0.0.1:4319/';
  const like = INDEX.songs.find(s => s.id === 'wake-up-new-day');
  const entry = (id, lang, extra = {}) => ({ ...like, id, lang, title: id, mood: 'dreamy glowing electro-pop', style: 'mix', bpm: 102, base: `songs/${id}/`,
    files: Object.fromEntries(['audio', 'beats', 'lyrics', 'mouth'].map(k => [k, `${id}.1a2b3c4d.${k === 'audio' ? 'm4a' : `${k}.json`}`])), ...extra });
  const index = { ...INDEX, songs: [...INDEX.songs, entry('night-star-en', 'en', { singer: NIGHT_STAR }), entry('night-star-vi', 'vi', { singer: NIGHT_STAR }), entry('odd-owner', 'en', { singer: '../x' })] };
  const lib = catalogSongs(index, BASE);
  assert.equal(lib.find(s => s.id === 'night-star-vi')?.singer, NIGHT_STAR, 'the catalog entry keeps whose song it is');
  assert.equal(lib.find(s => s.id === 'odd-owner')?.singer, undefined, 'a bad singer id is dropped');
  assert.equal(lib.find(s => s.id === 'wake-up-new-day')?.singer, undefined);
  for (const [lang, want] of [['en', 'night-star-en'], ['vi', 'night-star-vi'], ['ko', 'night-star-en'], ['ja', 'night-star-en']]) {
    assert.deepEqual(showSongsWith(KOTONE_SONGS, lib, NIGHT_STAR, lang).map(s => s.id), [want], `her show in ${lang}`);
  }
  const hers = showSongsWith(KOTONE_SONGS, lib, NIGHT_STAR, 'en')[0];
  assert.equal(hers.base, `${BASE}songs/night-star-en/`); assert.equal(hers.audio, 'night-star-en.1a2b3c4d.m4a'); assert.equal(hers.remote, true);
  assert.ok(!showSongsWith(KOTONE_SONGS, lib, KOTONE, 'en').some(s => s.singer), "Kotone's show never sings it");
  assert.deepEqual(showSongsWith(KOTONE_SONGS, null, NIGHT_STAR, 'vi').map(s => s.id), ['golden-rails-vi'], 'no catalog (offline, ?qa): Golden Rails');
  assert.deepEqual(showSongsWith(KOTONE_SONGS, catalogSongs(INDEX, BASE), NIGHT_STAR, 'en').map(s => s.id), ['golden-rails-en'], 'a catalog without hers: Golden Rails');
});

test('the Night Star is there only on starry nights near the shrine, at the Shrine yard stage', () => {
  const shrine = STAGES.find(s => s.id === 'shrine');
  assert.equal(NIGHT_STAR_SHOW.x, shrine.x); assert.equal(NIGHT_STAR_SHOW.z, shrine.z);
  assert.ok(Math.abs(Math.cos(NIGHT_STAR_SHOW.facing - shrine.facing) - 1) < 1e-9, 'she faces the torii: the cameras in the open yard, the shrine hall behind her');
  assert.equal(nightStarState({ night: 0, dist: 5 }), 'gone', 'not by day');
  assert.equal(nightStarState({ night: 1, dist: 5, open: false }), 'gone', 'not before the shrine stairs open');
  assert.equal(nightStarState({ night: 1, dist: 5, indoors: true }), 'gone');
  assert.equal(nightStarState({ night: 1, dist: 60 }), 'near', 'her files load from 70 m');
  assert.equal(nightStarState({ night: 1, dist: 20 }), 'here');
  assert.equal(nightStarState({ night: 1, dist: 200 }), 'gone');
  assert.equal(nightStarState({ night: 1, dist: 20, free: false }), 'here', 'a dialogue does not make her vanish');
});

test('the stage light: the lit area holds the formation, footlights in front, the set within its budget', () => {
  for (const n of [1, 4, 8]) {
    const cast = troupeOf(n), xs = cast.map(m => m.x), zs = cast.map(m => m.z);
    const group = n > 1 ? { w: Math.max(...xs) - Math.min(...xs), depth: Math.max(...zs) - Math.min(...zs) } : null;
    const a = stageArea(group);
    // every member inside the box (the frame's z = 0 is the front row's line; a solo stands at the centre)
    for (const m of n > 1 ? cast : [{ x: 0, z: 0 }]) {
      assert.ok(Math.abs(m.x) <= a.halfW - 0.5, `${n}: ${m.x} across inside ${a.halfW}`);
      assert.ok(m.z <= a.front - 0.3 && m.z >= a.back + 0.3, `${n}: ${m.z} front to back inside ${a.back}..${a.front}`);
    }
    assert.ok(a.foot > Math.max(0, ...(n > 1 ? zs : [0])) + 0.8, `${n}: the footlights a metre in front of the front-most`);
    const F = footlightSpots(a);
    assert.ok(F.length >= 3 && F.length <= 9, `${n}: ${F.length} footlights`);
    assert.ok(F.every(([x, z]) => Math.abs(x) <= a.halfW && z === a.foot), `${n}: on one line across the stage front`);
    const S = buildStage(stageSize(group), 0.3, -0.4, { beams: 6, foot: F.map(([x, z]) => [x, -0.2, z]) });
    const tris = S.geometry.index.count / 3;
    assert.ok(tris <= 3200, `${n}: ${tris} triangles with ${F.length} footlights (budget 3.2k)`);
    const code = S.geometry.getAttribute('color'); let lens = 0; for (let i = 0; i < code.count; i++) if (Math.abs(code.getW(i) - 0.25) < 1e-6) lens++;
    assert.equal(lens, F.length * 24, `${n}: a glowing lens (one box) per footlight`);
  }
});

test('the stage light: one patch in the shader, its hooks kept, uniforms only, night only, one show at a time', () => {
  // the VRoid atlas material: face-look first (assets.js), then the stage light; the program key keeps both
  const m = new THREE.MeshStandardMaterial({ alphaTest: 0.5 });
  patchFaceMaterial(m); patchUplight(m); patchUplight(m);
  assert.match(m.customProgramCacheKey(), /\|face-look\|uplight$/, 'the program key composed once');
  const sh = { uniforms: THREE.UniformsUtils.clone(THREE.ShaderLib.standard.uniforms), vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  m.onBeforeCompile(sh, null);
  assert.ok(sh.fragmentShader.includes('vFace') && sh.fragmentShader.includes('upE *= 1.0 + uUpK.w * vFace'), 'faces a little brighter (the face mask)');
  assert.equal(sh.fragmentShader.split('reflectedLight.directDiffuse += upA').length, 2, 'the term added once');
  assert.ok(!/#define\s+UP|#ifdef\s+UP/.test(sh.fragmentShader), 'no defines: switched by uniforms only (no recompiles)');
  assert.ok(!/uUp|upW/.test(sh.vertexShader), "nothing added to the vertex shader (no varyings: three's own vViewPosition and normal)");
  for (const k of Object.keys(UPLIGHT)) assert.equal(sh.uniforms[k], UPLIGHT[k], `${k} shared by reference`);
  // an unlit material (no lights chunk) is left alone
  const basic = { uniforms: {}, fragmentShader: THREE.ShaderLib.basic.fragmentShader };
  uplightShader(basic); assert.equal(basic.fragmentShader, THREE.ShaderLib.basic.fragmentShader);
  // night only: exactly 0 from morning through the end of sunset (the sun on the horizon at 19:00), full at real night
  // (owner 2026-11-28: by day the light made every performer too bright)
  const nightAt = h => lightingAt('spring', h).night;
  for (const h of [5.6, 6, 8, 12.5, 15, 17.2, 18, 18.4, 18.7, 18.95, 19]) assert.equal(uplightNight(nightAt(h)), 0, `no stage light at ${h}:00`);
  assert.ok(uplightNight(nightAt(19.6)) > 0.3 && uplightNight(nightAt(19.6)) < 0.9, 'it comes in after the sun is down');
  for (const h of [20.5, 21, 23, 2, 4.8]) assert.equal(uplightNight(nightAt(h)), 1, `full at ${h}:00`);
  assert.equal(uplightNight(0), 0); assert.equal(uplightNight(1), 1);
  // the show that started last owns the light; another's updates and stops leave it alone
  const A = {}, B = {}, K = UPLIGHT.uUpK.value, wash = new THREE.Color(1, 0.24, 0.6);
  uplightStart(A, { x: 1, y: 2, z: 3, facing: Math.PI / 2, tilt: [0.1, 0], area: stageArea(null) });
  assert.ok(Math.abs(UPLIGHT.uUpF.value.x - 1) < 1e-9 && Math.abs(UPLIGHT.uUpF.value.y) < 1e-9, 'forward on the ground from the facing');
  assert.ok(uplightUpdate(A, 1, wash, 0.5, 1) > 0.99 && K.x > 2 && K.y > 0.3 && K.z > 1, 'on at night');
  assert.equal(uplightUpdate(B, 0, wash), 0); assert.ok(K.x > 2, "another show's update leaves it");
  uplightStop(B); assert.ok(K.x > 2, "another show's stop leaves it");
  assert.equal(uplightUpdate(A, 0, wash), 0); assert.equal(K.x + K.y + K.z, 0, 'faded out: every term 0 (the branch skipped)');
  uplightStop(A); assert.equal(uplightUpdate(A, 1, wash), 0, 'stopped: no longer its light');
  assert.ok(UP.key > UP.fill, 'the key (footlights) leads, the fill only lifts');
});
