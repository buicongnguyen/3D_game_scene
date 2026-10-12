// The Mini games menu: its catalogue is built from the sources of truth (tricks, yard registry, fishing places, sky spots),
// every game has a launch plan with a valid place, season and hour, and the gates are bypassed only for menu sessions.
// (tests/minigames.test.mjs is the old Cooking rules test, so this one has its own name.)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { MinigameMenu } from '../src/game/minigame-menu.js';
import { Quest } from '../src/game/quest.js';
import { buildCatalogue, CATEGORIES, CATEGORY, META, SEASON_NAME, launchPlan, recordOf, badgeOf, inCategory } from '../src/content/minigames.js';
import { TRICKS, trickOpen } from '../src/content/tricks.js';
import { YARD_GAMES } from '../src/game/yard/index.js';
import { YARD_LIST, YARD_NAMES } from '../src/content/yard.js';
import { SPOTS } from '../src/game/fishing/places.js';
import { SKY_SPOTS } from '../src/content/skyspots.js';
import { placeProblems } from '../src/world/roads.js';

const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const list = buildCatalogue();

test('every trick, every yard game, every fishing place has an entry', () => {
  for (const t of TRICKS) assert.ok(list.find(e => e.id === `trick:${t.id}`), `trick ${t.id}`);
  for (const g of YARD_GAMES) {
    if (YARD_LIST.some(Y => Y.games.includes(g.id))) assert.ok(list.find(e => e.id === `yard:${g.id}`), `yard game ${g.id}`);
    else assert.ok(!list.find(e => e.id === `yard:${g.id}`), `${g.id} has no yard: absent, not broken`);
  }
  for (const s of Object.values(SPOTS)) assert.ok(list.find(e => e.id === `fish:${s.id}`), `fishing ${s.id}`);
  assert.ok(list.find(e => e.id === 'workshop'));
  assert.ok(list.some(e => e.kind === 'sky'), 'a sky-watching place');
  assert.equal(new Set(list.map(e => e.id)).size, list.length, 'ids are unique');
});

test('every entry is well formed (and a missing META row falls back to defaults)', () => {
  const bare = buildCatalogue({ meta: {} });
  assert.equal(bare.length, list.length, 'META adds detail, it never adds or removes games');
  for (const set of [list, bare]) for (const e of set) {
    assert.ok(CATEGORY[e.cat], `${e.id} category ${e.cat}`);
    for (const k of ['name', 'icon', 'desc', 'where', 'when']) assert.ok(e[k] && typeof e[k] === 'string', `${e.id}.${k}`);
    assert.ok(SEASONS.includes(e.season), `${e.id} season`);
    assert.ok(e.hour >= 0 && e.hour < 24, `${e.id} hour`);
    assert.ok(Number.isFinite(e.place.x) && Number.isFinite(e.place.z), `${e.id} place`);
  }
  // a trick with no META row still appears with its own name and icon
  const extra = { id: 'zzz', name: 'Zzz game', icon: 'trick-zzz', place: { x: -28, z: 76, face: 0 }, where: 'a place', seasons: ['spring'], hours: [9, 17], when: 'Spring days' };
  const e = buildCatalogue({ tricks: [...TRICKS, extra] }).find(x => x.id === 'trick:zzz');
  assert.ok(e && e.name === 'Zzz game' && e.icon === 'trick-zzz' && e.cat === 'country' && e.season === 'spring' && e.hour === 13);
  // a yard game that no yard offers is left out, not launched with an undefined place
  assert.ok(!buildCatalogue({ yardGames: [...YARD_GAMES, { id: 'ghost', name: 'Ghost' }] }).some(x => x.ref === 'ghost'));
});

test('META keys name real games and only real categories', () => {
  const ids = new Set(list.map(e => e.id));
  for (const [k, m] of Object.entries(META)) {
    assert.ok(CATEGORY[m.cat], `${k} category`);
    if (!ids.has(k)) continue;                                   // a game that has not landed yet: its row waits
    assert.ok(SEASONS.includes(m.season), `${k} season`);
    assert.ok(m.hour >= 0 && m.hour < 24, `${k} hour`);
  }
  for (const c of CATEGORIES) assert.ok(c.name && c.icon);
  for (const s of SEASONS) assert.ok(SEASON_NAME[s]);
});

test('launch plans: the stand place is dry, the season is allowed, the hour is open', () => {
  for (const e of list) {
    const plan = launchPlan(e);
    assert.ok(Number.isFinite(plan.stand.x) && Number.isFinite(plan.stand.z) && Number.isFinite(plan.stand.face), `${e.id} stand`);
    assert.equal(plan.season, e.season); assert.equal(plan.hour, e.hour);
    if (e.kind === 'trick') {
      const t = TRICKS.find(x => x.id === e.ref);
      assert.ok(trickOpen(t, { season: plan.season, hour: plan.hour, frozen: false, raining: false }), `${e.id}: ${plan.season} ${plan.hour} is inside its season and hours`);
      assert.deepEqual(placeProblems(plan.stand.x, plan.stand.z), [], `${e.id} stands on dry ground`);
    }
    if (e.kind === 'sky') assert.deepEqual(placeProblems(plan.stand.x, plan.stand.z), [], `${e.id} stands on dry ground`);
    if (e.kind === 'yard') { assert.ok(YARD_LIST.find(Y => Y.id === e.yard)?.games.includes(e.ref), `${e.id} yard hosts it`); assert.ok(YARD_NAMES[e.ref], `${e.id} named`); }
    if (e.kind === 'fish') assert.ok(SPOTS[e.ref], e.id);
    // the gates a menu session bypasses are listed (and a story save never bypasses them: see the browser test)
    assert.ok(Array.isArray(plan.gates) && plan.gates.length, `${e.id} gates`);
  }
});

