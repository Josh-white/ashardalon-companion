// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { normalizeTiles } from '../board/tileDefs.js'
import { createHero, gameReducer, initialState } from '../state/game.js'
import Board from './Board.jsx'

const TILES = normalizeTiles(
  [{ id: 'start', kind: 'start', rows: ['....', '....', '....', '....', '....', '....', '....', '....'], exits: { N: 'oooo', S: 'oooo', W: 'oooooooo', E: 'oooooooo' } }],
  [],
)

function game() {
  const heroes = HERO_TEMPLATES.slice(0, 2).map((t) => createHero(t))
  return { ...gameReducer(initialState, { type: 'START_GAME', heroes, tileRandom: [], boardTiles: TILES }), firstRoll: null }
}
const fingers = (gap) => [
  { clientX: 100 - gap / 2, clientY: 100 },
  { clientX: 100 + gap / 2, clientY: 100 },
]

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

describe('pinch zoom on the board', () => {
  it('only stretches the board while the fingers move, and draws it at the new size once they lift', () => {
    const c = render(<Board state={game()} dispatch={vi.fn()} fill calm />)
    const svg = c.container.querySelector('svg[aria-label="The dungeon board"]')
    const box = svg.parentElement
    expect(svg.getAttribute('width')).toBe('100%')

    fireEvent.touchStart(box, { touches: fingers(100) })
    fireEvent.touchMove(box, { touches: fingers(150) })
    fireEvent.touchMove(box, { touches: fingers(200) })
    // Still drawn at the old size, just stretched.
    expect(svg.getAttribute('width')).toBe('100%')
    expect(svg.style.transform).toBe('scale(2)')

    fireEvent.touchEnd(box, { touches: [] })
    expect(svg.style.transform).toBe('')
    expect(Number(svg.getAttribute('width'))).toBeGreaterThan(0)
  })
})

describe('the board remembers its zoom', () => {
  it('comes back at the same zoom after the page reloads', () => {
    const first = render(<Board state={game()} dispatch={vi.fn()} fill calm />)
    expect(first.container.querySelector('svg[aria-label="The dungeon board"]').getAttribute('width')).toBe('100%')
    fireEvent.click(first.getByLabelText('Zoom in'))
    const width = first.container.querySelector('svg[aria-label="The dungeon board"]').getAttribute('width')
    expect(Number(width)).toBeGreaterThan(0)
    cleanup()

    const again = render(<Board state={game()} dispatch={vi.fn()} fill calm />)
    expect(again.container.querySelector('svg[aria-label="The dungeon board"]').getAttribute('width')).toBe(width)
    // Zoomed back out to fit, it stays fitted next time.
    fireEvent.click(again.getByLabelText('Zoom out'))
    cleanup()
    const third = render(<Board state={game()} dispatch={vi.fn()} fill calm />)
    expect(third.container.querySelector('svg[aria-label="The dungeon board"]').getAttribute('width')).toBe('100%')
  })

  it('remembers a pinch too', () => {
    const c = render(<Board state={game()} dispatch={vi.fn()} fill calm />)
    const box = c.container.querySelector('svg[aria-label="The dungeon board"]').parentElement
    fireEvent.touchStart(box, { touches: fingers(100) })
    fireEvent.touchMove(box, { touches: fingers(250) })
    fireEvent.touchEnd(box, { touches: [] })
    expect(JSON.parse(localStorage.getItem('ashardalon-board-zoom')).zoom).toBeCloseTo(2.5)
  })
})
