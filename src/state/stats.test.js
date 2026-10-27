import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { createHero, gameReducer, initialState } from './game.js'
import { heroStats, recap } from './stats.js'

const ogre = {
  id: 'ogre', name: 'Ogre', copies: 1, ac: 14, hp: 2, xp: 2, figures: 1,
  attacks: [{ id: 'slam', name: 'Slam', bonus: 7, damage: 1, miss: 0, conditions: [] }],
  tactics: [{ move: 'toward' }],
}

const setup = () => {
  let state = gameReducer(initialState, { type: 'START_GAME', heroes: HERO_TEMPLATES.slice(0, 2).map((t) => createHero(t)) })
  const hero = state.heroes[0]
  state = gameReducer(state, {
    type: 'SET_POWER_CARD', heroId: hero.id, powerId: hero.powers.find((p) => p.type === 'at-will').id,
    card: { id: 'strike', name: 'Strike', attack: '+6', damage: '1' },
  })
  return gameReducer(state, { type: 'DRAW_MONSTER', heroId: state.heroes[1].id, cards: [ogre], random: [] })
}
const attack = (state, roll) =>
  gameReducer(state, {
    type: 'HERO_ATTACK',
    heroId: state.heroes[0].id,
    powerId: state.heroes[0].powers.find((p) => p.type === 'at-will').id,
    targets: [{ monsterId: state.monsters[0].id, roll }],
  })

describe('end-of-game stats', () => {
  it('counts damage dealt, natural 20s and the monster defeated for the attacking hero', () => {
    let state = attack(setup(), 20)
    expect(heroStats(state, state.heroes[0].id)).toMatchObject({ damageDealt: 1, nat20s: 1, kills: 0, biggestHit: 1 })
    state = attack(state, 1)
    expect(heroStats(state, state.heroes[0].id)).toMatchObject({ nat1s: 1, kills: 0 })
    state = attack(state, 15)
    expect(heroStats(state, state.heroes[0].id)).toMatchObject({ damageDealt: 2, kills: 1, xpEarned: 2 })
    expect(heroStats(state, state.heroes[1].id).kills).toBe(0)
  })

  it("doesn't count a monster's natural 20 as the hero's", () => {
    let state = setup()
    state = gameReducer(state, { type: 'MONSTER_ATTACK', monsterId: state.monsters[0].id, attackId: 'slam', targets: [{ heroId: state.heroes[0].id, roll: 20 }] })
    expect(heroStats(state, state.heroes[0].id)).toMatchObject({ nat20s: 0, damageTaken: 1 })
  })

  it('counts damage taken and times knocked down', () => {
    let state = setup()
    const hero = state.heroes[1]
    state = gameReducer(state, { type: 'ADJUST_HP', heroId: hero.id, amount: -99 })
    expect(heroStats(state, hero.id)).toMatchObject({ damageTaken: hero.maxHp, downs: 1 })
  })

  it("doesn't count a monster removed by mistake as defeated", () => {
    let state = setup()
    state = gameReducer(state, { type: 'REMOVE_MONSTER', monsterId: state.monsters[0].id })
    expect(heroStats(state, state.heroes[0].id).kills).toBe(0)
  })

  it('leaves a state alone when nothing happened', () => {
    const state = setup()
    expect(gameReducer(state, { type: 'MONSTER_ATTACK', monsterId: 'nope', attackId: 'slam', targets: [] })).toBe(state)
  })

  it('starts every new game with no stats', () => {
    const state = attack(setup(), 20)
    expect(gameReducer({ ...state, status: 'setup' }, { type: 'START_GAME', heroes: [createHero(HERO_TEMPLATES[0])] }).stats).toEqual({})
  })
})

describe('recap awards', () => {
  const withStats = (stats) => {
    const state = setup()
    return { ...state, stats: Object.fromEntries(state.heroes.map((h, i) => [h.id, stats[i]])) }
  }

  it('crowns one MVP and gives every hero an award', () => {
    const result = recap(withStats([{ kills: 3, damageDealt: 6, nat20s: 1 }, { damageTaken: 9, downs: 1 }]))
    expect(result.mvpIds).toEqual([result.heroes[0].hero.id])
    expect(result.heroes[0].awards.map((a) => a.key)).toEqual(expect.arrayContaining(['mvp', 'slayer', 'lucky']))
    expect(result.heroes[1].awards.map((a) => a.key)).toEqual(['wall'])
    expect(result.party).toMatchObject({ kills: 3, nat20s: 1 })
  })

  it('shares an award on a tie, and gives a quiet hero a consolation award', () => {
    const result = recap(withStats([{ kills: 2, damageDealt: 4 }, { kills: 2, damageDealt: 4 }]))
    expect(result.mvpIds).toHaveLength(2)
    expect(recap(withStats([{ kills: 1 }, {}])).heroes[1].awards.map((a) => a.key)).toEqual(['standing'])
    expect(recap(withStats([{ kills: 1 }, { nat1s: 2, downs: 1 }])).heroes[1].awards.map((a) => a.key)).toEqual(['brave', 'gremlin'])
  })
})
