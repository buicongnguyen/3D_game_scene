// © 2026 Bui Cong Nguyen · solluxlabs.com
// Explore's own systems (docs/EXPLORE-AND-SHOW.md), started by src/main.js once an Explore save is loaded: the valley's
// calendar and Go to… (game/goto.js), the festival (game/festival.js), Play as (game/play-as.js), the two choice panels
// (ui/explore-panels.js) and the show's door (game/singplay/show-door.js). Sing & Play from the title is this with the
// show layer opened at once (game/singplay/singplay.js openShow): on a first visit at the station stage.
import { startGoTo } from './goto.js';
import { startFestival } from './festival.js';
import { startPlayAs } from './play-as.js';
import { mountShowDoor } from './singplay/show-door.js';
import { ExplorePanels } from '../ui/explore-panels.js';

export async function startExplore(game, director, ui, { singplay = false, fresh = false, season = null, hour = null } = {}) {
  const t = startGoTo(game, director);
  startFestival(game, director);
  startPlayAs(game, director);
  const panels = ui.explorePanels ??= new ExplorePanels(ui, game, director);
  panels.mountPause();
  // a season or a time picked on the title: a Go to… (forward) as the valley starts
  const h = Number.isFinite(+hour) && hour !== '' && hour !== null ? +hour : undefined;
  if (season || h !== undefined) await t.go({ season: season || undefined, hour: h }, { fade: false });
  mountShowDoor(game, director, ui);
  if (singplay) {
    const m = await import('./singplay/singplay.js');
    await m.openShow(game, director, ui, { first: fresh });
  }
  return t;
}
