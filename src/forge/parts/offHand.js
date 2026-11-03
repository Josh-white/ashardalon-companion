import { DARK, FIRE, FIRE_CORE, along, deg, scale, sl } from './shared.js'
import { blade, bladeShape, handle } from './weapons.js'

// ── Off hand: shields and other things ────────────────────────────────────────────────

// A shield faces out to the side and a bit forward.
const SHIELD_AT = [0.11, 0.06, 0.06]
const SHIELD_N = [Math.sin(deg(30)), 0, Math.cos(deg(30))]
const FACE = [0, 30, 0] // a flat shape's face (its +Z) turned to SHIELD_N
const DISC = [90, 30, 0] // a cylinder's end turned to SHIELD_N
const KITE = [
  [0, 0.4],
  [0.25, 0.28],
  [0.23, -0.04],
  [0, -0.46],
  [-0.23, -0.04],
  [-0.25, 0.28],
]

function roundShield(k, s, colour = 'wood') {
  const r = 0.3 * s.size
  k.tube(colour, 'hand.L', SHIELD_AT, r, 0.05, { rot: DISC, sides: 20 })
  k.ring('metal', 'hand.L', SHIELD_AT, r, 0.028, { rot: FACE })
  const front = along(SHIELD_AT, SHIELD_N, 0.028)
  k.box('trim', 'hand.L', front, [r * 1.85, 0.07, 0.012], { rot: FACE, round: 0.004 })
  k.box('trim', 'hand.L', front, [0.07, r * 1.85, 0.012], { rot: FACE, round: 0.004 })
  return front
}

