import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { attackGone, createHero, gameReducer, initialState } from '../state/game.js'
import { normalizeCardFile } from '../data/cards.js'
import { movesLeft } from './play.js'
import { moveTargets, pathOf } from './powerMoves.js'
import { normalizeTiles } from './tileDefs.js'
import { attackDistances } from './attackDistances.js'

// An open 4x8 Start tile (made up).
const TILES = normalizeTiles(
  [{ id: 'start', kind: 'start', rows: ['....', '....', '....', '....', '....', '....', '....', '....'], exits: { N: 'oooo', S: 'oooo', W: 'oooooooo', E: 'oooooooo' } }],
  [],
)
const { monsters } = normalizeCardFile({
  powers: [],
  monsters: [{ id: 'rat', name: 'Rat', copies: 3, ac: 12, hp: 1, xp: 1, attacks: [{ id: 'bite', name: 'Bite', bonus: 5, damage: 1 }], tactics: [{ move: 'toward' }] }],
})
const MANTIS = { id: 'mantis', name: 'Whirling Mantis Step', attack: '+7', damage: '1', effect: { targets: 'any', board: { before: [{ pick: 'self', to: 'path', n: 'speed' }] } } }

function setup() {
  let s = gameReducer(initialState, { type: 'START_GAME', heroes: [createHero(HERO_TEMPLATES[1])], tileRandom: [], boardTiles: TILES })
  s = { ...s, firstRoll: null }
  const hero = s.heroes[0]
  const slot = hero.powers.find((p) => p.type === 'daily')
  s = gameReducer(s, { type: 'SET_POWER_CARD', heroId: hero.id, powerId: slot.id, card: MANTIS })
  // Darna at the top left; rats at the far right of rows 0 and 3, and one at the bottom.
  const two = [0, 1, 2].map(() => monsters[0])
  s = { ...s, monsters: two.map((card, i) => ({ id: `m${i}`, name: 'Rat', card, ac: 12, hp: 1, maxHp: 1 })) }
  s = { ...s, board: { ...s.board, tokens: { [hero.id]: [0, 0], m0: [3, 0], m1: [3, 3], m2: [0, 7] } } }
  return { s, hero, power: slot }
}
const walk = (s, hero, to) => gameReducer(s, { type: 'BOARD_MOVE', id: hero.id, to })

describe("Whirling Mantis Step's walk", () => {
  it('walks square by square, counts down, and keeps every monster next to the way', () => {
    let { s, hero, power } = setup()
    s = gameReducer(s, { type: 'START_BOARD_MOVE', heroId: hero.id, powerId: power.id })
    expect(pathOf(s).left).toBe(hero.speed)
    expect(s.turn.powerPassed.ids).toEqual([])
    s = walk(s, hero, [1, 0])
    s = walk(s, hero, [2, 0])
    expect(s.turn.powerPassed.ids).toEqual(['m0'])
    expect(pathOf(s).left).toBe(hero.speed - 2)
    // Several squares in one tap: the way there counts too.
    s = walk(s, hero, [2, 2])
    expect(s.turn.powerPassed.ids.sort()).toEqual(['m0', 'm1'])
    // Back a step, then stop early.
    s = gameReducer(s, { type: 'PATH_BACK' })
    expect(s.board.tokens[hero.id]).not.toEqual([2, 2])
    expect(pathOf(s).trail).toHaveLength(4)
    expect(s.turn.powerPassed.ids).toEqual(['m0'])
    s = gameReducer(s, { type: 'SKIP_BOARD_MOVE' })
    expect(s.turn.boardMove).toBeNull()
    expect(s.turn.powerPassed).toMatchObject({ source: 'Whirling Mantis Step', ids: ['m0'] })
    // The walk isn't one of her moves.
    expect(s.turn.boardMoves ?? 0).toBe(0)
  })

  it('counts each figure of a group card it walks past (Legion Devils)', () => {
    let { s, hero, power } = setup()
    // m0 has two figures: one at the top right, one at [3, 1].
    s = { ...s, monsters: s.monsters.map((m) => (m.id === 'm0' ? { ...m, hp: 3, maxHp: 3, card: { ...m.card, hp: 1, figures: 3 } } : m)) }
    s = { ...s, board: { ...s.board, tokens: { ...s.board.tokens, 'm0#2': [3, 1] } } }
    s = gameReducer(s, { type: 'START_BOARD_MOVE', heroId: hero.id, powerId: power.id })
    s = walk(s, hero, [2, 0])
    expect(s.turn.powerPassed.ids).toEqual(['m0', 'm0'])
  })

  it('ends by itself when the steps run out, and works for a Dazed hero', () => {
    let { s, hero, power } = setup()
    s = { ...s, heroes: s.heroes.map((h) => ({ ...h, conditions: ['Dazed'] })) }
    s = { ...s, board: { ...s.board, tokens: { ...s.board.tokens, m2: [0, hero.speed + 1] } } }
    s = gameReducer(s, { type: 'START_BOARD_MOVE', heroId: hero.id, powerId: power.id })
    const far = moveTargets(s, hero.id)
    expect(far).not.toContain(`0,${hero.speed + 1}`)
    s = walk(s, hero, [0, hero.speed])
    expect(s.turn.boardMove).toBeNull()
    expect(s.turn.powerPassed.ids).toEqual(['m2'])
    expect(attackGone(s, s.heroes[0])).toBeNull()
    expect(movesLeft(s, s.heroes[0])).toBe(1)
  })
})

