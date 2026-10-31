import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from './heroes.js'
import { createHero, gameReducer, initialState } from '../state/game.js'

const start = (difficulty) => {
  let state = initialState
  if (difficulty) state = gameReducer(state, { type: 'SET_LOBBY_DIFFICULTY', difficulty })
  return gameReducer(state, { type: 'START_GAME', heroes: HERO_TEMPLATES.slice(0, 2).map((t) => createHero(t)) })
}

describe('Easy / Normal / Hard', () => {
  it('is the rulebook on Normal', () => {
    const state = start()
    expect(state).toMatchObject({ difficulty: 'normal', surges: 2 })
  })

  it('adds two healing surges on Easy and takes one away on Hard', () => {
    expect(start('easy')).toMatchObject({ difficulty: 'easy', surges: 4 })
    expect(start('hard')).toMatchObject({ difficulty: 'hard', surges: 1 })
    expect(start('easy').log[0].text).toMatch(/Easy game/)
  })

  it('makes cancelling an encounter cost 7 XP on Hard', () => {
    const hard = { ...start('hard'), xp: 6 }
    expect(gameReducer(hard, { type: 'CANCEL_ENCOUNTER' })).toBe(hard)
    expect(gameReducer({ ...hard, xp: 7 }, { type: 'CANCEL_ENCOUNTER' }).xp).toBe(0)
    expect(gameReducer({ ...start(), xp: 5 }, { type: 'CANCEL_ENCOUNTER' }).xp).toBe(0)
  })

  it('remembers the difficulty for Try again', () => {
    expect(start('hard').retry.difficulty).toBe('hard')
  })
})
