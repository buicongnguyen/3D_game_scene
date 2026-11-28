// © 2026 Bui Cong Nguyen · solluxlabs.com
// The daily stamp card at runtime (Explore only; docs/STAMPS.md). A lazy chunk: the Director fetches it when an Explore
// save begins (never in a story save or a play zone; ?stamps=off never fetches it; a ?qa run only with ?stamps=on).
// Three little jobs a day from the neighbours (carry something from door to door, find something lost, play a game), each
// worth a stamp; stamps bring decorations for the cottage. Rules: game/stamps-rules.js (pure). Save shape:
// game/stamps-save.js. Tables: content/stamps.js. The card in the journal and the stamp pop: ui/stamps-ui.js.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GLOW_MATERIALS } from '../engine/assets.js';
import { tx } from '../i18n/i18n.js';
import { TABLES, DELIVERIES, FINDS, DECOR } from '../content/stamps.js';
import { cleanStamps } from './stamps-save.js';
import { valleyTime } from './valley-clock.js';
import { dayKeyOf, shouldRoll, drawCard, validateCard, award, luck, playCandidates, playProgress, objectiveText } from './stamps-rules.js';
import { renderCard, showPop, ensurePop } from '../ui/stamps-ui.js';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const POLL = 1;          // s: how often a played game is looked for
const ROLL = 30;         // s: how often the day is checked (a new card at 04:00)
const GAP = 1.9;         // s: between two pieces of feedback (the pop, a toast)
const FIND = 'stamp-find';
const DELIVERY = new Map(DELIVERIES.map(x => [x.id, x]));
const FIND_BY_ID = new Map(FINDS.map(x => [x.id, x]));
const _box = new THREE.Box3();
const _m = new THREE.Matrix4(), _inv = new THREE.Matrix4(), _n = new THREE.Matrix3(), _p = new THREE.Vector3();

// One material for every merged part: a plain vertex-coloured standard material, the same shader program the valley's
// merged buildings already use (engine/static-merge.js). A prop with thin one-layer sheets (petals, leaves, a cloth lid)
// gets the two-sided copy instead, so those sheets do not vanish when their back turns to the camera (compiled up front
// by Stamps.precompile).
let merged = null, mergedDS = null;
// a see-through two-sided sheet (the bug net's mesh) -> its copy drawn in one pass, not two (never the shared original,
// which the firefly game's net uses)
const onePass = new Map();
const onePassOf = m => { let c = onePass.get(m); if (!c) { c = m.clone(); c.forceSinglePass = true; onePass.set(m, c); } return c; };
/** A part's position, normal and colour (its material colour x the baked shading in COLOR_0) in the root's space. */
function bakePart(mesh, toRoot) {
  const g = mesh.geometry, pos = g.attributes.position, nor = g.attributes.normal, col = g.attributes.color, n = pos.count, c = mesh.material.color;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = new Float32Array(n * 3);
  _n.getNormalMatrix(toRoot);
  for (let i = 0; i < n; i++) {
    _p.fromBufferAttribute(pos, i).applyMatrix4(toRoot); P[i * 3] = _p.x; P[i * 3 + 1] = _p.y; P[i * 3 + 2] = _p.z;
    if (nor) { _p.fromBufferAttribute(nor, i).applyMatrix3(_n).normalize(); N[i * 3] = _p.x; N[i * 3 + 1] = _p.y; N[i * 3 + 2] = _p.z; }
    C[i * 3] = c.r * (col ? col.getX(i) : 1); C[i * 3 + 1] = c.g * (col ? col.getY(i) : 1); C[i * 3 + 2] = c.b * (col ? col.getZ(i) : 1);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  out.setAttribute('color', new THREE.BufferAttribute(C, 3));
  out.setIndex(g.index ? Array.from(g.index.array) : Array.from({ length: n }, (_, i) => i));
  if (!nor) out.computeVertexNormals();
  return out;
}
/** A part that may join the merged mesh: plain and opaque (the same rules as engine/static-merge.js). */
const plain = o => {
  const m = o.material;
  return o.isMesh && !o.isSkinnedMesh && m && !Array.isArray(m) && !m.map && !m.alphaMap && !m.transparent && !(m.alphaTest > 0)
    && (m.metalness ?? 0) <= 0.3 && !(m.emissiveIntensity > 0 && m.emissive?.getHex()) && !GLOW_MATERIALS.includes(m.name) && !!o.geometry.attributes.position;
};
/**
 * A small prop in as few draws as it takes: its plain opaque parts become one vertex-coloured mesh (two-sided when any of
 * them is). Glowing (driven by name), textured, metal and see-through parts keep their own material; a see-through
 * two-sided sheet is drawn in one pass instead of two. The model's own geometry and materials are untouched.
 */
function oneDraw(obj) {
  const parts = [], sheets = [];
  obj.traverse(o => {
    if (plain(o)) parts.push(o);
    else if (o.isMesh && o.material?.transparent && o.material.side === THREE.DoubleSide && !o.material.forceSinglePass) sheets.push(o);
  });
  for (const o of sheets) o.material = onePassOf(o.material);
  if (parts.length < 2) return;
  obj.updateMatrixWorld(true);
  _inv.copy(obj.matrixWorld).invert();
  const geos = parts.map(o => bakePart(o, _m.multiplyMatrices(_inv, o.matrixWorld)));
  const geo = mergeGeometries(geos);
  for (const g of geos) g.dispose();
  if (!geo) return;
  geo.computeBoundingBox(); geo.computeBoundingSphere();
  const twoSided = parts.some(o => o.material.side === THREE.DoubleSide);
  const mat = twoSided
    ? (mergedDS ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0, side: THREE.DoubleSide, name: 'Merged 0.75 two-sided' }))
    : (merged ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0, name: 'Merged 0.75' }));
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'stamp-merged';
  mesh.userData.ownGeometry = true;
  for (const o of parts) o.removeFromParent();
  obj.add(mesh);
}
const disposeOwn = obj => obj?.traverse(o => { if (o.userData?.ownGeometry) o.geometry.dispose(); });

