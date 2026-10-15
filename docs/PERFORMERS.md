# The performers: graceful body, wardrobe, skin and shape controls

The dance game's people — **Hoa** (the dance teacher, Hana's daughter), **Nabi** (dancer), **Byeol** (singer) and **Haru**
(dancer) — are young adults (about 18–25) built on the *graceful body*, a second body the character generator can make on
the people's own skeleton. This page is for whoever builds on them (the character studio next): what is in the files, and
how to change look, skin and shape from three.js.

| Source | What |
|---|---|
| `art/blender/graceful.py` | the graceful body: proportions, head, neck, hands with finger bones, arms, legs, clip styles |
| `art/blender/outfits.py` | the wardrobe: tops, bottoms, shoes, cap, ao dai (any top goes with any bottom and shoes) |
| `art/blender/shapes.py` | the body-shape morphs (shape keys on the body and every garment) |
| `art/blender/dance_anims.py` | the dance clips (also built onto Mika and the villagers by `build_dance_clips.py`) |
| `art/blender/build_performers.py` | builds the four performers; `light_people.py` makes their light files |
| `src/content/performers.js` | looks, skin tones, shape and proportion ranges (pure data) |
| `src/engine/wardrobe.js` | `applyLook`, `setSkin`, `setShape`, `setProportions`, `polish`, `resetBody` |

Rebuild: `blender -b --factory-startup --python-exit-code 1 --python art/blender/build_performers.py [-- --only nabi]`, then
`light_people.py -- --only=nabi`, `build_dance_clips.py` (Mika and villagers) and `performer_portraits.py`. Review sheets:
`performer_review.py` (orthographic F/S/B with a 10 cm grid, Q, face, hand close-ups, any clip frame, `--looks`, `--shapes`).

## The graceful body

Same bones as every person (`HUMAN_BONES` in `tests/asset-contracts.mjs`), so every clip plays on it, plus finger bones
(`thumb`, `index`, `index2`, `fingers`, `fingers2` per hand) and hair bones where the hair moves (`hair_1`, `hair_2`). The
body is authored at its final size (no height normalisation), so all three young women share one skeleton exactly and
their clothes fit any of them.

| | villager woman | graceful young woman | graceful young man |
|---|---|---|---|
| height | 1.62 m | 1.62 m | 1.72 m |
| head | 0.32 m (5.1 heads) | 0.27 m (6.0 heads) | 0.29 m (5.9 heads) |
| hip joint | 46 % of height | 52 % | 52 % |
| visible neck | ~2 cm | ~5 cm | ~5 cm |
| shoulders | square, flat | 34° trapezius slope | sloped, broader |
| waist / hips | straight tube | 0.20 x 0.14 m waist, gentle hips | V to a slim waist |
| arms (radius) | 5.6 cm sleeve tube | upper 3.6, elbow 3.1, forearm 3.2, wrist 2.3 cm | x1.12 |
| hands | mittens | 5.8 cm palm, real fingers, 10 finger bones | larger |
| rest arm | 14° out, straight | 9° out, soft elbows; clips upright, chin up | |

## Files and parts

A performer's GLB has an armature, a `Body` mesh (head, face, hair, neck, hands) and one mesh per wardrobe part, named by
slot: `Top_*` (neck to wrists: torso layers and both arms), `Bottom_*` (waist to ankles: waistband, skirt or trousers, the
legs), `Shoes_*`, `Hat_*`. Parts overlap at the joins, never gap. A look shows its parts and hides the others:

| Performer | Parts in the file | Looks (`performers.js`) |
|---|---|---|
| hoa | Top_aodai, Top_long, Bottom_trousers, Bottom_skirtL, Shoes_flats | Red ao dai, Blue ao dai, Village day |
| nabi | Top_crop, Top_long, Bottom_skirtS, Bottom_trousers, Bottom_skirtL, Shoes_sneakers, Shoes_flats | Stage jacket, Street style, Long skirt |
| byeol | Top_coat, Top_long, Top_crop, Bottom_skirtL, Bottom_skirtS, Bottom_trousers, Shoes_boots, Shoes_flats | Long coat, Bright and short, Jacket and trousers |
| haru | Top_jacket, Top_long, Top_coat, Bottom_trousers, Shoes_sneakers, Shoes_boots, Hat_cap | Stage jacket, Street style, Long coat |

Every combination is modest: full-length tops (no bare midriff), the short skirt is over leggings, flat or sneaker shoes.
Colours are per material name (`Top`, `Top trim`, `Inner`, `Bottom`, `Bottom trim`, `Legwear`, `Shoes`, `Shoe sole`, `Hat`,
`Hat trim`, `Hair accent`), so a look is a list of parts plus a tint table; new colourways need no new art.

