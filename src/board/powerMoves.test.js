import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { createHero, gameReducer, initialState } from '../state/game.js'
import { moveChoices, movePrompt, moveTargets, queueMoves } from './powerMoves.js'
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
    // A defeated monster can't be moved, so it goes straight to the hero's own move.
    const gone = queueMoves({ ...state, monsters: [] }, heroes[0], power, steps, { attacked: ['m1'], hit: true })
    expect(gone.turn.boardMove.steps).toHaveLength(1)
    expect(moveChoices(gone)).toEqual([heroes[0].id])
  })

  it('puts a monster onto a tile next to its own (Distant Diversion)', () => {
    const { state, heroes, power } = game()
    const next = queueMoves(state, heroes[0], power, [{ pick: 'monsterWithin3', to: 'adjacentTile' }])
    const spots = moveTargets(next, 'm1')
    expect(spots.length).toBeGreaterThan(0)
    expect(spots.every((k) => Number(k.split(',')[1]) >= 0)).toBe(true)
  })

  it('Cause Fear moves the monsters left on the cleric\'s tile after the extra attacks', () => {
    const { state: base, heroes } = game()
    const fear = { id: 'cf', name: 'Cause Fear', type: 'daily', used: false, card: { name: 'Cause Fear' } }
    const strike = { id: 'ss', name: 'Sure Strike', type: 'at-will', used: false, card: { name: 'Sure Strike', attack: '+1', damage: '1' } }
    const tough = { ...base.monsters[0], id: 'm2', name: 'Ogre', hp: 5, maxHp: 5, ac: 10 }
    let state = {
      ...base,
      heroes: base.heroes.map((h, i) => ({ ...h, powers: [i === 0 ? fear : strike] })),
      monsters: [...base.monsters, tough],
      board: { ...base.board, tokens: { ...base.board.tokens, m1: [2, 2], m2: [2, 1] } },
    }
    state = gameReducer(state, { type: 'USE_POWER', heroId: heroes[0].id, powerId: 'cf', heroIds: [heroes[1].id] })
    // Nothing moves until the ally's attack is done.
    expect(state.turn.boardMove).toBeFalsy()
    state = gameReducer(state, { type: 'HERO_ATTACK', heroId: heroes[1].id, powerId: 'ss', bonusAttack: true, targets: [{ monsterId: 'm1', roll: 15 }] })
    expect(state.monsters.map((m) => m.id)).toEqual(['m2'])
    expect(state.turn.boardMove.source).toBe('Cause Fear')
    expect(moveChoices(state)).toEqual(['m2'])
    expect(movePrompt(state)).toMatch(/within 2 tiles/)
    const spot = moveTargets(state, 'm2').find((k) => Number(k.split(',')[1]) < 0)
    state = gameReducer(state, { type: 'BOARD_MOVE', id: 'm2', to: spot.split(',').map(Number) })
    expect(state.board.tokens.m2).toEqual(spot.split(',').map(Number))
    expect(state.turn.boardMove).toBeNull()
    expect(state.turn.causeFear).toBeNull()
  })

  it('Cause Fear still asks for the moves when an ally skips the extra attack', () => {
    const { state: base, heroes } = game()
    const fear = { id: 'cf', name: 'Cause Fear', type: 'daily', used: false, card: { name: 'Cause Fear' } }
    let state = {
      ...base,
      heroes: base.heroes.map((h, i) => (i === 0 ? { ...h, powers: [fear] } : h)),
      board: { ...base.board, tokens: { ...base.board.tokens, m1: [2, 2] } },
    }
    state = gameReducer(state, { type: 'USE_POWER', heroId: heroes[0].id, powerId: 'cf', heroIds: [heroes[1].id] })
    state = gameReducer(state, { type: 'SKIP_BONUS_ATTACK', heroId: heroes[1].id })
    expect(state.turn.bonusAttacks).toEqual([])
    expect(moveChoices(state)).toEqual(['m1'])
  })
})
