// QA helpers for the browser autopilot (only attached with ?qa=1). The autopilot still acts through real
// keyboard and mouse input; these helpers only read state, teleport, and point the camera.
export function attachQA(game, director, ui) {
  const d = director;
  const v = p => (p ? [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)] : null);
  const qa = {
    game, director, ui,
    state() {
      const q = d.quest?.state;
      return {
        step: q?.step, chapter: q?.chapter, busy: d.busy, dlg: ui.dialogueOpen, choice: ui.choiceActive, overlay: ui.overlay,
        pos: v(game.player.pos), inv: q?.inv, lamps: q?.lamps, minigame: d.minigame?.kind || null, focus: d.focus?.id || null,
        swim: game.player.swimming ? (game.player.submerged ? 'under' : 'surface') : null, camUnder: !!game.underwater?.under, running: d.running ? JSON.stringify(d.running) : null, season: game.time.season, hour: +game.time.hour.toFixed(2), fps: game.fps, mounted: !!game.player.mounted,
      };
    },
    teleport(x, z, y) { game.player.teleport(x, z, y, game.player.facing); game.follow.first = true; return v(game.player.pos); },
    npc(id) { const n = d.npcs[id] || d.wildlife.story[id]; return n ? v(n.pos) : null; },
    interactable(id) { const it = d.interactables.get(id); return it ? v(it.posFn ? it.posFn() : it.pos) : null; },
    target(id) { return v(d.targets.get(id)?.pos); },
    targets(prefix) { return [...d.targets.values()].filter(t => t.id.startsWith(prefix) && t.when()).map(t => ({ id: t.id, pos: v(t.pos) })); },
    pickups(item) { return [...d.pickups.values()].filter(p => (!item || p.item === item) && p.when()).map(p => ({ id: p.id, item: p.item, pos: v(p.pos) })); },
    faceToward(x, z) { const p = game.player.pos; game.follow.yaw = Math.atan2(x - p.x, z - p.z); game.player.facing = game.follow.yaw; },
    fish() { const m = d.minigame; return m?.kind === 'fish' ? m.m.view() : null; },
    cook() { const m = d.minigame; return m?.kind === 'cook' ? m.m.view() : null; },
    sheep() { return (d.wildlife.story.sheep || []).map((s, i) => ({ i, x: s.x, z: s.z, penned: s.penned, homing: !!s.homing })); },
    fox() { const f = d.wildlife.story.fox; return f ? { pos: v(f.pos), left: f.trail?.length ?? 0, walking: !!f.path } : null; },
    train() { const r = game.railway; return { s: r.train.s, v: r.train.v, target: r.train.target }; },
    lanternTargets() { return [...d.targets.values()].filter(t => t.id.startsWith('lantern') && t.when()).map(t => ({ id: t.id, pos: v(t.pos), d: t.pos.distanceTo(game.player.pos) })); },
    trace() { return d.trace || []; },
    errors: [],
  };
  window.__STARLINE_QA__ = qa;
  return qa;
}
