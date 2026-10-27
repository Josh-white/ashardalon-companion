// The dungeon tile stack. The table keeps the ordinary tiles in a real shuffled stack,
// and the adventure's special tiles wait to the side. The app counts the stack and
// says when a special tile turns up, so nobody has to slip it in at the right depth.

export const STARTING_TILES = 30
export const MIN_TILES = 10
export const MAX_TILES = 60
// Where a special tile turns up when its adventure doesn't say: the book's usual
// "shuffle it into 3 tiles and put those after the 8th tile".
export const DEFAULT_DRAWN = [9, 12]

// The adventure's special tiles that come out of the stack (not doors), with the
// draws each one can turn up on, counting the first tile drawn as 1.
export function tileSpots(card) {
  return (card?.reveals ?? [])
    .filter((r) => !r.door)
    .map((r) => {
      const [from, to] = r.drawn ?? DEFAULT_DRAWN
      return { tile: r.tile, from, to }
    })
}

// A new stack: `count` ordinary tiles ('') with each special tile at a random spot in its range.
export function buildTileStack(count, card, random = []) {
  const spots = tileSpots(card).sort((a, b) => a.to - b.to)
  const stack = Array.from({ length: count + spots.length }, () => '')
  spots.forEach((spot, i) => {
    const last = Math.min(spot.to, stack.length)
    const first = Math.min(spot.from, last)
    let free = []
    for (let n = first; n <= last; n++) if (stack[n - 1] === '') free.push(n)
    // Two spots that overlap can fill a range; the next free spot after it will do.
    if (free.length === 0) free = stack.map((t, n) => (t === '' && n + 1 > last ? n + 1 : null)).filter(Boolean)
    if (free.length === 0) free = stack.map((t, n) => (t === '' ? n + 1 : null)).filter(Boolean)
    const r = Number(random[i])
    const pick = free[Number.isFinite(r) && r >= 0 && r < 1 ? Math.floor(r * free.length) : 0]
    stack[pick - 1] = spot.tile
  })
  return { stack, drawn: 0 }
}

export const tilesLeft = (state) => (state.tileStack ? state.tileStack.stack.length : null)

// Takes the top (or bottom) tile. Returns the new state and the tile: '' for an
// ordinary one, the special tile's name, or null when the stack is empty.
export function takeTile(state, from = 'top') {
  const deck = state.tileStack
  if (!deck || deck.stack.length === 0) return { state, tile: null }
  const tile = from === 'bottom' ? deck.stack[deck.stack.length - 1] : deck.stack[0]
  const stack = from === 'bottom' ? deck.stack.slice(0, -1) : deck.stack.slice(1)
  return { state: { ...state, tileStack: { stack, drawn: deck.drawn + 1 } }, tile }
}

// The Lost encounter: the bottom tile goes on top without anyone looking at it.
export function bottomToTop(state) {
  const deck = state.tileStack
  if (!deck || deck.stack.length < 2) return state
  return { ...state, tileStack: { ...deck, stack: [deck.stack[deck.stack.length - 1], ...deck.stack.slice(0, -1)] } }
}
