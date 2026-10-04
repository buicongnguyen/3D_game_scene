// The valley's everyday people: where each villager starts, who comes home as the Star Lamps are lit, and the little
// loops they stroll. Positions are checked by tests/barks.test.mjs (dry ground, gentle slope, clear of buildings).
// A villager is [id, model, x, z, facing]; the returning ones add the number of lit lamps that brings them home
// (4 = only in the epilogue). Models: villager-man, villager-woman, villager-kid (tinted per person at spawn).

export const VILLAGERS = [
  ['v1', 'villager-man', -47, 36, -Math.PI / 2], ['v2', 'villager-woman', -43.5, 8, Math.PI / 2], ['v3', 'villager-kid', -41, 23, 0],
  ['v4', 'villager-woman', 110, 12, Math.PI], ['v5', 'villager-man', 124, 2, -Math.PI / 2], ['v6', 'villager-kid', 116, 18, 2.5],
  ['v7', 'villager-man', -96, 117, 0],
  // more neighbours on Kawabe's main street and around Takamori's square
  ['v18', 'villager-woman', -49.5, 46, -Math.PI / 2], ['v19', 'villager-man', -50, 25, 1.4], ['v20', 'villager-kid', -40, 14, 0.8],
  ['v21', 'villager-woman', 108, -8, 2.2], ['v22', 'villager-man', 128, 28, -1], ['v23', 'villager-kid', 104, 36, 0.4],
];

// people who left the valley come home as the lamps are lit
export const RETURNING = [
  ['v8', 'villager-man', -45, 30, 1, 1], ['v9', 'villager-woman', -40, 2, 2, 1], ['v10', 'villager-kid', -50, 12, 0.5, 1],
  ['v11', 'villager-woman', 120, 6, 3, 2], ['v12', 'villager-man', 108, 25, 1.5, 2], ['v13', 'villager-kid', 125, 15, 2.5, 2],
  ['v14', 'villager-man', 58, -112, 0, 3], ['v15', 'villager-woman', 65, -110, 3.1, 3],
  ['v16', 'villager-kid', -100, 114, 1.2, 4], ['v17', 'villager-woman', -94, 118, 4, 4],
  ['v24', 'villager-man', -50, -10, 0.6, 1], ['v25', 'villager-woman', -43, -38, 2.6, 1], ['v26', 'villager-kid', 97, 24, 1.1, 1],
  ['v27', 'villager-man', 124, -12, 3.4, 2], ['v28', 'villager-woman', 118, 38, 0.2, 2], ['v29', 'villager-man', 66, -52, 1.9, 2],
  ['v30', 'villager-woman', 80, -44, 4.4, 3], ['v31', 'villager-kid', 146, -30, 2.8, 3], ['v32', 'villager-man', 54, -118, 0.9, 3],
  ['v33', 'villager-woman', -44, 30, 1.7, 4], ['v34', 'villager-man', 112, 22, 3.9, 4], ['v35', 'villager-kid', -47, 0, 0.3, 4],
];

// everyday routes: villagers stroll between a few spots and pause to chat
export const ROUTES = {
  v1: [[-47, 36], [-45, 48], [-44, 26], [-47, 36]], v2: [[-43.5, 8], [-44, -8], [-40, 21], [-43.5, 8]],
  v3: [[-41, 23], [-38, 20], [-42, 28]], v4: [[110, 12], [104, 6], [118, 8], [110, 12]],
  v5: [[124, 2], [128, -6], [120, 16], [124, 2]], v6: [[116, 18], [112, 24], [121, 20]],
  v8: [[-45, 30], [-42, 40], [-46, 22]], v9: [[-40, 2], [-43, -6], [-38, 10]], v10: [[-50, 12], [-46, 16], [-52, 8]],
  v11: [[120, 6], [114, 10], [124, 0]], v12: [[108, 25], [104, 20], [112, 28]], v13: [[125, 15], [120, 20], [128, 10]],
  v14: [[58, -112], [62, -116], [56, -118]], v15: [[65, -110], [60, -108], [66, -114]],
  v18: [[-49.5, 46], [-47, 40], [-50, 52]], v19: [[-50, 25], [-48, 30], [-49, 21]], v20: [[-40, 14], [-42, 18], [-41, 6]],
  v21: [[108, -8], [110, 0], [107, -9]], v22: [[128, 28], [124, 32], [132, 24]], v23: [[104, 36], [108, 32], [100, 40]],
  v24: [[-50, -10], [-47, -14], [-48, -6]], v25: [[-43, -38], [-40, -34], [-44, -40]], v26: [[97, 24], [100, 20], [101, 28]],
  v27: [[124, -12], [120, -8], [126, -9]], v28: [[118, 38], [122, 34], [114, 42]], v29: [[66, -52], [70, -48], [62, -56]],
  v30: [[80, -44], [84, -40], [76, -48]], v31: [[146, -30], [150, -26], [142, -34]], v32: [[54, -118], [57, -116], [51, -120]],
  v33: [[-44, 30], [-46, 34], [-44, 26]], v34: [[112, 22], [108, 26], [114, 20]], v35: [[-47, 0], [-45, 4], [-49, -2]],
};
