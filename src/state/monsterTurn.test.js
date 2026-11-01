import { describe, expect, it } from 'vitest'
import {
  attackEffect,
  chooseTargets,
  currentStepIndex,
  figureCount,
  mostHp,
  monsterTargets,
  nobodyToAttack,
  stepAttack,
  tapsMany,
  toggleTarget,
  towardHero,
} from './monsterTurn.js'

// Made-up heroes and cards, so the tests don't need the real ones.
const hero = (id, hp, tokens = {}) => ({ id, name: id, hp, tokens })
const devil = { card: { hp: 2 }, hp: 6 }

describe('figureCount', () => {
  it('counts the figures left on a several-figure card', () => {
    expect(figureCount(devil)).toBe(3)
    expect(figureCount({ ...devil, hp: 3 })).toBe(2)
    expect(figureCount({ ...devil, hp: 0 })).toBe(1)
  })
  it('gives a villain one figure', () => {
    expect(figureCount({ ...devil, villain: true })).toBe(1)
  })
})

describe('who a monster can go after', () => {
  const state = {
    heroes: [hero('quinn', 5), hero('tarak', 3, { refuge: true })],
    villagers: [{ id: 'v1', name: 'Villager', hp: 1 }, { id: 'v2', name: 'Gone', hp: 1, removed: true }],
  }
  it('lists villagers first, and leaves out heroes in the Astral Refuge', () => {
    expect(monsterTargets(state).map((h) => [h.id, Boolean(h.villager)])).toEqual([['v1', true], ['quinn', false]])
  })
  it('has nobody when every hero is in the refuge and no villager is left', () => {
    expect(nobodyToAttack(state)).toBe(false)
    const empty = { heroes: [hero('tarak', 3, { refuge: true })], villagers: [] }
    expect(nobodyToAttack(empty)).toBe(true)
  })
})

describe('currentStepIndex', () => {
  const tactics = [{ when: 'adjacent', attack: 'claw' }, { explore: true }, { move: 'toward' }]
  it('stays on the step when heroes are on the board', () => {
    expect(currentStepIndex(tactics, 0, false)).toBe(0)
  })
  it('skips to the steps that need no hero when nobody is on the board', () => {
    expect(currentStepIndex(tactics, 0, true)).toBe(1)
    expect(currentStepIndex([{ when: 'aloneByUnexploredEdge' }], 0, true)).toBe(0)
    expect(currentStepIndex([{ move: 'toward' }], 0, true)).toBe(1)
  })
})

describe('stepAttack', () => {
  const card = {
    attacks: [
      { id: 'bite', name: 'Bite' },
      { id: 'ray-1', name: 'Fire Ray', group: 'eye-ray', roll: [1, 10] },
      { id: 'ray-2', name: 'Frost Ray', group: 'eye-ray', roll: [11, 20] },
    ],
  }
  it('finds a plain attack', () => {
    expect(stepAttack(card, { attack: 'bite' })).toEqual({ attack: card.attacks[0], table: [] })
  })
  it('stands in for a table of attacks until the die picks one', () => {
    const { attack, table } = stepAttack(card, { attack: 'eye-ray' })
    expect(table.map((a) => a.id)).toEqual(['ray-1', 'ray-2'])
    expect(attack).toMatchObject({ id: 'eye-ray', name: 'eye ray' })
  })
  it('has no attack for a step without one', () => {
    expect(stepAttack(card, { move: 'toward' }).attack).toBeNull()
    expect(stepAttack(card, undefined).attack).toBeNull()
  })
})

describe('picking targets', () => {
  const heroes = [hero('a', 4), hero('b', 6), hero('c', 6)]
  it('taps one hero, or several for an attack on many', () => {
    expect(tapsMany({ targets: 'all' })).toBe(true)
    expect(tapsMany({ target: 'mostHp' })).toBe(true)
    expect(tapsMany({ target: 'closest' })).toBe(false)
    expect(toggleTarget(['a'], 'b', false)).toEqual(['b'])
    expect(toggleTarget(['a'], 'b', true)).toEqual(['a', 'b'])
    expect(toggleTarget(['a', 'b'], 'a', true)).toEqual(['b'])
  })
  it('attacks the heroes tapped', () => {
    expect(chooseTargets({ target: 'closest' }, heroes, ['a'], null).targetIds).toEqual(['a'])
  })
  it('picks the hero with the most HP from the heroes tapped', () => {
    const out = chooseTargets({ target: 'mostHp' }, heroes, ['a', 'b'], null)
    expect(out.strongest.id).toBe('b')
    expect(out.targetIds).toEqual(['b'])
  })
  it('asks the players to pick when heroes tie for the most HP', () => {
    const tie = chooseTargets({ target: 'mostHp' }, heroes, ['a', 'b', 'c'], null)
    expect(tie.strongest).toBeNull()
    expect(tie.tied.map((h) => h.id)).toEqual(['b', 'c'])
    expect(tie.top).toBe(6)
    expect(tie.targetIds).toEqual([])
    expect(chooseTargets({ target: 'mostHp' }, heroes, ['a', 'b', 'c'], 'c').targetIds).toEqual(['c'])
    // A pick that isn't one of the tied heroes doesn't count.
    expect(chooseTargets({ target: 'mostHp' }, heroes, ['a', 'b', 'c'], 'a').targetIds).toEqual([])
  })
  it('finds the most HP, or nobody on a tie', () => {
    expect(mostHp(heroes.slice(0, 2)).id).toBe('b')
    expect(mostHp(heroes)).toBeNull()
  })
})

describe('attackEffect', () => {
  const claw = { damage: 2, miss: 1, conditions: ['Dazed'] }
  it('says what a hit and a miss do', () => {
    expect(attackEffect(claw, true)).toBe('2 damage and Dazed')
    expect(attackEffect(claw, false)).toBe('1 damage')
    expect(attackEffect({ damage: 1, miss: 0, conditions: [] }, false)).toBe('no damage')
  })
})

describe('towardHero', () => {
  const state = { heroes: [hero('a', 4), hero('b', 6), hero('down', 0)] }
  it('goes toward the hero with the most HP when the card says so', () => {
    expect(towardHero(state, { move: 'toward', toward: 'mostHp' }).id).toBe('b')
    expect(towardHero(state, { move: 'toward' })).toBeNull()
    expect(towardHero({ heroes: [hero('a', 6), hero('b', 6)] }, { toward: 'mostHp' })).toBeNull()
  })
  it('goes by the HP left, not full HP, and skips a downed hero', () => {
    // Vistra has the biggest HP total but is down; Keyleth has the most HP left.
    const heroes = [{ ...hero('vistra', 0), maxHp: 12 }, { ...hero('keyleth', 5), maxHp: 10 }, { ...hero('quinn', 3), maxHp: 8 }]
    expect(towardHero({ heroes }, { move: 'toward', toward: 'mostHp' }).id).toBe('keyleth')
    const hurt = heroes.map((h) => (h.id === 'vistra' ? { ...h, hp: 2 } : h))
    expect(towardHero({ heroes: hurt }, { move: 'toward', toward: 'mostHp' }).id).toBe('keyleth')
  })
  it('skips a hero in the Astral Refuge or off the virtual board', () => {
    const step = { move: 'toward', toward: 'mostHp' }
    expect(towardHero({ heroes: [hero('a', 4), hero('b', 6, { refuge: true })] }, step).id).toBe('a')
    const board = { tokens: { a: [0, 0] } }
    expect(towardHero({ heroes: [hero('a', 4), hero('b', 6)], board }, step).id).toBe('a')
  })
})
