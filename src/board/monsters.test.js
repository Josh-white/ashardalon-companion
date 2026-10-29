import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { createHero, gameReducer, initialState } from '../state/game.js'
import { boardStep, boardTargetIds, closestTarget, squareAway, squareNextTo, squareToward } from './monsters.js'
import { normalizeTiles } from './tileDefs.js'

// A made-up start tile and an open room laid north of it, then a second room north of that.
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

const CULTIST = {
  hp: 1,
  attacks: [{ id: 'dagger', name: 'Dagger', bonus: 6, damage: 1 }],
  tactics: [
    { when: 'within1', move: 'adjacent', attack: 'dagger' },
    { move: 'toward' },
  ],
}

// Two heroes on the Start tile, two rooms north of it and a monster where we say.
function game(monsterAt) {
  const heroes = HERO_TEMPLATES.slice(0, 2).map((t) => createHero(t))
  let state = gameReducer(initialState, { type: 'START_GAME', heroes, tileRandom: [], boardTiles: TILES })
  const tiles = [
    ...state.board.tiles,
    { uid: 't1', tileId: 'room', at: [0, -4], turn: 0 },
    { uid: 't2', tileId: 'room', at: [0, -8], turn: 0 },
  ]
  const monster = { id: 'm1', name: 'Cultist', hp: 1, maxHp: 1, ac: 14, xp: 1, ownerId: heroes[0].id, conditions: [], card: CULTIST }
  state = { ...state, firstRoll: null, monsters: [monster], board: { ...state.board, tiles, tokens: { ...state.board.tokens, m1: monsterAt } } }
  return { state, monster, heroes: state.heroes }
}

describe('monster turns on the virtual board', () => {
  it('answers the card from the board and attacks the closest hero within 1 tile', () => {
    const { state, monster, heroes } = game([0, -2])
    // Heroes start at [0,2] and [1,2] on the Start tile; the monster is on the next tile.
    expect(boardStep(state, monster)).toBe(0)
    expect(boardTargetIds(state, monster, CULTIST.tactics[0])).toEqual([heroes[0].id])
    const next = squareNextTo(state, 'm1', state.board.tokens[heroes[0].id])
    expect(Math.max(Math.abs(next[0] - 0), Math.abs(next[1] - 2))).toBe(1)
    expect(next).not.toEqual(state.board.tokens[heroes[1].id])
  })

  it('moves 1 tile toward the closest hero when none is near', () => {
    const { state, monster, heroes } = game([1, -6])
    expect(boardStep(state, monster)).toBe(1)
    expect(closestTarget(state, 'm1').id).toBe(heroes[0].id)
    const to = squareToward(state, 'm1', state.board.tokens[heroes[0].id])
    // It ends on the middle tile, on its square closest to the hero.
    expect(to[1]).toBe(-1)
  })

  it('steps away from the heroes after an attack', () => {
    const { state } = game([0, 1])
    const to = squareAway(state, 'm1')
    expect(Math.abs(to[1] - 2)).toBeGreaterThan(1)
  })

  it('leaves monsters that are not on the board to the questions', () => {
    const { state, monster } = game([0, -2])
    const off = { ...state, board: { ...state.board, tokens: { ...state.board.tokens, m1: undefined } } }
    delete off.board.tokens.m1
    expect(boardStep(off, monster)).toBeNull()
  })
})
