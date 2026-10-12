# Codex verification and implementation

This pass follows the 12 October 2026 handover in [REMAINING-ISSUES.md](REMAINING-ISSUES.md).
Work happened in isolated task checkouts. The original `3D_game_scene` working folder and its uncommitted mobile helper were left untouched.

## Implemented

- Seven new ground clips on Mika and the village kid: Crouch, CrouchWalk, CrouchReach, CrouchReachHold, Kneel, Pickup and SitGrass. Existing geometry, materials, bones, rest transforms and old clips are unchanged. Both Low merged skins and Medium skins were checked in the game renderer.
- A tested pose state machine with short pickup locking, the 0.4-second grab event, hysteresis, speed-matched creeping and graceful animation fallback. Crouching, catching, kneeling at webs/crickets, low greetings, feeding, hay/story pickups and quiet waiting use it. The follow camera lowers smoothly. Lanterns move to the belt with pose offsets and update after pose sampling.
- Title tours use the selected default story and its electric/flame style. Pause-menu tours show current progress, including unfinished lamps and an unrepaired viaduct. These tours stay live on phones so the completed-valley recordings cannot spoil a save. State and save storage restore on exit.
- All sixteen phone tour, title and intro clips/posters were regenerated. Tour recordings use Grandma's electric lamps; each story intro uses its own style. Every encoded clip was inspected. Total video data is 51,149,841 bytes, down from about 56.5 MB, within the existing budget.
- Hard-mode Grandma lamp prompts say to fit the bulb; Classic retains spark wording. Grandma Tsuru's dialogue now describes Isamu as away building boats without a seasonal return promise that becomes false later in the story.
- Sack races require an actual finish. Solo times up to 13 seconds earn three stars, up to 18 two stars, and later finishes one star. Losing a completed race to the only kid earns one star. The forty-second deadline produces an explicit unfinished result without stars; standing still no longer wins after 3.5 seconds.
- Vietnamese, Korean and Japanese packs contain all 3,650 source keys with no missing entries, stale keys or placeholder mismatches. These translations remain AI-authored and need native-speaker review.

## Verification

- Full unit suite: 592 tests pass. Production build succeeds, including packed-model and video budgets.
- Ground-clip scoped Blender validation: zero errors and warnings for both rigs. Ground contact, loop seams, authored shuffle speed and hand reach were measured; contact sheets were inspected. The full legacy model validator still reports pre-existing geometry/coplanar issues, so this is not a claim that its default audit is clean.
- Production ground-interaction matrix passes on 1280 × 720 desktop and 390 × 844 phone, at Low and Medium: actual creep/stop/swing/catch, hay pickup, cow feeding and nighttime sitting. Settled front/side/chase screenshots were inspected.
- Production tour suite passes eight story/device/progress cases, with no browser requests for source modules. It verifies current-progress captions, world state, quest identity, saving lock and restoration.
- Production real-Edge video suite passes: playback controls, live partial-save tours, load fallback, both story arrivals and skip equivalence. The original dev tour and real-Edge video suites also pass.
- Full production Grandma and Classic story autopilots pass, including all four lamps, the complete ending and pause/journal/resume controls (approximately 9.5 minutes each).
- Integrated all-game production menu sweep passes (304 seconds): every catalogue game launches and returns, plus keyboard/touch/gamepad picker navigation, six title sizes and story-save restoration on desktop/phone.

Reproduce browser checks against an isolated server using `GAME_URL`, as described in the handover. Added suites are `tests/ground-poses-browser.mjs` and `tests/tour-production-browser.mjs`; neither needs browser-side source imports. Local screenshots and logs live under the ignored `.tools` directories of the task checkouts.

## Owner decisions

- Keep Isamu alive and away building boats in Grandma; keep Classic's existing remembrance.
- Keep the mill wheel/dynamo powering Grandma's electric lamps.
- Pause-menu tours show the current save's progress.
- Apply the solo/two-player sack-race star rules above.
- Build a visible Takamori volleyball practice board in a later pass. This decision is recorded; the board is not implemented here.

The yard camera, Normal playground difficulty, Vietnamese-village project and further video compression remain product decisions. No changes were made to other repositories.

## Confirmed work still remaining

Archery hands/portrait camera/ambient kids, cow-rider leg art and mount/dismount/gallop polish, fishing camera and yard issues remain as described in the handover. This pass does not claim to complete every item in that document.

Two sky leftovers have a concrete cause: `skygaze.js` and `tricks.js` compare `fx.weather` to the string `rain`, but that field is a particle pool; `fx.weatherKind` is the weather identifier. The skyflight browser test also compares whole-scene counts while ambient creatures can stream in, making the assertion flaky. Follow-up should compare sky-owned resources. The governor lives in `src/engine/governor.js`, correcting the handover's path.

Real iPhone/Safari, Low Power Mode video behavior, physical gamepads and native-speaker language review are still unverified. Existing build warnings about the large main chunk and ineffective static/dynamic UI splitting remain.
