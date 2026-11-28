// © 2026 Bui Cong Nguyen · solluxlabs.com
// "Listening at the table" (docs/TRAVEL-LANGUAGE-PLAN.md): when Mika walks into a home whose little scene is due (the
// Nakanos' supper, Fujita's shop talk, Granny Tsuru's paper cranes), the household sits at its places and talks, voiced
// by baked clips in the language the player is learning, with the meaning in their own language under each line.
// Off until the player picks a language at the first such door ("Not now" keeps it off; Settings > Learn a language).
//
// Never while the story owns the screen (director.busy, a dialogue, a minigame, photo mode); the story's own dialogue is
// untouched. The household's indoor bodies are made only for the scene being played (≤ 4) and go when Mika leaves.
// A line plays its clip; without one (or with Settings > Voices on "Read aloud" and no clip) the device reads it, else
// blips, and with Voices off it is shown for a reading time. Pure picking lives in content/scenes and game/phrasebook.
import * as THREE from 'three';
import { tx, N_, getLang } from '../i18n/i18n.js';
import { valleyTime } from './valley-clock.js';
import { NPC } from '../actors/npc.js';
import { CAST } from './story.js';
import { VILLAGERS, RETURNING } from '../content/villagers.js';

const VILLAGER_MODEL = Object.fromEntries([...VILLAGERS, ...RETURNING].map(v => [v[0], v[1]]));
import { SCENES, SCENE_BY_ID, SCENE_HOUSES, LEARN_LANGS, dueScene, lineKey, lineLang, inLang, segments, scenePhrases } from '../content/scenes/index.js';
import { GLOSSARY } from '../content/scenes/glossary.js';
import { SpeechAudio } from '../engine/speech-audio.js';
import { SceneUI } from '../ui/scene-ui.js';
import { dayOf, loadBook, saveBook, loadPrefs, savePrefs, hearLine, hearScene, heardToday, recallFor, answerRecall, phraseOfDay, keep } from './phrasebook.js';

const V3 = THREE.Vector3;
const CAMS = ['Cam_wide', 'Cam_a', 'Cam_b'];
const PREFETCH = 28;            // metres from a door: its due scene's clips are fetched (as the room model is)
const AUTO_NEXT = 1.3;          // seconds after a line ends before the next one (Next skips the wait)

export class HouseScenes {
  constructor(d) {
    this.d = d;
    this.g = d.game;
    this.prefs = loadPrefs();
    const q = this.g.params?.get?.('learn');
    if (q && (LEARN_LANGS.includes(q) || q === 'off')) this.prefs.learn = q;      // ?learn=ko (QA, links)
    this.book = loadBook();
    this.speech = new SpeechAudio(this.g.audio);
    this.speech.muted = !!this.g.params?.has?.('mute');
    this.view = new SceneUI(d.ui);
    this.held = null;           // room id the household sits in (scene running or just played)
    this.running = null;        // { scene, i, ... } while a scene plays
    this.bodies = [];
    this.scanT = 0;
    this.potdShown = false;
  }

  get lang() { return LEARN_LANGS.includes(this.prefs.learn) ? this.prefs.learn : null; }
  get uiLang() { return getLang(); }
  // (the valley's date: Explore's Go to… days included, game/valley-clock.js)
  day() { return dayOf(valleyTime(this.g?.dayShift || 0)); }
  holds(room) { return !!room && this.held === room; }
  setPrefs(p) { this.prefs = { ...this.prefs, ...p }; savePrefs(this.prefs); }

  /** The scene due in a house now (in the chosen language; when none is chosen yet, the one that would play). */
  due(house) {
    if (!SCENE_HOUSES.has(house) || this.prefs.learn === 'off') return null;
    const lang = this.lang || 'en';
    return dueScene(house, { hour: this.g.shownHour?.() ?? this.g.time?.hour, heardToday: heardToday(this.book, lang, this.day()) });
  }

  /** Under the door prompt: "🏮 Supper time" when a scene is due there. */
  doorHint(house) {
    const s = this.due(house);
    return s ? `🏮 ${inLang(s.hint || s.title, this.uiLang)}` : '';
  }

  free() {
    const d = this.d;
    return !d.busy && !d.minigame && !d.tricks?.round && !d.yard?.round && !d.ui.dialogueOpen && !d.ui.overlay && !this.g.photo?.active && !d.scenes?.active && !this.running;
  }

