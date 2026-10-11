// Procedural poses for the yard games: the kids and Mika have no volleyball, rope, tug-of-war or sack clips, so for a
// third of a second after an event the right bones are bent by hand, after the animation mixer has run and before the
// frame is drawn. It works on Low's merged skins too (the bones are there either way) and with the lantern carry rig.
//
// body: { model, root, anim?, far? }  (an NPC's, or Mika's). kind: one of POSES. Bones are the humanoid rig of
// art/CONTRACTS.md (hips, spine, chest, upperarm_L/R, forearm_L/R, thigh_L/R, shin_L/R).
const POSES = {
  kick: { dur: 0.34 },
  bump: { dur: 0.45 },
  set: { dur: 0.5 },
  spike: { dur: 0.55 },
  pull: { dur: 0.5 },
  jump: { dur: 0.55 },
  hop: { dur: 0.34 },
  flick: { dur: 0.6 },
  sow: { dur: 0.7 },
  turn: { dur: 0.4 },
};
export const POSE_KINDS = Object.keys(POSES);

const sin = Math.sin, PI = Math.PI;
/** 0 -> 1 -> 0 over the pose, a little faster up than down. */
const bell = k => sin(PI * Math.min(1, Math.max(0, k)));
/** Up quickly, hold, down at the end. */
const hold = k => Math.min(1, k * 5) * (1 - Math.max(0, (k - 0.75) / 0.25));

export class Poses {
  constructor() { this.active = []; this.cache = new WeakMap(); }

  bones(model) {
    let b = this.cache.get(model);
    if (!b) {
      const n = name => model.getObjectByName(name) || null;
      b = { spine: n('spine'), uaL: n('upperarm_L'), uaR: n('upperarm_R'), faL: n('forearm_L'), faR: n('forearm_R'), thR: n('thigh_R'), shR: n('shin_R'), thL: n('thigh_L'), hips: n('hips') };
      this.cache.set(model, b);
    }
    return b;
  }

  /** Start (or restart) a pose on a body. */
  start(body, kind, dur = POSES[kind]?.dur ?? 0.4) {
    if (!body?.model) return;
    const have = this.active.find(p => p.body === body);
    if (have) { have.kind = kind; have.t = 0; have.dur = dur; return; }
    this.active.push({ body, kind, t: 0, dur });
  }

  /** Is this body posing now? */
  busy(body) { return this.active.some(p => p.body === body); }

  /** Bend the bones for this frame. Call after the animation mixers, before rendering. */
  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i], b = p.body;
      p.t += dt;
      if (p.t >= p.dur || b.far) { this.active.splice(i, 1); this.restore(b); continue; }
      // bring the clip's own pose back first (the mixer may not have run this frame), then bend on top of it
      b.anim?.update(0);
      this.apply(this.bones(b.model), p.kind, p.t / p.dur, b);
    }
  }

  restore(body) { if (body.pivot) body.pivot.rotation.x = 0; }

  apply(B, kind, k, body) {
    const s = bell(k), h = hold(k), rot = (bone, x, y = 0, z = 0) => { if (bone) { bone.rotateX(x); if (y) bone.rotateY(y); if (z) bone.rotateZ(z); } };
    let bob = 0;
    switch (kind) {
      case 'kick': rot(B.thR, -1.25 * s); rot(B.shR, 0.7 * bell(Math.min(1, k * 1.6)) * (1 - k)); break;
      case 'bump': rot(B.uaL, -1.0 * s); rot(B.uaR, -1.0 * s); rot(B.faL, -0.25 * s); rot(B.faR, -0.25 * s); rot(B.spine, 0.12 * s); break;
      case 'set': rot(B.uaL, -2.5 * h); rot(B.uaR, -2.5 * h); rot(B.faL, -0.5 * h); rot(B.faR, -0.5 * h); rot(B.spine, -0.1 * h); break;
      case 'spike': {
        const up = Math.min(1, k / 0.45), swing = k < 0.45 ? 0 : Math.min(1, (k - 0.45) / 0.3), fade = 1 - Math.max(0, (k - 0.8) / 0.2);
        rot(B.uaR, (-3.0 * up + 2.4 * swing) * fade); rot(B.faR, -0.6 * up * fade); rot(B.uaL, -2.0 * up * fade); rot(B.spine, (-0.2 * up + 0.35 * swing) * fade);
        bob = 0.28 * bell(k * 1.2);
        break;
      }
      case 'pull': rot(B.uaL, -1.3 * h); rot(B.uaR, -1.3 * h); rot(B.faL, -0.3 * h); rot(B.faR, -0.3 * h); rot(B.spine, -0.32 * h); rot(B.thR, 0.25 * h); break;
      case 'jump': rot(B.uaL, 0, 0, 0.9 * s); rot(B.uaR, 0, 0, -0.9 * s); bob = 0; break;
      case 'hop': rot(B.uaL, 0, 0, 1.0 * s); rot(B.uaR, 0, 0, -1.0 * s); rot(B.spine, 0.18 * s); break;
      case 'flick': rot(B.spine, 0.55 * h); rot(B.uaR, -0.9 * h); rot(B.faR, -0.6 * h); rot(B.thL, -0.5 * h); rot(B.thR, -0.5 * h); break;
      case 'sow': rot(B.spine, 0.65 * h); rot(B.uaR, -1.1 * h); rot(B.faR, -0.4 * h); break;
      case 'turn': rot(B.uaL, -1.6 * h); rot(B.uaR, -1.6 * h); break;
      default: break;
    }
    if (bob && body.root) body.root.position.y += bob;
  }
}
