// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { createHero, gameReducer, initialState } from '../state/game.js'
import MindOverBodyPrompt from './MindOverBodyPrompt.jsx'

const MONK = { ...HERO_TEMPLATES[1], key: 'monk', name: 'Darna', abilityEffects: ['mind-over-body'] }
function game() {
  const state = gameReducer(initialState, { type: 'START_GAME', heroes: [createHero(HERO_TEMPLATES[0]), createHero(MONK)] })
  return gameReducer(state, { type: 'TOGGLE_HERO_CONDITION', heroId: state.heroes[1].id, condition: 'Dazed' })
}

afterEach(cleanup)

describe('Mind Over Body roll prompt', () => {
  it('pops up on the monk\'s iPad when a condition lands and rolls for it', () => {
    const state = game()
    const dispatch = vi.fn()
    render(<MindOverBodyPrompt state={state} dispatch={dispatch} heroId={state.heroes[1].id} />)
    expect(screen.getByText('Darna is Dazed!')).toBeTruthy()
    fireEvent.click(screen.getByText(/Roll to shake it off/))
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'MIND_OVER_BODY', heroId: state.heroes[1].id, condition: 'Dazed' }))
  })

  it('stays off other heroes\' iPads, after the roll, and after Later', () => {
    const state = game()
    const { container, rerender } = render(<MindOverBodyPrompt state={state} dispatch={vi.fn()} heroId={state.heroes[0].id} />)
    expect(container.textContent).toBe('')
    const rolled = gameReducer(state, { type: 'MIND_OVER_BODY', heroId: state.heroes[1].id, condition: 'Dazed', roll: 4 })
    rerender(<MindOverBodyPrompt state={{ ...rolled, moment: null }} dispatch={vi.fn()} />)
    expect(container.textContent).toBe('')
    rerender(<MindOverBodyPrompt state={state} dispatch={vi.fn()} />)
    fireEvent.click(screen.getByText(/Later/))
    expect(container.textContent).toBe('')
  })
})
