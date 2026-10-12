// Execute the runtime methods with media/network boundaries controlled, including pending load races.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from 'three';

const source = name => fs.readFileSync(new URL(`../src/game/${name}.js`, import.meta.url), 'utf8')
  .replace(/^import .*;\r?$/gm, '').replace(/^export /gm, '');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

function runtime({ language = 'en', enabled = false, manifestGate = null, showGate = null, fadeGate = null } = {}) {
  let lang = language, tropical = enabled, fetches = 0, shown = 0, hidden = 0, faded = 0, generation = 0;
  const listeners = new Set(), langListeners = new Set(), game = { renderer: { hold: false, qualityName: 'low' } };
  const layer = game.videoLayer = {
    owner: null,
    async show(clip, { owner }) {
      const token = ++generation; this.owner = owner; shown++;
      if (showGate) await showGate.promise;
      if (token !== generation) return false;
      game.renderer.hold = true; return true;
    },
    hide(owner) { if (owner !== this.owner) return; generation++; this.owner = null; hidden++; game.renderer.hold = false; },
  };
  const ctx = {
    THREE, URL, console, setTimeout, clearTimeout, requestAnimationFrame() {}, innerWidth: 390, innerHeight: 844,
    document: { baseURI: 'https://test.example/', createElement: () => ({ canPlayType: () => 'probably' }) },
    getLang: () => lang, tx: s => s, onLangChange: fn => { langListeners.add(fn); return () => langListeners.delete(fn); },
    getTropicalTrees: () => tropical, onTreeThemeChange: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    storyId: () => 'grandma', CAPTIONS: { arrival: [] }, STOPS: {}, RAIL_Y: 17,
    VIDEO_DIR: './video/', clipKey: id => `${id}-tall`,
    fetch: async () => { fetches++; if (manifestGate) await manifestGate.promise; return { ok: true, json: async () => ({ clips: {
      'title-tall': { file: 'title.mp4', posterFile: 'title.jpg' }, 'intro-grandma-tall': { file: 'intro.mp4', posterFile: 'intro.jpg' },
    } }) }; },
  };
  const code = `${source('video')}; ({ TitleLoop, VideoLayer, playArrival, recordedSceneryMatches })`;
  const mod = vm.runInNewContext(code, ctx); mod.VideoLayer.of = () => layer;
  const scenes = { g: game, d: { ui: { async fade() { faded++; if (fadeGate) await fadeGate.promise; } } } };
  return {
    ...mod, game, layer, scenes, listeners,
    choose(enabled) { tropical = enabled; for (const fn of listeners) fn(enabled); },
    chooseLang(l) { lang = l; for (const fn of langListeners) fn(l); },
    counts: () => ({ fetches, shown, hidden, faded }),
    tour() { return vm.runInNewContext(`${source('tour')}; SceneTour`, { ...ctx, defaultStory: () => 'grandma', recordedSceneryMatches: mod.recordedSceneryMatches, lowTier: g => g.renderer.qualityName === 'low', localStorage: { getItem: () => 'false' } }); },
  };
}

test('tropical title stays live without fetching recordings; switching off resumes only while title is active', async () => {
  const r = runtime({ enabled: true }), title = new r.TitleLoop(r.game);
  await title.start(); assert.equal(r.counts().fetches, 0); assert.equal(r.counts().shown, 0);
  r.choose(false); await flush(); assert.equal(r.counts().shown, 1); assert.equal(r.game.renderer.hold, true);
  for (const lang of ['vi', 'ko', 'ja', 'en']) { r.chooseLang(lang); await flush(); assert.equal(r.counts().shown, 1, 'language changes keep the same clip'); }
  r.choose(true); assert.equal(r.layer.owner, null); assert.equal(r.game.renderer.hold, false);
  title.stop(); assert.equal(r.listeners.size, 0);
  r.choose(false); await flush(); assert.equal(r.counts().shown, 1, 'starting the game permanently stops the backdrop');
});

test('enabling tropical trees overtakes a pending title manifest and a pending media play', async () => {
  for (const kind of ['manifest', 'show']) {
    const gate = deferred(), r = runtime(kind === 'manifest' ? { manifestGate: gate } : { showGate: gate });
    const title = new r.TitleLoop(r.game), started = title.start(); await flush();
    r.choose(true); assert.equal(r.game.renderer.hold, false);
    gate.resolve(); await started;
    assert.equal(r.layer.owner, null); assert.equal(r.game.renderer.hold, false);
    if (kind === 'manifest') assert.equal(r.counts().shown, 0, 'stale loading does not show a poster or clip');
    title.stop();
  }
});

