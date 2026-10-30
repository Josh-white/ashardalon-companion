import { key } from './grid.js'
import { adjacent, tilesBetween } from './paths.js'
import { boardGrid, movesLeft, occupied, placeToken } from './play.js'
import { newId, withLog } from '../state/gameHelpers.js'

// Things lying on the virtual board that aren't figures: Treasure tokens (Hidden Treasure)
// and the Flying Carpet. They live in state.board.items as { id, kind, at }, with `at` null
// until a player taps the square to put it on.

const items = (state) => state.board?.items ?? []
const withItems = (state, list) => ({ ...state, board: { ...state.board, items: list } })

// A Treasure token in hand, waiting for its square (Hidden Treasure, or put down by hand).
export function addTreasureToken(state) {
  if (!state.board) return state
  return withItems(state, [...items(state), { id: newId('item'), kind: 'treasure', at: null }])
}

// Puts a token on a floor square, or moves it there. Only one thing per square.
export function placeItem(state, action) {
  const item = items(state).find((i) => i.id === action.id)
  const to = Array.isArray(action.to) ? action.to : null
  if (!item || !to || !boardGrid(state.board).get(key(to))?.floor) return state
  if (items(state).some((i) => i.id !== item.id && i.at && key(i.at) === key(to))) return state
  return withItems(state, items(state).map((i) => (i.id === item.id ? { ...i, at: [to[0], to[1]] } : i)))
}

export function removeItem(state, action) {
  const item = items(state).find((i) => i.id === action.id)
  return item ? withItems(state, items(state).filter((i) => i.id !== item.id)) : state
}

// The Treasure token a hero can pick up: on or next to the hero's square, with no monster
// or villain on that token's tile. Null when there isn't one.
export function treasureInReach(state, hero) {
  const at = state.board && !hero.tokens?.refuge ? state.board.tokens[hero.id] : null
  if (!at) return null
  const grid = boardGrid(state.board)
  const areaOf = (sq) => grid.get(key(sq))?.area
  const foes = new Set([...state.monsters, ...(state.villains ?? []).filter((v) => !v.defeated)].filter((m) => !m.objective).map((m) => m.id))
  const foeAreas = new Set(Object.entries(state.board.tokens).filter(([id]) => foes.has(id.split('#')[0])).map(([, sq]) => areaOf(sq)))
  return items(state).find((i) => i.kind === 'treasure' && i.at && (key(i.at) === key(at) || adjacent(grid, at, i.at)) && !foeAreas.has(areaOf(i.at))) ?? null
}

// A hero picks up a Treasure token: a treasure card to draw, or in a campaign a token from
// the stack. It waits while another treasure is still being handed out.
export function pickUpTreasure(state, action) {
  const item = items(state).find((i) => i.id === action.id && i.kind === 'treasure')
  const hero = state.heroes.find((h) => h.id === action.heroId)
  if (!item || !hero || state.treasure || state.turn.treasureOwed || state.turn.tokenOwed) return state
  const owed = state.campaign ? { tokenOwed: hero.id } : { treasureOwed: hero.id }
  const next = removeItem(state, { id: item.id })
  return withLog({ ...next, turn: { ...next.turn, ...owed } }, `${hero.name} picked up the Treasure token.`)
}

// The Flying Carpet: using the item puts its marker in hand, waiting for a square. There is
// only one carpet, and once it's down it stays (the card doesn't flip).
export const carpetOf = (state) => items(state).find((i) => i.kind === 'carpet') ?? null

export function addCarpet(state) {
  if (!state.board || carpetOf(state)) return state
  return withItems(state, [...items(state), { id: newId('item'), kind: 'carpet', at: null }])
}

// The hero standing on the carpet, if any (one figure per square).
export function carpetRider(state) {
  const carpet = carpetOf(state)
  if (!carpet?.at) return null
  return state.heroes.find((h) => state.board.tokens[h.id] && key(state.board.tokens[h.id]) === key(carpet.at)) ?? null
}

// Whether the active hero can fly the carpet now: standing on it, in their Hero Phase, with
// a move left ("instead of moving").
export function canFlyCarpet(state, hero) {
  return Boolean(hero) && carpetRider(state)?.id === hero.id && movesLeft(state, hero) > 0
}

// Where the carpet can fly: a free floor square on its own tile or a tile next to it, with
// no other marker on that square.
export function carpetTargets(state) {
  const carpet = carpetOf(state)
  if (!carpet?.at) return []
  const grid = boardGrid(state.board)
  const rider = carpetRider(state)
  const { taken } = occupied(state, rider?.id)
  const others = new Set(items(state).filter((i) => i.id !== carpet.id && i.at).map((i) => key(i.at)))
  return [...grid.values()]
    .filter((sq) => sq.floor && key([sq.x, sq.y]) !== key(carpet.at) && !taken.has(key([sq.x, sq.y])) && !others.has(key([sq.x, sq.y])))
    .filter((sq) => tilesBetween(grid, carpet.at, [sq.x, sq.y]) <= 1)
    .map((sq) => key([sq.x, sq.y]))
}

// The hero on the carpet flies it instead of moving: the carpet and its rider go to the new
// square, and it uses up one of the hero's moves.
export function flyCarpet(state, action) {
  const carpet = carpetOf(state)
  const hero = state.heroes[state.turn.heroIndex]
  const to = Array.isArray(action.to) ? action.to : null
  if (!carpet || !to || !canFlyCarpet(state, hero) || !carpetTargets(state).includes(key(to))) return state
  const moved = withItems(placeToken(state, hero.id, to), items(state).map((i) => (i.id === carpet.id ? { ...i, at: [to[0], to[1]] } : i)))
  return withLog({ ...moved, turn: { ...moved.turn, boardMoves: (state.turn.boardMoves ?? 0) + 1 } }, `${hero.name} flew the Flying Carpet.`)
}
