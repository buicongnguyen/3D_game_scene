// Things to do inside the houses (content/hotspots.js): sit at the table, look out of the window, open the tansu,
// pet the cat, ring the altar bell… and the one small "house memory" hidden in each home, kept in the journal.
import * as THREE from 'three';
import { HOTSPOTS, MEMORIES } from '../content/hotspots.js';
import { tx } from '../i18n/i18n.js';
import { forStory, storyId } from './stories/index.js';

const V3 = THREE.Vector3;
const MEMORY_OF = new Map(Object.entries(MEMORIES).map(([home, m]) => [`${home}:${m.hotspot}`, { home, ...m }]));
export const MEMORY_COUNT = Object.keys(MEMORIES).length;

export class Indoors {
  constructor(director) {
    this.d = director;
    this.g = director.game;
    this.spots = [];
    this.seat = null;          // { spot, obj } while Mika sits
  }

  /** One interaction per hotspot of each room's decor variant. Positions come in Blender room coordinates. */
  spawn() {
    const I = this.g.interiors;
    if (!I) return;
    for (const room of I.rooms.values()) {
      const list = HOTSPOTS[room.def.kind] || HOTSPOTS[room.id];
      if (!list) continue;
      const variant = room.def.variant ?? 1;
      // Blender (x, y, z) is glTF/three (x, z, -y) in the room model's own space
      const toWorld = (x, y, z = 0) => room.model.localToWorld(new V3(x, z, -y));
      for (const h of list) {
        if (!(h.variants || [1]).includes(variant)) continue;
        const stand = toWorld(h.stand[0], h.stand[1]);
        stand.y = room.floorY ?? stand.y;
        const s = {
          h, room, id: `${room.id}:${h.id}`, stand, look: toWorld(...h.look),
          seat: h.seat ? toWorld(h.seat[0], h.seat[1]) : null,
          variant, memory: MEMORY_OF.get(`${room.id}:${h.id}`) || null,
        };
        this.spots.push(s);
        const at = stand.clone().setY(stand.y + 0.9);
        this.d.interact(`spot:${s.id}`, at, () => tx(h.label),
          () => I.active === room.id && !I.busy && !this.seat && !this.d.busy, () => this.use(s), 1.2, null,
          // standing right on the spot, it wins over the room's door, a keepsake or the shopkeeper; anywhere else they do
          () => (Math.hypot(this.g.player.pos.x - stand.x, this.g.player.pos.z - stand.z) < 0.4 ? 1.2 : 0.4));
      }
    }
    // while she sits: one press to stand up again (moving does it too)
    this.d.interact('spot:standUp', null, () => tx('Stand up'), () => !!this.seat && !this.d.busy, () => this.standUp(), 9,
      () => this.g.player.pos.clone().setY(this.g.player.pos.y + 1), 1);
  }

  /**
   * Seated, the follow camera would sit behind her, often inside the wall the seat stands against: instead a held shot
   * from in front of her, kept inside the room (closer in, or swung to the side, when the room is small).
   */
  seatShot(dur = 0.001) {
    const { at, yaw } = this.seat, I = this.g.interiors;
    const look = at.clone().add(new V3(0, 0.85, 0));
    let pos = null;
    for (const [r, a] of [[2.4, 0], [2.4, 0.5], [2.4, -0.5], [1.9, 0.9], [1.9, -0.9], [1.7, 0]]) {
      const c = at.clone().add(new V3(Math.sin(yaw + a) * r, 1.5, Math.cos(yaw + a) * r));
      if (I?.roomHas?.(c)) { pos = c; break; }
    }
    pos ||= I?.clampToRoom?.(at.clone().add(new V3(Math.sin(yaw) * 2, 1.5, Math.cos(yaw) * 2))) || at.clone().add(new V3(0, 2, 0));
    this.g.follow.cutscene({ pos, look }, dur);
  }

  /** Mika gets up when the player moves or jumps. */
  update() {
    if (!this.seat || this.d.busy) return;
    const f = this.g.follow;
    if (!f.shot && !f.tracking) this.seatShot(0.6);     // a dialogue just ended and handed the camera back
    const inp = this.g.input, m = inp.move || { x: 0, y: 0 };
    if (Math.hypot(m.x, m.y) > 0.35 || inp.pressed?.('jump') || this.g.interiors?.active !== this.seat.spot.room.id) this.standUp();
  }

