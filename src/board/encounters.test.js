import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { createHero, gameReducer, initialState } from '../state/game.js'
import { encounterTargetIds, foeOnHeroTile, heroTile } from './encounters.js'
import { normalizeTiles } from './tileDefs.js'

// A made-up start tile with a room north of it and another room north of that.
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

// Three heroes: the first two on the Start tile, the third where we say.
function game(thirdAt, extra = {}) {
  const heroes = HERO_TEMPLATES.slice(0, 3).map((t) => createHero(t))
  let state = gameReducer(initialState, { type: 'START_GAME', heroes, tileRandom: [], boardTiles: TILES })
  const tiles = [...state.board.tiles, { uid: 't1', tileId: 'room', at: [0, -4], turn: 0 }, { uid: 't2', tileId: 'room', at: [0, -8], turn: 0 }]
  const [a, b, c] = state.heroes
  const tokens = { [a.id]: [0, 2], [b.id]: [1, 6], [c.id]: thirdAt, ...extra }
  state = { ...state, firstRoll: null, board: { ...state.board, tiles, tokens } }
  return { state, heroes: state.heroes }
}

describe('encounter targets on the virtual board', () => {
  it('picks every hero on the active hero’s tile', () => {
    const { state, heroes } = game([1, -2])
    expect(encounterTargetIds(state, 'activeTile', heroes[0])).toEqual([heroes[0].id, heroes[1].id])
    expect(encounterTargetIds(state, 'activeTile', heroes[2])).toEqual([heroes[2].id])
  })

  it('picks heroes within 1 tile, not 2', () => {
    const near = game([1, -2])
    expect(encounterTargetIds(near.state, 'within1', near.heroes[0])).toHaveLength(3)
    const { state, heroes } = game([1, -6])
    expect(encounterTargetIds(state, 'within1', heroes[0])).toEqual([heroes[0].id, heroes[1].id])
  })

  it('leaves out a hero in the Astral Refuge', () => {
    const { state, heroes } = game([1, -2])
    const away = { ...state, heroes: state.heroes.map((h, i) => (i === 1 ? { ...h, tokens: { ...h.tokens, refuge: true } } : h)) }
    expect(encounterTargetIds(away, 'activeTile', heroes[0])).toEqual([heroes[0].id])
  })

  it('finds a trap’s tile from its marker, and asks for a trap that moves', () => {
    const { state, heroes } = game([1, -2])
    const tile = heroTile(state, heroes[2].id)
    expect(tile).toBe('t1')
    const dart = { tile, card: { text: 'Trigger the trap during your Villain Phase: Attack each Hero on this tile.' } }
    expect(encounterTargetIds(state, 'trapTile', heroes[0], { trap: dart })).toEqual([heroes[2].id])
    const blades = { tile, card: { text: 'Move the Whirling Blades marker one tile toward the closest Hero, then attack.' } }
    expect(encounterTargetIds(state, 'trapTile', heroes[0], { trap: blades })).toBeNull()
    expect(encounterTargetIds(state, 'trapTile', heroes[0], { trap: { card: dart.card } })).toBeNull()
  })

  it('picks heroes near the villain', () => {
    const { state, heroes } = game([1, -6], { v1: [2, -2] })
    const withVillain = { ...state, villains: [{ id: 'v1', name: 'Gauth' }] }
    expect(encounterTargetIds(withVillain, 'villainWithin1', heroes[0])).toEqual([heroes[0].id, heroes[1].id, heroes[2].id])
  })

  it('asks when there is no board', () => {
    const { state, heroes } = game([1, -2])
    expect(encounterTargetIds({ ...state, board: null }, 'activeTile', heroes[0])).toBeNull()
    expect(foeOnHeroTile({ ...state, board: null }, heroes[0])).toBeNull()
  })

  it('sees a monster figure on the hero’s tile (Frenzied Leap)', () => {
    const { state, heroes } = game([1, -2], { 'm1#2': [2, -3] })
    const withMonster = { ...state, monsters: [{ id: 'm1', name: 'Legion Devil' }] }
    expect(foeOnHeroTile(withMonster, heroes[2])).toBe(true)
    expect(foeOnHeroTile(withMonster, heroes[0])).toBe(false)
  })

  it('saves the tile on a trap marker when the card is resolved', () => {
    const { state, heroes } = game([1, -2])
    const card = { id: 'dart', name: 'Poisoned Dart Trap', type: 'trap', text: '', trap: {} }
    const drawn = { ...state, encounter: { id: 'e1', cardId: 'dart', heroId: heroes[2].id, card, attacked: false } }
    const next = gameReducer(drawn, { type: 'RESOLVE_ENCOUNTER', random: [] })
    expect(next.traps[0].tile).toBe('t1')
  })

  it('puts a monster drawn with no new tile on the closest tile with an unexplored edge (Surrounded!)', () => {
    const { state, heroes } = game([1, -2])
    const cards = [{ id: 'cultist', name: 'Cultist', hp: 1, ac: 14, xp: 1 }]
    const next = gameReducer(state, { type: 'DRAW_MONSTER', heroId: heroes[0].id, cards, random: [] })
    const monster = next.monsters.at(-1)
    const at = next.board.tokens[monster.id]
    expect(at).toBeTruthy()
    // The Start tile's west side is still unexplored, and hero 1 stands on it.
    expect(heroTile({ ...next, board: { ...next.board, tokens: { ...next.board.tokens, x: at } } }, 'x')).toBe('start')
  })

  it('puts Lurker’s Strike’s monster on the active hero’s tile', () => {
    const { state, heroes } = game([1, -2])
    const card = { id: 'lurker', name: "Lurker's Strike", type: 'event', text: "Attack the active Hero.\nDraw a Monster Card and place its figure on the active Hero's tile." }
    const moved = { ...state, board: { ...state.board, tokens: { ...state.board.tokens, [heroes[0].id]: [1, -6] } } }
    const drawing = { ...moved, encounter: { id: 'e1', cardId: 'lurker', heroId: heroes[0].id, card, attacked: true } }
    const next = gameReducer(drawing, { type: 'DRAW_MONSTER', heroId: heroes[0].id, cards: [{ id: 'cultist', name: 'Cultist', hp: 1, ac: 14, xp: 1 }], random: [] })
    const at = next.board.tokens[next.monsters.at(-1).id]
    expect(heroTile({ ...next, board: { ...next.board, tokens: { ...next.board.tokens, x: at } } }, 'x')).toBe('t2')
  })
})
