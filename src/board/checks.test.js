import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { createHero, gameReducer, initialState } from '../state/game.js'
import { boardAnswer, guardsOnTile } from './checks.js'
import { normalizeTiles } from './tileDefs.js'

// A made-up start tile (its east column solid) with a room north of it and another north of that.
const TILES = normalizeTiles(
  [
    {
      id: 'start', kind: 'start', rows: ['...#', '...#', '...#', '...#', '...#', '...#', '...#', '...#'],
      exits: { N: 'ooox', S: 'ooox', W: 'oooooooo', E: 'xxxxxxxx' },
      features: [{ type: 'stairs', at: [[1, 3], [2, 3], [1, 4], [2, 4]] }],
    },
    { id: 'room', name: 'Dire Chamber (start)', kind: 'regular', triangle: 'black', rows: ['....', '.S..', '....', '....'], exits: { N: 'oooo', S: 'oooo', W: 'oooo', E: 'oooo' } },
  ],
  [],
)

// Three heroes: the first two on the Start tile's north half, the third where we say.
function game(thirdAt, extra = {}) {
  const heroes = HERO_TEMPLATES.slice(0, 3).map((t) => createHero(t))
  let state = gameReducer(initialState, { type: 'START_GAME', heroes, tileRandom: [], boardTiles: TILES })
  const tiles = [...state.board.tiles, { uid: 't1', tileId: 'room', at: [0, -4], turn: 0 }, { uid: 't2', tileId: 'room', at: [0, -8], turn: 0 }]
  const [a, b, c] = state.heroes
  const tokens = { [a.id]: [0, 2], [b.id]: [1, 1], [c.id]: thirdAt, ...extra }
  state = { ...state, firstRoll: null, board: { ...state.board, tiles, tokens } }
  return { state, heroes: state.heroes }
}

describe('board answers to end-of-phase questions', () => {
  it('sees another hero on the tile (Hidden Snipers)', () => {
    const { state, heroes } = game([1, -2])
    expect(boardAnswer(state, `Is another hero on ${heroes[0].name}'s tile?`)).toMatchObject({ answer: true })
    expect(boardAnswer(state, `Is another hero on ${heroes[2].name}'s tile?`)).toMatchObject({ answer: false })
  })

  it('counts the Start tile as two tiles', () => {
    const { state, heroes } = game([1, 6])
    const apart = { ...state, board: { ...state.board, tokens: { ...state.board.tokens, [heroes[1].id]: [1, 5] } } }
    expect(boardAnswer(apart, `Is another hero on ${heroes[2].name}'s tile?`)).toMatchObject({ answer: true })
    expect(boardAnswer(apart, `Is another hero on ${heroes[0].name}'s tile?`)).toMatchObject({ answer: false })
  })

  it('doesn’t count a hero off in the Astral Refuge', () => {
    const { state, heroes } = game([1, -2])
    const away = { ...state, heroes: state.heroes.map((h, i) => (i === 1 ? { ...h, tokens: { ...h.tokens, refuge: true } } : h)) }
    expect(boardAnswer(away, `Is another hero on ${heroes[0].name}'s tile?`)).toMatchObject({ answer: false })
  })

  it('knows when a hero is next to a wall (Walls of Magma)', () => {
    const { state, heroes } = game([1, -2])
    const ask = (at) => boardAnswer({ ...state, board: { ...state.board, tokens: { ...state.board.tokens, [heroes[0].id]: at } } }, `Is ${heroes[0].name} next to a wall?`)
    expect(ask([2, 2])).toMatchObject({ answer: true }) // beside the solid column
    expect(ask([2, 0])).toMatchObject({ answer: true }) // diagonal to the solid column
    expect(ask([1, 2])).toMatchObject({ answer: false })
    expect(ask([0, 2])).toMatchObject({ answer: false }) // an unexplored edge isn't a wall
    expect(ask([1, 7])).toMatchObject({ answer: false }) // the south edge is open
    expect(ask([2, 7])).toMatchObject({ answer: true }) // corner by the solid column
  })

  it('finds a monster on a named tile (The Vast Gate)', () => {
    const question = 'Is there a monster on the Dire Chamber Start tile? (If not, one comes out of the Vast Gate: put it next to the gate.)'
    const { state } = game([1, -2], { 'm1#2': [2, -6], gate: [1, -3] })
    const monsters = [{ id: 'm1', name: 'Legion Devil' }, { id: 'gate', name: 'Vast Gate', objective: true }]
    expect(boardAnswer({ ...state, monsters }, question)).toMatchObject({ answer: true })
    const empty = { ...state, monsters, board: { ...state.board, tokens: { ...state.board.tokens, 'm1#2': [1, 1] } } }
    expect(boardAnswer(empty, question)).toMatchObject({ answer: false })
  })

  it('answers villager questions', () => {
    const { state } = game([1, -6], { alek: [2, -2], m1: [2, 2] })
    const withAlek = { ...state, villagers: [{ id: 'alek', name: 'Alek' }], monsters: [{ id: 'm1', name: 'Cultist' }] }
    expect(boardAnswer(withAlek, 'Is Alek within 1 tile of a hero?')).toMatchObject({ answer: true })
    expect(boardAnswer(withAlek, 'Is Alek within 1 tile of a monster?')).toMatchObject({ answer: true })
    expect(boardAnswer(withAlek, 'Is Alek next to a monster?')).toMatchObject({ answer: false })
    expect(boardAnswer(withAlek, 'Is Alek on a tile with an unexplored edge?')).toMatchObject({ answer: true })
  })

  it('asks when the board can’t tell', () => {
    const { state, heroes } = game([1, -2])
    expect(boardAnswer(state, `Did ${heroes[0].name} move during this Hero Phase?`)).toBeNull()
    expect(boardAnswer({ ...state, board: null }, `Is another hero on ${heroes[0].name}'s tile?`)).toBeNull()
    expect(boardAnswer(state, 'Is another hero on Nobody’s tile?')).toBeNull()
  })
})

describe('Blessed Shield on the virtual board', () => {
  it('finds the shield owner on the same tile', () => {
    const { state, heroes } = game([1, -2])
    expect(guardsOnTile(state, heroes[0], [heroes[1]])).toEqual([heroes[1]])
    expect(guardsOnTile(state, heroes[2], [heroes[1]])).toEqual([])
    expect(guardsOnTile({ ...state, board: null }, heroes[0], [heroes[1]])).toBeNull()
  })
})
