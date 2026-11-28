// © 2026 Bui Cong Nguyen · solluxlabs.com
// The station visitors (content/visitors.js): Vita and her little sister Bibi, two travellers who come off the train at
// Hoshi Station, take photos on the square, ask Mika the way in a voiced little scene (content/scenes/station.js, played
// by game/house-scenes.js on an outdoor "stage"), walk the roads to the Forest Shrine, spend the evening there and leave
// on the evening train. Explore mode only (never in a story save, a play zone or Sing & Play, so never next to a group
// performance either); ?visitors=off hides them, ?visitors=on brings them into a story save too (QA).
//
// Cheap by design: where they are is a little walker (a distance along a path) that runs whether anyone sees them or not;
// their bodies (one skinned mesh each, the light file on Low) are fetched and made only when Mika comes within LOAD
// metres of them, and dropped again beyond DROP. Out of sight their walk runs FAST times quicker, so a 300 m trek to the
// shrine does not take a whole evening while Mika is elsewhere.
import { tx, N_ } from '../i18n/i18n.js';
import { NPC } from '../actors/npc.js';
import { STOPS } from '../world/railway.js';
import { route } from '../world/roads.js';
import { SCENE_BY_ID, inLang } from '../content/scenes/index.js';
import { heardToday, recallFor } from './phrasebook.js';
import { VISITORS, SCENE_ID, HOURS, phaseAt, SPOTS, STAIRS, STONE_WALK, STONE_TOP, onStones, WALK_SPEED, FAST, SEEN, LOAD, DROP, along, beside, CHATTER } from '../content/visitors.js';
import * as THREE from 'three';

const V3 = THREE.Vector3;
const STATION_NEAR = 60;        // metres from the station: their bodies are ready before Mika reaches the square
const TRAIN_WAIT = 60;          // seconds they wait for the train to pull in before they are simply there
const ASK = N_('Two travellers are asking the way. Which language would you like to listen in?');

export class StationVisitors {
  constructor(d) {
    this.d = d;
    this.g = d.game;
    this.phase = null;
    this.stage = 'away';         // away | train | plan (running this.plan) | hidden
    this.plan = [];              // steps: { walk: [[x, z]...], speed } | { act: { vita, bibi }, t, face } | { hide: t } | { place: [x, z] } | { loop: fn }
    this.step = null;
    this.at = { x: SPOTS.square[0].x, z: SPOTS.square[0].z, yaw: Math.PI };   // Vita (Bibi follows her)
    this.bibi = null;            // Bibi's own place while they stand somewhere: { x, z, yaw }
    this.bodies = null;          // { vita: NPC, bibi: NPC } once made
    this.loading = false;
    this.scanT = 0;
    this.talking = false;
    this.sceneDone = false;      // asked their way (scene or plain dialogue) during this visit
    this.squareI = 0;
    this.shrineI = 0;
    for (const v of VISITORS) {
      d.interact(`talk:${v.id}`, null, () => tx('Talk to {name}', { name: tx(v.name) }),
        () => this.canTalk(v.id), () => this.talk(v.id), 2.6, () => this.bodies?.[v.id]?.head(), () => -0.4);
    }
  }

  get enabled() {
    const d = this.d, q = this.g.params?.get?.('visitors');
    if (q === 'off' || d.singplay || this.g.zone) return false;
    return !!d.explore || q === 'on';
  }

