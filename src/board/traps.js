// Traps that move or spread on the virtual board, in their owner's Villain Phase:
// Rolling Boulder and Whirling Blades move one tile toward the closest hero, and Lava Flow
// puts another marker on a tile next to the lava. The board works out the tiles they can go
// to; when there's a choice (two heroes equally close, or lava that can spread several
// ways), the players tap one (state.turn.trapPick).

import { key } from './grid.js'
import { tileLinks } from './paths.js'
import { boardGrid } from './play.js'

export const isLava = (marker) => marker?.cardId === 'lava-flow'

// "Move the Rolling Boulder marker one tile toward the closest Hero."
export const isMovingTrap = (marker) => /move the .* marker/i.test(marker?.card?.text ?? '')

// The tiles a marker covers on the board (a square's `area`: half of the Start tile is a
// tile). A moving trap is only followed once it was placed with this version (`tracked`);
// an older one could have moved anywhere, so it has none.
export function markerTiles(marker) {
  if (isLava(marker) && Array.isArray(marker.tiles)) return marker.tiles
  if (marker.tile === undefined || (isMovingTrap(marker) && !marker.tracked)) return []
  return [marker.tile]
}

// Tile distances from one tile to every tile joined to it.
function tileSteps(links, from) {
  const seen = new Map([[from, 0]])
  const queue = [from]
  while (queue.length) {
    const t = queue.shift()
    for (const n of links.get(t) ?? []) {
      if (seen.has(n)) continue
      seen.set(n, seen.get(t) + 1)
      queue.push(n)
    }
  }
  return seen
}

// Heroes a trap goes after: on the board, still standing, not in the Astral Refuge, and not
// invisible (like a monster's "closest Hero").
const trapTargets = (state, grid) =>
  state.heroes
    .filter((h) => h.hp > 0 && !h.tokens?.refuge && !h.tokens?.invisible && state.board.tokens[h.id])
    .map((h) => ({ hero: h, tile: grid.get(key(state.board.tokens[h.id]))?.area }))
    .filter((h) => h.tile !== undefined)

// Where the trap can go this Villain Phase: { tiles, toward } where `tiles` are the tiles it
// may move or spread to (none: it stays put), and `toward` names the heroes a moving trap is
// heading for. Null when the board doesn't know where the trap is.
export function trapStepChoices(state, trap) {
  if (!state.board) return null
  const now = markerTiles(trap)
  if (now.length === 0) return null
  const grid = boardGrid(state.board)
  const links = tileLinks(grid)
  if (isLava(trap)) {
    const lava = new Set(now)
    const tiles = [...new Set(now.flatMap((t) => [...(links.get(t) ?? [])]))].filter((t) => !lava.has(t))
    return { tiles, toward: [] }
  }
  const from = now[0]
  const reach = tileSteps(links, from)
  const heroes = trapTargets(state, grid).filter((h) => reach.has(h.tile))
  const best = Math.min(...heroes.map((h) => reach.get(h.tile)))
  // No hero it can reach, or one already on its tile: it stays where it is.
  if (heroes.length === 0 || best === 0) return { tiles: [], toward: heroes.filter((h) => reach.get(h.tile) === 0).map((h) => h.hero.name) }
  const closest = heroes.filter((h) => reach.get(h.tile) === best)
  const tiles = new Set()
  for (const h of closest) {
    const back = tileSteps(links, h.tile)
    for (const n of links.get(from) ?? []) if (back.get(n) === best - 1) tiles.add(n)
  }
  return { tiles: [...tiles], toward: closest.map((h) => h.hero.name) }
}

// Ids of the heroes on the trap's tiles (Lava Flow: any lava tile), or null when the board
// doesn't know where it is, so the screen asks.
export function heroesOnTrap(state, trap) {
  if (!state.board) return null
  const tiles = new Set(markerTiles(trap))
  if (tiles.size === 0) return null
  const grid = boardGrid(state.board)
  return state.heroes
    .filter((h) => !h.tokens?.refuge && state.board.tokens[h.id] && tiles.has(grid.get(key(state.board.tokens[h.id]))?.area))
    .map((h) => h.id)
}

// Has the trap already moved or spread this Villain Phase?
export const trapStepped = (state, trap) => (state.turn.trapSteps ?? []).includes(trap.id)

// TRAP_STEP: move or spread the trap. With `tile`, to that tile (one of the choices); without,
// the board does it when there's only one way to go, or asks the players to tap a tile.
export function trapStep(state, action, withLog) {
  const trap = (state.traps ?? []).find((t) => t.id === action.trapId)
  if (!trap || trapStepped(state, trap)) return state
  const choices = trapStepChoices(state, trap)
  if (!choices) return state
  const done = (next, line) => {
    const { trapPick, ...turn } = next.turn
    return withLog({ ...next, turn: { ...turn, trapSteps: [...(turn.trapSteps ?? []), trap.id] } }, line)
  }
  const tile = action.tile ?? (choices.tiles.length === 1 ? choices.tiles[0] : undefined)
  if (choices.tiles.length === 0) {
    const why = isLava(trap) ? `The lava has nowhere left to spread.` : choices.toward.length > 0 ? `The ${trap.name} stays on ${choices.toward.join(' and ')}'s tile.` : `The ${trap.name} has no hero to go after, so it stays put.`
    return done(state, why)
  }
  if (tile === undefined) return { ...state, turn: { ...state.turn, trapPick: { trapId: trap.id, tiles: choices.tiles } } }
  if (!choices.tiles.includes(tile)) return state
  const traps = state.traps.map((t) => (t.id !== trap.id ? t : isLava(t) ? { ...t, tiles: [...markerTiles(t), tile] } : { ...t, tile }))
  const line = isLava(trap) ? 'The lava spreads to another tile.' : `The ${trap.name} moves one tile toward ${choices.toward.join(' or ')}.`
  return done({ ...state, traps }, line)
}
