import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { createHero, gameReducer, initialState } from '../state/game.js'
import { moveChoices, moveTargets, queueMoves } from './powerMoves.js'
import { normalizeTiles } from './tileDefs.js'

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

// Two heroes at [0,2] and [1,2] on the Start tile, a room north of it, a monster on the room.
function game() {
  const heroes = HERO_TEMPLATES.slice(0, 2).map((t) => createHero(t))
  let state = gameReducer(initialState, { type: 'START_GAME', heroes, tileRandom: [], boardTiles: TILES })
  const monster = { id: 'm1', name: 'Rat', hp: 1, maxHp: 1, ac: 12, xp: 1, ownerId: heroes[0].id, conditions: [], card: { hp: 1, figures: 1, attacks: [], tactics: [] } }
  const tiles = [...state.board.tiles, { uid: 't1', tileId: 'room', at: [0, -4], turn: 0 }]
  state = { ...state, firstRoll: null, monsters: [monster], board: { ...state.board, tiles, tokens: { ...state.board.tokens, m1: [1, -2] } } }
  return { state, heroes: state.heroes, power: { name: 'Test power' } }
}

describe('powers that move figures on the board', () => {
  it('swaps two heroes', () => {
    const { state, heroes, power } = game()
    let next = queueMoves(state, heroes[0], power, [{ pick: 'heroWithin1', to: 'swap' }])
    expect(moveChoices(next)).toEqual([heroes[1].id])
    next = gameReducer(next, { type: 'BOARD_MOVE', id: heroes[1].id })
    expect(next.board.tokens[heroes[0].id]).toEqual([1, 2])
    expect(next.board.tokens[heroes[1].id]).toEqual([0, 2])
    expect(next.turn.boardMove).toBeNull()
  })

  it('pulls a monster within 1 tile next to the hero, then does the next step', () => {
    const { state, heroes, power } = game()
    let next = queueMoves(state, heroes[0], power, [{ pick: 'monsterWithin1', to: 'nextToSelf' }, { pick: 'self', to: 'ownTile' }])
    expect(moveChoices(next)).toEqual(['m1'])
    expect(moveTargets(next, 'm1')).toContain('0,1')
    expect(moveTargets(next, 'm1')).not.toContain('1,2')
    next = gameReducer(next, { type: 'BOARD_MOVE', id: 'm1', to: [0, 1] })
    expect(next.board.tokens.m1).toEqual([0, 1])
    expect(moveChoices(next)).toEqual([heroes[0].id])
    next = gameReducer(next, { type: 'SKIP_BOARD_MOVE' })
    expect(next.turn.boardMove).toBeNull()
  })

  it('only queues a hit step when the attack hit', () => {
    const { state, heroes, power } = game()
    const steps = [{ pick: 'attacked', to: 'squares', n: 1, hit: true }, { pick: 'self', to: 'squares', n: 'speed' }]
    expect(queueMoves(state, heroes[0], power, steps, { attacked: ['m1'], hit: false }).turn.boardMove.steps).toHaveLength(1)
    const hit = queueMoves(state, heroes[0], power, steps, { attacked: ['m1'], hit: true })
    expect(moveChoices(hit)).toEqual(['m1'])
  })

  it('puts a monster onto a tile next to its own (Distant Diversion)', () => {
    const { state, heroes, power } = game()
    const next = queueMoves(state, heroes[0], power, [{ pick: 'monsterWithin3', to: 'adjacentTile' }])
    const spots = moveTargets(next, 'm1')
    expect(spots.length).toBeGreaterThan(0)
    expect(spots.every((k) => Number(k.split(',')[1]) >= 0)).toBe(true)
  })
})
