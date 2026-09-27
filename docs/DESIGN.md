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
   - Chapter 2: sending the runaway sheep home, ringing the scarecrow bells and a delivery.
   - Chapter 3: following the fox, gathering, cooking, and the stepping stones.
   - Chapter 4: a confession with a choice, the village meeting, repairing the
     viaduct, and the on-rails lantern ride.
3. **Light the lamp at dusk.** A time-lapse brings on dusk; Mika walks up and
   presses E, Tamo flies over and sparks it, and a lamp-lighting cutscene plays. Tamo remembers a piece of the night (story
   reveal), and Mika receives a journal page (evidence).
4. **Unlock the next region** (ferry, orchard gate, shrine stairs, viaduct).
   Tamo also grows brighter.

### Pacing and friction

- **One button.** Everything is "walk up and press E": a single interaction
  system ranks what is in reach (story-critical things first) and shows one
  prompt. Spark targets are interactables with a reach; Tamo flies to them by
  himself. Fishing is one press while the float is under; cooking is one press
  and a short progress bar; each sheep takes one press and trots home.
- **No fail states.** A missed bite just comes round again; a sheep that gets
  stuck on its way home is found in the pen.
- **Water is a place, not a wall.** Mika swims when the river is deeper than
  1.15 m: she floats with her head out, strokes along (the current drifts her
  gently downstream), dives with C and climbs out onto banks and docks with
  Space. Under the surface the camera switches to a tinted, fogged, softly
  wobbling view with a Snell's-window sky, bubbles and muffled sound. Swimming to
  Takamori's bank also counts as the chapter 2 crossing.
- **Guidance:**
  - An objective card with live counters (for example *Mill cogs 2/3*).
  - An on-screen marker that clamps to the screen edge.
  - A context prompt ("E · Talk to Rin").
  - Blocked routes explain themselves. Tamo comments on the raised drawbridge,
    the locked gate and the sleeping bear.
- **Homes you can enter.** Four interiors (built by `art/blender/build_interiors.py`)
  hang high above the valley; `src/world/interiors.js` fades Mika in through the
  real front door, hides the outdoors, relights the room (sun through the
  windows, warm lamps from the light pool) and keeps the camera inside. Each
  holds a keepsake for the journal; Sora's cottage also holds the Star Kite.
- **The Star Kite** (`src/actors/kite.js`, model by `build_kite.py`, Mika's
  `Hang` clip): swoop-in, grab, fly (cruise 9 m/s, boost 20 m/s) with terrain
  and roof clearance, and a landing that picks open ground (or drops her in the
  river to swim). The camera widens while flying. It lands by itself when a
  scene starts.
- **Valley friends.** Eight kinds of creature answer to E; the first hello plays
  a short scene and fills the Friends page. Rabbits and deer only bolt from a
  running Mika. Kon the fox stays by the shrine and Ōkuma sleeps in a den after
  chapter 3.
- **Celebrations.** Every lamp ends its chapter with a party cutscene
  (`celebrate:N` in scenes.js) built from `src/fx/celebrate.js`: blossom wave,
  koi, rainbow and petal star (spring); orchard lanterns, firefly river, floating
  sheep, fireworks and a bon-odori circle (summer); kodama, leaf-butterflies and
  moon-viewing animals (autumn); aurora, star-snow and the Star Train in the sky
  with Sora at the window, then the group photo (winter). Each sets its light
  first (spring golden hour, summer blue hour, autumn golden afternoon, winter
  night), takes a group photo (`groupPhoto`: everyone turns and cheers, a fill
  light for night shots, people stand on platforms via `standY`/`rowSlots`,
  saved per profile, shown in the credits), and ends with `flight()`: a ~25 s
  Catmull-Rom camera glide from low over the stream to high above the village,
  with `CAPTIONS.flightN` on top. Level of detail follows the view during a
  flight (`game.viewFocus`).
  Decorations are cumulative per lit lamp (`celebrate.decorate`), Tamo gains an
  orbiting mote per lamp, and the colour grade gets a touch more vivid.
  In the epilogue Tamo comes back on his Sundays off (`tamoBack`).
- **Rewards** (`registerRewards` in director.js, data in story.js `TREASURES`,
  `SKY_LETTERS`, `GIFTS`): the music box is a pickup on the river bed (diving),
  the golden acorn comes from Ōkuma at the moon-viewing and is planted at a
  fixed garden spot, the star compass is the fourth fish landed (a HUD needle to
  the nearest Fallen Star), Sky Letters are high pickups with a 3.4 m grab radius
  so a kite fly-by collects them, gifts are models at `Item_gift_*` nodes in the
  cottage shown once their step is done, and all twelve stars trigger the
  `starfall` cutscene and a permanent Starfall sky; its end completes `e.free`,
  which plays `theEnd` (a flight over the valley, then the end card with the
  album and numbers) and moves to `e.done`, free roam. Saves that already had
  all twelve stars play the ending on load. People come home as lamps
  are lit (villagers v8–v17), the bell tower chimes each hour after the Orchard
  Lamp, the shrine has wind chimes after the Forest Lamp, and the repaired
  viaduct gets fireworks.
- **Storytelling on the rails.** `CAPTIONS` in story.js are shown across the top
  (letterboxed during the arrival) as the train passes landmarks, by fraction of
  the route. In the epilogue Kobo shuttles between the station and Takamori Halt
  and Mika can ride it.