  // ------------------------------------------------------------------ the day
  /** Called every frame by the director. */
  update(dt) {
    const g = this.g, d = this.d;
    if ((this.scanT -= dt) <= 0) {
      this.scanT = 0.5;
      let ph = this.enabled ? phaseAt(g.shownHour()) : 'away';
      if (this.phase === 'gone' && ph !== 'away' && ph !== 'day') ph = 'gone';     // left on the evening train: not back tonight
      if (ph !== this.phase) this.enter(ph, this.phase);
      else if (ph === 'day' && this.stage === 'plan' && this.where === 'square' && g.shownHour() >= HOURS.walk) this.toShrine();
      this.bodiesNeeded();
    }
    if (this.talking || this.stage === 'away') return;
    // nothing moves while the story or a scene owns the screen (the valley's people wait too)
    if (d.busy > 0 || d.scenes?.active) return;
    if (this.stage === 'train') {
      this.trainT += dt;
      const T = g.railway?.train;
      const atStation = T && T.target === null && Math.abs(T.s - STOPS.station) < 20;
      if (atStation || this.trainT > TRAIN_WAIT) this.offTrain();
      return;
    }
    if (this.stage === 'hidden') {
      // in the station, waiting for the evening train: gone once it has left (or the night has come)
      const T = g.railway?.train;
      if (T && T.target !== null && this.trainSeen) { this.stage = 'away'; this.dropBodies(); this.phase = 'gone'; }
      if (T && T.target === null && Math.abs(T.s - STOPS.station) < 20) this.trainSeen = true;
      return;
    }
    this.runPlan(dt);
    this.pose(dt);
  }

  /** A new part of their day (or the clock was moved in Settings). */
  enter(ph, was) {
    this.phase = ph;
    const p = this.g.player?.pos;
    if (ph === 'away') { this.stage = 'away'; this.dropBodies(); this.sceneDone = false; return; }
    if (ph === 'gone') return;
    if (ph === 'day') {
      if (was === 'day') return;
      this.sceneDone = false;
      const nearStation = p && Math.hypot(p.x - SPOTS.platform.x, p.z - SPOTS.platform.z) < LOAD;
      // the morning train brings them when Mika is there to see it; otherwise they are already on the square
      if (nearStation && this.g.shownHour() < 12) { this.stage = 'train'; this.trainT = 0; this.where = 'train'; this.show(false); return; }
      this.placeAt(SPOTS.square[0]);
      this.squareLoop();
      return;
    }
    if (ph === 'evening') {
      if (this.where === 'toShrine' || this.where === 'shrine') return;
      if (this.stage === 'plan' && this.where === 'square' && this.bodies && this.seen()) { this.toShrine(); return; }
      this.placeAt(SPOTS.shrine[0]);
      this.shrineLoop();
      return;
    }
    if (ph === 'leaving') this.goHome();
  }

  placeAt(s) {
    this.at = { x: s.x, z: s.z, yaw: s.face ?? 0 };
    this.bibi = null;
    this.stage = 'plan';
    this.show(true);
  }

  /** The train is in: they step off onto the platform, look about, then go through the station to the square. */
  offTrain() {
    this.placeAt({ ...SPOTS.platform, face: Math.PI });
    const door = this.door();
    this.where = 'platform';
    this.plan = [
      { act: { vita: 'LookAround', bibi: 'Point' }, t: 4.5, face: 0 },          // the train and the valley beyond it
      { act: { vita: 'Idle', bibi: 'Cheer' }, t: 4.5, photo: true, face: Math.PI },   // a photo: Bibi poses by the station wall, the train behind her sister
      { walk: [[SPOTS.platform.x, SPOTS.platform.z], [-98, 113.4]] },           // to the station's back door
      { hide: 2.5 },
      { place: [door.x, door.z] },
      { walk: [[door.x, door.z], [SPOTS.square[0].x, SPOTS.square[0].z]] },
      { then: () => this.squareLoop() },
    ];
    this.step = null;
  }

  door() { return this.d.town?.roads?.doors?.station || { x: -98, z: 104.8 }; }

  /** On the square: photos, pointing at the station, a little wander between three places, until they have asked the way. */
  squareLoop() {
    this.where = 'square';
    const s = SPOTS.square[this.squareI % SPOTS.square.length], n = SPOTS.square[(this.squareI + 1) % SPOTS.square.length];
    this.squareI++;
    this.plan = [
      { act: { vita: 'Idle', bibi: 'Cheer' }, t: 5, photo: true },
      { act: { vita: 'LookAround', bibi: 'Point' }, t: 4.5, face: s.face },
      { act: { vita: 'Talk', bibi: 'Idle' }, t: 4, pair: true },
      { walk: [[this.at.x, this.at.z], [n.x, n.z]] },
      { then: () => this.squareLoop() },
    ];
    this.step = null;
  }

