import { describe, expect, it } from 'vitest'
import { normalizeCardFile } from '../data/cards.js'
import { buildGrid, key, placeTile, scorchSquare, turnedCells, unexploredEdges } from './grid.js'
import { adjacent, canStep, closest, lineOfSight, reachable, stepsBetween, tilesBetween, walkToward } from './paths.js'
import { heroesFor, tacticHolds } from './tactics.js'
import { normalizeTiles } from './tileDefs.js'

// Made-up layouts for the tests; the real ones live in cards.json on the Pi.
const RAW = [
  { id: 'room', kind: 'start', rows: ['....', '....', '....', '....'], exits: { N: 'oooo', E: 'oooo', S: 'oooo', W: 'oooo' } },
  { id: 'hall', triangle: 'black', rows: ['#..#', '#..#', '#S.#', '#..#'], exits: { N: 'xoox', E: 'xxxx', S: 'xoox', W: 'xxxx' } },
  { id: 'pillar', triangle: 'white', rows: ['....', '.#..', '....', '...S'], exits: { N: 'oooo', E: 'oooo', S: 'oooo', W: 'oooo' } },
  { id: 'long', rows: ['#..#', '#..#', '#..#', '#..#', '#..#', '#..#', '#..#', '#..#'], exits: { N: 'xoox', E: 'xxxxxxxx', S: 'xoox', W: 'xxxxxxxx' } },
  { id: 'walled', rows: ['....', '....', '....', '....'], exits: { N: 'oooo', E: 'oooo', S: 'oooo', W: 'oooo' }, walls: [{ at: [1, 1], side: 'E' }, { at: [1, 2], side: 'E' }] },
]
const problems = []
const DEFS = normalizeTiles(RAW, problems)
const def = (id) => DEFS.find((d) => d.id === id)
const start = { tiles: [{ uid: 't1', tileId: 'room', at: [0, 0], turn: 0 }], tokens: {} }

// Lays `id` against the first unexplored edge on `side` of the newest tile.
function explore(board, side, id, uid) {
  const grid = buildGrid(board, DEFS)
  const last = board.tiles.at(-1).uid
  const edge = unexploredEdges(grid).find((e) => e.side === side && e.tile === last)
  return placeTile(board, grid, edge, def(id), uid)
}

describe('tile layouts', () => {
  it('keeps good tiles and lists what is wrong with bad ones', () => {
    expect(problems).toEqual([])
    expect(DEFS).toHaveLength(5)
    expect(def('hall')).toMatchObject({ kind: 'regular', triangle: 'black', walls: [] })
    const bad = []
    const kept = normalizeTiles([
      { id: 'a', rows: ['...', '...', '...'], exits: {} },
      { id: 'b', rows: ['....', '..x.', '....', '....'], exits: RAW[0].exits },
      { id: 'c', rows: RAW[0].rows, exits: { ...RAW[0].exits, E: 'oo' } },
      { id: 'd', rows: RAW[0].rows, exits: RAW[0].exits, walls: [{ at: [9, 0], side: 'E' }] },
      { id: 'room', rows: RAW[0].rows, exits: RAW[0].exits },
      { id: 'room', rows: RAW[0].rows, exits: RAW[0].exits },
    ], bad)
    expect(kept.map((t) => t.id)).toEqual(['room'])
    expect(bad).toHaveLength(5)
  })

  it('reads tiles from cards.json', () => {
    const cards = normalizeCardFile({ powers: [], tiles: RAW })
    expect(cards.problems).toEqual([])
    expect(cards.tiles.map((t) => t.id)).toEqual(['room', 'hall', 'pillar', 'long', 'walled'])
    expect(normalizeCardFile({ powers: [] }).tiles).toEqual([])
  })

  it('turns a tile clockwise, sides and all', () => {
    const turned = turnedCells(def('hall'), 90)
    const at = (x, y) => turned.cells.find((c) => c.x === x && c.y === y)
    // The scorch mark at (1, 2) ends up at (1, 1); the open ends now face east and west.
    expect(at(1, 1).scorch).toBe(true)
    expect(at(0, 1).blocked.has('W')).toBe(false)
    expect(at(1, 0).floor).toBe(false)
    expect(turnedCells(def('long'), 90)).toMatchObject({ width: 8, height: 4 })
  })
})

