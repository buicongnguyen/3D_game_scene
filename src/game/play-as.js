// © 2026 Bui Cong Nguyen · solluxlabs.com
// Play as (docs/EXPLORE-AND-SHOW.md): in Explore the player walks the valley as Mika (her own rig and every move she
// has) or as any of the singers (Saki by default for the show, Kotone, Mio, Yuna, Aoi, Riku, Kai, Ren; Stella once her
// show was seen). The choice is kept in the Explore save (quest state `explore.playAs`) and can change any time from the
// pause menu or the journal (ui/playas-ui.js), or from the show's Singer chip (game/singplay/).
//
// A singer's body: her model (the light one on Low), her own everyday clips (Idle, Walk, Run, Talk, Wave, Cheer, Bow,
// Point, LookAround) at her own gait, and the Explore moves every singer shares (public/models/moves-explore.glb, made
// ready for her body at load: actors/body-moves.js), her face (actors/face.js), her silhouette. Bodies are made once and
// kept, so switching back and forth is instant. Mika's lantern is Mika's: a singer carries none.
//
// What only Mika does (her props and poses are authored on her rig, her grip and her bones): every countryside trick and
// yard game round, fishing, the fire-pit stew, riding a cow, the kite workshop and the stargazing spots. For those the
// player becomes Mika the moment the activity starts and turns back into the chosen singer when it ends (MIKA_ONLY).
// The villagers call the player Mika whoever she walks as (owner 2026-11-28).
import * as THREE from 'three';
import { Animator } from '../actors/animator.js';
import { Face } from '../actors/face.js';
import { Silhouette } from '../actors/silhouette.js';
import { HUMAN_GAIT } from '../actors/gait.js';
import { SWIM } from '../actors/player.js';
import { bodyMoves, EXPLORE_PACK } from '../actors/body-moves.js';
import { KOTONE, NIGHT_STAR, member, singersWith, nameOf, facePic } from '../content/troupe.js';
import { nightStarSeen } from '../content/night-star.js';
import { tx, N_, getLang } from '../i18n/i18n.js';

export const MIKA = 'mika';
export const SAKI = 'nu-3';
/** The activities that switch the player to Mika while they run, and why (docs/EXPLORE-AND-SHOW.md). */
export const MIKA_ONLY = Object.freeze([
  Object.freeze({ id: 'trick', why: 'nets, jars, kites, frogs, the bow and every prop of the countryside tricks ride Mika\'s grip and her bone frames' }),
  Object.freeze({ id: 'yard', why: 'the yard games measure kicks, catches and hops on Mika\'s legs' }),
  Object.freeze({ id: 'fish', why: 'the rod sits in Mika\'s grip; Cast and Reel are her clips' }),
  Object.freeze({ id: 'cook', why: 'the stew pot: Mika\'s Stir clip' }),
  Object.freeze({ id: 'ride', why: 'riding a cow: the saddle height comes from Mika\'s RideCow pose; the Mixamo library has no straddling ride' }),
  Object.freeze({ id: 'workshop', why: 'building the kite at the workshop: Mika\'s hands' }),
  Object.freeze({ id: 'sky', why: 'stargazing and the kite flight up: Mika lies on the grass and holds the Star Kite in her own poses' }),
]);
/**
 * Petting the valley's animals as a singer (Mika keeps her own reach and Interact): which move, and the animal's back
 * (h: its height, r: from its middle to its flank, m). The singer is placed so her hand lands on the back; where the
 * move's hand is lower than the back, on its near flank instead, never through it (PlayAs.pet, measured per body).
 *   PetLow   kneeling, the hand down to a small animal (cat, rabbit, dog, fox, hen)
 *   Pat      standing, the hand at the waist (sheep, goat, pig, the sleeping bear)
 *   PatHigh  standing, the hand at the chest (a cow's neck and back)
 */
export const PET = Object.freeze({
  rabbit: { clip: 'PetLow', h: 0.24, r: 0.13 }, cat: { clip: 'PetLow', h: 0.26, r: 0.14 }, dog: { clip: 'PetLow', h: 0.42, r: 0.17 },
  fox: { clip: 'PetLow', h: 0.4, r: 0.16 }, chicken: { clip: 'PetLow', h: 0.32, r: 0.12 },
  sheep: { clip: 'Pat', h: 0.78, r: 0.32 }, goat: { clip: 'Pat', h: 0.72, r: 0.26 }, pig: { clip: 'Pat', h: 0.6, r: 0.3 }, bear: { clip: 'Pat', h: 0.95, r: 0.55 },
  cow: { clip: 'PatHigh', h: 1.28, r: 0.42 },
});
/** Where a singer stands to pet: her root `fwd` metres short of the hand's spot, the hand at the back's top when it reaches
 *  that high, else at the flank (pure; tests/explore-show.test.mjs). -> distance from the animal's middle to her root (m) */
