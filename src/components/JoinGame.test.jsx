// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { createHero, gameReducer, initialState } from '../state/game.js'
import SeatPicker from './SeatPicker.jsx'

const POWERS = [
  { id: 'r1', hero: 'rogue', type: 'at-will', name: 'Stab', suggested: true },
  { id: 'r2', hero: 'rogue', type: 'at-will', name: 'Slash', suggested: true },
  { id: 'r3', hero: 'rogue', type: 'utility', name: 'Hide', suggested: true },
  { id: 'r5', hero: 'rogue', type: 'utility', name: 'Sneak', suggested: true },
  { id: 'r4', hero: 'rogue', type: 'daily', name: 'Big Stab', suggested: true },
]
vi.mock('../state/useCards.js', () => ({ useCards: () => ({ powers: POWERS, abilities: [] }) }))
vi.mock('../state/useArt.js', async (importOriginal) => ({ ...(await importOriginal()), useArt: () => ({}) }))
afterEach(cleanup)

describe('the Join this game screen', () => {
  it('joins with a name and the suggested powers, and makes this iPad that hero', () => {
    const heroes = ['fighter', 'wizard'].map((k) => ({ ...createHero(HERO_TEMPLATES.find((t) => t.key === k)), player: 'JJ' }))
    const state = gameReducer(initialState, { type: 'START_GAME', heroes, tileRandom: [] })
    const dispatch = vi.fn()
    const onPick = vi.fn()
    render(<SeatPicker heroes={state.heroes} onPick={onPick} tableSeat="table" projectorSeat="projector" onArt={() => {}} state={{ ...state, firstRoll: null }} dispatch={dispatch} deviceId="easton" />)
    fireEvent.click(screen.getByText(/Join this game with a new hero/))
    fireEvent.click(screen.getByText('Tarak'))
    fireEvent.change(screen.getByPlaceholderText('Type your name to join'), { target: { value: 'Easton' } })
    fireEvent.click(screen.getByText(/Join as Tarak/))
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'JOIN_GAME', heroKey: 'rogue', player: 'Easton', ally: false, deviceId: 'easton' }))
    expect(dispatch.mock.calls[0][0].picks.map((c) => c?.name)).toEqual(['Stab', 'Slash', 'Hide', 'Sneak', 'Big Stab'])
    expect(onPick).toHaveBeenCalledWith('rogue')
  })
})
