import { BONE, SIDES, along, mirror, scale, sl } from './shared.js'

// ── Weapons (main hand) ───────────────────────────────────────────────────────────────

// Long poles stand up in the fist instead of pointing forward (a part's `grip`, figure.js).
const POLE = [12, 0, 10]

export function handle(k, j, from, to, r = 0.035, colour = 'wood') {
  k.tube(colour, j, [0, (from + to) / 2, 0], r, to - from, { sides: 8 })
}

// A straight blade with a cross guard: swords and daggers.
export function blade(k, j, s, { length, width, guard }, colour = 'metal') {
  const L = length * s.length
  const w = width * s.width
  handle(k, j, -0.12, 0.12)
  k.ball('trim', j, [0, -0.14, 0], 0.045)
  k.box('trim', j, [0, 0.13, 0], [guard * s.guard, 0.05, 0.08], { round: 0.02 })
  k.flat(
    colour,
    j,
    [0, 0.15, 0],
    [
      [-w / 2, 0],
      [w / 2, 0],
      [w / 2, L - w * 0.9],
      [0, L],
      [-w / 2, L - w * 0.9],
    ],
    0.035,
  )
}
export const bladeShape = [sl('length', 'Long', 0.5, 1.8), sl('width', 'Wide', 0.5, 2), sl('guard', 'Guard', 0.3, 2)]

const AXE_HEAD = [
  [0.02, -0.08],
  [-0.08, -0.1],
  [-0.2, -0.22],
  [-0.27, -0.12],
  [-0.3, 0],
  [-0.27, 0.12],
  [-0.2, 0.22],
  [-0.08, 0.1],
  [0.02, 0.08],
]
const SCYTHE = [
  [0.02, 0.07],
  [-0.3, 0.07],
  [-0.6, 0.0],
  [-0.85, -0.14],
  [-1.0, -0.34],
  [-0.8, -0.13],
  [-0.55, -0.05],
  [-0.28, -0.03],
  [0.02, -0.05],
]

