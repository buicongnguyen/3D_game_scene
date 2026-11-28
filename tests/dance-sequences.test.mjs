// © 2026 Bui Cong Nguyen · solluxlabs.com
// Dance sequences in Sing & Play (content/dance-sequences.js, game/perform/plan.js sequenceBlocks, docs/SING-AND-PLAY.md
// "Dance sequences"): the rounds laid back from a section's end, the lead's limits (no floor work, a calm torso under a sung
// line, free hands with the mic), the back row's own round (shifted, floor work only on level ground), Breaking's freeze,
// each take at its own tempo on the song's beat, the packs and the clips the bake kept, and the Dance picker's tiles.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBeatClock } from '../src/game/perform/beat-clock.js';
import { planPerformance, planBacking, hasClip, clipRate, clipTiming, sequenceBlocks, stanceGap, PLAN } from '../src/game/perform/plan.js';
import { freezeDelay } from '../src/game/perform/performer.js';
import { SEQUENCES, SEQ_TAKES, SEQ_STYLES, SEQ_DROPPED, sequenceStep, rowStep, rockStep, isSequence, seqPacks, styleClips, isFloorClip } from '../src/content/dance-sequences.js';
import { SEQ_FIT } from '../src/content/dance-seq-fit.js';
import { CLUB_LOOPS, DANCE_STYLES, micSetFor, momentsFor } from '../src/content/kotone-club.js';
import { floorOk, FLOOR_SLOPE } from '../src/game/singplay/flat.js';
import { pickerData, DANCE_PICKS, DANCE_LABELS, DANCE_ROUNDS, DANCE_AUTO } from '../src/game/singplay/pickers.js';
import { avoidOf, NIGHT_STAR, DRESS } from '../src/content/troupe.js';
import { CONTRACTS } from './asset-contracts.mjs';

// the test song of kotone-perform / troupe tests: 100 BPM, intro 4, verse 8, pre 4, chorus 8, ..., outro 6
const BAR = 2.4, song = { id: 'test-song', bpm: 100, offset: 0, duration: 66 * BAR, mood: 'uplifting' };
const parts = [['intro', 4], ['verse', 8], ['pre', 4], ['chorus', 8], ['verse', 8], ['pre', 4], ['chorus', 8], ['bridge', 8], ['chorus', 8], ['outro', 6]];
const sections = []; let at = 0; for (const [kind, n] of parts) { sections.push({ t: at * BAR, e: (at + n) * BAR, kind, name: kind }); at += n; }
const lines = []; for (const s of sections) if (/verse|pre|chorus/.test(s.kind)) for (let t = s.t + .2; t < s.e - 1; t += BAR * 2) lines.push({ t, e: t + BAR * 1.5, text: 'la la', section: s.kind === 'pre' ? 'Pre-Chorus' : s.kind[0].toUpperCase() + s.kind.slice(1) });
const lyrics = { version: 1, lines };
const clock = createBeatClock(song, { sections, lyrics });
const plans = Object.fromEntries(SEQ_STYLES.map(s => [s, planPerformance(song, clock, lyrics, { style: s })]));
// the Avatar Studio's legacy clip names (src/motion-provenance.js LEGACY_MOTION_NAMES, move-library.js KEPT_LEGACY): never used
const LEGACY = ['Bow', 'Cheer', 'Clap', 'CrowdWave', 'DanceBow', 'DanceIdle', 'FanUp', 'Flourish', 'HatTilt', 'HeartHands', 'Idle', 'JumpClap', 'KpopIdle', 'MicRaise',
  'MocapCharleston', 'MocapCrouch', 'MocapCurtsey', 'MocapHop', 'MocapIdle', 'MocapJog', 'MocapJump', 'MocapJumpForward', 'MocapJumpLoop', 'MocapLookAround', 'MocapMacarena',
  'MocapModernDance', 'MocapRun', 'MocapSalsa', 'MocapSitDown', 'MocapSitIdle', 'MocapSkip', 'MocapStandUp', 'MocapStretch', 'MocapTalk', 'MocapTurnLeft', 'MocapTwist',
  'MocapWalk', 'MocapWave', 'PointStep', 'PowerPose', 'Run', 'SideL', 'SideR', 'SingIdle', 'SingReach', 'SlideL', 'SlideR', 'Spin', 'StickWave', 'SweepL', 'SweepR', 'Talk', 'Turn', 'Walk', 'Wave'];

