import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { createHero, gameReducer, initialState } from '../state/game.js'
import { normalizeCardFile } from '../data/cards.js'
import { pathOf } from './powerMoves.js'
import { normalizeTiles } from './tileDefs.js'
import { attackRange, boardAnswers } from './attackDistances.js'
import { attackOptions } from '../ally/brain.js'

// The hero power sweep (2026-11-03): each power's flow on the virtual board checked against its
// card. Card texts here are short made-up stand-ins; the effects come from powerEffects.js by name.

// An open 4x8 Start tile (made up): rows 0-3 are one tile ('start'), rows 4-7 the other ('start/2').
const TILES = normalizeTiles(
  [{ id: 'start', kind: 'start', rows: ['....', '....', '....', '....', '....', '....', '....', '....'], exits: { N: 'oooo', S: 'oooo', W: 'oooooooo', E: 'oooooooo' } }],
  [],
)
const { monsters } = normalizeCardFile({
  powers: [],
  monsters: [{ id: 'rat', name: 'Rat', copies: 3, ac: 12, hp: 2, xp: 1, attacks: [{ id: 'bite', name: 'Bite', bonus: 5, damage: 1 }], tactics: [{ move: 'toward' }] }],
})
const card = (name, type, text, attack = '+7', damage = '1') => ({ id: name.toLowerCase().replace(/\W/g, '-'), name, type, text, attack, damage })

// Heroes (Quinn, Vistra, Keyleth, Tarak, Heskan by template index), each power slot of `type`
// given the card; three rats at `rats`.
function setup({ heroes = [1], cards = [], rats = [[3, 0], [3, 3], [0, 7]], at } = {}) {
  let s = gameReducer(initialState, { type: 'START_GAME', heroes: heroes.map((i) => createHero(HERO_TEMPLATES[i])), tileRandom: [], boardTiles: TILES })
  s = { ...s, firstRoll: null }
  for (const [index, c] of cards) {
    const hero = s.heroes[index]
    const slot = hero.powers.find((p) => p.type === c.type && !p.card)
    s = gameReducer(s, { type: 'SET_POWER_CARD', heroId: hero.id, powerId: slot.id, card: c })
  }
  s = { ...s, monsters: rats.map((_, i) => ({ id: `m${i}`, name: 'Rat', card: monsters[0], ac: 12, hp: 2, maxHp: 2, conditions: [] })) }
  const tokens = Object.fromEntries(rats.map((sq, i) => [`m${i}`, sq]))
  s.heroes.forEach((h, i) => (tokens[h.id] = at?.[i] ?? [0, i]))
  s = { ...s, board: { ...s.board, tokens } }
  return s
}
const powerOf = (s, i, name) => s.heroes[i].powers.find((p) => p.name === name)
const attack = (s, i, name, ids, roll = 15, extra = {}) =>
  gameReducer(s, { type: 'HERO_ATTACK', heroId: s.heroes[i].id, powerId: powerOf(s, i, name).id, targets: ids.map((monsterId) => ({ monsterId, roll })), distances: {}, ...extra })

const CHARGE = card('Charge', 'at-will', 'Move up to your speed, then attack one adjacent Monster.', '+8')
const TAUNT = card('Taunting Advance', 'daily', 'Move your speed. Then choose a Monster within 2 tiles of you. Place that Monster adjacent to your Hero and attack it.', '+8', '3 Miss: 1')
const SURE = card('Sure Strike', 'at-will', 'Attack one adjacent Monster.', '+11')

