# Valley game: design and implementation plan

## Direction

Turn the sightseeing scene into a small first-person woodland game while retaining
Season Tour. Start with a complete, replayable camp mission before building a large
survival simulation. Visual target: stylized natural forms, not photorealism.

## First playable slice — implemented

- Default entry is Play; Season Tour remains available via its button/settings or
  `?mode=tour`. The quest only advances in manual play, after entering, with menus
  closed and the game unpaused.
- Story: prepare the first dinner at a camp near the village. Collect two wood and
  two food, return, cook, and replay. Berries and rabbit hunting both supply food.
- A ten-minute daylight progression reaches dusk; this is a soft time target, not
  a punishing fail state. Cooking remains possible after dusk.
- HUD provides inventory counts, current objective, nearest required supply bearing,
  distance to camp, context prompt, collect/cook and shoot buttons. E interacts;
  pointer-locked left click shoots. Touch uses existing movement/drag-look with
  on-screen action buttons. Flight cannot shoot.
- Rabbits roam, flee at close range, face travel direction, animate their feet,
  react to a hit and become collectible. Hit checks are directional, range limited,
  with terrain, village and bridge occlusion. Current bow shots are instant mesh hit tests with a short
  tracer, not ballistic projectiles; no blood/gore.
- Supply placement rejects water and walking obstacles. The starting camp searches
  for a gentle village-side meadow instead of the cinematic hillside.
- Five original Blender assets: rabbit, wood bundle, berry bush, stone hearth and
  bow. Source `.blend` files are in `assets/source`; web `.glb` files in `public/models`.
- `gameplay.js` owns the gameplay objects, interactions and HUD. `game-rules.mjs`
  contains testable supply/cooking rules, separate from rendering.

## Blender workflow

Reuse the installed portable Blender from the neighboring `3d_astra` repo, read-only.
Run from this repository:

```powershell
& '../3d_astra/.tools/blender-4.5.3-windows-x64/blender.exe' --background --python tools/blender/generate_game_assets.py
```

The generator creates original geometry and materials, merges static parts by
material, retains named feet for runtime articulation, saves editable Blender
sources, then exports GLB. No external textures or third-party assets are required.
Only GLBs are shipped in `dist`, not Blender source files.

## Rendering budget

- Desktop starts at Low with 1% grass; mobile starts at Ultra Low with 0.1% grass.
- Existing quality presets reduce water geometry; Low and Ultra Low disable water
  reflections. User quality overrides remain supported.
- Flower density starts at 15%. Decorative billboard animal simulation is skipped
  in Play; four mobile/six desktop gameplay rabbits replace it.
- Rabbits beyond 85m stop rendering and updating. Static asset parts sharing a
  material are merged during Blender export; meshes/materials are shared by clones.
- Game daylight updates are quantized to reduce needless shadow invalidation.

## Verification gates

1. Blender generation succeeds; all five GLBs exist and production build includes them.
2. Tests verify insufficient supplies, exact ingredient consumption and one-time completion.
3. Browser loads mission HUD and assets; insufficient-supply cooking gives feedback.
4. Before expanding the game: manually complete gathering and hunting routes, test
   multitouch on physical phones, and measure frame times during a train crossing.

## Following milestones (not yet implemented)

1. Player progression: save/load, inventory screen, hunger and stamina, quest log.
2. Better hunting: a drawn bow, arrow flight/drop, animal hearing, footprints and
   tree/foliage occlusion beyond the current terrain, village and bridge checks.
3. Village story: one named NPC, dialogue and deliveries, a second meal recipe,
   rewards delivered by train. Add authored interior/cottage assets after interaction
   and collision tests.
4. Art expansion: sculpt/retopologize the rabbit, author rigged animation clips,
   create deer/fox and cottage variants, then bake shared material textures and LODs.
5. Longer survival: weather exposure, fishing, seasonal resources and later missions.

This slice has a compact supply inventory and cooking goal, not yet a full survival
campaign, skeletal animation system, realistic hunting simulator or finished art pass.
