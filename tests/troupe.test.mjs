// The group performance (content/troupe.js, game/perform/troupe.js): who stands where, the back row's routine, the bone
// copy between two rigs, the sing-along gate, the room check and the camera's group framing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createBeatClock } from '../src/game/perform/beat-clock.js';
import { planPerformance, planBacking } from '../src/game/perform/plan.js';
import { vocalLines } from '../src/game/perform/mic-layer.js';
import { makeCopier, restPose, chorusAt } from '../src/game/perform/troupe.js';
import { planShots, shotPose, groupDist } from '../src/game/perform/camera-man.js';
import { canGroup } from '../src/game/singplay/flat.js';
import { groupLimits, GROUP_LIMITS } from '../src/game/singplay/singplay.js';
import { TROUPE, troupeOf, troupeFiles, leadOffset, GROUP_SIZES } from '../src/content/troupe.js';
import { CLUB_LOOPS } from '../src/content/kotone-club.js';
import { VROID_MEMBERS } from './asset-contracts.mjs';

const BAR = 2.4, song = { id: 'test-song', bpm: 100, offset: 0, duration: 66 * BAR, mood: 'uplifting' };
const parts = [['intro', 4], ['verse', 8], ['pre', 4], ['chorus', 8], ['verse', 8], ['pre', 4], ['chorus', 8], ['bridge', 8], ['chorus', 8], ['outro', 6]];
const sections = []; let at = 0; for (const [kind, n] of parts) { sections.push({ t: at * BAR, e: (at + n) * BAR, kind, name: kind }); at += n; }
const lines = []; for (const s of sections) if (/verse|pre|chorus/.test(s.kind)) for (let t = s.t + .2; t < s.e - 1; t += BAR * 2) lines.push({ t, e: t + BAR * 1.5, text: 'la la', section: s.kind === 'pre' ? 'Pre-Chorus' : s.kind[0].toUpperCase() + s.kind.slice(1) });
const lyrics = { version: 1, lines };
const clock = createBeatClock(song, { sections, lyrics });
const lead = planPerformance(song, clock, lyrics);

test('the cast: Kotone leads the front row, two rows of four, one source a row, every file built', () => {
  assert.equal(TROUPE.length, 8);
  for (const row of [0, 1]) { const r = TROUPE.filter(m => m.row === row); assert.equal(r.length, 4); assert.equal(r.filter(m => m.source).length, 1, `row ${row}: one source`); }
  assert.ok(TROUPE.find(m => m.lead).row === 0 && TROUPE.find(m => m.lead).source);
  assert.deepEqual(GROUP_SIZES, [1, 4, 8]);
  assert.equal(troupeOf(1).length, 1); assert.equal(troupeOf(4).length, 4); assert.ok(troupeOf(4).every(m => m.row === 0));
  for (const m of TROUPE.filter(x => !x.lead)) assert.ok(VROID_MEMBERS.includes(m.file), `${m.file} has a contract`);
  // the back row stands between and outside the front row's shoulders (every face shows), well behind
  const front = TROUPE.filter(m => m.row === 0), back = TROUPE.filter(m => m.row === 1);
  for (const b of back) { assert.ok(Math.min(...front.map(f => Math.abs(f.x - b.x))) >= .7, `${b.id} not straight behind someone`); assert.ok(b.z <= -1.5); }
  // the files: nothing for a solo; four models for 4 (light on Low); eight with the back row's pack, not the others'
  assert.deepEqual(troupeFiles(1, true), []);
  assert.deepEqual(troupeFiles(4, true).sort(), ['vroid-nu1.lite', 'vroid-nu3.lite', 'vroid-nu4.lite']);
  const eight = troupeFiles(8, false);
  assert.equal(eight.filter(f => f.startsWith('moves-')).length, 1);
  assert.equal(eight.length, 8);
  assert.ok(Math.hypot(leadOffset().x, leadOffset().z) < 1, 'Kotone near the middle');
});

