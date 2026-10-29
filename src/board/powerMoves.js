// Powers that move figures on the virtual board: Charge, Into the Fray, a swap, a monster
// pulled next to you, Spectral Ram... A power puts its moves in state.turn.boardMove:
//   { heroId, source, attacked: [monster ids], steps: [step, ...] }
// and the board does the first step, then the next. A step says which figure moves (`pick`)
// and where it can go (`to`):
//   pick  self, heroOnTile, heroWithin1/2 (another hero), monsterWithin1/2/3, monsterOnTile, attacked
//   to    squares (walk `n` squares, or 'speed'), nextToSelf, nextToHeroWithin2, tileWithin (`n` tiles
//         of the hero, or of the figure itself with ref: 'piece'), ownTile, adjacentTile, swap
// `hit: true` steps only happen when the attack hit.

import { key } from './grid.js'
import { distances, reachable, tilesBetween } from './paths.js'
import { heroesFor } from './tactics.js'
import { boardGrid, moveSpeed, occupied, placeToken } from './play.js'

const baseId = (id) => id.split('#')[0]
const parse = (k) => k.split(',').map(Number)

// Queues a power's moves (nothing happens without a board or with no steps left).
export function queueMoves(state, hero, power, steps, { attacked = [], hit = false } = {}) {
  if (!state.board || !hero || !Array.isArray(steps)) return state
  const todo = steps.filter((s) => !s.hit || hit)
  if (todo.length === 0) return state
  return settle({ ...state, turn: { ...state.turn, boardMove: { heroId: hero.id, source: power?.name ?? '', attacked, steps: todo } } })
}

const step = (state) => state.turn.boardMove?.steps?.[0] ?? null

// Tokens of figures: heroes still standing, and every monster or villain figure.
function heroTokens(state) {
  return state.heroes.filter((h) => h.hp > 0 && state.board.tokens[h.id]).map((h) => ({ id: h.id, at: state.board.tokens[h.id] }))
}
function foeTokens(state) {
  const foes = new Set([...state.monsters, ...(state.villains ?? []).filter((v) => !v.defeated)].map((f) => f.id))
  return Object.entries(state.board.tokens).filter(([id]) => foes.has(baseId(id))).map(([id, at]) => ({ id, at }))
}

// Which figures the current step can move (token ids).
export function moveChoices(state) {
  const move = state.turn.boardMove
  const s = step(state)
  const self = move && state.board?.tokens[move.heroId]
  if (!s || !self) return []
  const grid = boardGrid(state.board)
  const tileOf = (at) => grid.get(key(at))?.area
  const near = (list, when) => heroesFor(when, grid, self, list).map((f) => f.id)
  const others = heroTokens(state).filter((h) => h.id !== move.heroId)
  switch (s.pick) {
    case 'self':
      return [move.heroId]
    case 'heroOnTile':
      return heroTokens(state).filter((h) => tileOf(h.at) === tileOf(self)).map((h) => h.id)
    case 'heroWithin1':
    case 'heroWithin2':
      return near(others, s.pick === 'heroWithin1' ? 'within1' : 'within2')
    case 'monsterWithin1':
    case 'monsterWithin2':
    case 'monsterWithin3':
      return near(foeTokens(state), s.pick.replace('monsterW', 'w'))
    case 'monsterOnTile':
      return foeTokens(state).filter((f) => tileOf(f.at) === tileOf(self)).map((f) => f.id)
    case 'attacked':
      return foeTokens(state).filter((f) => (move.attacked ?? []).includes(baseId(f.id))).map((f) => f.id)
    default:
      return []
  }
}

