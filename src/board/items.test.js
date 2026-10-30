import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { createHero, gameReducer, initialState } from '../state/game.js'
import { canFlyCarpet, carpetTargets, treasureInReach } from './items.js'
import { normalizeTiles } from './tileDefs.js'

// A made-up start tile with a room north of it.
const TILES = normalizeTiles(
  [
    {
      id: 'start', kind: 'start', rows: ['...#', '...#', '...#', '...#', '...#', '...#', '...#', '...#'],
      exits: { N: 'ooox', S: 'ooox', W: 'oooooooo', E: 'xxxxxxxx' },
      features: [{ type: 'stairs', at: [[1, 3], [2, 3], [1, 4], [2, 4]] }],
    },
    { id: 'room', name: 'Room', kind: 'regular', triangle: 'black', rows: ['....', '.S..', '....', '....'], exits: { N: 'oooo', S: 'oooo', W: 'oooo', E: 'oooo' } },
  ],
  [],
)

function game() {
  const heroes = HERO_TEMPLATES.slice(0, 1).map((t) => createHero(t))
  const state = gameReducer(initialState, { type: 'START_GAME', heroes, tileRandom: [], boardTiles: TILES })
  const tiles = [...state.board.tiles, { uid: 't1', tileId: 'room', at: [0, -4], turn: 0 }]
  const hero = state.heroes[0]
  return { state: { ...state, firstRoll: null, board: { ...state.board, tiles, tokens: { [hero.id]: [0, 1] } } }, hero }
}

const withToken = (state, at) => {
  const added = gameReducer(state, { type: 'ADD_TREASURE_TOKEN' })
  const id = added.board.items[0].id
  return { state: gameReducer(added, { type: 'PLACE_ITEM', id, to: at }), id }
}

describe('Treasure tokens on the virtual board', () => {
  it('Hidden Treasure puts a token in hand, waiting for its square', () => {
    const { state, hero } = game()
    const card = { id: 'hidden-treasure', name: 'Hidden Treasure', type: 'event', text: '', drawAnother: true }
    const next = gameReducer({ ...state, encounter: { id: 'e1', cardId: card.id, heroId: hero.id, card, attacked: false } }, { type: 'RESOLVE_ENCOUNTER', random: [] })
    expect(next.board.items).toEqual([expect.objectContaining({ kind: 'treasure', at: null })])
  })

  it('goes on a floor square, one per square', () => {
    const { state } = game()
    const { state: placed, id } = withToken(state, [1, -2])
    expect(placed.board.items[0].at).toEqual([1, -2])
    const second = gameReducer(placed, { type: 'ADD_TREASURE_TOKEN' })
    const other = second.board.items[1].id
    expect(gameReducer(second, { type: 'PLACE_ITEM', id: other, to: [1, -2] }).board.items[1].at).toBeNull()
    expect(gameReducer(placed, { type: 'PLACE_ITEM', id, to: [3, 1] }).board.items[0].at).toEqual([1, -2])
  })

  it('can be picked up from next to it, not from farther away or with a monster on its tile', () => {
    const { state, hero } = game()
    const { state: placed } = withToken(state, [0, -1])
    expect(treasureInReach(placed, hero)).toBeNull()
    const near = { ...placed, board: { ...placed.board, tokens: { [hero.id]: [0, 0] } } }
    expect(treasureInReach(near, hero)).toBeTruthy()
    const guarded = { ...near, monsters: [{ id: 'm1', name: 'Snake' }], board: { ...near.board, tokens: { ...near.board.tokens, 'm1#1': [3, -3] } } }
    expect(treasureInReach(guarded, hero)).toBeNull()
  })

  it('picking it up draws a treasure card, or a Treasure token in a campaign', () => {
    const { state, hero } = game()
    const { state: placed, id } = withToken(state, [0, -1])
    const picked = gameReducer(placed, { type: 'PICK_UP_TREASURE', id, heroId: hero.id })
    expect(picked.board.items).toEqual([])
    expect(picked.turn.treasureOwed).toBe(hero.id)
    const campaign = gameReducer({ ...placed, campaign: { heroes: [] } }, { type: 'PICK_UP_TREASURE', id, heroId: hero.id })
    expect(campaign.turn.tokenOwed).toBe(hero.id)
  })

  it('waits while another treasure is being handed out', () => {
    const { state, hero } = game()
    const { state: placed, id } = withToken(state, [0, -1])
    const busy = { ...placed, turn: { ...placed.turn, treasureOwed: hero.id } }
    expect(gameReducer(busy, { type: 'PICK_UP_TREASURE', id, heroId: hero.id }).board.items).toHaveLength(1)
  })
})

describe('Flying Carpet on the virtual board', () => {
  const CARPET = { id: 'flying-carpet', name: 'Flying Carpet', type: 'item', text: '', use: 'note' }
  const withCarpet = () => {
    const { state, hero } = game()
    const item = { id: 'i1', cardId: CARPET.id, name: CARPET.name, used: false, card: CARPET }
    const held = { ...state, heroes: state.heroes.map((h) => (h.id === hero.id ? { ...h, items: [item] } : h)) }
    const used = gameReducer(held, { type: 'USE_ITEM', heroId: hero.id, itemId: item.id })
    return { state: used, hero, carpetId: used.board.items[0]?.id }
  }

  it('using it puts the carpet in hand, once, and the card stays face up', () => {
    const { state, hero } = withCarpet()
    expect(state.board.items).toEqual([expect.objectContaining({ kind: 'carpet', at: null })])
    expect(state.heroes.find((h) => h.id === hero.id).items[0].used).toBe(false)
    const again = gameReducer(state, { type: 'USE_ITEM', heroId: hero.id, itemId: 'i1' })
    expect(again.board.items).toHaveLength(1)
  })

  it('the hero standing on it flies it up to 1 tile instead of moving', () => {
    const { state, hero, carpetId } = withCarpet()
    const placed = gameReducer(state, { type: 'PLACE_ITEM', id: carpetId, to: [0, 1] })
    expect(canFlyCarpet(placed, hero)).toBe(true)
    // The room north of the start tile is 1 tile away.
    expect(carpetTargets(placed)).toContain('1,-3')
    const flown = gameReducer(placed, { type: 'FLY_CARPET', to: [1, -3] })
    expect(flown.board.tokens[hero.id]).toEqual([1, -3])
    expect(flown.board.items[0].at).toEqual([1, -3])
    expect(flown.turn.boardMoves).toBe(1)
  })

  it('only a hero on the carpet can fly it', () => {
    const { state, hero, carpetId } = withCarpet()
    const placed = gameReducer(state, { type: 'PLACE_ITEM', id: carpetId, to: [2, 1] })
    expect(canFlyCarpet(placed, hero)).toBe(false)
    expect(gameReducer(placed, { type: 'FLY_CARPET', to: [1, -3] })).toBe(placed)
  })
})
