// The Mini games menu at runtime: starts any game from the catalogue (content/minigames.js) straight away, with no story
// progress and no teacher required. Two kinds of session:
//   * the title's "Mini games" button resolves ui.title() as an Explore session (its own save slot "explore": every way
//     is open, scores and learned tricks are kept there). main.js is not involved: the UI leaves `ui.pendingLaunch`,
//     Director.begin() hands it to launchFirst() once the world is ready.
//   * the pause menu's "Mini games" entry. In Explore it launches the same way. In a STORY save it borrows the valley like
//     the scene tour does: a throwaway quest (the valley after the story, every gate open) stands in for the real one, saving
//     is blocked, and afterwards Mika, the season, the hour and the story are put back exactly as they were.
// A launch: fade out, put the look (season, hour) and Mika at the game's place, (first time) the teacher's intro as a short
// local scene, then the game's own round runner (tricks.play, yard.play, fishing session, sky gaze, workshop).
import * as THREE from 'three';
import { buildCatalogue, launchPlan, recordOf } from '../content/minigames.js';
import { TRICK } from '../content/tricks.js';
import { setGameOn } from '../content/yard.js';
import { SPOTS } from './fishing/places.js';
import { DIALOGUE } from './story.js';
import { tx } from '../i18n/i18n.js';
import { storyId, useStory } from './stories/index.js';
import { Quest } from './quest.js';
import { stateAt } from './fastforward.js';
import { MinigamePicker } from '../ui/minigames-ui.js';
import { MinigameStop } from '../ui/minigame-stop.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));

export class MinigameMenu {
  constructor(director) {
    this.d = director;
    this.g = director.game;
    this.ui = director.ui;
    this.catalogue = buildCatalogue();
    this.session = null;         // { story: boolean, saved } while a launched session owns the valley
    this.running = false;        // a launch is in progress (fade, place, round)
    this.current = null;         // the entry being played
    this.picker = this.ui.mgPicker ??= new MinigamePicker(this.ui);
    this.buildChip();
    this.stopControl = new MinigameStop(director);
  }

  get st() { return this.d.q?.state; }
  /** The entry for an id (null when that game is not in this build). */
  entry(id) { return this.catalogue.find(e => e.id === id) || null; }

  /** Can the menu open now? Not inside a dialogue, a cutscene, a round or a launch. */
  canOpen() {
    const d = this.d;
    return !!d.quest && !this.running && !d.busy && !d.minigame && !d.scenes?.active && !d.tricks?.round && !d.yard?.round && !d.workshop?.active
      && !d.tourLock && !this.g.sky?.active && !d.sky?.active && !this.g.player.mounted && !this.g.kite?.active;   // (the kite's swoop-in comes before she is mounted)
  }

  // ------------------------------------------------------------------ the picker
  /** Open the picker (from the chip or the pause menu). Resolves when a game was chosen and has finished, or at once on cancel. */
  async open() {
    if (!this.canOpen()) return false;
    const g = this.g, wasPaused = g.paused;
    if (!wasPaused) g.togglePause?.(true, true);        // the game stands still behind the picker
    const e = await this.picker.open({ st: this.st, current: this.current?.id });
    if (!e) { if (!wasPaused && g.paused) g.togglePause?.(false); return false; }
    await this.launch(e);
    return true;
  }

  // ------------------------------------------------------------------ the launch
  /** The title's launch: called by Director.begin once the quest and the world are ready. */
  async launchFirst(id) {
    const e = this.entry(id);
    if (!e) { this.ui.fade(false, 300); return false; }
    this.session = { story: false };
    await this.launch(e, { fromTitle: true });
    return true;
  }

