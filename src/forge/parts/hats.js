import { DARK, IVORY, SIDES, along, deg, sl } from './shared.js'

// ── Hats and hair (on top of the head) ────────────────────────────────────────────────

// The head's centre, from the top of the head where hats sit.
const hc = (f) => f.HC - f.HS

export const HATS = [
  {
    id: 'knight-helm',
    name: 'Knight helm',
    emoji: '⛑️',
    shape: [sl('size', 'Size', 0.9, 1.4), sl('crest', 'Crest', 0, 2)],
    build(k, s, f) {
      const c = hc(f)
      const r = f.HR * 1.12 * s.size
      k.ball('metal', 'hat', [0, c, 0], r)
      k.box(DARK, 'hat', [0, c + f.HR * 0.1, r * 0.9], [r * 1.0, 0.05, 0.06], { round: 0.02 })
      k.box('metal', 'hat', [0, c - f.HR * 0.25, r * 0.93], [0.04, r * 0.6, 0.05], { round: 0.015 })
      if (s.crest > 0.05) k.box('trim', 'hat', [0, c + r * 0.85 + 0.06 * s.crest, -0.03], [0.06, 0.14 + 0.12 * s.crest, r * 1.5], { round: 0.03 })
    },
  },
  {
    id: 'viking',
    name: 'Horned helm',
    emoji: '🐂',
    shape: [sl('size', 'Size', 0.9, 1.4), sl('horns', 'Horns', 0, 2.2)],
    build(k, s, f) {
      const c = hc(f)
      const r = f.HR * 1.1 * s.size
      k.ball('metal', 'hat', [0, c + f.HR * 0.05, 0], r, { half: true })
      k.ring('trim', 'hat', [0, c + f.HR * 0.05, 0], r, 0.03, { rot: [90, 0, 0] })
      if (s.horns < 0.05) return
      const L = s.horns
      for (const [, x] of SIDES) {
        const p0 = [x * r * 0.85, c + r * 0.45, 0]
        const p1 = [x * (r * 0.85 + 0.17 * L), c + r * 0.6 + 0.04 * L, 0.03]
        const p2 = [x * (r * 0.85 + 0.23 * L), c + r * 0.6 + 0.22 * L, 0.06]
        k.limb(IVORY, 'hat', p0, p1, 0.065, { tip: 0.045, ends: true })
        k.limb(IVORY, 'hat', p1, p2, 0.045, { tip: 0.004 })
      }
    },
  },
  {
    id: 'wizard-hat',
    name: 'Wizard hat',
    emoji: '🎩',
    shape: [sl('height', 'Tall', 0.6, 2.2), sl('brim', 'Brim', 0.6, 1.7), sl('droop', 'Floppy', 0, 2, 0.6)],
    build(k, s, f) {
      const y = hc(f) + f.HR * 0.5
      k.tube('outfit', 'hat', [0, y, 0], f.HR * 1.75 * s.brim, 0.03, { sides: 20 })
      const h1 = 0.3 * s.height
      k.cone('outfit', 'hat', [0, y + h1 / 2, 0], f.HR * 0.95, h1, { tip: f.HR * 0.5, sides: 16 })
      k.tube('trim', 'hat', [0, y + 0.05, 0], f.HR * 0.93, 0.07, { sides: 16 })
      k.ball('magic', 'hat', [0, y + h1 * 0.5, f.HR * 0.75], 0.04)
      const tip = k.group('hat', [0, y + h1, 0], [35 * s.droop, 0, 0])
      const h2 = 0.28 * s.height
      k.cone('outfit', tip, [0, h2 / 2, 0], f.HR * 0.5, h2, { sides: 16 })
    },
  },
  {
    id: 'hood',
    name: 'Hood',
    emoji: '🧥',
    shape: [sl('size', 'Size', 0.9, 1.4), sl('point', 'Point', 0, 2)],
    build(k, s, f) {
      const c = hc(f)
      const r = f.HR * 1.18 * s.size
      const gap = 2.0
      k.ball('outfit', 'hat', [0, c, 0], r, { phi: [Math.PI / 2 + gap / 2, Math.PI * 2 - gap], thetaLen: Math.PI * 0.72 })
      if (s.point > 0.05) k.cone('outfit', 'hat', [0, c + r * 0.55, -r * 0.75], r * 0.4, 0.3 * s.point, { rot: [-120, 0, 0] })
    },
  },
  {
    id: 'crown',
    name: 'Crown',
    emoji: '👑',
    shape: [sl('size', 'Size', 0.8, 1.4), sl('points', 'Points', 0.3, 2.2)],
    build(k, s, f) {
      const y = hc(f) + f.HR * 0.72
      const r = f.HR * 0.82 * s.size
      k.tube('trim', 'hat', [0, y, 0], r, 0.1, { sides: 20, open: true })
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2
        k.cone('trim', 'hat', [Math.sin(a) * r, y + 0.05 + 0.06 * s.points, Math.cos(a) * r], 0.035, 0.12 * s.points, { sides: 6 })
      }
      k.ball('magic', 'hat', [0, y, r + 0.01], 0.035)
    },
  },
  {
    id: 'mohawk',
    name: 'Spiky hair',
    emoji: '🦔',
    shape: [sl('height', 'Tall', 0.3, 2.5), sl('count', 'Spikes', 3, 9, 5)],
    build(k, s, f) {
      const c = hc(f)
      const n = Math.round(s.count)
      for (let i = 0; i < n; i++) {
        const a = deg(-50 + (130 * i) / Math.max(1, n - 1))
        const dir = [0, Math.cos(a), Math.sin(a)]
        const p = [0, c + dir[1] * f.HR * 0.85, dir[2] * f.HR * 0.85]
        k.limb('hair', 'hat', p, along(p, dir, f.HR * 0.2 + 0.14 * s.height), 0.06, { tip: 0.004, sides: 6 })
      }
    },
  },
  {
    id: 'messy-hair',
    name: 'Messy hair',
    emoji: '💇',
    shape: [sl('size', 'Fluffy', 0.6, 1.6), sl('long', 'Long', 0, 2, 0.5)],
    build(k, s, f) {
      const c = hc(f)
      const r = f.HR
      k.ball('hair', 'hat', [0, c + r * 0.15, -r * 0.08], r * 1.04, { thetaLen: Math.PI * 0.55, scale: [1.05, 1, 1.05] })
      const tufts = [
        [0, 0.95, 0.35],
        [0.45, 0.85, 0.3],
        [-0.45, 0.85, 0.3],
        [0.25, 0.95, -0.25],
        [-0.3, 0.9, -0.3],
        [0, 0.7, -0.7],
      ]
      for (const [x, y, z] of tufts) k.ball('hair', 'hat', [x * r, c + y * r, z * r], r * 0.32 * s.size, { seg: 10, rings: 8 })
      if (s.long > 0.05) k.box('hair', 'hat', [0, c - r * 0.3 * s.long, -r * 0.75], [r * 1.6, r * (0.6 + 0.9 * s.long), r * 0.4], { round: r * 0.18 })
    },
  },
  {
    id: 'headband',
    name: 'Headband',
    emoji: '🎀',
    shape: [sl('ties', 'Ties', 0, 2)],
    build(k, s, f) {
      const c = hc(f) + f.HR * 0.3
      k.ring('outfit', 'hat', [0, c, 0], f.HR * 0.98, 0.035, { rot: [90, 0, 0] })
      if (s.ties > 0.05) for (const [, x] of SIDES) k.box('outfit', 'hat', [x * 0.05, c - 0.08 * s.ties, -f.HR * 1.02], [0.06, 0.18 * s.ties, 0.015], { rot: [-10, 0, x * 20], round: 0.006 })
    },
  },
  {
    id: 'devil-horns',
    name: 'Horns',
    emoji: '😈',
    shape: [sl('length', 'Length', 0.4, 2.2), sl('curl', 'Curl', 0, 2)],
    build(k, s, f) {
      const c = hc(f)
      for (const [, x] of SIDES) {
        const p0 = [x * f.HR * 0.55, c + f.HR * 0.75, f.HR * 0.15]
        const p1 = [x * (f.HR * 0.55 + 0.06 * s.length), c + f.HR * 0.75 + 0.13 * s.length, f.HR * 0.05]
        const p2 = [x * (f.HR * 0.55 + 0.08 * s.length), c + f.HR * 0.75 + 0.22 * s.length, -0.1 * s.curl * s.length]
        k.limb('trim', 'hat', p0, p1, 0.06, { tip: 0.04, ends: true })
        k.limb('trim', 'hat', p1, p2, 0.04, { tip: 0.004 })
      }
    },
  },
  {
    id: 'pirate-hat',
    name: 'Pirate hat',
    emoji: '🏴‍☠️',
    shape: [sl('size', 'Size', 0.8, 1.5)],
    build(k, s, f) {
      const c = hc(f)
      const r = f.HR * s.size
      k.ball('outfit', 'hat', [0, c + f.HR * 0.35, 0], r * 1.02, { half: true, scale: [1, 0.85, 1] })
      k.tube('outfit', 'hat', [0, c + f.HR * 0.38, 0], r * 1.55, 0.03, { sides: 20, scale: [1, 1, 0.75] })
      const flap = [...Array(9)].map((_, i) => {
        const a = Math.PI * (i / 8)
        return [Math.cos(a) * r * 1.3, Math.sin(a) * r * 0.95]
      })
      k.flat('outfit', 'hat', [0, c + f.HR * 0.36, r * 1.05], flap, 0.025, { rot: [-12, 0, 0] })
      k.ball('#f4f4f5', 'hat', [0, c + f.HR * 0.36 + r * 0.4, r * 1.1], r * 0.15, { scale: [1, 1, 0.5] })
    },
  },
  {
    id: 'halo',
    name: 'Halo',
    emoji: '😇',
    shape: [sl('size', 'Size', 0.6, 1.6), sl('height', 'Float', 0, 2)],
    build(k, s, f) {
      k.ring('glow:#fde047', 'hat', [0, 0.06 + 0.08 * s.height, 0], f.HR * 0.75 * s.size, 0.025, { rot: [90, 0, 0], sides: 32 })
    },
  },
  {
    id: 'jester-hat',
    name: 'Jester hat',
    emoji: '🃏',
    shape: [sl('size', 'Size', 0.8, 1.5), sl('flop', 'Floppy', 0, 2)],
    build(k, s, f) {
      const c = hc(f)
      k.ball('outfit', 'hat', [0, c + f.HR * 0.15, 0], f.HR * 1.05, { thetaLen: Math.PI * 0.45 })
      k.tube('trim', 'hat', [0, c + f.HR * 0.2, 0], f.HR * 1.02, 0.05, { sides: 18 })
      for (const [colour, x] of [['outfit', 1], ['trim', -1]]) {
        const g = k.group('hat', [x * f.HR * 0.3, c + f.HR * 0.8, 0], [0, 0, x * -50])
        k.cone(colour, g, [0, 0.13 * s.size, 0], f.HR * 0.4, 0.26 * s.size, { tip: f.HR * 0.2 })
        const tip = k.group(g, [0, 0.26 * s.size, 0], [0, 0, x * -60 * s.flop])
        k.cone(colour, tip, [0, 0.1 * s.size, 0], f.HR * 0.2, 0.2 * s.size)
        k.ball('trim', tip, [0, 0.21 * s.size, 0], 0.04)
      }
    },
  },
  {
    id: 'animal-ears',
    name: 'Animal ears',
    emoji: '🐺',
    shape: [sl('size', 'Size', 0.5, 2), sl('spread', 'Apart', 0.5, 1.5)],
    build(k, s, f) {
      const c = hc(f)
      for (const [, x] of SIDES) {
        const g = k.group('hat', [x * f.HR * 0.5 * s.spread, c + f.HR * 0.82, 0], [0, 0, x * -20 * s.spread])
        k.cone('skin', g, [0, 0.08 * s.size, 0], 0.08 * s.size, 0.18 * s.size, { sides: 4, scale: [1, 1, 0.45] })
        k.cone('#fda4af', g, [0, 0.07 * s.size, 0.015], 0.05 * s.size, 0.12 * s.size, { sides: 4, scale: [1, 1, 0.35] })
      }
    },
  },
]
