// @vitest-environment jsdom
// Back from a Time Leap: the board says so in a big banner, has the hero picked up ready,
// and one tap on a lit square puts them back.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { normalizeTiles } from '../board/tileDefs.js'
import { createHero, gameReducer, initialState } from '../state/game.js'
import Board from './Board.jsx'
import { reloadBoard3D } from './board3dSwitch.js'

const TILES = normalizeTiles(
  [{ id: 'start', kind: 'start', rows: ['....', '....', '....', '....', '....', '....', '....', '....'], exits: { N: 'oooo', S: 'oooo', W: 'oooooooo', E: 'oooooooo' } }],
  [],
)

function game() {
  const heroes = HERO_TEMPLATES.slice(0, 2).map((t) => createHero(t))
  const state = { ...gameReducer(initialState, { type: 'START_GAME', heroes, tileRandom: [], boardTiles: TILES }), firstRoll: null }
  const { [state.heroes[0].id]: _gone, ...tokens } = state.board.tokens
  return { ...state, board: { ...state.board, tokens }, turn: { ...state.turn, leapBack: state.heroes[0].id } }
}

beforeAll(() => {
  Element.prototype.scrollTo ??= function () {}
  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})
afterEach(cleanup)
beforeEach(() => {
  localStorage.setItem('ashardalon-board3d', 'off')
  reloadBoard3D()
})

describe('a hero back from a Time Leap', () => {
  it('shows a big banner and puts the hero back with one tap on a lit square', () => {
    const state = game()
    const dispatch = vi.fn()
    const c = render(<Board state={state} dispatch={dispatch} fill calm />)
    expect(c.getByText(/is back from the Time Leap/)).toBeTruthy()
    expect(c.getByText(/Tap any lit square/)).toBeTruthy()
    const lit = c.container.querySelector('rect.cursor-pointer[fill="#34d399"]')
    expect(lit).toBeTruthy()
    fireEvent.click(lit)
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'MOVE_TOKEN', id: state.heroes[0].id }))
  })

  it('shows nothing on a screen that is only watching', () => {
    const c = render(<Board state={game()} dispatch={vi.fn()} readOnly fill calm />)
    expect(c.queryByText(/is back from the Time Leap/)).toBeNull()
  })
})
