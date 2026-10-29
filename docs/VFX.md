# Small visual effects (src/fx/vfx.js)

Cheap effects that make the valley feel alive, added 2026-10-29 with a hard rule: no slower game.

| Effect | When | Look |
|---|---|---|
| Footstep puffs | every step on the ground | path and shore: soft dust; grass in spring/summer: green flecks; autumn: orange leaf flecks; winter: snow powder; ice: blue-white glints; boards and stone: dust only when running |
| Jump and landing puffs | jump, and a fall that is long enough | a ring of dust (or snow, grass) kicked outward, bigger for a longer fall |
| Daylight air | daytime, not raining | spring/summer/autumn: slow pollen motes near Mika; winter: short ice glints |
| Chimney smoke | the bakery and the mill, within 75 m | a thin ribbon, white by day and dim at night, a little more in winter and at dusk |

## How it stays cheap

- Everything goes through the four existing FX particle pools (`src/fx/fx.js`): no new shader, no new draw call.
- **A pool with nothing alive is not updated and not drawn** (`Pool.activeLeft`). On a clear day three of the four pools used to be drawn for nothing every frame.
- A few particles per event or per second; the Low tier (phones) gets half.
- Off while a round holds the weather (`fx.weatherHold`), inside a house, in the rain, at night (pollen), and from the governor's third step down on the Low tier (ambient ones from the second).
- Colours are dimmed at night (`lightAt`), because the soft pool is unlit.
- Measured on the phone tier at 4x CPU: the effect code costs about 0.1–0.4 ms per frame, the same as `?vfx=off` within noise.

`?vfx=off` turns it all off, to compare. Tests: `tests/vfx.test.mjs`. Look at them with a camera in front of the effect:
`tests/perf/` has the helpers; the close-ups in the commit were taken by calling `director.vfx.land(...)` from the QA hooks.
