import { BONE, DARK, IVORY, SIDES, sl } from './shared.js'

// ── Heads ─────────────────────────────────────────────────────────────────────────────

// A ball-shaped head of radius r on the neck: sets the frame and draws the neck.
function headFrame(r, s, f, tall = 1) {
  f.HR = r * Math.max(1, s.width ?? 1)
  f.HC = r * tall + 0.04
  f.HS = r * tall * 2 + 0.04
}
const neck = (k, colour = 'skin') => k.tube(colour, 'head', [0, 0.03, 0], 0.08, 0.1)

function eyes(k, r, cy, size, w = 1, colour = 'eyes', spread = 0.36, lift = 0.08) {
  for (const [, x] of SIDES) k.ball(colour, 'head', [x * r * spread * w, cy + r * lift, r * 0.88], 0.045 * size, { scale: [1, 1.25, 0.6] })
}

export const HEADS = [
  {
    id: 'human',
    name: 'Round face',
    emoji: '🙂',
    shape: [sl('size', 'Size', 0.6, 1.6), sl('width', 'Wide', 0.7, 1.4), sl('eyes', 'Eyes', 0.4, 2.2), sl('nose', 'Nose', 0, 2.5)],
    frame: (s, f) => headFrame(0.25 * s.size, s, f),
    build(k, s, f) {
      const r = 0.25 * s.size
      const cy = f.HC
      neck(k)
      k.ball('skin', 'head', [0, cy, 0], r, { scale: [s.width, 1, 1], seg: 20 })
      eyes(k, r, cy, s.eyes * s.size, s.width)
      if (s.nose > 0.05) k.ball('skin', 'head', [0, cy - r * 0.12, r * 0.97], 0.045 * s.nose * s.size)
      k.box('eyes', 'head', [0, cy - r * 0.42, r * 0.87], [0.08 * s.size, 0.02, 0.02], { round: 0.008 })
      for (const [, x] of SIDES) k.ball('skin', 'head', [x * r * 0.97 * s.width, cy, 0], 0.065 * s.size, { scale: [0.5, 1, 0.8] })
    },
  },
  {
    id: 'blocky',
    name: 'Blocky',
    emoji: '🟫',
    shape: [sl('size', 'Size', 0.6, 1.6), sl('width', 'Wide', 0.7, 1.5), sl('eyes', 'Eyes', 0.4, 2.2), sl('chin', 'Big chin', 0, 2, 0)],
    // A box is wider at its corners than a ball: hats and helmets go round the corners.
    frame: (s, f) => {
      headFrame(0.25 * s.size, s, f)
      f.HR *= 1.3
    },
    build(k, s, f) {
      const r = 0.25 * s.size
      const cy = f.HC
      neck(k)
      k.box('skin', 'head', [0, cy, 0], [2 * r * s.width, 2 * r, 2 * r * 0.95], { round: r * 0.45 })
      for (const [, x] of SIDES) k.box('eyes', 'head', [x * r * 0.4 * s.width, cy + r * 0.12, r * 0.96], [0.06 * s.eyes * s.size, 0.08 * s.eyes * s.size, 0.02], { round: 0.01 })
      k.box('hair', 'head', [0, cy + r * 0.4, r * 0.96], [r * 1.3 * s.width, 0.04, 0.03], { round: 0.01 })
      if (s.chin > 0.05) k.box('skin', 'head', [0, cy - r * 0.85, r * 0.35], [r * 1.4 * s.width, r * 0.45 * s.chin, r * 1.1], { round: 0.05 })
    },
  },
  {
    id: 'lizard',
    name: 'Lizard',
    emoji: '🐊',
    shape: [sl('size', 'Size', 0.6, 1.6), sl('snout', 'Snout', 0.3, 2), sl('eyes', 'Eyes', 0.4, 2.2), sl('spikes', 'Spikes', 0, 2)],
    frame: (s, f) => headFrame(0.22 * s.size, s, f, 1.05),
    build(k, s, f) {
      const r = 0.22 * s.size
      const cy = f.HC
      neck(k)
      k.ball('skin', 'head', [0, cy, 0], r, { scale: [1, 0.95, 1.05] })
      const snout = r * 1.2 * s.snout
      k.box('skin', 'head', [0, cy - r * 0.22, r * 0.55 + snout / 2], [r * 1.25, r * 0.85, snout + 0.05], { round: r * 0.3 })
      for (const [, x] of SIDES) {
        k.ball('skin', 'head', [x * r * 0.55, cy + r * 0.45, r * 0.4], r * 0.38, { scale: [1, 0.8, 1] })
        k.ball('eyes', 'head', [x * r * 0.75, cy + r * 0.5, r * 0.55], 0.05 * s.eyes * s.size)
        k.ball(DARK, 'head', [x * r * 0.2, cy - r * 0.05, r * 0.6 + snout], 0.018 * s.size)
      }
      for (let i = 0; i < 3 && s.spikes > 0.05; i++) k.cone('trim', 'head', [0, cy + r * (0.85 - i * 0.28), -r * (0.1 + i * 0.4)], 0.05 * s.size, 0.14 * s.spikes * s.size, { rot: [-40 - i * 20, 0, 0] })
    },
  },
  {
    id: 'orc',
    name: 'Orc',
    emoji: '👹',
    shape: [sl('size', 'Size', 0.6, 1.6), sl('tusks', 'Tusks', 0, 2.2), sl('ears', 'Ears', 0, 2), sl('eyes', 'Eyes', 0.4, 2)],
    frame: (s, f) => headFrame(0.26 * s.size, s, f),
    build(k, s, f) {
      const r = 0.26 * s.size
      const cy = f.HC
      neck(k)
      k.ball('skin', 'head', [0, cy, 0], r, { scale: [1.1, 0.95, 1] })
      k.box('skin', 'head', [0, cy - r * 0.55, r * 0.42], [r * 1.5, r * 0.6, r * 0.9], { round: r * 0.25 })
      k.box('skin', 'head', [0, cy + r * 0.32, r * 0.78], [r * 1.4, r * 0.18, r * 0.3], { round: 0.03 })
      eyes(k, r, cy, s.eyes * s.size, 1.1, 'eyes', 0.36, 0.08)
      k.ball('skin', 'head', [0, cy - r * 0.08, r * 0.98], 0.06 * s.size, { scale: [1.2, 0.8, 1] })
      for (const [, x] of SIDES) {
        if (s.tusks > 0.05) k.cone(IVORY, 'head', [x * r * 0.42, cy - r * 0.35 + 0.05 * s.tusks * s.size, r * 0.86], 0.035 * s.size, 0.12 * s.tusks * s.size, { rot: [0, 0, x * -12] })
        if (s.ears > 0.05) k.cone('skin', 'head', [x * (r * 1.05 + 0.07 * s.ears), cy + r * 0.1, -r * 0.1], 0.05 * s.size, 0.2 * s.ears * s.size, { rot: [0, 0, x * -75] })
      }
    },
  },
  {
    id: 'skull',
    name: 'Skull',
    emoji: '💀',
    shape: [sl('size', 'Size', 0.6, 1.6), sl('jaw', 'Jaw', 0.5, 1.8), sl('glow', 'Eye glow', 0, 2)],
    frame: (s, f) => headFrame(0.24 * s.size, s, f),
    build(k, s, f) {
      const r = 0.24 * s.size
      const cy = f.HC
      k.tube(BONE, 'head', [0, 0.03, 0], 0.05, 0.1)
      k.ball(BONE, 'head', [0, cy + r * 0.08, 0], r, { scale: [1, 0.95, 1.05] })
      k.box(BONE, 'head', [0, cy - r * 0.6, r * 0.32], [r * 1.25, r * 0.55 * s.jaw, r * 1.1], { round: r * 0.2 })
      for (const [, x] of SIDES) {
        k.ball(DARK, 'head', [x * r * 0.38, cy + r * 0.05, r * 0.8], r * 0.25, { scale: [1, 1, 0.5] })
        if (s.glow > 0.05) k.ball('magic', 'head', [x * r * 0.38, cy + r * 0.05, r * 0.9], r * 0.1 * s.glow)
      }
      k.cone(DARK, 'head', [0, cy - r * 0.25, r * 0.98], 0.04 * s.size, 0.07 * s.size, { sides: 3 })
      for (let i = -2; i <= 2; i++) k.box(DARK, 'head', [i * r * 0.18, cy - r * 0.48, r * 0.88], [0.012, r * 0.2, 0.02], { round: 0.004 })
    },
  },
  {
    id: 'elf',
    name: 'Elf',
    emoji: '🧝',
    shape: [sl('size', 'Size', 0.6, 1.6), sl('ears', 'Ears', 0.3, 2.5), sl('eyes', 'Eyes', 0.4, 2.2)],
    frame: (s, f) => headFrame(0.24 * s.size, s, f, 1.05),
    build(k, s, f) {
      const r = 0.24 * s.size
      const cy = f.HC
      neck(k)
      k.ball('skin', 'head', [0, cy, 0], r, { scale: [0.95, 1.05, 1], seg: 20 })
      eyes(k, r, cy, s.eyes * s.size * 1.1, 0.95, 'eyes', 0.36, 0.06)
      k.box('eyes', 'head', [0, cy - r * 0.45, r * 0.85], [0.06 * s.size, 0.015, 0.02], { round: 0.006 })
      for (const [, x] of SIDES) k.cone('skin', 'head', [x * (r * 0.95 + 0.07 * s.ears * s.size), cy + r * 0.25, -r * 0.1], 0.06 * s.size, 0.22 * s.ears * s.size, { rot: [0, 0, x * -60], scale: [1, 1, 0.6] })
    },
  },
  {
    id: 'beast',
    name: 'Beast',
    emoji: '🐻',
    shape: [sl('size', 'Size', 0.6, 1.6), sl('snout', 'Snout', 0.3, 2), sl('ears', 'Ears', 0, 2), sl('eyes', 'Eyes', 0.4, 2)],
    frame: (s, f) => headFrame(0.26 * s.size, s, f),
    build(k, s, f) {
      const r = 0.26 * s.size
      const cy = f.HC
      neck(k)
      k.ball('skin', 'head', [0, cy, 0], r, { scale: [1.05, 1, 1] })
      k.ball('skin', 'head', [0, cy - r * 0.3, r * 0.75], r * 0.45 * Math.sqrt(s.snout), { scale: [1, 0.8, s.snout] })
      k.ball(DARK, 'head', [0, cy - r * 0.15, r * (0.75 + 0.45 * s.snout)], 0.05 * s.size, { scale: [1.3, 1, 1] })
      eyes(k, r, cy, s.eyes * s.size, 1, 'eyes', 0.4, 0.22)
      if (s.ears > 0.05) for (const [, x] of SIDES) k.ball('skin', 'head', [x * r * 0.7, cy + r * 0.78, -r * 0.1], 0.09 * s.ears * s.size, { scale: [1, 1, 0.5] })
    },
  },
  {
    id: 'cyclops',
    name: 'Cyclops',
    emoji: '👁️',
    shape: [sl('size', 'Size', 0.6, 1.6), sl('eye', 'Big eye', 0.5, 1.8), sl('horn', 'Horn', 0, 2)],
    frame: (s, f) => headFrame(0.27 * s.size, s, f),
    build(k, s, f) {
      const r = 0.27 * s.size
      const cy = f.HC
      neck(k)
      k.ball('skin', 'head', [0, cy, 0], r)
      const e = r * 0.42 * s.eye
      k.ball('#f4f4f5', 'head', [0, cy + r * 0.12, r * 0.92 - e * 0.45], e, { scale: [1, 1, 0.7] })
      k.ball('eyes', 'head', [0, cy + r * 0.12, r * 0.92 - e * 0.45 + e * 0.62], e * 0.45, { scale: [1, 1, 0.5] })
      k.box(DARK, 'head', [0, cy - r * 0.5, r * 0.84], [0.12 * s.size, 0.025, 0.02], { round: 0.01 })
      if (s.horn > 0.05) k.cone(IVORY, 'head', [0, cy + r + 0.06 * s.horn * s.size, r * 0.15], 0.06 * s.size, 0.16 * s.horn * s.size, { rot: [15, 0, 0] })
    },
  },
]
