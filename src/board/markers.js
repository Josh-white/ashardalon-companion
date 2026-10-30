import { boardGrid } from './play.js'

// Trap and hazard markers on the virtual board. Each marker saved its tile when it went
// down (RESOLVE_ENCOUNTER), so the board can tint that tile and put a badge on it.

const LOOKS = {
  'volcanic-vapors': { icon: '☁️', color: '#f97316' },
  'cave-in': { icon: '🪨', color: '#a8a29e' },
  pit: { icon: '🕳️', color: '#a8a29e' },
  'lava-flow': { icon: '🌋', color: '#ef4444' },
  'poisoned-dart-trap': { icon: '🎯', color: '#ef4444' },
  'rolling-boulder': { icon: '🪨', color: '#ef4444' },
  'whirling-blades': { icon: '🌀', color: '#ef4444' },
}
const BY_TYPE = { hazard: { icon: '⚠️', color: '#f97316' }, trap: { icon: '⚙️', color: '#ef4444' } }

export function markerLook(marker) {
  return LOOKS[marker.cardId] ?? BY_TYPE[marker.type] ?? BY_TYPE.hazard
}

// Rolling Boulder and Whirling Blades move each Villain Phase; the board doesn't follow them yet.
export function markerMoves(marker) {
  return /move the .* marker/i.test(marker.card?.text ?? '')
}

// Every marker in play, with the squares of its tile when the board knows where it is:
// [{ marker, look, moves, tile, squares }]. `squares` is empty for an older marker with no
// saved tile, a tile no longer on the board, or a trap that moves.
export function boardMarkers(state) {
  const traps = state.traps ?? []
  if (!state.board || traps.length === 0) return []
  const grid = boardGrid(state.board)
  return traps.map((marker) => {
    const moves = markerMoves(marker)
    const squares = moves || marker.tile === undefined ? [] : [...grid.values()].filter((sq) => sq.tile === marker.tile)
    return { marker, look: markerLook(marker), moves, tile: squares.length > 0 ? marker.tile : undefined, squares }
  })
}
