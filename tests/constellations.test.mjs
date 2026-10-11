// Star groups: the data (real positions, figures, words), the sky of each profile and season, the learned record.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STARS, GROUPS, GROUP, PROFILES, LANG_PROFILE, SEASONS, profileFor, lstFor, horizontal, worldDir, sep, centreOf, groupInfo, groupsUp, groupsFor, inProfile,
  seasonsOf, isEasy, textOf, starName, shapeOf, shapeSvg, cleanStarGroups, learnGroup, tonightGroups, dipperPatch,
} from '../src/content/constellations.js';
import { freshState, migrate, Quest } from '../src/game/quest.js';

const JP = PROFILES.jp, VN = PROFILES.vn;
const up = (season, hour, p) => groupsUp(season, hour, p).map(i => i.id);

test('the catalogue is well formed: unique ids, valid star references, figure lines inside the group, sane numbers', () => {
  assert.equal(new Set(GROUPS.map(g => g.id)).size, GROUPS.length);
  assert.ok(GROUPS.length >= 20 && GROUPS.length <= 24);
  for (const [id, s] of Object.entries(STARS)) {
    assert.ok(s.ra >= 0 && s.ra < 24 && s.dec >= -90 && s.dec <= 90, id);
    assert.ok(s.mag >= -2 && s.mag <= 5, `${id} magnitude`);
    assert.ok(['w', 'b', 'y', 'o', 'r'].includes(s.col), id);
    if (s.name) assert.ok(typeof s.name === 'string' && s.name.length <= 40, id);
  }
  for (const g of GROUPS) {
    assert.ok(g.stars.length >= 2, g.id);
    assert.equal(new Set(g.stars).size, g.stars.length, `${g.id}: a star twice`);
    for (const id of g.stars) assert.ok(STARS[id], `${g.id}: unknown star ${id}`);
    assert.ok(g.lines.length >= 1, g.id);
    for (const [a, b] of g.lines) assert.ok(g.stars.includes(a) && g.stars.includes(b) && a !== b, `${g.id}: line ${a}-${b}`);
    // every star is on the figure (a line reaches it), so nothing floats loose
    for (const id of g.stars) assert.ok(g.lines.some(l => l.includes(id)), `${g.id}: ${id} has no line`);
    for (const k of ['name', 'story', 'tip']) assert.ok(typeof g[k] === 'string' && g[k].length > 5, `${g.id}.${k}`);
    assert.ok(g.story.length <= 190 && g.tip.length <= 150 && g.name.length <= 60, `${g.id}: texts fit the card`);
    assert.ok(!/\b(die[sd]?|death|dead|sad|cry|cried|tears|lost|gone|alone|afraid|scary)\b/i.test(g.story + g.tip), `${g.id}: keep it happy`);
  }
  assert.ok(GROUPS.length === Object.keys(GROUP).length);
});

