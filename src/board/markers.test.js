import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { createHero, gameReducer, initialState } from '../state/game.js'
import { boardMarkers } from './markers.js'
import { normalizeTiles } from './tileDefs.js'

// A made-up start tile with a room north of it.
const TILES = normalizeTiles(
  [
    {
      id: 'start', kind: 'start', rows: ['...#', '...#', '...#', '...#', '...#', '...#', '...#', '...#'],
      exits: { N: 'ooox', S: 'ooox', W: 'oooooooo', E: 'xxxxxxxx' },
      features: [{ type: 'stairs', at: [[1, 3], [2, 3], [1, 4], [2, 4]] }],
    },
    { id: 'room', name: 'Room', kind: 'regular', triangle: 'black', rows: ['....', '.S..', '....', '....'], exits: { N: 'oooo', S: 'oooo', W: 'oooo', E: 'oooo' } },
  ],
  [],
)

function game(traps) {
  const heroes = HERO_TEMPLATES.slice(0, 1).map((t) => createHero(t))
  const state = gameReducer(initialState, { type: 'START_GAME', heroes, tileRandom: [], boardTiles: TILES })
  const tiles = [...state.board.tiles, { uid: 't1', tileId: 'room', at: [0, -4], turn: 0 }]
  return { ...state, firstRoll: null, board: { ...state.board, tiles }, traps }
}

const vapors = { id: 'trap1', cardId: 'volcanic-vapors', name: 'Volcanic Vapors', type: 'hazard', tile: 't1', card: { text: 'A Hero that moves onto this tile...' } }

describe('trap and hazard markers on the board', () => {
  it('finds the 16 squares of the tile a marker is on', () => {
    const [m] = boardMarkers(game([vapors]))
    expect(m.tile).toBe('t1')
    expect(m.squares).toHaveLength(16)
    expect(m.squares.every((sq) => sq.y < 0)).toBe(true)
    expect(m.look.icon).toBe('☁️')
  })

  it('lists a marker with no saved tile, or one whose tile is gone, without squares', () => {
    const old = { ...vapors, id: 'trap2', tile: undefined }
    const gone = { ...vapors, id: 'trap3', tile: 'nowhere' }
    const found = boardMarkers(game([old, gone]))
    expect(found.map((m) => m.squares.length)).toEqual([0, 0])
    expect(found.map((m) => m.tile)).toEqual([undefined, undefined])
  })

  it("doesn't pin a trap that moves (Rolling Boulder) to its first tile", () => {
    const boulder = { id: 'trap4', cardId: 'rolling-boulder', name: 'Rolling Boulder', type: 'trap', tile: 't1', card: { text: 'Move the Rolling Boulder marker one tile toward the closest Hero.' } }
    const [m] = boardMarkers(game([boulder]))
    expect(m.moves).toBe(true)
    expect(m.squares).toHaveLength(0)
  })

  it('gives an unknown card a look by its type', () => {
    const [m] = boardMarkers(game([{ id: 'trap5', cardId: 'new', name: 'New Trap', type: 'trap', tile: 't1', card: {} }]))
    expect(m.look.icon).toBe('⚙️')
  })

  it('is empty with no board or no markers', () => {
    expect(boardMarkers({ ...game([vapors]), board: null })).toEqual([])
    expect(boardMarkers(game([]))).toEqual([])
  })
})

describe('markers on the Start tile', () => {
  it('tints only the half of the Start tile the marker is on', () => {
    const near = boardMarkers(game([{ ...vapors, tile: 'start' }]))[0]
    const far = boardMarkers(game([{ ...vapors, tile: 'start/2' }]))[0]
    expect(near.squares).toHaveLength(16)
    expect(far.squares).toHaveLength(16)
    expect(near.squares.every((sq) => sq.y < 4)).toBe(true)
  })
})