describe('a power that moves before its attack', () => {
  it('Cancel puts everything back and forgets the move, for any of them (Taunting Advance)', () => {
    let s = setup({ cards: [[0, TAUNT]] })
    let hero = s.heroes[0]
    s = gameReducer(s, { type: 'START_BOARD_MOVE', heroId: hero.id, powerId: powerOf(s, 0, 'Taunting Advance').id })
    expect(s.turn.boardMove.before).toBe(true)
    s = gameReducer(s, { type: 'BOARD_MOVE', id: hero.id, to: [2, 2] })
    // Now the pull: a rat goes next to Vistra.
    s = gameReducer(s, { type: 'BOARD_MOVE', id: 'm2', to: [2, 3] })
    expect(s.board.tokens.m2).toEqual([2, 3])
    // The pull was the last step, so the move is over: start again and cancel half way instead.
    s = setup({ cards: [[0, TAUNT]] })
    hero = s.heroes[0]
    s = gameReducer(s, { type: 'START_BOARD_MOVE', heroId: hero.id, powerId: powerOf(s, 0, 'Taunting Advance').id })
    s = gameReducer(s, { type: 'BOARD_MOVE', id: hero.id, to: [1, 4] })
    expect(s.turn.heroTiles[hero.id].entered).toHaveLength(1)
    s = gameReducer(s, { type: 'CANCEL_BOARD_MOVE' })
    expect(s.board.tokens[hero.id]).toEqual([0, 0])
    expect(s.turn.boardMove).toBeNull()
    expect(s.turn.beforeMoved).toBeNull()
    // Vistra never left her tile after all (Volcanic Vapors, Dwarven Hammer ask this).
    expect(s.turn.heroTiles?.[hero.id]?.entered ?? []).toEqual([])
  })

  it('a swap goes back too (Benign Transposition)', () => {
    const SWAP = card('Benign Transposition', 'daily', 'Choose 1 Hero within 2 tiles of you. You swap positions with that Hero. After swapping positions, attack one adjacent Monster.', '+8', '3 Miss: 1')
    let s = setup({ heroes: [2, 1], cards: [[0, SWAP]], at: [[0, 0], [0, 5]] })
    const [keyleth, vistra] = s.heroes
    s = gameReducer(s, { type: 'START_BOARD_MOVE', heroId: keyleth.id, powerId: powerOf(s, 0, 'Benign Transposition').id })
    s = { ...s, turn: { ...s.turn, boardMove: { ...s.turn.boardMove, steps: [...s.turn.boardMove.steps, { pick: 'self', to: 'squares', n: 1 }] } } }
    s = gameReducer(s, { type: 'BOARD_MOVE', id: vistra.id })
    expect(s.board.tokens[keyleth.id]).toEqual([0, 5])
    s = gameReducer(s, { type: 'CANCEL_BOARD_MOVE' })
    expect(s.board.tokens[keyleth.id]).toEqual([0, 0])
    expect(s.board.tokens[vistra.id]).toEqual([0, 5])
  })

  it("starting another power's move calls off the first one's", () => {
    let s = setup({ cards: [[0, CHARGE], [0, TAUNT]] })
    const hero = s.heroes[0]
    s = gameReducer(s, { type: 'START_BOARD_MOVE', heroId: hero.id, powerId: powerOf(s, 0, 'Taunting Advance').id })
    s = gameReducer(s, { type: 'BOARD_MOVE', id: hero.id, to: [1, 4] })
    s = gameReducer(s, { type: 'START_BOARD_MOVE', heroId: hero.id, powerId: powerOf(s, 0, 'Charge').id })
    expect(s.board.tokens[hero.id]).toEqual([0, 0])
    expect(s.turn.boardMove.source).toBe('Charge')
    expect(s.turn.beforeMoved).toBe(powerOf(s, 0, 'Charge').id)
  })

  it("attacking drops a move still waiting (Taunting Advance's pull never made)", () => {
    let s = setup({ cards: [[0, TAUNT], [0, SURE]], rats: [[1, 0], [3, 3], [0, 7]] })
    const hero = s.heroes[0]
    s = gameReducer(s, { type: 'START_BOARD_MOVE', heroId: hero.id, powerId: powerOf(s, 0, 'Taunting Advance').id })
    s = gameReducer(s, { type: 'SKIP_BOARD_MOVE' })
    expect(s.turn.boardMove.steps[0].to).toBe('nextToSelf')
    // The player attacks with Sure Strike instead: the board doesn't keep asking for the pull.
    s = attack(s, 0, 'Sure Strike', ['m0'])
    expect(s.turn.lastAttack.rolls).toHaveLength(1)
    expect(s.turn.boardMove).toBeNull()
    expect(s.turn.beforeMoved).toBeNull()
  })

  it('the end of the Hero Phase drops a move still waiting', () => {
    let s = setup({ cards: [[0, CHARGE]] })
    s = gameReducer(s, { type: 'START_BOARD_MOVE', heroId: s.heroes[0].id, powerId: powerOf(s, 0, 'Charge').id })
    expect(s.turn.boardMove).not.toBeNull()
    s = gameReducer(s, { type: 'NEXT_PHASE' })
    expect(s.turn.phase).toBe(1)
    expect(s.turn.boardMove).toBeNull()
    expect(s.turn.beforeMoved).toBeNull()
  })

  it("reaches all monsters until the move is made, then only the card's reach after it", () => {
    const CASTLE = card("King's Castle", 'daily', 'Swap positions with one Hero within 1 tile of you. Attack 1 Monster within 2 tiles of you.', '+7', '3 Miss: 1')
    let s = setup({ heroes: [1, 3], cards: [[0, CHARGE], [1, CASTLE]] })
    const charge = powerOf(s, 0, 'Charge')
    expect(attackRange(s, charge)).toBeNull()
    s = gameReducer(s, { type: 'START_BOARD_MOVE', heroId: s.heroes[0].id, powerId: charge.id })
    expect(attackRange(s, charge)).toBeNull()
    s = gameReducer(s, { type: 'BOARD_MOVE', id: s.heroes[0].id, to: [2, 0] })
    expect(attackRange(s, charge)).toBe('adjacent')
    s = { ...s, turn: { ...s.turn, beforeMoved: powerOf(s, 1, "King's Castle").id } }
    expect(attackRange(s, powerOf(s, 1, "King's Castle"))).toBe('within2')
  })
})

