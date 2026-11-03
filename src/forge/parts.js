// The 🛠️ Hero Builder's parts. Each slot holds one part; each part is built from simple
// shapes (src/forge/figure.js kit) hung on the skeleton's joints, and has its own shape
// sliders (1 is its normal shape). Adding a part is adding an entry here: saved recipes only
// name the part's id, so old figures keep working.
//
// A part is { id, name, emoji, shape: [slider…], frame?(s, f), build(k, s, f) }:
//   s      the part's slider values, by key
//   f      the skeleton's measurements (figure.js BASE_FRAME), which `frame` may change
//   k      the shape kit: k.box / ball / cone / tube / ring / flat / limb / group (opts.opacity
//          makes a shape see-through)
// Joints: hips, body (waist up), head (neck up), arm.L/R (shoulder down), hand.L/R,
// leg.L/R (hip down to the ground), tail, grip.L/R (a held thing points along +Y),
// back (between the shoulder blades), hat (top of the head), fx (the floor under the
// figure). Front is +Z, the figure's left is +X.

const sl = (key, label, min = 0.5, max = 1.6, value = 1) => ({ key, label, min, max, value })
const SIDES = [
  ['L', 1],
  ['R', -1],
]
const BONE = '#e7e5e4'
const IVORY = '#f5f0e1'
const DARK = '#18181b'
const FIRE = 'glow:#f97316'
const FIRE_CORE = 'glow:#fde047'
const mirror = (points) => points.map(([x, y]) => [-x, y])
const scale = (points, s) => points.map(([x, y]) => [x * s, y * s])
// A point `d` along the direction `n` from `c`.
const along = (c, n, d) => c.map((v, i) => v + n[i] * d)
const deg = (d) => (d * Math.PI) / 180

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