test('the sequences: every step names takes the bake kept or Club loops; packs and contracts per style; no legacy clip', () => {
  assert.deepEqual(SEQ_STYLES, ['breaking', 'capoeira', 'popping', 'classics', 'latin', 'soul']);
  for (const style of SEQ_STYLES) {
    const sq = SEQUENCES[style];
    assert.equal(sq.bars, sq.steps.reduce((n, s) => n + s.bars, 0));
    assert.ok(DANCE_STYLES.includes(style) && DANCE_STYLES.includes(sq.like) && !isSequence(sq.like), `${style}: a Dance choice, borrowing ${sq.like}`);
    for (const st of sq.steps) for (const id of st.ids) {
      assert.ok(SEQ_TAKES[id] || CLUB_LOOPS.some(d => d.clip === id), `${style}: ${id} is a take or a Club loop`);
      assert.ok(!LEGACY.includes(id) && !/_Old$|Classic/.test(id), `${style}: ${id} is no legacy clip`);
      if (st.floor) assert.ok(isFloorClip(id), `${style}: a floor step names floor takes (${id})`);
    }
    assert.ok(rockStep(sq) && !rockStep(sq).floor, `${style}: a standing step for whoever may not go down`);
    // the front row (Kotone's rig) keeps a standing take of every step or a Club loop; the back row (nam-1) too
    for (const rig of ['kotone', 'nam1']) for (const st of sq.steps.filter(x => !x.floor)) assert.ok(st.ids.some(id => hasClip(id, rig)) || sq.steps.some(x => !x.floor && x.ids.some(id => hasClip(id, rig))), `${style} ${st.part}: ${rig}`);
    const [front, back] = seqPacks(style);
    assert.equal(front, `moves-seq-${style}-kotone`); assert.equal(back, `moves-seq-${style}-nam1`);
    assert.ok(CONTRACTS[front] && CONTRACTS[back], `${style}: both packs under contract`);
    assert.deepEqual(CONTRACTS[front].clips, styleClips(style).filter(id => hasClip(id, 'kotone')), `${front}: the clips Kotone keeps`);
    assert.deepEqual(CONTRACTS[back].clips, styleClips(style).filter(id => hasClip(id, 'nam1')), `${back}: the clips nam-1 keeps`);
  }
  // floor work is the back row's only: never in Kotone's packs
  for (const [id, f] of Object.entries(SEQ_FIT)) { if (isFloorClip(id)) assert.deepEqual(f.rigs, ['nam1'], id); assert.ok(SEQ_TAKES[id], id); }
  for (const [id, t] of Object.entries(SEQ_TAKES)) assert.ok(SEQ_FIT[id]?.rigs.length, `${id}: kept by a body (else it belongs in SEQ_DROPPED)`);
  // a take that breaks a joint rule on a body copying its rig is left out of every routine that body dances
  const front = ['vroid-nu3', 'vroid-nu5', 'vroid-nu4'], back = ['vroid-nu1', 'vroid-nam3', 'vroid-nam2'];
  for (const style of SEQ_STYLES) {
    const P = planPerformance(song, clock, lyrics, { style, bodies: front }), B = planBacking(P, { noContact: true, bodies: back });
    for (const b of P.blocks) assert.ok(!SEQ_FIT[b.clip]?.fails?.kotone?.some(f => front.includes(f)), `${style}: ${b.clip} breaks a rule on the front row`);
    for (const b of B.blocks) assert.ok(!SEQ_FIT[b.clip]?.fails?.nam1?.some(f => back.includes(f)), `${style}: ${b.clip} breaks a rule on the back row`);
  }
  assert.ok(Object.keys(SEQ_DROPPED).length >= 5);
});

