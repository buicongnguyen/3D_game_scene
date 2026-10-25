# Codex task: draw the valley by cells (spatial grid)

Owner request, 2026-10-25: make the game smoother on phones without lowering quality. This card is the whole task;
read it to the end before starting. Report back by filling in the **Log** at the bottom.

## Why

Measured on the phone tier (390x844, Low) with the CPU slowed 4x and 8x (the owner's phone is about 8x slower than
the development PC), at Kawabe in Explore:

| | Value |
|---|---|
| JS per frame at 4x | ~11 ms (budget 16.7) |
| JS per frame at 8x | ~25–28 ms (paced to an even 30 fps by `src/engine/pacer.js`) |
| Draw calls | ~140–200 (view + shadow + post) |
| Objects in the scene | ~6,500, of which ~1,800 visible |
| Biggest costs at 8x | native per-draw cost ~12 ms; `projectObject` (three.js frustum walk) ~2.7 ms; `updateWorldMatrices` (`src/engine/matrices.js`) ~2.6 ms; the shadow pass walks the scene again |

Triangles and the ground are cheap. The cost is **how many objects three.js walks and tests every frame, twice (view
and shadow map)**, and how many draws they make. Today every building, prop and decoration is its own child of
`structures.group` and is distance-culled one by one (`Structures.cull`, every 0.3 s, `src/world/structures.js`).

## Goal

Put the static world into a grid of cells, one `THREE.Group` per cell. Each frame (or every 0.3 s as now) decide which
cells are near and in view, and hide whole far cells. three.js then skips everything inside a hidden cell without
testing it, and the matrix pass skips hidden subtrees already (`visit` returns on `visible === false`).

Same picture, fewer objects walked, fewer draws.

## Rules

- Work in a **git worktree** of this repository (for example `git worktree add ../3D_game_scene-cells origin/main`).
  Never edit the folder `C:\Users\n\source\repos\3D_game_scene` itself: it holds another session's uncommitted work.
- Run git with `-c safe.directory=*` on this machine. Fetch and merge `origin/main` before pushing; Claude also
  pushes here.
- Keep each file's line endings (most `src/` files are CRLF in the working copy). Do not rewrite whole files.
- **No visible change.** Every shot taken at the same spot before and after must match (see Verify). If a change
  shows, find out why; don't accept it.
- Keep a switch to the old path: `?cells=off`, like `?merge=off`, `?zones=off` and `?pace=off`.
- Stop dev and preview servers by their exact port or PID, never by process name: other sessions run Vite too.
  Use ports 5897/5898 or any free port above 5900; avoid 4173.
- Real build: `npm run build` (packs the models and stamps the service worker); plain `vite build` ships unpacked
  models. Profile on an unminified build (see Measure).
- Commit messages end with your own attribution line. One commit per step that works.

## Design

`src/world/cells.js` (new; keep the pure part testable in Node):

- `CELL = 64` metres. The grid is **centred on the villages**, not aligned at 0: use
  `i = Math.floor(x / CELL + 0.5)` so Kawabe (−26, 20) and Takamori (110, −16) don't straddle four cells.
- `class CellGrid { constructor(parent, cell = CELL) }` creates groups lazily, named `cell:i,j`, children of
  `parent`, at the origin with identity transforms (so moving an object into a cell changes nothing in world space).
- `add(obj, x, z, kind)`: reparent `obj` into the cell of (x, z). `kind` is `'building' | 'prop' | 'mid'`, the same
  three distances `Structures.cull` uses today (`q.buildDist`, `q.propDist`, `q.midDist`). A cell keeps the
  largest distance among its kinds per kind list (a cell can hold a building and props; see "Mixed cells").
- `update(ref, camera, q)`: a cell is shown when its nearest point is within its distance of `ref` (with the same
  hysteresis as today: `back(d) = min(d − 12, d × 0.94)` to hide, full `d` to show) **and** its box intersects the
  camera frustum (pad the box by 30 m upward for tall things such as the bell tower and lamp towers). Cheap: ~40
  cells, a box test each.
- **Mixed cells**: props vanish sooner than buildings. Give each cell two child groups, `buildings` and `props`
  (and `mid` for the landslide trees, see `structures.js` ~line 178), each with its own distance. Then a far cell
  can show its buildings and hide its props, as now.
- `ref`: the same rule as `Structures.cull`: the player's position while the follow camera orbits near her
  (`world.focus` within 15 m of the camera), else the camera itself (cut-scenes, tours, wide shots).

Wiring:

1. `Structures`: in `place()`, `placeDocks()`, `placeStones()`, `placeDressing()` and `placeLandslide()`, add each
   object to the grid instead of `this.group.add(...)`. Every object that is pushed to `cullList` today goes into a
   cell of its kind; objects with `noCull` (the lamps placed with `noCull: true`, the bell tower) go into a cell group
   that is never distance-culled (frustum only), or stay directly under `structures.group`. `byId`, `nodes`,
   `lamps`, `solids` and colliders stay as they are: only the parent changes.
