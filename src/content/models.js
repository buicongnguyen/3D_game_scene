import { TROPICAL_TREES, TROPICAL_BUSHES } from '../world/tree-theme.js';

// Every model the runtime may load (see art/CONTRACTS.md). Missing files fall back to placeholders.
export const CHARACTERS = ['mika', 'tamo', 'genzo', 'rin', 'ota', 'hana', 'sora', 'villager-man', 'villager-woman', 'villager-kid'];
export const ANIMALS = ['fox', 'bear', 'sheep', 'chicken', 'crow', 'rabbit', 'crab', 'fish-trout', 'fish-koi', 'fish-starfin', 'cat', 'duck', 'deer', 'cow', 'pig', 'goat', 'dog',
  'cricket', 'spider', 'spider-web', 'ladybug', 'dragonfly', 'butterfly', 'frog-pond', 'frog-tree', 'firefly', 'grasshopper', 'mantis'];
export const ARCHITECTURE = ['kawabe-house-a', 'kawabe-house-b', 'kawabe-shop', 'boathouse', 'mill', 'drawbridge', 'star-lamp', 'star-lamp-grand',
  'takamori-house-a', 'takamori-house-b', 'bakery', 'belltower', 'station', 'platform', 'signal-cottage', 'engine-shed', 'shrine',
  'torii', 'stone-lantern', 'shrine-stairs'];
export const RAILWAY = ['viaduct-span', 'viaduct-abutment', 'viaduct-broken', 'viaduct-repair', 'lamp-viaduct', 'sleeper', 'kobo', 'coach',
  'ferry', 'rowboat', 'dock', 'stepping-stone', 'stepping-stone-b', 'lantern-boat', 'landslide', 'tunnel-portal'];
const TREES = ['tree-broadleaf-a', 'tree-broadleaf-b', 'tree-cedar', 'tree-pine', 'tree-maple', 'tree-sakura', 'tree-peach', 'tree-chestnut'];
export const NATURE = [...TREES, ...TREES.map(t => `${t}-lod`), ...TROPICAL_TREES, ...TROPICAL_TREES.map(t => `${t}-lod`), ...TROPICAL_BUSHES, 'bush-a', 'bush-b', 'hydrangea', 'rock-a', 'rock-b', 'rock-c', 'reeds',
  'lilypads', 'flowers-a', 'flowers-b', 'mushrooms', 'log', 'stump', 'beehive-branch', 'grass-tuft'];
export const PROPS = ['star-kite', 'hand-lantern', 'fishing-rod', 'hammer', 'hearth', 'crate', 'barrel', 'sacks', 'fence-wood', 'fence-bamboo', 'wall-stone',
  'bench', 'well', 'market-stall', 'street-lamp', 'postbox', 'signpost', 'cart', 'haybale', 'scarecrow', 'sheep-pen', 'laundry-line',
  'flowerpot', 'noren-lantern', 'fireworks-rack', 'festival-stall', 'ball', 'broom', 'bucket', 'basket', 'letters', 'hoe', 'glass-jar', 'bug-net'];
export const ITEMS = ['cog', 'peach', 'chestnut', 'mushroom-item', 'honeycomb', 'journal-page', 'fallen-star', 'peach-bun', 'plate-trout',
  'bowl-chestnuts', 'timber', 'iron-bolts', 'key'];
export const INTERIORS = ['interior-cottage', 'interior-bakery', 'interior-mill', 'interior-station',
  'interior-kawabe-a', 'interior-kawabe-b', 'interior-kawabe-shop', 'interior-takamori-a', 'interior-takamori-b', 'interior-boathouse', 'interior-shed',
  'keepsake-photo', 'keepsake-recipe', 'keepsake-float', 'keepsake-ticket'];
export const REWARDS = ['music-box', 'golden-acorn', 'star-compass', 'star-tree', 'gift-lure', 'gift-radish', 'gift-buns', 'gift-cap', 'gift-pinecone', 'gift-honey'];
export const ALL_MODELS = [...CHARACTERS, ...ANIMALS, ...ARCHITECTURE, ...RAILWAY, ...NATURE, ...PROPS, ...ITEMS, ...INTERIORS, ...REWARDS];
// Static models whose plain parts are merged into one mesh at load (engine/static-merge.js): a building was 7-9 draws,
// twice with its shadow. Not the drawbridge (it swings), nor anything rigged or riding the railway.
export const MERGE_MODELS = [...ARCHITECTURE.filter(n => n !== 'drawbridge'), 'platform', 'viaduct-span', 'viaduct-abutment', 'viaduct-broken', 'viaduct-repair',
  'lamp-viaduct', 'tunnel-portal', 'dock', 'crate', 'barrel', 'sacks', 'bench', 'well', 'market-stall', 'festival-stall', 'postbox', 'cart', 'street-lamp',
  'signpost', 'scarecrow', 'haybale', 'flowerpot', 'sheep-pen', 'fence-wood', 'fence-bamboo', 'wall-stone'];
// Not needed for the first frame, fetched when something asks for them: the room models (world/interiors.js fetches a room
// when the player comes near its door or walks in) and the tropical trees (only when that scenery option is on).
export const TROPICAL_MODELS = [...TROPICAL_TREES, ...TROPICAL_TREES.map(t => `${t}-lod`), ...TROPICAL_BUSHES];
export const ROOM_MODELS = INTERIORS.filter(n => n.startsWith('interior-'));
// Models whose geometry nothing reads again once it is on the graphics card (engine/trim.js frees its arrays there)
export const TRIM_MODELS = [...ARCHITECTURE, ...TREES, ...TREES.map(t => `${t}-lod`)];
/** What the valley needs before play. `tropical`: the player has the tropical scenery switched on. */
export function bootModels({ tropical = false } = {}) {
  const later = new Set([...ROOM_MODELS, ...(tropical ? [] : TROPICAL_MODELS)]);
  return ALL_MODELS.filter(n => !later.has(n));
}