  shrineLoop() {
    this.where = 'shrine';
    const s = SPOTS.shrine[this.shrineI % SPOTS.shrine.length], n = SPOTS.shrine[(this.shrineI + 1) % SPOTS.shrine.length];
    this.shrineI++;
    this.plan = [
      { act: { vita: 'LookAround', bibi: 'Point' }, t: 5, face: s.face },       // the hall and its lanterns
      { act: { vita: 'Idle', bibi: 'Cheer' }, t: 5, photo: true },
      { act: { vita: 'Bow', bibi: 'Bow' }, t: 3.5, face: 0 },                  // a bow toward the hall
      { act: { vita: 'Talk', bibi: 'Idle' }, t: 5, pair: true },
      { walk: [[this.at.x, this.at.z], [n.x, n.z]] },
      { then: () => this.shrineLoop() },
    ];
    this.step = null;
  }

  /** The whole way from where they are to the shrine yard: roads, the ford's stepping stones, the stone steps. */
  shrinePath(from) {
    const roads = this.d.town?.roads;
    const a = roads && route(roads, { x: from.x, z: from.z }, SPOTS.fordWest);
    const b = roads && route(roads, SPOTS.fordEast, SPOTS.stairFoot);
    const yard = SPOTS.shrine[0];
    return [...(a || [[from.x, from.z], [SPOTS.fordWest.x, SPOTS.fordWest.z]]), ...STONE_WALK, ...(b || [[SPOTS.stairFoot.x, SPOTS.stairFoot.z]]), ...STAIRS, [yard.x, yard.z]];
  }

  toShrine() {
    this.where = 'toShrine';
    this.plan = [
      { act: { vita: 'Wave', bibi: 'Wave' }, t: 2.5 },
      { walk: this.shrinePath(this.at) },
      { then: () => { this.shrineI = 0; this.shrineLoop(); } },
    ];
    this.step = null;
  }

  /** Evening's end: back down to the station, in through its door, gone with the train. */
  goHome() {
    if (this.stage !== 'plan') { this.placeAt(SPOTS.shrine[0]); }
    const door = this.door();
    const onStation = Math.hypot(this.at.x - door.x, this.at.z - door.z) < 30;
    const path = onStation ? [[this.at.x, this.at.z], [door.x, door.z]] : [...this.shrinePath(door).reverse(), [door.x, door.z]];
    if (!onStation) path[0] = [this.at.x, this.at.z];
    this.where = 'leaving';
    this.plan = [
      { walk: path },
      { then: () => { this.stage = 'hidden'; this.trainSeen = false; this.show(false); } },
    ];
    this.step = null;
  }

  // ------------------------------------------------------------------ running the plan
  runPlan(dt) {
    if (!this.step) {
      this.step = this.plan.shift() || null;
      if (!this.step) return;
      this.step.age = 0;
      this.begin(this.step);
    }
    const s = this.step;
    s.age += dt;
    if (s.walk) {
      const fast = this.seen() ? 1 : FAST;
      s.s += dt * (s.speed || WALK_SPEED) * (onStones(this.at.x, this.at.z) ? 0.8 : 1) * fast;
      const p = along(s.walk, s.s);
      this.at = { x: p.x, z: p.z, yaw: p.yaw };
      this.moving = !p.end;
      if (p.end) this.step = null;
      return;
    }
    if (s.then) { this.step = null; s.then(); return; }
    if (s.place) { this.at = { x: s.place[0], z: s.place[1], yaw: Math.PI }; this.bibi = null; this.step = null; return; }
    if (s.hide !== undefined) { if (s.age >= s.hide) { this.show(true); this.step = null; } return; }
    if (s.age >= (s.t || 0)) this.step = null;
  }

