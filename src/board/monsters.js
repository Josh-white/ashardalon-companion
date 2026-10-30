// Monster and villain turns on the virtual board: the board answers the card's questions,
// picks who it attacks, and works out where it moves. The screen still shows each step,
// and "Move by hand" fixes anything the app gets wrong.

import { baseId, key, unexploredEdges } from './grid.js'
import { adjacent, closest, distances, tilesBetween } from './paths.js'
import { heroesFor, seesInvisible, tacticHolds } from './tactics.js'
import { boardGrid } from './play.js'
import { trapOnWay } from './heroTokens.js'

// The figures a monster can go after, with their squares: villagers first (a monster picks
// one when it can), then heroes still in the fight and not in the Astral Refuge.
export function boardTargets(state) {
  const tokens = state.board?.tokens ?? {}
  const villagers = (state.villagers ?? []).filter((v) => !v.removed && v.hp > 0)
  const heroes = state.heroes.filter((h) => h.hp > 0 && !h.tokens?.refuge)
  return [...villagers.map((v) => ({ ...v, villager: true })), ...heroes]
    .filter((f) => tokens[f.id])
    .map((f) => ({ id: f.id, at: tokens[f.id], hp: f.hp, villager: Boolean(f.villager), invisible: Boolean(f.tokens?.invisible) }))
}

// The figures one tactic step can go after: an invisible hero only counts for the steps
// that don't look for the closest hero (and for "a tile with no Heroes", where they still stand).
function stepTargets(state, step) {
  const all = boardTargets(state)
  return seesInvisible(step) || step?.when === 'aloneByUnexploredEdge' ? all : all.filter((f) => !f.invisible)
}

const squareOf = (state, id) => state.board?.tokens?.[id] ?? null

// Where a move really ends: on a Blade Barrier or Caltrop token along the way, if there is one.
function stopOnTrap(state, tokenId, to) {
  return (to && trapOnWay(state, squareOf(state, tokenId), to)) ?? to
}

// Squares other figures stand on, so a monster won't end on one.
function takenSquares(state, exceptId) {
  return new Set(Object.entries(state.board.tokens).filter(([id]) => id !== exceptId).map(([, at]) => key(at)))
}

// The first step of the card's tactics whose question the board says yes to (a step with no
// question always does). Null when the monster isn't on the board, so the screen asks instead.
export function boardStep(state, monster, tactics = monster.card?.tactics ?? [], tokenId = monster.id) {
  const at = squareOf(state, tokenId)
  if (!state.board || !at) return null
  const grid = boardGrid(state.board)
  const index = tactics.findIndex((step) => tacticHolds(step.when, grid, at, stepTargets(state, step)))
  return index === -1 ? tactics.length : index
}

// The closest of some figures by walking, villagers first. An invisible hero is never the
// closest while someone else will do.
function closestOf(grid, at, figures) {
  const pool = figures.some((f) => !f.invisible) ? figures.filter((f) => !f.invisible) : figures
  const near = closest(grid, at, pool)
  return near.find((f) => f.villager) ?? near[0] ?? pool[0] ?? null
}

// Who the step attacks: ids of the figures the board picks. The players can still change it.
export function boardTargetIds(state, monster, step, tokenId = monster.id) {
  const at = squareOf(state, tokenId)
  if (!state.board || !at || !step) return []
  const grid = boardGrid(state.board)
  const all = stepTargets(state, step)
  const inReach = step.when ? heroesFor(step.when, grid, at, all) : all
  if (inReach.length === 0) return []
  if (step.targets === 'all' || step.target === 'mostHp') return inReach.map((f) => f.id)
  if (step.target === 'farthest') {
    const far = distances(grid, at)
    return [[...inReach].sort((a, b) => (far.get(key(b.at)) ?? Infinity) - (far.get(key(a.at)) ?? Infinity))[0].id]
  }
  if (step.target === 'adjacent') {
    const next = inReach.filter((f) => adjacent(grid, at, f.at))
    if (next.length > 0) return [closestOf(grid, at, next).id]
  }
  return [closestOf(grid, at, inReach).id]
}

