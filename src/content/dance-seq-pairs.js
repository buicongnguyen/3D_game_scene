// © 2026 Bui Cong Nguyen · solluxlabs.com
// Written by scripts/seq-pairs.mjs: the fades between two dances of a sequence style (per rig: kotone = the front row's
// source, nam1 = the back row's) that break a joint rule for a few frames on one of these bodies ('self': the rig's own;
// the others: model files that copy it). game/perform/plan.js never puts B after A in a routine those bodies dance.
// 'A>B' -> [bodies]. Checked at 87, 96, 110 and 124 BPM from every half beat of A (Latin party also at 85 and 86.7 BPM from
// every quarter beat), through the fade and two beats after it, at 120 Hz; plus the fades the whole-song troupe check found
// (seq-pairs.mjs FOUND).
export const SEQ_PAIRS = Object.freeze({
 "kotone": {
  "SeqBrkReady>SeqBrkUprock2": [
   "vroid-nu3"
  ],
  "ClubTopRock>SeqBrkUprock2": [
   "self",
   "vroid-nam3",
   "vroid-nu3"
  ],
  "SeqBrkUprock2>SeqBrkReady": [
   "vroid-nu3"
  ],
  "SeqBrkUprock2>ClubTopRock": [
   "vroid-nu3"
  ],
  "SeqBrkUprock2>SeqBrkUprock": [
   "vroid-nu3"
  ],
  "SeqBrkUprock2>ClubBrooklynRock": [
   "vroid-nu3"
  ],
  "SeqBrkUprock>SeqBrkUprock2": [
   "vroid-nu3"
  ],
  "ClubBrooklynRock>SeqBrkUprock2": [
   "vroid-nu3"
  ],
  "SeqGinga>SeqGinga2": [
   "self",
   "vroid-nam1",
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu1",
   "vroid-nu3",
   "vroid-nu4"
  ],
  "SeqGinga>SeqCapoeira": [
   "self",
   "vroid-nightstar",
   "vroid-nu1",
   "vroid-nu3",
   "vroid-nu4",
   "vroid-nu5"
  ],
  "SeqGinga2>SeqGinga": [
   "self",
   "vroid-nam1",
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu1",
   "vroid-nu3",
   "vroid-nu4"
  ],
  "SeqGinga2>SeqCapoeira": [
   "vroid-nam1",
   "vroid-nam3"
  ],
  "SeqCapoeira>SeqGinga": [
   "self",
   "vroid-nightstar",
   "vroid-nu1",
   "vroid-nu3",
   "vroid-nu4",
   "vroid-nu5"
  ],
  "SeqCapoeira>SeqGinga2": [
   "self",
   "vroid-nam1",
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu1",
   "vroid-nu3",
   "vroid-nu4",
   "vroid-nu5"
  ],
  "SeqSalsa>SeqSamba5": [
   "vroid-nu3"
  ],
  "SeqSalsa>SeqSamba": [
   "self",
   "vroid-nam1",
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu1",
   "vroid-nu3"
  ],
  "SeqSalsa>SeqSalsa7": [
   "self",
   "vroid-nam1",
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu3"
  ],
  "SeqSalsa>SeqSamba2": [
   "self",
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nightstar",
   "vroid-nu1",
   "vroid-nu3",
   "vroid-nu5"
  ],
  "SeqSalsa>SeqSalsa4": [
   "self",
   "vroid-nam1",
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nightstar",
   "vroid-nu1",
   "vroid-nu3",
   "vroid-nu4",
   "vroid-nu5"
  ],
  "SeqSalsa>SeqHouse": [
   "self",
   "vroid-nu3"
  ],
  "SeqSamba5>SeqSalsa": [
   "self",
   "vroid-nu3"
  ],
  "SeqSamba5>SeqSalsa7": [
   "vroid-nam1",
   "vroid-nam2",
   "vroid-nam3"
  ],
  "SeqSamba5>SeqSalsa4": [
   "self",
   "vroid-nu3"
  ],
  "SeqSamba>SeqSalsa": [
   "self",
   "vroid-nightstar",
   "vroid-nu1",
   "vroid-nu3",
   "vroid-nu4",
   "vroid-nu5"
  ],
  "SeqSamba>SeqSalsa7": [
   "self",
   "vroid-nam1",
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nightstar",
   "vroid-nu1",
   "vroid-nu3",
   "vroid-nu4",
   "vroid-nu5"
  ],
  "SeqSamba>SeqSalsa4": [
   "self",
   "vroid-nam1",
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu1",
   "vroid-nu3"
  ],
  "SeqSamba>SeqSamba7": [
   "self",
   "vroid-nam1",
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nightstar",
   "vroid-nu1",
   "vroid-nu3",
   "vroid-nu4",
   "vroid-nu5"
  ],
  "SeqSalsa7>SeqSalsa": [
   "self",
   "vroid-nam1",
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu3"
  ],
  "SeqSalsa7>SeqSamba5": [
   "self",
   "vroid-nam1",
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nightstar",
   "vroid-nu1",
   "vroid-nu3",
   "vroid-nu4",
   "vroid-nu5"
  ],
  "SeqSalsa7>SeqSamba": [
   "vroid-nam1",
   "vroid-nam2",
   "vroid-nam3"
  ],
  "SeqSalsa7>SeqSamba2": [
   "self",
   "vroid-nam1",
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nightstar",
   "vroid-nu1",
   "vroid-nu3",
   "vroid-nu4",
   "vroid-nu5"
  ],
  "SeqSalsa7>SeqSalsa4": [
   "self",
   "vroid-nam1",
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nightstar",
   "vroid-nu3",
   "vroid-nu5"
  ],
  "SeqSalsa7>SeqHouse": [
   "vroid-nam1",
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu3"
  ],
  "SeqSalsa7>SeqSamba7": [
   "self",
   "vroid-nam1",
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu3"
  ],
  "SeqSamba2>SeqSalsa7": [
   "vroid-nam1",
   "vroid-nam2",
   "vroid-nam3"
  ],
  "SeqSamba2>SeqSalsa4": [
   "self",
   "vroid-nu3"
  ],
  "SeqSalsa4>SeqSalsa": [
   "self",
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu3"
  ],
  "SeqSalsa4>SeqSamba5": [
   "self",
   "vroid-nam1",
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nightstar",
   "vroid-nu1",
   "vroid-nu3",
   "vroid-nu4",
   "vroid-nu5"
  ],
  "SeqSalsa4>SeqSamba": [
   "self",
   "vroid-nam2",
   "vroid-nightstar",
   "vroid-nu1",
   "vroid-nu3",
   "vroid-nu4",
   "vroid-nu5"
  ],
  "SeqSalsa4>SeqSalsa7": [
   "self",
   "vroid-nam1",
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nightstar",
   "vroid-nu1",
   "vroid-nu3",
   "vroid-nu4",
   "vroid-nu5"
  ],
  "SeqSalsa4>SeqSamba2": [
   "self",
   "vroid-nam1",
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nightstar",
   "vroid-nu1",
   "vroid-nu3",
   "vroid-nu4",
   "vroid-nu5"
  ],
  "SeqSalsa4>SeqHouse": [
   "self",
   "vroid-nightstar",
   "vroid-nu1",
   "vroid-nu3",
   "vroid-nu4",
   "vroid-nu5"
  ],
  "SeqSalsa4>SeqSamba7": [
   "self",
   "vroid-nightstar",
   "vroid-nu1",
   "vroid-nu3",
   "vroid-nu4",
   "vroid-nu5"
  ],
  "SeqHouse>SeqSalsa7": [
   "self",
   "vroid-nam1",
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu3"
  ],
  "SeqHouse>SeqSamba2": [
   "self",
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu3"
  ],
  "SeqHouse>SeqSalsa4": [
   "self",
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu1",
   "vroid-nu3"
  ],
  "SeqSamba7>SeqSamba": [
   "self",
   "vroid-nam1",
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nightstar",
   "vroid-nu1",
   "vroid-nu3",
   "vroid-nu4",
   "vroid-nu5"
  ],
  "SeqSamba7>SeqSalsa7": [
   "vroid-nam1",
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu3"
  ],
  "SeqSamba7>SeqSalsa4": [
   "self",
   "vroid-nam1",
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nightstar",
   "vroid-nu1",
   "vroid-nu3",
   "vroid-nu4",
   "vroid-nu5"
  ],
  "SeqJazz5>ClubStepTouch": [
   "vroid-nam2",
   "vroid-nightstar",
   "vroid-nu3"
  ],
  "SeqJazz5>ClubKickBall": [
   "vroid-nam2",
   "vroid-nightstar",
   "vroid-nu3"
  ],
  "ClubStepTouch>SeqJazz5": [
   "vroid-nam2",
   "vroid-nightstar",
   "vroid-nu3"
  ],
  "ClubKickBall>SeqJazz5": [
   "vroid-nam2",
   "vroid-nightstar",
   "vroid-nu3"
  ]
 },
 "nam1": {
  "SeqBrkReady>SeqBrkUprock2": [
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu3"
  ],
  "ClubTopRock>SeqBrkUprock2": [
   "vroid-nu3"
  ],
  "ClubTopRock>SeqBrkFootwork": [
   "vroid-nam2",
   "vroid-nu1",
   "vroid-nu3"
  ],
  "SeqBrkUprock2>SeqBrkReady": [
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu3"
  ],
  "SeqBrkUprock2>ClubTopRock": [
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu3"
  ],
  "SeqBrkUprock2>SeqBrkUprock": [
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu3"
  ],
  "SeqBrkUprock2>ClubBrooklynRock": [
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu3"
  ],
  "SeqBrkUprock2>SeqBrkFootwork": [
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu1",
   "vroid-nu3"
  ],
  "SeqBrkUprock2>SeqBrkHeadSpin": [
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu3"
  ],
  "SeqBrkUprock>SeqBrkUprock2": [
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu3"
  ],
  "SeqBrkUprock>SeqBrkFootwork": [
   "vroid-nam2",
   "vroid-nu1",
   "vroid-nu3"
  ],
  "ClubBrooklynRock>SeqBrkUprock2": [
   "vroid-nu3"
  ],
  "ClubBrooklynRock>SeqBrkFootwork": [
   "vroid-nam2",
   "vroid-nu1",
   "vroid-nu3"
  ],
  "SeqBrkFootwork>SeqBrkReady": [
   "vroid-nam2",
   "vroid-nu1",
   "vroid-nu3"
  ],
  "SeqBrkFootwork>ClubTopRock": [
   "vroid-nam2",
   "vroid-nu1",
   "vroid-nu3"
  ],
  "SeqBrkFootwork>SeqBrkUprock2": [
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu1",
   "vroid-nu3"
  ],
  "SeqBrkFootwork>SeqBrkUprock": [
   "vroid-nam2",
   "vroid-nu1",
   "vroid-nu3"
  ],
  "SeqBrkFootwork>ClubBrooklynRock": [
   "vroid-nam2",
   "vroid-nu1",
   "vroid-nu3"
  ],
  "SeqBrkFootwork>SeqBrkHeadSpin": [
   "vroid-nam2",
   "vroid-nu1",
   "vroid-nu3"
  ],
  "SeqBrkHeadSpin>SeqBrkUprock2": [
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu3"
  ],
  "SeqBrkHeadSpin>SeqBrkFootwork": [
   "vroid-nam2",
   "vroid-nu1",
   "vroid-nu3"
  ],
  "SeqGinga>SeqCapoeira": [
   "vroid-nu1",
   "vroid-nu3"
  ],
  "SeqCapoeira>SeqGinga": [
   "self",
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu1",
   "vroid-nu3"
  ],
  "SeqSilly2>SeqMacarena": [
   "self",
   "vroid-nam3"
  ],
  "SeqSilly>SeqMacarena": [
   "self",
   "vroid-nam3",
   "vroid-nu1",
   "vroid-nu3"
  ],
  "SeqMacarena>SeqYmca": [
   "self",
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu1",
   "vroid-nu3"
  ],
  "ClubClapStep>SeqMacarena": [
   "self",
   "vroid-nam3",
   "vroid-nu1"
  ],
  "ClubCutePop>SeqMacarena": [
   "self",
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu1",
   "vroid-nu3"
  ],
  "SeqSalsa>SeqSalsa3": [
   "self",
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu1",
   "vroid-nu3"
  ],
  "SeqSalsa>SeqSamba5": [
   "vroid-nam3",
   "vroid-nu3"
  ],
  "SeqSalsa>SeqSalsa7": [
   "self",
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu1",
   "vroid-nu3"
  ],
  "SeqSalsa>SeqSalsa4": [
   "self",
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu1",
   "vroid-nu3"
  ],
  "SeqSalsa>SeqHouse": [
   "self",
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu1",
   "vroid-nu3"
  ],
  "SeqSalsa>SeqSamba7": [
   "vroid-nu3"
  ],
  "SeqSalsa>SeqSamba3": [
   "self",
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu1",
   "vroid-nu3"
  ],
  "SeqSalsa3>SeqSalsa": [
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu3"
  ],
  "SeqSalsa3>SeqSamba5": [
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu3"
  ],
  "SeqSalsa3>SeqSalsa7": [
   "self",
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu1",
   "vroid-nu3"
  ],
  "SeqSalsa3>SeqSalsa4": [
   "self",
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu1",
   "vroid-nu3"
  ],
  "SeqSalsa3>SeqHouse": [
   "self",
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu1",
   "vroid-nu3"
  ],
  "SeqSalsa3>SeqSamba7": [
   "self",
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu3"
  ],
  "SeqSalsa3>SeqSamba3": [
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu3"
  ],
  "SeqSamba5>SeqSalsa": [
   "vroid-nu3"
  ],
  "SeqSamba5>SeqSalsa3": [
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu3"
  ],
  "SeqSamba5>SeqSalsa7": [
   "self",
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu1",
   "vroid-nu3"
  ],
  "SeqSamba5>SeqSalsa4": [
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu3"
  ],
  "SeqSamba5>SeqSamba3": [
   "vroid-nam3",
   "vroid-nu3"
  ],
  "SeqSalsa7>SeqSalsa": [
   "self",
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu1",
   "vroid-nu3"
  ],
  "SeqSalsa7>SeqSalsa3": [
   "self",
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu1",
   "vroid-nu3"
  ],
  "SeqSalsa7>SeqSamba5": [
   "self",
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu1",
   "vroid-nu3"
  ],
  "SeqSalsa7>SeqSalsa4": [
   "self",
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu1",
   "vroid-nu3"
  ],
  "SeqSalsa7>SeqHouse": [
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu3"
  ],
  "SeqSalsa7>SeqSamba7": [
   "self",
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu1",
   "vroid-nu3"
  ],
  "SeqSalsa7>SeqSamba3": [
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu1",
   "vroid-nu3"
  ],
  "SeqSalsa4>SeqSalsa": [
   "self",
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu1",
   "vroid-nu3"
  ],
  "SeqSalsa4>SeqSalsa3": [
   "self",
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu1",
   "vroid-nu3"
  ],
  "SeqSalsa4>SeqSamba5": [
   "self",
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu1",
   "vroid-nu3"
  ],
  "SeqSalsa4>SeqSalsa7": [
   "self",
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu1",
   "vroid-nu3"
  ],
  "SeqSalsa4>SeqHouse": [
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu3"
  ],
  "SeqSalsa4>SeqSamba7": [
   "self",
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu1",
   "vroid-nu3"
  ],
  "SeqSalsa4>SeqSamba3": [
   "self",
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu1",
   "vroid-nu3"
  ],
  "SeqHouse>SeqSalsa": [
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu3"
  ],
  "SeqHouse>SeqSalsa3": [
   "self",
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu1",
   "vroid-nu3"
  ],
  "SeqHouse>SeqSalsa7": [
   "self",
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu1",
   "vroid-nu3"
  ],
  "SeqHouse>SeqSalsa4": [
   "self",
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu1",
   "vroid-nu3"
  ],
  "SeqHouse>SeqSamba7": [
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu3"
  ],
  "SeqHouse>SeqSamba3": [
   "self",
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu1",
   "vroid-nu3"
  ],
  "SeqSamba7>SeqSalsa3": [
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu3"
  ],
  "SeqSamba7>SeqSalsa7": [
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu3"
  ],
  "SeqSamba7>SeqSalsa4": [
   "self",
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu1",
   "vroid-nu3"
  ],
  "SeqSamba3>SeqSalsa": [
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu3"
  ],
  "SeqSamba3>SeqSalsa3": [
   "self",
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu1",
   "vroid-nu3"
  ],
  "SeqSamba3>SeqSalsa7": [
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu3"
  ],
  "SeqSamba3>SeqSalsa4": [
   "vroid-nam3",
   "vroid-nu3"
  ],
  "SeqJazz5>SeqJazz4": [
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu3"
  ],
  "SeqJazz5>ClubStepTouch": [
   "self",
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu1",
   "vroid-nu3"
  ],
  "SeqJazz5>SeqNsFloorSpin": [
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu3"
  ],
  "SeqJazz5>SeqSwing4": [
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu3"
  ],
  "SeqJazz5>SeqSwing2": [
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu3"
  ],
  "SeqJazz5>ClubKickBall": [
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu3"
  ],
  "SeqJazz4>SeqJazz5": [
   "self",
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu1",
   "vroid-nu3"
  ],
  "SeqJazz4>ClubStepTouch": [
   "self",
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu1",
   "vroid-nu3"
  ],
  "SeqJazz4>SeqNsFloorSpin": [
   "self",
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu1",
   "vroid-nu3"
  ],
  "SeqJazz4>SeqSwing4": [
   "vroid-nam3"
  ],
  "SeqJazz4>SeqSwing2": [
   "vroid-nam3"
  ],
  "SeqJazz4>ClubKickBall": [
   "vroid-nam3"
  ],
  "ClubStepTouch>SeqJazz5": [
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu3"
  ],
  "ClubStepTouch>SeqJazz4": [
   "self",
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu1",
   "vroid-nu3"
  ],
  "SeqNsFloorSpin>SeqJazz5": [
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu3"
  ],
  "SeqNsFloorSpin>SeqJazz4": [
   "self",
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu1",
   "vroid-nu3"
  ],
  "SeqNsFloorSpin>SeqSwing4": [
   "vroid-nu3"
  ],
  "SeqNsFloorSpin>SeqSwing2": [
   "vroid-nu3"
  ],
  "SeqSwing4>SeqJazz5": [
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu3"
  ],
  "SeqSwing2>SeqJazz5": [
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu3"
  ],
  "SeqSwing2>SeqJazz4": [
   "self",
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu1",
   "vroid-nu3"
  ],
  "ClubKickBall>SeqJazz5": [
   "vroid-nam2",
   "vroid-nam3",
   "vroid-nu3"
  ],
  "SeqSamba5>SeqHouse": [
   "vroid-nam2",
   "vroid-nam3"
  ]
 }
});
