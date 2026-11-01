// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { normalizeTiles } from '../board/tileDefs.js'
import { layTile } from '../board/play.js'
import { createHero, gameReducer, initialState } from '../state/game.js'
import Board from './Board.jsx'
import { GLOW_MS } from './useFreshTiles.js'

const OPEN = { N: 'oooo', S: 'oooo', W: 'oooooooo', E: 'oooooooo' }
const TILES = normalizeTiles(
  [
    { id: 'start', kind: 'start', rows: ['....', '....', '....', '....', '....', '....', '....', '....'], exits: OPEN },
    { id: 'room', name: 'Room', rows: ['....', '....', '....', '....'], exits: { N: 'oooo', S: 'oooo', W: 'oooo', E: 'oooo' } },
  ],
  [],
)

function game() {
  const heroes = HERO_TEMPLATES.slice(0, 2).map((t) => createHero(t))
  return { ...gameReducer(initialState, { type: 'START_GAME', heroes, tileRandom: [], boardTiles: TILES }), firstRoll: null }
}
const explored = (state) => layTile({ ...state, board: { ...state.board, pile: ['room'] } }, '').state

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
  vi.useRealTimers()
})

describe('a new tile lights up', () => {
  it('glows on the tile just laid for a few seconds, not on the tiles already there', () => {
    vi.useFakeTimers()
    const state = game()
    const c = render(<Board state={state} dispatch={vi.fn()} fill calm />)
    expect(c.container.querySelector('[data-new-tile]')).toBeNull()

    const next = explored(state)
    expect(next.board.tiles).toHaveLength(2)
    c.rerender(<Board state={next} dispatch={vi.fn()} fill calm />)
    const glow = c.container.querySelector('[data-new-tile]')
    expect(glow?.getAttribute('data-new-tile')).toBe(next.board.tiles[1].uid)

    act(() => vi.advanceTimersByTime(GLOW_MS + 10))
    expect(c.container.querySelector('[data-new-tile]')).toBeNull()
  })

  it('still lights a tile laid while this screen was showing something else', () => {
    const state = game()
    const first = render(<Board state={state} dispatch={vi.fn()} fill calm />)
    first.unmount()
    const again = render(<Board state={explored(state)} dispatch={vi.fn()} fill calm />)
    expect(again.container.querySelector('[data-new-tile]')).not.toBeNull()
  })
})
