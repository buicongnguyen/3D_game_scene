# Phase 2: zone builder and pilot (eggs, fireflies, tug of war)

Back to the [plan](../PLAY-ZONES-PLAN.md). Status: **todo**.

## Goal

The valley's builders can build one area alone, and three different kinds of game run from the title's Mini games
list as zones: a fixed camera (eggs), walking at night (fireflies) and a playground game with kids (tug of war).

## How the valley is built today (2026-10-22)

`Game.load()` (`src/game/game.js`) builds everything for the whole map in one go: `World` (`src/world/world.js`:
`HeightGrid`, `Splat`, `Terrain`, `Water`, `Sky`), then `Structures`, `Railway`, `Paddies`, `scatter()` →
`Foliage`, `Grass`, tree colliders, `Player`, `FollowCamera`, `Interiors`, `Riverbed`. All builders are deterministic,
so filtering them by an area gives the same result inside it. None accepts an area yet.

The quick-start runtime (`src/quick/runtime.js`) already runs trick and yard games on stand-ins for Game/Director.

## Design

- **Zone data:** each game gets `zone: { x, z, r }` (or a box) in its catalogue entry, defaulting to its `place` with
  a radius by kind (fixed camera ~45 m, walking ~70 m). A zone also names the people and model groups it needs.
- **Bounded builders:** every builder takes an optional `bounds` and skips what lies outside: height grid and splat
  computed only for the area (plus a margin), terrain and water tiles inside it, scatter/foliage/grass instances
  inside it, structures, railway and paddies whose footprint touches it, riverbed stretches, colliders.
- **Beyond the wall:** fog closing in at the zone edge and a ring of low-detail hills built from the same height
  function at a coarse step (no buildings, no trees, or a few billboard tree clumps). Optionally a panorama baked at
  build time for the long-view games of phase 5.
- **Virtual wall:** Mika slows and turns back gently near the edge (a soft push in `beforeMove`, as some games do
  already), behind a natural cue where possible (tall grass, fence, hedge). Never a hard invisible stop.
- **Runtime:** a `zone` runtime next to the quick one: loads only the zone's models, builds the bounded world, runs the
  existing trick or yard code unchanged on top of it, no train, no town life, no ambient tricks elsewhere. Leaving
  returns to the list and disposes everything (scene, GPU, DOM back to the title state).
- **Switches:** `?zones=off` keeps today's path (valley) for comparison; a QA hook reports the runtime.

## Tasks

| # | Task | Status | Commit |
|---|---|---|---|
| 2.1 | Move the measuring tools to `tests/perf/` and fix tap-to-play for valley games (phase 0.6, 0.7) | todo | |
| 2.2 | `bounds` in `HeightGrid`/`Splat`/`Terrain`/`Water` with Node tests (same heights inside, nothing outside) | todo | |
| 2.3 | `bounds` in `scatter`, `Foliage`, `Grass`, tree colliders | todo | |
| 2.4 | `bounds` in `Structures`, `Railway`, `Paddies`, `Riverbed`, `Colliders` | todo | |
| 2.5 | Far ring of low-detail hills + fog tuned to the zone edge | todo | |
| 2.6 | Virtual wall (soft push, natural cue), reusable helper | todo | |
| 2.7 | Zone runtime: load only the zone's models, run the game code, clean exit to the list | todo | |
| 2.8 | Pilot: `trick:eggs` as a zone; screenshots vs valley version; measurements | todo | |
| 2.9 | Pilot: `trick:firefly` as a zone (night, walking, wall test) | todo | |
| 2.10 | Pilot: `yard:tug` as a zone (kids, yard props) | todo | |
| 2.11 | Owner review of the pilot look and feel | todo | |
| 2.12 | Production build, suites, story autopilot, push, live check | todo | |

## Acceptance

- [ ] Inside each pilot zone the picture matches the valley version (side-by-side screenshots at three sizes).
- [ ] The edge reads as "the valley goes on", not a floating island; the wall turns Mika back gently.
- [ ] Tap to playable ≤ 3 s, download ≤ 4 MB, heap ≤ 40 MB, draw calls ≤ 90 on the phone tier (CPU 4x).
- [ ] Records and stars are shared with the valley version; leaving returns to the list with nothing left behind.
- [ ] The same games still work inside a story save; `?zones=off` restores today's path.
- [ ] `npm test`, the browser suites and the story autopilot pass on the production build.

## Measurements

| Game | Path | Tap to playable | MB | Requests | Heap | Draw calls |
|---|---|---|---|---|---|---|
| eggs | valley | | | | | |
| eggs | zone | | | | | |
| firefly | valley | | | | | |
| firefly | zone | | | | | |
| tug | valley | | | | | |
| tug | zone | | | | | |

## Log

- (empty)
