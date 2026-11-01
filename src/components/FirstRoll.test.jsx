// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { newFirstRoll } from '../state/firstRoll.js'
import { createHero, gameReducer, initialState } from '../state/game.js'
import FirstRoll from './FirstRoll.jsx'

// A game just entered, everyone still to roll for first turn.
function game(keys) {
  const heroes = keys.map((k) => createHero(HERO_TEMPLATES.find((t) => t.key === k)))
  const state = gameReducer(initialState, { type: 'START_GAME', heroes })
  return { ...state, opening: null, firstRoll: newFirstRoll(state.heroes) }
}

afterEach(cleanup)

describe('roll for first turn on a hero screen', () => {
  it('rolls for heroes with no screen of their own, so one phone with the demo is not stuck', () => {
    const state = game(['fighter', 'wizard', 'rogue'])
    const [fighter, wizard, rogue] = state.heroes
    // The wizard has an iPad open; the rogue has nobody.
    render(<FirstRoll state={state} dispatch={() => {}} heroId={fighter.id} screens={[fighter.key, wizard.key]} />)
    expect(screen.getByRole('button', { name: `Roll for ${rogue.name}` })).toBeTruthy()
    expect(screen.queryByRole('button', { name: `Roll for ${wizard.name}` })).toBeNull()
    expect(screen.queryByRole('button', { name: `Roll for ${fighter.name}` })).toBeNull()
  })

  it("leaves a hero played by the computer to roll for itself", () => {
    const state = game(['fighter', 'wizard'])
    const withAlly = { ...state, heroes: state.heroes.map((h, i) => (i === 1 ? { ...h, ally: true } : h)) }
    render(<FirstRoll state={withAlly} dispatch={() => {}} heroId={state.heroes[0].id} screens={[state.heroes[0].key]} />)
    expect(screen.queryByRole('button', { name: /Roll for/ })).toBeNull()
  })
})
