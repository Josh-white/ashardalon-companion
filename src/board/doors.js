// Closed Doors on the virtual board, for the adventures that use the door rules (Rulebook
// p. 15: The Closed Doors, Find the Secret Tunnel, Free the Captives).
//
// state.board.doors = [{ id, squares: [[x, y], ...], kind, reveal?, leadsTo? }]
//   squares   the board squares the token covers (a tile's pale door slabs, or the
//             triangle of the Horrid Chamber Entrance in The Closed Doors)
//   kind      null while face down; 'locked' once turned over and found locked
//   reveal    the adventure reveal that opening it sets off (the Secret Chamber door)
//   leadsTo   the chamber tiles behind it, which get their monsters when it opens
// state.board.doorTokens = Closed Door tokens left in the stack (the box has 8).
// A closed door shuts its squares in the grid (grid.js buildGrid), so heroes and monsters
// can't walk, see or count tiles through it. An opened door's token is discarded.

import { boardSquares, buildGrid, key } from './grid.js'
import { canStep } from './paths.js'
import { boardGrid } from './play.js'

export const DOOR_TOKENS = 8

// Whether the adventure in play uses the door rules.
export const doorsInPlay = (state) => Boolean(state.adventure?.card?.needs?.includes('doors'))

// Closed Door tokens still in the stack: a door adventure's board starts with all 8.
export const doorTokensLeft = (state) => state.board?.doorTokens ?? (doorsInPlay(state) ? DOOR_TOKENS : 0)

// The squares of a tile's triangle edge (the bottom of its own frame) that are open.
function triangleSquares(def) {
  const y = def.rows.length - 1
  return [...def.exits.S].flatMap((exit, x) => (exit === 'o' && def.rows[y][x] !== '#' ? [[x, y]] : []))
}

// Puts the top Closed Door tokens on a tile just laid: one on each door symbol, or with
// `triangle` one on its triangle. `extra` goes on each door (reveal, leadsTo). Stops when
// the stack runs out.
export function placeDoors(board, uid, { left, triangle = false, extra = {} }) {
  const placed = board.tiles.find((t) => t.uid === uid)
  const def = placed && board.defs[placed.tileId]
  if (!def) return board
  const spots = triangle ? [triangleSquares(def)] : (def.features ?? []).filter((f) => f.type === 'door').map((f) => f.at)
  const doors = [...(board.doors ?? [])]
  let tokens = left
  for (const [i, spot] of spots.entries()) {
    if (tokens <= 0 || spot.length === 0) break
    doors.push({ id: `door-${uid}-${i + 1}`, squares: boardSquares(placed, def, spot), kind: null, ...extra })
    tokens--
  }
  if (tokens === left) return board
  return { ...board, doors, doorTokens: tokens }
}

// The board with every door open, to tell what is next to a door's squares.
const openGrids = new WeakMap()
function openGrid(board) {
  if (!openGrids.has(board)) openGrids.set(board, buildGrid({ ...board, doors: [] }, Object.values(board.defs)))
  return openGrids.get(board)
}

// Is a square next to a door: one step from one of its squares if the door weren't there?
export function nextToDoor(board, door, at) {
  const grid = openGrid(board)
  return door.squares.some((sq) => canStep(grid, at, sq))
}

// The Closed Doors a hero can open or try to unlock: next to them, or anywhere on their
// tile with Mage Hand. Null when the board can't tell (no board, or the hero isn't on it).
export function doorsNearHero(state, hero, mageHand = false) {
  const board = state.board
  const at = board?.tokens[hero.id]
  if (!at) return null
  const area = boardGrid(board).get(key(at))?.area
  return (board.doors ?? []).filter(
    (door) => nextToDoor(board, door, at) || (mageHand && door.squares.some((sq) => openGrid(board).get(key(sq))?.area === area)),
  )
}

// The heroes standing next to a door (a Trapped Door hurts each of them).
export const heroesNextToDoor = (state, door) =>
  state.heroes.filter((h) => state.board.tokens[h.id] && nextToDoor(state.board, door, state.board.tokens[h.id])).map((h) => h.id)

// The door's token is discarded and its squares open up.
export const removeDoor = (board, id) => ({ ...board, doors: (board.doors ?? []).filter((d) => d.id !== id) })