test('the back row: the same bar lines as the lead, another dance in each block, no hand contact, the closing moments', () => {
  const back = planBacking(lead, { noContact: true });
  assert.equal(back.blocks.length, lead.blocks.length);
  let differ = 0;
  back.blocks.forEach((b, i) => {
    const a = lead.blocks[i];
    assert.equal(b.b0, a.b0); assert.equal(b.b1, a.b1); assert.equal(b.section, a.section);
    if (b.clip !== a.clip) differ++;
    if (i) assert.notEqual(b.clip, back.blocks[i - 1].clip, 'never the same dance twice in a row');
    assert.ok(!CLUB_LOOPS.find(d => d.clip === b.clip).contact, `${b.clip}: no claps`);
    assert.equal(b.mic, false);
  });
  assert.equal(differ, back.blocks.length, 'a different routine in every block');
  assert.ok(!back.moments.some(m => m.id === 'hop'), 'no clap hop without contact');
  for (const id of ['cheer', 'bow']) { const a = lead.moments.find(m => m.id === id), b = back.moments.find(m => m.id === id); if (a) { assert.ok(b, id); assert.equal(b.b0, a.b0); assert.ok(!/Mic$/.test(b.clip)); } }
  assert.deepEqual(planBacking(lead, { noContact: true }).summary, back.summary, 'deterministic');
});

// two small rigs: hips -> thigh -> shin -> foot -> toe, the follower 10 % taller with one bone at another rest turn
function rig(k = 1, twist = 0) {
  const root = new THREE.Bone(); root.name = 'root';
  const mk = (name, parent, y) => { const b = new THREE.Bone(); b.name = name; b.position.set(0, y * k, 0); parent.add(b); return b; };
  const hips = mk('hips', root, 0); hips.position.y = .9 * k;
  const spine = mk('spine', hips, .1);
  if (twist) spine.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), twist);
  for (const s of ['L', 'R']) { const th = mk(`thigh_${s}`, hips, 0); th.position.x = (s === 'L' ? .08 : -.08) * k; th.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
    const sh = mk(`shin_${s}`, th, .4); const f = mk(`foot_${s}`, sh, .4); mk(`toe_${s}`, f, .1); }
  const o = new THREE.Object3D(); o.add(root); o.updateMatrixWorld(true); return o;
}
test('the copy: a follower turns each bone from its own rest by the source\'s turn; the hips travel by the leg ratio', () => {
  const src = rig(1), dst = rig(1.1, .4), rs = restPose(src), rd = restPose(dst);
  const c = makeCopier(src, dst, rs, rd, { feet: false });
  assert.equal(c.corrected, 1, 'only the bone with another rest needs a correction');
  assert.ok(Math.abs(c.hips.k - 1.1) < 1e-6);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(.3, .2, -.1));
  const sSpine = src.getObjectByName('spine'), dSpine = dst.getObjectByName('spine');
  sSpine.quaternion.copy(rs.get('spine').q).multiply(q);           // the source turns its spine by q from rest
  src.getObjectByName('hips').position.y += .05;                   // and dips... up 5 cm
  c.copy();
  const want = rd.get('spine').q.clone().multiply(q);
  assert.ok(Math.abs(Math.abs(dSpine.quaternion.dot(want)) - 1) < 1e-9, 'the same turn from its own rest');
  assert.ok(Math.abs(dst.getObjectByName('hips').position.y - (rd.get('hips').p.y + .055)) < 1e-9, 'hips travel x1.1');
});

test('the copy with the leg solve: a follower of another thigh : shin split puts its ankle where the source\'s goes', () => {
  const src = rig(1), dst = rig(1), rs = restPose(src), rd = restPose(dst);
  dst.getObjectByName('shin_L').position.y = .46; dst.getObjectByName('foot_L').position.y = .34; dst.updateMatrixWorld(true);   // same leg, another split
  const c = makeCopier(src, dst, rs, rd, { feet: 'auto' });
  assert.ok(c.ik && c.mismatch > .01);
  // the source bends its knee; its ankle moves; the follower's ankle must follow (same leg length)
  src.getObjectByName('shin_L').quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), .25); src.updateMatrixWorld(true);   // (ankle 1.2 cm up: solved in full)
  c.copy(); dst.updateMatrixWorld(true);
  const a = src.getObjectByName('foot_L').getWorldPosition(new THREE.Vector3()), b = dst.getObjectByName('foot_L').getWorldPosition(new THREE.Vector3());
  assert.ok(a.distanceTo(b) < 2e-3, `ankle within 2 mm (${(a.distanceTo(b) * 1000).toFixed(1)} mm)`);
});

test('the sing-along: members sing on chorus lines only (with the lead-in and tail of a line)', () => {
  const L = vocalLines(lyrics);
  const chorus = sections.find(s => s.kind === 'chorus'), verse = sections.find(s => s.kind === 'verse');
  assert.ok(chorusAt(L, chorus.t + .5));
  assert.ok(!chorusAt(L, verse.t + .5));
  assert.ok(!chorusAt(null, 10));
});

