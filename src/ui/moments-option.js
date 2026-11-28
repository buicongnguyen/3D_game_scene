// © 2026 Bui Cong Nguyen · solluxlabs.com
// Settings > "Weather moments (rainbows, birds, breezes)": on by default, remembered like the other options
// (localStorage 'starline-opt-moments', JSON). Tiny and static: the title page loads it, the moments code
// (game/moments.js) is fetched only when wanted. docs/WEATHER-MOMENTS.md.
const KEY = 'starline-opt-moments';

/** The rule, pure: ?moments=off never, ?moments=on always, a QA page (?qa) only when asked, else the player's choice. */
export function momentsWantedBy({ param = null, qa = false, stored = null } = {}) {
  if (param === 'off') return false;
  if (param === 'on') return true;
  if (qa) return false;
  return stored !== false;
}

/** Is the switch on for this visit? ?moments=on / off win over the saved choice (nothing is saved unless the box changes). */
export function momentsOptionOn({ param = null, stored = null } = {}) {
  return param === 'on' ? true : param === 'off' ? false : stored !== false;
}

function stored() {
  try { const v = JSON.parse(localStorage.getItem(KEY)); return typeof v === 'boolean' ? v : null; } catch { return null; }
}

/** Should this page have weather moments? (game.params: the URL's switches) */
export function momentsWanted(game) {
  const P = game?.params;
  return momentsWantedBy({ param: P?.get?.('moments') ?? null, qa: !!P?.has?.('qa'), stored: stored() });
}

/** The Settings checkbox: shows the saved choice, and switching it starts or stops the moments at once. */
export function wireMomentsOption(game) {
  const on = momentsOptionOn({ param: game?.params?.get?.('moments') ?? null, stored: stored() });
  game.momentsOff = !on;
  const box = typeof document !== 'undefined' ? document.getElementById('optMoments') : null;
  if (!box) return;
  box.checked = on;
  box.addEventListener('change', () => {
    game.momentsOff = !box.checked;
    try { localStorage.setItem(KEY, JSON.stringify(box.checked)); } catch { /* private mode: for this visit only */ }
    if (box.checked) game.wakeMoments?.();
    else game.moments?.stop(true);
  });
}