export class Stamps {
  constructor(director) {
    const d = (this.d = director), g = (this.g = d.game);
    d.stamps = this;                       // (now, not after the constructor: refreshObjective below already reads the card)
    // The Explore save this card belongs to. While something else is lent to the Director (the live scene tour's
    // throwaway story), the card sleeps: nothing rolls, stamps, shows or points (see borrowed()).
    this.quest = d.q;
    this.quest.state.stamps = cleanStamps(this.quest.state.stamps);
    this.plays = playCandidates(d.minigameMenu?.catalogue || []);
    this.playById = new Map(this.plays.map(e => [e.id, e]));
    this.doors = new Map((g.interiors?.doors || []).map(x => [x.id, x]));
    this.queue = [];
    this.trash = [];                       // picked-up finds, their merged geometry freed once they leave Mika's hand
    this.gapT = 0;
    this.pollT = POLL;
    this.rollT = ROLL;
    this.tgt = new THREE.Vector3();
    // QA: ?stampday=YYYY-MM-DD (and qa.stamps.setDay) stand in for the date; only in a ?qa run
    const qa = typeof window !== 'undefined' ? window.__STARLINE_QA__ : null;
    const day = g.params?.get?.('stampday');
    this.qaDay = qa && day && DAY.test(day) ? day : null;
    ensurePop();                           // the pop's live region exists before the first stamp, so readers announce it
    this.buildDecor();
    this.register();
    if (!this.roll()) this.respawnFind();
    this.precompile();
    if (qa) this.attachQA(qa);
    d.refreshObjective();
  }

  /**
   * The decorations' and the find's shader programs, compiled now (without blocking where the browser compiles in
   * parallel), not on first sight in the cottage. Most are programs the valley already has (then this costs nothing);
   * the jar's glass and the net's mesh may not be. Against the composer's target, like Celebrate.precompile.
   */
  precompile() {
    const g = this.g, R = g.renderer?.renderer;
    if (!R?.compileAsync || !g.camera || !g.scene) return;
    const probe = new THREE.Group();
    for (const { obj } of this.decor) probe.add(obj.clone());
    const pk = this.d.pickups.get(FIND);
    if (pk) probe.add(pk.obj.clone());
    probe.traverse(o => { o.visible = true; });
    const comp = g.renderer.composer, prev = R.getRenderTarget?.() ?? null;
    try {
      if (comp?.renderTarget1) R.setRenderTarget(comp.renderTarget1);
      this.compiled = R.compileAsync(probe, g.camera, g.scene).catch(e => console.warn('[stamps] precompile', e));
    } catch (e) { console.warn('[stamps] precompile', e); }
    if (comp?.renderTarget1) R.setRenderTarget(prev);
  }