test('the categories show every game once, in order, and unknown categories never appear', () => {
  const seen = CATEGORIES.flatMap(c => inCategory(list, c.id));
  assert.equal(seen.length, list.length);
  assert.deepEqual(list.map(e => CATEGORIES.findIndex(c => c.id === e.cat)), list.map(e => CATEGORIES.findIndex(c => c.id === e.cat)).sort((a, b) => a - b));
});

test('records and badges', () => {
  const e = list.find(x => x.id === 'trick:frogs');
  assert.deepEqual(recordOf(e, null), { plays: 0, best: 0, stars: 0 });
  assert.equal(badgeOf(e, recordOf(e, null)), 'try');
  const st = { tricks: { frogs: { plays: 2, best: 70, stars: 2 } }, yard: { footnet: { plays: 1, best: 3, stars: 1 } }, fishLog: { trout: 4 }, starGroups: { learned: ['orion'] } };
  assert.deepEqual(recordOf(e, st), { plays: 2, best: 70, stars: 2 });
  assert.equal(badgeOf(e, recordOf(e, st)), '');
  assert.equal(recordOf(list.find(x => x.id === 'yard:footnet'), st).stars, 1);
  assert.equal(recordOf(list.find(x => x.kind === 'fish'), st).best, 4);
  assert.equal(recordOf(list.find(x => x.kind === 'sky'), st).best, 1);
  const fresh = list.find(x => x.isNew);
  if (fresh) assert.equal(badgeOf(fresh, { plays: 0 }), 'new');
});

test('the runtime wires the menu in (title button, pause entry, begin hook, chip) without touching the off-limits files', () => {
  const ui = fs.readFileSync(new URL('../src/ui/ui.js', import.meta.url), 'utf8');
  const dir = fs.readFileSync(new URL('../src/game/director.js', import.meta.url), 'utf8');
  assert.match(ui, /btnTitleMini/); assert.match(ui, /btnPauseMini/); assert.match(ui, /pendingLaunch/);
  assert.match(dir, /minigameMenu\.launchFirst/); assert.match(dir, /new MinigameMenu\(this\)/);
  const menu = fs.readFileSync(new URL('../src/game/minigame-menu.js', import.meta.url), 'utf8');
  // gates are bypassed by a throwaway quest in a story save, never by editing the save's own state
  assert.match(menu, /borrow\(\)/); assert.match(menu, /tourLock = true/); assert.match(menu, /giveBack/);
});

test('every icon the menu names exists on disk (the picker falls back to a letter, but we want none missing)', () => {
  const names = new Set(['minigames', ...CATEGORIES.map(c => c.icon), ...list.map(e => e.icon)]);
  const missing = [...names].filter(n => !fs.existsSync(new URL(`../public/icons/${n}.webp`, import.meta.url)));
  assert.deepEqual(missing, [], `missing icons: ${missing.join(', ')}`);
});

test('a game hosted by two yards names both places', () => {
  for (const e of list.filter(x => x.kind === 'yard')) {
    const hosts = YARD_LIST.filter(Y => Y.games.includes(e.ref));
    for (const Y of hosts) assert.ok(e.where.includes(Y.name), `${e.id} where shows ${Y.name}`);
  }
});

test('borrowed story mini games restore the room before player position and preserve indoor/outdoor zoom', async () => {
  for (const originalRoom of ['cottage', null]) {
    const calls = [], pos = new THREE.Vector3(1200, 200, 900), original = pos.clone();
    const p = { pos, facing: .6, teleport(x,z,y,facing) { calls.push(['teleport',x,y,z]); this.pos.set(x,y,z); this.facing=facing; } };
    const interiors = { active:originalRoom, savedZoom:originalRoom ? 8 : undefined,
      async exit() { calls.push(['exit',this.active]); this.active=null; g.follow.zoomTarget=this.savedZoom ?? g.follow.zoomTarget; this.savedZoom=undefined; },
      async enter(id) { calls.push(['enter',id]); this.savedZoom=g.follow.zoomTarget; this.active=id; p.teleport(1100,800,200,0); g.follow.zoomTarget=4.6; },
    };
    const g = { player:p, interiors, follow:{yaw:.4,pitch:.3,zoomTarget:originalRoom ? 3.7 : 8}, applyLook() {} };
    const quest = new Quest(null,{story:'grandma'}), state = JSON.stringify(quest.state);
    const d = { game:g, quest, tourLock:false, explore:false, ui:{applyStory(){}}, tamo:{hide(){}}, refreshObjective(){} };
    const menu = Object.assign(Object.create(MinigameMenu.prototype),{d,g});
    menu.borrow();
    assert.notEqual(d.quest,quest); assert.equal(d.tourLock,true);
    if (interiors.active) await interiors.exit();
    await interiors.enter('mill'); // a game can also leave an interior of its own open
    g.follow.zoomTarget=10; p.pos.set(-22,4,65); calls.length=0;
    await menu.giveBack();
    assert.equal(interiors.active,originalRoom,'the saved room is visible and owns collisions again');
    assert.equal(g.follow.zoomTarget,originalRoom ? 3.7 : 8);
    assert.equal(interiors.savedZoom,originalRoom ? 8 : undefined);
    assert.deepEqual(p.pos,original); assert.equal(p.facing,.6);
    assert.equal(d.quest,quest); assert.equal(g.quest,quest); assert.equal(JSON.stringify(quest.state),state);
    assert.equal(d.tourLock,false); assert.equal(menu.session,null);
    assert.deepEqual(calls[0],['exit','mill']);
    if(originalRoom)assert.ok(calls.findIndex(c=>c[0]==='enter')<calls.length-1,'enter precedes exact saved placement');
  }
});
