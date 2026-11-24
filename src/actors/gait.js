// Reference speed (m/s) at normal playback, checked in the flat-foot part
// of stance on both feet of the exported human rigs. Full and lite clips match.
export const HUMAN_GAIT = {
  mika: { walk: 1.580, run: 4.2 },
  sora: { walk: 0.984 },
  genzo: { walk: 1.553 },
  hana: { walk: 1.575 },
  ota: { walk: 1.581 },
  rin: { walk: 1.573, run: 4.2 },
  haru: { walk: 1.588, run: 4.2 },
  byeol: { walk: 1.6, run: 4.195 },
  hoa: { walk: 1.6, run: 4.195 },
  nabi: { walk: 1.6, run: 4.195 },
  'villager-kid': { walk: 1.567, run: 4.2 },
  'villager-man': { walk: 1.587, run: 4.2 },
  'villager-woman': { walk: 1.586, run: 4.196 },
};

// Ground speeds used by the animal IK paths in art/blender/build_animals.py.
export const ANIMAL_GAIT = {
  fox: { walk: 1.2, run: 5 }, bear: { walk: 1 }, sheep: { walk: 0.8, run: 3.5 },
  cat: { walk: 0.6 }, deer: { walk: 1.3 }, chicken: { walk: 0.5 },
  rabbit: { walk: 1.6 }, crab: { walk: 0.35 }, cow: { walk: 0.7 },
  pig: { walk: 0.9 }, goat: { walk: 1 }, dog: { walk: 1.1, run: 4.5 },
};