  async use(s) {
    const d = this.d, p = this.g.player, h = s.h;
    const face = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
    let pose = null;
    if (h.kind === 'sit') {
      // a raised seat: sit on it (at `look`, or at `seat` for a chair beside a table) facing back into the room;
      // a floor cushion: sit where she stands, facing the table
      const high = (h.seatH ?? 0.45) > 0.3;
      const at = (s.seat || (high ? s.look : s.stand)).clone();
      // sit on what is really there: a raised tatami floor under a cushion, or the top of the bench, cot or chair
      // (the Sit clip puts the hips 0.45 m over her root, SitFloor sits on the floor she stands on)
      const top = this.topAt(at.x, at.z, s.stand.y + (high ? 1.0 : 0.6));
      at.y = high ? (top !== null && top > s.stand.y + 0.25 ? top - 0.45 : s.stand.y) : Math.max(s.stand.y, top ?? s.stand.y);
      const yaw = s.seat ? face(at, s.look) : high ? face(at, s.stand) : face(at, s.look);
      const obj = new THREE.Object3D();
      obj.position.copy(at);
      obj.rotation.y = yaw;
      s.room.root.attach(obj);
      p.mount(obj, new V3(), 0);
      pose = high ? 'Sit' : 'SitFloor';
      p.pose = p.anim?.has?.(pose) ? pose : 'Idle';
      this.seat = { spot: s, obj, at, yaw };
      this.seatShot(0.8);
    } else {
      p.teleport(s.stand.x, s.stand.z, s.stand.y, face(s.stand, s.look));
      if (h.kind === 'pet') p.anim?.once?.(p.anim.has('Pet') ? 'Pet' : 'Interact', { then: 'Idle' });
      else if (h.kind !== 'look' && h.kind !== 'warm') p.anim?.once?.('Interact', { then: 'Idle' });
      if (h.kind === 'ring') d.audio?.bell?.();
      else if (h.kind === 'play') d.audio?.chime?.(Math.floor(Math.random() * 6));
      else if (h.kind === 'open') d.audio?.click?.();
    }
    // what she thinks (Mika's own voice); seated she stays seated while she talks
    const lines = this.linesFor(s).map(t => ['mika', t, pose ? 'None' : undefined]);
    const found = this.memoryAt(s) && forStory(this.memoryAt(s));
    if (found) lines.push(['narrator', tx('House memory: {name}. {text}', { name: tx(found.name), text: tx(found.text) })]);
    if (lines.length) await d.say(null, lines);
    if (found) this.keep(found);
  }

  /** The highest collider top under a point (furniture or a raised floor), below `under`; null if none. */
  topAt(x, z, under) {
    const C = this.g.colliders;
    let best = null;
    for (const it of C.near(x, z)) {
      if (it.enabled === false || it.y1 > under || !C.constructor.contains(it, x, z, 0)) continue;
      if (best === null || it.y1 > best) best = it.y1;
    }
    return best;
  }

  /** What Mika thinks at a spot, in the chosen story (a hotspot may carry Grandma-story lines). */
  linesFor(s) {
    const L = s.h.lines || {}, g = storyId() === 'grandma' ? L.grandma : null;
    return g?.[s.variant] || g?.any || L[s.variant] || L.any || [];
  }

  /** The memory hidden at this spot, if Mika has not found it yet. */
  memoryAt(s) {
    const m = s.memory;
    return m && !this.d.q.state.memories.includes(m.home) ? m : null;
  }

  keep(m) {
    const st = this.d.q.state, ui = this.d.ui;
    st.memories.push(m.home);
    if (m.mon) st.mon = (st.mon || 0) + m.mon;
    ui.toast(tx('House memory {n}/{total}: {name}', { n: st.memories.length, total: MEMORY_COUNT, name: tx(forStory(m).name) }), 'journal-page');
    this.d.audio?.pickup?.();
    this.d.refreshHud?.();
    this.d.save?.();
  }

  standUp() {
    const s = this.seat;
    if (!s) return;
    const p = this.g.player;
    this.seat = null;
    p.pose = null;
    s.obj.removeFromParent();
    p.dismount(s.spot.stand.x, s.spot.stand.z, s.spot.stand.y, p.facing);
    this.g.follow.clearCutscene(true);
  }

  /** For the journal: every memory, found or not, with the home it belongs to. */
  journal() {
    const found = new Set(this.d.q.state.memories);
    return Object.entries(MEMORIES).map(([home, m0]) => { const m = forStory(m0); return { home, found: found.has(home), name: m.name, text: m.text }; });
  }
}