export const WEAPONS = [
  {
    id: 'sword',
    name: 'Sword',
    emoji: '🗡️',
    shape: bladeShape,
    build: (k, s) => blade(k, 'grip.R', s, { length: 0.7, width: 0.11, guard: 0.3 }),
  },
  {
    id: 'greatsword',
    name: 'Big sword',
    emoji: '⚔️',
    shape: bladeShape,
    build: (k, s) => blade(k, 'grip.R', s, { length: 1.1, width: 0.16, guard: 0.44 }),
  },
  {
    id: 'dagger',
    name: 'Dagger',
    emoji: '🔪',
    shape: bladeShape,
    build: (k, s) => blade(k, 'grip.R', s, { length: 0.32, width: 0.08, guard: 0.18 }),
  },
  {
    id: 'axe',
    name: 'Axe',
    emoji: '🪓',
    shape: [sl('handle', 'Handle', 0.5, 1.8), sl('blade', 'Blade', 0.5, 2)],
    build(k, s) {
      const top = 0.7 * s.handle
      handle(k, 'grip.R', -0.15, top)
      k.flat('metal', 'grip.R', [0, top - 0.1, 0], scale(AXE_HEAD, s.blade), 0.04)
    },
  },
  {
    id: 'battle-axe',
    name: 'Battle axe',
    emoji: '🪓',
    shape: [sl('handle', 'Handle', 0.5, 1.8), sl('blade', 'Blades', 0.5, 2)],
    build(k, s) {
      const top = 0.95 * s.handle
      handle(k, 'grip.R', -0.25, top, 0.04)
      k.flat('metal', 'grip.R', [0, top - 0.13, 0], scale(AXE_HEAD, s.blade * 1.15), 0.045)
      k.flat('metal', 'grip.R', [0, top - 0.13, 0], mirror(scale(AXE_HEAD, s.blade * 1.15)), 0.045)
      k.cone('metal', 'grip.R', [0, top + 0.08, 0], 0.04, 0.16, { sides: 6 })
    },
  },
  {
    id: 'hammer',
    name: 'Hammer',
    emoji: '🔨',
    shape: [sl('handle', 'Handle', 0.5, 1.8), sl('head', 'Head', 0.5, 2.2)],
    build(k, s) {
      const top = 0.75 * s.handle
      handle(k, 'grip.R', -0.15, top)
      k.box('metal', 'grip.R', [0, top, 0], [0.36 * s.head, 0.2 * s.head, 0.2 * s.head], { round: 0.03 })
      k.box('trim', 'grip.R', [0, top, 0], [0.08 * s.head, 0.22 * s.head, 0.22 * s.head], { round: 0.02 })
    },
  },
  {
    id: 'mace',
    name: 'Spiky mace',
    emoji: '🏏',
    shape: [sl('handle', 'Handle', 0.5, 1.8), sl('ball', 'Ball', 0.5, 2), sl('spikes', 'Spikes', 0, 2)],
    build(k, s) {
      const top = 0.6 * s.handle
      handle(k, 'grip.R', -0.15, top)
      const r = 0.11 * s.ball
      const c = [0, top + r * 0.7, 0]
      k.ball('metal', 'grip.R', c, r)
      if (s.spikes < 0.05) return
      const dirs = [
        [1, 0, 0],
        [-1, 0, 0],
        [0, 0, 1],
        [0, 0, -1],
        [0, 1, 0],
        [0.7, 0.7, 0],
        [-0.7, 0.7, 0],
        [0, 0.7, 0.7],
        [0, 0.7, -0.7],
      ]
      for (const n of dirs) k.limb('metal', 'grip.R', along(c, n, r * 0.8), along(c, n, r + 0.08 * s.spikes), 0.03, { tip: 0.002, sides: 6 })
    },
  },
  {
    id: 'spear',
    moves: { Swing: 'Thrust' },
    grip: POLE,
    name: 'Spear',
    emoji: '🔱',
    shape: [sl('length', 'Long', 0.5, 1.8), sl('tip', 'Point', 0.5, 2.2)],
    build(k, s) {
      const top = 0.6 + 0.6 * s.length
      handle(k, 'grip.R', -0.55, top, 0.03)
      k.tube('trim', 'grip.R', [0, top, 0], 0.04, 0.06)
      k.cone('metal', 'grip.R', [0, top + 0.03 + 0.12 * s.tip, 0], 0.06, 0.24 * s.tip, { sides: 4, scale: [1, 1, 0.4] })
    },
  },
  {
    id: 'trident',
    moves: { Swing: 'Thrust' },
    grip: POLE,
    name: 'Trident',
    emoji: '🔱',
    shape: [sl('length', 'Long', 0.5, 1.8), sl('prongs', 'Prongs', 0.5, 2)],
    build(k, s) {
      const top = 0.6 + 0.6 * s.length
      handle(k, 'grip.R', -0.55, top, 0.03)
      const w = 0.12 * s.prongs
      k.box('metal', 'grip.R', [0, top, 0], [w * 2 + 0.05, 0.05, 0.05], { round: 0.02 })
      for (const x of [-w, 0, w]) {
        const h = (x === 0 ? 0.26 : 0.2) * s.prongs
        k.tube('metal', 'grip.R', [x, top + h / 2, 0], 0.022, h, { sides: 6 })
        k.cone('metal', 'grip.R', [x, top + h + 0.04, 0], 0.04, 0.09, { sides: 4 })
      }
    },
  },
  {
    id: 'staff',
    moves: { Swing: 'Bonk' },
    grip: POLE,
    name: 'Magic staff',
    emoji: '🪄',
    shape: [sl('length', 'Long', 0.5, 1.8), sl('orb', 'Orb', 0.4, 2.2)],
    build(k, s) {
      const top = 0.55 + 0.5 * s.length
      handle(k, 'grip.R', -0.55, top, 0.035)
      const r = 0.08 * s.orb
      const c = [0, top + r + 0.02, 0]
      k.ball('magic', 'grip.R', c, r)
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2
        const out = [Math.sin(a) * (r + 0.03), 0, Math.cos(a) * (r + 0.03)]
        k.limb('wood', 'grip.R', [0, top - 0.04, 0], [out[0], c[1] - r * 0.2, out[2]], 0.025, { tip: 0.02 })
        k.limb('wood', 'grip.R', [out[0], c[1] - r * 0.2, out[2]], [out[0] * 0.5, c[1] + r * 0.9, out[2] * 0.5], 0.02, { tip: 0.003 })
      }
    },
  },
  {
    id: 'wand',
    name: 'Wand',
    emoji: '✨',
    shape: [sl('length', 'Long', 0.5, 2), sl('tip', 'Sparkle', 0.4, 2.5)],
    build(k, s) {
      const top = 0.32 * s.length
      handle(k, 'grip.R', -0.08, top, 0.02)
      k.tube('trim', 'grip.R', [0, -0.02, 0], 0.028, 0.1)
      k.ball('magic', 'grip.R', [0, top + 0.03, 0], 0.035 * s.tip)
    },
  },
  {
    id: 'scythe',
    grip: POLE,
    name: 'Scythe',
    emoji: '🌙',
    shape: [sl('length', 'Long', 0.5, 1.8), sl('blade', 'Blade', 0.5, 2)],
    build(k, s) {
      const top = 0.55 + 0.6 * s.length
      handle(k, 'grip.R', -0.5, top, 0.032)
      k.flat('metal', 'grip.R', [0, top - 0.04, 0], scale(SCYTHE, 0.55 * s.blade), 0.03)
      k.ball('trim', 'grip.R', [0, top + 0.03, 0], 0.045)
    },
  },
  {
    id: 'club',
    name: 'Club',
    emoji: '🍗',
    shape: [sl('length', 'Long', 0.5, 1.8), sl('size', 'Fat', 0.5, 2)],
    build(k, s) {
      const top = 0.7 * s.length
      k.cone('wood', 'grip.R', [0, (top - 0.12) / 2, 0], 0.04, top + 0.12, { tip: 0.1 * s.size, sides: 9 })
      k.ball('wood', 'grip.R', [0, top, 0], 0.1 * s.size, { seg: 9, rings: 7 })
      for (const [x, y, z] of [
        [1, 0.75, 0],
        [-1, 0.6, 0.3],
        [0.2, 0.85, -1],
      ])
        k.ball('wood', 'grip.R', [x * 0.08 * s.size, top * y, z * 0.08 * s.size], 0.04 * s.size, { seg: 7, rings: 5 })
    },
  },
  {
    id: 'bow',
    name: 'Bow',
    emoji: '🏹',
    shape: [sl('size', 'Size', 0.6, 1.6), sl('curve', 'Curve', 0.6, 1.4)],
    build(k, s) {
      const R = 0.42 * s.size
      const a = 0.9 / s.curve
      // Held by the middle, bowed out to the side so it shows from the front.
      const bow = k.group('hand.R', [-0.02, 0.06, 0.08], [0, 75, 0])
      const at = (t) => [0, R * Math.sin(t), R * Math.cos(t) - R]
      const n = 8
      for (let i = 0; i < n; i++) {
        const t0 = -a + (2 * a * i) / n
        const t1 = -a + (2 * a * (i + 1)) / n
        const thick = (t) => 0.034 - 0.016 * Math.abs(t / a)
        k.limb('wood', bow, at(t0), at(t1), thick(t0), { tip: thick(t1), sides: 8 })
      }
      k.limb(BONE, bow, at(-a), at(a), 0.007, { sides: 4 })
      k.tube('trim', bow, [0, 0, 0], 0.04, 0.12)
    },
  },
  {
    id: 'scimitar',
    name: 'Curved sword',
    emoji: '🌙',
    shape: [sl('length', 'Long', 0.5, 1.8), sl('curve', 'Curve', 0, 2)],
    build(k, s) {
      handle(k, 'grip.R', -0.12, 0.12)
      k.ball('trim', 'grip.R', [0, -0.14, 0], 0.045)
      k.box('trim', 'grip.R', [0, 0.13, 0], [0.24, 0.05, 0.08], { round: 0.02 })
      const L = 0.72 * s.length
      const bend = (t) => -0.16 * s.curve * t * t
      const back = [0, 0.25, 0.5, 0.75, 0.92].map((t) => [0.045 + bend(t), t * L])
      const edge = [0.92, 0.75, 0.5, 0.25, 0].map((t) => [-0.06 - 0.03 * Math.sin(t * Math.PI) + bend(t), t * L])
      k.flat('metal', 'grip.R', [0, 0.15, 0], [...back, [bend(1) - 0.04, L], ...edge], 0.03)
    },
  },
  {
    id: 'flail',
    name: 'Flail',
    emoji: '⛓️',
    shape: [sl('handle', 'Handle', 0.5, 1.6), sl('ball', 'Ball', 0.5, 2), sl('chain', 'Chain', 0.5, 2)],
    build(k, s) {
      const top = 0.45 * s.handle
      handle(k, 'grip.R', -0.15, top)
      k.ball('metal', 'grip.R', [0, top + 0.02, 0], 0.04)
      const n = Math.round(3 + 2 * s.chain)
      let p = [0, top + 0.04, 0]
      for (let i = 1; i <= n; i++) {
        p = [-0.045 * i, top + 0.04 + 0.035 * i - 0.004 * i * i, 0]
        k.ring('metal', 'grip.R', p, 0.022, 0.007, { rot: [0, i % 2 ? 90 : 0, 0], sides: 10 })
      }
      const r = 0.09 * s.ball
      const c = [p[0] - r * 0.8, p[1] + r * 0.2, 0]
      k.ball('metal', 'grip.R', c, r)
      for (const n2 of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) k.limb('metal', 'grip.R', along(c, n2, r * 0.8), along(c, n2, r + 0.06), 0.025, { tip: 0.002, sides: 6 })
    },
  },
  {
    id: 'crossbow',
    name: 'Crossbow',
    emoji: '🎯',
    shape: [sl('size', 'Size', 0.6, 1.6)],
    build(k, s) {
      const z = s.size
      k.box('wood', 'grip.R', [0, 0.14 * z, 0.03], [0.06, 0.5 * z, 0.07], { round: 0.02 })
      const y = 0.34 * z
      for (const [, x] of SIDES) k.limb('wood', 'grip.R', [0, y, 0.04], [x * 0.25 * z, y - 0.07 * z, 0.04], 0.022, { tip: 0.014 })
      k.limb(BONE, 'grip.R', [-0.25 * z, y - 0.07 * z, 0.04], [0, y - 0.16 * z, 0.06], 0.005, { sides: 4 })
      k.limb(BONE, 'grip.R', [0.25 * z, y - 0.07 * z, 0.04], [0, y - 0.16 * z, 0.06], 0.005, { sides: 4 })
      k.tube('wood', 'grip.R', [0, y - 0.02, 0.08], 0.012, 0.32 * z, { sides: 5 })
      k.cone('metal', 'grip.R', [0, y + 0.16 * z, 0.08], 0.022, 0.06, { sides: 4 })
    },
  },
  {
    id: 'magic-sword',
    name: 'Glowing sword',
    emoji: '💫',
    shape: [sl('length', 'Long', 0.5, 1.8), sl('width', 'Wide', 0.5, 2), sl('glow', 'Glow', 0, 2)],
    build(k, s) {
      blade(k, 'grip.R', { ...s, guard: 1 }, { length: 0.8, width: 0.12, guard: 0.34 }, 'magic')
      if (s.glow > 0.05) {
        const L = 0.8 * s.length
        const w = 0.12 * s.width + 0.06 * s.glow
        k.flat('magic', 'grip.R', [0, 0.13, 0], [[-w / 2, 0], [w / 2, 0], [w / 2, L - w * 0.6], [0, L + 0.06 * s.glow], [-w / 2, L - w * 0.6]], 0.08, { opacity: 0.25 })
      }
    },
  },
]
