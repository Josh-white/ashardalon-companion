// @vitest-environment jsdom
// The Villain Phase's encounter step: drawing a card, cancelling it with XP, the trap-marker
// question, Frenzied Leap's monster question, and the screen for the real deck.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { createHero, gameReducer, initialState } from '../state/game.js'
import { EncounterStep } from './Encounters.jsx'

const EVENT = { id: 'gust', name: 'Sudden Gust', type: 'event', text: 'A cold wind blows.' }
const TRAP = { id: 'spikes', name: 'Spike Pit', type: 'trap', text: 'Place a Spike Pit marker on your tile.' }
const LOCKED = { id: 'doom', name: 'Doom Bell', type: 'event', text: 'It rings.', noCancel: true }
const LEAP = { id: 'leap', name: 'Frenzied Leap', type: 'event', text: 'If a monster is on your tile, take 2 damage.', damageIfMonsterOnTile: 2 }

let deck = [EVENT]
vi.mock('../state/useCards.js', () => ({ useCards: () => ({ encounters: deck, monsters: [], villains: [], powers: [], abilities: [] }) }))

afterEach(() => {
  cleanup()
  deck = [EVENT]
})

function game({ xp = 0, card, turn = {} } = {}) {
  const heroes = ['fighter', 'wizard'].map((k) => createHero(HERO_TEMPLATES.find((t) => t.key === k)))
  const state = gameReducer(initialState, { type: 'START_GAME', heroes })
  const encounter = card ? { id: 'e1', cardId: card.id, heroId: state.heroes[0].id, card, attacked: false } : null
  return { ...state, xp, encounter, turn: { ...state.turn, explored: false, ...turn } }
}

const show = (state) => {
  const dispatch = vi.fn()
  render(<EncounterStep state={state} hero={state.heroes[0]} dispatch={dispatch} />)
  return dispatch
}
const lastAction = (dispatch) => dispatch.mock.calls.at(-1)[0]

describe('the encounter step', () => {
  it('draws from the virtual deck for the active hero', () => {
    const state = game()
    const dispatch = show(state)
    fireEvent.click(screen.getByRole('button', { name: /Draw an encounter card/ }))
    expect(lastAction(dispatch)).toMatchObject({ type: 'DRAW_ENCOUNTER', heroId: state.heroes[0].id, cards: [EVENT] })
  })

  it('says "another" and how many are left when the turn owes more than one', () => {
    show(game({ turn: { encountersDrawn: 1, encountersOwed: 2 } }))
    expect(screen.getByRole('button', { name: /Draw another encounter card.*\(2 to draw\)/ })).toBeTruthy()
  })

  it('shows "Encounters done" once every card is drawn', () => {
    show(game({ turn: { explored: true, encountersDrawn: 1 } }))
    expect(screen.getByText(/Encounters done/)).toBeTruthy()
  })

  it('without encounter cards, asks the table to draw from the real deck', () => {
    deck = []
    const dispatch = show(game({ xp: 5 }))
    expect(screen.getByText(/Draw an encounter card and do what it says/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Spend 5 XP to cancel the encounter/ }))
    expect(lastAction(dispatch)).toEqual({ type: 'CANCEL_ENCOUNTER' })
  })

  it('shows a drawn card, and cancels it only when the party has the XP', () => {
    show(game({ xp: 4, card: EVENT }))
    expect(screen.getByText('Sudden Gust')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Spend 5 XP to cancel it \(party has 4\)/ }).disabled).toBe(true)
    cleanup()
    const dispatch = show(game({ xp: 5, card: EVENT }))
    fireEvent.click(screen.getByRole('button', { name: /Spend 5 XP to cancel it/ }))
    expect(lastAction(dispatch)).toEqual({ type: 'CANCEL_ENCOUNTER' })
  })

  it("says when a card can't be canceled and offers no cancel button", () => {
    show(game({ xp: 20, card: LOCKED }))
    expect(screen.getByText(/can’t be canceled/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /cancel it/ })).toBeNull()
  })

  it('resolves an event card with the gold button', () => {
    const dispatch = show(game({ card: EVENT }))
    const buttons = screen.getAllByRole('button').filter((b) => !b.hasAttribute('data-skip-encounter'))
    fireEvent.click(buttons.at(-1))
    expect(lastAction(dispatch)).toMatchObject({ type: 'RESOLVE_ENCOUNTER', monsterOnTile: false })
  })

  it('asks whether the tile already has a marker before placing a trap', () => {
    const dispatch = show(game({ card: TRAP }))
    expect(screen.getByText(/already have a trap or hazard marker/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }))
    expect(lastAction(dispatch)).toEqual({ type: 'REDRAW_ENCOUNTER' })
    fireEvent.click(screen.getByRole('button', { name: 'No' }))
    expect(screen.getByRole('button', { name: /Oops, .* tile does have a marker/ })).toBeTruthy()
  })

  it('asks Frenzied Leap\'s question at the table, and passes the answer on', () => {
    const dispatch = show(game({ card: LEAP }))
    expect(screen.getByText(/Is a monster on .* tile\?/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Yes: 2 damage/ }))
    expect(lastAction(dispatch)).toMatchObject({ type: 'RESOLVE_ENCOUNTER', monsterOnTile: true })
  })
})

