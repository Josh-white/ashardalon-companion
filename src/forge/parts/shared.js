// Shapes, colours and helpers the Hero Builder's parts share (src/forge/parts/*.js).

export const sl = (key, label, min = 0.5, max = 1.6, value = 1) => ({ key, label, min, max, value })
export const SIDES = [
  ['L', 1],
  ['R', -1],
]
export const BONE = '#e7e5e4'
export const IVORY = '#f5f0e1'
export const DARK = '#18181b'
export const FIRE = 'glow:#f97316'
export const FIRE_CORE = 'glow:#fde047'
export const mirror = (points) => points.map(([x, y]) => [-x, y])
export const scale = (points, s) => points.map(([x, y]) => [x * s, y * s])
// A point `d` along the direction `n` from `c`.
export const along = (c, n, d) => c.map((v, i) => v + n[i] * d)
export const deg = (d) => (d * Math.PI) / 180
