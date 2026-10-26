import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { createHero, gameReducer, initialState, loadGame, saveGame, SAVE_KEY } from './game.js'

const startGame = (count = 2) =>
  gameReducer(initialState, { type: 'START_GAME', heroes: HERO_TEMPLATES.slice(0, count).map((t) => createHero(t)) })

const memoryStorage = () => {
  const data = {}
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v } }
}

describe('heroes', () => {
  it('keeps HP between 0 and max', () => {
    let state = startGame()
    const hero = state.heroes[0]
    state = gameReducer(state, { type: 'ADJUST_HP', heroId: hero.id, amount: 5 })
    expect(state.heroes[0].hp).toBe(hero.maxHp)
    state = gameReducer(state, { type: 'ADJUST_HP', heroId: hero.id, amount: -99 })
    expect(state.heroes[0].hp).toBe(0)
  })

  it('heals to the surge value and spends a shared surge', () => {
    let state = startGame()
    const hero = state.heroes[0]
    state = gameReducer(state, { type: 'ADJUST_HP', heroId: hero.id, amount: -99 })
    state = gameReducer(state, { type: 'USE_SURGE', heroId: hero.id })
    expect(state.heroes[0].hp).toBe(hero.surgeValue)
    expect(state.surges).toBe(initialState.surges - 1)
  })

  it('loses the game when a surge is needed and none are left', () => {
    let state = { ...startGame(), surges: 0 }
    state = gameReducer(state, { type: 'USE_SURGE', heroId: state.heroes[0].id })
    expect(state.status).toBe('lost')
  })

  it('levels up once for 5 XP', () => {
    let state = { ...startGame(), xp: 6 }
    const hero = state.heroes[0]
    state = gameReducer(state, { type: 'LEVEL_UP', heroId: hero.id })
    expect(state.heroes[0].level).toBe(2)
    expect(state.heroes[0].maxHp).toBe(hero.maxHp + 2)
    expect(state.xp).toBe(1)
    expect(gameReducer(state, { type: 'LEVEL_UP', heroId: hero.id })).toBe(state)
  })
})

describe('monsters', () => {
  it('adds XP to the pool when defeated', () => {
    let state = startGame()
    state = gameReducer(state, { type: 'ADD_MONSTER', name: 'Snake', hp: 1, xp: 2, ownerId: state.heroes[0].id })
    state = gameReducer(state, { type: 'DEFEAT_MONSTER', monsterId: state.monsters[0].id })
    expect(state.monsters).toHaveLength(0)
    expect(state.xp).toBe(2)
  })

  it('spends 5 XP to cancel an encounter only when there is enough', () => {
    let state = { ...startGame(), xp: 4 }
    expect(gameReducer(state, { type: 'CANCEL_ENCOUNTER' }).xp).toBe(4)
    state = { ...state, xp: 7 }
    expect(gameReducer(state, { type: 'CANCEL_ENCOUNTER' }).xp).toBe(2)
  })
})

describe('turns', () => {
  it('walks through three phases then passes to the next hero', () => {
    let state = startGame(2)
    for (let i = 0; i < 3; i++) state = gameReducer(state, { type: 'NEXT_PHASE' })
    expect(state.turn).toEqual({ heroIndex: 1, phase: 0, round: 1 })
    for (let i = 0; i < 3; i++) state = gameReducer(state, { type: 'NEXT_PHASE' })
    expect(state.turn).toEqual({ heroIndex: 0, phase: 0, round: 2 })
    state = gameReducer(state, { type: 'PREVIOUS_PHASE' })
    expect(state.turn).toEqual({ heroIndex: 1, phase: 2, round: 1 })
  })
})

describe('saving', () => {
  it('restores a saved game', () => {
    const storage = memoryStorage()
    const state = startGame()
    saveGame(state, storage)
    expect(loadGame(storage)).toEqual(state)
  })

  it('starts fresh when the save is broken', () => {
    const storage = memoryStorage()
    storage.setItem(SAVE_KEY, '{not json')
    expect(loadGame(storage)).toBe(initialState)
  })
})
