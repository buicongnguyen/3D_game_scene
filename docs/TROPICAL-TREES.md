# Tropical tree setting

Open **Settings → Enable tropical trees** to change selected ambient lowland broadleaf trees
to bamboo, coconut palms and mango trees imported from the owner's `xom_nong_trai` repository.
The switch applies immediately, works in every language and remembers its value on the next
launch. It is off by default. Turn it off to restore the original scenery.

The source repository contains more species, including banana, areca palm, banyan,
mangrove, tropical almond, flame tree and several fruit trees. This first selection uses
three small models rather than loading the complete source packs. See the
[source manifest](../art/sources/vietnam-trees.json) and
[art contracts](../art/CONTRACTS.md#tropical-tree-imports--artimport-vietnam-treesmjs)
for provenance, extraction instructions and measured budgets.

## Placement and gameplay

- `src/world/tree-theme.js` selects approximately half of the eligible broadleaf trees
  deterministically from their existing coordinates. The area is the southern lowlands
  (`z = -35..125`, ground height `0.9..35`), excluding distant rim trees.
- Orchard trees, story chestnuts, cherry blossoms, maples, cedars, pines, the northern
  beetle grove, forest spider trails and the planted reward tree keep their original models.
- The renderer receives substitute records. Original scatter records, tree positions,
  colliders, wildlife plans, quests and save data stay unchanged. The imported models are
  normalized to 8 m and scaled to match the original 8 m / 8.5 m donor heights.
- Tropical foliage keeps its authored green colours and participates in wind and snow.
  Seasonal changes still apply to the original deciduous trees and other vegetation.
- The existing foliage group is retained, including its hidden state while indoors.
  A setting change rebuilds tree instance buffers and releases the old buffers and shadow
  materials. Shared model geometry, materials and textures remain reusable.
- If an imported model fails to load, its original broadleaf tree remains visible.

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
checks protected trees and the reward tree, and repeats tree setting changes to check resource
counts, disposal and original placement/save data. The video suite protects existing
English title, tour, fallback and arrival behaviour. Unit regressions additionally cover
deterministic placement across all three quality densities, missing-model fallback,
winter foliage, hidden interiors and stationary-camera refresh.

Verified on 2026-10-13:

- All 694 unit, model and packing tests passed; production build passed with 187 models.
- Desktop Medium (1280×720) and portrait phone Low (390×844): 243 browser checks each,
  including all four languages, remembered settings, disposal and stable GPU resource counts.
- Matched original/tropical views of all three imported species and the Vietnamese Settings
  label were visually inspected. No model-load failures or browser runtime errors occurred.
- The complete existing video suite passed, including both stories' arrivals, tour controls,
  current-progress pause tours, fallback and state restoration. Separate Settings checks
  confirmed live scenery when enabled and recordings when disabled in English and Vietnamese.
