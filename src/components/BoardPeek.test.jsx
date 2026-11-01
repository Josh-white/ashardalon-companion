// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { normalizeCardFile } from '../data/cards.js'
import { normalizeTiles } from '../board/tileDefs.js'
import { createHero, gameReducer, initialState } from '../state/game.js'
import Board from './Board.jsx'
import { setAimed } from './useAimed.js'

const TILES = normalizeTiles(
  [{ id: 'start', kind: 'start', rows: ['....', '....', '....', '....', '....', '....', '....', '....'], exits: { N: 'oooo', S: 'oooo', W: 'oooooooo', E: 'oooooooo' } }],
  [],
)
const { monsters } = normalizeCardFile({
  powers: [],
  monsters: [{ id: 'rat', name: 'Rat', copies: 3, ac: 12, hp: 2, xp: 1, attacks: [{ id: 'bite', name: 'Bite', bonus: 5, damage: 1 }], tactics: [{ move: 'toward', text: 'Moves toward the closest hero.' }] }],
})

// A hero's turn with a Rat on the board, owned by the second hero.
function game() {
  const heroes = HERO_TEMPLATES.slice(0, 2).map((t) => createHero(t))
  const state = { ...gameReducer(initialState, { type: 'START_GAME', heroes, tileRandom: [], boardTiles: TILES }), firstRoll: null }
  const rat = { id: 'm1', cardId: 'rat', name: 'Rat', ownerId: state.heroes[1].id, ac: 12, hp: 1, maxHp: 2, xp: 1, conditions: [], card: monsters[0] }
  return { ...state, monsters: [rat], board: { ...state.board, tokens: { ...state.board.tokens, m1: [3, 7] } } }
}
const token = (c, id) => c.container.querySelector(`[data-token="${id}"]`)

beforeAll(() => {
  Element.prototype.scrollTo ??= function () {}
  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})
afterEach(cleanup)

describe('tapping a monster token', () => {
  it("shows which monster it is, and a tap on the board closes it", () => {
    const dispatch = vi.fn()
    const c = render(<Board state={game()} dispatch={dispatch} />)
    fireEvent.click(token(c, 'm1'))
    const peek = c.container.querySelector('[data-peek="m1"]')
    expect(peek.textContent).toContain('Rat')
    expect(peek.textContent).toContain('AC 12')
    expect(peek.textContent).toContain('/ 2 HP left')
    expect(peek.textContent).toContain(`${game().heroes[1].name}'s monster`)
    expect(peek.textContent).toContain('Moves toward the closest hero.')
    expect(dispatch).not.toHaveBeenCalled()
    fireEvent.click(c.container.querySelector('svg rect'))
    expect(c.container.querySelector('[data-peek]')).toBeNull()
  })

  it('works on a screen watching someone else’s turn, and leaves the active hero’s move alone', () => {
    const state = game()
    const watch = render(<Board state={state} dispatch={vi.fn()} readOnly fill />)
    fireEvent.click(token(watch, 'm1'))
    expect(watch.container.querySelector('[data-peek="m1"]')).not.toBeNull()
    cleanup()
    const mine = render(<Board state={state} dispatch={vi.fn()} />)
    fireEvent.click(token(mine, state.heroes[0].id))
    expect(mine.container.querySelector('[data-peek]')).toBeNull()
    expect(mine.container.querySelectorAll('rect.cursor-pointer').length).toBeGreaterThan(0) // the hero's squares light up
  })
})

describe('a monster picked in the attack box', () => {
  it('glows red on the board and comes into view, without changing the zoom', () => {
    const scrolled = vi.spyOn(Element.prototype, 'scrollTo')
    const c = render(<Board state={game()} dispatch={vi.fn()} fill calm />)
    fireEvent.click(c.getByLabelText('Zoom in'))
    const width = c.container.querySelector('svg[aria-label="The dungeon board"]').getAttribute('width')
    scrolled.mockClear()
    expect(token(c, 'm1').querySelector('[data-aimed]')).toBeNull()
    act(() => setAimed(['m1']))
    expect(token(c, 'm1').querySelector('[data-aimed]')).not.toBeNull()
    expect(scrolled).toHaveBeenCalledTimes(1)
    expect(c.container.querySelector('svg[aria-label="The dungeon board"]').getAttribute('width')).toBe(width)
    act(() => setAimed([]))
    expect(token(c, 'm1').querySelector('[data-aimed]')).toBeNull()
    scrolled.mockRestore()
    localStorage.clear()
  })
})

describe('the monster taking its Villain Phase turn', () => {
  it('glows on every screen while it acts, and stops once its turn is done', () => {
    let state = game()
    expect(gameReducer(state, { type: 'START_ACTING', id: 'nobody' })).toBe(state)
    state = gameReducer(state, { type: 'START_ACTING', id: 'm1' })
    expect(state.turn.acting).toBe('m1')
    const c = render(<Board state={state} dispatch={vi.fn()} readOnly fill />)
    expect(token(c, 'm1').querySelector('[data-acting]')).not.toBeNull()
    expect(token(c, state.heroes[0].id).querySelector('[data-acting]')).toBeNull()
    state = gameReducer(state, { type: 'MARK_ACTED', id: 'm1', name: 'Rat' })
    expect(state.turn.acting).toBeUndefined()
    expect(gameReducer(state, { type: 'START_ACTING', id: 'm1' })).toBe(state) // it already went
    c.rerender(<Board state={state} dispatch={vi.fn()} readOnly fill />)
    expect(token(c, 'm1').querySelector('[data-acting]')).toBeNull()
  })
})
