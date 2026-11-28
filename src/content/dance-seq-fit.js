// © 2026 Bui Cong Nguyen · solluxlabs.com
// Written by scripts/seq-bake.mjs: each sequence clip as the Club prep cut it (content/dance-sequences.js). bpm / beat (s)
// / phase (s into the loop where its beat grid starts) / loop (s) / beats: its own tempo and loop, so the plan plays it at
// the song's beat (game/perform/plan.js clipTiming); grid: its steps on the beat or the eighth (an eighth-grid dance never
// plays in double time); energy: leg lengths a second; stance: its first frame's feet (m), largest hip / chest turn (deg),
// hip lift, foot reach from the centre and highest toe (m), on the first body that keeps it; rigs: the packs that have it;
// maxRate: per pack, the fastest beat-sync rate its joints pass; fails: per pack, the bodies a copy of it breaks a joint
// rule on (game/perform/plan.js leaves it out of a routine those bodies dance).
export const SEQ_FIT = Object.freeze({
 "SeqBrkReady": {
  "bpm": 114.29,
  "beat": 0.525,
  "phase": 0.4961,
  "loop": 4.2,
  "beats": 8,
  "grid": "beat",
  "energy": 0.682,
  "stance": {
   "feet": [
    [
     0.337,
     -0.024
    ],
    [
     0.216,
     -0.068
    ]
   ],
   "hipYaw": 10.9,
   "chestYaw": 15.1,
   "lift": 0.037,
   "reach": 0.338,
   "kick": 0.054,
   "handGap": 0.295
  },
  "maxRate": {
   "kotone": 1.2,
   "nam1": 1.2
  },
  "rigs": [
   "kotone",
   "nam1"
  ]
 },
 "SeqBrkUprock": {
  "bpm": 114.29,
  "beat": 0.525,
  "phase": 0.2878,
  "loop": 4.2,
  "beats": 8,
  "grid": "eighth",
  "energy": 2.759,
  "stance": {
   "feet": [
    [
     0.123,
     -0.494
    ],
    [
     -0.168,
     -0.697
    ]
   ],
   "hipYaw": 20.4,
   "chestYaw": 27.7,
   "lift": 0.159,
   "reach": 0.986,
   "kick": 0.455,
   "handGap": 0.088
  },
  "maxRate": {
   "kotone": 1.2,
   "nam1": 1.2
  },
  "rigs": [
   "kotone",
   "nam1"
  ]
 },
 "SeqBrkUprock2": {
  "bpm": 128.57,
  "beat": 0.46667,
  "phase": 0.1702,
  "loop": 1.8667,
  "beats": 4,
  "grid": "eighth",
  "energy": 2.221,
  "stance": {
   "feet": [
    [
     -0.05,
     -0.06
    ],
    [
     -0.238,
     0.126
    ]
   ],
   "hipYaw": 39.3,
   "chestYaw": 21,
   "lift": 0.174,
   "reach": 0.402,
   "kick": 0.429,
   "handGap": 0.4
  },
  "maxRate": {
   "kotone": 1.2,
   "nam1": 1.2
  },
  "rigs": [
   "kotone",
   "nam1"
  ],
  "fails": {
   "kotone": [
    "vroid-nu3"
   ],
   "nam1": [
    "vroid-nam2",
    "vroid-nam3",
    "vroid-nu3"
   ]
  }
 },
 "SeqGinga": {
  "bpm": 135.85,
  "beat": 0.44167,
  "phase": 0.2751,
  "loop": 3.5333,
  "beats": 8,
  "grid": "eighth",
  "energy": 1.968,
  "stance": {
   "feet": [
    [
     0.024,
     0.328
    ],
    [
     0.348,
     -0.481
    ]
   ],
   "hipYaw": 40.2,
   "chestYaw": 64.1,
   "lift": 0.143,
   "reach": 0.789,
   "kick": 0.222,
   "handGap": 0.333
  },
  "maxRate": {
   "kotone": 1.2,
   "nam1": 1.2
  },
  "rigs": [
   "kotone",
   "nam1"
  ]
 },
 "SeqGinga2": {
  "bpm": 125.22,
  "beat": 0.47917,
  "phase": 0.4455,
  "loop": 3.8333,
  "beats": 8,
  "grid": "eighth",
  "energy": 1.903,
  "stance": {
   "feet": [
    [
     0.115,
     0.296
    ],
    [
     0.327,
     -0.516
    ]
   ],
   "hipYaw": 28.9,
   "chestYaw": 99.4,
   "lift": 0.177,
   "reach": 0.637,
   "kick": 0.203,
   "handGap": 0.223
  },
  "maxRate": {
   "kotone": 1.2
  },
  "rigs": [
   "kotone"
  ],
  "fails": {
   "kotone": [
    "vroid-nam1",
    "vroid-nam3"
   ]
  }
 },
 "SeqCapoeira": {
  "bpm": 148.45,
  "beat": 0.40417,
  "phase": 0.1914,
  "loop": 3.2333,
  "beats": 8,
  "grid": "eighth",
  "energy": 1.67,
  "stance": {
   "feet": [
    [
     -0.507,
     -0.351
    ],
    [
     -0.137,
     0.329
    ]
   ],
   "hipYaw": 28.5,
   "chestYaw": 54,
   "lift": 0.163,
   "reach": 0.77,
   "kick": 0.232,
   "handGap": 0.314
  },
  "maxRate": {
   "kotone": 1.2,
   "nam1": 1.2
  },
  "rigs": [
   "kotone",
   "nam1"
  ]
 },
 "SeqYmca": {
  "bpm": 153.19,
  "beat": 0.39167,
  "phase": 0.2125,
  "loop": 1.5667,
  "beats": 4,
  "grid": "none",
  "energy": 1.154,
  "stance": {
   "feet": [
    [
     0.172,
     0.012
    ],
    [
     -0.134,
     -0.012
    ]
   ],
   "hipYaw": 22.6,
   "chestYaw": 17,
   "lift": 0.133,
   "reach": 0.175,
   "kick": 0.012,
   "handGap": 0.413
  },
  "maxRate": {
   "kotone": 1.2,
   "nam1": 1.2
  },
  "rigs": [
   "kotone",
   "nam1"
  ]
 },
 "SeqSilly2": {
  "bpm": 160,
  "beat": 0.375,
  "phase": 0.2543,
  "loop": 1.5,
  "beats": 4,
  "grid": "beat",
  "energy": 0.87,
  "stance": {
   "feet": [
    [
     0.387,
     0.153
    ],
    [
     0.072,
     -0.019
    ]
   ],
   "hipYaw": 13.8,
   "chestYaw": 33,
   "lift": 0.034,
   "reach": 0.485,
   "kick": 0.046,
   "handGap": 0.461
  },
  "maxRate": {
   "kotone": 1.2,
   "nam1": 1.2
  },
  "rigs": [
   "kotone",
   "nam1"
  ]
 },
 "SeqSalsa": {
  "bpm": 102.13,
  "beat": 0.5875,
  "phase": 0.5185,
  "loop": 4.7,
  "beats": 8,
  "grid": "eighth",
  "energy": 1.206,
  "stance": {
   "feet": [
    [
     -0.37,
     0.037
    ],
    [
     -0.722,
     0.023
    ]
   ],
   "hipYaw": 22.4,
   "chestYaw": 32,
   "lift": 0.082,
   "reach": 0.763,
   "kick": 0.077,
   "handGap": 0.269
  },
  "maxRate": {
   "kotone": 1.2,
   "nam1": 1.2
  },
  "rigs": [
   "kotone",
   "nam1"
  ]
 },
 "SeqSalsa4": {
  "bpm": 102.49,
  "beat": 0.58542,
  "phase": 0.4157,
  "loop": 9.3667,
  "beats": 16,
  "grid": "eighth",
  "energy": 1.067,
  "stance": {
   "feet": [
    [
     -0.09,
     0.487
    ],
    [
     -0.128,
     0.15
    ]
   ],
   "hipYaw": 179.8,
   "chestYaw": 179.4,
   "lift": 0.054,
   "reach": 0.585,
   "kick": 0.099,
   "handGap": 0.269
  },
  "maxRate": {
   "kotone": 1.2,
   "nam1": 1.2
  },
  "rigs": [
   "kotone",
   "nam1"
  ]
 },
 "SeqSalsa7": {
  "bpm": 102.13,
  "beat": 0.5875,
  "phase": 0.4655,
  "loop": 4.7,
  "beats": 8,
  "grid": "eighth",
  "energy": 0.936,
  "stance": {
   "feet": [
    [
     -0.056,
     0.5
    ],
    [
     -0.09,
     0.176
    ]
   ],
   "hipYaw": 15.8,
   "chestYaw": 9.3,
   "lift": 0.054,
   "reach": 0.562,
   "kick": 0.084,
   "handGap": 0.165
  },
  "maxRate": {
   "kotone": 1.2,
   "nam1": 1.2
  },
  "rigs": [
   "kotone",
   "nam1"
  ],
  "fails": {
   "kotone": [
    "vroid-nam1",
    "vroid-nam2",
    "vroid-nam3"
   ],
   "nam1": [
    "vroid-nu3"
   ]
  }
 },
 "SeqSamba": {
  "bpm": 143.28,
  "beat": 0.41875,
  "phase": 0.0618,
  "loop": 6.7,
  "beats": 16,
  "grid": "eighth",
  "energy": 1.778,
  "stance": {
   "feet": [
    [
     0.044,
     -0.115
    ],
    [
     -0.067,
     0.032
    ]
   ],
   "hipYaw": 57.5,
   "chestYaw": 77.8,
   "lift": 0.204,
   "reach": 0.659,
   "kick": 0.387,
   "handGap": 0.055
  },
  "maxRate": {
   "kotone": 1.1
  },
  "rigs": [
   "kotone"
  ]
 },
 "SeqSamba2": {
  "bpm": 83.72,
  "beat": 0.71667,
  "phase": 0.4945,
  "loop": 2.8667,
  "beats": 4,
  "grid": "beat",
  "energy": 1.053,
  "stance": {
   "feet": [
    [
     -0.002,
     -0.085
    ],
    [
     -0.282,
     -0.101
    ]
   ],
   "hipYaw": 28.1,
   "chestYaw": 19.7,
   "lift": 0.074,
   "reach": 0.343,
   "kick": 0.042,
   "handGap": 0.454
  },
  "maxRate": {
   "kotone": 1.2
  },
  "rigs": [
   "kotone"
  ]
 },
 "SeqSamba5": {
  "bpm": 161.8,
  "beat": 0.37083,
  "phase": 0.1935,
  "loop": 2.9667,
  "beats": 8,
  "grid": "eighth",
  "energy": 1.863,
  "stance": {
   "feet": [
    [
     0.189,
     0.05
    ],
    [
     -0.24,
     -0.151
    ]
   ],
   "hipYaw": 33.3,
   "chestYaw": 62.6,
   "lift": 0.138,
   "reach": 0.432,
   "kick": 0.182,
   "handGap": 0.287
  },
  "maxRate": {
   "kotone": 1.1,
   "nam1": 1.1
  },
  "rigs": [
   "kotone",
   "nam1"
  ]
 },
 "SeqSamba7": {
  "bpm": 133.33,
  "beat": 0.45,
  "phase": 0.1482,
  "loop": 1.8,
  "beats": 4,
  "grid": "eighth",
  "energy": 2.282,
  "stance": {
   "feet": [
    [
     0.024,
     0.161
    ],
    [
     -0.138,
     0.419
    ]
   ],
   "hipYaw": 87,
   "chestYaw": 98.7,
   "lift": 0.106,
   "reach": 0.477,
   "kick": 0.124,
   "handGap": 0.843
  },
  "maxRate": {
   "kotone": 1.2,
   "nam1": 1.2
  },
  "rigs": [
   "kotone",
   "nam1"
  ]
 },
 "SeqHouse": {
  "bpm": 109.09,
  "beat": 0.55,
  "phase": 0.349,
  "loop": 2.2,
  "beats": 4,
  "grid": "eighth",
  "energy": 1.201,
  "stance": {
   "feet": [
    [
     0.395,
     -0.134
    ],
    [
     0.163,
     -0.017
    ]
   ],
   "hipYaw": 26,
   "chestYaw": 23.5,
   "lift": 0.114,
   "reach": 0.564,
   "kick": 0.219,
   "handGap": 0.212
  },
  "maxRate": {
   "kotone": 1.2,
   "nam1": 1.2
  },
  "rigs": [
   "kotone",
   "nam1"
  ]
 },
 "SeqJazz5": {
  "bpm": 120,
  "beat": 0.5,
  "phase": 0.1753,
  "loop": 2,
  "beats": 4,
  "grid": "eighth",
  "energy": 1.63,
  "stance": {
   "feet": [
    [
     0.264,
     -0.389
    ],
    [
     0.044,
     -0.111
    ]
   ],
   "hipYaw": 35.6,
   "chestYaw": 33.6,
   "lift": 0.065,
   "reach": 0.542,
   "kick": 0.077,
   "handGap": 0.706
  },
  "maxRate": {
   "kotone": 1.2,
   "nam1": 1.2
  },
  "rigs": [
   "kotone",
   "nam1"
  ],
  "fails": {
   "kotone": [
    "vroid-nam2",
    "vroid-nightstar",
    "vroid-nu3"
   ],
   "nam1": [
    "vroid-nam2",
    "vroid-nam3",
    "vroid-nu3"
   ]
  }
 },
 "SeqBrkFootwork": {
  "bpm": 153.19,
  "beat": 0.39167,
  "phase": 0.2842,
  "loop": 3.1333,
  "beats": 8,
  "grid": "eighth",
  "energy": 2.878,
  "floor": true,
  "stance": {
   "feet": [
    [
     0.483,
     -0.357
    ],
    [
     0.667,
     0.374
    ]
   ],
   "hipYaw": 26.3,
   "chestYaw": 179.5,
   "lift": 0.316,
   "reach": 0.982,
   "kick": 0.267,
   "handGap": 0.248
  },
  "maxRate": {
   "nam1": 1.2
  },
  "rigs": [
   "nam1"
  ],
  "fails": {
   "nam1": [
    "vroid-nam2",
    "vroid-nu1",
    "vroid-nu3"
   ]
  }
 },
 "SeqBrkHeadSpin": {
  "bpm": 144,
  "beat": 0.41667,
  "phase": 0.0428,
  "loop": 3.3333,
  "beats": 8,
  "grid": "eighth",
  "energy": 7.155,
  "floor": true,
  "stance": {
   "feet": [
    [
     0.217,
     -0.005
    ],
    [
     -0.44,
     -0.132
    ]
   ],
   "hipYaw": 176.8,
   "chestYaw": 179.6,
   "lift": 0.006,
   "reach": 0.483,
   "kick": 1.258,
   "handGap": 0.462
  },
  "maxRate": {
   "nam1": 1.2
  },
  "rigs": [
   "nam1"
  ]
 },
 "SeqMacarena": {
  "bpm": 146.94,
  "beat": 0.40833,
  "phase": 0.2263,
  "loop": 1.6333,
  "beats": 4,
  "grid": "beat",
  "energy": 0.777,
  "stance": {
   "feet": [
    [
     0.174,
     -0.073
    ],
    [
     -0.201,
     -0.034
    ]
   ],
   "hipYaw": 35.8,
   "chestYaw": 34,
   "lift": 0.35,
   "reach": 0.225,
   "kick": 0.022,
   "handGap": 0.422
  },
  "maxRate": {
   "nam1": 1.2
  },
  "rigs": [
   "nam1"
  ]
 },
 "SeqSilly": {
  "bpm": 118.03,
  "beat": 0.50833,
  "phase": 0.0365,
  "loop": 2.0333,
  "beats": 4,
  "grid": "none",
  "energy": 0.808,
  "stance": {
   "feet": [
    [
     0.166,
     0.004
    ],
    [
     -0.383,
     -0.124
    ]
   ],
   "hipYaw": 24.2,
   "chestYaw": 30.9,
   "lift": 0.104,
   "reach": 0.409,
   "kick": 0.013,
   "handGap": 0.128
  },
  "maxRate": {
   "nam1": 1.2
  },
  "rigs": [
   "nam1"
  ]
 },
 "SeqSalsa3": {
  "bpm": 105.88,
  "beat": 0.56667,
  "phase": 0.1402,
  "loop": 2.2667,
  "beats": 4,
  "grid": "eighth",
  "energy": 1.365,
  "stance": {
   "feet": [
    [
     -0.175,
     0.004
    ],
    [
     -0.7,
     -0.044
    ]
   ],
   "hipYaw": 13.5,
   "chestYaw": 12.7,
   "lift": 0.058,
   "reach": 0.77,
   "kick": 0.061,
   "handGap": 0.197
  },
  "maxRate": {
   "nam1": 1.2
  },
  "rigs": [
   "nam1"
  ],
  "fails": {
   "nam1": [
    "vroid-nam2"
   ]
  }
 },
 "SeqSamba3": {
  "bpm": 145.45,
  "beat": 0.4125,
  "phase": 0.085,
  "loop": 3.3,
  "beats": 8,
  "grid": "eighth",
  "energy": 0.946,
  "stance": {
   "feet": [
    [
     0.238,
     -0.198
    ],
    [
     -0.091,
     -0.077
    ]
   ],
   "hipYaw": 16,
   "chestYaw": 22.8,
   "lift": 0.133,
   "reach": 0.318,
   "kick": 0.037,
   "handGap": 0.129
  },
  "maxRate": {
   "nam1": 1.2
  },
  "rigs": [
   "nam1"
  ]
 },
 "SeqJazz4": {
  "bpm": 106.67,
  "beat": 0.5625,
  "phase": 0.3833,
  "loop": 4.5,
  "beats": 8,
  "grid": "eighth",
  "energy": 1.888,
  "stance": {
   "feet": [
    [
     0.118,
     0.002
    ],
    [
     0.096,
     0.004
    ]
   ],
   "hipYaw": 19.5,
   "chestYaw": 24.8,
   "lift": 0.155,
   "reach": 0.399,
   "kick": 0.48,
   "handGap": 0.568
  },
  "maxRate": {
   "nam1": 1.1
  },
  "rigs": [
   "nam1"
  ],
  "fails": {
   "nam1": [
    "vroid-nam3"
   ]
  }
 },
 "SeqSwing2": {
  "bpm": 92.31,
  "beat": 0.65,
  "phase": 0.0831,
  "loop": 5.2,
  "beats": 8,
  "grid": "eighth",
  "energy": 2.307,
  "stance": {
   "feet": [
    [
     0.107,
     -0.57
    ],
    [
     -0.061,
     -0.361
    ]
   ],
   "hipYaw": 178.5,
   "chestYaw": 178.7,
   "lift": 0.191,
   "reach": 1.245,
   "kick": 0.845,
   "handGap": 0.43
  },
  "maxRate": {
   "nam1": 1.2
  },
  "rigs": [
   "nam1"
  ]
 },
 "SeqSwing4": {
  "bpm": 97.3,
  "beat": 0.61667,
  "phase": 0.4504,
  "loop": 2.4667,
  "beats": 4,
  "grid": "eighth",
  "energy": 2.642,
  "stance": {
   "feet": [
    [
     0.549,
     0.443
    ],
    [
     -0.112,
     0.027
    ]
   ],
   "hipYaw": 11.9,
   "chestYaw": 25.3,
   "lift": 0.198,
   "reach": 0.966,
   "kick": 0.838,
   "handGap": 0.348
  },
  "maxRate": {
   "nam1": 1.2
  },
  "rigs": [
   "nam1"
  ]
 },
 "SeqNsFloorSpin": {
  "bpm": 160,
  "beat": 0.375,
  "phase": 0.054,
  "loop": 6,
  "beats": 16,
  "grid": "eighth",
  "energy": 2.171,
  "floor": true,
  "stance": {
   "feet": [
    [
     -0.269,
     -0.433
    ],
    [
     -0.086,
     -0.065
    ]
   ],
   "hipYaw": 179.2,
   "chestYaw": 179.6,
   "lift": 0.507,
   "reach": 0.815,
   "kick": 0.416,
   "handGap": 0.318
  },
  "maxRate": {
   "nam1": 1.2
  },
  "rigs": [
   "nam1"
  ]
 }
});
