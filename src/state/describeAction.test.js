import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { describeAction } from './describeAction.js'
import { createHero, gameReducer, initialState } from './game.js'

describe('undo labels', () => {
  it('names the hero, monster, and amount', () => {
    let state = gameReducer(initialState, { type: 'START_GAME', heroes: [createHero(HERO_TEMPLATES[3])] })
    const hero = state.heroes[0]
    state = gameReducer(state, { type: 'ADD_MONSTER', name: 'Grell', hp: 3, xp: 2, ownerId: hero.id })
    const monster = state.monsters[0]
    expect(describeAction(state, { type: 'ADJUST_HP', heroId: hero.id, amount: -1 })).toBe('Tarak −1 HP')
    expect(describeAction(state, { type: 'ADJUST_HP', heroId: hero.id, amount: 2 })).toBe('Tarak +2 HP')
    expect(describeAction(state, { type: 'DEFEAT_MONSTER', monsterId: monster.id })).toBe('Defeating Grell')
    expect(describeAction(state, { type: 'NEW_GAME' })).toBe('New game')
    expect(describeAction(state, { type: 'SOMETHING_NEW' })).toBe('Last change')
  })
})
