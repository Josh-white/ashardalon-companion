import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { createHero, gameReducer, initialState } from './game.js'
import { cowardlyDue, skipsTurn, statusesOf } from './monsterStatus.js'

const ogre = { id: 'ogre', name: 'Ogre', copies: 1, ac: 10, hp: 9, xp: 2, attacks: [{ id: 'club', name: 'Club', bonus: 5, damage: 2 }], tactics: [{ move: 'toward' }] }
const DRUID = { ...HERO_TEMPLATES[2], key: 'druid', name: 'Aldred' }

const start = () => {
  const state = gameReducer(initialState, { type: 'START_GAME', heroes: [createHero(DRUID), createHero(HERO_TEMPLATES[0])] })
  return gameReducer(state, { type: 'DRAW_MONSTER', heroId: state.heroes[0].id, cards: [ogre], random: [] })
}
function give(state, card, type = 'at-will') {
  const slot = state.heroes[0].powers.find((p) => p.type === type)
  return { state: gameReducer(state, { type: 'SET_POWER_CARD', heroId: state.heroes[0].id, powerId: slot.id, card: { id: card.name, ...card } }), id: slot.id }
}
const attack = (state, powerId, roll, extra = {}) =>
  gameReducer(state, { type: 'HERO_ATTACK', heroId: state.heroes[0].id, powerId, targets: [{ monsterId: state.monsters[0].id, roll }], ...extra })

describe('monster statuses', () => {
  it('Pacified: a hit pacifies, the monster skips its turn, and the token comes off', () => {
    let { state, id } = give(start(), { name: 'Pacifying Shot', attack: '+8', damage: '0', effect: { onHit: { status: 'pacified' } } })
    state = attack(state, id, 15)
    expect(skipsTurn(state.monsters[0])?.kind).toBe('pacified')
    state = gameReducer(state, { type: 'MARK_ACTED', id: state.monsters[0].id })
    expect(statusesOf(state.monsters[0])).toEqual([])
  })

  it('Trapped: 2 tokens, one off per turn and one off when attacked', () => {
    let { state, id } = give(start(), { name: 'Trapping Shot', attack: '+6', damage: '0', effect: { onHit: { status: 'trapped' } } })
    state = attack(state, id, 15)
    expect(statusesOf(state.monsters[0])[0]).toMatchObject({ kind: 'trapped', tokens: 2 })
    state = gameReducer(state, { type: 'MARK_ACTED', id: state.monsters[0].id })
    expect(statusesOf(state.monsters[0])[0].tokens).toBe(1)
    const plain = give(state, { name: 'Staff', attack: '+5', damage: '1' }, 'at-will')
    const hit = attack(plain.state, plain.id, 1)
    expect(statusesOf(hit.monsters[0])).toEqual([])
  })

  it('Cowardly: under 11 the monster skips its turn, otherwise it acts', () => {
    let { state, id } = give(start(), { name: 'Follow My Lead', attack: '+10', damage: '2', effect: { onHit: { status: 'cowardly' } } })
    state = attack(state, id, 15)
    const monsterId = state.monsters[0].id
    expect(cowardlyDue(state.monsters[0])).toBeTruthy()
    const fled = gameReducer(state, { type: 'COWARDLY_ROLL', id: monsterId, roll: 5 })
    expect(fled.turn.acted).toContain(monsterId)
    expect(statusesOf(fled.monsters[0])).toEqual([])
    const brave = gameReducer(state, { type: 'COWARDLY_ROLL', id: monsterId, roll: 15 })
    expect(brave.turn.acted ?? []).not.toContain(monsterId)
    expect(cowardlyDue(brave.monsters[0])).toBeNull()
  })
})

describe('Wolf Form', () => {
  const wolfCard = { name: 'Wolf Form', attack: '+9', damage: '1', effect: { wolf: true } }

  it('costs 1 HP, blocks other powers, Pounce is -2 and Slows, and damage changes the wolf back', () => {
    let { state, id } = give(start(), wolfCard)
    const druid = () => state.heroes[0]
    // Not the wolf yet: Wolf Form can't attack.
    expect(attack(state, id, 15)).toBe(state)
    const hp = druid().hp
    state = gameReducer(state, { type: 'WOLF_FORM', heroId: druid().id, on: true })
    expect(druid().hp).toBe(hp - 1)
    expect(druid().tokens.wolf).toBeTruthy()
    // Another power is blocked while he's the wolf.
    const staff = give(state, { name: 'Staff', attack: '+8', damage: '1' }, 'daily')
    expect(attack(staff.state, staff.id, 15)).toBe(staff.state)
    // Pounce: 1 + 9 - 2 = 8 misses AC 10; 3 + 7 = 10 hits and Slows.
    expect(attack(state, id, 1, { pounce: true }).monsters[0].hp).toBe(9)
    const pounced = attack(state, id, 3, { pounce: true })
    expect(statusesOf(pounced.monsters[0])[0].kind).toBe('slowed')
    // Damage changes him back.
    const hurt = gameReducer(state, { type: 'ADJUST_HP', heroId: druid().id, amount: -1 })
    expect(hurt.heroes[0].tokens.wolf).toBeFalsy()
  })
})
