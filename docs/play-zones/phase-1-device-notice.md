# Phase 1: device notice and light mode for the stories

Back to the [plan](../PLAY-ZONES-PLAN.md). Status: **done** (2026-10-22).

## Goal

On a weak device, before a story starts, show a friendly card that explains the story shows the whole valley and may
run slowly and warm the phone, and offers a real fix. Never block the player.

## Design (as built)

- **When:** New Game (after the story is picked), Continue (after the slot) and Explore (after season and time), on a
  device judged weak by `weakDevice` in `src/engine/people.js`: the Low tier together with little memory
  (`navigator.deviceMemory` ≤ 3), few cores (≤ 4), or a device remembered as slow. Decided by power, not by "is it a
  phone": a strong phone or tablet is not warned. Mini games picked from the title list do not show it.
- **Slow memory:** when the governor steps two or more rungs down the Low ladder by its own judgement (not a
  cinematic's floor), `starline-slow` is stored and the device counts as weak from then on (`src/engine/renderer.js`).
- **Card:** in the title's profile box, titled "Before you start": "The story and Explore build the whole valley. On
  this device it may run slowly and warm up the phone. Light mode helps." Three choices:
  1. **Play in light mode**: Low tier, People: Light, sun shadows off, all saved like the Settings they are.
  2. **Play mini games instead**: opens the Mini games list (no valley loaded).
  3. **Continue**: starts as chosen.
  Closing the card (✕) goes back to the title and does not count as seen.
- **Light mode** is Low + light people + no shadows, not the round-light profile (that profile is for mini game rounds
  and has nothing to switch in the story). Weak devices are on Low already, so the gain comes from the people and the
  shadows. Before the valley is built (quick start, the usual case) it applies at once; after, a toast asks for a
  reload.
- **Frequency:** once per device (`starline-device-note`). Settings shows the same words with a "Use light mode"
  button (or "Light mode is on.") on weak devices only. Never in QA runs or automated browsers unless `?devicenote=1`.
- No temperature claims; ≥ 44 px choices, no text under 11 px; on a short screen (a turned phone) the choices drop
  their second line so all three fit.

## Tasks

| # | Task | Files | Status |
|---|---|---|---|
| 1.1 | Pure rule `noteWanted()` + device facts + slow memory, Node tests | `src/engine/device-note.js`, `tests/device-note.test.mjs`, `src/engine/renderer.js` | done |
| 1.2 | The card UI, three actions, remembered choice | `src/ui/ui.js`, `src/ui/style.css` | done |
| 1.3 | Light mode switch: Low + People: Light + shadows off | `src/ui/ui.js` | done |
| 1.4 | Settings line with the light-mode button | `src/ui/ui.js` | done |
| 1.5 | Translations vi/ko/ja | `src/i18n/*.json` | done |
| 1.6 | Browser check | `tests/device-note-browser.mjs` | done |
| 1.7 | Production build, suites, push, live check | — | done |

All of it shipped in one commit; its hash is in the log below.

## Bugs found and fixed on the way

- **Settings → Shadows never worked:** the setting switched `g.sky.sun`, but the sky lives at `g.world.sky`. Fixed.
- **With shadows off, every tree got an invisible shadow caster:** `Foliage.updateShadows` fell back to a straight-up
  light direction, whose basis is degenerate (`cross(UP, UP) = 0`), so every tree in the valley passed the box test
  and was drawn again (colour writes off) in the main pass: ~1.1 M extra triangles on the Low tier. Now the casters
  empty out while the key light casts no shadow and come back when it does (`src/world/foliage.js`, test in
  `tests/tree-theme.test.mjs`).

## Acceptance

- [x] A weak phone sees the card before a story, exactly once; a strong desktop never.
- [x] "Light mode" really switches tier, people and shadows, and the story measures lighter (below).
- [x] "Mini games instead" lands on the list with no valley; "Continue" starts the story unchanged; ✕ goes back.
- [x] Layout checks pass at 390x844, 844x390 and 1280x720; translations complete.
- [x] `npm test` and the standard browser suites pass on the production build.

## Measurements

Explore, Kawabe square (−26, 20) facing the lawn, phone tier (390x844, Low), CPU slowed 6x, production build; two
runs each, alternated after a warm-up run.

| | Draw calls | Triangles | Frame p50 | Frame p90 |
|---|---|---|---|---|
| Default (standard people, shadows) | 249 | 580 k | 33.3 ms | 33–50 ms |
| Light mode | 177 | 488 k | 16.7 ms | 33.4 ms |

Before the foliage fix, light mode measured 202 calls and 1.71 M triangles at the same spot.

## Log

- 2026-10-22: built, measured and shipped.