test('a round is laid back from the section end; a row ahead keeps its own bars', () => {
  const s = SEQUENCES.breaking;   // ready 1, top rock 2, footwork 3, power 2
  const at = (n, b, a = 0) => rowStep(s, b, a, n);
  assert.equal(at(8, 7).step.part, 'power', 'an 8-bar section ends on the power move');
  assert.equal(at(8, 0).step.part, 'ready');
  assert.equal(at(4, 0).step.part, 'footwork', 'a 4-bar section plays the round\'s end');
  assert.equal(at(4, 3).step.part, 'power');
  assert.equal(at(12, 11).step.part, 'power');
  assert.equal(sequenceStep(s, 0).step.part, 'ready', 'no section length: from the round\'s start');
  // popping, the back row 2 bars on: another step than the front at the same bar, the same bar lines
  const p = SEQUENCES.popping;
  for (let b = 0; b < 8; b++) assert.notEqual(rowStep(p, b, 2, 8).index, rowStep(p, b, 0, 8).index, `bar ${b}`);
  assert.deepEqual([0, 2, 4, 6].map(b => rowStep(p, b, 2, 8).startBar), [0, 2, 4, 6]);
});

test('the lead in a sequence: whole sections in steps, no floor work, calm under sung lines, free hands with the mic, takes she has', () => {
  for (const [style, P] of Object.entries(plans)) {
    assert.equal(P.style, style);
    assert.deepEqual(planPerformance(song, clock, lyrics, { style }).summary, P.summary, `${style}: deterministic`);
    for (const s of P.sections) {
      const bs = P.blocks.filter(b => b.section === s.index);
      assert.equal(bs[0].b0, s.b0, `${style}: section ${s.index} starts with a step`); assert.equal(bs.at(-1).b1, s.b1);
      for (let i = 1; i < bs.length; i++) assert.equal(bs[i].b0, bs[i - 1].b1, `${style}: steps back to back`);
    }
    for (const b of P.blocks) {
      assert.ok(!b.floor && !isFloorClip(b.clip), `${style}: the lead stands (${b.clip})`);
      assert.ok(hasClip(b.clip, 'kotone'), `${style}: ${b.clip} is in Kotone's packs`);
      assert.ok(b.seq && Number.isFinite(b.m) && b.rate > 0, `${style}: a step with its own rate`);
      const f = clipTiming(b.clip);
      if (f) assert.ok(b.rate <= (f.maxRate?.kotone ?? 1.2) + 1e-6, `${style}: ${b.clip} never faster than its joints pass (${b.rate})`);
      if (b.sung && f) assert.ok(f.stance.hipYaw <= PLAN.singTurn && f.stance.chestYaw <= PLAN.singTurn && f.stance.lift <= PLAN.singLift, `${style}: calm under a sung line (${b.clip})`);
      if (b.mic) assert.ok(!(f?.stance.handGap < PLAN.contactGap) && !CLUB_LOOPS.find(d => d.clip === b.clip)?.contact, `${style}: no hand contact with the mic (${b.clip})`);
    }
    assert.deepEqual(P.mic, micSetFor(SEQUENCES[style].like), `${style}: the mic moves it borrows`);
    for (const m of P.moments) assert.equal(m.clip, momentsFor(SEQUENCES[style].like)[m.id][m.mic ? 1 : 0]);
    // between her lines the round's own dances; under them (the mic) its calm in-place takes or the style's groove loops
    const own = new Set(SEQUENCES[style].steps.flatMap(x => x.ids)), free = P.blocks.filter(b => !b.sung);
    assert.ok(free.filter(b => own.has(b.clip)).length >= free.length * .7, `${style}: the round's own dances between her lines`);
    assert.ok(P.blocks.some(b => SEQ_TAKES[b.clip]), `${style}: its own takes`);
  }
  // Breaking: every section of 4 bars or more ends frozen
  for (const s of plans.breaking.sections) { const last = plans.breaking.blocks.filter(b => b.section === s.index).at(-1); assert.equal(Boolean(last.freeze), s.b1 - s.b0 >= PLAN.freezeMin, `section ${s.index}`); }
  assert.ok(!Object.entries(plans).some(([s, P]) => s !== 'breaking' && P.blocks.some(b => b.freeze)), 'only Breaking freezes');
});