// The squares (as "x,y") the chosen figure can go to, or for a swap the heroes it can swap with.
export function moveTargets(state, id) {
  const move = state.turn.boardMove
  const s = step(state)
  const at = state.board?.tokens[id]
  const self = move && state.board?.tokens[move.heroId]
  if (!s || !at || !self || !moveChoices(state).includes(id)) return []
  if (s.to === 'swap') return [key(at)]
  const grid = boardGrid(state.board)
  const { taken, stops } = occupied(state, id)
  const free = (k) => grid.get(k)?.floor && !taken.has(k)
  const all = [...grid.keys()].filter(free)
  const nextTo = (sq) => [...distances(grid, sq, { limit: 1 }).keys()].filter((k) => k !== key(sq) && free(k))
  const hero = state.heroes.find((h) => h.id === move.heroId)
  switch (s.to) {
    case 'squares': {
      const n = s.n === 'speed' ? moveSpeed(hero) : s.n ?? 1
      // Heroes can't walk through monsters; a moved monster can't walk through heroes.
      const isHero = state.heroes.some((h) => h.id === id)
      const blocked = isHero ? stops : new Set(heroTokens(state).map((h) => key(h.at)))
      return reachable(grid, at, n, { stops: blocked, taken })
    }
    case 'nextToSelf':
      return nextTo(self)
    case 'nextToHeroWithin2': {
      const others = heroTokens(state).filter((h) => h.id !== move.heroId)
      const near = heroesFor('within2', grid, self, others)
      return [...new Set(near.flatMap((h) => nextTo(h.at)))]
    }
    case 'tileWithin': {
      const ref = s.ref === 'piece' ? at : self
      return all.filter((k) => tilesBetween(grid, ref, parse(k)) <= (s.n ?? 1))
    }
    case 'ownTile': {
      const tile = grid.get(key(self))?.area
      return all.filter((k) => grid.get(k).area === tile)
    }
    case 'adjacentTile':
      return all.filter((k) => tilesBetween(grid, at, parse(k)) === 1)
    default:
      return []
  }
}

const nextStep = (state) => {
  const move = state.turn.boardMove
  const steps = (move?.steps ?? []).slice(1)
  return settle({ ...state, turn: { ...state.turn, boardMove: steps.length > 0 ? { ...move, steps } : null } })
}

// Steps with nothing to move (the monster Distracting Jab hit was defeated) are passed over.
function settle(state) {
  let next = state
  while (next.turn.boardMove && moveChoices(next).length === 0) {
    const move = next.turn.boardMove
    const steps = move.steps.slice(1)
    next = { ...next, turn: { ...next.turn, boardMove: steps.length > 0 ? { ...move, steps } : null } }
  }
  return next
}

// The player tapped where the figure goes (or, for a swap, the hero to swap with).
export function boardMove(state, action) {
  const s = step(state)
  const id = typeof action.id === 'string' ? action.id : action.heroId
  if (!s || !id) return state
  if (s.to === 'swap') {
    const me = state.turn.boardMove.heroId
    if (!moveChoices(state).includes(id)) return state
    const [a, b] = [state.board.tokens[me], state.board.tokens[id]]
    return nextStep(placeToken(placeToken(state, me, b), id, a))
  }
  const to = Array.isArray(action.to) ? action.to : null
  if (!to || !moveTargets(state, id).includes(key(to))) return state
  return nextStep(placeToken(state, id, to))
}

export const skipBoardMove = (state) => (state.turn.boardMove ? nextStep(state) : state)

// What the board asks for this step, in plain words.
const PICKS = {
  self: (me) => `${me}`,
  heroOnTile: (me) => `a hero on ${me}'s tile`,
  heroWithin1: () => 'a hero within 1 tile',
  heroWithin2: () => 'a hero within 2 tiles',
  monsterWithin1: () => 'a monster within 1 tile',
  monsterWithin2: () => 'a monster within 2 tiles',
  monsterWithin3: () => 'a monster within 3 tiles',
  monsterOnTile: (me) => `a monster on ${me}'s tile`,
  attacked: () => 'the monster',
}
export function movePrompt(state) {
  const move = state.turn.boardMove
  const s = step(state)
  if (!s) return ''
  const me = state.heroes.find((h) => h.id === move.heroId)?.name ?? 'the hero'
  const who = PICKS[s.pick]?.(me) ?? 'a figure'
  if (s.to === 'swap') return `Tap ${who} to swap places with ${me}.`
  return `Tap ${who}, then a lit square.`
}