export function petDistance(spec, reach) {
  const onTop = reach.up >= spec.h - 0.02;
  return reach.fwd + (onTop ? spec.r * 0.45 : spec.r + 0.04);
}
/** Whoever the player can be: Mika, then the singers (Stella at the end once her show was seen; ?nightstar=1 for tests). */
export const playAsList = (store = globalThis.localStorage, params = null) =>
  [MIKA, ...singersWith(nightStarSeen(store) || params?.get?.('nightstar') === '1' ? [NIGHT_STAR] : [])];
/** A body's model file (the light one on Low). */
export const bodyFileOf = (id, low) => { const m = member(id); return m ? (low ? `${m.file}.lite` : m.file) : null; };
/** A name for the Play as tiles: Mika's own, else the singer's in the game's language. */
export const playAsName = (id, lang = getLang()) => (id === MIKA ? tx(N_('Mika')) : nameOf(id, lang) || id);
/** Who has a dialogue portrait (public/portraits/<id>.webp): Mika, Kotone and Saki (art/blender/saki_portrait.py). */
export const PLAY_AS_PORTRAITS = Object.freeze([MIKA, KOTONE, 'nu-3']);
/** A picture for the tiles: the portrait where there is one, else the Singer row's face (content/troupe.js facePic). */
export const playAsPic = id => (PLAY_AS_PORTRAITS.includes(id) ? `portraits/${id}.webp` : facePic(id));
/** The Explore save's Play as choice, checked against who can be played now. */
export function savedPlayAs(st, list) { const v = st?.explore?.playAs; return list.includes(v) ? v : MIKA; }

export class PlayAs {
  constructor(game, director) {
    this.g = game; this.d = director;
    const p = game.player;
    this.cur = MIKA; this.want = MIKA; this.borrowed = false; this.wait = null; this.pack = null; this.packP = null;
    const mika = { id: MIKA, model: p.model, anim: p.anim, gait: p.gait, grip: p.grip, silhouette: p.silhouette, carry: p.carry, lantern: p.lantern, face: p.face || null, swimFlat: false };
    this.bodies = new Map([[MIKA, mika]]);
    p.body = mika;
    this.listeners = new Set();
    this.wrap();
  }

  get low() { return this.g.renderer.qualityName === 'low'; }
  /** The body walking now. */
  get id() { return this.cur; }
  /** The Play as choice (what the save keeps; the body may be Mika for a while during an activity). */
  get chosen() { return this.want; }
  list() { return playAsList(undefined, this.g.params); }
  /** Explore only (the story is Mika's). */
  get enabled() { return !!this.d.explore && !this.g.zone; }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  /** After a save is loaded: the save's choice (a singer's body loads in the background; Mika meanwhile). */
  restore() {
    if (!this.enabled) return;
    const want = savedPlayAs(this.d.q?.state, this.list());
    if (want !== MIKA) this.choose(want, { save: false }).catch(e => console.warn('[playas]', e));
  }

  /** Make `id` the Play as choice: her files load first (the choice shows at once, the body swaps when ready). */
  async choose(id, { save = true } = {}) {
    if (!this.enabled || !this.list().includes(id)) return false;
    this.want = id;
    const st = this.d.q?.state;
    if (st) st.explore = { ...(st.explore || {}), playAs: id };
    this.changed();
    if (id !== MIKA) {
      const ok = await this.ready(id);
      if (!ok) { this.d.ui?.toast?.(tx(N_("The group couldn't be loaded"))); if (this.want === id) { this.want = this.cur; if (st) st.explore.playAs = this.cur; this.changed(); } return false; }
    }
    if (this.want === id && !this.borrowed && !this.mikaNeeded()) this.swap(id);
    if (save) this.d.save?.();
    return true;
  }

  /** The Explore moves pack (once; a singer walks with her own clips until it is in). */
  loadPack() {
    const a = this.g.assets;
    return (this.packP ??= a.loadLater([EXPLORE_PACK]).then(() => (this.pack = a.gltf(EXPLORE_PACK) || null)).catch(() => null));
  }

