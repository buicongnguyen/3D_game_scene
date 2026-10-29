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
| 2 | Zone builder and pilot | Builders can build one area; eggs, fireflies, tug of war run as zones | review | [phase-2](play-zones/phase-2-zone-pilot.md) |
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
| trick:eggs | −50, 148 | fixed camera | 2 (pilot) | review |
| trick:firefly | −66, 10 | walking, night | 2 (pilot) | review |
| yard:tug | 110, −16 | fixed camera, kids | 2 (pilot) | review |
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

## Review 2026-10-29: what the plan does not cover yet

Found by re-reading the plan against what was measured and built. Ordered by how much each matters to the owner's two
complaints (slow to start, laggy to play). "Evidence" says how it was found; nothing here is a guess unless marked.

| # | Gap | Evidence | Proposed step | Where |
|---|---|---|---|---|
| 1 | **The zone's far view is poor near the edge.** Fine from the middle, flat and smeared looking outward from 8 m inside the edge: the village is painted on the ground, bunting shows as stickers, trees just past the edge are missing | `.tools/edge-*.png` (eggs zone, south edge, zone vs whole valley) | For walking games: keep real objects 24 m past the edge (as before baking), and/or move the soft wall inward (`WALL_IN` 5 → 15). Add "stand at the wall, look out" shots to `tests/perf/zone-look.mjs` and judge them before a game is marked done | phase 3/4 checklist |
| 2 | **Sky games conflict with the baked sky.** The backdrop replaces the live sky dome, but the star games draw their own stars and flights over a live sky | code: `applyBackdrop` hides `world.sky.mesh` | Per-game flag: `sky: 'live'` keeps the dome and bakes only the ground view | phase 4 |
| 3 | **The speed targets of phase 2 are not met** (6 s / 9.5 MB against 3 s / 4 MB) and every converted game inherits the same floor | measured: ~2 s of shader work, ~1 MB of models loaded up front, ~0.3 s coplanar fix at load, ~0.7 s of fades | New **phase 2b** before phase 3: the four items on the phase 2 page | phase 2b |
| 4 | **The story, the main experience, has no load or lag plan** except the notice card and the "later" streaming. It builds the whole valley (8.6–12.8 s) and is where lag is felt | measurements of 2026-10-22 and 2026-10-25 | Cheaper than streaming: give every villager and animal in the full valley the zone's late body (`NPC.hydrate`): bodies only near Mika, one clone per frame. Fewer skins at load and ~1,000 fewer bones in the scene walk | phase 6a |
| 5 | **No real-phone measurement.** Everything is a PC GPU with a throttled CPU. GPU fill (13–15 full-screen post passes: bloom, grade, output), thermal throttling and memory limits are untested | method limit | A Settings button "Copy performance report" (tier, governor level, pacer, median work, draws, heap, user agent) for the owner to paste; one remote-debug profile on the phone | perf plan |
| 6 | **Safari (iPhone) never tested**, only Chromium. Safari has no `deviceMemory` | `src/engine/people.js` `weakDevice` | One WebKit pass of `zone-browser`, `device-note-browser`, `quickstart-browser` | perf plan |
| 7 | **The slow-device memory can no longer fill.** Phase 1 marks a device slow when the governor reaches step 2, but the pacer holds frames at an even 33 ms, under the governor's 38 ms step-down line, so it rarely gets there. On an iPhone (no `deviceMemory`) the card may never show | read of `renderer.js` + `pacer.js` | Call `markSlow()` when the pacer first engages. Decide whether the governor should be fed work time while paced (it also never climbs back: it needs p95 < 20.8 ms) | perf plan |
| 8 | **No performance gate.** All measuring is by hand, so new content (people, decorations) will bloat it again unnoticed | none exists | `tests/perf-budget-browser.mjs`: draws, visible objects and JS per frame at 4x at three spots, plus load MB, failing above today's numbers + 10% | perf plan |
| 9 | **Costs measured but unplanned**: celebration decor (11–13 draws, ~138k triangles, always on at the end of the story), river bed (40 draws, 185k triangles on High), shadow pass (174 draws on High), ~70 separate villagers, bloom's 15 post draws | `tests/perf/draw-calls.mjs`, `frame-profile.mjs` | Order: cells (Codex card), decor merge, bloom on weak phones, villager batching | perf plan |
| 10 | **Baked views are ~0.9 MB per game at two sizes** (28 more games ≈ 25 MB in `public/zones/`), though five games share one yard and three another | file sizes of the three pilots | Bake once per place and let games share it (key the bake by zone, not by game id) | phase 3 |
| 11 | Stale statuses and no runtime table | `phase-0` tasks 0.6/0.7 still "todo" though done | Fixed with this review; the runtime table below is new | docs |

### Runtime performance (outside zones): tracking

Phone tier = Low, 390x844 at 2x, CPU slowed. "Visible" counts objects in the scene graph that are drawn.

| Step | Status | Result (before → after) | Where |
|---|---|---|---|
| Draw-call audit tool | done | `tests/perf/draw-calls.mjs` | `57b04ec` |
| Merged buildings and props, one batch for the signposts, fewer unseen shadows | done | Kawabe High 808 → 509 draws; phone 245 → ~150 | `57b04ec` |
| Even 30 fps pacing, small animals near-only, shared instanced materials, viaduct batch, shadow-only layer | done | JS/frame at 4x 12.8 → ~11 ms; 8x steady 30 fps | `ac32acc` |
| Cheap effects (puffs, pollen, chimney smoke) and idle particle pools not drawn | done | effect code ~0.1–0.4 ms/frame; 3 pools no longer drawn on a clear day | docs/VFX.md |
| Cells (spatial grid) | with Codex | visible ~1,800 → ≤ 1,000 at Kawabe | `docs/codex/CELL-GRID.md` |
| Items 4–9 above | todo | | this table |

Baseline for the gate (2026-10-29, production build): Kawabe, phone tier, ~150 draws, ~1,800 visible objects, JS/frame ~11 ms at 4x;
High: 509 draws at Kawabe, 470 at Takamori, 324 at the station.