- **Winter ice.** When the shown season is winter the river freezes: the water
  shader blends to an ice sheet (snow drifts, cracks, sheen), `groundHeight`
  treats the river as a floor just above the water line, footing is slippery,
  the ferry is frozen in and the ducks are gone; the finale's lanterns sit on
  the ice instead of drifting.
- **Speed leap.** Tapping jump quickly while running forward multiplies the pace:
  2 taps ×4, 3 taps ×8, 4 taps ×16 (`LEAP` in player.js). Movement is sub-stepped
  (≤ 0.35 m) so a leap never tunnels through a wall; the camera widens and Tamo
  follows tighter at speed.
- **Difficulty.** Easy (the default) scales spark-target reach ×1.6 across and ×4
  in height and gives fish a 2.6 s bite window; Normal keeps ×1.15 / ×1.5 and 1.6 s.
  Hard (`game.hard`, `input.aimMode`) takes spark targets off the E key (except
  the Star Train's lanterns): hold aim (right mouse, Q, LT, touch Aim) for the
  over-shoulder camera and reticle (`director.updateAim`, 34 m range, terrain
  line of sight), then fire (click, R, RT, touch Spark).
- **Device words.** `{act}` in any string is filled by `tx()` from a global: `E`
  on a keyboard, “Do it” (the touch action button) on phones.
- **The landslide scar** (chapter 3) is a set piece whose ground the terrain
  cannot draw (a 2 m grid can't follow its walls): `landslide.glb` is the visible
  surface, `src/world/landslide.js` mirrors its analytic ground exactly, the
  terrain is sunk under it, and `world.heightAt` returns whichever is higher, so
  Mika, trees and pickups stand on the model. Keep `build_landslide()` and
  `landslide.js` in sync (`tests/landslide.test.mjs` fails if they drift). The
  step's `landslide` cutscene frames the scar before the dialogue.
- **The treasure hunt** (`HUNT` + `huntProgress` in story.js): `huntAsk` asks at
  the start of the epilogue (and `huntAsk:end` after The End if the answer was
  no; the journal's Treasures tab can start it too). The choice line carries
  `id: 'hunt'`. With `flags.hunt` the steps' `hunt`/`huntDone` objectives show
  `{found}/{total}`, `fx.glint(pos, strong)` sparkles on every hidden treasure
  (always faintly, strongly during the hunt), and `e.done`'s `hunt` marker
  leads to the nearest treasure left (`director.huntTargets()`: homes resolve to
  their front door outdoors, to the item inside; the Star Kite first while Sky
  Letters remain).
- **The Star Kite** rests on Sora's workbench whenever it isn't out flying (after
  it's Mika's too); looking at it then reminds how to call it (G / Kite).
- **Rin's ferry** is the only story crossing in summer: reaching the east bank
  another way (swimming, a speed leap) points the guide to the east landing,
  where “Call Rin's ferry” plays the ride. Only a frozen river counts as crossed.
- **Profiles and settings.** Three save slots (slot 1 keeps the original key).
  Season and time-of-day overrides only change what is shown (`game.applyLook`,
  `game.shownHour`); the story keeps its own calendar and clock.
- **Conversations are paged.** Up to three lines per page (two on phones),
  chat-style with portraits; E/Next turns the page, Q/Back re-reads, Skip jumps to
  the end but never past a choice.
- **Localisation.** English strings are the keys (gettext style): `tx()` looks
  them up in `src/i18n/{vi,ko,ja}.json`. `npm run i18n:extract` collects every
  player-facing string (story data, `tx()`/`N_()` literals, `data-i18n` markup)
  into `source.json`; `tests/i18n.test.mjs` fails if any pack misses a string or
  changes a `{placeholder}`. Each script gets its own rounded typeface.

### Progression gates (geography is the lock)

- The story sends Mika over the river on Rin's ferry (chapter 2); she can also
  swim, and landing on the east bank counts as the crossing.
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
src/actors/        player (controller, swimming, animation states), camera, animator, npc, tamo, animals (+ sheep homing)
src/game/          story (script as data), quest (pure engine), director (world binding),
                   scenes (cutscenes), minigames (pure)
src/ui/            ui.js (HUD, paged dialogue, journal, language picker) + style.css
src/i18n/          i18n.js (tx, languages, fonts) + vi/ko/ja.json packs + source.json
src/fx/            particles, weather, fireworks, meteors, underwater (fog, grade, bubbles)
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
| Minigames | `tests/minigames.test.mjs` | Fishing is one press on the bite and a missed bite comes back; cooking finishes by itself; a sheep sent home reaches the pen from anywhere; grazing sheep let Mika walk up. |
| Dialogue | `tests/dialogue.test.mjs` | Pages keep every line in order, hold at most three lines (two on phones), cut presses by more than 40 %, and keep a choice with its question. |
| Languages | `tests/i18n.test.mjs` | Vietnamese, Korean and Japanese packs cover every player-facing string and keep every `{placeholder}`. |
| World | `tests/world.test.mjs` | Buildings stand on dry, level ground; the river is deep where it should be; stepping stones are a jump apart; paths avoid buildings; colliders behave; scatter is deterministic; nights are deep blue. |
| Assets | `tests/assets.test.mjs`, `tests/pack.test.mjs` | Every one of the ~150 models meets its contract; the packed library fits the budget. |
| Browser | `npm run test:e2e` | An autopilot plays the entire story on a GPU browser through real keyboard and mouse input. It uses QA hooks only to read state and teleport; every action is a real key press (E near things, E on the bite, E as lanterns pass). It fails on any page error or stuck step. `--from=<step>` resumes at any step through the pure engine. |