  // ------------------------------------------------------------------ entering a house
  /** Director.enterHome calls this once Mika is inside room `id`. */
  async entered(id) {
    if (!SCENE_HOUSES.has(id)) return;
    // the story may have something to say on the way in: wait for it (at most 12 s), then only if she is still here
    const t0 = performance.now();
    while (!this.free() && performance.now() - t0 < 12000) await wait(200);
    if (!this.free() || this.g.interiors?.active !== id) return;
    const scene = this.due(id);
    if (scene) {
      if (this.prefs.learn === null) {
        const pick = await this.view.chooseLanguage(inLang(scene.title, this.uiLang));
        this.setPrefs({ learn: pick });
        if (pick === 'off') { this.d.ui.toast(tx(N_('You can change this in Settings > Learn a language.'))); return; }
      }
      if (this.g.interiors?.active === id && this.lang) await this.play(scene);
      return;
    }
    if (this.lang) await this.maybeRecall(id);
  }

  // ------------------------------------------------------------------ the household
  room() { return this.g.interiors?.rooms.get(this.g.interiors.active); }

  node(room, name) { return room?.nodes?.[name] || room?.model?.getObjectByName?.(name) || null; }

  spot(room, name) {
    const o = this.node(room, name);
    if (!o) return null;
    o.updateWorldMatrix(true, false);
    const pos = o.getWorldPosition(new V3());
    const f = new V3(0, 0, 1).applyQuaternion(o.getWorldQuaternion(new THREE.Quaternion()));
    return { pos, yaw: Math.atan2(f.x, f.z), pose: o.userData?.pose || 'stand', o };
  }

  /** A dressed indoor body for cast member `id` (a named neighbour or a story character), or null. */
  async bodyFor(id) {
    const g = this.g, d = this.d;
    const it = d.town?.byId?.get(id);
    const model = it?.p?.model || VILLAGER_MODEL[id] || (CAST[id] ? id : null);
    if (!model) return null;
    if (!g.assets.has(model)) { try { await g.assets.loadLater([model]); } catch { return null; } }
    if (!g.assets.has(model)) return null;           // (never a stand-in box at the table)
    const n = new NPC(g.scene, g.assets, g.world, `hs:${id}`, model, {});
    // dressed exactly like the outdoor body (same tinted materials), as the shopkeepers are (townlife.spawnKeepers)
    const outdoor = it?.n || d.npcs[id];
    if (outdoor?.model) {
      const mats = new Map();
      outdoor.model.traverse(o => { if (o.isMesh) mats.set(o.name, o.material); });
      n.model.traverse(o => { if (o.isMesh && mats.has(o.name)) o.material = mats.get(o.name); });
    }
    n.sceneCast = id;
    return n;
  }

  async seat(scene, room) {
    this.clearBodies();
    for (const [id, seatName] of Object.entries(scene.cast)) {
      const s = this.spot(room, seatName);
      if (!s) continue;
      const n = await this.bodyFor(id);
      if (!n) continue;
      n.place(s.pos.x, s.pos.z, s.yaw, s.pos.y);
      const sit = s.pose === 'sit' && n.anim?.has('Sit') ? 'Sit' : s.pose === 'floor' && n.anim?.has('SitGrass') ? 'SitGrass' : s.pose !== 'stand' && n.anim?.has('Sit') ? 'Sit' : null;
      n.seated = !!sit;
      n.restClip = sit || 'Idle';
      n.seatYaw = s.yaw;
      n.setIdle(n.restClip);
      n.setVisible(true);
      this.d.npcs[n.id] = n;
      this.bodies.push(n);
    }
  }

  clearBodies() {
    for (const n of this.bodies) {
      n.root.removeFromParent();
      n.gone = true;
      if (this.d.npcs[n.id] === n) delete this.d.npcs[n.id];
    }
    this.bodies = [];
  }

  props(room, name, on) {
    const o = name && room?.model?.getObjectByName?.(name);
    if (o) o.visible = on;
  }

  release() {
    const room = this.held && this.g.interiors?.rooms.get(this.held);
    if (room) for (const s of SCENES) if (s.house === this.held) this.props(room, s.props, false);
    this.clearBodies();
    this.held = null;
  }