test('the back row: its own round, floor work only where allowed, shifted where the style says, no moment over the floor', () => {
  for (const [style, P] of Object.entries(plans)) {
    const sq = SEQUENCES[style], back = planBacking(P, { noContact: true }), flat = planBacking(P, { noContact: true, floor: false });
    assert.deepEqual(planBacking(P, { noContact: true }).summary, back.summary, `${style}: deterministic`);
    assert.equal(back.blocks[0].b0, P.blocks[0].b0); assert.equal(back.blocks.at(-1).b1, P.blocks.at(-1).b1);
    for (const b of back.blocks) {
      assert.ok(hasClip(b.clip, 'nam1'), `${style}: ${b.clip} in nam-1's packs`);
      assert.equal(b.mic, false);
      assert.ok(!(SEQ_FIT[b.clip]?.stance.handGap < PLAN.contactGap) && !CLUB_LOOPS.find(d => d.clip === b.clip)?.contact, `${style}: no hand contact for the followers (${b.clip})`);
    }
    for (const b of flat.blocks) assert.ok(!b.floor && !isFloorClip(b.clip), `${style}: no floor work on a slope (${b.clip})`);
    const own = new Set(sq.steps.flatMap(x => x.ids));
    assert.ok(back.blocks.filter(b => own.has(b.clip)).length >= back.blocks.length * .8, `${style}: the back row dances the round`);
    for (const m of back.moments) assert.ok(!back.blocks.some(b => b.floor && m.b0 < b.b1 && m.b1 > b.b0), `${style}: no ${m.id} over floor work`);
    const floors = back.blocks.filter(b => b.floor).length;
    if (sq.steps.some(s => s.floor)) assert.ok(floors >= 4, `${style}: the back row goes down to the floor (${floors} blocks)`);
    else assert.equal(floors, 0);
    // a shifted style: the rows play other steps; an unshifted one: the same steps (the cypher: floor work behind the front's top rock)
    const stepAt = (Q, bar) => Q.blocks.find(b => b.b0 <= bar && bar < b.b1)?.seq.step;
    const differ = Array.from({ length: P.lastBar }, (_, bar) => stepAt(P, bar) !== stepAt(back, bar)).filter(Boolean).length;
    if (sq.backShift) assert.ok(differ > P.lastBar / 2, `${style}: shifted (${differ} of ${P.lastBar} bars)`);
    else assert.equal(differ, 0, `${style}: in step with the front`);
    for (let i = 1; i < back.blocks.length; i++) { const a = back.blocks[i - 1], b = back.blocks[i]; if (isFloorClip(a.clip) !== isFloorClip(b.clip)) assert.equal(b.fade, PLAN.floorFadeBeats, `${style}: two beats into or out of the floor`); }
  }
  // the cypher: the back row goes down in every other section (the 2nd, 4th, ...), and there its freeze is the power move
  const bb = planBacking(plans.breaking, { noContact: true });
  assert.ok(bb.blocks.every(b => !b.floor || b.section % 2 === 1), 'floor work in every other section');
  assert.ok(bb.blocks.filter(b => b.freeze && b.section % 2 === 1).every(b => b.floor), 'the back row freezes in its power move');
  // a take that goes on into the next block runs on (no restart): it counts from where it began
  for (const P of [plans.breaking, bb]) for (let i = 1; i < P.blocks.length; i++) { const a = P.blocks[i - 1], b = P.blocks[i];
    if (a.clip === b.clip) { assert.equal(b.from, a.from ?? a.b0, `${b.clip} at bar ${b.b0} goes on`); assert.equal(b.m, a.m); if (a.freeze) assert.ok(b.after); } else assert.equal(b.from, undefined); }
});

