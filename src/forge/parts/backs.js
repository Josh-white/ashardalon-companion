import { SIDES, scale, sl } from './shared.js'

// ── On the back ───────────────────────────────────────────────────────────────────────

const BAT_WING = [
  [0, 0.02],
  [0.25, 0.26],
  [0.55, 0.34],
  [0.72, 0.2],
  [0.64, 0.02],
  [0.52, -0.08],
  [0.44, 0.02],
  [0.32, -0.13],
  [0.22, -0.02],
  [0.08, -0.16],
  [0, -0.06],
]
const FEATHER_WING = [
  [0, 0.04],
  [0.2, 0.2],
  [0.45, 0.32],
  [0.7, 0.38],
  [0.8, 0.32],
  [0.72, 0.2],
  [0.75, 0.08],
  [0.62, 0.02],
  [0.62, -0.1],
  [0.5, -0.1],
  [0.47, -0.24],
  [0.34, -0.18],
  [0.3, -0.32],
  [0.18, -0.22],
  [0.12, -0.3],
  [0.02, -0.12],
]

function wings(k, s, f, shape, colour) {
  for (const [, x] of SIDES) {
    const pts = scale(shape, s.span).map(([px, py]) => [px * x, py])
    k.flat(colour, 'back', [x * 0.06, 0.02, -0.04], pts, 0.03, { rot: [0, x * -30, x * 25 * (s.raise - 1)] })
  }
}

export const BACKS = [
  {
    id: 'cape',
    name: 'Cape',
    emoji: '🦸',
    shape: [sl('length', 'Long', 0.3, 1.1), sl('flare', 'Swish', 0.7, 1.8)],
    build(k, s, f) {
      const top = 0.06
      const len = (f.BH * 0.78 + f.LL + f.foot - 0.05) * s.length
      const r = f.BD / 2 + 0.05
      k.cone('outfit', 'back', [0, top - len / 2, f.BD / 2], r * 1.55 * s.flare, len, {
        tip: r,
        open: true,
        theta: [Math.PI / 2, Math.PI],
        scale: [(f.BW / f.BD) * 0.8, 1, 1],
        sides: 16,
      })
      for (const [, x] of SIDES) k.ball('trim', 'back', [x * f.BW * 0.42, top, f.BD * 0.85], 0.05)
    },
  },
  {
    id: 'bat-wings',
    name: 'Dragon wings',
    emoji: '🦇',
    shape: [sl('span', 'Span', 0.5, 2), sl('raise', 'Up', 0, 2)],
    build: (k, s, f) => wings(k, s, f, BAT_WING, 'skin'),
  },
  {
    id: 'feather-wings',
    name: 'Feather wings',
    emoji: '🪽',
    shape: [sl('span', 'Span', 0.5, 2), sl('raise', 'Up', 0, 2)],
    build: (k, s, f) => wings(k, s, f, FEATHER_WING, 'trim'),
  },
  {
    id: 'quiver',
    name: 'Quiver',
    emoji: '🏹',
    shape: [sl('arrows', 'Arrows', 1, 6, 3)],
    build(k, s) {
      const q = k.group('back', [0, -0.1, -0.08], [0, 0, -25])
      k.tube('wood', q, [0, 0, 0], 0.08, 0.45)
      k.tube('trim', q, [0, 0.2, 0], 0.085, 0.04)
      const n = Math.round(s.arrows)
      for (let i = 0; i < n; i++) {
        const x = (i - (n - 1) / 2) * 0.03
        k.tube('wood', q, [x, 0.3, (i % 2) * 0.03 - 0.015], 0.008, 0.2, { sides: 4 })
        k.cone('#dc2626', q, [x, 0.39, (i % 2) * 0.03 - 0.015], 0.025, 0.06, { sides: 3 })
      }
    },
  },
  {
    id: 'backpack',
    name: 'Backpack',
    emoji: '🎒',
    shape: [sl('size', 'Size', 0.6, 1.6)],
    build(k, s, f) {
      const d = 0.2 * s.size
      k.box('wood', 'back', [0, -f.BH * 0.3, -d / 2], [f.BW * 0.7 * s.size, f.BH * 0.65 * s.size, d], { round: 0.05 })
      k.tube('outfit', 'back', [0, -f.BH * 0.3 + f.BH * 0.35 * s.size, -d / 2], 0.07 * s.size, f.BW * 0.8 * s.size, { rot: [0, 0, 90] })
      k.box('trim', 'back', [0, -f.BH * 0.4, -d - 0.005], [f.BW * 0.35 * s.size, 0.12 * s.size, 0.02], { round: 0.01 })
    },
  },
  {
    id: 'back-spikes',
    name: 'Back spikes',
    emoji: '🦕',
    shape: [sl('size', 'Size', 0.4, 2), sl('count', 'Spikes', 2, 6, 4)],
    build(k, s, f) {
      const n = Math.round(s.count)
      for (let i = 0; i < n; i++) {
        const y = 0.08 - (i / Math.max(1, n - 1)) * (f.BH * 0.8)
        k.cone('trim', 'back', [0, y, -0.02], 0.1 * s.size, 0.26 * s.size, { rot: [-65, 0, 0], sides: 6, scale: [0.45, 1, 1] })
      }
    },
  },
  {
    id: 'turtle-shell',
    name: 'Turtle shell',
    emoji: '🐢',
    shape: [sl('size', 'Size', 0.6, 1.5)],
    build(k, s, f) {
      const r = f.BW * 0.55 * s.size
      const at = [0, -f.BH * 0.35, -0.02]
      k.ball('wood', 'back', at, r, { half: true, rot: [-90, 0, 0], scale: [1.05, 1.25, 0.8] })
      for (const [x, y] of [[0, 0], [0.45, 0.35], [-0.45, 0.35], [0.45, -0.35], [-0.45, -0.35], [0, 0.65], [0, -0.65]]) {
        const p = [at[0] + x * r, at[1] + y * r * 1.1, at[2] - r * 0.8 * Math.sqrt(Math.max(0.15, 1 - x * x - y * y * 0.8))]
        k.ball('trim', 'back', p, r * 0.22, { scale: [1, 1, 0.35], seg: 6, rings: 4 })
      }
    },
  },
  {
    id: 'fairy-wings',
    name: 'Fairy wings',
    emoji: '🧚',
    shape: [sl('span', 'Span', 0.5, 2), sl('raise', 'Up', 0, 2)],
    build(k, s) {
      const top = [
        [0, 0],
        [0.15, 0.2],
        [0.35, 0.38],
        [0.5, 0.4],
        [0.52, 0.28],
        [0.4, 0.12],
        [0.15, 0.0],
      ]
      const low = [
        [0, -0.02],
        [0.2, -0.08],
        [0.32, -0.2],
        [0.3, -0.3],
        [0.18, -0.26],
        [0.06, -0.12],
      ]
      for (const [, x] of SIDES) {
        for (const shape of [top, low]) {
          const pts = scale(shape, s.span).map(([px, py]) => [px * x, py])
          k.flat('magic', 'back', [x * 0.04, 0.02, -0.04], pts, 0.01, { rot: [0, x * -25, x * 20 * (s.raise - 1)], opacity: 0.45 })
        }
      }
    },
  },
]
