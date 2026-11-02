import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { onHitHeals } from '../data/powerEffects.js'
import { attackNumbers, bardicSongsLeft } from './heroAttacks.js'
import { mindOverBodyChoices } from './heroTurn.js'
import { attackGone, createHero, gameReducer, initialState } from './game.js'

// A fan Bard (hero 0) and a fan Monk (hero 1), built on box templates.
const BARD = { ...HERO_TEMPLATES[0], key: 'bard', name: 'Berryloaf', abilityEffects: ['bardic-song'] }
const MONK = { ...HERO_TEMPLATES[1], key: 'monk', name: 'Darna', abilityEffects: ['mind-over-body'] }
const ogre = { id: 'ogre', name: 'Ogre', copies: 1, ac: 15, hp: 9, xp: 2, attacks: [{ id: 'club', name: 'Club', bonus: 5, damage: 2 }], tactics: [{ move: 'toward' }] }

const start = () => {
  let state = gameReducer(initialState, { type: 'START_GAME', heroes: [createHero(BARD), createHero(MONK)] })
  return gameReducer(state, { type: 'DRAW_MONSTER', heroId: state.heroes[1].id, cards: [ogre], random: [] })
}
function give(state, i, card, type = 'at-will') {
  const slot = state.heroes[i].powers.find((p) => p.type === type)
  return { state: gameReducer(state, { type: 'SET_POWER_CARD', heroId: state.heroes[i].id, powerId: slot.id, card: { id: card.name, ...card } }), id: slot.id }
}
const attack = (state, i, powerId, roll) =>
  gameReducer(state, { type: 'HERO_ATTACK', heroId: state.heroes[i].id, powerId, targets: [{ monsterId: state.monsters[0].id, roll }] })

describe('Bardic Song', () => {
  it('lets the bard spend one of 3 songs on any hero\'s miss', () => {
    let { state, id } = give(start(), 0, { name: 'Strike', attack: '+5', damage: '1' })
    state = attack(state, 0, id, 2)
    expect(bardicSongsLeft(state.heroes[0])).toBe(3)
    expect(bardicSongsLeft(state.heroes[1])).toBe(0)
    const next = gameReducer(state, { type: 'REROLL_ATTACK', helperId: state.heroes[0].id, bardicSong: true, monsterId: state.monsters[0].id, roll: 15 })
    expect(next.monsters[0].hp).toBe(8)
    expect(bardicSongsLeft(next.heroes[0])).toBe(2)
    // A hero without the ability can't sing.
    expect(gameReducer(state, { type: 'REROLL_ATTACK', helperId: state.heroes[1].id, bardicSong: true, monsterId: state.monsters[0].id, roll: 15 })).toBe(state)
  })
})

describe('Mind Over Body', () => {
  it('rolls once per condition, 11 or more shrugs it off', () => {
    let state = start()
    const darna = () => state.heroes[1]
    state = gameReducer(state, { type: 'TOGGLE_HERO_CONDITION', heroId: darna().id, condition: 'Dazed' })
    expect(mindOverBodyChoices(darna())).toEqual(['Dazed'])
    expect(mindOverBodyChoices(state.heroes[0])).toEqual([])
    state = gameReducer(state, { type: 'MIND_OVER_BODY', heroId: darna().id, condition: 'Dazed', roll: 5 })
    expect(darna().conditions).toEqual(['Dazed'])
    expect(mindOverBodyChoices(darna())).toEqual([])
    // Once it's gone, getting it again gives a new roll.
    state = gameReducer(state, { type: 'TOGGLE_HERO_CONDITION', heroId: darna().id, condition: 'Dazed' })
    state = gameReducer(state, { type: 'TOGGLE_HERO_CONDITION', heroId: darna().id, condition: 'Dazed' })
    expect(mindOverBodyChoices(darna())).toEqual(['Dazed'])
    state = gameReducer(state, { type: 'MIND_OVER_BODY', heroId: darna().id, condition: 'Dazed', roll: 11 })
    expect(darna().conditions).toEqual([])
  })
})

