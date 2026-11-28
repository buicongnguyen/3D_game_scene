# The Night Star (2026-11-28)

Owner: "a mysterious girl, the Night Star, who only appears under the stars at the night festival and sings one song,
with Kotone's group dancing behind her if you can keep it in budget; a few villager barks hint at her beforehand; the
player watches her show (auto camera, show effects at night); after seeing it once she unlocks in the Sing & Play Singer
row." Model: VRoid Project's CC0 alpha sample **AvatarSample_D_Darkness** (white hair, pointed ears, a long dark dress).

## Who she is
- **Names**: EN **Stella**, KO **은하** (Eunha, "galaxy": 별 Byeol is already the dance game's singer), VI **Tinh** (as
  in tinh tú, the stars); JA uses Stella. Her title: "the Night Star" (vi Ngôi Sao Đêm, ko 밤의 별, ja 夜の星). None of
  these is used by another character (checked against content/troupe.js, townsfolk, the cast and the language packs;
  `tests/show-fx.test.mjs`).
- **Where and when**: the shrine yard, at Sing & Play's **Shrine yard** stage spot (62.5, -149), the place the valley's
  festival lanterns hang (fx/cel-decor.js shrine strings) and whose room for Solo, 4 and 8 was checked with the game's
  own room checks at its performing turn (content/stages.js). She is there when the valley's night is 0.6 or more
  (the stars are out: about 19:30-05:00 by the shown hour), Mika within 40 m, nothing else owning the game (Photo mode's
  rule + no dialogue, scene, mini game, tour, Sing & Play), indoors no, and the shrine stairs open (Explore, or the story
  after the sleeping bear). Her files start loading within 70 m; past 95 m she is gone. Story and Explore both;
  `?nightstar=off` never; under `?qa` only with `&nightstar=on`.
- **Waiting**: she stands in starlight (one soft additive cone from the sky, 1 draw: the beam recipe of
  docs/SHOW-EFFECTS.md) with a few slow sparks; the prompt **Watch the Night Star** (E / Do it) within 7 m.
- **Her show**: Mika steps in front of the group (7.5 m), the automatic camera films (perform/camera-man.js: the same
  shot grammar as Sing & Play), the show effects play the song (night: the stage set unfolds behind them, beams, haze,
  lasers on the last chorus, confetti, fireworks over the last chorus). A drag gives the view back for 4 s; **Stop
  watching** (a 48 px button) or E ends it. After her bow she is gone in a shower of gold and blue sparks; seen to the
  bow (watching, or within 30 m) she joins the Singer row (per device: `starline:nightstar:seen`; a toast says so once).
  She returns on another night (or after Mika has been 95 m away). Picked in Sing & Play while the Time choice is not
  Night, the bar's hint line says "Stella sings best at night" (her name in the game's language; nothing is changed for
  the player: docs/SING-AND-PLAY.md "Time of day").
- **Barks** (content/barks.js, after the shrine lines; 58 characters at most, vi / ko / ja): "A girl sings at the shrine
  when the stars come out.", "The Night Star? She sings by the shrine on clear nights.", a child's "A girl in a dark
  dress by the torii! Then poof, gone!", by day "Lights by the shrine last night. And a song, not ours.", at night "Stars
  are out. Hurry to the shrine and you may hear her." and at the shrine "Shh. Can you hear it? Someone is singing under
  the stars."

## Her group and her moves
- **Group of 4** (the front row): Saki (nu-3), **Stella** at the lead's place, Mio (nu-1), and Kotone at the outer front
  place, where she is still the front row's source (`castOf` for a guest: content/troupe.js GUESTS). Every body copies
  Kotone's danced rig (perform/troupe.js leadSource): one animation evaluation for all four, the girls drawn as one row
  mesh. `?nightStarGroup=1|4`.