2. `Structures.cull()`: replace the per-object loop with `cells.update(...)`. Keep `signs.cull` and the
   `propShadowsOff` step.
3. `batchCopies` (`src/world/static-batch.js`): it batches copies per 48 m cell. Make it use the same grid (64 m,
   centred) and put each batch into its cell's group, so batches hide with their cell. Fences, the viaduct spans and
   abutments use it.
4. `YardBuild` (`src/world/yard.js`) and `ArcheryBuild` (`src/world/archery.js`) push their whole group to
   `cullList` as a prop: add the group to the cell of its middle instead.
5. Name boards (`src/world/signs.js`, `Signs.cull`) and the trick signposts (`Tricks.batchSigns` in
   `src/game/tricks.js`: one instanced mesh for all 35 posts) stay as they are.
6. Play zones (`src/world/zone-build.js`): `pruneOutside` removes children of `structures.group` that are wholly
   outside the zone. With cells, prune whole cells and the objects inside cells that straddle the zone edge (walk
   one level deeper). `tests/zone-browser.mjs` must still pass with no placeholder inside a zone.
7. Optional, only after 1–6 pass and are measured: put the wildlife (`src/actors/animals.js`) and the Town Life
   people under cells by their **home** spot, hiding whole far cells. They move, so this must not break walking
   between cells (re-parent when one crosses a cell edge, at most a few per frame). Skip if it gets risky.

Things that set `visible` on objects in `structures.group` themselves (they keep working because the cell is a
separate parent): the interiors hide their house while Mika is inside (`src/world/interiors.js`), the scene tour,
focus mode (`src/engine/focus.js` hides objects for its still picture), the drawbridge, the gate, the viaduct
repair. Check each one still behaves: a hidden cell must not stop focus mode or the tour from showing what they
need. Focus mode renders the valley once from the round's camera: call `cells.update` for that camera before it
takes its picture, or the far cells of a wide shot will be missing.

## Measure (before you start, after each step)

```bash
npm run build && npx vite preview --port 5897 --strictPort --host 127.0.0.1      # production build
GAME_URL=http://127.0.0.1:5897/ node tests/perf/draw-calls.mjs                   # draws per pass / group / object, Low and High
npx vite build --minify false --outDir .tools/dist-prof && node scripts/pack-models.mjs .tools/dist-prof/models
npx vite preview --outDir .tools/dist-prof --port 5898 --strictPort --host 127.0.0.1
GAME_URL=http://127.0.0.1:5898/ node tests/perf/frame-profile.mjs --cpu=4 --secs=8   # and --cpu=8; --spot=takamori|station
```

Also count the visible objects at the three spots (traverse `window.__STARLINE__.scene`, honouring `visible`) and
write all numbers into the Log. Run each timing twice: the machine is shared and single runs vary.

## Verify

1. **Pictures.** Write `tests/perf/spot-shots.mjs`: Explore (`?qa=1&quality=high&start=explore&slot=explore`) at
   Kawabe (−36, 30 facing −50, 40), Takamori (104, −4 facing 120, 14), the station (−98, 104 facing −60, 140) and a
   wide shot from the forest lamp hill, each at 11:00 and 21:00 in summer, 1280x720, with `?cells=off` and without.
   Compare each pair pixel by pixel (decode the PNGs in a page canvas, or add `pngjs` as a dev dependency) and print
   "N of M pixels differ". First diff two captures of the same build to know the noise (people and particles move:
   compare with Town Life frozen if needed, `director.townFrozen` / pause the clock). Look at every pair yourself.
2. **Tests.** `npm test`, then against the production build:
   `tests/quickstart-browser.mjs`, `tests/zone-browser.mjs`, `tests/minigame-exit-browser.mjs --only=phone`,
   `tests/minigame-menu-browser.mjs --all=1`, `tests/tour-production-browser.mjs`, and one story autopilot
   (`npm run test:e2e`, see `tests/e2e/`; it takes a while, run it once at the end).
3. **Phone.** At 8x the frame must not be slower than before, and the pacer (`?pace=off` to compare) should keep
   30 fps more steadily.

## Pass criteria

- Visible objects at Kawabe on Low: ≤ 1,000 (from ~1,800).
- JS per frame at 4x on Low: at least 10% lower at all three spots; never higher.
- Draw calls: never higher at any spot or tier.
- Pictures: no difference beyond the noise of two captures of the same build.
- All the suites above pass; `?cells=off` restores the old path exactly.

## Log (fill in)

| Step | Commit | Kawabe visible objects | JS/frame 4x (Kawabe / Takamori / station) | Draws Low / High | Notes |
|---|---|---|---|---|---|
| Baseline | `ac32acc` | ~1,786 | ~11 / – / – ms | ~150 / ~509 | measured by Claude 2026-10-25 |
| | | | | | |