  get s() { return this.quest.state.stamps; }
  /** Another story is lent to the Director (the live scene tour): the card sleeps until its own save is back. */
  borrowed() { return this.d.q !== this.quest; }
  // (the valley's date: the real one, plus the days Go to… has lived through, game/valley-clock.js)
  today() { return this.qaDay || dayKeyOf(valleyTime(this.g?.dayShift || 0)); }
  /** Task `i` of today's card (0 deliver, 1 find, 2 play), or null while there is no card (or it sleeps). */
  task(i) { const s = this.s; return !this.borrowed() && s.day && s.tasks.length === 3 ? s.tasks[i] : null; }
  delivery() { const t = this.task(0); return t ? DELIVERY.get(t.id) || null : null; }
  playEntry(id) { return this.playById.get(id) || null; }
  inCottage() { return this.g.interiors?.active === 'cottage'; }

  // ------------------------------------------------------------------ setup
  /** The two front-door hand-ins. With priority 1 they beat "Go inside" (0.5), but only while the task wants them. */
  register() {
    const d = this.d, I = this.g.interiors;
    const door = key => { const D = this.delivery(); return D ? this.doors.get(D[key])?.outside || null : null; };
    d.interact('stamp:collect', null, () => tx('Collect: {what}', { what: tx(this.delivery()?.what || '') }),
      () => { const t = this.task(0); return !!t && !t.done && !t.carry && !I?.active; }, () => this.collect(), 2.2, () => door('fromDoor'), 1, 3.2);
    d.interact('stamp:deliver', null, () => tx('Deliver: {what}', { what: tx(this.delivery()?.what || '') }),
      () => { const t = this.task(0); return !!t && !t.done && !!t.carry && !I?.active; }, () => this.deliver(), 2.2, () => door('toDoor'), 1, 3.2);
  }

  /**
   * The cottage decorations: clones under the cottage room's own group (room-local coordinates; that group is only drawn
   * while Mika is inside), each resting on its surface by its own bounding box. Shown once enough stamps are banked.
   */
  buildDecor() {
    this.decor = [];
    const room = this.g.interiors?.rooms.get('cottage');
    if (!room) return;
    for (const D of DECOR) {
      const obj = this.g.assets.clone(D.model);
      if (!obj) continue;
      oneDraw(obj);
      obj.name = `stamp-decor:${D.id}`;
      obj.scale.setScalar(D.scale);
      obj.rotation.set(0, D.yaw, 0);
      obj.position.set(0, 0, 0);
      obj.updateMatrixWorld(true);
      _box.setFromObject(obj);            // (no parent yet: the box is in the object's own scaled frame)
      obj.position.set(D.x, D.surface - _box.min.y, D.z);
      obj.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
      room.root.add(obj);
      this.decor.push({ D, obj });
    }
    this.showDecor();
  }

  showDecor() { const total = this.s.total; for (const x of this.decor) x.obj.visible = total >= x.D.at; }

  /** The find of the day: a bobbing, glinting pickup at its spot (removed and placed again when the card changes). */
  respawnFind() {
    const d = this.d;
    disposeOwn(d.pickups.get(FIND)?.obj);
    d.removePickup(FIND);
    const t = this.task(1), F = t && FIND_BY_ID.get(t.id);
    if (!F || t.done) return;
    const [x, z] = F.spots[t.spot];
    d.pickup(FIND, F.model, new THREE.Vector3(x, this.g.world.heightAt(x, z) + F.lift, z), 'stamp', () => this.findWanted(), { stamp: F, grab: 1.9 });
    const pk = d.pickups.get(FIND);
    if (!pk) return;
    oneDraw(pk.obj);                      // (at most two draws: the merged parts, and the net's mesh or the metal)
    pk.obj.scale.setScalar(F.scale);
    pk.obj.traverse(o => { if (o.isMesh) o.castShadow = false; });
  }
  /**
   * The find shows (and can be picked up) only in free play outdoors: not while a round, a launch or another game owns
   * the screen (a spot may lie in a practice ground: Mika would crouch for it mid-round), nor in the scene tour.
   */
  findWanted() {
    const t = this.task(1), d = this.d, g = this.g;
    return !!t && !t.done && !g.interiors?.active && !d.tourLock && !d.minigame && !d.minigameMenu?.running
      && !d.tricks?.round && !d.yard?.round && !d.workshop?.active && !d.sky?.active && !g.sky?.active;
  }