// The free square next to a figure that the monster can walk to soonest (or stays put when
// it is already next to it).
export function squareNextTo(state, monsterId, targetAt) {
  const at = squareOf(state, monsterId)
  if (!state.board || !at || !targetAt) return null
  const grid = boardGrid(state.board)
  if (adjacent(grid, at, targetAt)) return at
  const taken = takenSquares(state, monsterId)
  const walk = distances(grid, at)
  const spots = distances(grid, targetAt, { limit: 1 })
  const spot = [...spots.keys()]
    .filter((k) => k !== key(targetAt) && !taken.has(k))
    .sort((a, b) => (walk.get(a) ?? Infinity) - (walk.get(b) ?? Infinity))
    .map((k) => k.split(',').map(Number))[0] ?? null
  return stopOnTrap(state, monsterId, spot)
}

// "Moves 1 tile toward the closest hero": onto the next tile along the way, on its free
// square closest to the hero. A hero on the monster's own tile (or the next one) gets the
// monster next to them instead.
export function squareToward(state, monsterId, targetAt, tiles = 1) {
  const at = squareOf(state, monsterId)
  if (!state.board || !at || !targetAt) return null
  const grid = boardGrid(state.board)
  const apart = tilesBetween(grid, at, targetAt)
  if (apart === Infinity) return at
  if (apart <= tiles) return squareNextTo(state, monsterId, targetAt)
  const taken = takenSquares(state, monsterId)
  const toHero = distances(grid, targetAt)
  const goal = apart - tiles
  const spots = [...grid.values()]
    .filter((sq) => sq.floor && !taken.has(key([sq.x, sq.y])) && toHero.has(key([sq.x, sq.y])))
    .filter((sq) => tilesBetween(grid, [sq.x, sq.y], targetAt) === goal && tilesBetween(grid, at, [sq.x, sq.y]) === tiles)
    .sort((a, b) => toHero.get(key([a.x, a.y])) - toHero.get(key([b.x, b.y])))
  return spots.length > 0 ? stopOnTrap(state, monsterId, [spots[0].x, spots[0].y]) : at
}

// "Moves to the closest square that isn't next to a hero."
export function squareAway(state, monsterId) {
  const at = squareOf(state, monsterId)
  if (!state.board || !at) return null
  const grid = boardGrid(state.board)
  const taken = takenSquares(state, monsterId)
  const heroes = boardTargets(state)
  const clear = (k) => {
    const sq = k.split(',').map(Number)
    return !taken.has(k) && !heroes.some((h) => adjacent(grid, sq, h.at))
  }
  const found = [...distances(grid, at)].sort((a, b) => a[1] - b[1]).find(([k]) => clear(k))
  return found ? stopOnTrap(state, monsterId, found[0].split(',').map(Number)) : at
}

// The hero a monster moving "toward the closest hero" heads for. Null when the only heroes
// left are invisible: then it has nobody to go after.
export function closestTarget(state, monsterId) {
  const at = squareOf(state, monsterId)
  if (!state.board || !at) return null
  return closestOf(boardGrid(state.board), at, stepTargets(state, { move: 'toward' }))
}

// How far a power reaches, read from its card text before "Hit:": "an adjacent monster",
// "within 2 tiles", "on your tile". Null when the text doesn't say, or when the hero moves,
// swaps or is placed before choosing the monster (Charge), so every monster is offered.
export function powerRange(text) {
  const words = String(text ?? '').split(/hit:/i)[0].toLowerCase()
  const beforeMonster = words.split('monster')[0]
  if (/\bmove|\bswap|place your hero/.test(beforeMonster)) return null
  const within = /within (\d+) tiles?/.exec(words)
  if (within) return `within${Math.min(3, Number(within[1]))}`
  if (/adjacent/.test(words)) return 'adjacent'
  if (/(on|in) your tile|on the same tile/.test(words)) return 'sameTile'
  return null
}

// The monsters and villains a hero can reach with a range: any of a monster's figures will
// do. A monster with no token on the board is always offered.
export function foesInRange(state, heroId, range, foes) {
  const at = squareOf(state, heroId)
  if (!state.board || !at || !range) return foes
  const grid = boardGrid(state.board)
  const tokens = Object.entries(state.board.tokens)
  return foes.filter((foe) => {
    const mine = tokens.filter(([id]) => baseId(id) === foe.id).map(([id, sq]) => ({ id, at: sq }))
    return mine.length === 0 || heroesFor(range, grid, at, mine).length > 0
  })
}

