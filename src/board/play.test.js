import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { createHero, gameReducer, initialState } from '../state/game.js'
import { PHASES } from '../data/phases.js'
import { normalizeCardFile } from '../data/cards.js'
import * as play from './play.js'
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
const { monsters, encounters } = normalizeCardFile({
  powers: [],
  encounters: [{ id: 'leap', name: 'Time Leap', type: 'curse', drawMonster: true, curse: { removeAtTurnStart: true } }],
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

  it("knows whether the active hero has moved this Hero Phase (Dwarven Hammer)", () => {
    let state = start()
    const h = hero(state)
    expect(play.stayedOnBoard(state, h)).toBe(true)
    // Not the other hero's Hero Phase: the players answer that themselves.
    expect(play.stayedOnBoard(state, hero(state, 1))).toBeNull()
    state = gameReducer(state, { type: 'MOVE_HERO', heroId: h.id, to: [0, 4] })
    expect(play.stayedOnBoard(state, hero(state))).toBe(false)
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
    // A monster that turns up later this turn, with no new tile for it, still goes on the board.
    state = gameReducer(state, { type: 'DRAW_MONSTER', heroId: hero(state, 1).id, cards: monsters, random: [] })
    expect(state.board.tokens[state.monsters[1].id]).toBeTruthy()
  })

  it('takes a hero off the board in a Time Leap, with the monster on their square, until their next turn', () => {
    let state = start()
    const h = hero(state)
    const was = at(state, h.id)
    state = { ...state, turn: { ...state.turn, phase: PHASES.findIndex((p) => p.key === 'villain') } }
    state = gameReducer(state, { type: 'DRAW_ENCOUNTER', heroId: h.id, cards: encounters, random: [] })
    state = gameReducer(state, { type: 'DRAW_MONSTER', heroId: h.id, cards: monsters, random: [] })
    const rat = state.monsters[0]
    expect(at(state, rat.id)).toEqual(was)
    expect(at(state, h.id)).toBeUndefined()
    state = gameReducer(state, { type: 'RESOLVE_ENCOUNTER', random: [], monsterCards: monsters })
    expect(at(state, h.id)).toBeUndefined()
    // Placing the hero by hand before the curse ends doesn't stick.
    expect(at(gameReducer(state, { type: 'MOVE_TOKEN', id: h.id, to: [2, 7] }), h.id)).toBeUndefined()
    while (state.turn.heroIndex === 0) state = gameReducer(state, { type: 'NEXT_PHASE' })
    expect(at(state, h.id)).toBeUndefined()
    while (state.turn.heroIndex !== 0) state = gameReducer(state, { type: 'NEXT_PHASE' })
    expect(hero(state).curses).toHaveLength(0)
    state = gameReducer(state, { type: 'MOVE_TOKEN', id: h.id, to: [2, 7] })
    expect(at(state, h.id)).toEqual([2, 7])
  })

  it('turns a tile laid on a west edge so its triangle faces the hero', () => {
    let state = start()
    state = { ...state, board: { ...state.board, pile: ['room'] }, turn: { ...state.turn, phase: PHASES.findIndex((p) => p.key === 'exploration') } }
    const west = heroEdges(state)
    expect(west.map((e) => e.side)).toEqual(['W'])
    state = gameReducer(state, { type: 'SET_EXPLORED', explored: true, cards: monsters, random: [] })
    expect(state.board.tiles[1]).toEqual({ uid: 't1', tileId: 'room', at: [-4, 0], turn: 270 })
  })

  it('lets a power move a hero on the same tile a few squares (Righteous Advance)', () => {
    let state = start()
    const [quinn, other] = state.heroes
    state = { ...state, turn: { ...state.turn, boardMove: { heroId: quinn.id, source: 'Righteous Advance', steps: [{ pick: 'heroOnTile', to: 'squares', n: 2 }] } } }
    expect(gameReducer(state, { type: 'BOARD_MOVE', id: other.id, to: [1, 6] })).toBe(state)
    state = gameReducer(state, { type: 'BOARD_MOVE', id: other.id, to: [1, 0] })
    expect(at(state, other.id)).toEqual([1, 0])
    expect(state.turn.boardMove).toBeNull()
  })

  it('lays a chamber on the Entrance\'s open edges and spreads its monsters over them', () => {
    const chamberTiles = normalizeTiles(
      [
        { id: 'dire-chamber-entrance', name: 'Dire Chamber Entrance', kind: 'chamber', triangle: 'red', rows: ['....', '....', '..S.', '#..#'], exits: { N: 'oooo', S: 'xoox', W: 'ooox', E: 'ooox' } },
        ...[1, 2, 3, 4].map((n) => ({ id: `dire-chamber-${n}`, name: 'Dire Chamber', kind: 'chamber', triangle: 'white', rows: ['####', '..S.', '....', '....'], exits: { N: 'xxxx', S: 'oooo', W: 'xooo', E: 'xooo' } })),
      ],
      [],
    )
    let state = start()
    state = { ...state, board: { ...state.board, defs: { ...state.board.defs, ...Object.fromEntries(chamberTiles.map((t) => [t.id, t])) } } }
    state = { ...state, turn: { ...state.turn, phase: PHASES.findIndex((p) => p.key === 'exploration') } }
    // The Entrance goes north of the Start tile, as a hero explores there.
    state = gameReducer(state, { type: 'MOVE_TOKEN', id: hero(state).id, to: [0, 0] })
    const { layTile, layChamber, placeNewFigures } = play
    const north = heroEdges(state).find((e) => e.side === 'N')
    state = layTile(state, 'Dire Chamber Entrance', 'explore', north.id).state
    const laid = layChamber(state, 'dire', [])
    // The Entrance has three open edges, so three chamber tiles.
    expect(laid.board.tiles).toHaveLength(5)
    const monsters = [1, 2, 3].map((n) => ({ id: `c${n}`, name: 'Rat', hp: 1, maxHp: 1, ac: 12, xp: 1, ownerId: null, conditions: [], chamber: true, card: { hp: 1, figures: 1, attacks: [], tactics: [] } }))
    const filled = placeNewFigures(laid, { ...laid, monsters })
    const grid = play.boardGrid(filled.board)
    const tilesOf = monsters.map((m) => grid.get(filled.board.tokens[m.id].join(',')).tile)
    expect(new Set(tilesOf).size).toBe(3)
    expect(tilesOf).not.toContain(laid.turn.boardTiles[0].uid)
  })
})


describe('the party on the virtual board', () => {
  it('starts from the lobby with every ready hero on the Start tile', () => {
    let state = gameReducer(initialState, { type: 'SET_LOBBY_BOARD', on: true })
    expect(state.lobbyBoard).toBe(true)
    for (const [deviceId, heroKey, player] of [['a', 'fighter', 'Dad'], ['b', 'rogue', 'Colton']]) {
      state = gameReducer(state, { type: 'CLAIM_HERO', deviceId, heroKey, picks: [] })
      state = gameReducer(state, { type: 'SET_LOBBY_PLAYER', deviceId, player })
      state = gameReducer(state, { type: 'SET_LOBBY_READY', deviceId, ready: true })
    }
    state = gameReducer(state, { type: 'START_GAME', tileRandom: [], boardTiles: TILES })
    expect(state.status).toBe('playing')
    expect(state.heroes).toHaveLength(2)
    for (const h of state.heroes) expect(at(state, h.id)).toBeTruthy()
  })

  it('only changes the board choice in the lobby', () => {
    const playing = start()
    expect(gameReducer(playing, { type: 'SET_LOBBY_BOARD', on: false })).toBe(playing)
  })
})