- **Moves**: the Cute style (`style: 'cute'`) without anything her long, wide dress would show legs through: no jumps,
  kicks, forward or wide steps, no body roll (`GUESTS.avoid`: ClubJumpPoint, ClubKickBall, ClubCutePop, ClubTopRock,
  ClubAfroStep, ClubSideGroove, ClubClapStep, ClubBodyRoll, ClubFistPump, MomentJumpMic; plan.js `avoid`, every style;
  an empty list leaves every other plan exactly as it was). In Sing & Play she keeps the avoid list in any Dance choice.
- **Dress check** (`.tools/show/dress-check.mjs`: every dance and moment of her plan at 30 % and 60 % of its block,
  filmed at her legs from the front and the side, 2.1 m away: `.tools/show/dress-sheet.png`): her plan in Golden Rails
  is ClubChillSway, ClubHipSway, ClubHairFlick and the closing MomentBowMic. Her dress is a wide, knee-length skirt over
  dark tights (not floor-length). No leg pokes through it in any of the 16 frames; in the bow the skirt flares back and
  stays clear. The avoided moves were not filmed (left out on their stance data and names: lifts over 6 cm, kicks, steps forward or wider
  than 15 cm, a hip roll).

## Her song (the hook)
Another agent is making her own song (EN / VI). Until then she sings Golden Rails. Adding hers is one entry each in
`src/content/kotone-songs.js` with `singer: 'night-star'` (`showSongs`): her show sings her own songs in the game's
language once there is one, Kotone's station show never sings it, and Sing & Play's Song row lists it for every singer.

## Files
- Model: `public/models/vroid-nightstar.glb` (1.11 MB raw / 0.60 MB packed, 13.6k triangles, 1024 atlas) and
  `vroid-nightstar.lite.glb` (0.79 / 0.45 MB, 8.0k triangles, 512 atlas), copied from the checked build
  (`.tools/vroid-cc0/models/vroid-cc0ddarkness*.glb`: art/blender/vroid_mixamo.py, 69 bones, the face morphs, the nine
  everyday clips, gait Walk 1.059 / Run 4.5 m/s). No pack of her own: she dances Kotone's moves. Contracts in
  tests/asset-contracts.mjs; budgets raised with reasons (raw 87.5 MB, packed 38.7 MB). Face: `public/faces/night-star.webp`
  (`FACES_ONLY=night-star node scripts/bake-singer-faces.mjs`). Credits: "Stella, the Night Star: VRoid Project
  (AvatarSample_D, CC0)".
- Licence: CC0 1.0 (VRM meta licenseName CC0, author VRoid Project; OpenGameArt "VRoid Studio CC0 models"), sources in
  `E:\repo\ktvgo_live\characters\cc0\AvatarSample_D_Darkness\sources.json`.
- Code: `src/content/night-star.js` (place, times, the unlock), `src/game/nightstar/watch.js` (the twice-a-second check,
  started from src/main.js), `src/game/nightstar/night-star.js` (the show, loaded only at night near the shrine).
- Tests: `tests/show-fx.test.mjs` (guest cast, names, avoid list in every style, song hook, when she is there).

## Measured
- Her files at night near the shrine: the light set on a phone fetches 0.45 (her) + 0.45 (Kotone) + 0.86 (Kotone's moves)
  + 2 x 0.44 (Saki, Mio) = about 2.6 MB packed (PC about 3.3 MB); she appeared 1.7 s after Mika arrived (the local
  preview). Nothing loads by day or elsewhere.
- Draws during her show with the group of 4 and the effects: Low (390x844) 50-72 a frame (the camera looks at the lit
  shrine hall: 62 with Mika standing there before), PC High 119-121 (143 before). Turned the other way (the first try: the valley as
  her backdrop) Low drew 145-160 and the cameras stood on the shrine's terrace and veranda: she now faces the torii.
- The show effects' cost: docs/SHOW-EFFECTS.md (the same code).
- Pictures (.tools/show/final/, local): `ns-pc-*.png`, `ns-phone-*.png` (waiting in the starlight, mid-song, the end).
