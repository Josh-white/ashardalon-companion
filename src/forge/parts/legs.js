import { BONE, IVORY, SIDES, sl } from './shared.js'

// ── Legs (hip down to the ground) ─────────────────────────────────────────────────────

const legFrame =
  (w = 0.13) =>
  (s, f) => {
    f.LL = 0.5 * s.length
    f.legW = w * (s.thick ?? 1)
  }
const hipsBox = (k, f, colour = 'outfit') => k.box(colour, 'hips', [0, -0.03, 0], [f.BW * 0.88, 0.16, f.BD * 0.9], { round: 0.06 })
const ground = (f) => -(f.LL + f.foot)

function boot(k, leg, f, colour, size = 1) {
  const h = f.foot + 0.12
  k.box(colour, leg, [0, ground(f) + h / 2, 0.04 * size], [f.legW * 2.1 * size, h, f.legW * 2.4 * size + 0.06], { round: 0.05 })
}

export const LEGS = [
  {
    id: 'trousers',
    name: 'Trousers',
    emoji: '👖',
    shape: [sl('length', 'Long', 0.5, 1.8), sl('thick', 'Thick', 0.6, 1.8), sl('boots', 'Boots', 0.6, 1.8)],
    frame: legFrame(),
    build(k, s, f) {
      hipsBox(k, f)
      for (const [side] of SIDES) {
        const leg = `leg.${side}`
        k.limb('outfit', leg, [0, 0, 0], [0, -f.LL * 0.55, 0], f.legW, { ends: true })
        k.limb('outfit', leg, [0, -f.LL * 0.55, 0], [0, -f.LL, 0], f.legW * 0.92)
        boot(k, leg, f, 'wood', s.boots)
        k.tube('trim', leg, [0, -f.LL + 0.06, 0.0], f.legW * 1.08 * Math.max(1, s.boots * 0.95), 0.04)
      }
    },
  },
  {
    id: 'armored-legs',
    name: 'Armored',
    emoji: '🦿',
    shape: [sl('length', 'Long', 0.5, 1.8), sl('thick', 'Thick', 0.6, 1.8), sl('boots', 'Boots', 0.6, 1.8)],
    frame: legFrame(0.14),
    build(k, s, f) {
      hipsBox(k, f, 'metal')
      for (const [side] of SIDES) {
        const leg = `leg.${side}`
        k.limb('metal', leg, [0, 0, 0], [0, -f.LL * 0.5, 0], f.legW, { ends: true })
        k.ball('metal', leg, [0, -f.LL * 0.5, 0.04], f.legW * 1.15)
        k.limb('metal', leg, [0, -f.LL * 0.5, 0], [0, -f.LL, 0], f.legW * 1.05)
        boot(k, leg, f, 'metal', s.boots * 1.1)
      }
    },
  },
  {
    id: 'beast-legs',
    name: 'Beast feet',
    emoji: '🐾',
    shape: [sl('length', 'Long', 0.5, 1.8), sl('thick', 'Thick', 0.6, 1.8), sl('feet', 'Big feet', 0.6, 2)],
    frame: legFrame(0.15),
    build(k, s, f) {
      hipsBox(k, f, 'skin')
      for (const [side] of SIDES) {
        const leg = `leg.${side}`
        k.limb('skin', leg, [0, 0, 0], [0, -f.LL * 0.5, 0.03], f.legW * 1.1, { ends: true })
        k.limb('skin', leg, [0, -f.LL * 0.5, 0.03], [0, -f.LL, -0.02], f.legW * 0.85)
        const y = ground(f) + 0.07 * s.feet
        k.ball('skin', leg, [0, y, 0.05], f.legW * 1.2 * s.feet, { scale: [1, 0.6, 1.4] })
        for (const dx of [-1, 0, 1]) k.cone(IVORY, leg, [dx * f.legW * 0.55 * s.feet, y - 0.02, 0.05 + f.legW * 1.55 * s.feet], 0.025 * s.feet, 0.08 * s.feet, { rot: [90, 0, 0], sides: 6 })
      }
    },
  },
  {
    id: 'peg-leg',
    name: 'Peg leg',
    emoji: '🏴‍☠️',
    shape: [sl('length', 'Long', 0.5, 1.8), sl('thick', 'Thick', 0.6, 1.8), sl('boots', 'Boot', 0.6, 1.8)],
    frame: legFrame(),
    build(k, s, f) {
      hipsBox(k, f)
      k.limb('outfit', 'leg.L', [0, 0, 0], [0, -f.LL, 0], f.legW, { ends: true })
      boot(k, 'leg.L', f, 'wood', s.boots)
      k.limb('outfit', 'leg.R', [0, 0, 0], [0, -f.LL * 0.45, 0], f.legW, { ends: true, tip: f.legW * 0.9 })
      k.tube('wood', 'leg.R', [0, -f.LL * 0.45 - 0.02, 0], f.legW * 0.95, 0.06)
      k.limb('wood', 'leg.R', [0, -f.LL * 0.45, 0], [0, ground(f) + 0.02, 0], f.legW * 0.45, { tip: f.legW * 0.32 })
      k.ball('wood', 'leg.R', [0, ground(f) + 0.03, 0], f.legW * 0.35)
    },
  },
  {
    id: 'bone-legs',
    name: 'Bones',
    emoji: '🦴',
    shape: [sl('length', 'Long', 0.5, 1.8), sl('thick', 'Thick', 0.6, 1.8)],
    frame: legFrame(0.06),
    build(k, s, f) {
      k.ball(BONE, 'hips', [0, -0.02, 0], f.BW * 0.32, { scale: [1.2, 0.6, 0.8] })
      for (const [side] of SIDES) {
        const leg = `leg.${side}`
        k.limb(BONE, leg, [0, 0, 0], [0, -f.LL * 0.5, 0], f.legW)
        k.ball(BONE, leg, [0, -f.LL * 0.5, 0], f.legW * 1.5)
        k.limb(BONE, leg, [0, -f.LL * 0.5, 0], [0, ground(f) + 0.04, 0], f.legW * 0.9)
        k.box(BONE, leg, [0, ground(f) + 0.03, 0.06], [f.legW * 2.4, 0.06, f.legW * 3.5], { round: 0.02 })
      }
    },
  },
]
