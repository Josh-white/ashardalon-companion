import { sl } from './shared.js'

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

export const TAILS = [
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
