// Encounter cards and traps on the virtual board: which heroes a card's attack reaches,
// worked out from where the figures stand instead of asked as a question. Null means the
// board can't tell (no board, or a figure isn't on it), so the screen asks instead.

import { key } from './grid.js'
import { adjacent, tilesBetween } from './paths.js'
import { boardGrid } from './play.js'
import { isMovingTrap, markerTiles, trapStepped } from './traps.js'

const baseId = (tokenId) => tokenId.split('#')[0]

// The tile a square is on (half of the Start tile counts as a tile).
const tileAt = (grid, at) => (at ? grid.get(key(at))?.area : undefined)

// Heroes on the board that an attack can find (not off in the Astral Refuge).
const heroesOnBoard = (state) =>
  state.heroes.filter((h) => !h.tokens?.refuge && state.board.tokens[h.id]).map((h) => ({ id: h.id, at: state.board.tokens[h.id] }))

// Ids of the heroes an encounter or trap attack goes after, for the targets that depend
// on the board ('activeTile', 'within1', 'trapTile', 'villainWithin1'). `hero` is the
// active hero; `trap` is the marker for 'trapTile'.
export function encounterTargetIds(state, targets, hero, { trap } = {}) {
  if (!state.board) return null
  const grid = boardGrid(state.board)
  const heroes = heroesOnBoard(state)
  const near = (from, n) => heroes.filter((h) => tilesBetween(grid, from, h.at) <= n).map((h) => h.id)
  if (targets === 'activeTile' || targets === 'within1') {
    const at = state.board.tokens[hero.id]
    if (!at || hero.tokens?.refuge) return null
    return near(at, targets === 'within1' ? 1 : 0)
  }
  if (targets === 'trapTile') {
    // The marker's tile was saved when it went down (older markers don't have one). A
    // trap that moves first (Whirling Blades) is followed once it has moved this turn.
    const tiles = trap ? markerTiles(trap) : []
    if (tiles.length === 0 || (isMovingTrap(trap) && !trapStepped(state, trap))) return null
    return heroes.filter((h) => tiles.includes(tileAt(grid, h.at))).map((h) => h.id)
  }
  if (targets === 'villainWithin1') {
    const villains = (state.villains ?? []).filter((v) => !v.defeated && state.board.tokens[v.id])
    if (villains.length === 0) return null
    return [...new Set(villains.flatMap((v) => near(state.board.tokens[v.id], 1)))]
  }
  return null
}

// Is a monster or villain on the hero's tile? Null when the board can't tell.
export function foeOnHeroTile(state, hero) {
  if (!state.board) return null
  const at = state.board.tokens[hero.id]
  if (!at) return null
  const grid = boardGrid(state.board)
  const tile = tileAt(grid, at)
  const foes = new Set([...state.monsters, ...(state.villains ?? []).filter((v) => !v.defeated)].map((m) => m.id))
  return Object.entries(state.board.tokens).some(([id, sq]) => foes.has(baseId(id)) && tileAt(grid, sq) === tile)
}

// The board tile under a hero, saved on a trap or hazard marker so later turns know where it is.
export function heroTile(state, heroId) {
  if (!state.board) return undefined
  return tileAt(boardGrid(state.board), state.board.tokens[heroId])
}

// The heroes a power or item can reach from `heroId` ('sameTile', 'adjacent', 'within2'),
// the hero included, for pickers that should offer only them. Null when the board can't
// tell (no board, or the hero isn't on it), so every hero is offered.
export function heroesInReach(state, heroId, reach) {
  const at = state.board?.tokens[heroId]
  if (!at || !reach) return null
  const grid = boardGrid(state.board)
  return heroesOnBoard(state)
    .filter((h) => h.id === heroId || (reach === 'sameTile' ? tileAt(grid, h.at) === tileAt(grid, at) : reach === 'adjacent' ? adjacent(grid, at, h.at) : tilesBetween(grid, at, h.at) <= 2))
    .map((h) => h.id)
}