describe('exploring', () => {
  it('finds the open edges of the start tile', () => {
    const edges = unexploredEdges(buildGrid(start, DEFS))
    expect(edges.map((e) => e.side).sort()).toEqual(['E', 'N', 'S', 'W'])
    expect(edges.find((e) => e.side === 'N')).toMatchObject({ at: [0, -4], squares: [[0, 0], [1, 0], [2, 0], [3, 0]] })
  })

  it('turns the new tile so its triangle edge joins the explored edge', () => {
    const north = explore(start, 'N', 'hall', 't2')
    expect(north.tiles[1]).toEqual({ uid: 't2', tileId: 'hall', at: [0, -4], turn: 0 })
    const east = explore(start, 'E', 'hall', 't2')
    expect(east.tiles[1]).toMatchObject({ at: [4, 0], turn: 90 })
    const grid = buildGrid(east, DEFS)
    // The hall's open end meets the room, and its far end is a new unexplored edge.
    expect(canStep(grid, [3, 1], [4, 1])).toBe(true)
    expect(unexploredEdges(grid).filter((e) => e.tile === 't2').map((e) => e.side)).toEqual(['E'])
    expect(scorchSquare(grid, 't2')).toEqual([5, 1])
    expect(explore(start, 'S', 'hall', 't2').tiles[1]).toMatchObject({ at: [0, 4], turn: 180 })
    expect(explore(start, 'W', 'hall', 't2').tiles[1]).toMatchObject({ at: [-4, 0], turn: 270 })
  })

  it('stretches a long tile away from the edge', () => {
    expect(explore(start, 'N', 'long', 't2').tiles[1]).toMatchObject({ at: [0, -8], turn: 0 })
    expect(explore(start, 'W', 'long', 't2').tiles[1]).toMatchObject({ at: [-8, 0], turn: 270 })
  })

  it('refuses a tile that would overlap one already down', () => {
    let board = explore(start, 'N', 'room', 't2')
    board = explore(board, 'E', 'room', 't3')
    board = explore(board, 'S', 'room', 't4')
    const grid = buildGrid(board, DEFS)
    // t4 sits east of the start tile, so the start tile's east edge is no longer unexplored.
    expect(unexploredEdges(grid).some((e) => e.tile === 't1' && e.side === 'E')).toBe(false)
    const fake = { id: 'x', tile: 't1', side: 'E', at: [4, 0] }
    expect(placeTile(board, grid, fake, def('room'), 't5')).toBeNull()
  })
})