  /** Load and make a singer's body (once). -> whether it is ready */
  async ready(id) {
    if (this.bodies.has(id)) return true;
    const a = this.g.assets, file = bodyFileOf(id, this.low);
    if (!file) return false;
    this.wait = id; this.changed();
    try {
      await Promise.all([a.has(file) ? null : a.loadLater([file]), this.loadPack()]);
    } catch { /* checked below */ }
    if (this.wait === id) this.wait = null;
    if (!a.has(file)) { this.changed(); return false; }
    if (!this.bodies.has(id)) this.bodies.set(id, this.make(id, file));
    this.changed();
    return true;
  }

  /** A singer's body record: model, animator (her clips + the Explore moves), gait, grip, face, silhouette. */
  make(id, file) {
    const g = this.g, m = g.assets.clone(file);
    m.position.y = -SWIM.pivot;
    m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    const anim = new Animator(m);
    if (this.pack) for (const [n, c] of bodyMoves(this.pack, m, this.pack.scene)) if (!anim.clips.has(n)) anim.clips.set(n, c);
    const who = member(id);
    return { id, file, model: m, anim, gait: id === KOTONE ? HUMAN_GAIT.kotone : who.gait, grip: m.getObjectByName('grip_R') || m,
      silhouette: new Silhouette(m), carry: null, lantern: null, face: Face.attach(m), swimFlat: true, packed: !!this.pack, reach: {} };
  }

  /**
   * Where a body's hand lands in a petting move (once per body and move): the lowest point of the reaching hand in the
   * middle of the clip, in her own frame: { fwd (m ahead of her root), up (m over the ground), at (s into the clip) }.
   */
  reach(b, clip) {
    if (b.reach[clip]) return b.reach[clip];
    const c = b.anim.clips.get(clip); if (!c) return null;
    const m = b.model, keep = m.position.clone(), mixer = new THREE.AnimationMixer(m), act = mixer.clipAction(c);
    act.setLoop(THREE.LoopOnce, 1); act.clampWhenFinished = true; act.play();
    m.position.set(0, 0, 0);
    const parent = m.parent; if (parent) parent.remove(m);
    m.updateMatrixWorld(true);
    const hands = ['hand_R', 'hand_L'].map(n => m.getObjectByName(n)), v = new THREE.Vector3();
    let best = null;
    for (let i = 4; i <= 16; i++) {
      const t = c.duration * i / 20; mixer.setTime(t); m.updateMatrixWorld(true);
      for (const h of hands) { if (!h) continue; h.getWorldPosition(v); if (v.z > 0.15 && (!best || v.y < best.up)) best = { fwd: v.z, up: v.y, at: t }; }
    }
    mixer.stopAllAction(); mixer.uncacheRoot(m);
    m.position.copy(keep); if (parent) parent.add(m);
    return (b.reach[clip] = best || { fwd: 0.45, up: 0.8, at: c.duration / 2 });
  }

  /** Pet an animal friend (director.befriend) as a singer: she steps to her spot (a short glide) and pets it. -> handled */
  pet(a) {
    const p = this.g.player, b = this.bodies.get(this.cur), spec = PET[a?.kind];
    if (this.cur === MIKA || !b || !spec || !b.anim.has(spec.clip) || p.swimming || p.mounted || !p.grounded) return false;
    const r = this.reach(b, spec.clip); if (!r) return false;
    const dx = p.pos.x - a.pos.x, dz = p.pos.z - a.pos.z, len = Math.hypot(dx, dz) || 1, dist = petDistance(spec, r);
    const to = new THREE.Vector3(a.pos.x + dx / len * dist, 0, a.pos.z + dz / len * dist);
    to.y = p.groundHeight(to.x, to.z, p.pos.y + 0.5);
    this.glide = { from: p.pos.clone(), to, t: 0, dur: Math.min(0.45, Math.max(0.12, p.pos.distanceTo(to) / 2.2)), yaw: Math.atan2(-dx, -dz), clip: spec.clip };
    p.vel.set(0, 0, 0);
    p.gesture(spec.clip, { lock: true, fade: 0.25 });
    return true;
  }

