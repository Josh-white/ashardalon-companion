// The virtual board inside the saved game (state.board), for solo games played without
// the physical tiles. Normal games have no board (null) and nothing here runs for them.
//
// state.board = {
//   defs: { [tileId]: tile layout },        the layouts of the tiles on the board
//   tiles: [{ uid, tileId, at, turn }],     where each tile sits (state/grid.js)
//   tokens: { [figure id]: [x, y] },        heroes, monsters and villains on their squares
// }
// The moves the active hero has made this turn live in state.turn.boardMoves, so a new
// turn starts with none.

import { buildGrid, key } from './grid.js'
import { reachable } from './paths.js'

// The board's grid, worked out once per board (the board object changes on every move).
const grids = new WeakMap()
export function boardGrid(board) {
  if (!grids.has(board)) grids.set(board, buildGrid(board, Object.values(board.defs)))
  return grids.get(board)
}

// The squares next to the Start tile's stairs where the heroes begin, in turn order.
function startSquares(def) {
  const stairs = def.features.find((f) => f.type === 'stairs')?.at ?? []
  const onStairs = new Set(stairs.map(key))
  const floor = []
  def.rows.forEach((row, y) => [...row].forEach((ch, x) => ch !== '#' && !onStairs.has(key([x, y])) && floor.push([x, y])))
  const touching = (sq) => stairs.some(([sx, sy]) => Math.max(Math.abs(sx - sq[0]), Math.abs(sy - sq[1])) === 1)
  return [...floor.filter(touching), ...floor.filter((sq) => !touching(sq))]
}

// A new board: the Start tile with the heroes next to its stairs. Null when the tile
// layouts have no start tile.
export function newBoard(tiles, heroes) {
  const start = (Array.isArray(tiles) ? tiles : []).find((t) => t.id === 'start') ?? tiles?.find((t) => t.kind === 'start')
  if (!start) return null
  const spots = startSquares(start)
  return {
    defs: { [start.id]: start },
    tiles: [{ uid: 'start', tileId: start.id, at: [0, 0], turn: 0 }],
    tokens: Object.fromEntries(heroes.map((h, i) => [h.id, spots[i % spots.length]])),
  }
}

const has = (hero, condition) => (hero.conditions ?? []).includes(condition)

// How far the hero walks in one move: Slowed heroes only 2 squares.
export const moveSpeed = (hero) => (has(hero, 'Slowed') ? Math.min(2, hero.speed ?? 6) : hero.speed ?? 6)

// Whether the active hero can still move this Hero Phase: move twice, or move and attack
// (in either order). A Dazed hero gets one action; an Immobilized hero can't move.
export function movesLeft(state, hero) {
  if (!state.board || state.status !== 'playing' || state.turn.phase !== 0) return 0
  if (state.heroes[state.turn.heroIndex]?.id !== hero.id || hero.hp <= 0 || has(hero, 'Immobilized')) return 0
  const last = state.turn.lastAttack
  const attacked = Boolean(state.turn.attackSpent || (last && last.heroId === hero.id && !last.bonus && !last.free))
  const actions = has(hero, 'Dazed') ? 1 : 2
  return Math.max(0, actions - (attacked ? 1 : 0) - (state.turn.boardMoves ?? 0))
}

// Squares with a figure on them, and those of monsters and villains (which heroes can't walk through).
function occupied(state, exceptId) {
  const foes = new Set([...state.monsters, ...(state.villains ?? [])].map((m) => m.id))
  const taken = new Set()
  const stops = new Set()
  for (const [id, at] of Object.entries(state.board.tokens)) {
    if (id === exceptId) continue
    taken.add(key(at))
    if (foes.has(id)) stops.add(key(at))
  }
  return { taken, stops }
}

// The squares the hero can move to now (as "x,y" keys), or none.
export function heroReach(state, hero) {
  const at = state.board?.tokens[hero.id]
  if (!at || movesLeft(state, hero) === 0) return []
  return reachable(boardGrid(state.board), at, moveSpeed(hero), occupied(state, hero.id))
}

const placeToken = (state, id, at) => ({ ...state, board: { ...state.board, tokens: { ...state.board.tokens, [id]: [at[0], at[1]] } } })

// A hero's move in their Hero Phase: only to a square they can reach, and it uses up a move.
export function moveHero(state, action) {
  const hero = state.heroes.find((h) => h.id === action.heroId)
  const to = Array.isArray(action.to) ? action.to : null
  if (!hero || !to || !heroReach(state, hero).includes(key(to))) return state
  const moved = placeToken(state, hero.id, to)
  return { ...moved, turn: { ...moved.turn, boardMoves: (state.turn.boardMoves ?? 0) + 1 } }
}

// Moving any figure by hand, for anything the app doesn't move itself yet: onto any free
// floor square. It doesn't use up a move.
export function moveToken(state, action) {
  if (!state.board || !Array.isArray(action.to)) return state
  const figures = [...state.heroes, ...state.monsters, ...(state.villains ?? []), ...(state.villagers ?? [])]
  if (!figures.some((f) => f.id === action.id)) return state
  const square = boardGrid(state.board).get(key(action.to))
  if (!square?.floor || occupied(state, action.id).taken.has(key(action.to))) return state
  return placeToken(state, action.id, action.to)
}

// Figures that left play take their token with them.
export function pruneTokens(state) {
  const board = state.board
  if (!board) return state
  const live = new Set(
    [...state.heroes, ...state.monsters, ...(state.villains ?? []).filter((v) => !v.defeated), ...(state.villagers ?? []).filter((v) => !v.removed)].map((f) => f.id),
  )
  const ids = Object.keys(board.tokens)
  if (ids.every((id) => live.has(id))) return state
  return { ...state, board: { ...board, tokens: Object.fromEntries(Object.entries(board.tokens).filter(([id]) => live.has(id))) } }
}