describe('reach read from the cards', () => {
  it("Acrobatic Onslaught attacks a monster next to the hero; the 2 tiles are where it lands (computer allies too)", () => {
    const ACRO = card('Acrobatic Onslaught', 'daily', 'Attack one adjacent Monster.\nHit or Miss: Place your Hero on any tile within 2 tiles of where you started, and then use an At-Will power immediately.', '+7', '2 Miss: 1')
    const s = setup({ heroes: [3], cards: [[0, ACRO]], rats: [[3, 3], [0, 7]] })
    const tarak = s.heroes[0]
    expect(attackRange(s, powerOf(s, 0, 'Acrobatic Onslaught'))).toBe('adjacent')
    expect(attackOptions(s, tarak, { all: true }).filter((o) => o.power.name === 'Acrobatic Onslaught')).toEqual([])
  })

  it('Hurled Breath and Shock Sphere hit the monsters of one tile: the computer picks the fuller one', () => {
    const SHOCK = card('Shock Sphere', 'daily', 'Choose a tile within 2 tiles of you. Attack each Monster on that tile.', '+9', '2 Miss: 1')
    const s = setup({ heroes: [4], cards: [[0, SHOCK]], rats: [[3, 0], [2, 6], [3, 7]] })
    const option = attackOptions(s, s.heroes[0], { all: true }).find((o) => o.power.name === 'Shock Sphere')
    expect(option.targets.sort()).toEqual(['m1', 'm2'])
  })
})

describe('powers that answer from the board', () => {
  const HOLY = card('Holy Strike', 'at-will', 'Attack one adjacent Monster. If you started your Hero Phase adjacent to the Monster, deal +1 damage if you hit.', '+8')
  const VALIANT = card('Valiant Strike', 'at-will', 'Attack one adjacent Monster. You get a +1 bonus to attack for each Monster adjacent to your Hero.', '+8')
  it("Valiant Strike counts the monsters next to the hero, Holy Strike knows while the hero hasn't moved", () => {
    let s = setup({ heroes: [2], cards: [[0, HOLY], [0, VALIANT]], rats: [[1, 0], [0, 1], [3, 3]] })
    const keyleth = s.heroes[0]
    expect(boardAnswers(s, keyleth, powerOf(s, 0, 'Valiant Strike'))).toEqual({ adjacentCount: 2 })
    expect(boardAnswers(s, keyleth, powerOf(s, 0, 'Holy Strike'), ['m0'])).toEqual({ startedAdjacent: true })
    expect(boardAnswers(s, keyleth, powerOf(s, 0, 'Holy Strike'), ['m2'])).toEqual({ startedAdjacent: false })
    s = gameReducer(s, { type: 'MOVE_HERO', heroId: keyleth.id, to: [2, 2] })
    // After a move the board can't tell where Keyleth started next to: the players answer.
    expect(boardAnswers(s, s.heroes[0], powerOf(s, 0, 'Holy Strike'), ['m2'])).toEqual({})
  })
})