  /** The body becomes `id` (made already). Never mid-song or mid-activity (callers check). */
  swap(id) {
    const g = this.g, p = g.player, b = this.bodies.get(id);
    if (!b || id === this.cur) return !!b;
    // a body made before the moves pack came in gets them now
    if (!b.packed && this.pack && id !== MIKA) { for (const [n, c] of bodyMoves(this.pack, b.model, this.pack.scene)) if (!b.anim.clips.has(n)) b.anim.clips.set(n, c); b.packed = true; }
    p.anim?.cancelOneShot?.(); p.anim?.mixer?.stopAllAction?.(); p.face?.sing?.(null); p.face?.quiet?.();
    if (p.anim) { p.anim.current = null; p.anim.currentName = ''; }
    const pose = p.pose;
    p.pivot.remove(p.model);
    b.model.position.set(0, -SWIM.pivot, 0);
    p.pivot.add(b.model);
    Object.assign(p, { model: b.model, anim: b.anim, gait: b.gait, grip: b.grip, silhouette: b.silhouette, carry: b.carry, lantern: b.lantern, face: b.face, body: b });
    b.anim.oneShotLocks = false;
    b.anim.play(pose && b.anim.has(pose) ? pose : p.swimming ? (b.anim.has('Tread') ? 'Tread' : 'Idle') : 'Idle', { fade: 0 });
    b.silhouette?.show?.(true);
    if (p.swimming && b.swimFlat) { p.pitch = 0; p.pivot.rotation.x = 0; }
    this.cur = id;
    this.visitor();
    this.changed();
    return true;
  }

  // ---------------------------------------------------------------- what only Mika does
  /** Is an activity that needs Mika's rig running now? */
  mikaNeeded() {
    const d = this.d;
    return !!(d.minigame || d.tricks?.round || d.yard?.round || d.cows?.riding || d.workshop?.active || d.sky?.active || (d.sky?.returning > 0));
  }
  /** An activity is about to start: Mika from now on, until it is over (update() turns back). */
  borrow() {
    if (this.cur === MIKA) return;
    this.borrowed = true;
    this.swap(MIKA);
  }
  /** Each MIKA_ONLY activity's way in: the body becomes Mika just before it reads her model, grip or bones. */
  wrap() {
    const d = this.d, me = this;
    const before = (obj, name) => {
      const f = obj?.[name]; if (typeof f !== 'function' || f.playAs) return;
      const w = function (...args) { if (me.enabled) me.borrow(); return f.apply(this, args); };
      w.playAs = true; obj[name] = w;
    };
    before(d.tricks, 'play'); before(d.yard, 'play'); before(d, 'startFishing'); before(d, 'startCooking');
    before(d.cows, 'mount'); before(d.workshop, 'play'); before(d.sky, 'start');
  }

  /** Kotone or Stella played: the one in the valley steps out (no second Kotone at the station, no Stella at the shrine). */
  visitor() {
    const town = this.d.town, k = town?.people.find(it => it.p.id === KOTONE);
    if (k) {
      const me = this.cur === KOTONE;
      if (me && !k.playAsHidden) { if (town.show?.on(k)) town.show.end(); k.yardHold = true; k.n.setHidden(true); k.playAsHidden = true; }
      else if (!me && k.playAsHidden && !this.d.singplay) { k.yardHold = false; k.n.setHidden(false); k.playAsHidden = false; }
    }
  }

  /** Every frame (a game system). */
  update(dt) {
    const p = this.g.player;
    const gl = this.glide;
    if (gl) {
      // (after the controller: her place is set here while she steps to the animal)
      gl.t += dt; const k = Math.min(1, gl.t / gl.dur), s = k * k * (3 - 2 * k);
      p.pos.lerpVectors(gl.from, gl.to, s); p.vel.set(0, 0, 0); p.facing = gl.yaw;
      p.root.position.copy(p.pos); p.root.rotation.y = p.facing;
      if (k >= 1) { p.lastSafe.copy(p.pos); this.glide = null; }
    }
    // the activity is over: back to the chosen singer
    if (this.borrowed && !this.mikaNeeded() && !this.d.busy) { this.borrowed = false; if (this.want !== MIKA && this.bodies.has(this.want)) this.swap(this.want); }
    else if (!this.borrowed && this.cur !== this.want && this.bodies.has(this.want) && !this.mikaNeeded() && !this.d.performing && !this.d.busy) this.swap(this.want);
    // a singer's face (the show updates it itself while it is open)
    if (p.face && !this.d.singplay) { p.face.setEnabled(Face.on); p.face.lookAt(p.gaze || null); p.face.update(dt); }
  }

  changed() { for (const fn of this.listeners) { try { fn(this); } catch (e) { console.warn('[playas]', e); } } }
}

/** Play as for an Explore session (src/main.js after the save is loaded). -> the PlayAs */
export function startPlayAs(game, director) {
  if (director.playAs) return director.playAs;
  const pa = director.playAs = new PlayAs(game, director);
  game.systems.push(pa);
  pa.restore();
  return pa;
}
