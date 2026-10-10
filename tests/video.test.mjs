// The phone videos (public/video, recorded by scripts/record-videos.mjs): every clip the game may ask for is there,
// is an H.264 MP4 a phone can start at once, and its stop times match the tour it shows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CLIPS, CUTS, FPS, TITLE_LOOP, clipFile, clipKey, cutFor } from '../src/content/video.js';
import { TOURS, TOUR, timeline, stopTime } from '../src/content/tour.js';
import { STORIES } from '../src/game/stories/index.js';
import { TOTAL_VIDEO_BYTES } from './asset-contracts.mjs';

const DIR = new URL('../public/video/', import.meta.url);
const manifest = JSON.parse(fs.readFileSync(new URL('manifest.json', DIR), 'utf8'));
const names = CLIPS.flatMap(c => Object.keys(CUTS).map(cut => ({ ...c, cut, name: `${c.id}-${cut}` })));

/** Top-level MP4 boxes [type, offset, size]. */
function boxes(buf) {
  const out = [];
  for (let p = 0; p + 8 <= buf.length;) {
    let size = buf.readUInt32BE(p);
    if (size === 1) size = Number(buf.readBigUInt64BE(p + 8)); else if (size === 0) size = buf.length - p;
    out.push([buf.toString('latin1', p + 4, p + 8), p, size]);
    p += size;
  }
  return out;
}

test('video: the clip list covers every tour, both stories and the title, in both cuts', () => {
  assert.deepEqual(CLIPS.filter(c => c.kind === 'tour').map(c => c.tour), TOURS.map(t => t.id));
  assert.deepEqual(CLIPS.filter(c => c.kind === 'intro').map(c => c.story).sort(), Object.keys(STORIES).sort());
  assert.equal(CLIPS.filter(c => c.kind === 'title').length, 1);
  assert.equal(new Set(CLIPS.map(c => c.id)).size, CLIPS.length);
  assert.deepEqual(Object.keys(CUTS), ['wide', 'tall']);
  assert.ok(CUTS.wide.w > CUTS.wide.h && CUTS.tall.h > CUTS.tall.w);
  assert.equal(cutFor(390, 844), 'tall'); assert.equal(cutFor(844, 390), 'wide'); assert.equal(cutFor(1280, 720), 'wide');
  assert.equal(clipKey('tour-spring', 390, 844), 'tour-spring-tall');
  assert.equal(clipFile('title', 'wide'), 'title-wide.mp4');
});

test('video: every clip and poster in the manifest exists, and nothing else is left in public/video', () => {
  assert.equal(manifest.fps, FPS);
  assert.deepEqual(Object.keys(manifest.clips).sort(), names.map(n => n.name).sort());
  const expected = new Set(['manifest.json']);
  let total = fs.statSync(new URL('manifest.json', DIR)).size;
  for (const n of names) {
    const c = manifest.clips[n.name];
    assert.equal(c.file, clipFile(n.id, n.cut)); assert.equal(c.posterFile, clipFile(n.id, n.cut, 'jpg'));
    for (const [f, bytes] of [[c.file, c.bytes], [c.posterFile, c.posterBytes]]) {
      assert.ok(fs.existsSync(new URL(f, DIR)), `${f} is missing`);
      assert.equal(fs.statSync(new URL(f, DIR)).size, bytes, `${f}: size differs from the manifest (re-record, do not hand-edit)`);
      expected.add(f);
      total += bytes;
    }
    assert.equal(c.width, CUTS[n.cut].w); assert.equal(c.height, CUTS[n.cut].h);
    assert.ok(Math.abs(c.duration - c.frames / FPS) < 1e-6 && c.duration > 5, `${n.name}: duration`);
    assert.ok(c.posterBytes < 160_000, `${n.name}: the poster shows at once (${c.posterBytes} bytes)`);
    // a phone on mobile data: no clip above ~1 Mbps
    assert.ok(c.bytes * 8 / c.duration < 1_000_000, `${n.name}: ${Math.round(c.bytes * 8 / c.duration / 1000)} kbps`);
  }
  assert.deepEqual(fs.readdirSync(DIR).sort(), [...expected].sort());
  assert.ok(total <= TOTAL_VIDEO_BYTES, `${(total / 1e6).toFixed(1)} MB of video > ${TOTAL_VIDEO_BYTES / 1e6} MB`);
});