test('real facts: the pointers, the belt, the triangles and the Cross, within a degree or two', () => {
  const near = (a, b, v, tol, what) => assert.ok(Math.abs(sep(a, b) - v) <= tol, `${what}: ${sep(a, b).toFixed(1)} deg, expected ${v}`);
  near('dubhe', 'merak', 5.7, 1, 'the two Pointers');
  near('dubhe', 'polaris', 28.7, 2, 'Dubhe to the North Star');
  assert.ok(Math.abs(sep('dubhe', 'polaris') / sep('dubhe', 'merak') - 5) < 0.6, 'five times the gap');
  near('alnitak', 'alnilam', 1.4, 0.6, 'belt'); near('alnilam', 'mintaka', 1.4, 0.6, 'belt');
  near('betelgeuse', 'rigel', 18.5, 2, 'Betelgeuse to Rigel');
  near('vega', 'altair', 34.2, 2, 'Vega-Altair'); near('altair', 'deneb', 38, 2, 'Altair-Deneb'); near('vega', 'deneb', 23.8, 2, 'Vega-Deneb');
  near('acrux', 'gacrux', 6, 1, 'the Southern Cross');
  near('arcturus', 'spica', 32.7, 2, 'Spring Triangle'); near('spica', 'denebola', 35.6, 2.5, 'Spring Triangle'); near('arcturus', 'denebola', 35.7, 2.5, 'Spring Triangle');
  near('castor', 'pollux', 4.5, 0.8, 'the Twins');
  near('markab', 'scheat', 13.2, 1.5, 'the Autumn Square'); near('scheat', 'alpheratz', 12.9, 1.5, 'the Autumn Square');
  near('alcyone', 'atlas', 0.4, 0.4, 'the Pleiades');
  // the belt is a straight line: Alnilam sits on the arc from Alnitak to Mintaka
  const a = sep('alnitak', 'alnilam') + sep('alnilam', 'mintaka'), b = sep('alnitak', 'mintaka');
  assert.ok(Math.abs(a - b) < 0.15, 'three in a row');
  // the Little Dipper hangs from the North Star, the Dipper's cup is Dubhe-Merak-Phecda-Megrez
  assert.ok(sep('polaris', 'kochab') > 15 && sep('polaris', 'kochab') < 20);
  assert.ok(sep('megrez', 'phecda') < 6 && sep('megrez', 'dubhe') < 11);
  // Cassiopeia is a compact W
  const c = GROUP.cassiopeia.stars; for (const x of c) for (const y of c) assert.ok(sep(x, y) < 14);
  assert.deepEqual(GROUP.cassiopeia.lines.map(l => l.join('-')), ['caph-schedar', 'schedar-navi', 'navi-ruchbah', 'ruchbah-segin']);
});

test('the figures as pictures: Orion upright with Betelgeuse upper left, Rigel lower right, the belt in the middle', () => {
  const sh = shapeOf(GROUP.orion), P = Object.fromEntries(sh.points.map(p => [p.id, p]));
  assert.ok(P.betelgeuse.y > 0.5 && P.betelgeuse.x < 0, 'Betelgeuse up and left');
  assert.ok(P.rigel.y < -0.5 && P.rigel.x > 0, 'Rigel down and right');
  assert.ok(P.bellatrix.x > P.betelgeuse.x && Math.abs(P.bellatrix.y - P.betelgeuse.y) < 0.35, 'the shoulders side by side');
  for (const b of ['alnitak', 'alnilam', 'mintaka']) assert.ok(Math.abs(P[b].y) < 0.25, 'the belt in the middle');
  const dip = Object.fromEntries(shapeOf(GROUP['summer-triangle']).points.map(p => [p.id, p]));
  assert.ok(dip.vega && dip.altair && dip.deneb);
  for (const g of GROUPS) { const s = shapeOf(g); assert.ok(s.points.every(p => Math.hypot(p.x, p.y) <= 1.0001), g.id); assert.ok(/<svg/.test(shapeSvg(g, true))); }
});

test('the sky maths: the North Star stands at the latitude, due north; north is -z', () => {
  for (const season of SEASONS) for (const hour of [19.5, 21, 23, 2, 4]) {
    for (const [p, lat] of [[JP, 35], [VN, 16]]) {
      const h = horizontal(STARS.polaris.ra, STARS.polaris.dec, lstFor(season, hour), lat);
      assert.ok(Math.abs(h.alt - lat) < 1.2, `${p.id} ${season} ${hour}: ${h.alt.toFixed(1)}`);
      assert.ok(h.az < 2 || h.az > 358, 'due north');
    }
  }
  const [x, y, z] = worldDir(35, 0);
  assert.ok(z < -0.8 && Math.abs(x) < 1e-9 && y > 0.5);
  assert.ok(worldDir(10, 90)[0] > 0.9, 'east is +x');
  // the sky wheels: Vega is higher later in a summer evening than early, then sinks
  assert.ok(horizontal(STARS.vega.ra, STARS.vega.dec, lstFor('summer', 19.5), 35).alt < horizontal(STARS.vega.ra, STARS.vega.dec, lstFor('summer', 22.5), 35).alt);
});

