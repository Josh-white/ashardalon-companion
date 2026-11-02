// What the 3D board draws, worked out from the game without any 3D code, so it can be
// tested on its own: every square (floor, rock or a shut door), the walls between squares,
// the dungeon's open edges, the stairs and ladders, and every figure on the board.
// Board3D.jsx turns this into stone blocks and standees.

import { boardSquares, key, OPPOSITE, STEP } from './grid.js'
import { boardGrid, figureToken, figuresLeft } from './play.js'
import { activeVillains } from '../state/game.js'
import { escapeBlockers } from '../state/adventure.js'
import { heroArt, monsterArt } from '../data/art.js'
import { boardMarkers } from './markers.js'
import { exitSquares } from './exits.js'
import { adventureTokenSpots } from './items.js'
import { HERO_TOKENS, isHeroToken } from './heroTokens.js'

// The same small icons the flat board puts round a figure (BoardPieces.jsx figureBadges).
const CONDITION_ICONS = { Dazed: '💫', Immobilized: '⛓️', Poisoned: '🧪', Slowed: '🐌', Weakened: '💔' }
export function conditionIcons(figure) {
  const icons = (figure?.conditions ?? []).filter((c) => CONDITION_ICONS[c]).map((c) => CONDITION_ICONS[c])
  if (figure?.tokens?.invisible) icons.push('👻')
  return icons
}

const SIDES = ['N', 'E', 'S', 'W']
const EXIT_FEATURES = ['stairs', 'ladder']

// The board's squares and walls. A wall sits between two squares that can't be crossed
// (listed once, from the square on its north or west), and round the outside of the
// dungeon wherever a tile's edge is shut. An edge that is open with nothing beyond it yet
// is where the next tile goes.
export function boardLayout(board) {
  const grid = boardGrid(board)
  const squares = []
  const walls = []
  const openEdges = []
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const sq of grid.values()) {
    squares.push({ x: sq.x, y: sq.y, floor: sq.floor, scorch: Boolean(sq.scorch), door: sq.door ?? null, tile: sq.tile })
    minX = Math.min(minX, sq.x)
    maxX = Math.max(maxX, sq.x)
    minY = Math.min(minY, sq.y)
    maxY = Math.max(maxY, sq.y)
    if (!sq.floor) continue
    for (const side of SIDES) {
      const next = grid.get(key([sq.x + STEP[side][0], sq.y + STEP[side][1]]))
      const shut = sq.blocked.has(side)
      if (!next) {
        if (shut) walls.push({ x: sq.x, y: sq.y, side })
        else openEdges.push({ x: sq.x, y: sq.y, side })
      } else if (next.floor && (side === 'E' || side === 'S') && (shut || next.blocked.has(OPPOSITE[side]))) {
        walls.push({ x: sq.x, y: sq.y, side })
      }
    }
  }
  if (squares.length === 0) return { squares, walls, openEdges, exits: [], bounds: { x: 0, y: 0, w: 1, h: 1 } }
  const exits = []
  for (const placed of board.tiles ?? []) {
    const def = board.defs?.[placed.tileId]
    for (const feature of def?.features ?? []) {
      if (EXIT_FEATURES.includes(feature.type)) exits.push({ type: feature.type, squares: boardSquares(placed, def, feature.at) })
    }
  }
  return { squares, walls, openEdges, exits, bounds: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } }
}

// Every figure standing on the board, in the order the flat board draws them.
// `art` is the picture's name in the Pi's art list (null when there's none to look for).
export function boardFigures(state) {
  const board = state.board
  if (!board) return []
  const activeId = state.heroes[state.turn.heroIndex]?.id
  const acting = state.turn.acting && !(state.turn.acted ?? []).includes(state.turn.acting) ? state.turn.acting : null
  const figures = [
    ...state.heroes.map((h) => ({ id: h.id, kind: 'hero', label: h.name, color: h.color, art: heroArt(h.key), faded: h.hp <= 0, active: h.id === activeId, icons: conditionIcons(h) })),
    ...state.monsters.flatMap((m) =>
      Array.from({ length: figuresLeft(m) }, (_, i) => ({
        id: figureToken(m.id, i + 1),
        kind: 'monster',
        label: figuresLeft(m) > 1 ? `${m.name} ${i + 1}` : m.name,
        art: monsterArt(m),
        acting: acting === m.id,
        icons: conditionIcons(m),
      })),
    ),
    ...activeVillains(state).map((v) => ({ id: v.id, kind: 'villain', label: v.name, art: monsterArt(v), acting: acting === v.id, icons: conditionIcons(v) })),
    ...(state.villagers ?? []).filter((v) => !v.removed).map((v) => ({ id: v.id, kind: 'villager', label: v.name, art: null, icons: [] })),
  ]
  return figures.filter((f) => board.tokens[f.id]).map((f) => ({ ...f, at: board.tokens[f.id] }))
}

// The hazards that change a tile's floor; any other marker tints its tile.
const FLOORS = { 'lava-flow': 'lava', 'volcanic-vapors': 'vapors', 'cave-in': 'rubble', pit: 'pit' }

// Everything else lying on the board: trap and hazard markers (with the floor they make and
// a badge on a free square of their tile), Treasure tokens, the tokens heroes put down, the
// Flying Carpet, adventure tokens waiting to be picked up, and the way out in an escape.
export function boardExtras(state) {
  const board = state.board
  if (!board) return { markers: [], items: [], quests: [], exits: { squares: [], open: false } }
  const items = (board.items ?? []).filter((i) => i.at)
  const quests = adventureTokenSpots(state)
  const taken = new Set([...Object.values(board.tokens), ...items.map((i) => i.at), ...quests.map((q) => q.at)].map((at) => key(at)))
  const markers = boardMarkers(state)
    .filter((m) => m.squares.length > 0)
    .map(({ marker, look, squares, tile }) => {
      // The badge goes on a free square of the marker's own tile, top-left first (like the
      // flat board's), so it never stands on a figure; with none free it takes the corner.
      const own = squares.filter((sq) => sq.area === tile)
      const order = (own.length > 0 ? own : squares).slice().sort((a, b) => a.y - b.y || a.x - b.x)
      const free = order.find((sq) => !taken.has(key([sq.x, sq.y])))
      if (free) taken.add(key([free.x, free.y]))
      const spot = free ?? order[0]
      return {
        id: marker.id,
        floor: FLOORS[marker.cardId] ?? 'tint',
        color: look.color,
        icon: look.icon,
        squares: squares.filter((sq) => sq.floor).map((sq) => [sq.x, sq.y]),
        scorch: squares.filter((sq) => sq.scorch).map((sq) => [sq.x, sq.y]),
        badge: { at: [spot.x, spot.y], small: !free },
      }
    })
  const heroTokens = items.filter(isHeroToken).map((i) => {
    const look = HERO_TOKENS[i.kind]
    const count = i.kind === 'sphere' ? state.heroes.find((h) => h.id === i.owner)?.tokens?.flamingSphere : i.kind === 'pet' ? i.hp : null
    return { id: i.id, kind: 'token', at: i.at, icon: i.icon ?? look.icon, color: look.color, count: count ?? null }
  })
  const others = items.filter((i) => !isHeroToken(i)).map((i) => ({ id: i.id, kind: i.kind === 'carpet' ? 'carpet' : 'treasure', at: i.at }))
  const exits = [...exitSquares(state)].map((k) => k.split(',').map(Number))
  const open = exits.length > 0 && !state.adventure?.escaped && escapeBlockers(state).length === 0
  return { markers, items: [...others, ...heroTokens], quests, exits: { squares: exits, open } }
}