  // ------------------------------------------------------------------ playing
  /**
   * Play a scene in the room Mika is in. opts.from: first line (0). -> true when heard to the end.
   */
  async play(scene, stage = null) {
    const g = this.g, d = this.d, I = g.interiors, room = stage ? null : this.room();
    const lang = this.lang;
    if ((!room && !stage) || !lang || this.running) return false;
    d.busy++;
    // stage (an outdoor scene, game/station-visitors.js): { bodies, ok() -> still on?, shot(cam, line, speaker) }
    const run = this.running = { scene, i: 0, lang, stop: false, wake: null, again: false, stage };
    let finished = false;
    try {
      if (!stage) {
        this.held = room.id;
        this.props(room, scene.props, true);
        await this.seat(scene, room);
        // Mika stands where she can see everyone
        const ms = this.spot(room, 'Spot_mika');
        if (ms) { g.player.teleport(ms.pos.x, ms.pos.z, ms.pos.y, ms.yaw); I.snapTamo?.(); }
      }
      this.prefetchScene(scene, lang);
      this.view.open({
        next: () => this.wake('next'),
        again: () => this.wake('again'),
        slow: () => { this.setPrefs({ speed: this.prefs.speed === 0.75 ? 1 : 0.75 }); this.view.setSlow(this.prefs.speed === 0.75); this.wake('again'); },
        leave: () => this.wake('leave'),
        chip: id => this.chip(id, lang),
      });
      this.view.setSlow(this.prefs.speed === 0.75);
      this.keys(true);
      for (run.i = 0; run.i < scene.lines.length && !run.stop;) {
        if (stage ? !stage.ok() : I.active !== room.id) { run.stop = true; break; }
        const r = await this.playLine(scene, run.i, lang);
        if (r === 'leave') { run.stop = true; break; }
        if (r === 'again') continue;
        run.i++;
      }
      finished = !run.stop;
      if (finished) {
        const day = this.day();
        const before = new Set(Object.keys(this.book.phrases).filter(id => this.book.phrases[id][lang]));
        hearScene(this.book, scene.id, lang, day);
        saveBook(this.book);
        const fresh = scenePhrases(scene, lang).filter(id => !before.has(id) || this.book.phrases[id][lang].first === day).length;
        if (fresh) d.ui.toast(fresh === 1 ? tx(N_('1 new phrase in your Phrasebook')) : tx(N_('{n} new phrases in your Phrasebook'), { n: fresh }));
      }
    } catch (e) {
      console.warn('[house-scenes] scene failed', e);
    } finally {
      this.keys(false);
      this.speech.stop();
      this.view.close();
      if (!stage) for (const n of this.bodies) { n.setIdle(n.restClip); if (!n.seated) n.targetFacing = n.seatYaw; }
      g.follow?.clearCutscene?.(false);
      this.running = null;
      d.busy--;
    }
    return finished;
  }

  /** Fetch a scene's clips ahead, each from its own voice language (a traveller's English line from the English set). */
  prefetchScene(scene, lang) {
    const by = new Map();
    scene.lines.forEach((l, i) => { const ll = lineLang(l, lang); if (!by.has(ll)) by.set(ll, []); by.get(ll).push(lineKey(scene.id, i)); });
    for (const [ll, keys] of by) this.speech.prefetch(keys, ll);
  }

  /** One line: camera, speaker, text, voice; waits for the clip (or reading time) and the player. -> 'next'|'again'|'leave' */
  async playLine(scene, i, lang) {
    const g = this.g, run = this.running, line = scene.lines[i], stage = run.stage;
    const bodies = stage ? stage.bodies : this.bodies;
    const speaker = bodies.find(n => n.sceneCast === line.who);
    if (stage) stage.shot(line.cam ?? 0, line, speaker); else this.shot(this.room(), line.cam ?? 0);
    const c = CAST[line.who] || {};
    // the speaker talks (standing people gesture; seated ones keep their seat), the others look at them
    for (const n of bodies) {
      if (n === speaker) {
        if (!n.seated) { if (line.gesture && n.anim?.has(line.gesture)) n.gesture(line.gesture); else if (n.anim?.has('Talk')) n.setIdle('Talk'); }
      } else {
        n.setIdle(n.restClip);
        const who = speaker?.pos || (line.who === 'mika' ? g.player.pos : null);
        if (who && !n.seated) n.lookAt(who.x, who.z);
      }
    }
    if (line.who === 'mika' && speaker == null) { const look = bodies[0]?.pos; if (look) g.player.facing = Math.atan2(look.x - g.player.pos.x, look.z - g.player.pos.z); }
    const ui = this.uiLang;
    // a traveller's line in English (`say`) is shown and voiced in English, with its meaning under it; no chips unless
    // English is the language being learned
    const ll = lineLang(line, lang);
    this.view.setTitle(inLang(scene.title, ui), `${i + 1}/${scene.lines.length}`);
    this.view.line({
      name: tx(c.name || line.who), color: c.color, lang: ll,
      segments: ll === lang ? segments(line, lang) : [{ text: line[ll] || '' }],
      meaning: this.prefs.meaning && ui !== ll ? line[ui] || line.en : null,
      draft: scene.review?.[ll] === 'draft' && !!g.params?.has?.('qa'),
    });
    hearLine(this.book, scene.id, i, lang, this.day());
    saveBook(this.book);
    this.potdHeard(scene, i, lang);
    const key = lineKey(scene.id, i);
    const r = await this.voice(key, line, ll, c);
    if (r) return r;
    return this.waitFor(AUTO_NEXT);
  }