describe("Whirling Mantis Step and magic weapons' distance", () => {
  const SWORD = { id: 'sword', name: 'Magic Sword', card: { inPlay: true, attackBonus: 1, attackRange: 'adjacent' } }
  it('counts every monster walked past as next to the hero, wherever the walk ended', () => {
    let { s, hero, power } = setup()
    s = { ...s, heroes: s.heroes.map((h) => ({ ...h, items: [SWORD] })) }
    s = gameReducer(s, { type: 'START_BOARD_MOVE', heroId: hero.id, powerId: power.id })
    s = walk(s, hero, [2, 0])
    s = walk(s, hero, [2, 2])
    s = walk(s, hero, [1, 4])
    s = gameReducer(s, { type: 'SKIP_BOARD_MOVE' })
    const darna = s.heroes[0]
    const mantis = darna.powers.find((p) => p.id === power.id)
    expect(attackDistances(s, darna, ['m0', 'm1'], mantis)).toEqual({ m0: 'adjacent', m1: 'adjacent' })
    // A plain attack still reads the board: from [1, 4] the rats are farther.
    expect(attackDistances(s, darna, ['m0'], null)).toEqual({ m0: 'far' })
  })

  it('answers next to me off the virtual board too, and for an old jump-style card copy', () => {
    const { s, hero } = setup()
    const old = { name: 'Whirling Mantis Step', card: { text: 'Move your speed. Attack each Monster once that was adjacent to you during the movement.', effect: { board: { before: [{ pick: 'self', to: 'squares', n: 'speed' }] } } } }
    const offBoard = { ...s, board: null }
    expect(attackDistances(offBoard, { ...hero, items: [SWORD] }, ['m0', 'm1'], old)).toEqual({ m0: 'adjacent', m1: 'adjacent' })
  })
})

describe("Cancelling Whirling Mantis Step's walk", () => {
  it('puts the hero back, forgets the monsters passed, and lets the power walk again', () => {
    let { s, hero, power } = setup()
    s = gameReducer(s, { type: 'START_BOARD_MOVE', heroId: hero.id, powerId: power.id })
    s = walk(s, hero, [2, 0])
    expect(s.turn.powerPassed.ids).toEqual(['m0'])
    s = gameReducer(s, { type: 'CANCEL_BOARD_MOVE' })
    expect(s.board.tokens[hero.id]).toEqual([0, 0])
    expect(s.turn.boardMove).toBeNull()
    expect(s.turn.powerPassed).toBeNull()
    expect(s.turn.beforeMoved).toBeNull()
    // Walking it again starts fresh.
    s = gameReducer(s, { type: 'START_BOARD_MOVE', heroId: hero.id, powerId: power.id })
    expect(pathOf(s).left).toBe(hero.speed)
    expect(s.turn.powerPassed.ids).toEqual([])
  })

  it("a normal move after a finished walk drops the walk's monsters", () => {
    let { s, hero, power } = setup()
    s = gameReducer(s, { type: 'START_BOARD_MOVE', heroId: hero.id, powerId: power.id })
    s = walk(s, hero, [2, 0])
    s = gameReducer(s, { type: 'SKIP_BOARD_MOVE' })
    expect(s.turn.powerPassed.ids).toEqual(['m0'])
    s = gameReducer(s, { type: 'MOVE_HERO', heroId: hero.id, to: [1, 2] })
    expect(s.board.tokens[hero.id]).toEqual([1, 2])
    expect(s.turn.powerPassed).toBeNull()
    expect(s.turn.beforeMoved).toBeNull()
  })
})
