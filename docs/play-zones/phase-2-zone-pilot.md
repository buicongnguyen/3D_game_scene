# Phase 2: zone builder and pilot (eggs, fireflies, tug of war)

Back to the [plan](../PLAY-ZONES-PLAN.md). Status: **review** (built 2026-10-22, waiting for the owner's look; the
speed targets are not met yet, see "Still to do").

## Goal

The valley's builders can build one area alone, and three different kinds of game run from the title's Mini games
list as zones: a fixed camera (eggs), walking at night (fireflies) and a playground game with kids (tug of war).

## How it works (as built)

A zone is a circle `{ x, z, r }` round a game's place (`src/content/zones.js`: `ZONES` lists the converted games, their
radius and the models they clone at once). The valley is built by the same code as always, with the zone in hand:

- **Ground** (`src/world/zone.js` `zoneHeightFn`): the exact terrain inside the zone, a coarse 12 m grid of the whole
  map beyond it, eased together over 18 m. The expensive river and railway distance tests run only inside.
- **Models** (`zoneModels`): buildings and lamps only where one stands in or near the zone, the railway only where the
  line passes. People and the big animals are not loaded up front: every one of them is an NPC, and in a zone an NPC
  outside it (or whose model is not loaded) gets its body when it first comes into view (`src/actors/npc.js`
  `hydrate`, the model fetched then).
- **Forests and buildings**: trees, rocks and flowers only inside the zone; whatever the builders put outside it is
  taken out of the scene after the build and again after the Director's set pieces (`src/world/zone-build.js`).
- **Far view** (`src/world/zone-backdrop.js`, baked by `scripts/bake-zone-backdrops.mjs`): the whole valley at the
  game's own season and hour, rendered from the zone's middle into six pictures (768 px for the Low tier, 1536 px in
  `hd/`; 150–790 kB a game). In the zone the sky is that picture, and the ground past the zone's edge wears it,
  projected from the point it was taken from, so the hills keep their shape and carry the far valley's trees, houses
  and river. The real ground blends into it over the last 10 m; the river fades out there.
- **Soft wall** (`wallStep`): 5 m inside the edge Mika's outward speed is taken away and she is eased back; she never
  gets past `r - 1`. "The game is this way" shows at most every 9 s.
- **Sessions** (`src/main.js`, `src/game/minigame-menu.js`): a converted game picked from the title's list builds its
  zone. Mika starts in it and the Explore save keeps its own place. After the round the list comes back: a game in the
  same zone plays on, any other starts from a fresh page (`?play=<id>`), closing the list goes back to the title.
- **Switches**: `?zones=off` builds the whole valley as before; `?zone=<game id>` builds that zone for any start (with
  `?start=explore`: walk about in it); `?zone=x,z,r` a zone by hand.

Found and fixed on the way (helps every path): the roads code baked a second whole-valley height grid the first time a
game's standing spot was checked (~1.7 s on a phone); it is now computed point by point as read (`HeightGrid.lazy`).

## Tasks

| # | Task | Status |
|---|---|---|
| 2.1 | Measuring tools in the repo (`tests/perf/valley-breakdown.mjs`, `zone-look.mjs`; tap-to-play for valley games, `--runs`, `--query`) | done |
| 2.2 | Zone ground: exact inside, coarse outside (`zoneHeightFn`), Node tests | done |
| 2.3 | Forests: zone's trees only (`zonePlaced`) | done |
| 2.4 | Buildings, railway, paddies, river bed: models by layout, pruned after the build | done |
| 2.5 | Far view: baked backdrop projected on the far ground (replaces the fog-and-hills ring) | done |
| 2.6 | Soft wall with a hint | done |
| 2.7 | Zone runtime: sessions, `?play=`, lazy people and animals, leaving | done |
| 2.8 | Pilot: `trick:eggs` | done |
| 2.9 | Pilot: `trick:firefly` | done |
| 2.10 | Pilot: `yard:tug` | done |
| 2.11 | Owner review of the pilot look and feel | waiting |
| 2.12 | Production build, suites, push, live check | done (see log) |

## Acceptance

- [x] Inside each pilot zone the picture matches the valley version (`tests/perf/zone-look.mjs`, four directions).
- [x] The edge reads as "the valley goes on": the far view is the valley itself.
- [x] The wall turns Mika back gently (`tests/zone-browser.mjs`).
- [x] Records and stars are shared with the valley version (the same Explore save); leaving goes to the list or title.
- [x] The same games still work inside a story save; `?zones=off` restores today's path.
- [x] `npm test`, the browser suites and `tests/zone-browser.mjs` pass on the production build.
- [ ] Tap to playable ≤ 3 s, download ≤ 4 MB, heap ≤ 40 MB, draw calls ≤ 90 on the phone tier: heap met, the rest
      not yet (below).

## Measurements

Phone tier (390x844, Low), CPU 4x, production build, tap on the card to the round playable, median of three runs
(the machine is shared: single runs vary by ±1.5 s). Same build, `?zones=off` for the valley.

| Game | Path | Tap to playable | MB | Heap | Draw calls |
|---|---|---|---|---|---|
| eggs | valley | 8.0 s | 15.0 | 39 MB | 278 |
| eggs | zone | 6.7 s (best 5.6) | 9.5 | 28 MB | 134 |
| firefly | valley | 8.1 s | 15.2 | 39 MB | 257 |
| firefly | zone | 5.9 s | 9.6 | 30 MB | 227 |
| tug | valley | 9.1 s | 15.7 | 39 MB | 21 (focus mode) |
| tug | zone | 6.0 s | 10.3 | 30 MB | 21 |

Before this phase the valley path for eggs took 11.4 s; the lazy height grid alone brought it to ~7–8 s.

## Still to do (toward the targets)

Where a zone's time goes (eggs, from the page opening): the zone built at ~3.1 s (ground 0.6 s, models 1.2 s, forests
and buildings 0.8 s), the Director and launch +1.6 s, then the first frames wait for ~80 shaders (~2 s).

1. Shaders: fewer programs in a zone (many are shadow and depth variants), or compile them during the load.
2. Models: the small critters, props and rewards are still loaded up front (~1 MB); `separateCoplanar` could run at
   build time instead of on every phone (~0.3 s, all paths).
3. The coarse whole-map grid could be baked at build time (~0.3 s).
4. The launch's fades and waits (~0.7 s) can be shorter when starting from the title.

5. **The far view near the edge** (found in the 2026-10-29 review): fine from the middle, flat and smeared looking outward from 8 m inside the edge. See the review table in the plan, gap 1.
6. Phase 2b (before phase 3): items 1–4 above, then the checks of gaps 1 and 2.

## Log

- 2026-10-22: zone ground, models, lazy people, pruning, sessions; first measurements (eggs 11.4 s → 9.1 s).
- 2026-10-22: lazy roads grid (every path faster); fog ring tried and dropped (it hid the valley); baked far view with
  projection onto the far ground; soft wall; browser suite; the three pilots measured above.