describe('moving and distances', () => {
  const pillar = { tiles: [{ uid: 't1', tileId: 'pillar', at: [0, 0], turn: 0 }], tokens: {} }
  const grid = buildGrid(pillar, DEFS)

  it('blocks diagonal steps past a rock corner unless the rule allows it', () => {
    expect(canStep(grid, [0, 0], [1, 1])).toBe(false)
    expect(canStep(grid, [0, 2], [1, 1])).toBe(false)
    expect(canStep(grid, [2, 0], [1, 1])).toBe(false)
    expect(canStep(grid, [0, 0], [1, 0])).toBe(true)
    expect(canStep(grid, [2, 1], [1, 2])).toBe(false)
    expect(canStep(grid, [2, 1], [1, 2], { cutCorners: true })).toBe(true)
    expect(canStep(grid, [2, 2], [3, 3])).toBe(true)
  })

  it('stops at thin walls', () => {
    const walled = buildGrid({ tiles: [{ uid: 't1', tileId: 'walled', at: [0, 0], turn: 0 }] }, DEFS)
    expect(canStep(walled, [1, 1], [2, 1])).toBe(false)
    expect(canStep(walled, [2, 2], [1, 2])).toBe(false)
    expect(adjacent(walled, [1, 0], [2, 0])).toBe(true)
    expect(stepsBetween(walled, [1, 1], [2, 1])).toBe(3)
  })

  it('lights up the squares a hero can reach', () => {
    const one = reachable(grid, [0, 0], 1)
    expect(one.sort()).toEqual(['0,1', '1,0'])
    // A monster on 1,0 is in the way, a hero on 0,1 can be walked past but not ended on,
    // and 1,2 would mean cutting the rock's corner.
    expect(reachable(grid, [0, 0], 2, { stops: new Set(['1,0']), taken: new Set(['0,1']) }).sort()).toEqual(['0,2'])
    // Every diagonal past the rock is closed, so the long way round.
    expect(stepsBetween(grid, [0, 0], [3, 3])).toBe(5)
  })

  it('counts tiles through openings', () => {
    let board = explore(start, 'E', 'hall', 't2')
    board = explore(board, 'E', 'room', 't3')
    const g = buildGrid(board, DEFS)
    expect(tilesBetween(g, [0, 0], [3, 3])).toBe(0)
    expect(tilesBetween(g, [0, 0], [5, 1])).toBe(1)
    expect(tilesBetween(g, [0, 0], [9, 3])).toBe(2)
    expect(stepsBetween(g, [0, 0], [9, 3])).toBe(9)
  })

  it('walks a monster around the rock toward the closest hero', () => {
    const heroes = [{ id: 'a', at: [3, 0] }, { id: 'b', at: [0, 3] }]
    expect(closest(grid, [2, 2], heroes).map((h) => h.id)).toEqual(['a', 'b'])
    expect(closest(grid, [3, 3], heroes).map((h) => h.id)).toEqual(['a', 'b'])
    expect(closest(grid, [3, 2], heroes).map((h) => h.id)).toEqual(['a'])
    expect(walkToward(grid, [0, 3], [3, 0], 2, { taken: new Set(['3,0']) })).toEqual([2, 2])
    // It stops on the last free square next to the hero rather than on the hero.
    const end = walkToward(grid, [3, 3], [3, 0], 6, { taken: new Set(['3,0']) })
    expect(adjacent(grid, end, [3, 0])).toBe(true)
    expect(stepsBetween(grid, [3, 3], end)).toBe(2)
  })

  it('checks line of sight past the rock', () => {
    expect(lineOfSight(grid, [0, 0], [3, 0])).toBe(true)
    expect(lineOfSight(grid, [0, 1], [3, 1])).toBe(false)
  })
})

describe('monster tactics on the board', () => {
  let board = explore(start, 'E', 'hall', 't2')
  board = explore(board, 'E', 'room', 't3')
  const grid = buildGrid(board, DEFS)
  const monster = [5, 1]

  it('answers the board questions', () => {
    const heroes = [{ id: 'near', at: [3, 1] }, { id: 'far', at: [9, 0] }, { id: 'home', at: [5, 3] }]
    expect(heroesFor('within1', grid, monster, heroes).map((h) => h.id)).toEqual(['near', 'far', 'home'])
    expect(heroesFor('sameTile', grid, monster, heroes).map((h) => h.id)).toEqual(['home'])
    expect(heroesFor('adjacent', grid, monster, heroes)).toEqual([])
    expect(tacticHolds('adjacent', grid, monster, [{ id: 'x', at: [4, 2] }])).toBe(true)
    expect(heroesFor('tileWithMany', grid, monster, [{ id: 'a', at: [0, 0] }, { id: 'b', at: [1, 1] }]).map((h) => h.id)).toEqual(['a', 'b'])
    expect(heroesFor('within2', grid, [0, 0], [{ id: 'far', at: [9, 0] }])).toHaveLength(1)
    expect(tacticHolds(undefined, grid, monster, [])).toBe(true)
  })

  it('knows a lonely monster by an unexplored edge', () => {
    expect(tacticHolds('aloneByUnexploredEdge', grid, [9, 0], [{ id: 'a', at: [0, 0] }])).toBe(true)
    expect(tacticHolds('aloneByUnexploredEdge', grid, [9, 0], [{ id: 'a', at: [8, 0] }])).toBe(false)
    expect(tacticHolds('aloneByUnexploredEdge', grid, monster, [])).toBe(false)
    expect(grid.has(key([12, 0]))).toBe(false)
  })
})
