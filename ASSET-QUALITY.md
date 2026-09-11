# Asset quality pass

## Target and limits

Aim for readable anatomy, convincing silhouettes and material separation at gameplay
distance, with a separate mobile mesh budget. These are improved procedural assets,
not AAA photorealistic models. More polygons alone do not establish realism.
The environment houses, train and seasonal animals are outside this seven-asset pass.

## Implemented

- Rabbit: merged/remeshed anatomical masses, facial contours, mouth, whiskers,
  angled ears and inner ears; retained separate feet for existing animation.
- Fish: tapered cross-section body, forked tail, thin fins, fin rays, gill outlines,
  eyes and flank markings. Correct outward face winding.
- Crab: shell rim, raised carapace, jointed leg shapes, eye stalks, open pincers.
- Wood/camp: exposed end grain, growth rings, bark ridges, irregular hearth stones.
- Berries: individual branches, pointed leaves, clustered fruit and calyx details.
- Bow: visible grip bindings. Shared materials keep static detail batched.
- Deterministic vertex surface colors and different roughness/metallic values are
  exported into GLB, rather than relying on Blender-only procedural shader nodes.
- Phones load only the decimated mobile GLBs, not the desktop models as well.

Desktop models total 1,534,260 bytes; mobile models total 567,188 bytes.
Automated budgets are 1.7 MB / 850 KB respectively, and fewer than 10,000 / 4,000
triangles per asset. This intentionally replaces the old 400 KB placeholder budget.
There are no additional runtime textures or reflection/shadow passes in this change.
These budgets are not a measured FPS guarantee.

## Verification and review

Generate with tools/blender/generate_game_assets.py using Blender 4.5.3.
Render exported GLBs using tools/blender/preview_game_assets.py; optional arguments
after `--` are `--mobile` and `--props`. Previews use studio lighting, not game lighting.
Native .blend sources are saved before mobile decimation.

Tests cover GLB validity, finite geometry bounds, vertex colors, triangle/download
budgets, preserved feet, and the actual desktop and mobile models in mission tests.
Review corrected inward fish faces and excessive small-detail geometry. Desktop
and mobile wildlife previews were inspected; mobile fin tips have expected reduction
artifacts at close range. Device FPS and in-game lighting still need visual profiling.

## Further work toward a realistic production art standard

1. Reference-guided sculpting and retopology, starting with one hero rabbit as a
   quality benchmark; correct anatomical proportions before expanding the roster.
2. UV-unwrapped, authored fur/scale/bark base-color, normal and roughness maps.
   Bake detail from high-resolution sculpts onto bounded delivery meshes.
3. Rigged locomotion: rabbit hopping/grazing, fish body/tail undulation and sideways
   crab walking. Current river motion remains whole-object movement.
4. Match assets to the game's sun, night and underwater lighting; add controlled
   material calibration instead of judging solely from a studio render.
5. Author distance LODs and profile representative phones before increasing scene
   population or texture sizes. Mobile currently selects one reduced mesh at load.

Do not label the current output AAA: realistic fur, authored texture maps, skeletal
animation and environment-wide art consistency remain unfinished.