// How far a monster is from a hero, in the words magic weapons use: adjacent, within1 or far.
export function foeDistance(state, heroId, foeId) {
  const at = squareOf(state, heroId)
  if (!state.board || !at) return null
  const grid = boardGrid(state.board)
  const mine = Object.entries(state.board.tokens)
    .filter(([id]) => baseId(id) === foeId)
    .map(([id, sq]) => ({ id, at: sq }))
  if (mine.length === 0) return null
  if (heroesFor('adjacent', grid, at, mine).length > 0) return 'adjacent'
  if (heroesFor('within1', grid, at, mine).length > 0) return 'within1'
  return 'far'
}

// Monster and villain figures on the board (not objectives like the Vast Gate), with names.
function foeFigures(state) {
  const foes = new Map([...state.monsters, ...(state.villains ?? []).filter((v) => !v.defeated)].filter((m) => !m.objective).map((m) => [m.id, m]))
  return Object.entries(state.board.tokens)
    .filter(([id]) => foes.has(baseId(id)))
    .map(([id, at]) => ({ id, at, name: foes.get(baseId(id)).name }))
}

// Wrath of the Enemy: the monster closest to the hero that isn't on the hero's tile goes on a
// free square next to the hero (the one nearest where it stood). Null when the board can't
// tell or there's no such monster: { id, name, to }.
export function wrathPull(state, heroId) {
  const at = squareOf(state, heroId)
  if (!state.board || !at) return null
  const grid = boardGrid(state.board)
  const tile = grid.get(key(at))?.area
  const fromHero = distances(grid, at)
  const far = (f) => fromHero.get(key(f.at)) ?? Infinity
  const foe = foeFigures(state)
    .filter((f) => grid.get(key(f.at))?.area !== tile)
    .sort((a, b) => far(a) - far(b))[0]
  if (!foe) return null
  const taken = takenSquares(state, foe.id)
  const fromFoe = distances(grid, foe.at)
  const to = [...distances(grid, at, { limit: 1 }).keys()]
    .filter((k) => k !== key(at) && !taken.has(k))
    .sort((a, b) => (fromFoe.get(a) ?? Infinity) - (fromFoe.get(b) ?? Infinity))[0]
  return to ? { id: foe.id, name: foe.name, to: to.split(',').map(Number) } : null
}

// Blinding Bomb: after the attack, each Sentry monster moves 1 tile toward the closest tile
// with an unexplored edge (one already on such a tile stays). Returns [{ id, to }].
export function sentryMoves(state) {
  if (!state.board) return []
  const grid = boardGrid(state.board)
  const edges = unexploredEdges(grid)
  const sentries = new Set(state.monsters.filter((m) => (m.card?.types ?? []).some((t) => /^sentry$/i.test(t))).map((m) => m.id))
  const out = []
  let next = state
  for (const [id, at] of Object.entries(state.board.tokens)) {
    if (!sentries.has(baseId(id))) continue
    const area = grid.get(key(at))?.area
    if (edges.some((e) => e.area === area)) continue
    const far = distances(grid, at)
    const goal = edges.flatMap((e) => e.squares).sort((a, b) => (far.get(key(a)) ?? Infinity) - (far.get(key(b)) ?? Infinity))[0]
    if (!goal || !far.has(key(goal))) continue
    // The next tile over: onto its free square nearest the monster; farther: 1 tile along the way.
    const goalArea = grid.get(key(goal)).area
    const taken = takenSquares(next, id)
    const to =
      tilesBetween(grid, at, goal) <= 1
        ? [...grid.values()].filter((sq) => sq.area === goalArea && sq.floor && !taken.has(key([sq.x, sq.y])) && far.has(key([sq.x, sq.y]))).sort((a, b) => far.get(key([a.x, a.y])) - far.get(key([b.x, b.y]))).map((sq) => [sq.x, sq.y])[0]
        : squareToward(next, id, goal, 1)
    if (!to || key(to) === key(at)) continue
    out.push({ id, to })
    next = { ...next, board: { ...next.board, tokens: { ...next.board.tokens, [id]: to } } }
  }
  return out
}