test('every season has a good evening sky in both profiles, with the right groups in the right seasons', () => {
  for (const p of [JP, VN]) for (const season of SEASONS) for (const hour of [19.5, 21, 23]) {
    assert.ok(up(season, hour, p).length >= 4, `${p.id} ${season} ${hour}: ${up(season, hour, p).join(' ')}`);
    assert.ok(groupsUp(season, hour, p, true).length >= 3, `${p.id} ${season} ${hour}: too few easy groups at dusk`);
  }
  const has = (p, season, ...ids) => { const u = up(season, 21, p); for (const id of ids) assert.ok(u.includes(id), `${p.id} ${season}: ${id} not up (${u.join(' ')})`); };
  has(JP, 'winter', 'orion', 'gemini', 'taurus', 'canis-major', 'auriga');
  has(JP, 'spring', 'leo', 'virgo', 'big-dipper', 'spring-triangle');
  has(JP, 'summer', 'summer-triangle', 'scorpius', 'lyra', 'cygnus', 'aquila');
  has(JP, 'autumn', 'pegasus', 'cassiopeia', 'andromeda', 'perseus');
  has(VN, 'spring', 'crux', 'leo', 'virgo');
  has(VN, 'summer', 'scorpius', 'summer-triangle', 'sagittarius');
  has(VN, 'winter', 'orion', 'taurus', 'canis-major');
  // Japan never sees the Cross; Vietnam sees it only in the spring evenings
  assert.ok(!groupsFor(JP).some(g => g.id === 'crux' || g.id === 'centaurus'));
  assert.ok(SEASONS.filter(s => up(s, 21, VN).includes('crux')).join() === 'spring');
  // Scorpius is high in the Vietnamese summer and low in the Japanese one
  const sc = s => groupInfo(GROUP.scorpius, 'summer', 21, s).alt;
  assert.ok(sc(VN) > 35 && sc(JP) < 28 && sc(VN) > sc(JP) + 12, `${sc(VN)} ${sc(JP)}`);
  // the North Star is low in Vietnam: it never counts as "high" (the Little Dipper's altitude)
  assert.ok(groupInfo(GROUP['little-dipper'], 'summer', 21, VN).alt < 30);
  assert.ok(SEASONS.every(s => groupsFor(JP).every(g => !seasonsOf(g, JP).includes(s) || up(s, 21, JP).includes(g.id))));
  for (const g of groupsFor(VN)) assert.ok(seasonsOf(g, VN).length >= 1, `${g.id} is well placed in some season`);
  assert.ok(isEasy(GROUP.orion) && isEasy(GROUP['big-dipper']) && !isEasy(GROUP.lyra));
  for (const s of SEASONS) { assert.equal(tonightGroups(s, JP).length, 3); assert.equal(tonightGroups(s, VN).length, 3); }
});

