// Kotone's evening show: from 17:00 until she goes in at 19:00 the visitor dances and sings on the Hoshi Station
// forecourt, her back to the station, facing the lane from the valley (content/townsfolk.js: her plan's `do: 'Show'`).
// Her dances and singing are not in her model: they are a clip pack (public/models/moves-kotone.glb, her own armature
// and the moves, no mesh; art/blender/vroid_mixamo.py) fetched when Mika comes near in the evening or when the show
// starts, and lent to her Animator while she performs (game/tricks/exercise-moves.js lendClips).
//
// The show: a dance (one or two times through), a short rest, now and then a song (the Sing clip with her lips moving,
// actors/face.js) and a bow after every third dance. Mika can stand and watch; talking to her mid-show adds one line.
import { prepareMoves, lendClips } from './tricks/exercise-moves.js';
import { SPOTS } from '../content/townsfolk.js';

export const SHOW = {
  who: 'kotone',
  spot: 'hoshi.stage',
  pack: 'moves-kotone',
  from: 16.5, to: 19,          // hours: the pack is fetched in this window when Mika is near (the show itself is her plan's)
  near: 45,                    // metres from the spot
  dances: ['DanceHipHop', 'DanceArms', 'DanceHouse', 'DanceRunningMan', 'DanceSamba', 'DanceYmca', 'DanceWave'],
};

/** The show's next number after `prev`: [{ kind: 'dance'|'sing'|'rest'|'bow', clip, t }] (pure; tests/kotone-show.test.mjs). */
export function nextAct(state, rand = Math.random) {
  const s = state;
  if (s.last === 'dance') {
    s.since = (s.since || 0) + 1;
    if (s.since % 3 === 0) return { kind: 'bow', clip: 'Bow', t: 2.7 };
    return { kind: 'rest', clip: 'Idle', t: 3 + rand() * 2.5 };
  }
  if ((s.last === 'rest' || s.last === 'bow') && rand() < 0.3 && s.lastSing !== s.since) {
    s.lastSing = s.since;
    return { kind: 'sing', clip: 'Sing', t: 10.4 };
  }
  if (s.last === 'sing') return { kind: 'rest', clip: 'Idle', t: 2.5 };
  // a dance she has not done for a while: the order is shuffled, then played through
  if (!s.order?.length) {
    s.order = SHOW.dances.slice();
    for (let i = s.order.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [s.order[i], s.order[j]] = [s.order[j], s.order[i]]; }
    if (s.order[0] === s.prevDance && s.order.length > 1) s.order.push(s.order.shift());
  }
  const clip = s.order.shift();
  s.prevDance = clip;
  return { kind: 'dance', clip, t: 0, reps: rand() < 0.5 ? 1 : 2 };
}

export class KotoneShow {
  constructor(town) {
    this.town = town;
    this.g = town.g;
    this.it = null;            // the performer's Town Life entry while she performs
    this.loading = null;
    this.give = null;          // takes the lent clips back
    this.state = {};
    this.act = null;
    this.t = 0;
    this.spot = SPOTS[SHOW.spot];
  }

  /** Is this person performing now? */
  on(it) { return !!it && this.it === it; }

  /** Fetch the pack (once): when Mika is near the spot in the evening, or when the show begins. */
  fetch() {
    const a = this.g.assets;
    if (this.loading || !a) return this.loading;
    if (a.has?.(SHOW.pack)) return (this.loading = Promise.resolve(true));
    this.loading = a.loadLater([SHOW.pack]).then(() => a.has(SHOW.pack)).catch(() => false);
    return this.loading;
  }

  begin(it) {
    if (this.it === it) return;
    this.end();
    this.it = it;
    this.state = {};
    this.act = { kind: 'rest', clip: 'Idle', t: 1.5 };
    this.t = 0;
    it.n.setIdle('Idle');
    this.fetch()?.then(ok => { if (ok && this.it === it && !this.give) this.lend(it); });
  }

  lend(it) {
    const gl = this.g.assets.gltf?.(SHOW.pack), anim = it.n.anim;
    if (!gl || !anim) return;
    this.give = lendClips(anim, prepareMoves(gl, it.n.model, gl.scene, false));
  }

  end() {
    const it = this.it;
    if (!it) return;
    this.it = null;
    it.n.face?.quiet();
    if (it.n.idleClip !== 'Idle') it.n.setIdle('Idle');
    if (this.give) { it.n.anim?.cancelOneShot(); this.give(); this.give = null; it.n.anim?.play('Idle', { fade: 0.3 }); }
  }

  /** Every frame (Town Life's update). */
  update(dt, hour) {
    const g = this.g, p = g.player?.pos, s = this.spot;
    if (!this.loading && p && s && hour >= SHOW.from && hour < SHOW.to && Math.hypot(p.x - s.x, p.z - s.z) < SHOW.near) this.fetch();
    const it = this.it;
    if (!it) return;
    const n = it.n;
    if (this.town.d.busy) return;                         // (talking: the dialogue moves her; the show waits)
    this.t += dt;
    const a = this.act;
    if (this.t < a.t) return;
    // the next number (the dances only once her pack is in)
    let next = nextAct(this.state);
    if (!this.give && (next.kind === 'dance' || next.kind === 'sing')) next = { kind: 'rest', clip: 'Idle', t: 2 };
    if (!n.anim?.has(next.clip)) next = { kind: 'rest', clip: 'Idle', t: 2 };
    this.state.last = next.kind;
    if (next.kind === 'dance') next.t = (n.anim.clips.get(next.clip)?.duration || 8) * (next.reps || 1) - 0.2;
    this.act = next; this.t = 0;
    n.face?.quiet();
    if (next.kind === 'bow') { n.anim.cancelOneShot(); n.anim.once('Bow', { then: 'Idle' }); n.setIdle('Idle'); return; }
    n.setIdle(next.clip);
    n.anim.play(next.clip, { fade: 0.35 });
    if (next.kind === 'sing') n.face?.speak('', next.t - 0.4);   // (no recorded song yet: the lips move for the whole number)
    n.targetFacing = s?.face ?? n.targetFacing;
  }
}
