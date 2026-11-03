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
}
