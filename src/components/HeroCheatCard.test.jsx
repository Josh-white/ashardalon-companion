// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { createHero } from '../state/game.js'
import HeroCheatCard from './HeroCheatCard.jsx'

afterEach(cleanup)

// Vistra with two powers picked: one the coach talks about, one only the card explains.
function vistra() {
  const hero = createHero(HERO_TEMPLATES.find((t) => t.key === 'fighter'))
  const cards = [
    { name: 'Reaping Strike', attack: '+6', damage: '1', text: 'Card text the coach covers.' },
    { name: 'Odd Swing', attack: '+5', damage: '2', text: 'Only the card explains this one.' },
  ]
  return { ...hero, powers: hero.powers.map((p, i) => (cards[i] ? { ...p, name: cards[i].name, card: cards[i] } : p)) }
}

describe('the hero cheat card', () => {
  it('opens from one slim button and shows powers in plain words, then closes', () => {
    render(<HeroCheatCard hero={vistra()} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /How Vistra works/ }))
    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toMatch(/attacks twice/)
    expect(dialog.textContent).not.toMatch(/Card text the coach covers/)
    expect(dialog.textContent).toMatch(/Only the card explains this one/)
    expect(dialog.textContent).toMatch(/Every turn/)
    expect(dialog.textContent).toMatch(/Tip:/)
    // Empty power slots (no card picked) are left off.
    expect(dialog.querySelectorAll('li')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Got it!' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
