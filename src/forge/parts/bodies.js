import { SIDES, sl } from './shared.js'

// ── Bodies ────────────────────────────────────────────────────────────────────────────

const bodyFrame =
  (w = 0.62, h = 0.62, d = 0.4) =>
  (s, f) => {
    f.BW = w * s.width
    f.BH = h * s.height
    f.BD = d * (0.85 + 0.15 * s.width)
  }

function belt(k, f, colour = 'wood') {
  k.box(colour, 'body', [0, 0.09, 0], [f.BW + 0.03, 0.09, f.BD + 0.03], { round: 0.03 })
  k.box('trim', 'body', [0, 0.09, f.BD / 2 + 0.02], [0.11, 0.09, 0.03], { round: 0.01 })
}

export const BODIES = [
  {
    id: 'tunic',
    name: 'Tunic',
    emoji: '👕',
    shape: [sl('width', 'Wide'), sl('height', 'Tall'), sl('belly', 'Belly', 0, 1.6, 0)],
    frame: bodyFrame(),
    build(k, s, f) {
      k.box('outfit', 'body', [0, f.BH / 2, 0], [f.BW, f.BH, f.BD], { round: 0.12 })
      if (s.belly > 0.05) k.ball('outfit', 'body', [0, f.BH * 0.36, f.BD * 0.22], f.BD * 0.42 * s.belly, { scale: [1.15, 1, 0.9] })
      k.tube('trim', 'body', [0, f.BH - 0.01, 0], f.BD * 0.42, 0.05)
      belt(k, f)
    },
  },
  {
    id: 'armor',
    name: 'Plate armor',
    emoji: '🛡️',
    shape: [sl('width', 'Wide'), sl('height', 'Tall'), sl('shoulders', 'Shoulder pads', 0, 2)],
    frame: bodyFrame(0.64),
    build(k, s, f) {
      k.box('metal', 'body', [0, f.BH / 2, 0], [f.BW, f.BH, f.BD], { round: 0.1 })
      k.ball('metal', 'body', [0, f.BH * 0.6, f.BD * 0.12], f.BW * 0.44, { scale: [1, 0.85, 0.6] })
      k.ball('trim', 'body', [0, f.BH * 0.64, f.BD * 0.12 + f.BW * 0.26], 0.055, { scale: [1, 1, 0.5] })
      k.cone('outfit', 'body', [0, -0.05, 0], f.BW * 0.58, 0.22, { tip: f.BW * 0.5 })
      belt(k, f)
      if (s.shoulders > 0.05) for (const [, x] of SIDES) k.ball('metal', 'body', [x * (f.BW / 2 + 0.03), f.BH - 0.04, 0], 0.15 * s.shoulders, { half: true, scale: [1.15, 0.8, 1.1] })
    },
  },
  {
    id: 'robe',
    name: 'Robe',
    emoji: '🧙',
    shape: [sl('width', 'Wide'), sl('height', 'Tall'), sl('flare', 'Flare', 0.7, 1.8)],
    frame: bodyFrame(0.6),
    build(k, s, f) {
      k.box('outfit', 'body', [0, f.BH / 2, 0], [f.BW, f.BH, f.BD], { round: 0.12 })
      const top = 0.12
      const bottom = -(f.LL + f.foot) + 0.04
      k.cone('outfit', 'body', [0, (top + bottom) / 2, 0], f.BW * 0.62 * s.flare, top - bottom, { tip: f.BW * 0.5, sides: 16 })
      k.box('trim', 'body', [0, f.BH * 0.55, f.BD / 2], [0.09, f.BH * 0.9, 0.02], { round: 0.01 })
      k.tube('trim', 'body', [0, 0.1, 0], f.BW * 0.53, 0.05, { sides: 16 })
      k.ball('magic', 'body', [0, f.BH * 0.78, f.BD / 2 + 0.02], 0.045)
    },
  },
  {
    id: 'brute',
    name: 'Brute',
    emoji: '💪',
    shape: [sl('width', 'Wide'), sl('height', 'Tall'), sl('muscles', 'Muscles', 0.4, 2)],
    frame: bodyFrame(0.78, 0.62, 0.46),
    build(k, s, f) {
      k.box('skin', 'body', [0, f.BH / 2, 0], [f.BW, f.BH, f.BD], { round: 0.14 })
      for (const [, x] of SIDES) k.ball('skin', 'body', [x * f.BW * 0.21, f.BH * 0.68, f.BD * 0.32], 0.13 * s.muscles, { scale: [1.15, 0.8, 0.7] })
      k.limb('wood', 'body', [f.BW * 0.44, f.BH * 0.98, f.BD * 0.5], [-f.BW * 0.44, 0.14, f.BD * 0.5], 0.035)
      k.box('wood', 'body', [0, -0.08, f.BD / 2 - 0.02], [f.BW * 0.5, 0.26, 0.05], { round: 0.02 })
      belt(k, f)
    },
  },
  {
    id: 'leather',
    name: 'Leather vest',
    emoji: '🦺',
    shape: [sl('width', 'Wide'), sl('height', 'Tall'), sl('pouch', 'Pouch', 0, 2)],
    frame: bodyFrame(0.6),
    build(k, s, f) {
      k.box('outfit', 'body', [0, f.BH / 2, 0], [f.BW, f.BH, f.BD], { round: 0.12 })
      for (const [, x] of SIDES) k.box('wood', 'body', [x * f.BW * 0.27, f.BH * 0.52, f.BD / 2 - 0.005], [f.BW * 0.38, f.BH * 0.92, 0.04], { round: 0.02 })
      k.limb('trim', 'body', [f.BW * 0.42, f.BH * 0.96, f.BD * 0.56], [-f.BW * 0.4, 0.16, f.BD * 0.56], 0.025)
      belt(k, f)
      if (s.pouch > 0.05) k.box('wood', 'body', [-f.BW * 0.32, 0.03, f.BD / 2 + 0.05], [0.13 * s.pouch, 0.13 * s.pouch, 0.08], { round: 0.03 })
    },
  },
  {
    id: 'scales',
    name: 'Scaly',
    emoji: '🦎',
    shape: [sl('width', 'Wide'), sl('height', 'Tall'), sl('belly', 'Belly plates', 0.5, 1.6)],
    frame: bodyFrame(0.62),
    build(k, s, f) {
      k.box('skin', 'body', [0, f.BH / 2, 0], [f.BW, f.BH, f.BD], { round: 0.14 })
      for (let i = 0; i < 4; i++) k.box('trim', 'body', [0, f.BH * (0.16 + i * 0.21), f.BD / 2], [f.BW * 0.5 * s.belly, f.BH * 0.16, 0.04], { round: 0.03 })
    },
  },
  {
    id: 'tabard',
    name: 'Knight tabard',
    emoji: '🏰',
    shape: [sl('width', 'Wide'), sl('height', 'Tall'), sl('long', 'Long', 0.5, 1.6)],
    frame: bodyFrame(0.62),
    build(k, s, f) {
      k.box('metal', 'body', [0, f.BH / 2, 0], [f.BW, f.BH, f.BD], { round: 0.12 })
      const h = f.BH * 0.75 + 0.2 * s.long
      for (const z of [1, -1]) k.box('outfit', 'body', [0, f.BH * 0.85 - h / 2, z * (f.BD / 2 + 0.01)], [f.BW * 0.62, h, 0.03], { round: 0.01 })
      k.box('trim', 'body', [0, f.BH * 0.55, f.BD / 2 + 0.03], [0.06, f.BH * 0.4, 0.01], { round: 0.004 })
      k.box('trim', 'body', [0, f.BH * 0.62, f.BD / 2 + 0.03], [f.BW * 0.3, 0.06, 0.01], { round: 0.004 })
      belt(k, f)
    },
  },
  {
    id: 'pirate-coat',
    name: 'Long coat',
    emoji: '🏴‍☠️',
    shape: [sl('width', 'Wide'), sl('height', 'Tall'), sl('coat', 'Coat tails', 0.3, 1.3, 0.9)],
    frame: bodyFrame(0.62),
    build(k, s, f) {
      k.box('outfit', 'body', [0, f.BH / 2, 0], [f.BW, f.BH, f.BD], { round: 0.12 })
      const len = (f.LL + f.foot) * s.coat
      const r = f.BD / 2 + 0.03
      k.cone('outfit', 'body', [0, 0.1 - len / 2, 0], r * 1.5, len, { tip: r * 1.02, open: true, theta: [Math.PI * 0.35, Math.PI * 1.3], scale: [(f.BW / f.BD) * 0.85, 1, 1], sides: 16 })
      for (const [, x] of SIDES) k.box('trim', 'body', [x * f.BW * 0.16, f.BH * 0.62, f.BD / 2 + 0.01], [0.06, f.BH * 0.75, 0.02], { rot: [0, 0, x * -10], round: 0.005 })
      for (let i = 0; i < 3; i++) k.ball('metal', 'body', [0, f.BH * (0.3 + i * 0.2), f.BD / 2 + 0.015], 0.025)
      belt(k, f)
    },
  },
]
