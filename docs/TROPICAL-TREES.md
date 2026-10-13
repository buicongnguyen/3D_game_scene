# Tropical tree setting

Open **Settings → Enable tropical trees** to change the valley's ambient trees
to bamboo, coconut palms and mango trees, and ordinary bushes to ferns and small banana plants,
imported from the owner's `xom_nong_trai` repository. The surrounding hills change too.
The switch applies immediately, works in every language and remembers its value on the next
launch. It is off by default. Turn it off to restore the original scenery.

The source repository contains more species, including banana, areca palm, banyan,
mangrove, tropical almond, flame tree and several fruit trees. This first selection uses
five selected plants with three simpler distant-tree models. See the
[source manifest](../art/sources/vietnam-trees.json) and
[art contracts](../art/CONTRACTS.md#tropical-tree-imports--artimport-vietnam-treesmjs)
for provenance, extraction instructions and measured budgets.

## Placement and gameplay

- `src/world/tree-theme.js` changes every eligible ambient tree, including the distant
  rim. Species selection is deterministic from the existing coordinates. Across the three
  quality tiers, more than 90% of all trees and 70% of nearby trees change.
- Orchard trees, story chestnuts, the northern beetle grove and forest spider supports
  retain their original models. Sakura that supply the riverside blossom celebration,
  maples that supply the butterfly celebration, shrine cedars/maples and the planted
  reward tree also stay original. Other cedars, pines, maples and cherry trees change.
- Ordinary `bush-a` and `bush-b` plants change to ferns or small banana plants;
  hydrangeas retain their flowers. Bushes where ladybugs and butterflies land, including
  their neighbouring perches, retain their solid canopies. Over 65% of all bushes still
  change in each quality tier (over 85% of ordinary bushes).
- The renderer receives substitute records. Original scatter records, tree positions,
  colliders, wildlife plans, quests and save data stay unchanged. The imported models are
  normalized to 8 m and scaled to match the original donor heights. Tall donors stretch
  vertically, keeping the lower trunks inside their existing collision cylinders. Bushes
  match each original asset's exact top. Actual insect landing plants remain original
  because the new fern and banana silhouettes are open around their upper centers.
- Distant trees and tree shadows use simpler tropical models. Their alpha cutout leaves
  retain the source texture, and culling accounts for each tree's vertical scale.
  All eight imported models share one atlas in GPU memory; release checks verify the
  image bytes, UV channel and sampler match before allowing that sharing.
- Tropical foliage keeps its authored green colours and participates in wind and snow.
  Seasonal changes still apply to the original deciduous trees and other vegetation.
- The existing foliage group is retained, including its hidden state while indoors.
  A setting change rebuilds tree and bush instance buffers and releases the old buffers and shadow
  materials. Shared model geometry, materials and textures remain reusable.
- If an imported model fails to load, its original tree or bush remains visible.

## Phone recordings

The existing title, arrival and tour videos show the original trees. Enabling tropical trees
uses live 3D for these views. Turning the setting off restores the existing video policy.
Changing the setting on the title cancels pending playback safely; turning it off can resume
the clip while the title is still active. A running video tour hands over to its live view at
the same time and preserves its pause state. Language changes do not change the tree setting.

## Verification

Run the normal unit and model checks with `npm test`, then `npm run build`.

Serve the production build on an unused port above 5850. With `GAME_URL` pointing to it:

```text
node tests/vietnam-trees-browser.mjs
node tests/video-browser.mjs
```

The tree browser check uses the actual title and Settings controls on desktop Medium and
portrait-phone Low, reloads the saved tree preference in English and Vietnamese, compares matching camera views,
checks protected trees and the reward tree, and repeats scenery setting changes to check resource
counts, disposal and original placement/save data. The video suite protects existing
English title, tour, fallback and arrival behaviour. Unit regressions additionally cover
deterministic placement across all three quality densities, missing-model fallback,
winter foliage, hidden interiors, bush perch heights and stationary-camera refresh. Matched
wide title, village and valley views verify the overall scene changes, including distant LODs.

Initial implementation verified on 2026-10-13 (before the coverage expansion):

- All 694 unit, model and packing tests passed; production build passed with 187 models.
- Desktop Medium (1280×720) and portrait phone Low (390×844): 243 browser checks each,
  including all four languages, remembered settings, disposal and stable GPU resource counts.
- Matched original/tropical views of all three imported species and the Vietnamese Settings
  label were visually inspected. No model-load failures or browser runtime errors occurred.
- The complete existing video suite passed, including both stories' arrivals, tour controls,
  current-progress pause tours, fallback and state restoration. Separate Settings checks
  confirmed live scenery when enabled and recordings when disabled in English and Vietnamese.

Coverage expansion verified on 2026-10-13:

- All 704 unit/model/packing tests and the production build passed (192 models).
- Production browser checks: 505 each on desktop Medium and touch phone Low, including
  all four languages, saved preferences, exact protected tree/bush matrices, actual insect
  landing bushes, repeated disposal, shared GPU atlas and no model/runtime errors.
- In the actual built valley, Medium changes 3,333 trees and 319/406 bushes; Low changes
  2,385 trees and 194/280 bushes. The original sparse setting changed 17/18 trees respectively.
- Matched wide title, village and valley views, all five plant closeups, and the protected
  landing bush were visually inspected. Tropical trees account for roughly 88–91% of
  submitted tree instances in these wide views, including the distant hills.
- Full-compositor triangle counts were 5–11% lower on Low and 5–11% lower on Medium in
  those views, with similar draw-call totals. CPU submission measurements are diagnostics,
  not a claim about real-phone frame rates. All eight imports share one actual leaf texture.