test('the room check: every member on level, dry, clear ground', () => {
  const spots = [{ x: -1.5, z: 0 }, { x: 3, z: -2 }];
  const flat = { heightAt: () => 1, waterY: 0, room: null, solid: () => false };
  assert.deepEqual(canGroup({ x: 0, y: 1, z: 0 }, 0, spots, flat), { ok: true });
  assert.equal(canGroup({ x: 0, y: 1, z: 0 }, 0, spots, { ...flat, heightAt: x => (x > 2 ? 1.6 : 1) }).reason, 'group');
  assert.equal(canGroup({ x: 0, y: 1, z: 0 }, 0, spots, { ...flat, solid: x => x > 2 }).reason, 'group');
  assert.equal(canGroup({ x: 0, y: 1, z: 0 }, 0, spots, { ...flat, heightAt: x => (x < -1 ? .1 : 1) }).reason, 'water');
  // her facing turns the layout: facing +x (pi/2), a spot 3 m to her side is 3 m along -z
  let seen = null; canGroup({ x: 0, y: 1, z: 0 }, Math.PI / 2, [{ x: 3, z: 0 }], { ...flat, solid: (x, z) => { seen = [x, z]; return false; } });
  assert.ok(Math.abs(seen[0]) < 1e-9 && Math.abs(seen[1] + 3) < 1e-9);
});

test('the camera: choruses frame the group, close-ups go to her verse lines, and a group shot stands back for its width', () => {
  const plan = lead, shots = planShots(plan, clock, { group: true });
  for (const s of sections.filter(x => x.kind === 'chorus')) {
    const inside = shots.filter(x => x.t0 >= s.t - .3 && x.t0 < s.e - .5);
    assert.ok(inside.length && inside.every(x => x.kind === 'wide' || x.kind === 'medium'), 'group shots on choruses');
  }
  const v = sections.find(x => x.kind === 'verse');
  assert.ok(shots.some(x => x.kind === 'close' && x.t0 >= v.t - .3 && x.t0 < v.e), 'close-ups on her verse lines');
  for (let i = 1; i < shots.length; i++) assert.ok(shots[i].t0 >= shots[i - 1].t0);
  const subject = { x: 0, y: 0, z: 0, facing: 0, group: { x: 1, z: -1, w: 6, depth: 1.8 } };
  const med = shotPose({ t0: 0, t1: 4, kind: 'medium', side: 1 }, 1, subject);
  assert.ok(med.pos.distanceTo(new THREE.Vector3(1, med.pos.y, -1)) >= groupDist(subject.group) - 1e-6, 'far enough for the group');
  assert.ok(Math.abs(med.look.x - 1) < 1e-9, 'aimed at the group');
  const close = shotPose({ t0: 0, t1: 4, kind: 'close', side: 1 }, 1, subject);
  assert.ok(Math.abs(close.look.x) < 1e-9 && close.pos.length() < 3, 'a close-up is hers');
});

test('the phone limits: URL switches override the tier defaults', () => {
  const q = s => new URLSearchParams(s);
  assert.deepEqual(groupLimits(true), { ...GROUP_LIMITS.low });
  assert.equal(GROUP_LIMITS.low.max, 4, 'phones: four at most (measured)'); assert.equal(GROUP_LIMITS.other.max, 8);
  assert.equal(groupLimits(true, q('troupeMax=4')).max, 4);
  assert.equal(groupLimits(false, q('troupeHalf=1')).backHalf, true);
  assert.equal(groupLimits(false, q('troupeBackFaces=0')).backFaces, false);
});

test('a packed clip pack (joints loaded as plain nodes, its skin pruned) still gives the rest pose', () => {
  const plain = new THREE.Object3D(); const hips = new THREE.Object3D(); hips.name = 'hips'; hips.position.y = .9; plain.add(hips);
  const spine = new THREE.Object3D(); spine.name = 'spine'; spine.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), .2); hips.add(spine);
  const r = restPose(plain);
  assert.ok(r.has('hips') && r.has('spine'), 'plain nodes count');
  const src = rig(1), dst = rig(1);
  assert.ok(makeCopier(src, dst, restPose(src), restPose(dst), { feet: false }).bones > 5);
});
