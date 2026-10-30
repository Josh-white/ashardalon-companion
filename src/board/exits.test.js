import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { normalizeCardFile } from '../data/cards.js'
import { createHero, gameReducer, initialState } from '../state/game.js'
import { escapeHold, everyoneEscapes, exitName, exitSquares } from './exits.js'
import { layChamber, layExit, layTile, placeToken } from './play.js'
import { key } from './grid.js'
import { normalizeTiles } from './tileDefs.js'

const room = (id, name, kind, extra = {}) => ({ id, name, kind, triangle: 'black', rows: ['....', '.S..', '....', '....'], exits: { N: 'oooo', S: 'oooo', W: 'oooo', E: 'oooo' }, ...extra })
const TILES = normalizeTiles(
  [
    { id: 'start', name: 'Start', kind: 'start', rows: ['...#', '...#', '...#', '...#', '...#', '...#', '...#', '...#'], exits: { N: 'ooox', S: 'ooox', W: 'oooooooo', E: 'xxxxxxxx' }, features: [{ type: 'stairs', at: [[1, 3], [2, 3], [1, 4], [2, 4]] }] },
    room('tile-01', 'Tile 1', 'regular'),
    room('dire-chamber-entrance', 'Dire Chamber Entrance', 'chamber', { triangle: 'red' }),
    ...[1, 2, 3, 4].map((n) => room(`dire-chamber-${n}`, 'Dire Chamber', 'chamber', { triangle: 'white' })),
    { id: 'tunnel-exit', name: 'Tunnel Exit', kind: 'special', triangle: 'black', rows: ['####', '#..#', '#..#', '#S.#'], exits: { N: 'xxxx', S: 'xoox', W: 'xxxx', E: 'xxxx' }, features: [{ type: 'stairs', at: [[1, 1], [2, 1], [1, 2], [2, 2]] }] },
    { id: 'secure-exit', name: 'Secure Exit', kind: 'special', triangle: 'white', rows: ['####', '#..#', '#..#', '#.S#'], exits: { N: 'xxxx', S: 'xoox', W: 'xxxx', E: 'xxxx' }, features: [{ type: 'ladder', at: [[2, 1]] }] },
  ],
  [],
)

const adventure = (victory, extra = {}) =>
  normalizeCardFile({ powers: [], adventures: [{ id: 'adv', title: 'Test', goal: 'Get out.', setup: ['Place the Start tile on the table.'], rules: [{ name: 'Victory', text: victory }], win: { escape: true }, ...extra }] }).adventures[0]
const ONE_OUT = adventure('Your Hero escapes from the dungeon by ending his or her Hero Phase on the stairs on the Tunnel Exit tile.')
const ALL_OUT = adventure('All Heroes escape through the Tunnel Exit (each ends his or her Hero Phase on the stairs on the Tunnel Exit tile).')
const LADDER = adventure('Escape through the Secure Exit tile (a Hero ends his or her Hero Phase on the ladder on the Secure Exit tile).')
const CARRY = adventure('Find the Treasure token and escape the dungeon with the item: a Hero carrying it ends his or her Hero Phase on the stairs on the Start tile or on the Tunnel Exit tile.', {
  win: { escape: true, tokens: ['stolen treasure'] },
})

const start = (card, count = 1) => {
  const heroes = HERO_TEMPLATES.slice(0, count).map((t) => createHero(t))
  const lobby = { ...initialState, lobbyAdventure: card }
  return { ...gameReducer(lobby, { type: 'START_GAME', heroes, tileRandom: [], boardTiles: TILES }), firstRoll: null }
}

// The board with the exit laid next to a Dire Chamber, as the chamber adventures do it.
const withExit = (card, name = 'Tunnel Exit', count = 1) => {
  let state = start(card, count)
  state = layTile(state, 'Dire Chamber Entrance', 'explore').state
  state = layChamber(state, 'dire', [])
  return layExit(state, name)
}

const onSquare = (state, heroId, k) => placeToken(state, heroId, k.split(',').map(Number))
const endHeroPhase = (state) => gameReducer(state, { type: 'NEXT_PHASE', roll: 10 })

describe('escaping on the virtual board', () => {
  it('the Tunnel Exit stairs are the way out', () => {
    const state = withExit(ONE_OUT)
    const exits = exitSquares(state)
    expect(exits.size).toBe(4)
    expect(exitName(state)).toBe('stairs')
    // The Start tile's stairs don't count here.
    const startStairs = [[1, 3], [2, 3]].map(key)
    for (const k of startStairs) expect(exits.has(k)).toBe(false)
  })

  it('ending the Hero Phase on the stairs wins; anywhere else it does not', () => {
    let state = withExit(ONE_OUT)
    const hero = state.heroes[0]
    expect(escapeHold(state, hero)).toBe('not-on-exit')
    const stayed = endHeroPhase(state)
    expect(stayed.adventure.escaped).toBe(false)
    state = onSquare(state, hero.id, [...exitSquares(state)][0])
    expect(escapeHold(state, state.heroes[0])).toBe('')
    const out = endHeroPhase(state)
    expect(out.adventure.escaped).toBe(true)
    expect(out.status).toBe('won')
  })

  it('the Secure Exit has a ladder, one square', () => {
    const state = withExit(LADDER, 'Secure Exit')
    expect(exitSquares(state).size).toBe(1)
    expect(exitName(state)).toBe('ladder')
  })

  it('Sneaky Endeavor: the Start tile stairs count too, but only with the stolen treasure', () => {
    let state = start(CARRY)
    const hero = state.heroes[0]
    expect(exitSquares(state).size).toBe(4)
    state = onSquare(state, hero.id, [...exitSquares(state)][0])
    expect(escapeHold(state, state.heroes[0])).toBe('goals')
    state = { ...state, adventure: { ...state.adventure, tokens: [{ name: 'Stolen Treasure', heldBy: hero.id, ask: '', drawTreasure: false }] } }
    expect(escapeHold(state, state.heroes[0])).toBe('')
    expect(endHeroPhase(state).adventure.escaped).toBe(true)
  })

  it('The Vast Gate Opens: each hero who gets out leaves the board and skips their turns', () => {
    let state = withExit(ALL_OUT, 'Tunnel Exit', 2)
    expect(everyoneEscapes(state)).toBe(true)
    const [a, b] = state.heroes
    const [first, second] = [...exitSquares(state)]
    state = onSquare(state, a.id, first)
    state = endHeroPhase(state)
    expect(state.adventure.escaped).toBe(false)
    expect(state.heroes[0].escaped).toBe(true)
    expect(state.board.tokens[a.id]).toBeUndefined()
    // The rest of the turn, then the other hero's.
    while (state.turn.heroIndex === 0) state = gameReducer(state, { type: 'NEXT_PHASE', roll: 10 })
    expect(state.turn.heroIndex).toBe(1)
    state = onSquare(state, b.id, second)
    state = endHeroPhase(state)
    expect(state.adventure.escaped).toBe(true)
    expect(state.status).toBe('won')
  })
})
