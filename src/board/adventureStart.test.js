import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { normalizeCardFile } from '../data/cards.js'
import { createHero, gameReducer, initialState } from '../state/game.js'
import { boardStart, layChamber, layExit, layTile } from './play.js'
import { normalizeTiles } from './tileDefs.js'

// Made-up layouts, shaped like the box's: a 4x4 start tile with a rock row on its south side.
const room = (id, name, kind, extra = {}) => ({ id, name, kind, triangle: 'black', rows: ['....', '.S..', '....', '....'], exits: { N: 'oooo', S: 'oooo', W: 'oooo', E: 'oooo' }, ...extra })
const TILES = normalizeTiles(
  [
    { id: 'start', name: 'Start', kind: 'start', rows: ['...#', '...#', '...#', '...#', '...#', '...#', '...#', '...#'], exits: { N: 'ooox', S: 'ooox', W: 'oooooooo', E: 'xxxxxxxx' }, features: [{ type: 'stairs', at: [[1, 3], [2, 3], [1, 4], [2, 4]] }] },
    { id: 'ancient-battlefield', name: 'Ancient Battlefield', kind: 'start', rows: ['...S', '....', '....', '####'], exits: { N: 'oooo', S: 'xxxx', W: 'ooox', E: 'ooox' } },
    { id: 'dire-chamber-start', name: 'Dire Chamber (start)', kind: 'start', rows: ['....', '...S', '....', '####'], exits: { N: 'oooo', S: 'xxxx', W: 'ooox', E: 'ooox' } },
    room('tile-01', 'Tile 1', 'regular'),
    room('tile-09', 'Tile 9', 'regular', { triangle: 'white', features: [{ type: 'door', at: [[3, 1], [3, 2]] }] }),
    room('tile-12', 'Tile 12', 'regular', { triangle: 'white', features: [{ type: 'door', at: [[1, 0], [2, 0]] }] }),
    room('tile-14', 'Tile 14', 'regular', { features: [{ type: 'door', at: [[1, 0], [2, 0]] }] }),
    room('dire-chamber-entrance', 'Dire Chamber Entrance', 'chamber', { triangle: 'red' }),
    ...[1, 2, 3, 4].map((n) => room(`dire-chamber-${n}`, 'Dire Chamber', 'chamber', { triangle: 'white' })),
    { id: 'tunnel-exit', name: 'Tunnel Exit', kind: 'special', triangle: 'black', rows: ['####', '#..#', '#..#', '#S.#'], exits: { N: 'xxxx', S: 'xoox', W: 'xxxx', E: 'xxxx' } },
  ],
  [],
)

const adventure = (setup, extra = {}) => normalizeCardFile({ powers: [], adventures: [{ id: 'adv', title: 'Test', goal: 'Win.', setup, ...extra }] }).adventures[0]
const CLOSED_DOORS = adventure(['Place the Ancient Battlefield Start tile on the table.', 'Place the two Door Tiles with white triangles next to the Ancient Battlefield Start tile (as in the book\'s diagram).'])
const GATE_OPENS = adventure(
  ['Place the Dire Chamber Start tile on the table and the Vast Gate marker in its center.', 'Place each Hero on a square adjacent to the Vast Gate marker.', 'Draw and place the Dire Chamber tiles next to each unexplored edge of the Dire Chamber Start tile.'],
  { startObjective: { name: 'Vast Gate', hp: 5, ac: 12 } },
)

const start = (card, count = 2) => {
  const heroes = HERO_TEMPLATES.slice(0, count).map((t) => createHero(t))
  const lobby = { ...initialState, lobbyAdventure: card }
  return { ...gameReducer(lobby, { type: 'START_GAME', heroes, tileRandom: [], boardTiles: TILES }), firstRoll: null }
}

describe('adventures on the virtual board', () => {
  it('reads the start tile from the setup steps', () => {
    expect(boardStart(null)).toEqual({ tile: 'start', around: null, doorTiles: false, centre: false })
    expect(boardStart(CLOSED_DOORS)).toMatchObject({ tile: 'ancient-battlefield', doorTiles: true })
    expect(boardStart(GATE_OPENS)).toMatchObject({ tile: 'dire-chamber-start', around: 'dire', centre: true })
  })

  it('The Closed Doors: the Ancient Battlefield with the two white-triangle door tiles beside it', () => {
    const state = start(CLOSED_DOORS)
    expect(state.board.tiles.map((t) => t.tileId)).toEqual(['ancient-battlefield', 'tile-09', 'tile-12'])
    expect(state.board.pile).not.toContain('tile-09')
    expect(state.board.pile).not.toContain('tile-12')
    expect(state.board.pile).toContain('tile-14')
    for (const h of state.heroes) expect(state.board.tokens[h.id][1]).toBeLessThan(3)
  })

  it('The Vast Gate Opens: the gate in the middle, heroes next to it, chamber tiles all around', () => {
    const state = start(GATE_OPENS, 3)
    const gate = state.monsters.find((m) => m.objective)
    const at = state.board.tokens[gate.id]
    expect(at).toBeTruthy()
    for (const h of state.heroes) {
      const sq = state.board.tokens[h.id]
      expect(Math.max(Math.abs(sq[0] - at[0]), Math.abs(sq[1] - at[1]))).toBe(1)
    }
    expect(state.board.tiles.map((t) => t.tileId).filter((id) => /^dire-chamber-\d/.test(id)).length).toBe(3)
  })

  it('puts the exit tile on an open chamber edge after the chamber is laid', () => {
    let state = start(null, 1)
    state = layTile(state, 'Dire Chamber Entrance', 'explore').state
    state = layChamber(state, 'dire', [])
    const before = state.board.tiles.length
    state = layExit(state, 'Tunnel Exit')
    expect(state.board.tiles.length).toBe(before + 1)
    const exit = state.board.tiles.at(-1)
    expect(exit.tileId).toBe('tunnel-exit')
    // Only once.
    expect(layExit(state, 'Tunnel Exit')).toBe(state)
  })

  it('Try again after a loss sets the board up fresh, the same way', () => {
    const lost = { ...start(GATE_OPENS, 2), status: 'lost' }
    const again = gameReducer(lost, { type: 'TRY_AGAIN', tileRandom: [], boardTiles: TILES })
    expect(again.status).toBe('playing')
    expect(again.board.tiles[0].tileId).toBe('dire-chamber-start')
    expect(again.monsters.find((m) => m.objective)).toBeTruthy()
    for (const h of again.heroes) expect(again.board.tokens[h.id]).toBeTruthy()
    // A game on the real tiles stays on the real tiles.
    const table = gameReducer({ ...lost, board: null }, { type: 'TRY_AGAIN', tileRandom: [], boardTiles: TILES })
    expect(table.board).toBe(null)
  })
})
