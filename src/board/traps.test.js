import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { createHero, gameReducer, initialState } from '../state/game.js'
import { encounterTargetIds } from './encounters.js'
import { boardMarkers, markerOnHeroTile } from './markers.js'
import { normalizeTiles } from './tileDefs.js'
import { heroesOnTrap, trapStepChoices } from './traps.js'

// A made-up start tile (two tiles by the rules: 'start' on top, 'start/2' below) with
// rooms north of it (t1, then t2) and one south of it (t3).
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

const TEXT = {
  'rolling-boulder': 'Trigger the trap during your Villain Phase: Move the Rolling Boulder marker one tile toward the closest Hero. Each Hero on the new tile takes 2 damage.',
  'whirling-blades': 'Trigger the trap during your Villain Phase: Move the Whirling Blades marker one tile toward the closest Hero, then attack each Hero on that tile.',
  'lava-flow': 'Trigger the Trap during your Villain Phase: Place one Lava Flow marker on any tile adjacent to a tile with a Lava Flow marker, if possible.',
}
const trap = (cardId, extra) => ({ id: cardId, cardId, name: cardId, type: 'trap', ownerId: 'x', card: { text: TEXT[cardId], trap: { damage: 2, attack: cardId === 'whirling-blades' ? { bonus: 8, damage: 2, targets: 'trapTile' } : undefined } }, ...extra })

// Heroes at the given squares.
function game(traps, ...squares) {
  const heroes = HERO_TEMPLATES.slice(0, squares.length).map((t) => createHero(t))
  const state = gameReducer(initialState, { type: 'START_GAME', heroes, tileRandom: [], boardTiles: TILES })
  const tiles = [...state.board.tiles, { uid: 't1', tileId: 'room', at: [0, -4], turn: 0 }, { uid: 't2', tileId: 'room', at: [0, -8], turn: 0 }, { uid: 't3', tileId: 'room', at: [0, 8], turn: 0 }]
  const tokens = Object.fromEntries(state.heroes.map((h, i) => [h.id, squares[i]]))
  return { ...state, firstRoll: null, board: { ...state.board, tiles, tokens }, traps }
}
const step = (state, extra) => gameReducer(state, { type: 'TRAP_STEP', ...extra })

describe('Rolling Boulder and Whirling Blades on the board', () => {
  it('moves one tile toward the closest hero and hits who is there', () => {
    const state = game([trap('rolling-boulder', { tile: 't2', tracked: true })], [0, 5])
    expect(trapStepChoices(state, state.traps[0]).tiles).toEqual(['t1'])
    const next = step(state, { trapId: 'rolling-boulder' })
    expect(next.traps[0].tile).toBe('t1')
    expect(heroesOnTrap(next, next.traps[0])).toEqual([])
    const again = step({ ...next, turn: { ...next.turn, trapSteps: [] } }, { trapId: 'rolling-boulder' })
    expect(again.traps[0].tile).toBe('start')
    expect(boardMarkers(again)[0].squares).toHaveLength(16)
  })

  it("stays put on a hero's tile and only moves once a turn", () => {
    const state = game([trap('rolling-boulder', { tile: 't1', tracked: true })], [0, -3])
    const next = step(state, { trapId: 'rolling-boulder' })
    expect(next.traps[0].tile).toBe('t1')
    expect(next.turn.trapSteps).toEqual(['rolling-boulder'])
    expect(heroesOnTrap(next, next.traps[0])).toEqual([next.heroes[0].id])
    expect(step({ ...next, traps: [{ ...next.traps[0], tile: 't2' }] }, { trapId: 'rolling-boulder' }).traps[0].tile).toBe('t2')
  })

  it('asks which way when two heroes are just as close the other way', () => {
    const state = game([trap('rolling-boulder', { tile: 'start', tracked: true })], [0, -8], [0, 9])
    // t2 is two tiles north; t3 is two tiles south (through start/2).
    const asked = step(state, { trapId: 'rolling-boulder' })
    expect(asked.turn.trapPick).toEqual({ trapId: 'rolling-boulder', tiles: expect.arrayContaining(['t1', 'start/2']) })
    expect(step(asked, { trapId: 'rolling-boulder', tile: 't3' }).traps[0].tile).toBe('start')
    const moved = step(asked, { trapId: 'rolling-boulder', tile: 'start/2' })
    expect(moved.traps[0].tile).toBe('start/2')
    expect(moved.turn.trapPick).toBeUndefined()
  })

  it('moves a boulder saved without the tracked flag from its tile (drawn before the 2026-11-01 fix)', () => {
    const state = game([trap('rolling-boulder', { tile: 't2' })], [0, 5])
    expect(trapStepChoices(state, state.traps[0]).tiles).toEqual(['t1'])
    expect(step(state, { trapId: 'rolling-boulder' }).traps[0].tile).toBe('t1')
  })

  it('leaves a moving trap with no saved tile where nobody knows', () => {
    const state = game([trap('rolling-boulder')], [0, 5])
    expect(trapStepChoices(state, state.traps[0])).toBeNull()
    expect(step(state, { trapId: 'rolling-boulder' })).toBe(state)
  })

  it('Whirling Blades attacks the heroes on its new tile, once it has moved', () => {
    const state = game([trap('whirling-blades', { tile: 't2', tracked: true })], [0, -3])
    const hero = state.heroes[0]
    expect(encounterTargetIds(state, 'trapTile', hero, { trap: state.traps[0] })).toBeNull()
    const next = step(state, { trapId: 'whirling-blades' })
    expect(encounterTargetIds(next, 'trapTile', hero, { trap: next.traps[0] })).toEqual([hero.id])
  })
})

describe('Lava Flow spreading on the board', () => {
  it('spreads to a tile next to the lava, picked by the players, and burns heroes on any lava tile', () => {
    const state = game([trap('lava-flow', { tile: 't1', tiles: ['t1'] })], [0, 1], [0, -7])
    expect(trapStepChoices(state, state.traps[0]).tiles.sort()).toEqual(['start', 't2'])
    const asked = step(state, { trapId: 'lava-flow' })
    expect(asked.turn.trapPick.tiles.sort()).toEqual(['start', 't2'])
    const spread = step(asked, { trapId: 'lava-flow', tile: 'start' })
    expect(spread.traps[0].tiles).toEqual(['t1', 'start'])
    expect(heroesOnTrap(spread, spread.traps[0])).toEqual([spread.heroes[0].id])
    expect(boardMarkers(spread)[0].squares).toHaveLength(32)
    expect(markerOnHeroTile(spread, spread.heroes[0])).toBe(spread.traps[0])
    expect(markerOnHeroTile(spread, spread.heroes[1])).toBe(false)
  })

  it('has nowhere to go once every joined tile has lava', () => {
    const state = game([trap('lava-flow', { tile: 't1', tiles: ['t1', 't2', 'start', 'start/2', 't3'] })], [0, 1])
    const next = step(state, { trapId: 'lava-flow' })
    expect(next.traps[0].tiles).toHaveLength(5)
    expect(next.turn.trapSteps).toEqual(['lava-flow'])
  })

  it('goes away entirely when disabled', () => {
    const state = game([trap('lava-flow', { tile: 't1', tiles: ['t1', 'start'], card: { text: TEXT['lava-flow'], trap: { damage: 1, disable: 10 } } })], [0, 1])
    const next = gameReducer({ ...state, status: 'playing' }, { type: 'DISABLE_TRAP', trapId: 'lava-flow', heroId: state.heroes[0].id, roll: 20, free: true })
    expect(next.traps).toEqual([])
  })
})
