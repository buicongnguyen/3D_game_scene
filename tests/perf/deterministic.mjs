// Fixed state for pixel/draw comparisons only; never use its virtual clock for timing.
export function deterministicBoot({ seed, save }) {
  const streams = new Map(); let virtualMs = 1000;
  Math.random = () => {
    const caller = new Error().stack.split('\n')[2] || '(unknown caller)';
    let n = streams.get(caller);
    if (n === undefined) { n = seed >>> 0; for (let i = 0; i < caller.length; i++) n = Math.imul(n ^ caller.charCodeAt(i), 16777619) >>> 0; }
    n = (Math.imul(n, 1664525) + 1013904223) >>> 0; streams.set(caller, n);
    return n / 4294967296;
  };
  Object.defineProperty(performance, 'now', { configurable: true, value: () => virtualMs });
  Date.now = () => 1760000000000 + virtualMs;
  localStorage.setItem('starline-save-explore', save);
  localStorage.setItem('starline-opt-tropicalTrees', 'false');
  let game;
  Object.defineProperty(window, '__STARLINE__', { configurable: true, get: () => game, set(g) {
    game = g;
    const original = g.frame.bind(g);
    g.frame = () => {}; // No uncontrolled animation frame advances the world during asynchronous loading.
    window.__spotDriver = {
      steps: 0,
      step(n) {
        g.clock.getDelta = () => 1 / 60;
        g.renderer.track = () => {}; // Quality/scale may not change under GPU contention.
        for (let i = 0; i < n; i++) { virtualMs += 1000 / 60; original(); this.steps++; }
      },
      state() { return { virtualMs, steps: this.steps, randomCallSites: streams.size, randomStates: [...streams] }; },
    };
  } });
}