test('takes at their own tempo: the song\'s beat, the eighth grid never doubled, never faster than their joints pass', () => {
  for (const [id, f] of Object.entries(SEQ_FIT)) {
    assert.ok(f.bpm >= 70 && f.bpm <= 180 && f.beat > 0 && f.loop > 0 && f.beats >= 4, id);
    assert.ok(Math.abs(f.loop - f.beats * f.beat) < .07, `${id}: the loop is whole beats (${f.loop} s, ${f.beats} x ${f.beat})`);
    for (const bpm of [70, 92, 100, 118, 128, 140, 160]) for (const rig of f.rigs) {
      const r = clipRate(id, bpm, { rig });
      assert.ok(r.rate <= (f.maxRate[rig] ?? 1.2) + 1e-9, `${id} at ${bpm}: ${r.rate}`);
      if (f.grid === 'eighth') assert.ok(r.m <= 1, `${id}: no double time on the eighth grid`);
    }
  }
  assert.equal(clipRate('ClubTopRock', 100), null, 'a Club loop: the plan\'s own rate');
  assert.ok(stanceGap('SeqBrkReady', 'SeqBrkReady') < 1e-9);
});

test('the freeze: eased into a stop, held through the last beat, then on from there', () => {
  const hold = { end: 32, ramp: .5 };
  assert.equal(freezeDelay(30, hold), 0);
  assert.ok(Math.abs(freezeDelay(31, hold) - .25) < 1e-9, 'half the ramp lost by the hold\'s start');
  assert.ok(Math.abs((31.5 - freezeDelay(31.5, hold)) - (31 - freezeDelay(31, hold))) < 1e-9, 'held');
  assert.ok(Math.abs((32 - freezeDelay(32, hold)) - (31 - freezeDelay(31, hold))) < 1e-9, 'held to the end');
  let prev = -1; for (let b = 29; b < 34; b += .01) { const x = b - freezeDelay(b, hold); assert.ok(x >= prev - 1e-9, 'never backwards'); prev = x; }
  assert.equal(freezeDelay(5, null), 0);
});

test('floor work needs level ground: a hillside stage keeps the back row standing', () => {
  const spots = [{ x: -2.25, z: -2.15 }, { x: -.75, z: -2.15 }, { x: 2.25, z: -2.15 }];
  const env = deg => ({ room: null, heightAt: (x, z) => -z * Math.tan(deg * Math.PI / 180) });
  assert.equal(floorOk({ x: 0, z: 0 }, 0, spots, env(0)), true);
  assert.equal(floorOk({ x: 0, z: 0 }, 0, spots, env(FLOOR_SLOPE - .5)), true);
  assert.equal(floorOk({ x: 0, z: 0 }, 0, spots, env(FLOOR_SLOPE + 1)), false);
  assert.equal(floorOk({ x: 0, z: 0 }, 0, spots, { room: { min: {}, max: {} }, heightAt: () => 0 }), true, 'a room is level');
});

test('the Night Star in a sequence style: her avoid list holds, she still dances every step', () => {
  const avoid = avoidOf(NIGHT_STAR);
  for (const style of SEQ_STYLES) {
    const P = planPerformance(song, clock, lyrics, { style, avoid });
    for (const b of P.blocks) assert.ok(!avoid.includes(b.clip), `${style}: ${b.clip}`);
    assert.ok(P.blocks.length >= P.sections.length);
  }
  for (const [id, f] of Object.entries(SEQ_FIT)) assert.equal(avoid.includes(id), f.stance.kick > DRESS.kick || f.stance.reach > DRESS.reach || f.stance.lift > DRESS.lift, `${id}: wide, kicking or jumping, not in her dress`);
});

