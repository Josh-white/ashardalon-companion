// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { normalizeTiles } from '../board/tileDefs.js'
import { createHero, gameReducer, initialState } from '../state/game.js'
import ProjectorBoard, { Board3DToggle, useBoard3D } from './ProjectorBoard.jsx'

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
})

function Switchable({ state }) {
  const [on, toggle] = useBoard3D()
  return (
    <>
      <Board3DToggle on={on} toggle={toggle} />
      <ProjectorBoard state={state} on={on} />
    </>
  )
}

describe('the projector 3D switch', () => {
  it('is off at first, and the flat board shows', () => {
    const c = render(<Switchable state={game()} />)
    expect(c.getByRole('button', { name: /3D board off/ })).toBeTruthy()
    expect(c.container.querySelector('[data-token]')).toBeTruthy()
  })

  it('remembers being turned on, and falls back to the flat board where 3D can\'t be drawn', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const c = render(<Switchable state={game()} />)
    fireEvent.click(c.getByRole('button', { name: /3D board off/ }))
    expect(localStorage.getItem('ashardalon-board3d')).toBe('on')
    expect(c.getByRole('button', { name: /3D board on/ })).toBeTruthy()
    // jsdom has no WebGL: the flat board comes back instead of a blank screen.
    await waitFor(() => expect(c.container.querySelector('[data-token]')).toBeTruthy())
    await new Promise((r) => setTimeout(r, 50))
    expect(c.container.querySelector('[data-token]')).toBeTruthy()
    warn.mockRestore()
    error.mockRestore()
  })
})
