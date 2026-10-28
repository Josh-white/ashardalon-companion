// Dungeon tile layouts for the virtual board, read from the "tiles" list in cards.json.
// Like card text, the layouts stay on the Pi and never go in the repo.
//
// Each tile is drawn as rows of characters with its triangle edge at the bottom (south):
//   .  floor        #  wall (solid black)        S  scorch mark (floor where a new monster goes)
// "features" marks squares the rules care about (stairs, a desk, a ladder, a door: the pale slabs where some adventures put a door marker), and "source"
// says where the layout was read from, for checking it against the real tile.
// "exits" says, square by square along each side, whether it is open ("o") or a wall ("x"):
// north and south read left to right, east and west read top to bottom.

export const SIDES = ['N', 'E', 'S', 'W']
export const TILE_KINDS = ['regular', 'start', 'special', 'chamber']
// The Chamber Entrance tiles have a red triangle.
const TRIANGLES = ['black', 'white', 'red']

// One tile's squares in its own frame (triangle at the bottom): each square knows
// whether it is floor, holds the scorch mark, and which of its sides are blocked.
export function tileCells(tile) {
  const height = tile.rows.length
  const width = tile.rows[0].length
  const cells = []
  tile.rows.forEach((row, y) => {
    ;[...row].forEach((ch, x) => {
      const blocked = new Set()
      if (y === 0 && tile.exits.N[x] !== 'o') blocked.add('N')
      if (y === height - 1 && tile.exits.S[x] !== 'o') blocked.add('S')
      if (x === width - 1 && tile.exits.E[y] !== 'o') blocked.add('E')
      if (x === 0 && tile.exits.W[y] !== 'o') blocked.add('W')
      cells.push({ x, y, floor: ch !== '#', scorch: ch === 'S', blocked })
    })
  })
  // A thin wall blocks both squares it sits between.
  const at = (x, y) => cells.find((c) => c.x === x && c.y === y)
  const STEP = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] }
  const OPPOSITE = { N: 'S', E: 'W', S: 'N', W: 'E' }
  for (const wall of tile.walls) {
    const [x, y] = wall.at
    at(x, y)?.blocked.add(wall.side)
    at(x + STEP[wall.side][0], y + STEP[wall.side][1])?.blocked.add(OPPOSITE[wall.side])
  }
  return { width, height, cells }
}

// Checks the "tiles" list. A tile with a problem is left out and the problem listed,
// the same way cards.json reports a bad card.
export function normalizeTiles(list, problems) {
  if (list === undefined) return []
  if (!Array.isArray(list)) {
    problems.push('"tiles" should be a list.')
    return []
  }
  const seen = new Set()
  const tiles = []
  list.forEach((tile, i) => {
    const label = tile?.name ? `Tile "${tile.name}"` : `tile #${i + 1}`
    if (!tile || typeof tile !== 'object') return problems.push(`${label} is not a tile.`)
    if (!tile.id || typeof tile.id !== 'string') return problems.push(`${label} needs an "id".`)
    if (seen.has(tile.id)) return problems.push(`${label} reuses the id "${tile.id}".`)
    const rows = tile.rows
    if (!Array.isArray(rows) || rows.length === 0 || rows.length % 4 !== 0) {
      return problems.push(`${label} needs "rows": 4 or 8 rows of squares.`)
    }
    const width = typeof rows[0] === 'string' ? rows[0].length : 0
    if (width === 0 || width % 4 !== 0 || rows.some((r) => typeof r !== 'string' || r.length !== width)) {
      return problems.push(`${label} needs every row the same length, 4 or 8 squares.`)
    }
    if (rows.some((r) => /[^.#S]/.test(r))) return problems.push(`${label} has a square that isn't ".", "#" or "S".`)
    const exits = tile.exits ?? {}
    for (const side of SIDES) {
      const length = side === 'N' || side === 'S' ? width : rows.length
      if (typeof exits[side] !== 'string' || exits[side].length !== length || /[^ox]/.test(exits[side])) {
        return problems.push(`${label} needs exits.${side}: ${length} letters, "o" open or "x" wall.`)
      }
    }
    const walls = Array.isArray(tile.walls) ? tile.walls : []
    for (const wall of walls) {
      const [x, y] = Array.isArray(wall?.at) ? wall.at : []
      if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= width || y >= rows.length || !SIDES.includes(wall.side)) {
        return problems.push(`${label} has a wall that needs "at": [x, y] on the tile and a "side" (N, E, S or W).`)
      }
    }
    const features = Array.isArray(tile.features) ? tile.features : []
    for (const feature of features) {
      const squares = Array.isArray(feature?.at) ? feature.at : []
      const onTile = squares.length > 0 && squares.every((sq) => Array.isArray(sq) && Number.isInteger(sq[0]) && Number.isInteger(sq[1]) && sq[0] >= 0 && sq[1] >= 0 && sq[0] < width && sq[1] < rows.length)
      if (typeof feature?.type !== 'string' || !feature.type || !onTile) {
        return problems.push(`${label} has a feature that needs a "type" and "at": a list of [x, y] squares on the tile.`)
      }
    }
    const kind = tile.kind ?? 'regular'
    if (!TILE_KINDS.includes(kind)) return problems.push(`${label} has kind "${kind}"; use one of ${TILE_KINDS.join(', ')}.`)
    const triangle = tile.triangle ?? null
    if (triangle !== null && !TRIANGLES.includes(triangle)) return problems.push(`${label} has triangle "${triangle}"; use black, white, red or leave it out.`)
    seen.add(tile.id)
    tiles.push({
      id: tile.id,
      name: typeof tile.name === 'string' && tile.name ? tile.name : tile.id,
      kind,
      triangle,
      rows: [...rows],
      exits: Object.fromEntries(SIDES.map((s) => [s, exits[s]])),
      walls: walls.map((w) => ({ at: [...w.at], side: w.side })),
      features: features.map((f) => ({ type: f.type, at: f.at.map((sq) => [sq[0], sq[1]]) })),
      source: typeof tile.source === 'string' ? tile.source : '',
    })
  })
  return tiles
}