  /** Borrow the valley for a story save: a throwaway "valley after the story" quest, no saving. Returns what to give back. */
  borrow() {
    const d = this.d, g = this.g, p = g.player, st = d.quest.state;
    let state;
    try { state = stateAt('e.done', 'together', st.story || storyId()); } catch { state = stateAt('e.done', 'together', 'grandma'); }
    state.flags = { ...state.flags, explore: true };
    // what the save has already learned travels along (so the picker's bests are honest); it never travels back
    for (const k of ['tricks', 'yard', 'workshop', 'starGroups', 'fishLog', 'fishBest', 'wishes', 'friends']) if (st[k] !== undefined) state[k] = JSON.parse(JSON.stringify(st[k]));
    const q = new Quest(state, { story: state.story });
    const saved = {
      quest: d.quest, seasonOverride: g.seasonOverride ?? null, timeOverride: g.timeOverride ?? null, cycleHour: g.cycleHour, weatherOff: g.weatherOff,
      pos: p.pos.clone(), facing: p.facing, tourLock: d.tourLock, explore: d.explore, actCooldown: d.actCooldown,
      timetable: d.timetable, drawbridgeAngle: d.drawbridgeAngle, saveClock: d.saveClock, stepClock: d.stepClock, lastHour: d.lastHour, bees: d.bees,
      story: storyId(), interior: g.interiors?.active || null, yaw: g.follow.yaw, pitch: g.follow.pitch,
      zoom: g.follow.zoomTarget, interiorZoom: g.interiors?.savedZoom,
    };
    d.quest = q; g.quest = q;
    d.tourLock = true;                       // canSave() is false: nothing a launched game does reaches a save file
    this.session = { story: true, saved };
    return saved;
  }

  /** Give a borrowed story save back: Mika, the season and hour, the story. */
  async giveBack() {
    const s = this.session?.saved;
    if (!s) return;
    const d = this.d, g = this.g, p = g.player;
    if (g.interiors?.active) { try { await g.interiors.exit(); } catch { /* ignore */ } }
    d.quest = s.quest; g.quest = s.quest; useStory(s.story);
    d.tourLock = s.tourLock; d.explore = s.explore;
    d.timetable = s.timetable; d.drawbridgeAngle = s.drawbridgeAngle; d.saveClock = s.saveClock; d.stepClock = s.stepClock; d.lastHour = s.lastHour; d.bees = s.bees;
    this.setLook(s.seasonOverride, s.timeOverride, s.cycleHour);
    g.weatherOff = s.weatherOff;
    g.applyLook();
    // Rooms live away from the outdoor valley. Restore visibility/collisions before the exact saved placement.
    if (s.interior) await g.interiors?.enter(s.interior);
    p.teleport(s.pos.x, s.pos.z, s.pos.y, s.facing);
    g.follow.first = true;
    g.follow.yaw = s.yaw ?? s.facing; g.follow.pitch = s.pitch ?? g.follow.pitch;
    g.follow.zoomTarget = s.zoom;
    if (g.interiors) g.interiors.savedZoom = s.interiorZoom;
    if (d.tamoAround?.()) d.tamo.show(p.pos.clone().add(new THREE.Vector3(0, 1.6, 0)));
    else d.tamo.hide?.();                       // (a save before Tamo hatched: she was borrowed for the games)
    this.d.ui.applyStory?.();
    d.refreshObjective?.();
    d.actCooldown = Math.max(0.5, s.actCooldown || 0);
    this.session = null;
  }

  setLook(season, hour, cycle) {
    const g = this.g;
    g.seasonOverride = season ?? null;
    g.timeOverride = hour ?? null;
    g.cycleHour = cycle;
    g.applyLook();
  }

  /** Put Mika at a place facing a direction under the fade: no transition the camera has to follow. */
  place(stand) {
    const g = this.g, p = g.player;
    p.teleport(stand.x, stand.z, undefined, stand.face);
    p.vel?.set(0, 0, 0);
    g.follow.first = true;
    g.follow.yaw = stand.face;
    g.follow.pitch = 0.3;
    g.follow.clearCutscene?.(true);
    // Tamo comes along (a teleport leaves a follower behind)
    const d = this.d;
    if (d.tamoAround?.()) d.tamo.show(p.pos.clone().add(new THREE.Vector3(0, 1.6, 0)));
  }

