import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { createHero, gameReducer, initialState } from '../state/game.js'
import { normalizeTiles } from './tileDefs.js'

const TILES = normalizeTiles(
  [{ id: 'start', kind: 'start', rows: ['....', '....', '....', '....', '....', '....', '....', '....'], exits: { N: 'oooo', S: 'oooo', W: 'oooooooo', E: 'oooooooo' } }],
  [],
)

function game() {
  const heroes = HERO_TEMPLATES.slice(0, 2).map((t) => createHero(t))
  const state = gameReducer(initialState, { type: 'START_GAME', heroes, tileRandom: [], boardTiles: TILES })
  return { ...state, firstRoll: null }
}

describe('floating heal numbers on the virtual board', () => {
  it('a game starting with full HP shows no heals', () => {
    expect(game().healFx).toBeUndefined()
  })

  it('the + button heals and notes the amount for that hero', () => {
    let state = game()
    const hero = state.heroes[0]
    state = gameReducer(state, { type: 'ADJUST_HP', heroId: hero.id, amount: -3 })
    expect(state.healFx).toBeUndefined()
    state = gameReducer(state, { type: 'ADJUST_HP', heroId: hero.id, amount: 2 })
    expect(state.healFx.heals).toEqual([{ heroId: hero.id, amount: 2 }])
    expect(state.healFx.momentId).toBeUndefined()
    const first = state.healFx.id
    // Healing past full only counts what was gained.
    state = gameReducer(state, { type: 'ADJUST_HP', heroId: hero.id, amount: 5 })
    expect(state.healFx.heals).toEqual([{ heroId: hero.id, amount: 1 }])
    expect(state.healFx.id).not.toBe(first)
  })

  it('a healing surge from 0 HP shows what it healed and waits for its moment', () => {
    let state = game()
    const hero = state.heroes[0]
    state = gameReducer(state, { type: 'ADJUST_HP', heroId: hero.id, amount: -99 })
    state = gameReducer(state, { type: 'USE_SURGE', heroId: hero.id })
    const now = state.heroes.find((h) => h.id === hero.id).hp
    expect(state.healFx.heals).toEqual([{ heroId: hero.id, amount: now }])
  })

  it('no heal without a virtual board', () => {
    let state = { ...game(), board: null }
    const hero = state.heroes[0]
    state = gameReducer(state, { type: 'ADJUST_HP', heroId: hero.id, amount: -3 })
    state = gameReducer(state, { type: 'ADJUST_HP', heroId: hero.id, amount: 3 })
    expect(state.healFx).toBeUndefined()
  })
})