test('video: every clip is an H.264 MP4 with its index in front (it starts before it has downloaded)', () => {
  for (const n of names) {
    const c = manifest.clips[n.name], buf = fs.readFileSync(new URL(c.file, DIR)), b = boxes(buf);
    const types = b.map(x => x[0]);
    assert.equal(types[0], 'ftyp', `${c.file}: not an MP4`);
    assert.ok(types.includes('moov') && types.includes('mdat') && types.indexOf('moov') < types.indexOf('mdat'), `${c.file}: moov must come before mdat (${types.join()})`);
    assert.equal(b.reduce((a, x) => a + x[2], 0), buf.length, `${c.file}: boxes add up`);
    const moov = b.find(x => x[0] === 'moov'), head = buf.subarray(moov[1], moov[1] + moov[2]);
    const at = head.indexOf('avcC', 0, 'latin1');
    assert.ok(head.includes('avc1', 0, 'latin1') && at > 0, `${c.file}: H.264 (avc1) video`);
    assert.ok(!head.includes('mp4a', 0, 'latin1'), `${c.file}: no audio track`);
    // avcC: version, profile, compatibility, level. Main (77) or High (100) at level 3.1 or lower plays on every phone.
    const profile = head[at + 5], level = head[at + 7];
    assert.ok([66, 77, 100].includes(profile) && level <= 31, `${c.file}: profile ${profile} level ${level}`);
    // the picture size in the track header matches the cut
    const tkhd = head.indexOf('tkhd', 0, 'latin1'), ver = head[tkhd + 4], wAt = tkhd + 4 + (ver === 1 ? 88 : 76);
    assert.equal(head.readUInt32BE(wAt) >>> 16, CUTS[n.cut].w, `${c.file}: width`);
    assert.equal(head.readUInt32BE(wAt + 4) >>> 16, CUTS[n.cut].h, `${c.file}: height`);
  }
});

test('video: each tour clip carries the time of every stop, in order, inside the clip, matching the tour data', () => {
  for (const n of names.filter(x => x.kind === 'tour')) {
    const c = manifest.clips[n.name], tour = TOUR[n.tour], tl = timeline(tour);
    assert.equal(c.tour, tour.id);
    assert.ok(Math.abs(c.duration - tl.length) < 0.05, `${n.name}: the clip is ${c.duration.toFixed(2)} s but the tour is ${tl.length.toFixed(2)} s: record it again (node scripts/record-videos.mjs --only=${n.id})`);
    assert.deepEqual(c.stops.map(s => s.place), tour.stops.map(s => s.place), `${n.name}: stops`);
    let last = -1;
    c.stops.forEach((s, i) => {
      assert.ok(s.from <= s.t && s.from > last - 1e-9 && s.t > last, `${n.name}: stop ${i} is in order`);
      assert.ok(s.t >= 0 && s.t + 4 <= c.duration + 0.05, `${n.name}: stop ${i} rests inside the clip`);
      assert.ok(Math.abs(s.t - stopTime(tl, i)) < 0.002, `${n.name}: stop ${i} at ${s.t} s, the tour says ${stopTime(tl, i).toFixed(3)}`);
      last = s.t;
    });
    assert.equal(c.stops[0].from, 0);
  }
});

test('video: the arrival and title clips', () => {
  for (const n of names.filter(x => x.kind === 'intro')) {
    const c = manifest.clips[n.name];
    assert.equal(c.story, n.story);
    assert.ok(c.duration > 18 && c.duration < 45, `${n.name}: ${c.duration} s`);
    assert.ok(c.marks.whistle > 2 && c.marks.whistle < c.marks.platform && c.marks.platform < c.duration, `${n.name}: whistle marks ${JSON.stringify(c.marks)}`);
  }
  for (const n of names.filter(x => x.kind === 'title')) {
    const c = manifest.clips[n.name];
    assert.ok(c.loop && Math.abs(c.duration - TITLE_LOOP) < 1e-6 && TITLE_LOOP >= 10 && TITLE_LOOP <= 15);
  }
});
