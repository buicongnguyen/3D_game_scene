// Haptics: a short buzz on a phone (navigator.vibrate) or a rumble on a gamepad (vibrationActuator) for the moments a
// player should feel: a hard landing, a pickup, a catch, a star, a lamp lit. The sound cues in engine/audio.js call
// buzz(kind); nothing runs per frame. Settings > Vibration turns it off (key starline-opt-haptics); iPhones have no
// vibration API, so there it stays silent.

const KEY = 'starline-opt-haptics';

// kind: phone pattern (ms on/off/on...), gamepad rumble { ms, strong, weak }, and the shortest gap between two of a kind
export const HAPTICS = Object.freeze({
  tick: { phone: [12], pad: { ms: 40, strong: 0, weak: 0.35 }, gap: 0.08 },
  pickup: { phone: [22], pad: { ms: 80, strong: 0.2, weak: 0.5 }, gap: 0.15 },
  land: { phone: [30], pad: { ms: 90, strong: 0.55, weak: 0.3 }, gap: 0.25 },
  splash: { phone: [26], pad: { ms: 120, strong: 0.35, weak: 0.4 }, gap: 0.4 },
  star: { phone: [25, 50, 25, 50, 60], pad: { ms: 320, strong: 0.45, weak: 0.7 }, gap: 0.6 },
  lamp: { phone: [40, 70, 40, 70, 120], pad: { ms: 520, strong: 0.7, weak: 0.8 }, gap: 1 },
  fanfare: { phone: [30, 60, 30, 60, 30, 60, 90], pad: { ms: 450, strong: 0.5, weak: 0.8 }, gap: 1 },
});

/** Pure: may a buzz of this kind play now? (enabled, a known kind, and not too soon after the last one of its kind) */
export function mayBuzz(state, kind, now) {
  const h = HAPTICS[kind];
  if (!state.on || !h) return false;
  const last = state.last[kind];
  return !(last !== undefined && now - last < h.gap);
}

export class Haptics {
  constructor({ nav = typeof navigator !== 'undefined' ? navigator : null, store = safeStore(), now = () => performance.now() / 1000 } = {}) {
    this.nav = nav;
    this.store = store;
    this.now = now;
    this.state = { on: true, last: {} };
    try { const v = store?.getItem(KEY); if (v === 'off') this.state.on = false; } catch { /* default on */ }
  }

  get on() { return this.state.on; }
  setOn(on) {
    this.state.on = !!on;
    try { this.store?.setItem(KEY, on ? 'on' : 'off'); } catch { /* private mode */ }
    if (!on) try { this.nav?.vibrate?.(0); } catch { /* ignore */ }
  }

  /** k scales a gamepad rumble (0..1); the phone pattern stays as it is. */
  buzz(kind, k = 1) {
    const now = this.now();
    if (!mayBuzz(this.state, kind, now)) return false;
    this.state.last[kind] = now;
    const h = HAPTICS[kind], nav = this.nav;
    let done = false;
    try {
      const pads = nav?.getGamepads?.() || [];
      for (const pad of pads) {
        const act = pad?.connected && pad.vibrationActuator;
        if (!act?.playEffect) continue;
        act.playEffect('dual-rumble', { duration: h.pad.ms, strongMagnitude: h.pad.strong * k, weakMagnitude: h.pad.weak * k }).catch?.(() => {});
        done = true;
      }
    } catch { /* no gamepads */ }
    // phones only: a laptop with a vibrate function (some Chromebooks) would buzz for nothing
    if (!done && nav?.vibrate && coarse()) try { done = nav.vibrate(h.phone) !== false; } catch { /* blocked before a tap */ }
    return done;
  }
}

function coarse() {
  try { return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches; } catch { return false; }
}

function safeStore() {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

/** The game's one instance (audio cues and Settings share it). */
export const haptics = new Haptics();
