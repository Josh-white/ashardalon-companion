import { BONE, IVORY, SIDES, sl } from './shared.js'

// ── Arms ──────────────────────────────────────────────────────────────────────────────

// A hand at the end of an arm: round and open when it's empty, and a fist closed round the
// handle when it holds something (f.fist, from figure.js). The fist sits on the grip, so its
// fingers line up with the handle, which pokes out above and below it.
function hand(k, side, colour, r, f) {
  if (!f.fist?.[side]) return k.ball(colour, `hand.${side}`, [0, 0, 0], r)
  const grip = `grip.${side}`
  const x = side === 'L' ? 1 : -1
  const w = r * 1.2
  const h = Math.min(r * 1.35, 0.17)
  k.ball(colour, `hand.${side}`, [0, 0.02, 0], r * 0.75)
  k.box(colour, grip, [x * r * 0.08, 0, 0], [w, h, w], { round: r * 0.4 })
  // Knuckles round the front of the handle, and the thumb over the top.
  for (const n of [0, 1, 2, 3]) k.ball(colour, grip, [x * r * 0.05, -h * 0.36 + n * h * 0.24, w * 0.47], r * 0.2)
  k.ball(colour, grip, [-x * w * 0.3, h * 0.42, w * 0.22], r * 0.24, { scale: [1, 0.8, 1.2] })
}

const armFrame =
  (w = 0.1) =>
  (s, f) => {
    f.AL = 0.5 * s.length
    f.armW = w * (s.thick ?? 1)
  }

export const ARMS = [
  {
    id: 'sleeves',
    name: 'Sleeves',
    emoji: '🫱',
    shape: [sl('length', 'Long'), sl('thick', 'Thick', 0.6, 1.8)],
    frame: armFrame(),
    build(k, s, f) {
      for (const [side] of SIDES) {
        const arm = `arm.${side}`
        k.limb('outfit', arm, [0, 0, 0], [0, -f.AL * 0.5, 0], f.armW * 1.1, { ends: true })
        k.limb('skin', arm, [0, -f.AL * 0.5, 0], [0, -f.AL, 0.02], f.armW * 0.95)
        hand(k, side, 'skin', f.armW * 1.3, f)
      }
    },
  },
  {
    id: 'armored',
    name: 'Armored',
    emoji: '🦾',
    shape: [sl('length', 'Long'), sl('thick', 'Thick', 0.6, 1.8), sl('pads', 'Shoulder pads', 0, 2)],
    frame: armFrame(0.11),
    build(k, s, f) {
      for (const [side, x] of SIDES) {
        const arm = `arm.${side}`
        k.limb('metal', arm, [0, 0, 0], [0, -f.AL * 0.5, 0], f.armW * 1.05, { ends: true })
        k.limb('metal', arm, [0, -f.AL * 0.5, 0], [0, -f.AL, 0.02], f.armW * 1.25, { tip: f.armW * 0.95 })
        hand(k, side, 'metal', f.armW * 1.35, f)
        if (s.pads > 0.05) k.ball('metal', arm, [x * 0.02, 0.02, 0], f.armW * 2 * s.pads, { half: true, scale: [1, 0.85, 1] })
      }
    },
  },
  {
    id: 'muscly',
    name: 'Muscly',
    emoji: '💪',
    shape: [sl('length', 'Long'), sl('thick', 'Thick', 0.6, 1.8), sl('muscles', 'Muscles', 0.5, 2)],
    frame: armFrame(0.13),
    build(k, s, f) {
      for (const [side] of SIDES) {
        const arm = `arm.${side}`
        k.limb('skin', arm, [0, 0, 0], [0, -f.AL * 0.5, 0], f.armW * 1.1, { ends: true })
        k.ball('skin', arm, [0, -f.AL * 0.25, 0.03], f.armW * 1.3 * s.muscles, { scale: [1, 1.2, 1] })
        k.limb('skin', arm, [0, -f.AL * 0.5, 0], [0, -f.AL, 0.02], f.armW * 1.05)
        k.tube('trim', arm, [0, -f.AL * 0.85, 0.02], f.armW * 1.15, 0.08)
        hand(k, side, 'skin', f.armW * 1.35, f)
      }
    },
  },
  {
    id: 'claws',
    name: 'Claws',
    emoji: '🦖',
    shape: [sl('length', 'Long'), sl('thick', 'Thick', 0.6, 1.8), sl('claws', 'Claws', 0.3, 2.2)],
    frame: armFrame(),
    build(k, s, f) {
      for (const [side] of SIDES) {
        const arm = `arm.${side}`
        k.limb('skin', arm, [0, 0, 0], [0, -f.AL, 0.02], f.armW, { ends: true })
        hand(k, side, 'skin', f.armW * 1.3, f)
        for (const dx of [-1, 0, 1]) k.limb(IVORY, `hand.${side}`, [dx * f.armW * 0.6, -f.armW * 0.5, f.armW * 0.5], [dx * f.armW * 0.8, -f.armW - 0.1 * s.claws, f.armW + 0.06 * s.claws], 0.025, { tip: 0.002, sides: 6 })
      }
    },
  },
  {
    id: 'wizard-sleeves',
    name: 'Wide sleeves',
    emoji: '🪄',
    shape: [sl('length', 'Long'), sl('thick', 'Thick', 0.6, 1.8), sl('sleeves', 'Wide', 0.6, 2)],
    frame: armFrame(),
    build(k, s, f) {
      for (const [side] of SIDES) {
        const arm = `arm.${side}`
        const end = -f.AL * 0.8
        k.ball('outfit', arm, [0, 0, 0], f.armW * 1.2)
        k.cone('outfit', arm, [0, end / 2, 0], f.armW * 2 * s.sleeves, -end, { tip: f.armW * 1.1, sides: 14 })
        k.tube('trim', arm, [0, end + 0.02, 0], f.armW * 2 * s.sleeves * 0.98, 0.04, { sides: 14 })
        k.limb('skin', arm, [0, end, 0], [0, -f.AL, 0.02], f.armW * 0.8)
        hand(k, side, 'skin', f.armW * 1.2, f)
      }
    },
  },
  {
    id: 'bones',
    name: 'Bones',
    emoji: '🦴',
    shape: [sl('length', 'Long'), sl('thick', 'Thick', 0.6, 1.8)],
    frame: armFrame(0.05),
    build(k, s, f) {
      for (const [side] of SIDES) {
        const arm = `arm.${side}`
        k.ball(BONE, arm, [0, 0, 0], f.armW * 1.6)
        k.limb(BONE, arm, [0, 0, 0], [0, -f.AL * 0.5, 0], f.armW)
        k.ball(BONE, arm, [0, -f.AL * 0.5, 0], f.armW * 1.4)
        k.limb(BONE, arm, [0, -f.AL * 0.5, 0], [0, -f.AL, 0.02], f.armW * 0.9)
        hand(k, side, BONE, f.armW * 1.9, f)
      }
    },
  },
]
