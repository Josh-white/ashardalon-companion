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

  it('adds three healing surges on Story', () => {
    expect(start('story')).toMatchObject({ difficulty: 'story', surges: 5 })
  })

  it('switches mid-game, moving the healing surges by the difference', () => {
    let state = start()
    state = gameReducer(state, { type: 'SET_DIFFICULTY', difficulty: 'story' })
    expect(state).toMatchObject({ difficulty: 'story', surges: 5, lobbyDifficulty: 'story' })
    expect(state.retry.difficulty).toBe('story')
    expect(state.log[0].text).toMatch(/Switched to Story/)
    state = gameReducer(state, { type: 'SET_DIFFICULTY', difficulty: 'easy' })
    expect(state).toMatchObject({ difficulty: 'easy', surges: 4 })
    state = gameReducer({ ...state, surges: 0 }, { type: 'SET_DIFFICULTY', difficulty: 'normal' })
    expect(state.surges).toBe(0)
    expect(gameReducer(initialState, { type: 'SET_DIFFICULTY', difficulty: 'story' })).toBe(initialState)
  })

  it('heals a standing hero 1 HP at the start of their turn on Story, and gives the reroll back', () => {
    let state = { ...start('story'), secondChances: ['someone'] }
    const second = state.heroes[1]
    state = gameReducer(state, { type: 'ADJUST_HP', heroId: second.id, amount: -3 })
    // Through the first hero's turn to the second hero's.
    for (let i = 0; i < 20 && state.turn.heroIndex === 0; i++) state = gameReducer(state, { type: 'NEXT_PHASE' })
    expect(state.turn.heroIndex).toBe(1)
    expect(state.heroes[1].hp).toBe(second.hp - 2)
    expect(state.secondChances).toEqual([])
    expect(state.log.some((l) => /Story: .* heals 1 HP/.test(l.text))).toBe(true)
  })

  it('makes cancelling an encounter cost 3 XP on Story', () => {
    const story = { ...start('story'), xp: 3 }
    expect(gameReducer(story, { type: 'CANCEL_ENCOUNTER' }).xp).toBe(0)
  })
})