export const OFF_HAND = [
  {
    id: 'round-shield',
    fist: false,
    name: 'Round shield',
    emoji: '🛡️',
    shape: [sl('size', 'Size', 0.6, 1.6), sl('boss', 'Middle bump', 0, 2)],
    build(k, s) {
      const front = roundShield(k, s)
      if (s.boss > 0.05) k.ball('metal', 'hand.L', front, 0.07 * s.boss, { scale: [1, 1, 0.6], rot: FACE })
    },
  },
  {
    id: 'kite-shield',
    fist: false,
    name: 'Knight shield',
    emoji: '🔰',
    shape: [sl('size', 'Size', 0.6, 1.6), sl('width', 'Wide', 0.7, 1.4)],
    build(k, s) {
      const pts = KITE.map(([x, y]) => [x * s.size * s.width, y * s.size])
      k.flat('metal', 'hand.L', SHIELD_AT, scale(pts, 1.08), 0.03, { rot: FACE })
      const front = along(SHIELD_AT, SHIELD_N, 0.02)
      k.flat('outfit', 'hand.L', front, pts, 0.03, { rot: FACE })
      const mark = along(SHIELD_AT, SHIELD_N, 0.04)
      k.box('trim', 'hand.L', mark, [0.06, 0.55 * s.size, 0.01], { rot: FACE, round: 0.004 })
      k.box('trim', 'hand.L', along(mark, [0, 1, 0], 0.08 * s.size), [0.32 * s.size * s.width, 0.06, 0.01], { rot: FACE, round: 0.004 })
    },
  },
  {
    id: 'tower-shield',
    fist: false,
    name: 'Tower shield',
    emoji: '🚪',
    shape: [sl('size', 'Size', 0.6, 1.5), sl('width', 'Wide', 0.7, 1.4)],
    build(k, s) {
      const w = 0.48 * s.size * s.width
      const h = 0.85 * s.size
      const at = along(SHIELD_AT, [0, 1, 0], 0.08)
      k.box('outfit', 'hand.L', at, [w, h, 0.06], { rot: FACE, round: 0.05 })
      const front = along(at, SHIELD_N, 0.035)
      k.box('trim', 'hand.L', front, [w * 0.9, 0.06, 0.012], { rot: FACE, round: 0.004 })
      for (const [x, y] of [
        [1, 1],
        [-1, 1],
        [1, -1],
        [-1, -1],
      ]) {
        const across = [Math.cos(deg(30)) * x * w * 0.38, y * h * 0.4, -Math.sin(deg(30)) * x * w * 0.38]
        k.ball('metal', 'hand.L', front.map((v, i) => v + across[i]), 0.03)
      }
    },
  },
  {
    id: 'spiky-shield',
    fist: false,
    name: 'Spiky shield',
    emoji: '🌵',
    shape: [sl('size', 'Size', 0.6, 1.6), sl('spikes', 'Spikes', 0.3, 2)],
    build(k, s) {
      const front = roundShield(k, s, 'metal')
      k.limb('metal', 'hand.L', front, along(front, SHIELD_N, 0.18 * s.spikes), 0.06, { tip: 0.002, sides: 8 })
      const r = 0.2 * s.size
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4
        const across = [Math.cos(deg(30)) * Math.cos(a) * r, Math.sin(a) * r, -Math.sin(deg(30)) * Math.cos(a) * r]
        const p = front.map((v, n) => v + across[n])
        k.limb('metal', 'hand.L', p, along(p, SHIELD_N, 0.1 * s.spikes), 0.035, { tip: 0.002, sides: 6 })
      }
    },
  },
  {
    id: 'torch',
    grip: [25, 0, 10],
    name: 'Torch',
    emoji: '🔥',
    shape: [sl('length', 'Long', 0.6, 1.6), sl('flame', 'Flame', 0.4, 2.2)],
    build(k, s) {
      const top = 0.3 * s.length
      handle(k, 'grip.L', -0.1, top, 0.03)
      k.tube('wood', 'grip.L', [0, top, 0], 0.05, 0.06)
      k.cone(FIRE, 'grip.L', [0, top + 0.03 + 0.09 * s.flame, 0], 0.07 * Math.sqrt(s.flame), 0.18 * s.flame, { sides: 7 })
      k.cone(FIRE_CORE, 'grip.L', [0, top + 0.03 + 0.05 * s.flame, 0.0], 0.045 * Math.sqrt(s.flame), 0.1 * s.flame, { sides: 6 })
    },
  },
  {
    id: 'spellbook',
    name: 'Spell book',
    emoji: '📕',
    shape: [sl('size', 'Size', 0.6, 1.6)],
    build(k, s) {
      const at = [0.05, 0.04, 0.1]
      k.box('outfit', 'hand.L', at, [0.24 * s.size, 0.3 * s.size, 0.08 * s.size], { rot: FACE, round: 0.015 })
      k.box('#f4f4f5', 'hand.L', along(at, [-SHIELD_N[2], 0, SHIELD_N[0]], 0.006), [0.22 * s.size, 0.28 * s.size, 0.06 * s.size], { rot: FACE, round: 0.01 })
      k.ball('magic', 'hand.L', along(at, SHIELD_N, 0.04 * s.size), 0.035 * s.size, { scale: [1, 1, 0.4], rot: FACE })
    },
  },
  {
    id: 'orb',
    fist: false,
    name: 'Magic orb',
    emoji: '🔮',
    shape: [sl('size', 'Size', 0.5, 2), sl('float', 'Float', 0, 2)],
    build(k, s) {
      const c = [0, 0.1 + 0.08 * s.float + 0.09 * s.size, 0.1]
      k.ball('magic', 'hand.L', c, 0.09 * s.size)
      k.ring('trim', 'hand.L', c, 0.13 * s.size, 0.012, { rot: [70, 0, 20] })
    },
  },
  {
    id: 'off-dagger',
    name: 'Second dagger',
    emoji: '🔪',
    shape: bladeShape,
    build: (k, s) => blade(k, 'grip.L', s, { length: 0.32, width: 0.08, guard: 0.18 }),
  },
  {
    id: 'off-sword',
    name: 'Second sword',
    emoji: '⚔️',
    shape: bladeShape,
    build: (k, s) => blade(k, 'grip.L', s, { length: 0.62, width: 0.1, guard: 0.28 }),
  },
  {
    id: 'lantern',
    name: 'Lantern',
    emoji: '🏮',
    shape: [sl('size', 'Size', 0.6, 1.6)],
    build(k, s) {
      const z = s.size
      const at = [0, -0.14 * z, 0.06]
      k.ring('metal', 'hand.L', [0, -0.03 * z, 0.06], 0.04 * z, 0.008, { rot: [0, 90, 0] })
      k.box('metal', 'hand.L', along(at, [0, 1, 0], 0.07 * z), [0.13 * z, 0.03, 0.13 * z], { round: 0.01 })
      k.box('metal', 'hand.L', along(at, [0, -1, 0], 0.07 * z), [0.13 * z, 0.03, 0.13 * z], { round: 0.01 })
      k.box(FIRE_CORE, 'hand.L', at, [0.1 * z, 0.12 * z, 0.1 * z], { round: 0.02, opacity: 0.85 })
      k.cone(FIRE, 'hand.L', at, 0.025 * z, 0.06 * z, { sides: 5 })
    },
  },
  {
    id: 'potion',
    name: 'Potion',
    emoji: '🧪',
    shape: [sl('size', 'Size', 0.6, 1.8)],
    build(k, s) {
      const z = s.size
      const at = [0, 0.1 * z, 0.08]
      k.ball('magic', 'hand.L', at, 0.08 * z, { opacity: 0.85 })
      k.tube('#e0f2fe', 'hand.L', along(at, [0, 1, 0], 0.09 * z), 0.025 * z, 0.06 * z, { opacity: 0.6 })
      k.tube('wood', 'hand.L', along(at, [0, 1, 0], 0.13 * z), 0.028 * z, 0.035 * z)
    },
  },
  {
    id: 'bomb',
    name: 'Bomb',
    emoji: '💣',
    shape: [sl('size', 'Size', 0.6, 1.8)],
    build(k, s) {
      const z = s.size
      const at = [0, 0.1 * z, 0.08]
      k.ball(DARK, 'hand.L', at, 0.1 * z)
      k.tube('metal', 'hand.L', along(at, [0, 1, 0], 0.1 * z), 0.03 * z, 0.03)
      k.limb('wood', 'hand.L', along(at, [0, 1, 0], 0.11 * z), along(at, [0.3, 1, 0], 0.18 * z), 0.008, { sides: 4 })
      k.ball(FIRE_CORE, 'hand.L', along(at, [0.3, 1, 0], 0.19 * z), 0.025)
    },
  },
]