describe('fan powers', () => {
  it('Guiding Strike hits without beating AC', () => {
    let { state, id } = give(start(), 0, { name: 'Guiding Strike', damage: '1', effect: { autoHit: true } })
    state = attack(state, 0, id, 1)
    expect(state.monsters[0].hp).toBe(8)
  })

  it('War Song Strike only offers its heal on an even die', () => {
    const effects = { onHit: { heal: 1, even: true } }
    expect(onHitHeals(effects, [{ hit: true, value: 14 }])).toBe(true)
    expect(onHitHeals(effects, [{ hit: true, value: 13 }])).toBe(false)
    expect(onHitHeals(effects, [{ hit: false, value: 14 }])).toBe(false)
    expect(onHitHeals({ onHit: { heal: 1 } }, [{ hit: true, value: 13 }])).toBe(true)
  })
})

describe('more fan hero rules', () => {
  const DRUID = { ...HERO_TEMPLATES[2], key: 'druid', name: 'Aldred', abilityEffects: ['natures-healing'] }
  const druidGame = () => gameReducer(initialState, { type: 'START_GAME', heroes: [createHero(DRUID), createHero(MONK)] })

  it("Nature's Healing: give up the attack for 1 HP, once, before doing anything", () => {
    let state = druidGame()
    const id = state.heroes[0].id
    state = gameReducer(state, { type: 'ADJUST_HP', heroId: id, amount: -3 })
    const hp = state.heroes[0].hp
    state = gameReducer(state, { type: 'NATURES_HEALING', heroId: id, give: 'attack' })
    expect(state.heroes[0].hp).toBe(hp + 1)
    expect(attackGone(state, state.heroes[0])).toBeTruthy()
    expect(gameReducer(state, { type: 'NATURES_HEALING', heroId: id, give: 'move' })).toBe(state)
    // Darna doesn't have it.
    const other = druidGame()
    expect(gameReducer(other, { type: 'NATURES_HEALING', heroId: other.heroes[1].id, give: 'phase' })).toBe(other)
  })

  it('a utility with uses flips only after the last one, and critFrom adds +1 on a high die', () => {
    let { state, id } = give(start(), 0, { name: 'Healing Herbs', effect: { uses: 3, use: { healSelf: 1 } } }, 'utility')
    const use = () => { state = gameReducer(state, { type: 'USE_POWER', heroId: state.heroes[0].id, powerId: id, heroIds: [] }) }
    use(); use()
    expect(state.heroes[0].powers.find((p) => p.id === id).used).toBeFalsy()
    use()
    expect(state.heroes[0].powers.find((p) => p.id === id).used).toBe(true)

    const arrow = give(start(), 0, { name: 'Birch Arrow', attack: '+6', damage: '1', effect: { critFrom: 17 } })
    expect(attack(arrow.state, 0, arrow.id, 17).monsters[0].hp).toBe(7)
    expect(attack(arrow.state, 0, arrow.id, 16).monsters[0].hp).toBe(8)
  })

  it('Fearless: +4 against a monster listed at the start of the turn', () => {
    let { state, id } = give(start(), 0, { name: 'Strike', attack: '+5', damage: '1' })
    // Roll 6 + 5 = 11 misses AC 15; with Fearless 15 hits.
    expect(attack(state, 0, id, 6).monsters[0].hp).toBe(9)
    state = { ...state, turn: { ...state.turn, fearless: { heroId: state.heroes[0].id, foes: [state.monsters[0].id] } } }
    expect(attack(state, 0, id, 6).monsters[0].hp).toBe(8)
  })

  it('Power of Earth: a Longbow-only buff for this phase', () => {
    let { state, id } = give(start(), 0, { name: 'Power of Earth', effect: { use: { buff: { attack: 2, who: 'self', lasts: 'thisPhase', only: 'Longbow' } } } }, 'utility')
    state = gameReducer(state, { type: 'USE_POWER', heroId: state.heroes[0].id, powerId: id, heroIds: [] })
    const hero = state.heroes[0]
    expect(attackNumbers(hero, { power: { name: 'Longbow: Oak Arrow', card: { attack: '+11' } } }).bonus).toBe(13)
    expect(attackNumbers(hero, { power: { name: 'Shortsword', card: { attack: '+8' } } }).bonus).toBe(8)
    expect(hero.buffs[0].phaseEnds).toBe(1)
  })
})
