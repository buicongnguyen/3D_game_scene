// The analysis of a DevTools CPU profile (Profiler.stop().profile), shared by tests/perf/frame-profile.mjs and
// tests/perf/valley-breakdown.mjs: self time by file and by function, total time by function (self + what it called, counted
// once per call path that is not inside itself), who called a function, and what a function spent its time in.
// Names are the build's: profile an unminified build (`vite build --minify false`) so they mean something.

/** @returns helpers over one profile: { name, file, self, files, total, callersOf, inside }, times in milliseconds. */
export function analyse(profile) {
  const dt = new Map();
  profile.samples.forEach((s, i) => dt.set(s, (dt.get(s) || 0) + (profile.timeDeltas[i] || 0) / 1000));
  const byId = new Map(profile.nodes.map(n => [n.id, n])), parent = new Map();
  for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
  const memo = new Map();
  const tot = id => { if (memo.has(id)) return memo.get(id); let t = dt.get(id) || 0; for (const c of byId.get(id).children || []) t += tot(c); memo.set(id, t); return t; };
  const file = n => (n.callFrame.url.split('/').pop() || `(${n.callFrame.functionName || 'native'})`).replace(/\?.*$/, '').replace(/-[\w-]{8}\.js$/, '.js');
  const name = n => `${n.callFrame.functionName || '(anon)'} ${file(n)}:${n.callFrame.lineNumber + 1}`;
  const add = (m, k, v) => m.set(k, (m.get(k) || 0) + v);
  const self = new Map(), files = new Map(), total = new Map();
  for (const n of profile.nodes) {
    const k = name(n), s = dt.get(n.id) || 0;
    add(self, k, s); add(files, file(n), s);
    let p = parent.get(n.id), inside = false;
    while (p !== undefined) { if (name(byId.get(p)) === k) { inside = true; break; } p = parent.get(p); }
    if (!inside) add(total, k, tot(n.id));
  }
  /** self time of the functions called `want`, split by the chain of functions that called them (three frames up) */
  const callersOf = want => {
    const m = new Map();
    for (const n of profile.nodes) {
      if (n.callFrame.functionName !== want) continue;
      const ms = dt.get(n.id) || 0;
      if (!ms) continue;
      const chain = []; let p = parent.get(n.id);
      while (p !== undefined && chain.length < 3) { const q = byId.get(p); if (q.callFrame.functionName !== want) chain.push(`${q.callFrame.functionName || '(anon)'}:${q.callFrame.lineNumber + 1}`); p = parent.get(p); }
      add(m, chain.join(' < '), ms);
    }
    return m;
  };
  /** the time inside the function printed as `want` ("name file.js:line" or just "file.js:line"), split by what it calls directly */
  const inside = want => {
    const m = new Map();
    for (const n of profile.nodes) if (name(n) === want || name(n).split(' ').pop() === want) for (const c of n.children || []) add(m, name(byId.get(c)), tot(c));
    return m;
  };
  return { name, file, self, files, total, callersOf, inside, sampledMs: [...dt.values()].reduce((a, b) => a + b, 0) };
}

/** Print the biggest `n` entries of a map of milliseconds, divided by `div` (frames, to read ms per frame) with `digits` decimals. */
export function table(map, n, label, div = 1, digits = 0) {
  const rows = [...map].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `  ${(v / div).toFixed(digits).padStart(6)}  ${k}`);
  console.log(`${label}:\n${rows.join('\n')}`);
}

/** The "(root)", "(program)", "(idle)" and "(garbage collector)" rows say nothing about the game's functions. */
export const withoutPseudo = map => new Map([...map].filter(([k]) => !/^\((root|program|idle|garbage)/.test(k)));
