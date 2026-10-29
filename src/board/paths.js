// Distances on the virtual board: walking squares, counting tiles, and what is next to what.
// These answer the questions the monster cards ask ("within 1 tile", "next to", "closest hero").

import { STEP, key, openSide } from './grid.js'

// Rules still to check in the rulebook are options, so the answer is a one-line change.
export const DEFAULT_RULES = {
  // May a diagonal step pass a wall corner (only one of its two straight routes open)?
  cutCorners: false,
}

const DIAGONALS = [['N', 'E'], ['E', 'S'], ['S', 'W'], ['W', 'N']]

// Can a figure step from one square to the one next to it, corners included?
export function canStep(grid, a, b, rules = DEFAULT_RULES) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  if (Math.max(Math.abs(dx), Math.abs(dy)) !== 1) return false
  if (dx === 0 || dy === 0) {
    const side = dx === 1 ? 'E' : dx === -1 ? 'W' : dy === 1 ? 'S' : 'N'
    return openSide(grid, a, side)
  }
  if (!grid.get(key(b))?.floor) return false
  const h = dx === 1 ? 'E' : 'W'
  const v = dy === 1 ? 'S' : 'N'
  const via = (first, second) => {
    const mid = [a[0] + STEP[first][0], a[1] + STEP[first][1]]
    return openSide(grid, a, first) && openSide(grid, mid, second)
  }
  const routes = [via(h, v), via(v, h)]
  return rules.cutCorners ? routes.some(Boolean) : routes.every(Boolean)
}

const around = ([x, y]) => {
  const out = []
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (dx || dy) out.push([x + dx, y + dy])
  return out
}

// Squares next to each other: touching, corners included, with no wall between.
export const adjacent = (grid, a, b, rules) => canStep(grid, a, b, rules)

// Walking distance from one square to every square it can reach. `stops` are squares a
// figure can't walk through (monsters for a hero); `limit` stops the search early.
export function distances(grid, from, { stops = new Set(), limit = Infinity, rules = DEFAULT_RULES } = {}) {
  const seen = new Map([[key(from), 0]])
  let frontier = [from]
  for (let d = 1; d <= limit && frontier.length; d++) {
    const next = []
    for (const at of frontier) {
      for (const to of around(at)) {
        const k = key(to)
        if (seen.has(k) || stops.has(k) || !canStep(grid, at, to, rules)) continue
        seen.set(k, d)
        next.push(to)
      }
    }
    frontier = next
  }
  return seen
}

// The squares a hero can end a move on: within `speed` steps and not taken by anyone else.
export function reachable(grid, from, speed, { stops = new Set(), taken = new Set(), rules } = {}) {
  const found = distances(grid, from, { stops, limit: speed, rules })
  return [...found.keys()].filter((k) => k !== key(from) && !taken.has(k))
}

// Shortest walk between two squares, or Infinity when there is no way through.
export function stepsBetween(grid, a, b, options) {
  return distances(grid, a, options).get(key(b)) ?? Infinity
}

// The tiles (areas: the Start tile is two) that join each other through an opening.
function tileLinks(grid) {
  const links = new Map()
  for (const sq of grid.values()) {
    if (!links.has(sq.area)) links.set(sq.area, new Set())
    for (const side of ['E', 'S']) {
      const other = grid.get(key([sq.x + STEP[side][0], sq.y + STEP[side][1]]))
      if (!other || other.area === sq.area || !openSide(grid, [sq.x, sq.y], side)) continue
      links.get(sq.area).add(other.area)
      if (!links.has(other.area)) links.set(other.area, new Set())
      links.get(other.area).add(sq.area)
    }
  }
  return links
}

// How many tiles apart two squares are: 0 on the same tile, 1 on tiles joined by an opening.
export function tilesBetween(grid, a, b) {
  const from = grid.get(key(a))?.area
  const to = grid.get(key(b))?.area
  if (from === undefined || to === undefined) return Infinity
  const links = tileLinks(grid)
  const seen = new Map([[from, 0]])
  const queue = [from]
  while (queue.length) {
    const t = queue.shift()
    if (t === to) return seen.get(t)
    for (const n of links.get(t) ?? []) {
      if (seen.has(n)) continue
      seen.set(n, seen.get(t) + 1)
      queue.push(n)
    }
  }
  return Infinity
}

// The heroes closest to a square by walking distance: one, or all of those tied.
export function closest(grid, from, heroes, options) {
  const found = distances(grid, from, options)
  let best = Infinity
  let picks = []
  for (const hero of heroes) {
    const d = found.get(key(hero.at)) ?? Infinity
    if (d < best) [best, picks] = [d, [hero]]
    else if (d === best && d < Infinity) picks.push(hero)
  }
  return best === Infinity ? [] : picks
}

// A monster's move toward a hero: the first step of a shortest walk, `steps` squares long,
// stopping on the last free square. Returns the square it ends on.
export function walkToward(grid, from, target, steps, { stops = new Set(), taken = new Set(), rules } = {}) {
  const back = distances(grid, target, { stops, rules })
  let at = from
  for (let i = 0; i < steps; i++) {
    const here = back.get(key(at)) ?? Infinity
    const next = around(at)
      .filter((to) => canStep(grid, at, to, rules) && !taken.has(key(to)) && (back.get(key(to)) ?? Infinity) < here)
      .sort((p, q) => back.get(key(p)) - back.get(key(q)))[0]
    if (!next) break
    at = next
  }
  return at
}

// A clear straight line between two square centres: every square it passes is floor and
// no wall stands across it. Only for cards that ask for line of sight.
export function lineOfSight(grid, a, b) {
  const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) * 4
  let prev = a
  for (let i = 1; i <= n; i++) {
    const at = [Math.round(a[0] + ((b[0] - a[0]) * i) / n), Math.round(a[1] + ((b[1] - a[1]) * i) / n)]
    if (at[0] === prev[0] && at[1] === prev[1]) continue
    if (!canStep(grid, prev, at, { cutCorners: true })) return false
    prev = at
  }
  return true
}