test('rapid theme switches and tour suspension cannot revive an old pending title request', async () => {
  const gate = deferred(), r = runtime({ manifestGate: gate }), title = new r.TitleLoop(r.game);
  const started = title.start(); r.choose(true); r.choose(false);
  title.suspend(); gate.resolve(); await started; await flush();
  assert.equal(r.counts().shown, 0);
  await title.resume(); assert.equal(r.counts().shown, 1);
  r.choose(true); r.choose(false); await flush();
  assert.equal(r.counts().shown, 2); assert.equal(r.layer.owner, title); title.stop();
});

test('title theme changes leave another video owner alone', async () => {
  const r = runtime(), title = new r.TitleLoop(r.game); await title.start();
  const tour = {}; r.layer.owner = tour;
  r.choose(true); assert.equal(r.layer.owner, tour); assert.equal(r.game.renderer.hold, true);
  r.choose(false); await flush(); assert.equal(r.counts().shown, 1); title.stop();
});

test('tropical arrival returns to the live cutscene before mutating arrival state or showing recorded frames', async () => {
  const r = runtime({ enabled: true });
  assert.equal(await r.playArrival(r.scenes), false); assert.deepEqual(r.counts(), { fetches: 0, shown: 0, hidden: 0, faded: 0 });
  for (const kind of ['manifest', 'fade', 'show']) {
    const gate = deferred(), opts = kind === 'manifest' ? { manifestGate: gate } : kind === 'fade' ? { fadeGate: gate } : { showGate: gate };
    const pending = runtime(opts), playing = pending.playArrival(pending.scenes); await flush();
    pending.choose(true); gate.resolve(); assert.equal(await playing, false);
    assert.equal(pending.game.renderer.hold, false); assert.equal(pending.layer.owner, null);
  }
});

test('only original Grandma title/Explore scenery may use recordings, regardless of language, and switching off restores the video preference', () => {
  const r = runtime(), Tour = r.tour(), tour = Object.create(Tour.prototype);
  const box = { checked: false, parentNode: { classList: { toggle(name, value) { this.hidden = value; } } } };
  tour.g = { renderer: r.game.renderer, director: { quest: null } }; tour.videos = true;
  tour.el = { pick: { querySelector: () => box } };
  for (const lang of ['en', 'vi', 'ko', 'ja']) { r.chooseLang(lang); assert.equal(tour.canVideoTour(), true); }
  r.choose(true); assert.equal(tour.canVideoTour(), false); tour.syncVideoChoice();
  assert.equal(box.checked, true); assert.equal(box.parentNode.classList.hidden, true);
  r.choose(false); tour.syncVideoChoice(); assert.equal(box.checked, false); assert.equal(box.parentNode.classList.hidden, false);
  tour.g.director.quest = { state: { story: 'grandma' } }; tour.g.director.explore = false;
  assert.equal(tour.canVideoTour(), false, 'a story save still uses current live progress');
  tour.g.director.explore = true; assert.equal(tour.canVideoTour(), true);
  tour.g.director.quest.state.story = 'classic'; assert.equal(tour.canVideoTour(), false);
});

test('a scenery change hands an active video tour to live at the same time and pause state without disabling recordings', () => {
  const r = runtime(), Tour = r.tour(), tour = Object.create(Tour.prototype), calls = [];
  Object.assign(tour, { active: true, mode: 'video', videos: true, year: true, tour: { id: 'autumn' }, k: 2, t: 18.5, paused: true, done: false,
    closeVideo(quiet) { calls.push(['close', quiet]); this.active = false; },
    start(id, opts) { calls.push(['start', id, opts.live]); this.active = true; this.mode = 'live'; this.paused = false; return true; },
    setTour(k, t) { calls.push(['seek', k, t]); }, syncUi() { calls.push(['sync']); },
  });
  tour.vFallback(true);
  assert.equal(tour.videos, true); assert.equal(tour.paused, true); assert.equal(tour.mode, 'live');
  assert.deepEqual(calls, [['close', true], ['start', 'year', true], ['seek', 2, 18.5], ['sync']]);
});
