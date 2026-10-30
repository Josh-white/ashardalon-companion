import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { createHero, gameReducer, initialState } from '../state/game.js'
import { boardStep, boardTargetIds, closestTarget, foeDistance, foesInRange, powerRange, squareAway, squareNextTo, squareToward } from './monsters.js'
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

describe('an invisible hero on the board', () => {
  const invisible = (state, ...ids) => ({ ...state, heroes: state.heroes.map((h) => (ids.includes(h.id) ? { ...h, tokens: { ...h.tokens, invisible: true } } : h)) })

  it('is never picked as the closest hero while another hero is in reach', () => {
    const { state, monster, heroes } = game([0, -2])
    expect(boardTargetIds(invisible(state, heroes[0].id), monster, CULTIST.tactics[0])).toEqual([heroes[1].id])
  })

  it('is not attacked when only invisible heroes are in reach, and nobody is moved toward', () => {
    const { state, monster, heroes } = game([0, -2])
    const hidden = invisible(state, heroes[0].id, heroes[1].id)
    expect(boardStep(hidden, monster)).toBe(1)
    expect(closestTarget(hidden, 'm1')).toBeNull()
  })

  it('is still hit by attacks on every hero, and by a monster next to them', () => {
    const { state, monster, heroes } = game([0, 1])
    const hidden = invisible(state, heroes[0].id, heroes[1].id)
    const all = { when: 'within1', attack: 'dagger', targets: 'all' }
    expect(boardTargetIds(hidden, monster, all).sort()).toEqual([heroes[0].id, heroes[1].id].sort())
    const adjacent = [{ when: 'adjacent', attack: 'dagger' }, { move: 'toward' }]
    expect(boardStep(hidden, monster, adjacent)).toBe(0)
    expect(boardTargetIds(hidden, monster, adjacent[0])).toHaveLength(1)
  })
})

describe('a monster card with several figures', () => {
  it('puts a token down for each figure, and takes one away when a figure falls', () => {
    const heroes = HERO_TEMPLATES.slice(0, 1).map((t) => createHero(t))
    let state = gameReducer(initialState, { type: 'START_GAME', heroes, tileRandom: [], boardTiles: TILES })
    state = { ...state, firstRoll: null, turn: { ...state.turn, boardTiles: [{ uid: 'start', side: 'N', filled: false }] } }
    const cards = [{ id: 'devils', name: 'Legion Devil', copies: 1, ac: 14, hp: 1, xp: 3, figures: 3, attacks: [{ id: 'claw', name: 'Claw', bonus: 6, damage: 1 }], tactics: [{ move: 'toward' }] }]
    state = gameReducer(state, { type: 'DRAW_MONSTER', heroId: heroes[0].id, cards, random: [] })
    const devil = state.monsters[0]
    expect(Object.keys(state.board.tokens).filter((id) => id.startsWith(devil.id)).sort()).toEqual([devil.id, `${devil.id}#2`, `${devil.id}#3`])
    state = gameReducer(state, { type: 'ADJUST_MONSTER_HP', monsterId: devil.id, amount: -1 })
    expect(Object.keys(state.board.tokens).filter((id) => id.startsWith(devil.id)).sort()).toEqual([devil.id, `${devil.id}#2`])
    // Each figure moves on its own.
    const before = state.board.tokens[`${devil.id}#2`]
    state = gameReducer(state, { type: 'MOVE_TOKEN', id: `${devil.id}#2`, to: [2, 7] })
    expect(state.board.tokens[`${devil.id}#2`]).toEqual([2, 7])
    expect(before).not.toEqual([2, 7])
    expect(gameReducer(state, { type: 'MOVE_TOKEN', id: `${devil.id}#3`, to: [2, 6] })).toBe(state)
  })
})

describe('hero attacks on the board', () => {
  it('reads a power\'s reach from its text', () => {
    expect(powerRange('Attack one adjacent Monster. Hit: 2 damage.')).toBe('adjacent')
    expect(powerRange('Choose a Monster within 1 tile of you. Hit: 1 damage. Miss: put it adjacent.')).toBe('within1')
    expect(powerRange('Attack each Monster on your tile.')).toBe('sameTile')
    expect(powerRange('Attack one Monster. Hit: 1 damage, then move adjacent.')).toBeNull()
    // The hero moves or swaps first, so anything could end up in reach.
    expect(powerRange('Move up to your speed, then attack one adjacent Monster.')).toBeNull()
    expect(powerRange('Swap places with a Hero within 1 tile. Attack a Monster within 2 tiles.')).toBeNull()
    // The range can come after the first mention of the monsters.
    expect(powerRange('Attack up to two Monsters. Each can be on your tile or within 1 tile of you.')).toBe('within1')
  })

  it('offers only the monsters in reach, and says how far each is', () => {
    const { state, monster, heroes } = game([0, 1])
    const far = { ...monster, id: 'm2' }
    const both = { ...state, monsters: [monster, far], board: { ...state.board, tokens: { ...state.board.tokens, m2: [1, -6] } } }
    expect(foesInRange(both, heroes[0].id, 'adjacent', both.monsters).map((m) => m.id)).toEqual(['m1'])
    expect(foesInRange(both, heroes[0].id, null, both.monsters)).toHaveLength(2)
    expect(foeDistance(both, heroes[0].id, 'm1')).toBe('adjacent')
    expect(foeDistance(both, heroes[0].id, 'm2')).toBe('far')
  })
})