test('language profiles: Vietnamese looks from Vietnam, everything else from the Japan-like valley', () => {
  assert.equal(profileFor('vi'), VN);
  for (const l of ['en', 'ja', 'ko', 'fr', undefined]) assert.equal(profileFor(l), JP);
  assert.deepEqual(Object.keys(LANG_PROFILE), ['vi']);
  assert.equal(JP.lat, 35); assert.equal(VN.lat, 16);
  // the Vietnamese profile has its own words for every group it can show, the international name in brackets first-class
  for (const g of groupsFor(VN)) {
    const t = textOf(g, VN, s => `EN:${s}`);
    for (const k of ['name', 'short', 'story', 'tip']) assert.ok(t[k] && !t[k].startsWith('EN:'), `${g.id}.${k} is Vietnamese`);
    assert.ok(/[^ -]/.test(t.name), `${g.id}: Vietnamese name`);
    assert.ok(/\(.+\)/.test(t.name), `${g.id}: the international name in brackets`);
    assert.ok(t.story.length <= 260 && t.tip.length <= 190, `${g.id}: Vietnamese texts fit the card`);
    assert.ok(!/\b(chết|buồn|khóc|mất)\b/i.test(t.story + t.tip), `${g.id}: keep it happy`);
  }
  const vi = textOf(GROUP['big-dipper'], VN), en = textOf(GROUP['big-dipper'], JP, s => s);
  assert.ok(vi.name.startsWith('Bắc Đẩu') && en.name.includes('Big Dipper'));
  assert.equal(starName('polaris', VN, s => s), 'Sao Bắc Cực (Polaris)');
  assert.equal(starName('vega', VN, s => s), 'Chức Nữ (Vega)');
  assert.equal(starName('vega', JP, s => s), 'Vega (Orihime)');
  assert.ok(/Ô Thước|ô thước/.test(textOf(GROUP['summer-triangle'], VN).story), 'the magpie bridge');
  assert.ok(/sao Rua/.test(textOf(GROUP.taurus, VN).story) && /sao Cày/.test(textOf(GROUP.orion, VN).name));
  assert.ok(VN.source.includes('UNVERIFIED'));
  // English-keyed text never needs a translation to show: the Japan-like profile falls back to the English itself
  for (const g of GROUPS) { const t = textOf(g, JP, s => s); assert.equal(t.name, g.name); assert.ok(t.short && t.story && t.tip); }
});

test('the learned record: unknown and repeated groups dropped, saves migrate, the Fallen Stars list is untouched', () => {
  assert.deepEqual(cleanStarGroups(undefined), { learned: [] });
  assert.deepEqual(cleanStarGroups({ learned: 'x' }), { learned: [] });
  assert.deepEqual(cleanStarGroups({ learned: ['orion', 'orion', 'nope', 7, 'leo'] }), { learned: ['orion', 'leo'] });
  const rec = { learned: [] };
  assert.equal(learnGroup(rec, 'orion'), true);
  assert.equal(learnGroup(rec, 'orion'), false);
  assert.equal(learnGroup(rec, 'unknown'), false);
  assert.deepEqual(rec.learned, ['orion']);
  assert.deepEqual(freshState().starGroups, { learned: [] });
  assert.ok(Array.isArray(freshState().stars), 'the Fallen Stars stay an array');
  const m = migrate({ ...freshState('grandma'), starGroups: { learned: ['leo', 'zzz', 'leo'] }, stars: ['a'] });
  assert.deepEqual(m.starGroups, { learned: ['leo'] });
  assert.deepEqual(m.stars, ['a']);
  const old = { ...freshState('classic') }; delete old.starGroups;
  assert.deepEqual(migrate(old).starGroups, { learned: [] });
  assert.deepEqual(migrate({ ...freshState(), starGroups: 'many' }).starGroups, { learned: [] });
  const q = new Quest(); q.start(); q.state.starGroups.learned.push('gemini');
  assert.deepEqual(new Quest(JSON.parse(JSON.stringify(q.save()))).state.starGroups.learned, ['gemini']);
});

test('the Stargazing trick draws the Big Dipper from the same stars', () => {
  const P = dipperPatch();
  assert.deepEqual(Object.keys(P), ['alkaid', 'mizar', 'alioth', 'megrez', 'phecda', 'merak', 'dubhe', 'polaris']);
  const gap = Math.hypot(P.dubhe[0] - P.merak[0], P.dubhe[1] - P.merak[1]), far = Math.hypot(P.polaris[0] - P.dubhe[0], P.polaris[1] - P.dubhe[1]);
  assert.ok(Math.abs(far / gap - 5) < 0.6);
  assert.ok(P.alkaid[0] < P.mizar[0] && P.mizar[0] < P.alioth[0] && P.alioth[0] < P.megrez[0], 'the handle trails to the left');
  assert.ok(P.polaris[1] > 20 && Math.abs(P.polaris[0] - P.dubhe[0]) < 0.01, 'the North Star straight above Dubhe');
  assert.ok(centreOf(GROUP['big-dipper']).dec > 50 && inProfile(GROUP['big-dipper'], VN));
});
