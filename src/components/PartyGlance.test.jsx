// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { createHero } from '../state/game.js'
import { PartyGlance } from './PartyPanels.jsx'

afterEach(cleanup)

function party() {
  const heroes = ['fighter', 'wizard'].map((key, i) => ({ ...createHero(HERO_TEMPLATES.find((t) => t.key === key)), id: `h${i}` }))
  return { heroes }
}

describe('the Party tab beside the board', () => {
  it('opens a hero card in place of its row (no double) and closes it again', () => {
    const state = party()
    const wizard = state.heroes[1]
    render(<PartyGlance state={state} dispatch={() => {}} heroCard={(h) => <div key={h.id} data-testid="card">{h.name} full card</div>} />)
    expect(screen.queryByTestId('card')).toBeNull()
    fireEvent.click(screen.getByText(wizard.name, { exact: false }).closest('button'))
    expect(screen.getAllByTestId('card')).toHaveLength(1)
    // The short row for that hero is gone; only the other hero's row has HP buttons.
    expect(screen.queryByRole('button', { name: `${wizard.name} loses 1 HP` })).toBeNull()
    expect(screen.getByRole('button', { name: `${state.heroes[0].name} loses 1 HP` })).toBeTruthy()
    const closers = screen.getAllByRole('button', { name: `Close ${wizard.name}'s card` })
    expect(closers).toHaveLength(2)
    fireEvent.click(closers[1])
    expect(screen.queryByTestId('card')).toBeNull()
    expect(screen.getByRole('button', { name: `${wizard.name} loses 1 HP` })).toBeTruthy()
  })
})
