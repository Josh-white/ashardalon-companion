// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { normalizeTiles } from '../board/tileDefs.js'
import { createHero, gameReducer, initialState } from '../state/game.js'
import Board from './Board.jsx'
import { reloadBoard3D } from './board3dSwitch.js'

const TILES = normalizeTiles(
  [{ id: 'start', kind: 'start', rows: ['....', '....', '....', '....', '....', '....', '....', '....'], exits: { N: 'oooo', S: 'oooo', W: 'oooooooo', E: 'oooooooo' } }],
  [],
)
const game = () => ({ ...gameReducer(initialState, { type: 'START_GAME', heroes: HERO_TEMPLATES.slice(0, 2).map((t) => createHero(t)), tileRandom: [], boardTiles: TILES }), firstRoll: null })

beforeAll(() => {
  Element.prototype.scrollTo ??= function () {}
  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})
afterEach(() => {
  cleanup()
  localStorage.clear()
  reloadBoard3D()
})

describe('🧊 on an iPad board', () => {
  it('has the switch next to 🔥, off at first', () => {
    const c = render(<Board state={game()} dispatch={vi.fn()} fill calm />)
    const cube = c.getByTitle('Show the board in 3D')
    expect(cube.getAttribute('aria-pressed')).toBe('false')
    expect(c.getByTitle('Turn torchlight off')).toBeTruthy()
  })

  it("goes back to the flat board and says why when the screen can't draw 3D", async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const c = render(<Board state={game()} dispatch={vi.fn()} fill calm />)
    fireEvent.click(c.getByTitle('Show the board in 3D'))
    // jsdom has no WebGL, so the 3D board gives up straight away.
    await waitFor(() => expect(c.getByText(/can't draw the 3D board/)).toBeTruthy())
    expect(c.getByTitle('Show the board in 3D').getAttribute('aria-pressed')).toBe('false')
    expect(localStorage.getItem('ashardalon-board3d')).toBe('off')
    expect(c.container.querySelector('svg[aria-label="The dungeon board"]')).toBeTruthy()
    fireEvent.click(c.getByLabelText('Close'))
    expect(c.queryByText(/can't draw the 3D board/)).toBeNull()
    warn.mockRestore()
    error.mockRestore()
  })

  it('is not on the read-only boards with nothing to tap', () => {
    const c = render(<Board state={game()} readOnly fill />)
    expect(c.queryByTitle('Show the board in 3D')).toBeNull()
  })
})
