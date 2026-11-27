// Kotone's song performance (game/perform/): the beat clock, the plan of a whole song (sets on bar lines by section,
// singing with the mic on vocal lines, the moments), the mic layer's timing and the hand mic's size.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBeatClock, beatRate } from '../src/game/perform/beat-clock.js';
import { planPerformance, blockAt, micShown, songKind } from '../src/game/perform/plan.js';
import { vocalLines, leadTarget, micClipFor } from '../src/game/perform/mic-layer.js';
import { micGeometry } from '../src/game/perform/mic-prop.js';
import { CLUB_LOOPS, MOMENTS, PERFORM_CLIPS } from '../src/content/kotone-club.js';
import { KOTONE_SONGS, songFromParam } from '../src/content/kotone-songs.js';
import { nextAct } from '../src/game/kotone-show.js';

// a 100 BPM song (2.4 s bars): intro 4 bars, verse 8, pre 4, chorus 8, verse 8, pre 4, chorus 8, bridge 8, chorus 8, outro 6
const BAR = 2.4, song = { id: 'test-song', bpm: 100, offset: 0, duration: 66 * BAR, mood: 'uplifting' };
const parts = [['intro', 4], ['verse', 8], ['pre', 4], ['chorus', 8], ['verse', 8], ['pre', 4], ['chorus', 8], ['bridge', 8], ['chorus', 8], ['outro', 6]];
const sections = []; let at = 0; for (const [kind, n] of parts) { sections.push({ t: at * BAR, e: (at + n) * BAR, kind, name: kind }); at += n; }
// sung: two lines per 4 bars in verses, pre-choruses and choruses (none in the intro, bridge or outro)
const lines = []; for (const s of sections) if (/verse|pre|chorus/.test(s.kind)) for (let t = s.t + .2; t < s.e - 1; t += BAR * 2) lines.push({ t, e: t + BAR * 1.5, text: 'la la', section: s.kind === 'pre' ? 'Pre-Chorus' : s.kind[0].toUpperCase() + s.kind.slice(1) });
const lyrics = { version: 1, lines };
const clock = createBeatClock(song, { sections, lyrics });
const plan = planPerformance(song, clock, lyrics);
const loop = id => CLUB_LOOPS.find(d => d.clip === id);
const TIER = { calm: 0, mid: 1, big: 2 };

test('the clock: bars and sections from bpm + offset; beat sync keeps loops near their own speed', () => {
  assert.equal(clock.info.bpm, 100);
  assert.ok(Math.abs(clock.barAt(BAR * 12) - 12) < 1e-9);
  assert.equal(clock.sectionAt(BAR * 17).kind, 'chorus');
  assert.equal(beatRate(100, 120).m, 1);                    // 0.83x
  assert.equal(beatRate(68, 120, { calm: true }).m, 1);     // a ballad never doubles
  assert.equal(beatRate(68, 120).m, 2);                     // a lively song may step twice a loop beat (1.13x)
  assert.equal(beatRate(160, 120).m, .5);                   // 1.33 is outside: half time 0.67 is the slower side
  assert.equal(songKind({ mood: 'tender' }), 'tender');
});

test('the plan is the same every time for a song, and another song gets another one', () => {
  assert.deepEqual(planPerformance(song, clock, lyrics).summary, plan.summary);
  const other = planPerformance({ ...song, id: 'another' }, clock, lyrics);
  assert.notDeepEqual(other.blocks.map(b => b.clip), plan.blocks.map(b => b.clip));
});

test('dance sets change on bar lines at every section and every 8 bars, never the same twice in a row', () => {
  for (let i = 0; i < plan.blocks.length; i++) {
    const b = plan.blocks[i];
    assert.ok(Number.isInteger(b.b0) && Number.isInteger(b.b1) && b.b1 > b.b0 && b.b1 - b.b0 <= 9, `block ${i}`);
    if (i) { assert.equal(b.b0, plan.blocks[i - 1].b1, 'blocks tile the song'); assert.notEqual(b.clip, plan.blocks[i - 1].clip); }
  }
  for (const s of sections) assert.ok(plan.blocks.some(b => Math.abs(b.t0 - s.t) < 1e-6), `a set starts with ${s.kind} at ${s.t}`);
  assert.equal(blockAt(plan, 0), 0);
});