  begin(s) {
    this.moving = false;
    if (s.walk) {
      s.s = 0;
      this.bibi = null;
      this.clip('Walk');
      return;
    }
    if (s.hide !== undefined) { this.show(false); return; }
    if (!s.act) return;
    // where Bibi stands for it: posing 2 m in front of her sister (a photo), face to face, or beside her
    const y = s.face ?? this.at.yaw;
    if (s.photo) {
      const f = 2.1;
      if (s.face !== undefined) this.at.yaw = s.face;
      this.bibi = { x: this.at.x + Math.sin(this.at.yaw) * f, z: this.at.z + Math.cos(this.at.yaw) * f, yaw: this.at.yaw + Math.PI };
    } else if (s.pair) {
      const b = beside(this.at.x, this.at.z, this.at.yaw, 0.9, 0.5);
      this.bibi = { ...b, yaw: Math.atan2(this.at.x - b.x, this.at.z - b.z) };
      this.at.yaw = Math.atan2(b.x - this.at.x, b.z - this.at.z);
    } else {
      if (s.face !== undefined) this.at.yaw = y;
      const b = this.bibi || beside(this.at.x, this.at.z, this.at.yaw, 0.9, 0.2);
      this.bibi = { x: b.x, z: b.z, yaw: y };
    }
    this.clip(null, s.act);
  }

  /** Play clips on the bodies: one for both (walking) or { vita, bibi }. */
  clip(both, act = null) {
    this.act = act || { vita: both, bibi: both };
    if (!this.bodies) return;
    for (const v of VISITORS) {
      const n = this.bodies[v.id], c = this.act[v.id] || 'Idle';
      if (!n?.anim) continue;
      if (c === 'Walk') { n.anim.play('Walk', { speed: WALK_SPEED / n.walkRef }); continue; }
      n.idleClip = ['Idle', 'Talk', 'LookAround'].includes(c) ? c : 'Idle';
      if (['Idle', 'Talk', 'LookAround'].includes(c)) n.anim.play(c);
      else n.anim.once(c, { then: 'Idle' });
    }
  }

  /** Put the bodies where the walker says (every frame while they exist). */
  pose(dt) {
    const B = this.bodies;
    if (!B) return;
    const a = this.at;
    let b = this.bibi;
    if (!b) {
      // walking: beside her sister, or behind her on the stepping stones and the stone steps
      const narrow = onStones(a.x, a.z) || (a.x > 58 && a.x < 66 && a.z < -118 && a.z > -146);
      const q = narrow ? beside(a.x, a.z, a.yaw, 0, -1.1) : beside(a.x, a.z, a.yaw);
      b = { ...q, yaw: a.yaw };
    }
    const fast = this.moving && !this.seen();
    for (const [n, p] of [[B.vita, a], [B.bibi, b]]) {
      if (!n) continue;
      const y = this.yAt(p.x, p.z);
      n.pos.set(p.x, y, p.z);
      n.root.position.copy(n.pos);
      n.targetFacing = p.yaw;
      if (this.moving && n.anim?.current && n.anim.currentName === 'Walk') n.anim.current.timeScale = fast ? 0 : (onStones(a.x, a.z) ? 0.8 : 1) * WALK_SPEED / n.walkRef;
    }
  }

  yAt(x, z) {
    if (onStones(x, z)) return STONE_TOP;
    const g = this.g, h = g.world.heightAt(x, z);
    const c = g.colliders?.groundAt?.(x, z, h + 2.2, 2.6);
    return c && c.y > h ? c.y : h;
  }

  seen() {
    const p = this.g.player?.pos;
    return !!p && Math.hypot(p.x - this.at.x, p.z - this.at.z) < SEEN;
  }

  // ------------------------------------------------------------------ bodies
  bodiesNeeded() {
    const p = this.g.player?.pos;
    if (!p || this.stage === 'away') { this.dropBodies(); return; }
    const dist = Math.min(Math.hypot(p.x - this.at.x, p.z - this.at.z),
      this.stage === 'train' ? Math.hypot(p.x - SPOTS.platform.x, p.z - SPOTS.platform.z) : Infinity);
    const nearStation = Math.hypot(p.x - SPOTS.platform.x, p.z - SPOTS.platform.z) < STATION_NEAR && this.where !== 'shrine' && this.where !== 'toShrine';
    if (!this.bodies && (dist < LOAD || nearStation)) this.makeBodies();
    else if (this.bodies && dist > DROP && !nearStation && !this.talking) this.dropBodies();
  }