```js
import { applyLook, setSkin, setShape, setProportions, polish } from '../engine/wardrobe.js';
const m = assets.clone('nabi');          // one clone per performer on screen
applyLook(m, 'nabi', 'street');          // false for a light person / stand-in (colours only)
setSkin(m, 'porcelain');                 // or '#hex'
setShape(m, 'shape_waist', 0.4);         // 0..1, 0.5 = as designed
setProportions(m, { legs: 1.04, head: 0.97 });
polish(m, { rim: 0.3, rimColor: '#ffdcae' });   // optional rim on hair and clothes (stage / evening)
```

Everything works on that clone only: materials it recolours are copied for it first.

## Skin tones

`SKIN_TONES` (sRGB, set on the `Skin` material; light people take it into their palette):
porcelain `#fdd2bb`, fair `#f8c4a6`, light `#efb68f`, medium `#e3a274`, tan `#c58556`, brown `#9b6140`, deep `#6b4029`.
The fairest is as bright as the game's sun and tone mapping allow while staying peachy (brighter albedo turns grey-pink
in the valley's light). The baked shading under the skin is warmed (`warm_skin` in the build), the blush and rosy lips are
vertex tints, and `setSkin` adds a faint warm inner glow to fair tones. Defaults: Nabi fair, Byeol porcelain, Hoa light,
Haru fair.

## Body-shape morphs (shape keys)

On the body AND every garment that covers it, from one displacement field per control, so clothes follow and layers never
cross. Influence in three.js = `2 * (v - 0.5)` for a control value `v` in 0..1 (`setShape` does this): 0 = the slim end,
0.5 = as designed, 1 = the fuller end. Ranges are modest by design.

| Key | What it moves | ± at the ends | Carried by |
|---|---|---|---|
| `shape_build` | slim ↔ sturdy: torso, arms, legs, neck together | ~7–8 % girth | Body (neck), every top and bottom |
| `shape_chest` | a modest chest (front depth at chest height) | ~10 % front | tops (and bottoms' waistbands) |
| `shape_waist` | the waist | ~11 % | tops, bottoms |
| `shape_hips` | hips and seat; skirts and coat tails follow to the hem | ~10 % | tops' hems, bottoms |
| `shape_thigh` | thighs (about each leg's own axis) | ~12 % | bottoms (legs, trousers, shorts) |
| `shape_arm` | arm thickness (about each arm's own axis) | ~13 % | tops (sleeves and bare arms) |

There are no shape morphs on Mika or any child.

## Proportion controls (bones)

`setProportions(model, { ... })` with `PROPORTIONS` = [min, max, default]. The performers' clips key only rotations and
the hips' position (the asset test checks it), so a clip never undoes these.

| Key | Range | How |
|---|---|---|
| `height` | 0.94–1.06 | root bone scale |
| `head` | 0.9–1.1 | head bone scale |
| `neck` | 0.85–1.2 | neck bone scale, head scaled back |
| `shoulders` | −1.5–+1.5 cm | upper arm joints moved out/in |
| `arms` | 0.94–1.06 | upper arm scale, hand scaled back |
| `legs` | 0.94–1.08 | thigh scale, foot scaled back, figure lifted so the feet stay on the ground |

`resetBody(model)` puts bones and morphs back.

## Clips

Standard: `Idle Walk Run Talk Wave Cheer Bow`. Dance (30 fps, authored at 90 BPM: a beat is 20 frames; play with
`speed = bpm / 90`; a move is 40 frames, its accent at frame 10, held to ~24; L/R are the dancer's own sides):

- festival (hoa, mika-dance, villager-kid-dance): `DanceIdle SweepL SweepR FanUp Turn HatTilt Flourish DanceBow`
- K-pop (nabi, haru, byeol in part, mika-dance, villager-kid-dance): `KpopIdle SideL SideR PointStep JumpClap Spin HeartHands CrowdWave` (haru: no HeartHands; plus `PowerPose SlideL SlideR`)
- singer (byeol): `SingIdle SingReach MicRaise`
- crowd (villager-*-dance): `Clap StickWave`

The hat dance aims the hat hand so the non la shows its inside to the audience (`aim_hand` in `dance_anims.py`). Props
(`non-la`, `mic`, `light-stick`) are modelled in grip_R space: attach with an identity transform (the hat at 0.8 for Mika,
0.7 for a kid). The graceful body also plays every existing clip (sit, kneel, crouch, pick up, sit in the grass, ride the
cow, swim, tread water) — `build_performers.py --review` writes a copy with all of them for the clip sheets.

## Budgets

Seen up close with the valley frozen behind them (focus mode), so far above the village cast: default look 31–39 k
triangles, 12–14 draws (one per mesh and material), wardrobe files 2.6–3.8 MB raw. Their light files (People: Light) are
the default look in one mesh and one draw at ~11–14 k triangles.
