// The Hero Builder figures' moves: [seconds, { joint: [forward°, turn°, side°] , bob }].
// Joints not named stand straight. Kept close to the chibi figures' moves in make-monsters.py.
export const MOVES = {
  Idle: {
    loop: true,
    frames: [
      [0, {}],
      [1, { body: [3, 0, 0], head: [-3, 3, 0], 'arm.L': [0, 0, 4], 'arm.R': [0, 0, -4], tail: [0, 10, 0], bob: -0.02 }],
      [2, {}],
    ],
  },
  Walk: {
    loop: true,
    frames: [
      [0, { 'leg.L': [28, 0, 0], 'leg.R': [-28, 0, 0], 'arm.L': [-22, 0, 0], 'arm.R': [22, 0, 0], body: [6, -6, 0], tail: [0, 15, 0] }],
      [0.2, { body: [6, 0, 0], bob: 0.05 }],
      [0.4, { 'leg.L': [-28, 0, 0], 'leg.R': [28, 0, 0], 'arm.L': [22, 0, 0], 'arm.R': [-22, 0, 0], body: [6, 6, 0], tail: [0, -15, 0] }],
      [0.6, { body: [6, 0, 0], bob: 0.05 }],
      [0.8, { 'leg.L': [28, 0, 0], 'leg.R': [-28, 0, 0], 'arm.L': [-22, 0, 0], 'arm.R': [22, 0, 0], body: [6, -6, 0], tail: [0, 15, 0] }],
    ],
  },
  Swing: {
    frames: [
      [0, {}],
      [0.33, { 'arm.R': [170, 0, -10], body: [-12, 20, 0], head: [-8, -10, 0], 'arm.L': [-20, 0, 0] }],
      [0.5, { 'arm.R': [40, 0, 0], body: [20, -15, 0], head: [6, 8, 0], 'arm.L': [15, 0, 0], bob: -0.05 }],
      [0.73, { 'arm.R': [30, 0, 0], body: [16, -10, 0], bob: -0.04 }],
      [1.13, {}],
    ],
  },
  // A staff's attack, instead of Swing: both hands up over the head, then a bonk down in front.
  // The wrist (hand.R) turns so the pole swings over the top instead of pointing back.
  Bonk: {
    frames: [
      [0, {}],
      [0.35, { 'arm.R': [165, 0, -5], 'hand.R': [-105, 0, 0], 'arm.L': [160, 0, -25], body: [-14, 0, 0], head: [-10, 0, 0] }],
      [0.52, { 'arm.R': [75, 0, 5], 'hand.R': [-182, 0, 0], 'arm.L': [70, 0, -30], body: [22, 0, 0], head: [8, 0, 0], bob: -0.06 }],
      [0.75, { 'arm.R': [65, 0, 5], 'hand.R': [-172, 0, 0], 'arm.L': [60, 0, -30], body: [18, 0, 0], bob: -0.05 }],
      [1.2, {}],
    ],
  },
  // A spear's attack: pull back, then a straight jab forward.
  Thrust: {
    frames: [
      [0, {}],
      [0.3, { 'arm.R': [10, 0, -10], 'hand.R': [-100, 0, 0], body: [-6, 25, 0], head: [0, -20, 0], 'arm.L': [40, 0, 10] }],
      [0.45, { 'arm.R': [88, 0, 0], 'hand.R': [-178, 0, 0], body: [16, -20, 0], head: [0, 15, 0], 'arm.L': [-10, 0, 0], 'leg.L': [-20, 0, 0], 'leg.R': [15, 0, 0], bob: -0.04 }],
      [0.7, { 'arm.R': [85, 0, 0], 'hand.R': [-175, 0, 0], body: [12, -15, 0], head: [0, 12, 0], bob: -0.03 }],
      [1.1, {}],
    ],
  },
  Magic: {
    frames: [
      [0, {}],
      [0.33, { 'arm.R': [150, 0, -15], 'arm.L': [40, 0, 30], body: [-14, -10, 0], head: [-14, 0, 0] }],
      [0.53, { 'arm.R': [95, 0, 0], 'arm.L': [60, 0, 10], body: [14, 10, 0], head: [6, 0, 0], bob: -0.05 }],
      [0.8, { 'arm.R': [85, 0, 0], 'arm.L': [50, 0, 10], body: [10, 8, 0], bob: -0.04 }],
      [1.27, {}],
    ],
  },
  Cheer: {
    frames: [
      [0, {}],
      [0.3, { 'arm.L': [170, 0, 20], 'arm.R': [170, 0, -20], head: [-12, 0, 0], body: [-6, 0, 0], bob: 0.12 }],
      [0.5, { 'arm.L': [160, 0, 30], 'arm.R': [160, 0, -30], head: [-12, 0, 0], bob: 0 }],
      [0.7, { 'arm.L': [170, 0, 20], 'arm.R': [170, 0, -20], head: [-12, 0, 0], bob: 0.12 }],
      [1.2, {}],
    ],
  },
  Shoot: {
    frames: [
      [0, {}],
      [0.3, { 'arm.R': [85, 0, 0], 'arm.L': [80, 0, 10], body: [-4, -20, 0], head: [0, 15, 0] }],
      [0.55, { 'arm.R': [80, 0, 0], 'arm.L': [95, 0, 5], body: [-6, -20, 0], head: [0, 15, 0] }],
      [0.65, { 'arm.R': [90, 0, 0], 'arm.L': [80, 0, 10], body: [4, -15, 0], head: [0, 12, 0] }],
      [1.1, {}],
    ],
  },
  Throw: {
    frames: [
      [0, {}],
      [0.3, { 'arm.R': [150, 0, -20], body: [-10, 25, 0], 'arm.L': [30, 0, 10] }],
      [0.48, { 'arm.R': [60, 0, 0], body: [18, -15, 0], 'arm.L': [-10, 0, 0], bob: -0.04 }],
      [1.0, {}],
    ],
  },
  Hit: {
    frames: [
      [0, {}],
      [0.12, { body: [-18, 8, 0], head: [-15, 0, 0], 'arm.L': [-20, 0, 25], 'arm.R': [-20, 0, -25], bob: -0.03 }],
      [0.6, {}],
    ],
  },
  Dodge: {
    frames: [
      [0, {}],
      [0.2, { hips: [0, 0, 18], body: [0, 0, -10], 'leg.R': [0, 0, -20], 'arm.L': [0, 0, 40], bob: -0.05 }],
      [0.7, {}],
    ],
  },
  Fall: {
    frames: [
      [0, {}],
      [0.25, { hips: [-20, 0, 0], body: [10, 0, 0], 'arm.L': [60, 0, 30], 'arm.R': [60, 0, -30], bob: -0.05 }],
      [0.8, { hips: [-88, 0, 0], head: [10, 0, 0], 'arm.L': [10, 0, 50], 'arm.R': [10, 0, -50], 'leg.L': [20, 0, 0], 'leg.R': [10, 0, 0], bob: -0.45 }],
    ],
  },
  Down: {
    loop: true,
    frames: [
      [0, { hips: [-88, 0, 0], head: [10, 0, 0], 'arm.L': [10, 0, 50], 'arm.R': [10, 0, -50], 'leg.L': [20, 0, 0], 'leg.R': [10, 0, 0], bob: -0.45 }],
      [1, { hips: [-88, 0, 0], head: [10, 0, 0], 'arm.L': [10, 0, 50], 'arm.R': [10, 0, -50], 'leg.L': [20, 0, 0], 'leg.R': [10, 0, 0], bob: -0.45 }],
    ],
  },
}

// The names the 3D board's figures use for each move (figureModels.js), so a Hero Builder
// figure plays the same moves as the other figures.
export const BOARD_MOVES = {
  Idle: 'Idle',
  Walk: 'Walking_A',
  Swing: '1H_Melee_Attack_Chop',
  Magic: 'Spellcast_Shoot',
  Shoot: '1H_Ranged_Shoot',
  Throw: 'Throw',
  Hit: 'Hit_A',
  Dodge: 'Dodge_Right',
  Fall: 'Death_A',
  Down: 'Death_A_Pose',
  Cheer: 'Cheer',
}