  async makeBodies() {
    if (this.loading || this.bodies) return;
    const g = this.g, d = this.d;
    this.loading = true;
    try {
      const models = VISITORS.map(v => v.model);
      if (!models.every(m => g.assets.has(m))) await g.assets.loadLater(models);
      if (!models.every(m => g.assets.has(m)) || this.bodies || this.stage === 'away') return;
      const B = {};
      for (const v of VISITORS) {
        const n = new NPC(g.scene, g.assets, g.world, v.id, v.model, { x: this.at.x, z: this.at.z, facing: this.at.yaw, cull: true });
        Object.assign(n, { name: v.name, barkKind: 'visitor', sceneCast: v.id, restClip: 'Idle', seated: false, visitor: true });
        d.npcs[v.id] = n;
        B[v.id] = n;
      }
      this.bodies = B;
      this.show(this.shown !== false);
      this.clip(null, this.act || { vita: 'Idle', bibi: 'Idle' });
      if (this.step?.walk) this.clip('Walk');
      this.pose(0);
      for (const n of Object.values(B)) { n.facing = n.targetFacing; n.root.rotation.y = n.facing; }
    } catch (e) {
      console.warn('[visitors] no bodies', e);
    } finally { this.loading = false; }
  }

  dropBodies() {
    if (!this.bodies) return;
    for (const n of Object.values(this.bodies)) {
      n.root.removeFromParent();
      n.gone = true;
      if (this.d.npcs[n.id] === n) delete this.d.npcs[n.id];
    }
    this.bodies = null;
  }

  show(on) {
    this.shown = on;
    if (this.bodies) for (const n of Object.values(this.bodies)) n.setVisible(on);
  }

  // ------------------------------------------------------------------ talking
  canTalk(id) {
    const n = this.bodies?.[id];
    return !!n && n.visible && !n.far && !this.talking && this.stage === 'plan' && !this.d.busy && !this.d.scenes?.active;
  }

  async talk(id) {
    const d = this.d, g = this.g, hs = d.houseScenes;
    if (this.talking || d.busy || !this.bodies) return;
    this.talking = true;
    const B = this.bodies;
    try {
      // they stop and turn to Mika, Bibi at her sister's side (from a photo pose or the walk; the first shot is a cut)
      const p = g.player.pos;
      const toM = Math.atan2(p.x - this.at.x, p.z - this.at.z);
      this.at.yaw = toM;
      const b = beside(this.at.x, this.at.z, toM, 0.85, 0.1);
      this.bibi = { ...b, yaw: Math.atan2(p.x - b.x, p.z - b.z) };
      this.moving = false;
      this.pose(0);
      for (const n of Object.values(B)) { n.lookAt(p.x, p.z); n.facing = n.targetFacing; n.anim?.play('Idle'); n.idleClip = 'Idle'; }
      const mid = this.mid();
      // Tamo is shy with strangers: he hangs back over Mika's shoulder, out of the shots (and out of the way)
      if (d.tamo) {
        const l = Math.hypot(mid.x - p.x, mid.z - p.z) || 1, dx = (mid.x - p.x) / l, dz = (mid.z - p.z) / l;
        d.tamo.override = new V3(p.x - dx * 1.7 - dz * 1.1, p.y + 2.5, p.z - dz * 1.7 + dx * 1.1);
      }
      g.player.turnTo?.(Math.atan2(mid.x - p.x, mid.z - p.z), 1, 50);
      const scene = SCENE_BY_ID.get(SCENE_ID);
      let played = false;
      if (hs && scene && !this.sceneDone && hs.prefs.learn === null) {
        d.busy++;
        try {
          const pick = await hs.view.chooseLanguage(inLang(scene.title, hs.uiLang), tx(ASK));
          hs.setPrefs({ learn: pick });
          if (pick === 'off') d.ui.toast(tx(N_('You can change this in Settings > Learn a language.')));
        } finally { d.busy--; }
      }
      const lang = hs?.lang;
      if (hs && scene && lang) {
        const day = hs.day(), heard = heardToday(hs.book, lang, day).has(scene.id);
        if (!heard && !this.sceneDone && hs.free()) {
          // a later day: Tamo asks about last time first, when a phrase is due (game/phrasebook.js)
          if (recallFor(hs.book, 'station', lang, day)) await hs.maybeRecall('station');
          else played = await hs.play(scene, this.stage3());
          if (played) this.sceneDone = true;
        } else if (this.sceneDone && !heard && recallFor(hs.book, 'station', lang, day)) {
          await hs.maybeRecall('station');
          played = true;
        }
      }
      if (!played) {
        const lines = !this.sceneDone && !lang ? CHATTER.ask : [this.chatterLine()];
        await d.dialogueBody(lines.map(([who, t, clip]) => [who, tx(t), clip].filter(Boolean)), { local: true });
        this.sceneDone = true;
      }
    } finally {
      this.talking = false;
      if (d.tamo) d.tamo.override = null;
      g.follow?.clearCutscene?.(false);
      // after they have asked the way, they set off for the shrine (by day); otherwise they carry on where they were
      if (this.phase === 'day' && this.sceneDone && this.where === 'square') this.toShrine();
      else if (this.step?.act) this.begin(this.step);
      else if (this.step?.walk) this.clip('Walk');
    }
  }

