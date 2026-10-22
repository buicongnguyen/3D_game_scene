# Phase 0: baseline and tools

Back to the [plan](../PLAY-ZONES-PLAN.md). Status: **done** (measurements taken 2026-10-21/22).

## Goal

Know what the game costs today, measured the same way each time, so every later phase can show its gain.

## Tasks

| # | Task | Status | Notes |
|---|---|---|---|
| 0.1 | Profile the production build: network by type, heap, GPU resources, frame time | done | `.tools/profile-app.mjs` (local tool) |
| 0.2 | Per-frame cost: draw calls, triangles, JS ms at a CPU throttle | done | `.tools/frame-cost.mjs` |
| 0.3 | Triangles by scene group | done | `.tools/tri-sources.mjs` |
| 0.4 | Time to a playable valley, local and at 20 Mbps | done | `.tools/valley-time.mjs` |
| 0.5 | Tap-to-play for quick games | done | `tests/quickstart-measure.mjs` |
| 0.6 | Move the measuring tools into the repo (`tests/perf/`) so they survive the worktree | todo | do at the start of phase 2 |
| 0.7 | Fix `tests/quickstart-measure.mjs` for valley games (it times out waiting for the quick runtime) | todo | needed to measure zones vs valley in phase 2 |

## Baseline (phone tier, 390x844, CPU 4x, production build)

| Measure | Value |
|---|---|
| First visit to the title | 1.26 MB, 16 requests, heap ~6 MB |
| Valley to playable | 8.6 s local; 12.8 s at 20 Mbps |
| Valley download | 13.6 MB, 238 requests (after the 2026-10-21 perf pass) |
| Valley JS heap | ~78 MB (phone), ~86 MB (desktop High) |
| Quick game tap to playable | ~0.9 s, ~1.8 MB, heap ~7 MB, 4–8 draw calls |
| Valley mini game rounds | ~130–330 draw calls (focus-mode games 5–20) |

## Log

- 2026-10-21: perf pass shipped (character merge and governor on all tiers, rooms fetched near doors, service worker,
  desktop quality pick). See the Starline memory notes.
- 2026-10-22: baseline above; plan written.