  /**
   * Start a game: fade, look, place, intro, round. Resolves after the round (the results card included).
   * In a story save the valley is given back afterwards; in an Explore session Mika stays at the place.
   */
  async launch(e, { fromTitle = false } = {}) {
    const d = this.d, g = this.g, ui = this.ui;
    if (this.running || !e) return;
    this.running = true;
    this.current = e;
    this.hideChip();
    const plan = launchPlan(e);
    let borrowed = false;
    this.failed = false;
    try {
      ui.prompt?.(null);
      if (!fromTitle) await ui.fade(true, 380);
      if (!this.session && !d.explore) { this.borrow(); borrowed = true; }
      else if (!this.session) this.session = { story: false };
      // the screen the menu sits on: close every panel and the pause
      ui.closeAll?.();
      g.paused = false;
      g.input.releaseAll?.();
      if (g.interiors?.active) { try { await g.interiors.exit(); } catch { /* ignore */ } }
      // the look: a fixed season and hour (the clock stands still, as the games expect)
      this.setLook(plan.season, plan.hour, undefined);
      if (e.kind !== 'workshop') this.place(plan.stand);
      d.refreshObjective?.();
      g.roundLight?.hold('menu');              // (game/round-light.js: on from here to the end of the launch, and a little after)
      await sleep(60);
      await this.run(e, plan);
    } catch (err) {
      console.error('[minigames] launch failed', e.id, err);
      this.failed = true;
      ui.toast?.(tx('{name} is not ready yet', { name: tx(e.name) }), e.icon);
    } finally {
      this.running = false;
      d.actCooldown = Math.max(d.actCooldown || 0, 0.5);
      if (borrowed || this.session?.story) {
        await ui.fade(true, 300);
        g.roundLight?.release('menu');
        await this.giveBack();
        this.current = null;
        await ui.fade(false, 420);
      } else {
        // an Explore session: Mika stays in the valley. A game that moved her far (the river wade, a kite run) or left her in the
        // cottage puts her back at its place under the fade.
        const p = g.player;
        if (g.interiors?.active || Math.hypot(p.pos.x - plan.stand.x, p.pos.z - plan.stand.z) > 14 || this.failed) {
          await ui.fade(true, 250);
          if (g.interiors?.active) { try { await g.interiors.exit(); } catch { /* ignore */ } }
          this.place(plan.stand);
        }
        await ui.fade(false, 300);
        g.roundLight?.releaseLater('menu');     // the next game is probably picked in a moment: no switching twice
        this.afterGame(e);
      }
    }
  }

  /** Free roam after a game in an Explore session: a floating hint and the chip. */
  afterGame(e) {
    // after the round's own result toast has gone, so the two never pile up at the top of a phone
    clearTimeout(this.hintT);
    this.showChip();
    // back to the list of games, so the next one is a tap away (closing the list leaves Mika free in the valley, with the chip).
    // A QA run keeps the chip and a hint unless it asks for the list with ?autolist=1: the browser suites press the chip.
    const qa = typeof window !== 'undefined' && !!window.__STARLINE_QA__ && this.g.params?.get?.('autolist') !== '1';
    this.hintT = setTimeout(() => {
      if (!this.session || this.session.story || this.running) return;
      if (qa || !this.canOpen()) this.ui.toast?.(tx('Menu → Mini games to pick another'), e?.icon);
      else this.open();
    }, qa ? 2600 : 900);
  }