const BODIES = [
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

const HEADS = [
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
    frame: (s, f) => headFrame(0.25 * s.size, s, f),
    build(k, s, f) {
      const r = 0.25 * s.size
      const cy = f.HC
      neck(k)
      k.box('skin', 'head', [0, cy, 0], [2 * r * s.width, 2 * r, 2 * r * 0.95], { round: r * 0.35 })
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

// ── Hats and hair (on top of the head) ────────────────────────────────────────────────

// The head's centre, from the top of the head where hats sit.
const hc = (f) => f.HC - f.HS

const HATS = [
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

// ── Arms ──────────────────────────────────────────────────────────────────────────────

const armFrame =
  (w = 0.1) =>
  (s, f) => {
    f.AL = 0.5 * s.length
    f.armW = w * (s.thick ?? 1)
  }

const ARMS = [
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
        k.ball('skin', `hand.${side}`, [0, 0, 0], f.armW * 1.3)
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
        k.ball('metal', `hand.${side}`, [0, 0, 0], f.armW * 1.35)
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
        k.ball('skin', `hand.${side}`, [0, 0, 0], f.armW * 1.35)
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
        const hand = `hand.${side}`
        k.limb('skin', arm, [0, 0, 0], [0, -f.AL, 0.02], f.armW, { ends: true })
        k.ball('skin', hand, [0, 0, 0], f.armW * 1.3)
        for (const dx of [-1, 0, 1]) k.limb(IVORY, hand, [dx * f.armW * 0.6, -f.armW * 0.5, f.armW * 0.5], [dx * f.armW * 0.8, -f.armW - 0.1 * s.claws, f.armW + 0.06 * s.claws], 0.025, { tip: 0.002, sides: 6 })
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
        k.ball('skin', `hand.${side}`, [0, 0, 0], f.armW * 1.2)
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
        k.ball(BONE, `hand.${side}`, [0, 0, 0], f.armW * 1.9)
      }
    },
  },
]

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

const LEGS = [
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

// ── Weapons (main hand) ───────────────────────────────────────────────────────────────

function handle(k, j, from, to, r = 0.035, colour = 'wood') {
  k.tube(colour, j, [0, (from + to) / 2, 0], r, to - from, { sides: 8 })
}

// A straight blade with a cross guard: swords and daggers.
function blade(k, j, s, { length, width, guard }, colour = 'metal') {
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
const bladeShape = [sl('length', 'Long', 0.5, 1.8), sl('width', 'Wide', 0.5, 2), sl('guard', 'Guard', 0.3, 2)]

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

const WEAPONS = [
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

const OFF_HAND = [
  {
    id: 'round-shield',
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

const BACKS = [
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

// ── Tails ─────────────────────────────────────────────────────────────────────────────

// A chain of segments bending as they go: returns each joint's name and size.
function chain(k, s, n, colour, { droop = -25, curl = 12, round = false, r0 = 0.09 } = {}) {
  const seg = (0.7 * s.length) / n
  let j = k.group('tail', [0, 0, 0], [droop, 0, 0])
  const links = []
  for (let i = 0; i < n; i++) {
    const r = r0 * s.thick * (1 - i / (n + 1))
    if (round) k.ball(colour, j, [0, 0, -seg / 2], r * 1.3, { scale: [1, 1, 1.3] })
    else k.limb(colour, j, [0, 0, 0], [0, 0, -seg], r, { tip: r * 0.85, ends: i === 0 })
    links.push({ j, r, seg })
    j = k.group(j, [0, 0, -seg], [curl, 0, 0])
  }
  return { end: j, links }
}

const TAILS = [
  {
    id: 'lizard-tail',
    name: 'Lizard tail',
    emoji: '🦎',
    shape: [sl('length', 'Long', 0.5, 2), sl('thick', 'Thick', 0.5, 1.8)],
    build: (k, s) => chain(k, s, 5, 'skin'),
  },
  {
    id: 'dragon-tail',
    name: 'Dragon tail',
    emoji: '🐉',
    shape: [sl('length', 'Long', 0.5, 2), sl('thick', 'Thick', 0.5, 1.8)],
    build(k, s) {
      const { end, links } = chain(k, s, 5, 'skin')
      for (const { j, r, seg } of links) k.cone('trim', j, [0, r * 0.9, -seg / 2], 0.04 * s.thick, 0.1 * s.thick, { rot: [-40, 0, 0], sides: 5, scale: [0.5, 1, 1] })
      k.flat('trim', end, [0, 0, 0], [[0, 0.02], [0.1, -0.06], [0, -0.22], [-0.1, -0.06]].map(([x, y]) => [x * s.thick, y * s.thick]), 0.03, { rot: [90, 0, 0] })
    },
  },
  {
    id: 'fox-tail',
    name: 'Fluffy tail',
    emoji: '🦊',
    shape: [sl('length', 'Long', 0.5, 2), sl('thick', 'Fluffy', 0.5, 1.8)],
    build(k, s) {
      const { end } = chain(k, s, 4, 'hair', { droop: -10, curl: 22, round: true, r0: 0.1 })
      k.ball('#f4f4f5', end, [0, 0, -0.02], 0.08 * s.thick)
    },
  },
  {
    id: 'devil-tail',
    name: 'Devil tail',
    emoji: '😈',
    shape: [sl('length', 'Long', 0.5, 2), sl('thick', 'Thick', 0.5, 1.8)],
    build(k, s) {
      const { end } = chain(k, s, 5, 'skin', { droop: -35, curl: 16, r0: 0.03 })
      k.flat('skin', end, [0, 0, 0], [[0, 0.01], [0.08, -0.05], [0, -0.14], [-0.08, -0.05]].map(([x, y]) => [x * s.thick, y * s.thick]), 0.025, { rot: [90, 0, 0] })
    },
  },
  {
    id: 'scorpion-tail',
    name: 'Scorpion tail',
    emoji: '🦂',
    shape: [sl('length', 'Long', 0.5, 2), sl('thick', 'Thick', 0.5, 1.8)],
    build(k, s) {
      const { end } = chain(k, s, 6, 'skin', { droop: 10, curl: 34, r0: 0.06, round: true })
      k.ball('trim', end, [0, 0, -0.03], 0.06 * s.thick)
      k.cone('metal', end, [0, -0.03, -0.1], 0.03 * s.thick, 0.12 * s.thick, { rot: [-120, 0, 0], sides: 6 })
    },
  },
]

// ── Faces (on the head: beards, masks, goggles) ───────────────────────────────────────

const FACES = [
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

// ── Magic (all around the figure, from the floor up) ──────────────────────────────────

const heightOf = (f) => f.LL + f.foot + f.BH + f.HS
const around = (n, r, y = 0, turn = 0) => [...Array(n)].map((_, i) => {
  const a = (i / n) * Math.PI * 2 + turn
  return [Math.sin(a) * r, y, Math.cos(a) * r]
})

const EFFECTS = [
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

// ── Slots ─────────────────────────────────────────────────────────────────────────────

export const SLOTS = [
  { key: 'body', label: 'Body', emoji: '👕' },
  { key: 'legs', label: 'Legs', emoji: '👖' },
  { key: 'arms', label: 'Arms', emoji: '💪' },
  { key: 'head', label: 'Head', emoji: '🙂' },
  { key: 'hat', label: 'Hat & hair', emoji: '🎩', optional: true },
  { key: 'face', label: 'Face', emoji: '🧔', optional: true },
  { key: 'hand', label: 'Weapon', emoji: '⚔️', optional: true },
  { key: 'offhand', label: 'Other hand', emoji: '🛡️', optional: true },
  { key: 'back', label: 'Back', emoji: '🦇', optional: true },
  { key: 'tail', label: 'Tail', emoji: '🦎', optional: true },
  { key: 'fx', label: 'Magic', emoji: '✨', optional: true },
]

export const PARTS = {
  body: BODIES,
  legs: LEGS,
  arms: ARMS,
  head: HEADS,
  hat: HATS,
  face: FACES,
  hand: WEAPONS,
  offhand: OFF_HAND,
  back: BACKS,
  tail: TAILS,
  fx: EFFECTS,
}

// A part's slider values: saved ones kept in range, the rest at their normal setting.
export function shapeOf(part, saved = {}) {
  return Object.fromEntries(
    (part.shape ?? []).map(({ key, value, min, max }) => {
      const v = saved?.[key]
      return [key, typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : value]
    }),
  )
}

export function findPart(slot, id) {
  return PARTS[slot]?.find((p) => p.id === id) ?? null
}
