// Town Life shops: what the valley sells, who keeps the counter, and the little things they say.
// GOODS become ITEMS too (icon = the key). Never sells story items (cog, plate, peach, bun, key, timber, bolts, kite,
// compass, honeycomb, starfin, honeyChestnuts). Prices are in mon. Contract: scratchpad townlife/DESIGN.md.

export const GOODS = {
  onigiri: { name: 'Rice ball', icon: 'onigiri', price: 3, desc: 'Kawabe rice, a pickled plum in the middle, wrapped in a leaf.' },
  radish: { name: 'Pickled radish', icon: 'radish', price: 2, desc: 'Yellow, crunchy, loud. Grandpa Ōta has opinions about it.' },
  dango: { name: 'Dango', icon: 'dango', price: 4, desc: 'Three sweet rice dumplings on a stick. Pink, white and green.' },
  tea: { name: 'Roasted tea', icon: 'tea', price: 6, desc: 'A tin of roasted tea. Smells like a warm kitchen.' },
  candy: { name: 'Red-bean candy', icon: 'candy', price: 2, desc: 'Komori\'s red-bean candy. One each. Two if you\'ve been brave.' },
  pinwheel: { name: 'Pinwheel', icon: 'pinwheel', price: 3, desc: 'Red and gold paper on a stick. Spins at the slightest breeze.' },
  ball: { name: 'Rubber ball', icon: 'ball', price: 8, desc: 'A proper round ball. Not an egg. Bounces.' },
  paper: { name: 'Letter paper', icon: 'paper', price: 4, desc: 'Pale blue paper and a little pot of ink, for words that matter.' },
  flowers: { name: 'Wildflowers', icon: 'flowers', price: 5, desc: 'Yellow and blue wildflowers from the Takamori meadows.' },
};

// errand items: handed from one neighbour to another by Mika (never sold)
export const ERRANDS = {
  parcel_teacher: { name: "Parcel for Miss Endo", icon: 'parcel' },
  card_fujita: { name: "Thank-you card for Mr. Fujita", icon: 'letter' },
  old_shirt: { name: "Goro's old shirt", icon: 'shirt' },
  toy_boat: { name: 'Toy boat', icon: 'toy-boat' },
  mailbag: { name: "Hirano's mailbag", icon: 'letters' },
  note_hirano: { name: "Sato's note for Hirano", icon: 'letter' },
  letter_aiko: { name: "Sato's letter for Aiko", icon: 'letter' },
  letter_sato: { name: "Aiko's reply", icon: 'letter' },
};

export const SHOPS = {
  grocer: {
    name: 'Fujita Grocery', room: 'kw2', keeper: 't1',
    sells: ['onigiri', 'radish', 'tea', 'dango'], buys: { fish: 2, chestnut: 1, mushroom: 2 },
    hello: ["Welcome, welcome! Mind the radish barrel.", "Ah, Sora's girl. What'll it be?", "Fresh rice balls! Well, this morning's.", "Come in, come in, the tea's brewing."],
    bye: ["Mind how you go!", "Come back when your pockets jingle.", "Say hello to the river for me.", "Thank you kindly!"],
    broke: ["Short a mon or two? Sell me a fish and we're even.", "Ah. The purse says no. Chestnuts say yes, bring me some.", "No money, no rice ball. I'm sorry, love, my father would haunt me."],
    thanks: { onigiri: "Eat it while it's warm-ish!", radish: "Don't let Ōta smell it on you.", tea: "Roasted. The good stuff.", dango: "Pink first. It's the rule.",
      fish: "A fine fish! I'll grill it for the lunch crowd.", chestnut: "Plump! Into the roasting pan.", mushroom: "Good forest mushroom, that." },
  },
  sweets: {
    name: 'Komori Sweets & Paper', room: 'kw8', keeper: 't2',
    sells: ['candy', 'pinwheel', 'paper', 'ball'], buys: {},
    hello: ["Welcome, dear. Something sweet, or something to write on?", "Mind the pinwheels, they're shy.", "Ah, the girl who writes on blue paper.", "Come in! Kenta's counted his coins three times already."],
    bye: ["Write to someone today!", "Don't eat it all at once. Or do.", "Goodbye, dear!", "Spin it facing the river."],
    broke: ["Not quite enough, dear. Come back after an errand or two.", "Ah, a few mon short. The candy will wait for you.", "Pockets light today? Mine were too, at your age."],
    thanks: { candy: "One for you, one for later.", pinwheel: "Hold it up! There, it's spinning.", paper: "Blue for good news.", ball: "Somebody's going to be very happy." },
  },
  stall: {
    name: 'Takamori Market Stall', at: 'takamori.stall', keeper: 'v4',
    sells: ['flowers', 'radish', 'onigiri'], buys: { chestnut: 1, mushroom: 2 },
    hello: ["Flowers for the table, pickles for the soul!", "Hello, ferry girl! Fresh today.", "Step up, step up! Mind the lean.", "Back again? Good taste."],
    bye: ["Come again!", "Give the flowers some water!", "Mind the hill on the way down.", "Say hello to Kawabe for me!"],
    broke: ["Ah, not quite. I can't do discounts, Hana does enough of those.", "Short a mon? Bring me mushrooms from the forest.", "Next time, love. The flowers aren't going anywhere. Well, they'll wilt, but slowly."],
    thanks: { flowers: "Yellow for remembering.", radish: "Crunchy! Crunch loudly.", onigiri: "Rice from across the river. Don't tell Hana.",
      chestnut: "Lovely. Hana will want these for her buns.", mushroom: "Ooh, forest ones." },
  },
};
