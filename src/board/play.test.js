import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { createHero, gameReducer, initialState } from '../state/game.js'
import { PHASES } from '../data/phases.js'
import { normalizeCardFile } from '../data/cards.js'
import { heroEdges, heroReach, movesLeft } from './play.js'
import { normalizeTiles } from './tileDefs.js'

// A made-up Start tile: 3 floor columns and a wall column, stairs in the middle.
const TILES = normalizeTiles(
  [
    {
      id: 'start', kind: 'start', rows: ['...#', '...#', '...#', '...#', '...#', '...#', '...#', '...#'],
      exits: { N: 'ooox', S: 'ooox', W: 'oooooooo', E: 'xxxxxxxx' },
      features: [{ type: 'stairs', at: [[1, 3], [2, 3], [1, 4], [2, 4]] }],
    },
    { id: 'hall', name: 'Long Hallway', kind: 'regular', triangle: 'white', rows: ['#..#', '#..#', '#..#', '#..#'], exits: { N: 'xoox', S: 'xoox', W: 'xxxx', E: 'xxxx' } },
    { id: 'room', name: 'Room', kind: 'regular', triangle: 'black', rows: ['....', '.S..', '....', '....'], exits: { N: 'oooo', S: 'oooo', W: 'oooo', E: 'oooo' } },
  ],
  [],
)
const { monsters } = normalizeCardFile({
  powers: [],
  monsters: [{ id: 'rat', name: 'Rat', copies: 3, ac: 12, hp: 1, xp: 1, figures: 2, attacks: [{ id: 'bite', name: 'Bite', bonus: 5, damage: 1 }], tactics: [{ move: 'toward' }] }],
})

const start = (count = 2) => {
  const heroes = HERO_TEMPLATES.slice(0, count).map((t) => createHero(t))
  const state = gameReducer(initialState, { type: 'START_GAME', heroes, tileRandom: [], boardTiles: TILES })
  return { ...state, firstRoll: null }
}
const hero = (state, i = 0) => state.heroes[i]
const at = (state, id) => state.board.tokens[id]

