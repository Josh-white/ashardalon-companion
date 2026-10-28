// The virtual board: which tile sits where, turned which way, and the grid of squares
// that comes out of them. The saved game keeps only state.board ({ tiles, tokens });
// everything here is worked out from it whenever it is needed.

import { tileCells } from './tileDefs.js'

export const STEP = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] }
export const OPPOSITE = { N: 'S', E: 'W', S: 'N', W: 'E' }
const CLOCKWISE = { N: 'E', E: 'S', S: 'W', W: 'N' }
// Tiles snap to a lattice of 4 by 4 squares.
export const LATTICE = 4

export const key = ([x, y]) => `${x},${y}`

const turnSide = (side, turn) => {
  let s = side
  for (let i = 0; i < turn / 90; i++) s = CLOCKWISE[s]
  return s
}

// A tile's squares turned clockwise by 0, 90, 180 or 270 degrees, still in its own frame.
export function turnedCells(def, turn = 0) {
  const { width, height, cells } = tileCells(def)
  const quarter = ((turn / 90) % 4 + 4) % 4
  const place = ({ x, y }) => {
    if (quarter === 1) return [height - 1 - y, x]
    if (quarter === 2) return [width - 1 - x, height - 1 - y]
    if (quarter === 3) return [y, width - 1 - x]
    return [x, y]
  }
  const size = quarter % 2 ? [height, width] : [width, height]
  return {
    width: size[0],
    height: size[1],
    cells: cells.map((c) => {
      const [x, y] = place(c)
      return { ...c, x, y, blocked: new Set([...c.blocked].map((s) => turnSide(s, quarter * 90))) }
    }),
  }
}

// Every square on the board: "x,y" -> { x, y, tile (its uid), floor, scorch, blocked }.
export function buildGrid(board, defs) {
  const byId = new Map(defs.map((d) => [d.id, d]))
  const squares = new Map()
  for (const placed of board?.tiles ?? []) {
    const def = byId.get(placed.tileId)
    if (!def) continue
    const { cells } = turnedCells(def, placed.turn)
    for (const c of cells) {
      const at = [placed.at[0] + c.x, placed.at[1] + c.y]
      squares.set(key(at), { x: at[0], y: at[1], tile: placed.uid, floor: c.floor, scorch: c.scorch, blocked: c.blocked })
    }
  }
  return squares
}

const neighbour = ([x, y], side) => [x + STEP[side][0], y + STEP[side][1]]

// Can a figure step straight across this side of a square? Both squares must be floor
// and neither may have a wall on the side between them.
export function openSide(grid, at, side) {
  const from = grid.get(key(at))
  const to = grid.get(key(neighbour(at, side)))
  return Boolean(from?.floor && to?.floor && !from.blocked.has(side) && !to.blocked.has(OPPOSITE[side]))
}

// The open edges of the board that no tile has been placed against yet, grouped by the
// lattice spot a new tile would fill. Each one lists the squares a hero can stand on to explore it.
export function unexploredEdges(grid) {
  const edges = new Map()
  for (const sq of grid.values()) {
    if (!sq.floor) continue
    for (const side of Object.keys(STEP)) {
      if (sq.blocked.has(side)) continue
      const [nx, ny] = neighbour([sq.x, sq.y], side)
      if (grid.has(key([nx, ny]))) continue
      const at = [Math.floor(nx / LATTICE) * LATTICE, Math.floor(ny / LATTICE) * LATTICE]
      const id = `${key(at)}:${side}`
      if (!edges.has(id)) edges.set(id, { id, tile: sq.tile, side, at, squares: [] })
      edges.get(id).squares.push([sq.x, sq.y])
    }
  }
  return [...edges.values()]
}

// Lays a newly drawn tile against an unexplored edge. The tile turns so its triangle
// edge (south in its own frame) joins the edge the hero explored, and a long tile
// stretches away from it. Returns the new board, or null when the tile would overlap one already down.
export function placeTile(board, grid, edge, def, uid) {
  const turn = { N: 0, E: 90, S: 180, W: 270 }[edge.side]
  const { width, height, cells } = turnedCells(def, turn)
  let [x, y] = edge.at
  if (edge.side === 'N') y -= height - LATTICE
  if (edge.side === 'W') x -= width - LATTICE
  // A tile wider than one lattice spot lines up with the tile it joins.
  const from = (board.tiles ?? []).find((t) => t.uid === edge.tile)
  if ((edge.side === 'N' || edge.side === 'S') && width > LATTICE && from) x = Math.min(x, from.at[0])
  if ((edge.side === 'E' || edge.side === 'W') && height > LATTICE && from) y = Math.min(y, from.at[1])
  if (cells.some((c) => grid.has(key([x + c.x, y + c.y])))) return null
  return { ...board, tiles: [...(board.tiles ?? []), { uid, tileId: def.id, at: [x, y], turn }] }
}

// The scorch mark on a placed tile, where its new monster goes (null if it has none).
export function scorchSquare(grid, uid) {
  for (const sq of grid.values()) if (sq.tile === uid && sq.scorch) return [sq.x, sq.y]
  return null
}
