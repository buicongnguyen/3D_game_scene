# Starline — the Lanterns of Hoshi Valley

*星の谷.* A cosy 3D story game about a railway, two feuding villages, a tiny fallen star,
and the night everybody looked away.

**Play:** https://buicongnguyen.github.io/3D_game_scene/ (desktop or phone, WebGL 2)

Mika arrives on the last train of winter to clear out her late grandmother's signal
cottage. In an old brass lantern she finds Tamo, a fallen star who can't remember
anything. To bring back the Star Train that stopped running ten years ago, Mika has
to relight the valley's four Star Lamps. That means going from season to season,
from the river village of Kawabe to the orchard town of Takamori and up to the
forest shrine. Along the way she finds out who really let the train run into
danger that night.

- **A prologue, four seasonal chapters and an epilogue.** About 35 story steps, a
  twist, and a choice that changes the finale.
- **One button does it.** Walk up to anything and press **E**: talk, pick up,
  fit the cogs, send a sheep home, cook, or have Tamo fly over and spark a lamp,
  a bell, a crab or a trackside lantern. Fishing is a single press when the
  float dips.
- **Swim and dive.** The river is open: swim across, dive to the bed and watch
  the trout, weed and sunken boats in a hushed, green-blue world.
- **Conversations read like a chat.** Several lines per page, with **Next** and
  **Back** to re-read, and **Skip**.
- **English, Tiếng Việt, 한국어, 日本語.** Pick a language on the title screen or
  in Settings; the whole story, UI and journal are translated.
- **A lived-in valley.** Seasons change the whole world: blossoms, rice paddies,
  autumn maples and winter snow, plus day and night with lamp-lit villages. There
  are a steam train, a ferry, a mill wheel, a bell tower and wildlife.
- **Collectibles:** 12 Fallen Stars hide lines of Sora's poem and unlock her last
  letter. There is also a fish log, and journal pages that tell the true story.

## Controls

| | Keyboard and mouse | Gamepad | Touch |
|---|---|---|---|
| Move | WASD / arrows, Shift to sprint | Left stick | Left thumb (floating stick) |
| Camera | Drag the mouse, wheel to zoom | Right stick | Drag the right side |
| Do anything nearby (talk, pick up, light, cook…) | E | X | **Act** |
| Next / back in a conversation | E / Q | A / B | Tap / **Back** |
| Jump · swim up | Space | A | **Jump** |
| Dive (while swimming) | C or Ctrl | LT / RT | **Dive** |
| Journal / pause | J / Esc | Back / Start | ☰ and ✎ buttons |

## How it's built

- **Engine:** [three.js](https://threejs.org) with a custom renderer setup (bloom,
  colour grade, light pool), bundled by Vite.
- **Art:** every model is generated in **Blender 4.5** by the Python scripts in
  `art/blender/`. That's about 150 models: a rigged, animated cast (skinned meshes
  with authored clips), rigged wildlife, both villages, the railway and viaduct,
  vegetation and props, plus dialogue portraits and item icons rendered in Cycles.
  The editable scenes are in `art/blender/source/*.blend`, and the contracts
  (names, sizes, pivots, clips, budgets) are in `art/CONTRACTS.md`.
- **World:** a hand-laid valley (`src/world/layout.js`) is baked into a height
  field that the terrain mesh and the character controller share. It includes a
  carved river, rail beds, rice terraces and a mountain rim with river passes.
  Forests are instanced with LOD and shadow proxies, and the grass wraps around
  the camera on the GPU.
- **Story:** `src/game/story.js` holds the whole script as data. It is run by a
  pure quest engine (`src/game/quest.js`), and `src/game/director.js` binds it to
  the world.

See [docs/STORY.md](docs/STORY.md) for the full story (synopsis, cast, the
choice and the complete script, regenerated with `npm run story:md`) and
[docs/DESIGN.md](docs/DESIGN.md) for the systems and technical design.

## Development

```bash
npm ci
npm run dev          # http://127.0.0.1:5173
npm test             # Node: story playthrough, minigames, dialogue pages, translations, world, assets, packed budget
npm run i18n:extract # refresh src/i18n/source.json after changing any English text, then update vi/ko/ja.json
npm run story:md     # regenerate the script appendix of docs/STORY.md
npm run build        # dist/ with meshopt-packed models
npm run test:e2e     # plays the whole story in a real browser (needs Playwright + a GPU)
```

Useful URL parameters:

- `?quality=low|medium|high`
- `?lang=en|vi|ko|ja`
- `?start=new|continue` (skips the title screen)
- `?qa=1` exposes QA hooks
- `?view=x,y,z,tx,ty,tz&season=autumn&hour=17` for a fixed look-dev camera

To rebuild the art, point `$B` at a Blender 4.5 LTS executable:

```powershell
& $B -b --factory-startup --python-exit-code 1 --python art/blender/build_characters.py
```

The same applies to `build_animals`, `build_architecture`, `build_railway`,
`build_nature` and `build_props`.

## Publishing

Pushing `main` runs `.github/workflows/deploy-pages.yml`: install, test, build
(with model packing), then publish `dist/` to GitHub Pages.

The previous version of this repository (*Wildhaven: River & Hearth*) is kept at
the git tag `wildhaven-legacy`.