test('the Dance picker: the styles, then the sequences under their own heading, each tile naming its round', () => {
  assert.deepEqual(DANCE_PICKS, [DANCE_AUTO, 'mix', 'kpop', 'cute', 'hiphop', ...SEQ_STYLES]);
  const sp = { dancePick: 'breaking', songDance: () => 'cute' }, d = pickerData(sp, 'dance');
  assert.equal(d.kind, 'tiles');
  assert.deepEqual(d.sections.map(s => s.label), ['', 'Dance sequences']);
  assert.deepEqual(d.sections[1].items.map(i => i.id), SEQ_STYLES);
  for (const it of d.sections[1].items) { assert.equal(it.name, DANCE_LABELS[it.id]); assert.equal(it.sub, DANCE_ROUNDS[it.id]); assert.ok(it.svg.startsWith('<svg')); }
  assert.deepEqual(d.sections.flatMap(s => s.items).filter(i => i.selected).map(i => i.id), ['breaking']);
});

test('sequenceBlocks on its own: a slope (no floor) and a dancer who has none of a step\'s takes still dance', () => {
  const s = { b0: 0, b1: 8, kind: 'chorus', index: 0 };
  const a = sequenceBlocks(SEQUENCES.soul, s, { rig: 'nam1', floor: true, bpm: 118 }), b = sequenceBlocks(SEQUENCES.soul, s, { rig: 'nam1', floor: false, bpm: 118 });
  assert.ok(a.some(x => x.floor) && !b.some(x => x.floor));
  const none = sequenceBlocks(SEQUENCES.popping, s, { rig: 'nobody', bpm: 118, like: 'hiphop' });
  assert.ok(none.length && none.every(x => CLUB_LOOPS.some(d => d.clip === x.clip)), 'Club loops of the style it borrows');
});

test('each take starts near the pose before it: the whole beat whose pose is closest, kept by a take going on', async () => {
  const THREE = await import('three');
  const { matchStarts, blockClipTime } = await import('../src/game/perform/performer.js');
  // two made-up takes on the hips: the old one at a fixed turn, the new one turning a quarter turn a beat
  const id = Object.keys(SEQ_FIT)[0], f = SEQ_FIT[id], q = a => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a).toArray();
  const times = Array.from({ length: f.beats * 4 + 1 }, (_, i) => i * f.loop / (f.beats * 4));
  const turn = t => ((t - f.phase) / f.beat) * Math.PI / 2;
  const newClip = new THREE.AnimationClip(id, f.loop, [new THREE.QuaternionKeyframeTrack('hips.quaternion', times, times.flatMap(t => q(turn(t))))]);
  const oldClip = new THREE.AnimationClip('ClubTopRock', 4, [new THREE.QuaternionKeyframeTrack('hips.quaternion', [0, 4], [...q(Math.PI), ...q(Math.PI)])]);
  const P = { sequence: true, meter: 4, rate: { m: 1 }, blocks: [{ b0: 0, b1: 2, clip: 'ClubTopRock' }, { b0: 2, b1: 4, clip: id, m: 1 }, { b0: 4, b1: 6, clip: id, m: 1, from: 2 }] };
  matchStarts(P, new Map([[id, newClip], ['ClubTopRock', oldClip]]));
  const at = blockClipTime(P, P.blocks[1], 8, f.loop), a = turn(at) % (Math.PI * 2);
  assert.ok(Math.abs(Math.abs(a) - Math.PI) < .3, `starts facing the old pose (${(a * 180 / Math.PI).toFixed(0)} deg)`);
  assert.equal(P.blocks[2].offset, P.blocks[1].offset, 'a take going on keeps its start');
  const P2 = { ...P, sequence: false, blocks: P.blocks.map(b => ({ ...b, offset: undefined })) };
  matchStarts(P2, new Map()); assert.ok(P2.blocks.every(b => b.offset === undefined), 'the Club loops\' plans: untouched');
});