describe('skipping a card (house rule)', () => {
  it('asks once more, then skips the drawn card for free', () => {
    const state = game({ xp: 0, card: LOCKED })
    const dispatch = show(state)
    fireEvent.click(screen.getByText('Skip this card (no XP)'))
    expect(dispatch).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Skip it'))
    expect(lastAction(dispatch)).toEqual({ type: 'SKIP_ENCOUNTER' })
  })

  it('puts the skipped card in the discards without spending XP', () => {
    const base = game({ xp: 3, card: LOCKED })
    const state = { ...base, encounterDeck: { draw: [], discard: [] } }
    const next = gameReducer(state, { type: 'SKIP_ENCOUNTER' })
    expect(next.encounter).toBeNull()
    expect(next.xp).toBe(3)
    expect(next.encounterDeck.discard).toEqual(['doom'])
  })

  it('discards the environment in play', () => {
    const snipers = { id: 'hidden-snipers', name: 'Hidden Snipers', type: 'environment', text: 'Ouch.', checks: [] }
    const base = game()
    const state = { ...base, environment: { cardId: snipers.id, name: snipers.name, card: snipers }, encounterDeck: { draw: [], discard: [] } }
    const next = gameReducer(state, { type: 'DISCARD_ENVIRONMENT' })
    expect(next.environment).toBeNull()
    expect(next.encounterDeck.discard).toEqual(['hidden-snipers'])
  })
})

describe('Time Leap', () => {
  const TIME_LEAP = { id: 'time-leap', name: 'Time Leap', type: 'curse', text: 'Remove your Hero from play.', drawMonster: true, curse: { removeAtTurnStart: true } }
  const withDeck = (state, drawn) => ({
    ...state,
    monsterDeck: { cards: { rat: { id: 'rat', name: 'Rat' } }, draw: ['rat'], discard: [] },
    encounter: { ...state.encounter, monsterDrawn: drawn },
  })

  it('shows numbered steps and only the monster draw until the monster is drawn', () => {
    const state = withDeck(game({ card: TIME_LEAP }), false)
    const dispatch = show(state)
    expect(screen.getByText(/falls through a rift in time/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /vanishes until/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Draw the Time Leap monster/ }))
    expect(lastAction(dispatch)).toMatchObject({ type: 'DRAW_MONSTER', heroId: state.heroes[0].id })
  })

  it('offers the finish button once the monster is drawn', () => {
    const dispatch = show(withDeck(game({ card: TIME_LEAP }), true))
    expect(screen.queryByRole('button', { name: /Draw the Time Leap monster/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /vanishes until their next turn/ }))
    expect(lastAction(dispatch)).toMatchObject({ type: 'RESOLVE_ENCOUNTER' })
  })
})
