# Asset quality pass

## Target and limits

Aim for readable anatomy, convincing silhouettes and material separation at gameplay
distance, with a separate mobile mesh budget. These are improved procedural assets,
not AAA photorealistic models. More polygons alone do not establish realism.
The follow-ups below extend the same delivery pipeline to seasonal animals, the
train, and four village house styles. Landmark tower, well and mill remain procedural.

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

## Seasonal wildlife and railway follow-up

`tools/blender/generate_scene_assets.py` extends the shared generator with sheep,
snow-dusted brown bear, fox, peacock, chicken, flying bird, locomotive, coal tender,
coach and unit-radius train wheel. Seasonal rabbits reuse the existing rabbit GLB.
Every export has editable Blender source and a separate mobile delivery file.
Hard-surface train geometry is already sparse; its mobile files preserve thin windows
using planar simplification rather than aggressively collapsing their faces.

`scene-models.js` integrates these assets into the existing scene. Seasonal sprites
and flying-bird sprites are hidden; their simulation state drives instanced 3D meshes.
Seasonal wildlife retains the previous tour/exploration visibility rules (hidden in
the dinner mission), quality-dependent populations, terrain checks and distance culling.
Wings flap about shoulder pivots; legs use simple pivot motion, not skeletal rigs.
Brown bear snow detail is geometry; there is no separate polar-bear variation yet.

The train retains ten coaches, the tender, track following, animated wheel poses,
existing procedural coupling rods and smoke timing. Main bodywork and wheels now
come from Blender. Wheels are instanced into two draw calls for the entire consist;
the custom shadow pass has an instance-aware vertex shader. Opaque window materials
avoid transparent sorting costs. A low-cost sun/hemisphere lighting setup follows
the existing day/night direction; PBR surfaces do not yet receive the custom terrain
shadow map. No extra shadow or reflection pass was added.

Review fixed duplicate coplanar tail feathers, locomotive chimney support, thin-window
decimation, zero-budget culling, and wheel instancing/shadow transforms. Tests load
the actual desktop/mobile GLBs and cover budgets, finite instance matrices, animation,
distance/quality/mode visibility, and ten-coach assembly. The local browser reached
Ready. Exported seasonal and railway studio renders were inspected. These previews
are not an in-game lighting or real-phone performance benchmark.

Run the preview script with `-- --seasonal` or `-- --railway`; add `--mobile` to
inspect reduced delivery assets. Current models remain stylized, not AAA realistic.

## Village house follow-up

Plan executed: create four original Blender styles, replace residential geometry in
both existing settlements, preserve collision/smoke behavior, reduce phone detail,
test and deploy with the pending animal/train changes.

- Two-storey timber-framed home, weathered cottage with repaired plaster and shutters,
  new ivory flat-roof house, and teal art studio with skylight and rear mural panels.
- Framed opaque windows, doors, steps, chimneys, roof seams and deep stone foundations.
  Windows gain warm emissive color at night without creating many point lights.
- Desktop residential models total 570,556 bytes. Mobile models strip minor trim,
  cracks, hardware and roof seams, bounded by a separate 450 KB combined test budget.
- Repeated houses are instanced by style/material. Instanced geometry participates
  in the existing shadow/reflection passes and interaction-occlusion raycasts.
- Placement samples a nine-point footprint, rejects river/rail edges and steep slopes,
  avoids house overlap and the tower/well, and grounds foundations on the highest
  footprint sample. Conservative bounds include roof overhangs and steps.
- Review fixed the sign difference between existing village yaw and Three.js rotation.
  Collision and chimney smoke now use the same coordinate convention as the meshes.
- Thirteen automated tests pass, including GLB budgets, bounds, material/mesh validity,
  raycast occlusion, window glow, existing mission behavior, wildlife and train assembly.
  Desktop and mobile house studio renders were inspected. Browser startup diagnostics
  reported two villages and 41 accepted desktop houses, with no captured startup errors.

Generate everything with `tools/blender/generate_village_assets.py`; preview houses
using `tools/blender/preview_game_assets.py -- --houses` (optionally `--mobile`).
Houses are exterior props: interiors and enterable doors are not implemented.
