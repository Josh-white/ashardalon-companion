import { key } from './grid.js'
import { heroReach, boardGrid } from './play.js'
import { moveTargets } from './powerMoves.js'
import { carpetTargets } from './items.js'
import { isHeroToken, movableToken, tokenMoveTargets, tokenTargets } from './heroTokens.js'
import { boardMarkers } from './markers.js'

// The squares the board lights up for the tap a player is part way through
// (components/Board.jsx): where the active hero can move, where a picked token goes, or
// every free floor square when moving by hand. Keys are 'x,y'.
//   picked     the figure or item picked, 'fly-carpet' when flying the carpet, or null
//   byHand     ✋ Move by hand is on
//   tools      this screen can put tokens down (not the projector's)
//   watching   someone else's turn on this screen: figures can't be picked
//   powerMove  state.turn.boardMove when a power's move has the taps, else falsy
//   trapPick   state.turn.trapPick when a trap's next tile is being picked, else falsy
export function tapTargets(state, { picked, byHand, tools, watching, powerMove, trapPick }) {
  const board = state.board
  const grid = boardGrid(board)
  const active = state.heroes[state.turn.heroIndex]
  const items = board.items ?? []
  const pickedItem = items.find((i) => i.id === picked)
  const floor = (keep) => [...grid.values()].filter((sq) => sq.floor && keep(sq, key([sq.x, sq.y]))).map((sq) => key([sq.x, sq.y]))
  const taken = new Set(Object.values(board.tokens).map(key))
  const itemSquares = new Set(items.filter((i) => i.at && i.id !== picked).map((i) => key(i.at)))
  // A trap that can move or spread more than one way (Rolling Boulder, Lava Flow) lights the
  // tiles it can go to, and a tap anywhere on one picks it.
  if (trapPick) return floor((sq) => trapPick.tiles.includes(sq.area))
  if (picked === 'fly-carpet') return carpetTargets(state)
  if (tools && isHeroToken(pickedItem)) {
    // A token a hero puts down: its card says where; once down, by hand anywhere, or the
    // Flaming Sphere and Wizard Eye 1 tile instead of the owner moving.
    if (!pickedItem.at) return tokenTargets(state, pickedItem)
    if (byHand) return floor((_, k) => !itemSquares.has(k))
    return movableToken(state, active, pickedItem) ? tokenMoveTargets(state, pickedItem) : []
  }
  if (tools && pickedItem?.kind === 'carpet') {
    // The Flying Carpet goes on any tile without a marker, under a hero if they like.
    const markerAreas = new Set(boardMarkers(state).filter((m) => m.squares.length > 0).flatMap((m) => m.tiles))
    const heroSquares = new Set(state.heroes.map((h) => board.tokens[h.id] && key(board.tokens[h.id])))
    return floor((sq, k) => !markerAreas.has(sq.area) && (!taken.has(k) || heroSquares.has(k)) && !itemSquares.has(k))
  }
  if (tools && pickedItem) {
    // A Treasure token goes on a free square of a tile with no hero on it (Hidden Treasure).
    const heroAreas = new Set(state.heroes.map((h) => board.tokens[h.id] && grid.get(key(board.tokens[h.id]))?.area))
    return floor((sq, k) => !heroAreas.has(sq.area) && !taken.has(k) && !itemSquares.has(k))
  }
  if (watching || !picked) return []
  if (powerMove) return moveTargets(state, picked)
  if (byHand) return floor((_, k) => !taken.has(k))
  if (picked === active?.id) return heroReach(state, active)
  return []
}
