import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { normalizeCardFile } from '../data/cards.js'
import { createHero, gameReducer, initialState } from './game.js'
import { buildTileStack } from './tiles.js'

const { adventures, problems } = normalizeCardFile({
  powers: [],
  adventures: [
    {
      id: 'gear', title: 'Gear', goal: 'Get the bag.',
      reveals: [{ tile: 'Vault', story: 'A vault!', actions: [{ type: 'placeToken', name: 'Bag' }] }],
      win: { tokens: ['Bag'] },
    },
    { id: 'exit', title: 'Exit', goal: 'Escape.', reveals: [{ tile: 'Tunnel Exit', drawn: [7, 7] }], win: { escape: true } },
  ],
})

const start = (adventure, tiles) => {
  let state = gameReducer(initialState, { type: 'CHOOSE_ADVENTURE', adventure })
  if (tiles) state = gameReducer(state, { type: 'SET_LOBBY_TILES', tiles })
  state = gameReducer(state, { type: 'START_GAME', heroes: HERO_TEMPLATES.slice(0, 2).map((t) => createHero(t)), tileRandom: [0.99] })
  return { ...state, turn: { ...state.turn, phase: 1 } } // the Exploration Phase
}
const explore = (state) => gameReducer(state, { type: 'SET_EXPLORED', explored: true, random: [] })
const nextTurn = (state) => ({ ...state, turn: { ...state.turn, heroIndex: 0, phase: 1, tiles: undefined, explored: undefined } })

describe('dungeon tile stack', () => {
  it('reads where a special tile turns up', () => {
    expect(problems).toEqual([])
    expect(adventures[1].reveals[0].drawn).toEqual([7, 7])
    expect(adventures[0].reveals[0].drawn).toBeNull()
  })

  it('puts special tiles in their range, 9th to 12th by default', () => {
    for (const r of [0, 0.3, 0.6, 0.99]) {
      const { stack } = buildTileStack(20, adventures[0], [r])
      expect(stack).toHaveLength(21)
      const at = stack.indexOf('Vault') + 1
      expect(at).toBeGreaterThanOrEqual(9)
      expect(at).toBeLessThanOrEqual(12)
    }
    expect(buildTileStack(20, adventures[1], [0.5]).stack.indexOf('Tunnel Exit')).toBe(6)
  })

  it('draws a tile when the hero explores, and only once a turn', () => {
    let state = start(null, 15)
    expect(state.tileStack.stack).toHaveLength(15)
    state = explore(state)
    expect(state.turn.explored).toBe(true)
    expect(state.turn.tiles.explore).toBe('')
    expect(state.tileStack.stack).toHaveLength(14)
    expect(explore(state).tileStack.stack).toHaveLength(14)
  })

  it('reveals the special tile when it comes up', () => {
    let state = start(adventures[1], 10)
    for (let i = 0; i < 6; i++) state = nextTurn(explore(state))
    expect(state.adventure.revealed).toEqual([])
    state = explore(state)
    expect(state.turn.tiles.explore).toBe('Tunnel Exit')
    expect(state.adventure.revealed).toEqual(['Tunnel Exit'])
  })

  it('has no new tile once the stack is empty', () => {
    let state = start(null, 10)
    state = { ...state, tileStack: { stack: [], drawn: 10 } }
    state = explore(state)
    expect(state.turn.explored).toBe(false)
    expect(state.turn.noTiles).toBe(true)
  })

  it('draws another tile for a long hallway, after the explore draw', () => {
    let state = explore(start(null, 10))
    state = gameReducer(state, { type: 'DRAW_TILE', key: 'hallway-1', from: 'top', random: [] })
    expect(state.turn.tiles).toMatchObject({ explore: '', 'hallway-1': '' })
    expect(state.tileStack.stack).toHaveLength(8)
  })

  it('draws from the bottom for a card, once per key', () => {
    let state = start(null, 10)
    state = { ...state, tileStack: { stack: ['', 'Vault', ''], drawn: 0 } }
    state = gameReducer(state, { type: 'DRAW_TILE', key: 'monster-1', from: 'bottom', random: [] })
    expect(state.tileStack.stack).toEqual(['', 'Vault'])
    expect(gameReducer(state, { type: 'DRAW_TILE', key: 'monster-1', from: 'bottom', random: [] }).tileStack.stack).toHaveLength(2)
  })
})

describe('fixing the tile count by hand', () => {
  it('takes ordinary tiles off the bottom and leaves special tiles alone', () => {
    let state = start(null, 10)
    state = { ...state, tileStack: { stack: ['', '', 'Dire Chamber Entrance', '', ''], drawn: 5 } }
    state = gameReducer(state, { type: 'ADJUST_TILES', amount: -3 })
    expect(state.tileStack.stack).toEqual(['', 'Dire Chamber Entrance'])
    state = gameReducer(state, { type: 'ADJUST_TILES', amount: -5 })
    expect(state.tileStack.stack).toEqual(['Dire Chamber Entrance'])
    state = gameReducer(state, { type: 'ADJUST_TILES', amount: 2 })
    expect(state.tileStack.stack).toEqual(['Dire Chamber Entrance', '', ''])
  })
})
