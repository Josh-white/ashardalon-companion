// What the 3D board draws, worked out from the game without any 3D code, so it can be
// tested on its own: every square (floor, rock or a shut door), the walls between squares,
// the dungeon's open edges, the stairs and ladders, and every figure on the board.
// Board3D.jsx turns this into stone blocks and standees.

import { boardSquares, key, OPPOSITE, STEP } from './grid.js'
import { boardGrid, figureToken, figuresLeft } from './play.js'
import { activeVillains } from '../state/game.js'
import { heroArt, monsterArt } from '../data/art.js'

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
    ...state.heroes.map((h) => ({ id: h.id, kind: 'hero', label: h.name, color: h.color, art: heroArt(h.key), faded: h.hp <= 0, active: h.id === activeId })),
    ...state.monsters.flatMap((m) =>
      Array.from({ length: figuresLeft(m) }, (_, i) => ({
        id: figureToken(m.id, i + 1),
        kind: 'monster',
        label: figuresLeft(m) > 1 ? `${m.name} ${i + 1}` : m.name,
        art: monsterArt(m),
        acting: acting === m.id,
      })),
    ),
    ...activeVillains(state).map((v) => ({ id: v.id, kind: 'villain', label: v.name, art: monsterArt(v), acting: acting === v.id })),
    ...(state.villagers ?? []).filter((v) => !v.removed).map((v) => ({ id: v.id, kind: 'villager', label: v.name, art: null })),
  ]
  return figures.filter((f) => board.tokens[f.id]).map((f) => ({ ...f, at: board.tokens[f.id] }))
}
