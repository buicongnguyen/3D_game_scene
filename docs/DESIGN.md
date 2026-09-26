# Starline — game and technical design

This document covers what the redesign changed and why, how the systems fit
together, and how the game is verified. The story itself is in
[STORY.md](STORY.md); the art contracts are in [../art/CONTRACTS.md](../art/CONTRACTS.md).

## 1. Why a redesign

| The old *Wildhaven* | *Starline* |
|---|---|
| **One goal:** gather 2 wood and 2 food, cook dinner, repeat. Hunting rabbits was the main verb. | **A mystery in five acts:** each season has its own place, keeper, problem and lamp. The villain is nobody, and the twist reframes every character. |
| **One 8,900-line `index.html`** holding the renderer, shaders, gameplay and UI. | **Modular runtime** (`src/engine`, `world`, `actors`, `game`, `ui`, `fx`) with pure, Node-tested cores. |
| **Hazy, desaturated palette;** placeholder houses, flat animals, a grey toy train. | **Vivid, warm stylised PBR** built in Blender by scripts: a skinned, animated cast; two distinct villages; a railway and viaduct as set pieces. |
| **Camera** spawned inside walls, and a panel covered a third of the screen. | **Collision-aware follow camera,** a minimal storybook HUD, dialogue with portraits, and chapter title cards. |

## 2. Game design

### Core loop per chapter

1. **Arrive in a new area.** The season has changed, and there is a new
   character with their side of the feud.
2. **Help them with a problem, through a mechanic.**
   - Chapter 1: fishing, then finding three cogs through exploring, climbing
     crates and booping a crab.
   - Chapter 2: herding sheep, a spark gallery and a delivery.
   - Chapter 3: following the fox, gathering, cooking, and the stepping stones.
   - Chapter 4: a confession with a choice, the village meeting, repairing the
     viaduct, and the on-rails lantern ride.
3. **Light the lamp at dusk.** A time-lapse brings on dusk, then the spark shot
   and a lamp-lighting cutscene. Tamo remembers a piece of the night (story
   reveal), and Mika receives a journal page (evidence).
4. **Unlock the next region** (ferry, orchard gate, shrine stairs, viaduct).
   Tamo also grows brighter, and his spark reaches further.

### Pacing and friction

- **No fail states.** Fishing can miss and cooking can be mashed, and all of
  them eventually succeed.
- **Deep water is forgiving:** it returns Mika to her last safe footing.
- **Guidance:**
  - An objective card with live counters (for example *Mill cogs 2/3*).
  - An on-screen marker that clamps to the screen edge.
  - A context prompt ("E · Talk to Rin").
  - Blocked routes explain themselves. Tamo comments on the raised drawbridge,
    the locked gate and the sleeping bear.
- **Herding:** sheep within 22 m of the pen trot home by themselves, so the
  player's job is to round up the strays.
- **Aim assist:** the spark locks onto targets within an angular cone. It
  requires line of sight, and the reticle shows the target's name.

### Progression gates (geography is the lock)

- The river blocks the east bank until Rin's ferry opens (end of chapter 1).
- The orchard fence and gate block the forest from Takamori until chapter 2 ends.
- Ōkuma the bear sleeps across the shrine stairs until chapter 3's dish.
- The broken viaduct span blocks the line east until chapter 4's repair.

### Optional depth

- 12 Fallen Stars, three per region. They unlock the poem, and all twelve
  unlock Sora's last letter.
- The fish log, including the dusk-only Starfin.
- The confession choice echoes in the platform scene and in the epilogue.
- The epilogue opens the valley for free roaming.

## 3. Runtime architecture

```
index.html         shell: loading, title, HUD, dialogue, journal, touch controls
src/main.js        boot: WebGL2 check, load, title flow, new game / continue, QA hooks
src/engine/        renderer (quality tiers, HDR composer, bloom, grade), assets (GLTF + meshopt),
                   input (keyboard, mouse, gamepad, touch), audio (procedural WebAudio), lights (pool),
                   effects (snow + wind material patch), textures, spline (pure maths)
src/world/         layout (pure data), heightfield (pure), terrain + splat, water, sky, grass,
                   scatter (pure) + foliage (instancing), structures, railway, colliders (pure),
                   paddies, seasons (pure)
src/actors/        player (controller + animation states), camera, animator, npc, tamo, animals (+ herding)
src/game/          story (script as data), quest (pure engine), director (world binding),
                   scenes (cutscenes), minigames (pure)
src/ui/            ui.js + style.css
src/fx/            particles, weather, fireworks, meteors
```

### Key decisions

- **One height field for rendering and physics.** `HeightGrid` bakes the
  analytic terrain and returns heights by interpolating the same triangles the
  mesh draws, so feet never float or sink.
- **The quest engine is pure.** `dispatch(event)` mutates the state and returns
  ordered effects, and the director presents them from a promise queue. Effects
  that happen inside that queue dispatch follow-up events without awaiting them;
  awaiting would deadlock the queue.
- **A light pool.** Every glowing object (lamps, porch, lanterns, sparks,
  headlamp) registers a source. Three point lights plus Tamo's own are assigned
  each frame to the most important sources. The light count never changes, so
  shaders never recompile and the per-fragment cost stays bounded.
- **Instancing:**
  - Trees use full meshes near the camera and 344-triangle LODs far away.
  - Shadows come from LOD proxies limited to the sun's shadow box.
  - Grass is one GPU-wrapped instanced field that reads height and density
    textures.
- **Seasons are world state.** The terrain palette, foliage recolour, bare
  deciduous trees, rice stages, snow (a material patch on up-facing surfaces),
  particles and music all change together.
- **The player lock is derived.** It is recomputed every frame from "is
  something owning the screen" (dialogue, cutscene, minigame, transition), so no
  code path can leave Mika frozen.

## 4. Art pipeline

Blender 4.5 is driven by Python (`art/blender/`):

- `kit.py`: bevelled primitives, AO baking to `COLOR_0`, material and export
  helpers.
- `rig.py`: armatures, rigid and blended skinning, clip authoring about the
  armature axes, and animated GLB export.
- Six family generators. Each rebuilds its models and saves a compressed
  `.blend`.

Every model has a contract: its node names, pivots, materials, clips, sizes and
triangle budget. `tests/assets.test.mjs` enforces them. Production builds
re-encode all GLBs with meshopt (`scripts/pack-models.mjs`), which cuts about
24 MB of raw models to under 12 MB. `tests/pack.test.mjs` checks that the packed
library still loads with every clip and node.

## 5. Verification

| Layer | Command | What it proves |
|---|---|---|
| Story engine | `node --test tests/story.test.mjs` | The whole campaign completes for both choices; saves resume mid-game; early pickups count; every dialogue exists; lines fit a phone box. |
| Minigames | `tests/minigames.test.mjs` | A skilled bot catches most fish and an idle player never does; cooking can't fail; sheep can be herded into the pen. |
| World | `tests/world.test.mjs` | Buildings stand on dry, level ground; the river is deep where it should be; stepping stones are a jump apart; paths avoid buildings; colliders behave; scatter is deterministic; nights are deep blue. |
| Assets | `tests/assets.test.mjs`, `tests/pack.test.mjs` | Every one of the ~150 models meets its contract; the packed library fits the budget. |
| Browser | `npm run test:e2e` | An autopilot plays the entire story on a GPU browser through real keyboard and mouse input. It uses QA hooks only to read state, teleport and point the camera. It fails on any page error or stuck step. `--from=<step>` resumes at any step through the pure engine. |
