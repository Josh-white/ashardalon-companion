// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PowerPicker } from './PowerList.jsx'

const options = [
  { id: 'a', name: 'Big Swing', type: 'daily', attack: '+8', damage: '3 (Miss: 1)', text: 'Hit: 3 damage and the monster is dazed.\nMiss: 1 damage.' },
  { id: 'b', name: 'Rally', type: 'daily', attack: '+6', damage: '2', text: 'Hit: each hero on your tile regains 1 HP.' },
]

afterEach(cleanup)

describe('level-up power picker', () => {
  it('shows every choice with its whole card text and stats', () => {
    render(<PowerPicker hero={{ id: 'h', name: 'Vistra' }} power={{ id: 'new', type: 'daily' }} options={options} dispatch={() => {}} />)
    expect(screen.getByText(/the monster is dazed/)).toBeTruthy()
    expect(screen.getByText(/regains 1 HP/)).toBeTruthy()
    expect(screen.getByText('Attack +8 · Damage 3 (Miss: 1)')).toBeTruthy()
  })

  it('takes the card the player picks', () => {
    const dispatch = vi.fn()
    render(<PowerPicker hero={{ id: 'h', name: 'Vistra' }} power={{ id: 'new', type: 'daily' }} options={options} dispatch={dispatch} />)
    fireEvent.click(screen.getByText('Take Rally'))
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_POWER_CARD', heroId: 'h', powerId: 'new', card: options[1] })
  })
})
