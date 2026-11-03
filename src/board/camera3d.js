// Where the 3D board's camera looks (Board3D.jsx), as plain numbers so it can be tested.
// A shot is { target: [x, z], yaw, tilt, dist }: the point looked at on the floor, the
// direction the camera sits in from it (yaw, radians around; 0 = toward +z), how far it
// leans from straight down (tilt) and how far away it is (dist).
//
// Views (the 🎥 button): 'top' looks over the dungeon the way the board was fitted,
// 'corner' along its diagonal (the squares look like diamonds), 'hero' from behind the
// hero whose turn it is, toward the nearest monster.

export const VIEWS = ['top', 'corner', 'hero']
export const VIEW_LABELS = { top: 'Top', corner: 'Corner', hero: 'Behind hero' }

export const CORNER_TILT = 0.95
export const HERO_TILT = 1.05
export const CLOSE_TILT = 1.0
// Behind the hero: how far back the camera sits, and how far toward the foe it looks.
export const HERO_DIST = 5.5
const AHEAD = 0.45
const MAX_AHEAD = 2.2

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]]
const len = (v) => Math.hypot(v[0], v[1])
const yawOf = (v) => Math.atan2(v[0], v[1])

// The angle from `a` to `b` the short way round (-PI..PI).
export function turnBy(a, b) {
  return ((((b - a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI
}

const nearest = (from, others) => {
  let best = null
  for (const o of others) if (!best || len(sub(o, from)) < len(sub(best, from))) best = o
  return best
}

// Behind `me`, looking toward the nearest of `foes` (a little past halfway, so both show).
// With no foe it keeps `yaw` and looks at `me`.
export function behindShot(me, foes, { yaw = 0, dist = HERO_DIST } = {}) {
  const foe = nearest(me, foes)
  const d = foe ? sub(foe, me) : [0, 0]
  const far = len(d)
  if (!foe || far < 1e-3) return { target: me, yaw, tilt: HERO_TILT, dist }
  const ahead = Math.min(MAX_AHEAD, far * AHEAD) / far
  // The camera sits on the hero's side, away from the foe.
  return { target: [me[0] + d[0] * ahead, me[1] + d[1] * ahead], yaw: yawOf([-d[0], -d[1]]), tilt: HERO_TILT, dist }
}

// The rest shot for `view`, on the hero `me`: 'top' and 'corner' keep the screen's own
// angle and zoom (`keep`), 'hero' goes behind the hero.
export function restShot(view, me, foes, keep) {
  if (view === 'hero') return behindShot(me, foes, { yaw: keep.yaw })
  return { ...keep, target: me }
}

// The angle a view starts at when picked: `fitYaw` is the way the fitted board faces.
export function viewAngles(view, fitYaw, keep) {
  if (view === 'corner') return { ...keep, yaw: fitYaw + Math.PI / 4, tilt: CORNER_TILT }
  if (view === 'top') return { ...keep, yaw: fitYaw, tilt: keep.fitTilt ?? keep.tilt }
  return keep
}

// An attack seen from the side, close in, with attacker and target both in the picture.
// The camera takes whichever side is nearer where it already is (`yaw`).
export function closeUpShot(from, to, yaw) {
  const d = sub(to, from)
  const far = len(d)
  const target = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2]
  const dist = Math.max(3.6, Math.min(9, far * 1.1 + 2.6))
  if (far < 1e-3) return { target, yaw, tilt: CLOSE_TILT, dist }
  const side = yawOf([-d[1], d[0]])
  const other = side + Math.PI
  return { target, yaw: Math.abs(turnBy(yaw, side)) <= Math.abs(turnBy(yaw, other)) ? side : other, tilt: CLOSE_TILT, dist }
}

// A monster or villain taking its turn: the camera glides over to it. Behind the hero, it
// looks from behind the monster at the hero it goes for; otherwise it keeps its angle.
export function tourShot(view, monster, heroes, keep) {
  if (view === 'hero') return behindShot(monster, heroes, { yaw: keep.yaw })
  return { ...keep, target: monster, dist: Math.min(keep.dist, 6.5) }
}
