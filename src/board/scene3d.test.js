import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { normalizeCardFile } from '../data/cards.js'
import { normalizeTiles } from './tileDefs.js'
import { createHero, gameReducer, initialState } from '../state/game.js'
import { boardFigures, boardLayout } from './scene3d.js'

const TILES = normalizeTiles(
  [
    {
      id: 'start',
      kind: 'start',
      rows: ['#...', '#...', '#...', '#...', '#...', '#...', '#...', '#...'],
      exits: { N: 'xoxx', S: 'xxxx', W: 'xxxxxxxx', E: 'xxxxxxxx' },
      features: [{ type: 'stairs', at: [[1, 3], [2, 3], [1, 4], [2, 4]] }],
    },
  ],
  [],
)
const { monsters } = normalizeCardFile({
  powers: [],
  monsters: [{ id: 'rat', name: 'Rat', copies: 3, ac: 12, hp: 2, xp: 1, attacks: [{ id: 'bite', name: 'Bite', bonus: 5, damage: 1 }], tactics: [{ move: 'toward', text: 'Moves toward the closest hero.' }] }],
})

function game() {
  const heroes = HERO_TEMPLATES.slice(0, 2).map((t) => createHero(t))
  const state = { ...gameReducer(initialState, { type: 'START_GAME', heroes, tileRandom: [], boardTiles: TILES }), firstRoll: null }
  const rat = { id: 'm1', cardId: 'rat', name: 'Rat', ownerId: state.heroes[1].id, ac: 12, hp: 1, maxHp: 2, xp: 1, conditions: [], card: monsters[0] }
  return { ...state, monsters: [rat], board: { ...state.board, tokens: { ...state.board.tokens, m1: [3, 7] } } }
}

describe('the 3D board layout', () => {
  it('has every square of the Start tile, its rock, its stairs and its edges', () => {
    const layout = boardLayout(game().board)
    expect(layout.squares).toHaveLength(32)
    expect(layout.squares.filter((s) => !s.floor)).toHaveLength(8)
    expect(layout.bounds).toEqual({ x: 0, y: 0, w: 4, h: 8 })
    expect(layout.exits).toEqual([{ type: 'stairs', squares: [[1, 3], [2, 3], [1, 4], [2, 4]] }])
    // One open square on the north edge: where the next tile goes.
    expect(layout.openEdges).toEqual([{ x: 1, y: 0, side: 'N' }])
    // Shut edges round the floor get walls; rock squares don't need one.
    expect(layout.walls.some((w) => w.x === 3 && w.y === 5 && w.side === 'E')).toBe(true)
    expect(layout.walls.some((w) => w.x === 0)).toBe(false)
  })

  it('lists the figures on the board with their squares, the active hero marked', () => {
    const state = game()
    const figures = boardFigures(state)
    const hero = figures.find((f) => f.id === state.heroes[0].id)
    expect(hero).toMatchObject({ kind: 'hero', active: true, faded: false, at: state.board.tokens[state.heroes[0].id] })
    expect(figures.find((f) => f.id === 'm1')).toMatchObject({ kind: 'monster', label: 'Rat', at: [3, 7], art: 'monster-rat' })
  })

  it('fades a hero at 0 HP and leaves out figures not on the board', () => {
    const state = game()
    const down = { ...state, heroes: state.heroes.map((h, i) => (i === 1 ? { ...h, hp: 0 } : h)), board: { ...state.board, tokens: { ...state.board.tokens, m1: undefined } } }
    delete down.board.tokens.m1
    const figures = boardFigures(down)
    expect(figures.find((f) => f.id === state.heroes[1].id).faded).toBe(true)
    expect(figures.some((f) => f.id === 'm1')).toBe(false)
  })
})
