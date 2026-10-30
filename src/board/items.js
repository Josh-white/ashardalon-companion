import { key } from './grid.js'
import { adjacent } from './paths.js'
import { boardGrid } from './play.js'
import { newId, withLog } from '../state/gameHelpers.js'

// Things lying on the virtual board that aren't figures: Treasure tokens (Hidden Treasure)
// for now. They live in state.board.items as { id, kind, at }, with `at` null until a
// player taps the square to put it on.

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
