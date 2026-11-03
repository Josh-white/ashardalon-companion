import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { normalizeCardFile } from '../data/cards.js'
import { normalizeTiles } from './tileDefs.js'
import { createHero, gameReducer, initialState } from '../state/game.js'
import { STAIR_TOP, boardExtras, boardFigures, boardLayout, restFacing, stairHeights, stairsRise } from './scene3d.js'

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
    expect(layout.exits).toEqual([{ type: 'stairs', squares: [[1, 3], [2, 3], [1, 4], [2, 4]], entrance: true }])
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

describe('markers and tokens on the 3D board', () => {
  it('puts a hazard floor and its badge on a free square of its tile', () => {
    const state = game()
    const tile = state.board.tiles[0].uid
    const lava = { ...state, traps: [{ id: 't1', cardId: 'lava-flow', name: 'Lava Flow', type: 'hazard', tiles: [tile] }] }
    const [marker] = boardExtras(lava).markers
    expect(marker).toMatchObject({ id: 't1', floor: 'lava', icon: '🌋' })
    expect(marker.squares.length).toBeGreaterThan(0)
    const taken = new Set(Object.values(lava.board.tokens).map(String))
    expect(taken.has(String(marker.badge.at))).toBe(false)
    expect(marker.badge.small).toBe(false)
  })

  it('tints a trap that has no floor of its own, and leaves out a marker with no tile', () => {
    const state = game()
    const tile = state.board.tiles[0].uid
    const traps = [
      { id: 't1', cardId: 'poisoned-dart-trap', name: 'Poisoned Dart Trap', type: 'trap', tile },
      { id: 't2', cardId: 'pit', name: 'Pit', type: 'hazard' },
    ]
    const markers = boardExtras({ ...state, traps }).markers
    expect(markers.map((m) => [m.id, m.floor])).toEqual([['t1', 'tint']])
  })

  it('lists Treasure tokens, hero tokens with their stack and the carpet', () => {
    const state = game()
    const owner = state.heroes[0]
    const items = [
      { id: 'i1', kind: 'treasure', at: [2, 2] },
      { id: 'i2', kind: 'sphere', owner: owner.id, at: [2, 3] },
      { id: 'i3', kind: 'carpet', at: [1, 1] },
      { id: 'i4', kind: 'treasure' },
    ]
    const withItems = { ...state, heroes: state.heroes.map((h) => (h.id === owner.id ? { ...h, tokens: { ...h.tokens, flamingSphere: 3 } } : h)), board: { ...state.board, items } }
    expect(boardExtras(withItems).items).toEqual([
      { id: 'i1', kind: 'treasure', at: [2, 2] },
      { id: 'i3', kind: 'carpet', at: [1, 1] },
      { id: 'i2', kind: 'token', at: [2, 3], icon: '🔥', color: '#c2410c', count: 3 },
    ])
  })

  it('shows a figure\'s conditions as icons', () => {
    const state = game()
    const sick = { ...state, heroes: state.heroes.map((h, i) => (i === 0 ? { ...h, conditions: ['Poisoned', 'Dazed'] } : h)) }
    expect(boardFigures(sick)[0].icons).toEqual(['🧪', '💫'])
  })
})

describe('who the 3D figures look at', () => {
  it('turns heroes to the nearest monster and monsters to the nearest hero still standing', () => {
    const figures = [
      { id: 'h1', kind: 'hero', at: [0, 0] },
      { id: 'h2', kind: 'hero', at: [3, 3], faded: true },
      { id: 'h3', kind: 'hero', at: [5, 0] },
      { id: 'm1', kind: 'monster', at: [1, 0] },
      { id: 'v1', kind: 'villain', at: [4, 4] },
      { id: 'n1', kind: 'villager', at: [2, 2] },
    ]
    const looks = restFacing(figures)
    expect(looks.h1).toEqual([1, 0])
    expect(looks.h2).toEqual([4, 4])
    expect(looks.m1).toEqual([0, 0])
    // The villain looks past the fallen hero next to it.
    expect(looks.v1).toEqual([5, 0])
    expect(looks.n1).toBeUndefined()
    expect(restFacing([{ id: 'h1', kind: 'hero', at: [0, 0] }])).toEqual({})
  })
})

describe('stairs in 3D', () => {
  it('rise toward the rock beyond them, or north when nothing tells', () => {
    const layout = boardLayout(game().board)
    const stairs = layout.exits[0].squares
    // The Start tile here has rock down its west side, next to the stairs.
    expect(stairsRise(layout, stairs)).toBe('W')
    const open = { squares: [[0, 0], [1, 0], [0, 1], [1, 1], [2, 0], [2, 1], [-1, 0], [-1, 1], [0, -1], [1, -1], [0, 2], [1, 2]].map(([x, y]) => ({ x, y, floor: true })) }
    expect(stairsRise(open, [[0, 0], [1, 0], [0, 1], [1, 1]])).toBe('N')
  })

  it('lift a figure higher on the squares nearer the top', () => {
    const h = stairHeights([[1, 3], [2, 3], [1, 4], [2, 4]], 'N')
    expect(h['1,3']).toBeGreaterThan(h['1,4'])
    expect(h['1,3']).toBe(h['2,3'])
    expect(h['1,3']).toBeLessThan(STAIR_TOP)
    expect(h['1,4']).toBeGreaterThan(0)
  })
})

describe('tile seams in 3D', () => {
  it('mark open floor running from one tile onto the next, never inside one tile', () => {
    const state = game()
    const one = boardLayout(state.board)
    expect(one.seams).toEqual([])
    // An open 4x4 tile laid on the Start tile's north edge, where its one open square is.
    const [open] = normalizeTiles([{ id: 'open', kind: 'regular', rows: ['....', '....', '....', '....'], exits: { N: 'oooo', S: 'oooo', W: 'oooo', E: 'oooo' } }], [])
    const board = { ...state.board, defs: { ...state.board.defs, open }, tiles: [...state.board.tiles, { uid: 't1', tileId: 'open', at: [0, -4], turn: 0 }] }
    const two = boardLayout(board)
    expect(two.seams).toEqual([{ x: 1, y: -1, side: 'S' }])
  })
})
