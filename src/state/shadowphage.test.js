import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { heroAc } from '../data/powerEffects.js'
import { acParts } from '../data/statParts.js'
import { unseenByTactics } from '../board/tactics.js'
import { attackNumbers } from './heroAttacks.js'
import { attackGone, createHero, gameReducer, initialState } from './game.js'

// Fesud (a fan hero) as hero 0: Shadowphage, with made-up shadow powers.
const FESUD = { ...HERO_TEMPLATES[3], key: 'assassin', name: 'Fesud', abilityEffects: ['shadowphage'] }
const ogre = {
  id: 'ogre', name: 'Ogre', copies: 1, ac: 10, hp: 9, xp: 2,
  attacks: [{ id: 'club', name: 'Club', bonus: 5, damage: 2 }],
  tactics: [{ move: 'toward' }],
}
const strike = { name: 'Shadow Strike', attack: '+7', damage: '1', effect: { shadow: 'leave', shadowBonus: 2 } }
const darkness = { name: 'Into Darkness', attack: '+7', damage: '3 (Miss: 1)', effect: { shadow: 'enter', shadowKeep: true } }

const start = () => {
  let state = gameReducer(initialState, { type: 'START_GAME', heroes: [createHero(FESUD), createHero(HERO_TEMPLATES[0])] })
  state = gameReducer(state, { type: 'DRAW_MONSTER', heroId: state.heroes[1].id, cards: [ogre], random: [] })
  return state
}
const fesud = (state) => state.heroes[0]
const give = (state, card, type) => {
  const slot = fesud(state).powers.find((p) => p.type === type)
  return { state: gameReducer(state, { type: 'SET_POWER_CARD', heroId: fesud(state).id, powerId: slot.id, card: { id: card.name, ...card } }), id: slot.id }
}
const attack = (state, powerId, roll) =>
  gameReducer(state, { type: 'HERO_ATTACK', heroId: fesud(state).id, powerId, targets: [{ monsterId: state.monsters[0].id, roll }] })
const shadow = (state, on) => gameReducer(state, { type: 'SET_SHADOW', heroId: fesud(state).id, on })

describe('Shadowphage', () => {
  it('slips into the shadows instead of attacking: +2 AC, skipped by tactics', () => {
    const state = start()
    const ac = heroAc(fesud(state))
    const next = shadow(state, true)
    expect(fesud(next).tokens.shadow).toBe(true)
    expect(heroAc(fesud(next))).toBe(ac + 2)
    expect(acParts(fesud(next)).parts.some((p) => /shadows/.test(p.label))).toBe(true)
    expect(unseenByTactics(fesud(next))).toBe(true)
    expect(attackGone(next, fesud(next))).toBeTruthy()
    // Stepping out is free; going back in needs an attack this turn.
    const out = shadow(next, false)
    expect(fesud(out).tokens.shadow).toBe(false)
    expect(shadow(out, true)).toBe(out)
  })

  it('only works for a hero with the ability', () => {
    const state = start()
    expect(gameReducer(state, { type: 'SET_SHADOW', heroId: state.heroes[1].id, on: true })).toBe(state)
  })

  it('Shadow Strike gets +2 from the shadows and leaves them', () => {
    let { state, id } = give(start(), strike, 'at-will')
    const power = fesud(state).powers.find((p) => p.id === id)
    expect(attackNumbers(fesud(state), { power }).bonus).toBe(7)
    state = { ...state, heroes: state.heroes.map((h, i) => (i === 0 ? { ...h, tokens: { shadow: true } } : h)) }
    expect(attackNumbers(fesud(state), { power }).bonus).toBe(9)
    const next = attack(state, id, 15)
    expect(fesud(next).tokens.shadow).toBe(false)
  })

  it('Into Darkness enters the shadows, and a miss from the shadows keeps the card and leaves them', () => {
    let { state, id } = give(start(), darkness, 'daily')
    const missed = attack(state, id, 1)
    expect(fesud(missed).tokens.shadow).toBe(true)
    expect(fesud(missed).powers.find((p) => p.id === id).used).toBe(true)

    state = { ...state, heroes: state.heroes.map((h, i) => (i === 0 ? { ...h, tokens: { shadow: true } } : h)) }
    const kept = attack(state, id, 1)
    expect(fesud(kept).tokens.shadow).toBe(false)
    expect(fesud(kept).powers.find((p) => p.id === id).used).toBeFalsy()

    const hit = attack(state, id, 15)
    expect(fesud(hit).tokens.shadow).toBe(true)
    expect(fesud(hit).powers.find((p) => p.id === id).used).toBe(true)
  })
})
