// Unified input: keyboard + mouse, gamepad and touch -> one action model polled once per frame.
// move: {x, y} with x = right, y = forward, length <= 1. look: {x, y} deltas (pixels-ish) this frame.
// Buttons: jump, act, aim (held), fire, sprint (held), journal, pause, back.

const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  Space: 'jump', KeyE: 'act', KeyF: 'act', Enter: 'act', ShiftLeft: 'sprint', ShiftRight: 'sprint',
  KeyJ: 'journal', KeyI: 'journal', Escape: 'pause', KeyP: 'pause', KeyQ: 'aim', KeyR: 'fire', Backspace: 'back',
};

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.edges = new Set();      // pressed this frame
    this.move = { x: 0, y: 0 };
    this.look = { x: 0, y: 0 };
    this.zoom = 0;
    this.touch = { move: null, look: null, aimHeld: false };
    this.mouseAim = false;
    this.dragging = false;
    this.enabled = true;
    this.sensitivity = 1;
    this.invertY = false;
    this.lastDevice = 'keyboard';
    this.gamepadIndex = null;
    this.pointerLocked = false;
    this._bind();
  }

  _bind() {
    addEventListener('keydown', e => {
      const a = KEYMAP[e.code];
      if (!a) return;
      if (e.target instanceof HTMLInputElement) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(a)) this.edges.add(a);
      this.keys.add(a);
      this.lastDevice = 'keyboard';
    });
    addEventListener('keyup', e => { const a = KEYMAP[e.code]; if (a) this.keys.delete(a); });
    addEventListener('blur', () => this.releaseAll());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.releaseAll(); });

    const c = this.canvas;
    c.addEventListener('contextmenu', e => e.preventDefault());
    c.addEventListener('mousedown', e => {
      this.lastDevice = 'keyboard';
      if (e.button === 2) { this.mouseAim = true; this.edges.add('aimStart'); }
      else if (e.button === 0) {
        if (this.mouseAim) this.edges.add('fire');
        else { this.dragging = true; this.edges.add('click'); }
      }
    });
    addEventListener('mouseup', e => {
      if (e.button === 2) this.mouseAim = false;
      if (e.button === 0) this.dragging = false;
    });
    addEventListener('mousemove', e => {
      if (e.sourceCapabilities?.firesTouchEvents) return;
      if (this.dragging || this.mouseAim || this.pointerLocked) {
        this.look.x += e.movementX;
        this.look.y += e.movementY;
      }
    });
    c.addEventListener('wheel', e => { this.zoom += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    document.addEventListener('pointerlockchange', () => { this.pointerLocked = document.pointerLockElement === c; });

    // touch: left half = floating joystick, right half = look; buttons are separate DOM elements
    c.addEventListener('touchstart', e => this._touch(e, 'start'), { passive: false });
    c.addEventListener('touchmove', e => this._touch(e, 'move'), { passive: false });
    c.addEventListener('touchend', e => this._touch(e, 'end'), { passive: false });
    c.addEventListener('touchcancel', e => this._touch(e, 'end'), { passive: false });
    addEventListener('gamepadconnected', e => { this.gamepadIndex = e.gamepad.index; });
  }

  _touch(e, phase) {
    e.preventDefault();
    this.lastDevice = 'touch';
    for (const t of e.changedTouches) {
      if (phase === 'start') {
        if (t.clientX < innerWidth * 0.45 && !this.touch.move) {
          this.touch.move = { id: t.identifier, ox: t.clientX, oy: t.clientY, x: t.clientX, y: t.clientY };
          this.onStick?.(this.touch.move);
        } else if (!this.touch.look) {
          this.touch.look = { id: t.identifier, x: t.clientX, y: t.clientY, t0: performance.now(), sx: t.clientX, sy: t.clientY };
        }
      } else if (phase === 'move') {
        if (this.touch.move?.id === t.identifier) { this.touch.move.x = t.clientX; this.touch.move.y = t.clientY; this.onStick?.(this.touch.move); }
        if (this.touch.look?.id === t.identifier) {
          this.look.x += (t.clientX - this.touch.look.x) * 1.35;
          this.look.y += (t.clientY - this.touch.look.y) * 1.35;
          this.touch.look.x = t.clientX; this.touch.look.y = t.clientY;
        }
      } else {
        if (this.touch.move?.id === t.identifier) { this.touch.move = null; this.onStick?.(null); }
        if (this.touch.look?.id === t.identifier) {
          const l = this.touch.look;
          // a quick tap on the right side acts as "advance dialogue / interact"
          if (performance.now() - l.t0 < 250 && Math.hypot(t.clientX - l.sx, t.clientY - l.sy) < 12) this.edges.add('tap');
          this.touch.look = null;
        }
      }
    }
  }

  /** Called by on-screen buttons. */
  press(action) { this.edges.add(action); this.keys.add(action); }
  release(action) { this.keys.delete(action); }

  releaseAll() {
    this.keys.clear();
    this.mouseAim = false;
    this.dragging = false;
    this.touch.move = null;
    this.touch.look = null;
    this.onStick?.(null);
  }

  /** Poll once per frame before gameplay reads it. */
  poll() {
    let mx = 0, my = 0;
    if (this.keys.has('left')) mx -= 1;
    if (this.keys.has('right')) mx += 1;
    if (this.keys.has('up')) my += 1;
    if (this.keys.has('down')) my -= 1;
    const tm = this.touch.move;
    if (tm) {
      const dx = tm.x - tm.ox, dy = tm.y - tm.oy, r = 56;
      mx += Math.max(-1, Math.min(1, dx / r));
      my -= Math.max(-1, Math.min(1, dy / r));
    }
    // gamepad
    const pads = navigator.getGamepads?.() ?? [];
    const gp = this.gamepadIndex !== null ? pads[this.gamepadIndex] : [...pads].find(Boolean);
    this.gpAim = false;
    if (gp) {
      const dz = v => (Math.abs(v) < 0.15 ? 0 : v);
      const lx = dz(gp.axes[0]), ly = dz(gp.axes[1]), rx = dz(gp.axes[2]), ry = dz(gp.axes[3]);
      if (lx || ly) { mx += lx; my -= ly; this.lastDevice = 'gamepad'; }
      if (rx || ry) { this.look.x += rx * 14; this.look.y += ry * 10; this.lastDevice = 'gamepad'; }
      const btn = i => gp.buttons[i]?.pressed;
      this._gpEdge('jump', btn(0)); this._gpEdge('act', btn(2) || btn(1) && false); this._gpEdge('back', btn(1));
      this._gpEdge('fire', gp.buttons[7]?.value > 0.5); this._gpEdge('journal', btn(8)); this._gpEdge('pause', btn(9));
      this.gpAim = gp.buttons[6]?.value > 0.4;
      if (btn(10)) this.keys.add('sprint'); else if (this.lastDevice === 'gamepad') this.keys.delete('sprint');
    }
    const len = Math.hypot(mx, my);
    this.move.x = len > 1 ? mx / len : mx;
    this.move.y = len > 1 ? my / len : my;
    if (this.invertY) this.look.y = -this.look.y;
    this.look.x *= this.sensitivity;
    this.look.y *= this.sensitivity;
  }

  _gpEdge(action, down) {
    this._gp = this._gp || {};
    if (down && !this._gp[action]) this.edges.add(action);
    this._gp[action] = down;
  }

  pressed(a) { return this.enabled && this.edges.has(a); }
  held(a) { return this.enabled && this.keys.has(a); }
  get aiming() { return this.enabled && (this.mouseAim || this.keys.has('aim') || this.gpAim || this.touch.aimHeld); }

  /** Clear per-frame state; call at the end of the frame. */
  endFrame() {
    this.edges.clear();
    this.look.x = 0; this.look.y = 0;
    this.zoom = 0;
  }
}
