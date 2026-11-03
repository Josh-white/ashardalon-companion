import { DARK, SIDES, along, sl } from './shared.js'

// ── Faces (on the head: beards, masks, goggles) ───────────────────────────────────────

export const FACES = [
  {
    id: 'beard',
    name: 'Beard',
    emoji: '🧔',
    shape: [sl('size', 'Bushy', 0.6, 1.6), sl('length', 'Long', 0, 2.5, 0.6)],
    build(k, s, f) {
      const c = f.HC
      const r = f.HR
      k.ball('hair', 'head', [0, c - r * 0.45, r * 0.42], r * 0.62 * s.size, { scale: [1.05, 0.9, 0.75] })
      if (s.length > 0.05) k.cone('hair', 'head', [0, c - r * 0.95 - 0.08 * s.length, r * 0.45], r * 0.55 * s.size, 0.18 * s.length, { rot: [180, 0, 0], scale: [1, 1, 0.6] })
      k.ball('hair', 'head', [0, c - r * 0.22, r * 0.9], r * 0.18 * s.size, { scale: [1.8, 0.6, 0.7] })
    },
  },
  {
    id: 'mustache',
    name: 'Mustache',
    emoji: '👨',
    shape: [sl('size', 'Size', 0.6, 2), sl('curl', 'Curly', 0, 2)],
    build(k, s, f) {
      const c = f.HC
      const r = f.HR
      for (const [, x] of SIDES) {
        k.ball('hair', 'head', [x * r * 0.17, c - r * 0.27, r * 0.95], 0.035 * s.size, { scale: [2, 0.8, 0.8], rot: [0, 0, x * -12] })
        if (s.curl > 0.05) k.ball('hair', 'head', [x * (r * 0.33 + 0.03 * s.size), c - r * 0.2 + 0.02 * s.curl, r * 0.88], 0.022 * s.size * (0.6 + 0.4 * s.curl))
      }
    },
  },
  {
    id: 'eye-patch',
    name: 'Eye patch',
    emoji: '🏴‍☠️',
    shape: [sl('size', 'Size', 0.6, 1.6)],
    build(k, s, f) {
      const c = f.HC
      const r = f.HR
      k.ball(DARK, 'head', [-r * 0.36, c + r * 0.08, r * 0.9], 0.07 * s.size, { scale: [1, 1, 0.4] })
      k.ring(DARK, 'head', [0, c + r * 0.14, 0], r * 1.01, 0.012, { rot: [90, 0, -14] })
    },
  },
  {
    id: 'bandit-mask',
    name: 'Bandit mask',
    emoji: '🥷',
    shape: [sl('width', 'Wide', 0.6, 1.6)],
    build(k, s, f) {
      const c = f.HC
      const r = f.HR
      k.ring('outfit', 'head', [0, c + r * 0.08, 0], r * 0.98, 0.055 * s.width, { rot: [90, 0, 0], sides: 28 })
      for (const [, x] of SIDES) k.ball('#f4f4f5', 'head', [x * r * 0.36, c + r * 0.1, r * 0.91 + 0.05 * s.width], 0.035, { scale: [1.3, 0.8, 0.5] })
      for (const [, x] of SIDES) k.box('outfit', 'head', [x * 0.05, c + r * 0.0, -r * 1.0], [0.05, 0.16, 0.012], { rot: [-15, 0, x * 20], round: 0.004 })
    },
  },
  {
    id: 'goggles',
    name: 'Goggles',
    emoji: '🥽',
    shape: [sl('size', 'Size', 0.6, 1.6)],
    build(k, s, f) {
      const c = f.HC
      const r = f.HR
      for (const [, x] of SIDES) {
        const at = [x * r * 0.36, c + r * 0.12, r * 0.92]
        k.tube('metal', 'head', at, 0.075 * s.size, 0.06, { rot: [90, 0, 0], sides: 14 })
        k.ball('magic', 'head', along(at, [0, 0, 1], 0.03), 0.06 * s.size, { scale: [1, 1, 0.3], opacity: 0.8 })
      }
      k.ring('wood', 'head', [0, c + r * 0.12, 0], r * 1.0, 0.02, { rot: [90, 0, 0], sides: 28 })
    },
  },
  {
    id: 'scarf',
    name: 'Scarf',
    emoji: '🧣',
    shape: [sl('size', 'Thick', 0.6, 1.6), sl('long', 'Long', 0.3, 2)],
    build(k, s) {
      k.ring('outfit', 'head', [0, 0.04, 0], 0.13, 0.045 * s.size, { rot: [90, 0, 0], sides: 18 })
      k.box('outfit', 'head', [0.08, -0.02 - 0.08 * s.long, 0.12], [0.08 * s.size, 0.16 * s.long, 0.03], { rot: [10, 0, -10], round: 0.01 })
      k.box('trim', 'head', [0.09, -0.02 - 0.15 * s.long, 0.13], [0.085 * s.size, 0.025, 0.035], { rot: [10, 0, -10], round: 0.005 })
    },
  },
]
