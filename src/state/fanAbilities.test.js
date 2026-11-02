import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { onHitHeals } from '../data/powerEffects.js'
import { bardicSongsLeft } from './heroAttacks.js'
import { mindOverBodyChoices } from './heroTurn.js'
import { createHero, gameReducer, initialState } from './game.js'

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