  // ------------------------------------------------------------------ the games
  async run(e, plan) {
    const d = this.d, g = this.g, ui = this.ui;
    if (e.kind === 'trick') {
      const t = TRICK[e.ref];
      if (!t) throw new Error(`no trick ${e.ref}`);
      const st = this.st;
      const rec = (st.tricks[t.id] = { learned: true, best: 0, stars: 0, plays: 0, ...(st.tricks[t.id] || {}) });
      await ui.fade(false, 420);
      // the teacher is not here: the intro plays as a short local scene, once
      if (!rec.intro) {
        rec.intro = true;
        const lines = DIALOGUE[t.intro];
        if (lines) { d.busy++; try { await d.dialogueBody(lines, { local: true }); } finally { d.busy--; } }
      }
      await d.tricks.play(t.id);
    } else if (e.kind === 'yard') {
      // the yard's own API: one court context per yard (y.ctl), the scoreboard game kept in the save (content/yard.js)
      const y = d.yard, c = y.ctl?.[e.yard] || null;
      if (c) { setGameOn(y.save, c.Y, e.ref); c.override = e.ref; } else y.save.game = e.ref;
      this.hideChip();
      await y.play(c || undefined);
    } else if (e.kind === 'fish') {
      const spot = SPOTS[e.ref];
      await ui.fade(false, 420);
      d.startFishing(spot);
      await this.until(() => !d.minigame);
    } else if (e.kind === 'sky') {
      const spot = g.director?.sky?.spots.find(s => s.id === e.ref) || d.sky.spots.find(s => s.id === e.ref);
      if (!spot) throw new Error(`no sky spot ${e.ref}`);
      // the Star Kite carries her up for a clear sky ("Fly up"): a throwaway or Explore valley owns it, as for the workshop
      if (!(d.quest.state.inv.kite > 0)) d.quest.state.inv.kite = 1;
      await ui.fade(false, 420);
      d.sky.start(spot);
      await this.until(() => !d.sky.active && !(d.sky.returning > 0));
    } else if (e.kind === 'workshop') {
      const ks = d.kiteStand;
      if (!ks) throw new Error('no workshop');
      const st = this.st;
      st.inv.kite = Math.max(1, st.inv.kite || 0);
      st.flags.hasTamo = true;
      if (g.interiors) await g.interiors.enter(ks.interior);
      await ui.fade(false, 420);
      await d.workshop.play();
    }
  }

  /** Wait (real time) for a condition; gives up after `max` seconds so a stuck game cannot hold the menu. */
  async until(fn, max = 3600) {
    const t0 = performance.now();
    await sleep(250);
    while (!fn() && performance.now() - t0 < max * 1000) await sleep(120);
  }

  // ------------------------------------------------------------------ the chip
  buildChip() {
    if (typeof document === 'undefined') { this.chip = null; return; }
    if (!document.getElementById('mgChipCss')) {
      const s = document.createElement('style');
      s.id = 'mgChipCss';
      s.textContent = `#mgChip{position:fixed;left:calc(10px + env(safe-area-inset-left,0px));top:calc(10px + env(safe-area-inset-top,0px));z-index:18;display:flex;align-items:center;gap:6px;
 min-height:44px;padding:6px 14px;border:0;border-radius:999px;background:rgba(255,247,232,.94);color:#5a3a22;box-shadow:0 4px 14px rgba(40,20,0,.25);
 font:700 15px Nunito,system-ui,sans-serif;cursor:pointer;zoom:var(--ui-scale,1)}
#mgChip:hover,#mgChip:focus-visible{background:#fff;outline:2px solid #f08a3c}
#mgChip.hidden{display:none}
body.trick-round #mgChip,body.tour-on #mgChip{display:none}`;
      document.head.appendChild(s);
    }
    const b = document.createElement('button');
    b.id = 'mgChip'; b.type = 'button'; b.className = 'hidden'; b.dataset.i18n = ''; b.dataset.i18nSrc = 'Mini games ☰';
    b.textContent = tx('Mini games ☰');
    b.addEventListener('click', () => this.open());
    document.body.appendChild(b);
    this.chip = b;
  }
  showChip() { if (this.chip && this.session && !this.session.story) this.chip.classList.remove('hidden'); }
  hideChip() { this.chip?.classList.add('hidden'); }

  /** Every frame: the chip shows only while nothing owns the screen. */
  update(dt = 0.016) {
    this.stopControl?.update();
    const c = this.chip;
    if (!c || !this.session || this.session.story) return;
    const d = this.d;
    const free = this.canOpen() && !this.ui.overlay && !this.ui.dialogueOpen && !d.yard?.round;
    c.classList.toggle('hidden', !free);
    // top-left, but under the objective panel (it grows on a phone and with a long translation)
    if (free && (this.posT = (this.posT || 0) - dt) <= 0) {
      this.posT = 0.4;
      const o = document.getElementById('objective'), r = o && !o.classList.contains('hidden') ? o.getBoundingClientRect() : null;
      const top = r && r.width > 0 ? Math.round(r.bottom + 8) : 10;
      if (c._top !== top) { c._top = top; c.style.top = r && r.width > 0 ? `${top}px` : `calc(10px + env(safe-area-inset-top,0px))`; }
    }
  }

  /** Records for the picker (title: the Explore save; in the game: the quest). */
  recordFor(e) { return recordOf(e, this.st); }
}