describe("Cleric's Shield", () => {
  it('using it again ends the old shield, even when nobody is picked for the new one', () => {
    const SHIELD = card("Cleric's Shield", 'at-will', 'Attack one adjacent Monster. Hit or Miss: Choose 1 Hero on your tile. That Hero gains a +2 bonus to AC until you use this power again.', '+6')
    let s = setup({ heroes: [0, 1], cards: [[0, SHIELD]], rats: [[0, 1], [3, 3]] })
    const [quinn, vistra] = s.heroes
    s = attack(s, 0, "Cleric's Shield", ['m0'])
    s = gameReducer(s, { type: 'ATTACK_FOLLOW_UP', heroId: quinn.id, powerId: powerOf(s, 0, "Cleric's Shield").id, heroIds: [vistra.id] })
    expect(s.heroes[1].shieldedBy).toBe(quinn.id)
    s = { ...s, turn: { ...s.turn, lastAttack: null } }
    s = attack(s, 0, "Cleric's Shield", ['m0'])
    expect(s.heroes[1].shieldedBy).toBeNull()
  })
})

describe('Distracting Jab with a reroll', () => {
  it('a miss rolled again into a hit moves the monster 1 square first, then the rogue walks', () => {
    const JAB = card('Distracting Jab', 'at-will', 'Attack one adjacent Monster. If you hit, move the Monster 1 square. After the attack, move your speed.', '+7')
    const ADVICE = card('Inspiring Advice', 'utility', 'Use when a Hero misses a Monster with an attack. The Hero rerolls the attack.', '', '')
    let s = setup({ heroes: [3, 1], cards: [[0, JAB], [1, ADVICE]], rats: [[1, 0], [3, 3]], at: [[0, 0], [0, 4]] })
    const [tarak, vistra] = s.heroes
    s = attack(s, 0, 'Distracting Jab', ['m0'], 2)
    expect(s.turn.boardMove.steps.map((x) => x.pick)).toEqual(['self'])
    s = gameReducer(s, { type: 'REROLL_ATTACK', helperId: vistra.id, helperPowerId: powerOf(s, 1, 'Inspiring Advice').id, monsterId: 'm0', roll: 18 })
    expect(s.turn.lastAttack.rolls[0].hit).toBe(true)
    expect(s.turn.boardMove.steps.map((x) => x.pick)).toEqual(['attacked', 'self'])
    expect(s.turn.boardMove.heroId).toBe(tarak.id)
  })
})

describe('Cause Fear', () => {
  const FEAR = card('Cause Fear', 'daily', 'Choose a tile within 1 tile of you. Each ally on that tile adjacent to a Monster can make an At-Will attack with a +2 bonus. After the attacks, place each Monster remaining on a tile within 2 tiles of you.', '', '')
  it("moves the monsters left on the tile it was cast on, not the cleric's own", () => {
    // Quinn on the top tile; Vistra on the bottom one next to a rat; another rat on Quinn's tile.
    let s = setup({ heroes: [0, 1], cards: [[0, FEAR]], rats: [[0, 6], [3, 0]], at: [[0, 0], [0, 5]] })
    const [quinn, vistra] = s.heroes
    s = gameReducer(s, { type: 'USE_POWER', heroId: quinn.id, powerId: powerOf(s, 0, 'Cause Fear').id, heroIds: [vistra.id] })
    expect(s.turn.causeFear.tile).toBe('start/2')
    s = gameReducer(s, { type: 'SKIP_BONUS_ATTACK', heroId: vistra.id })
    expect(s.turn.boardMove.tokens).toEqual(['m0'])
    expect(pathOf(s)).toBeNull()
  })
})
