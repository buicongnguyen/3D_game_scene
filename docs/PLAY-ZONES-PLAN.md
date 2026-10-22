# Play zones: mini games without the whole valley

Status board for the plan agreed with the owner on 2026-10-22. Each phase has its own page in
[`docs/play-zones/`](play-zones/) with its tasks, acceptance checks and a log. Update the **Status** column and the
phase page whenever work lands (commit hash, date, measured numbers).

## Why

Measured on the phone tier (390x844, CPU slowed 4x, production build with packed models), 2026-10-22:

| | Quick games (marbles, ô ăn quan, 2 card games) | The other 31 mini games, and the stories |
|---|---|---|
| Tap to playable | ~0.9 s | 8.6 s locally, 12.8 s at 20 Mbps |
| Download | ~1.8 MB | ~13.6 MB, 238 files |
| JS heap | ~7 MB | ~80–110 MB |
| Draw calls in a round | 4–8 | ~130–330 |

To play one game by the pond, the game builds and simulates the whole valley. The offline cache (service worker,
2026-10-21) removes the re-download, not the build and draw cost.

## The decisions

1. **Mini games opened from the title build only their own area** (a *play zone*): the ground, water, trees, grass,
   buildings and props inside a circle or box around the game's place, the people that game uses, soft fog and a
   low-detail ring of the surrounding hills beyond it, and a soft *virtual wall* at the edge. The valley is never
   loaded for them. The zone is cut from the same deterministic builders as the valley, so it looks the same inside.
2. **The two stories are the "big" mode.** On a weak device a friendly card is shown before a story starts, with
   three choices: *Play the story in light mode*, *Play mini games instead*, *Continue*. Never blocking; once per
   device; re-readable from Settings. Light mode = Low tier + light people + the round-light profile.
3. **The story keeps the full valley for now.** Streaming the story's valley by zone is a later phase that reuses
   the zone builders.
4. Inside a story save the mini games keep working as today (the valley is already there).

## Phases

| # | Phase | Goal | Status | Page |
|---|---|---|---|---|
| 0 | Baseline and tools | Repeatable measurements in the repo; baseline recorded | done | [phase-0](play-zones/phase-0-baseline.md) |
| 1 | Device notice and light mode | Weak devices are warned before a story and offered light mode | done | [phase-1](play-zones/phase-1-device-notice.md) |
| 2 | Zone builder and pilot | Builders can build one area; eggs, fireflies, tug of war run as zones | todo | [phase-2](play-zones/phase-2-zone-pilot.md) |
| 3 | Fixed-camera games | 10 more games converted | todo | [phase-3](play-zones/phase-3-fixed-camera.md) |
| 4 | Walking, sky and water games | 15 games converted | todo | [phase-4](play-zones/phase-4-walking-sky-water.md) |
| 5 | Long-view games and wrap-up | Kite, paper planes, cow race; docs, cleanup, final measurement | todo | [phase-5](play-zones/phase-5-long-view.md) |
| 6 | Story zone streaming (later) | The stories load the valley in zones around Mika | later | [phase-6](play-zones/phase-6-story-streaming.md) |

Status values: `todo`, `in progress`, `review` (built, waiting for the owner's look), `done`, `later`.

## Every mini game and its phase

Places from `src/content/minigames.js` (`buildCatalogue`). The map spans roughly x −160…160, z −160…160.

| Game | Place (x, z) | Kind | Phase | Status |
|---|---|---|---|---|
| trick:lifecycle | −23, −18 | card board | already quick | done |
| trick:crops | −86, −8 | card board | already quick | done |
| yard:marbles | −26, 20 | fixed camera | already quick | done |
| yard:oanquan | −26, 20 | fixed camera | already quick | done |
| trick:eggs | −50, 148 | fixed camera | 2 (pilot) | todo |
| trick:firefly | −66, 10 | walking, night | 2 (pilot) | todo |
| yard:tug | 110, −16 | fixed camera, kids | 2 (pilot) | todo |
| yard:rope | −26, 20 | fixed camera, kids | 3 | todo |
| yard:sack | 110, −16 | follow camera, kids | 3 | todo |
| yard:footnet | −26, 20 | court, kids | 3 | todo |
| yard:keepup | −26, 20 | court, kids | 3 | todo |
| yard:volley | 110, −16 | court, kids | 3 | todo |
| trick:dance | 123, 12 | fixed camera, performers | 3 | todo |
| trick:exercise | −20, 37 | fixed camera | 3 | todo |
| trick:firedrill | −32, 39 | fixed camera | 3 | todo |
| trick:archery | −69, 51 | range, aim | 3 | todo |
| trick:roast | −19, 51 | walking + fixed | 3 | todo |
| trick:stars | −62, 158 | sky | 4 | todo |
| sky:shrine-steps | 62, −142 | sky | 4 | todo |
| sky:star-hill | −56, 161 | sky | 4 | todo |
| sky:pasture | 142, −30 | sky | 4 | todo |
| fish:dock | 4, 30 | water | 4 | todo |
| fish:mill | −10, −35 | water | 4 | todo |
| trick:swimming | −14, 75 | temporary pool | 4 | todo |
| trick:floatsafe | −12, 63 | temporary pool | 4 | todo |
| trick:river | −6, 22 | walking, water | 4 | todo |
| trick:frogs | −73, −9 | walking | 4 | todo |
| trick:dew | −52, −97 | walking | 4 | todo |
| trick:cricket | 76, 10 | walking | 4 | todo |
| trick:hoppers | −38, −68 | walking | 4 | todo |
| trick:beetles | 92, −103 | walking | 4 | todo |
| workshop | −45, 27 | indoor | 4 | todo |
| trick:kite | −28, 76 | long view | 5 | todo |
| trick:planes | 59, 52 | long view | 5 | todo |
| trick:cowrace | 87, −45 | long track | 5 | todo |

## Targets (checked at the end of each phase on the phone tier, CPU 4x)

| Measure | Valley today | Zone target |
|---|---|---|
| Tap to playable | 8.6–12.8 s | ≤ 3 s |
| Download for the game | ~13.6 MB | ≤ 4 MB |
| JS heap in the round | ~80–110 MB | ≤ 40 MB |
| Draw calls in the round | ~130–330 | ≤ 90 |
| Look inside the zone | — | the same as the valley version (screenshots side by side) |

## Rules for every phase

- Work in a git worktree off `codex-review`; merge `origin/main` before pushing (Codex also commits here).
- One commit per finished task, message ending with the Co-Authored-By line.
- Before a push: `npm test`, `npm run build` (packs models; plain `vite build` ships unpacked files), then against
  the production build `tests/minigame-menu-browser.mjs --all=1`, `tests/quickstart-browser.mjs`,
  `tests/minigame-exit-browser.mjs --only=phone`; the story autopilot when the valley or boot path changed.
- Look at screenshots at 1280x720, 390x844 and 844x390 for every converted game: the owner is sensitive to odd art.
- New player-visible strings get vi, ko and ja translations in the same commit (the i18n gate in `npm test`).
- Record the measured numbers in the phase page's log.