  // ------------------------------------------------------------------ the day
  /** A new card when the day has turned (on load, every 30 s, when the journal shows the card). -> true when one came */
  roll() {
    if (this.borrowed()) return false;
    const d = this.d, s = this.s, st = this.quest.state, day = this.today();
    if (shouldRoll(s, day)) {
      s.day = day;
      s.tasks = drawCard(day, TABLES, st, this.plays);
      s.lucky = '';
      this.respawnFind();
      this.feedback(() => d.ui.toast(tx('A new stamp card came in the post! See the journal.'), 'letter'));
      if (d.ui.overlay !== 'journal') d.ui._tab = 'folk';   // the next journal opens on Neighbours, the card at the top
      d.refreshObjective(true);
      d.save();
      return true;
    }
    if (validateCard(s, TABLES, st, this.plays)) { this.respawnFind(); d.refreshObjective(true); }
    return false;
  }

  // ------------------------------------------------------------------ per frame (from Director.update: never while paused)
  update(dt) {
    if (this.trash.length) this.sweep();
    if (this.borrowed()) return;          // (the tour's story: no day check, no stamps, no feedback until it is given back)
    if ((this.pollT -= dt) <= 0) { this.pollT = POLL; this.checkPlay(); }
    if ((this.rollT -= dt) <= 0) { this.rollT = ROLL; this.roll(); }
    if (this.gapT > 0) this.gapT -= dt;
    if (this.queue.length && this.gapT <= 0 && this.free()) { this.gapT = GAP; this.queue.shift()(); }
  }

  /** Feedback waits for a free screen: no round or launch, no dialogue, no panel, not paused. */
  free() {
    const d = this.d, ui = d.ui;
    return !!d.minigameMenu?.canOpen() && !ui.dialogueOpen && !ui.overlay && !this.g.paused;
  }
  feedback(fn) { this.queue.push(fn); }

  /** Free a picked-up find's merged geometry once it has really left the scene (the bend-down runs on game time). */
  sweep() {
    for (let i = this.trash.length - 1; i >= 0; i--) {
      const o = this.trash[i];
      if (o.parent) continue;
      disposeOwn(o);
      this.trash.splice(i, 1);
    }
  }

  /** A played game shows in its record (from anywhere: the valley, the title's Mini games, a zone): its stamp. */
  checkPlay() {
    const t = this.task(2);
    if (!t || t.done) return;
    const e = this.playEntry(t.id);
    if (e && playProgress(e, this.quest.state) > t.base) this.give(2);
  }

  // ------------------------------------------------------------------ the jobs
  collect() {
    const t = this.task(0);
    if (!t || t.done || t.carry) return;
    t.carry = true;
    this.d.audio.pickup?.();
    this.g.player.gesture?.('Interact', { lock: false });
    this.d.refreshObjective(true);
    this.d.save();
  }

  deliver() {
    const t = this.task(0);
    if (!t || t.done || !t.carry) return;
    this.g.player.gesture?.('Interact', { lock: false });
    this.give(0);
  }

  /** The Director's collect() hands a picked-up find over here. */
  found(pk) {
    if (pk?.obj) this.trash.push(pk.obj);            // (freed by sweep() once the bend-down has put it away)
    if (pk?.stamp?.id !== this.task(1)?.id) return;
    this.give(1);
  }

  /** A weather moment was seen (game/moments.js calls this once per moment): the lucky stamp, once per card. */
  saw(id, nameSource) {
    if (this.borrowed()) return false;
    const r = luck(this.s, nameSource || id);
    if (!r) return false;
    const name = this.s.lucky;
    this.feedback(() => { this.d.ui.toast(tx('Lucky stamp: {what}!', { what: tx(name) })); this.d.audio.good?.(); });
    this.unlocks(r.unlocked);
    this.after();
    return true;
  }

  /** Stamp task `slot`: the pop, the bonus, the decorations it brings; then the objective, the save, the cottage. */
  give(slot) {
    if (this.borrowed()) return null;
    const s = this.s, r = award(s, slot);
    if (!r) return null;
    const n = s.tasks.filter(t => t.done).length, a = this.d.audio;
    this.feedback(() => {
      showPop(n);
      a.noise?.({ dur: 0.08, vol: 0.18, freq: 180, q: 0.8, type: 'lowpass' });
      setTimeout(() => a.good?.(), 70);
    });
    if (r.full) this.feedback(() => { this.d.ui.toast(tx('Card full! A bonus stamp'), 'letters'); a.star?.(); });
    this.unlocks(r.unlocked);
    this.after();
    return r;
  }