  chatterLine() {
    const list = CHATTER[this.phase === 'evening' ? 'evening' : this.phase === 'leaving' ? 'leaving' : 'day'];
    this.chatI = ((this.chatI ?? -1) + 1) % list.length;
    return list[this.chatI];
  }

  mid() {
    const B = this.bodies;
    return { x: (B.vita.pos.x + B.bibi.pos.x) / 2, y: (B.vita.pos.y + B.bibi.pos.y) / 2, z: (B.vita.pos.z + B.bibi.pos.z) / 2 };
  }

  /** The outdoor "stage" the house-scene runner plays on: the two bodies, a check, and the three shots. */
  stage3() {
    const g = this.g, B = this.bodies;
    return {
      bodies: [B.vita, B.bibi],
      ok: () => !!this.bodies && g.player.pos.distanceTo(B.vita.pos) < 14 && !g.interiors?.active,
      shot: (cam, line, speaker) => {
        const m = g.player.pos, s = this.mid();
        const sp = speaker ? speaker.pos : s;
        const face = speaker?.id === 'bibi' ? 1.1 : 1.35;        // where the speaker's face is (Bibi 1.41 m, Vita 1.71 m)
        let dx = s.x - m.x, dz = s.z - m.z;
        const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
        const sx = dz, sz = -dx;                        // to the right, looking from Mika to the sisters
        const back = (g.camera?.aspect ?? 1) < 0.95 ? 1.6 : 1;   // a tall phone screen: step back
        let pos, look;
        if (cam === 2) {                               // over the sisters' shoulders, on Mika
          pos = new V3(s.x + dx * 1.3 * back - sx * 0.9, s.y + 1.55, s.z + dz * 1.3 * back - sz * 0.9);
          look = new V3(m.x, m.y + 1.05, m.z);
        } else if (cam === 1) {                        // past Mika's shoulder (well clear of her head), on the speaker
          pos = new V3(m.x - dx * 1.5 * back + sx * 1.3, m.y + 1.85, m.z - dz * 1.5 * back + sz * 1.3);
          look = new V3((sp.x * 2 + s.x) / 3, sp.y + face, (sp.z * 2 + s.z) / 3);
        } else if (back > 1) {                         // the three of them on a tall phone: from behind Mika, at an angle
          pos = new V3(m.x - dx * 3.4 + sx * 1.9, Math.max(m.y, s.y) + 2.3, m.z - dz * 3.4 + sz * 1.9);
          look = new V3(m.x + (s.x - m.x) * 0.6, (m.y + s.y) / 2 + 1.0, m.z + (s.z - m.z) * 0.6);
        } else {                                       // the three of them, from the side
          pos = new V3((m.x + s.x) / 2 + sx * 4.2 * back - dx * 0.6, Math.max(m.y, s.y) + 1.9, (m.z + s.z) / 2 + sz * 4.2 * back - dz * 0.6);
          look = new V3((m.x + s.x) / 2, (m.y + s.y) / 2 + 1.1, (m.z + s.z) / 2);
        }
        pos.y = Math.max(pos.y, g.world.heightAt(pos.x, pos.z) + 0.6);
        g.follow?.cutscene({ pos, look }, 0.001);
      },
    };
  }
}