  /** Voice one line: the baked clip, else the device's voice, else blips; Voices off = a quiet reading time. */
  async voice(key, line, lang, cast) {
    const ui = this.d.ui, mode = ui.voice?.mode;
    const run = this.running;
    let waitDone = null;
    const playP = mode === 'off' ? Promise.resolve(false) : this.speech.play(key, lang, { slow: this.prefs.speed === 0.75 });
    const r = await Promise.race([playP.then(ok => ({ ok })), this.waitFor(1e9).then(x => ({ act: x }))]);
    if (r.act) { this.speech.stop(); ui.voice?.stop(); return r.act; }
    if (r.ok) return null;
    // no clip: the device reads it (or blips), then a reading time
    const text = line[lang] || '';
    if (mode === 'read' && ui.voice?.reads(lang)) ui.voice.speak([{ text, cast }], lang);
    else if (mode !== 'off') ui.audio?.blip?.(cast?.pitch ?? 1);
    waitDone = this.waitFor(Math.min(7, 1.2 + text.length * (lang === 'ko' ? 0.16 : 0.07)) * (this.prefs.speed === 0.75 ? 1.3 : 1));
    const a = await waitDone;
    if (a !== 'next') ui.voice?.stop();
    return a === 'timeout' ? null : a;
  }

  /** Resolve on the player's next action ('next' | 'again' | 'leave') or 'timeout' after s seconds. */
  waitFor(s) {
    const run = this.running;
    return new Promise(resolve => {
      const t = s < 1e8 ? setTimeout(() => { if (run.wake === w) run.wake = null; resolve('timeout'); }, s * 1000) : 0;
      const w = act => { clearTimeout(t); run.wake = null; resolve(act); };
      // more than one waiter at a time (the clip race and the timer): all of them hear the action
      const prev = run.wake;
      run.wake = prev ? act => { prev(act); w(act); } : w;
    });
  }

  wake(act) {
    const run = this.running;
    if (!run) return;
    if (act === 'leave') run.stop = true;
    const w = run.wake;
    run.wake = null;
    w?.(act === 'next' ? 'next' : act);
    if (act !== 'next') this.speech.stop();
    else this.speech.stop();
  }

  shot(room, k) {
    const g = this.g;
    const o = this.node(room, CAMS[k]) || this.node(room, CAMS[0]);
    if (!o || !g.follow) return;
    const pos = o.getWorldPosition(new V3());
    const lk = o.userData?.look;
    const look = lk ? room.model.localToWorld(new V3(lk[0], lk[1], lk[2])) : pos.clone().add(new V3(0, 0, 1).applyQuaternion(o.getWorldQuaternion(new THREE.Quaternion())));
    // a tall phone screen sees less of the table across: step back along the shot (still inside the walls)
    const aspect = g.camera?.aspect ?? 1;
    if (aspect < 0.95) {
      const back = pos.clone().sub(look).multiplyScalar(THREE.MathUtils.clamp(1.25 / Math.max(aspect, 0.4), 1, 2.2));
      pos.copy(g.interiors?.clampToRoom?.(look.clone().add(back), 0.42) || pos);
    }
    g.follow.cutscene({ pos, look }, 0.001);           // a cut, never a fast pan
  }

  keys(on) {
    if (on && !this.onKey) {
      this.onKey = e => {
        if (!this.running || this.view.card || e.repeat) return;
        const map = { Space: 'next', Enter: 'next', KeyE: 'next', NumpadEnter: 'next', KeyR: 'again', Escape: 'leave', KeyS: 'slow' };
        const act = map[e.code];
        if (!act) return;
        e.preventDefault(); e.stopImmediatePropagation();
        if (act === 'slow') this.view.handlers?.slow?.(); else this.wake(act);
      };
      addEventListener('keydown', this.onKey, { capture: true });
    } else if (!on && this.onKey) { removeEventListener('keydown', this.onKey, { capture: true }); this.onKey = null; }
  }

