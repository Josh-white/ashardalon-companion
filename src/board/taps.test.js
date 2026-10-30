import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { createHero, gameReducer, initialState } from '../state/game.js'
import { heroReach } from './play.js'
import { tapTargets } from './taps.js'
import { normalizeTiles } from './tileDefs.js'

// A made-up start tile with a room north of it (as in items.test.js).
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

function game() {
  const heroes = HERO_TEMPLATES.slice(0, 2).map((t) => createHero(t))
  const state = gameReducer(initialState, { type: 'START_GAME', heroes, tileRandom: [], boardTiles: TILES })
  const tiles = [...state.board.tiles, { uid: 't1', tileId: 'room', at: [0, -4], turn: 0 }]
  const [hero, other] = state.heroes
  return { state: { ...state, firstRoll: null, board: { ...state.board, tiles, tokens: { [hero.id]: [0, 1], [other.id]: [1, -2] } } }, hero, other }
}

const taps = { picked: null, byHand: false, tools: true, watching: false, powerMove: false, trapPick: null }

describe('the squares the board lights up', () => {
  it('lights nothing until something is picked', () => {
    const { state } = game()
    expect(tapTargets(state, taps)).toEqual([])
  })

  it('lights where the active hero can move, and nothing for another hero', () => {
    const { state, hero, other } = game()
    expect(tapTargets(state, { ...taps, picked: hero.id })).toEqual(heroReach(state, hero))
    expect(tapTargets(state, { ...taps, picked: other.id })).toEqual([])
  })

  it('lights every free floor square when moving by hand, but nothing while watching', () => {
    const { state, hero } = game()
    const lit = tapTargets(state, { ...taps, picked: hero.id, byHand: true })
    expect(lit).toContain('1,-1')
    expect(lit).not.toContain('1,-2') // the other hero's square
    expect(lit).not.toContain('3,0') // a wall
    expect(tapTargets(state, { ...taps, picked: hero.id, watching: true })).toEqual([])
  })

  it('puts a Treasure token only on a tile with no hero on it', () => {
    const { state, hero, other } = game()
    const added = gameReducer(state, { type: 'ADD_TREASURE_TOKEN' })
    const id = added.board.items[0].id
    const lit = tapTargets(added, { ...taps, picked: id })
    expect(lit).not.toContain('1,-1') // on the room, with a hero in it
    expect(lit).not.toContain('1,0') // the start tile's half with a hero on it
    const away = { ...added, board: { ...added.board, tokens: { [hero.id]: [0, 6], [other.id]: [0, 7] } } }
    expect(tapTargets(away, { ...taps, picked: id })).toContain('1,-1')
    expect(tapTargets(away, { ...taps, picked: id, tools: false })).toEqual([])
  })

  it("lights a trap's tiles to pick from", () => {
    const { state } = game()
    const room = state.board.tiles.find((t) => t.uid === 't1')
    const lit = tapTargets(state, { ...taps, trapPick: { trapId: 'x', tiles: [room.uid] } })
    expect(lit.length).toBeGreaterThan(0)
    expect(lit.every((k) => Number(k.split(',')[1]) < 0)).toBe(true)
  })
})
