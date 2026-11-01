// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { createHero, gameReducer, initialState } from '../state/game.js'
import { CancelAdvice } from './Encounters.jsx'

const CAGE = { id: 'cage', name: 'Cage', type: 'curse', text: '', curse: { acPenalty: 2 } }
function game(xp) {
  const heroes = ['fighter', 'wizard'].map((k) => createHero(HERO_TEMPLATES.find((t) => t.key === k)))
  const state = gameReducer(initialState, { type: 'START_GAME', heroes })
  return { ...state, xp, encounter: { id: 'e1', cardId: 'cage', heroId: state.heroes[0].id, card: CAGE, attacked: false } }
}

describe('advice under the cancel button', () => {
  it('tells the players to save XP for heroes who still need to level up', () => {
    const state = game(6)
    render(<CancelAdvice state={state} hero={state.heroes[0]} />)
    expect(screen.getByText(/Better to save the XP/)).toBeTruthy()
  })

  it('says go ahead when there is XP to spare', () => {
    const state = game(16)
    render(<CancelAdvice state={state} hero={state.heroes[0]} />)
    expect(screen.getByText(/Good idea: you have 6 XP left over/)).toBeTruthy()
  })
})