describe('solo game on the virtual board', () => {
  it('starts on the Start tile with the heroes next to the stairs', () => {
    const state = start()
    expect(state.board.tiles).toEqual([{ uid: 'start', tileId: 'start', at: [0, 0], turn: 0 }])
    expect(at(state, hero(state).id)).toEqual([0, 2])
    expect(at(state, hero(state, 1).id)).toEqual([1, 2])
    expect(gameReducer(initialState, { type: 'START_GAME', heroes: [createHero(HERO_TEMPLATES[0])], tileRandom: [] }).board).toBeNull()
  })

  it('moves the active hero up to its speed, twice a turn', () => {
    let state = start()
    const h = hero(state)
    expect(movesLeft(state, h)).toBe(2)
    // The other hero's square is taken; the far end of the tile is too far.
    const reach = heroReach(state, h)
    expect(reach).not.toContain('1,2')
    expect(reach).toContain('0,7')
    state = gameReducer(state, { type: 'MOVE_HERO', heroId: h.id, to: [0, 7] })
    expect(at(state, h.id)).toEqual([0, 7])
    expect(movesLeft(state, hero(state))).toBe(1)
    // Too far, and not the active hero: nothing happens.
    expect(gameReducer(state, { type: 'MOVE_HERO', heroId: h.id, to: [2, 0] })).toBe(state)
    expect(gameReducer(state, { type: 'MOVE_HERO', heroId: hero(state, 1).id, to: [2, 0] })).toBe(state)
    state = gameReducer(state, { type: 'MOVE_HERO', heroId: h.id, to: [2, 2] })
    expect(movesLeft(state, hero(state))).toBe(0)
    expect(gameReducer(state, { type: 'MOVE_HERO', heroId: h.id, to: [2, 1] })).toBe(state)
  })

  it('counts an attack as an action, and Dazed or Immobilized heroes move less', () => {
    const state = start()
    const attacked = { ...state, turn: { ...state.turn, lastAttack: { heroId: hero(state).id } } }
    expect(movesLeft(attacked, hero(state))).toBe(1)
    const dazed = { ...state, heroes: [{ ...hero(state), conditions: ['Dazed'] }, hero(state, 1)] }
    expect(movesLeft(dazed, hero(dazed))).toBe(1)
    const stuck = { ...state, heroes: [{ ...hero(state), conditions: ['Immobilized'] }, hero(state, 1)] }
    expect(heroReach(stuck, hero(stuck))).toEqual([])
    const slowed = { ...state, heroes: [{ ...hero(state), conditions: ['Slowed'] }, hero(state, 1)] }
    expect(heroReach(slowed, hero(slowed))).not.toContain('0,5')
    expect(heroReach(slowed, hero(slowed))).toContain('0,4')
  })

  it('moves any figure by hand onto a free floor square', () => {
    let state = start()
    const other = hero(state, 1)
    expect(gameReducer(state, { type: 'MOVE_TOKEN', id: other.id, to: [3, 0] })).toBe(state)
    expect(gameReducer(state, { type: 'MOVE_TOKEN', id: other.id, to: [0, 2] })).toBe(state)
    state = gameReducer(state, { type: 'MOVE_TOKEN', id: other.id, to: [2, 7] })
    expect(at(state, other.id)).toEqual([2, 7])
    expect(state.turn.boardMoves).toBeUndefined()
  })

  it('takes a defeated monster off the board', () => {
    let state = start()
    state = gameReducer(state, { type: 'ADD_MONSTER', name: 'Snake', hp: 1, ac: 10, xp: 1, ownerId: hero(state).id })
    const monster = state.monsters[0]
    state = gameReducer(state, { type: 'MOVE_TOKEN', id: monster.id, to: [1, 0] })
    expect(at(state, monster.id)).toEqual([1, 0])
    // Heroes can't walk through it.
    expect(heroReach(state, hero(state))).not.toContain('1,0')
    state = gameReducer(state, { type: 'REMOVE_MONSTER', monsterId: monster.id })
    expect(state.board.tokens[monster.id]).toBeUndefined()
  })

  it('lays the drawn tile on the edge the hero explores, and its monster on the scorch mark', () => {
    let state = start()
    const h = hero(state)
    state = gameReducer(state, { type: 'MOVE_TOKEN', id: h.id, to: [0, 0] })
    state = { ...state, turn: { ...state.turn, phase: PHASES.findIndex((p) => p.key === 'exploration') } }
    // A corner square touches two unexplored edges.
    expect(heroEdges(state).map((e) => e.side).sort()).toEqual(['N', 'W'])
    const north = heroEdges(state).find((e) => e.side === 'N')
    state = gameReducer(state, { type: 'SET_EXPLORED', explored: true, edge: north.id, cards: monsters, random: [] })
    // The pile's first tile is a long hallway, so the next one goes at its far end.
    expect(state.board.tiles.slice(1)).toEqual([
      { uid: 't1', tileId: 'hall', at: [0, -4], turn: 0 },
      { uid: 't2', tileId: 'room', at: [0, -8], turn: 0 },
    ])
    expect(state.turn.tiles).toMatchObject({ explore: '', 'hallway-1': '' })
    expect(state.board.pile).toEqual([])
    expect(state.turn.triangle).toBe(true)
    state = gameReducer(state, { type: 'DRAW_MONSTER', heroId: h.id, cards: monsters, random: [] })
    const rat = state.monsters[0]
    expect(at(state, rat.id)).toEqual([1, -7])
    // Monsters that turn up later this turn stay off the board for the player to place.
    state = gameReducer(state, { type: 'DRAW_MONSTER', heroId: hero(state, 1).id, cards: monsters, random: [] })
    expect(state.board.tokens[state.monsters[1].id]).toBeUndefined()
  })

  it('turns a tile laid on a west edge so its triangle faces the hero', () => {
    let state = start()
    state = { ...state, board: { ...state.board, pile: ['room'] }, turn: { ...state.turn, phase: PHASES.findIndex((p) => p.key === 'exploration') } }
    const west = heroEdges(state)
    expect(west.map((e) => e.side)).toEqual(['W'])
    state = gameReducer(state, { type: 'SET_EXPLORED', explored: true, cards: monsters, random: [] })
    expect(state.board.tiles[1]).toEqual({ uid: 't1', tileId: 'room', at: [-4, 0], turn: 270 })
  })
})