  /** A phrase chip was tapped: its card (the line waits while it is open). */
  async chip(id, lang) {
    const e = GLOSSARY[id];
    if (!e) return;
    this.speech.stop();
    const p = this.book.phrases[id]?.[lang];
    const s = SCENES.find(sc => sc.lines.some(l => (l.chips?.[lang] || []).some(([, x]) => x === id)));
    const li = s ? s.lines.findIndex(l => (l.chips?.[lang] || []).some(([, x]) => x === id)) : -1;
    await this.view.phrase(e, lang, this.uiLang, {
      play: () => { if (s && li >= 0) this.speech.play(lineKey(s.id, li), lang, { slow: this.prefs.speed === 0.75 }); },
      keep: on => { keep(this.book, id, lang, on); saveBook(this.book); },
      kept: !!p?.kept, roman: this.prefs.roman,
    });
  }

  // ------------------------------------------------------------------ recall, phrase of the day
  async maybeRecall(house) {
    const lang = this.lang, day = this.day();
    const r = recallFor(this.book, house, lang, day);
    if (!r) return;
    this.d.busy++;
    try {
      const choices = r.choices.map(i => { const ll = lineLang(r.scene.lines[i], lang); return { text: r.scene.lines[i][ll], lang: ll, play: () => this.speech.play(lineKey(r.scene.id, i), ll) }; });
      const right = await this.view.recall({ q: inLang(r.q, this.uiLang), choices, answer: r.choices.indexOf(r.answer), chime: () => this.g.audio?.chime?.(2) });
      answerRecall(this.book, r.scene.id, lang, day, right);
      saveBook(this.book);
    } finally { this.speech.stop(); this.d.busy--; }
  }

  /** On the first moments of a day with a language chosen: the phrase of the day. */
  potd() {
    const lang = this.lang;
    if (!lang || this.potdShown) return;
    this.potdShown = true;
    const day = this.day();
    const cur = this.book.potd;
    if (cur?.day === day && cur.lang === lang) return;
    const p = phraseOfDay(this.book, lang, day);
    const e = p && GLOSSARY[p.id];
    if (!e) return;
    this.book.potd = { day, lang, id: p.id, done: false };
    saveBook(this.book);
    this.d.ui.toast(tx(N_('Phrase of the day: {phrase}'), { phrase: e[lang]?.say || p.id }));
  }

  potdHeard(scene, i, lang) {
    const P = this.book.potd;
    if (!P || P.done || P.day !== this.day() || P.lang !== lang) return;
    if (!(scene.lines[i].chips?.[lang] || []).some(([, id]) => id === P.id)) return;
    P.done = true;
    saveBook(this.book);
    this.g.audio?.chime?.(4);
    this.d.ui.toast(tx(N_('You heard the phrase of the day!')));
  }

  // ------------------------------------------------------------------ Phrasebook (journal) helpers
  /** Replay one heard line audio-only (the Phrasebook). */
  replay(sceneId, i, lang = this.lang) {
    if (!lang) return Promise.resolve(false);
    return this.speech.play(lineKey(sceneId, i), lineLang(SCENE_BY_ID.get(sceneId)?.lines[i], lang), { slow: this.prefs.speed === 0.75 });
  }

  // ------------------------------------------------------------------ per frame
  update(dt) {
    const I = this.g.interiors;
    if (this.held && I?.active !== this.held && !this.running) this.release();
    // keep the bodies looking right after a scene (people facing the table, not Mika's every step)
    if ((this.scanT -= dt) > 0) return;
    this.scanT = 1;
    if (this.lang && !this.potdShown && this.free() && this.d.quest) this.potd();
    // fetch the due scene's clips while Mika walks up to its door (as the room's model is)
    const lang = this.lang, p = this.g.player?.pos;
    if (!lang || !p || I?.active || !I) return;
    for (const door of I.doors) {
      if (!SCENE_HOUSES.has(door.id)) continue;
      if ((door.outside.x - p.x) ** 2 + (door.outside.z - p.z) ** 2 > PREFETCH * PREFETCH) continue;
      const s = this.due(door.id);
      if (s) this.prefetchScene(s, lang);
    }
  }
}

const wait = ms => new Promise(r => setTimeout(r, ms));
export { SCENE_BY_ID };