test('energy follows the song: choruses above the verses, the final chorus the biggest; sung parts groove under the mic', () => {
  const tier = k => plan.blocks.filter(b => b.kind === k).map(b => TIER[b.tier]);
  assert.ok(Math.min(...tier('chorus')) > Math.max(...tier('verse')));
  assert.equal(TIER[plan.blocks.findLast(b => b.kind === 'chorus').tier], 2);
  for (const b of plan.blocks) {
    const d = loop(b.clip); assert.ok(d, b.clip);
    if (b.mic) assert.ok(!d.contact, `${b.clip}: no claps with the mic in her hand`);
    if (b.sung && b.kind === 'verse') assert.ok(d.groove, `${b.clip}: a light groove under a sung verse`);
  }
  const kinds = new Set(plan.blocks.map(b => b.clip)); assert.ok(kinds.size >= 6, `${kinds.size} different dances`);
});

test('the mic is in her hand over every sung line and not in the long instrumental parts', () => {
  for (const l of lines) for (const t of [l.t, (l.t + l.e) / 2, l.e]) assert.equal(micShown(plan, t), 1, `mic at ${t}`);
  assert.equal(micShown(plan, BAR * 1), 0, 'intro: free hands');
  assert.equal(micShown(plan, BAR * 48), 0, 'middle of the bridge');
  assert.equal(micShown(plan, BAR * 64), 0, 'end of the outro');
  const L = vocalLines(lyrics);
  assert.equal(leadTarget(L, lines[0].t - .3), 1, 'the mic comes up before the line');
  assert.equal(leadTarget(L, BAR * 51), 0);
  assert.equal(micClipFor(L, lines[0].t + .5), 'MicSway');
  const ch = lines.findIndex(l => l.section === 'Chorus');
  assert.ok(['MicPunch', 'MicWave'].includes(micClipFor(L, lines[ch].t + .5)));
});

test('moments: a clap hop into each chorus with free hands, a wave in the bridge, a cheer and a bow at the end, never on a sung line', () => {
  const ids = plan.moments.map(m => m.id);
  assert.ok(ids.includes('wave') && ids.includes('cheer') && ids.at(-1) === 'bow', ids.join(','));
  for (const m of plan.moments) {
    assert.ok(PERFORM_CLIPS.includes(m.clip), m.clip);
    assert.equal(m.clip, MOMENTS[m.id][m.mic ? 1 : 0]);
    for (const l of lines) assert.ok(m.t1 <= l.t - .3 || m.t0 >= l.e + .3, `${m.id} at ${m.t0} clear of the line at ${l.t}`);
  }
  const bow = plan.moments.find(m => m.id === 'bow'); assert.equal(bow.b1, plan.lastBar);
});

test('the hand mic is small (one mesh, a few hundred triangles); the songs list and the test hook', () => {
  const g = micGeometry(), tris = g.attributes.position.count / 3;
  assert.ok(tris < 600, `${tris} triangles`);
  g.computeBoundingBox(); assert.ok(g.boundingBox.max.y - g.boundingBox.min.y < .22);
  assert.ok(Array.isArray(KOTONE_SONGS));
  assert.deepEqual(songFromParam('songs/test/abc'), { id: 'abc', base: 'songs/test/', audio: 'abc.m4a', meta: 'abc.song.json' });
  assert.equal(songFromParam('https://x.example/a'), null);
});

test('with a song the show performs it after a rest, then two numbers before the next', () => {
  const st = {}, kinds = [];
  for (let i = 0; i < 24; i++) { const a = nextAct(st, () => .9, 1); st.last = a.kind; kinds.push(a.kind); }
  assert.equal(kinds[0], 'song');
  const songs = kinds.flatMap((k, i) => (k === 'song' ? [i] : []));
  assert.ok(songs.length >= 3, kinds.join(' '));
  for (let i = 1; i < songs.length; i++) assert.ok(kinds.slice(songs[i - 1] + 1, songs[i]).filter(k => k === 'dance').length >= 1);
  assert.ok(!kinds.includes('sing'), 'the old Sing number is not used with songs');
});

test('order: no turning or jumping loop under the mic; stances that differ cross-fade over two beats', async () => {
  const { STANCE } = await import('../src/content/kotone-club-fit.js');
  const { stanceGap, PLAN } = await import('../src/game/perform/plan.js');
  for (const b of plan.blocks) {
    if (b.sung) { const s = STANCE[b.clip]; assert.ok(s.hipYaw <= PLAN.singTurn && s.chestYaw <= PLAN.singTurn && s.lift <= PLAN.singLift, `${b.clip} under the mic`); }
  }
  for (let i = 1; i < plan.blocks.length; i++) {
    const a = plan.blocks[i - 1], b = plan.blocks[i];
    assert.equal(b.fade, stanceGap(a.clip, b.clip) > PLAN.sameStance ? 2 : 1, `${a.clip} -> ${b.clip}`);
  }
  for (const m of plan.moments) assert.ok(m.fade === 1 || m.fade === 2);
});