  unlocks(ids) {
    for (const id of ids) {
      const x = this.decor.find(y => y.D.id === id), D = x?.D || DECOR.find(y => y.id === id);
      if (!D) continue;
      this.feedback(() => { this.d.ui.toast(tx('New in the cottage: {item}', { item: tx(D.name) }), D.icon || null); if (!this.inCottage()) this.d.audio.chime?.(2); });
    }
  }

  after() {
    const d = this.d;
    d.refreshObjective(true);
    d.save();                    // (refused during a round: the 45 s autosave catches it)
    this.showDecor();
    if (this.inCottage()) this.reveal(0, 0);
  }

  // ------------------------------------------------------------------ the cottage
  /** Mika came into the cottage: new decorations sparkle one after another, after the `n` new gifts. */
  enteredCottage(n = 0) { this.reveal(n, 500); }

  /**
   * Sparkle every shown decoration not seen yet, 700 ms apart after `n` earlier sparkles (the gifts' own, which start
   * `lead` ms in: the same pattern as Director.enterHome), and remember them. Inside already: at once.
   */
  reveal(n = 0, lead = 0) {
    const s = this.s;
    let k = n;
    for (const { D, obj } of this.decor) {
      if (!obj.visible || s.seen.includes(D.id)) continue;
      s.seen.push(D.id);
      obj.updateMatrixWorld(true);
      const at = _box.setFromObject(obj).getCenter(new THREE.Vector3());
      setTimeout(() => { if (this.inCottage()) this.g.celebrate?.giftGlow?.(at); }, lead + k++ * 700);
    }
  }

  // ------------------------------------------------------------------ what other parts read
  /** The guide arrow: the door to go to (+1.5 m) or the find, as a reused vector; null when the card wants neither. */
  target() {
    const t0 = this.task(0);
    if (!t0) return null;
    if (!t0.done) {
      const D = DELIVERY.get(t0.id), o = D && this.doors.get(t0.carry ? D.toDoor : D.fromDoor)?.outside;
      if (o) return this.tgt.set(o.x, o.y + 1.5, o.z);
    }
    const t1 = this.task(1);
    if (t1 && !t1.done) {
      const pk = this.d.pickups.get(FIND);
      if (pk) return this.tgt.set(pk.pos.x, pk.pos.y + 0.9, pk.pos.z);
    }
    return null;
  }

  /** The objective card's line ("Stamp card 1/3: Find Kenta's ball"), or null while there is no card. */
  objective() { return this.borrowed() ? null : objectiveText(this.s, TABLES, tx, this.plays); }

  /** The journal's Neighbours tab: today's card at the top (a new day's card first). */
  mount(el, ui) {
    if (!el) return;
    if (this.borrowed()) { el.innerHTML = ''; return; }
    this.roll();
    renderCard(el, this, ui);
  }

  /** The card's Play button: the Mini games menu starts that game (it closes the journal and unpauses). */
  play(id) {
    const e = this.playEntry(id), m = this.d.minigameMenu;
    if (!e || !m?.canOpen()) return false;
    m.launch(e);
    return true;
  }

  // ------------------------------------------------------------------ QA (?qa only)
  attachQA(qa) {
    const v = p => (p ? [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)] : null);
    qa.stamps = {
      state: () => ({ ...JSON.parse(JSON.stringify(this.s)), today: this.today(), objective: this.objective(), target: v(this.target()), queue: this.queue.length,
        decor: this.decor.filter(x => x.obj.visible).map(x => x.D.id), find: v(this.d.pickups.get(FIND)?.pos) }),
      setDay: key => { if (!DAY.test(key)) return false; this.qaDay = key; this.roll(); return this.s.day; },
      complete: slot => !!this.give(slot),
      lucky: (id, name) => this.saw(id, name),
      unlockAll: () => { this.s.total = Math.max(this.s.total, DECOR.reduce((m, D) => Math.max(m, D.at), 0)); this.showDecor(); if (this.inCottage()) this.reveal(0); this.d.refreshObjective(); return this.s.total; },
      card: () => ({ day: this.s.day, tasks: this.s.tasks.map(t => ({ ...t })), plays: this.plays.map(e => e.id) }),
      decor: () => this.decor.map(({ D, obj }) => { obj.updateMatrixWorld(true); _box.setFromObject(obj); return { id: D.id, visible: obj.visible, min: v(_box.min), max: v(_box.max), center: v(_box.getCenter(new THREE.Vector3())) }; }),
      flush: () => { let n = 0; while (this.queue.length && n++ < 20) this.queue.shift()(); return n; },
    };
  }
}
