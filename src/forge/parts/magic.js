import { FIRE, FIRE_CORE, sl } from './shared.js'

// ── Magic (all around the figure, from the floor up) ──────────────────────────────────

const heightOf = (f) => f.LL + f.foot + f.BH + f.HS
const around = (n, r, y = 0, turn = 0) => [...Array(n)].map((_, i) => {
  const a = (i / n) * Math.PI * 2 + turn
  return [Math.sin(a) * r, y, Math.cos(a) * r]
})

export const EFFECTS = [
  {
    id: 'fire-aura',
    name: 'Fire',
    emoji: '🔥',
    shape: [sl('size', 'Wide', 0.6, 1.6), sl('height', 'Tall', 0.4, 2.5)],
    build(k, s) {
      for (const [x, , z] of around(9, 0.42 * s.size)) {
        const h = 0.22 * s.height * (0.8 + 0.4 * Math.abs(Math.sin(x * 9 + z * 7)))
        k.cone(FIRE, 'fx', [x, h / 2, z], 0.07, h, { sides: 6, opacity: 0.85 })
        k.cone(FIRE_CORE, 'fx', [x, h * 0.3, z], 0.04, h * 0.6, { sides: 5, opacity: 0.9 })
      }
    },
  },
  {
    id: 'sparkles',
    name: 'Sparkles',
    emoji: '✨',
    shape: [sl('size', 'Wide', 0.6, 1.6), sl('count', 'How many', 6, 24, 12)],
    build(k, s, f) {
      const n = Math.round(s.count)
      const H = heightOf(f)
      for (let i = 0; i < n; i++) {
        const a = i * 2.4
        const r = 0.42 * s.size * (0.85 + 0.3 * ((i * 7) % 5) / 5)
        k.ball('magic', 'fx', [Math.sin(a) * r, 0.15 + ((i * 0.618) % 1) * H, Math.cos(a) * r], 0.025 + 0.015 * (i % 3), { seg: 8, rings: 6 })
      }
    },
  },
  {
    id: 'frost',
    name: 'Frost',
    emoji: '❄️',
    shape: [sl('size', 'Wide', 0.6, 1.6), sl('height', 'Big ice', 0.4, 2.2)],
    build(k, s) {
      for (const [i, [x, , z]] of around(7, 0.4 * s.size, 0, 0.3).entries()) {
        const h = 0.16 * s.height * (0.7 + 0.15 * (i % 3))
        k.cone('glow:#7dd3fc', 'fx', [x, h / 2 - 0.02, z], 0.05, h, { sides: 5, opacity: 0.75 })
        k.cone('glow:#e0f2fe', 'fx', [x * 1.15, h * 0.3, z * 1.15], 0.03, h * 0.6, { sides: 4, opacity: 0.8 })
      }
      k.ring('glow:#bae6fd', 'fx', [0, 0.01, 0], 0.4 * s.size, 0.02, { rot: [90, 0, 0], sides: 32, opacity: 0.7 })
    },
  },
  {
    id: 'shadow',
    name: 'Shadow smoke',
    emoji: '🌑',
    shape: [sl('size', 'Wide', 0.6, 1.6), sl('height', 'Tall', 0.4, 2)],
    build(k, s) {
      for (const [i, [x, , z]] of around(10, 0.36 * s.size).entries()) {
        const y = 0.08 + (i % 3) * 0.12 * s.height
        k.ball('#3b0764', 'fx', [x, y, z], 0.12 + 0.04 * (i % 2), { opacity: 0.4, seg: 10, rings: 8 })
      }
      k.ball('magic', 'fx', [0, 0.02, 0], 0.5 * s.size, { scale: [1, 0.06, 1], opacity: 0.25 })
    },
  },
  {
    id: 'lightning',
    name: 'Lightning',
    emoji: '⚡',
    shape: [sl('size', 'Wide', 0.6, 1.6), sl('count', 'Bolts', 2, 6, 3)],
    build(k, s, f) {
      const H = heightOf(f)
      const bolt = [
        [0.02, 1],
        [0.08, 1],
        [0.03, 0.6],
        [0.09, 0.6],
        [-0.04, 0],
        [0, 0.48],
        [-0.06, 0.48],
      ].map(([x, y]) => [x * 1.6, y * H * 0.55])
      for (const [x, , z] of around(Math.round(s.count), 0.48 * s.size, 0, 0.5)) {
        k.flat('glow:#facc15', 'fx', [x, H * 0.3, z], bolt, 0.02, { rot: [0, (Math.atan2(x, z) * 180) / Math.PI, 0] })
      }
    },
  },
  {
    id: 'magic-ring',
    name: 'Magic circle',
    emoji: '🔮',
    shape: [sl('size', 'Wide', 0.6, 1.6), sl('glow', 'Glow', 0.2, 2)],
    build(k, s, f) {
      const r = 0.5 * s.size
      k.ring('magic', 'fx', [0, 0.015, 0], r, 0.02, { rot: [90, 0, 0], sides: 40 })
      k.ring('magic', 'fx', [0, 0.015, 0], r * 0.78, 0.012, { rot: [90, 0, 0], sides: 40 })
      for (const [x, , z] of around(6, r * 0.89)) k.ball('magic', 'fx', [x, 0.02, z], 0.03, { scale: [1, 0.4, 1] })
      k.tube('magic', 'fx', [0, heightOf(f) * 0.35, 0], r * 0.95, heightOf(f) * 0.7, { open: true, sides: 24, opacity: 0.12 * s.glow, tip: r * 0.7 })
    },
  },
]
