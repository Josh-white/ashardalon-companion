import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { createHero, gameReducer, initialState } from '../state/game.js'
import { boardAnswer, guardsOnTile, liveAc, tileShieldNow } from './checks.js'
import { heroAc } from '../data/powerEffects.js'
import { acParts } from '../data/statParts.js'
import { normalizeTiles } from './tileDefs.js'

// A made-up start tile (its east column solid) with a room north of it and another north of that.
const TILES = normalizeTiles(
  [
    {
      id: 'start', kind: 'start', rows: ['...#', '...#', '...#', '...#', '...#', '...#', '...#', '...#'],
      exits: { N: 'ooox', S: 'ooox', W: 'oooooooo', E: 'xxxxxxxx' },
      features: [{ type: 'stairs', at: [[1, 3], [2, 3], [1, 4], [2, 4]] }],
    },
    { id: 'room', name: 'Dire Chamber (start)', kind: 'regular', triangle: 'black', rows: ['....', '.S..', '....', '....'], exits: { N: 'oooo', S: 'oooo', W: 'oooo', E: 'oooo' } },
  ],
  [],
)

// Three heroes: the first two on the Start tile's north half, the third where we say.
function game(thirdAt, extra = {}) {
  const heroes = HERO_TEMPLATES.slice(0, 3).map((t) => createHero(t))
  let state = gameReducer(initialState, { type: 'START_GAME', heroes, tileRandom: [], boardTiles: TILES })
  const tiles = [...state.board.tiles, { uid: 't1', tileId: 'room', at: [0, -4], turn: 0 }, { uid: 't2', tileId: 'room', at: [0, -8], turn: 0 }]
  const [a, b, c] = state.heroes
  const tokens = { [a.id]: [0, 2], [b.id]: [1, 1], [c.id]: thirdAt, ...extra }
  state = { ...state, firstRoll: null, board: { ...state.board, tiles, tokens } }
  return { state, heroes: state.heroes }
}

describe('board answers to end-of-phase questions', () => {
  it('sees another hero on the tile (Hidden Snipers)', () => {
    const { state, heroes } = game([1, -2])
    expect(boardAnswer(state, `Is another hero on ${heroes[0].name}'s tile?`)).toMatchObject({ answer: true })
    expect(boardAnswer(state, `Is another hero on ${heroes[2].name}'s tile?`)).toMatchObject({ answer: false })
  })

  it('counts the Start tile as two tiles', () => {
    const { state, heroes } = game([1, 6])
    const apart = { ...state, board: { ...state.board, tokens: { ...state.board.tokens, [heroes[1].id]: [1, 5] } } }
    expect(boardAnswer(apart, `Is another hero on ${heroes[2].name}'s tile?`)).toMatchObject({ answer: true })
    expect(boardAnswer(apart, `Is another hero on ${heroes[0].name}'s tile?`)).toMatchObject({ answer: false })
  })

  it('doesn’t count a hero off in the Astral Refuge', () => {
    const { state, heroes } = game([1, -2])
    const away = { ...state, heroes: state.heroes.map((h, i) => (i === 1 ? { ...h, tokens: { ...h.tokens, refuge: true } } : h)) }
    expect(boardAnswer(away, `Is another hero on ${heroes[0].name}'s tile?`)).toMatchObject({ answer: false })
  })

  it('knows when a hero is next to a wall (Walls of Magma)', () => {
    const { state, heroes } = game([1, -2])
    const ask = (at) => boardAnswer({ ...state, board: { ...state.board, tokens: { ...state.board.tokens, [heroes[0].id]: at } } }, `Is ${heroes[0].name} next to a wall?`)
    expect(ask([2, 2])).toMatchObject({ answer: true }) // beside the solid column
    expect(ask([2, 0])).toMatchObject({ answer: true }) // also beside the solid column
    expect(ask([2, -1])).toMatchObject({ answer: false }) // only a corner touches the solid column
    expect(ask([1, 2])).toMatchObject({ answer: false })
    expect(ask([0, 2])).toMatchObject({ answer: false }) // an unexplored edge isn't a wall
    expect(ask([1, 7])).toMatchObject({ answer: false }) // the south edge is open
    expect(ask([2, 7])).toMatchObject({ answer: true }) // corner by the solid column
  })

  it('finds a monster on a named tile (The Vast Gate)', () => {
    const question = 'Is there a monster on the Dire Chamber Start tile? (If not, one comes out of the Vast Gate: put it next to the gate.)'
    const { state } = game([1, -2], { 'm1#2': [2, -6], gate: [1, -3] })
    const monsters = [{ id: 'm1', name: 'Legion Devil' }, { id: 'gate', name: 'Vast Gate', objective: true }]
    expect(boardAnswer({ ...state, monsters }, question)).toMatchObject({ answer: true })
    const empty = { ...state, monsters, board: { ...state.board, tokens: { ...state.board.tokens, 'm1#2': [1, 1] } } }
    expect(boardAnswer(empty, question)).toMatchObject({ answer: false })
  })

  it('answers villager questions', () => {
    const { state } = game([1, -6], { alek: [2, -2], m1: [2, 2] })
    const withAlek = { ...state, villagers: [{ id: 'alek', name: 'Alek' }], monsters: [{ id: 'm1', name: 'Cultist' }] }
    expect(boardAnswer(withAlek, 'Is Alek within 1 tile of a hero?')).toMatchObject({ answer: true })
    expect(boardAnswer(withAlek, 'Is Alek within 1 tile of a monster?')).toMatchObject({ answer: true })
    expect(boardAnswer(withAlek, 'Is Alek next to a monster?')).toMatchObject({ answer: false })
    expect(boardAnswer(withAlek, 'Is Alek on a tile with an unexplored edge?')).toMatchObject({ answer: true })
  })

  it('asks when the board can’t tell', () => {
    const { state, heroes } = game([1, -2])
    expect(boardAnswer(state, `Did ${heroes[1].name} move during this Hero Phase?`)).toBeNull()
    expect(boardAnswer({ ...state, board: null }, `Is another hero on ${heroes[0].name}'s tile?`)).toBeNull()
    expect(boardAnswer(state, 'Is another hero on Nobody’s tile?')).toBeNull()
  })
})

describe('Blessed Shield on the virtual board', () => {
  it('finds the shield owner on the same tile', () => {
    const { state, heroes } = game([1, -2])
    expect(guardsOnTile(state, heroes[0], [heroes[1]])).toEqual([heroes[1]])
    expect(guardsOnTile(state, heroes[2], [heroes[1]])).toEqual([])
    expect(guardsOnTile({ ...state, board: null }, heroes[0], [heroes[1]])).toBeNull()
  })

  // The second hero carries a +2 Blessed Shield; the third starts on another tile.
  const shielded = (thirdAt) => {
    const { state } = game(thirdAt)
    const shield = { id: 'bs', cardId: 'blessed-shield', name: 'Blessed Shield', used: false, card: { inPlay: true, tileAcBonus: 2 } }
    const heroes = state.heroes.map((h, i) => (i === 1 ? { ...h, items: [shield] } : h))
    return { state: { ...state, heroes }, heroes }
  }
  const move = (state, id, to) => gameReducer(state, { type: 'MOVE_TOKEN', id, to })

  it('raises AC the moment a hero steps onto the owner’s tile, and drops it on stepping off', () => {
    const { state, heroes } = shielded([0, -4])
    const [, owner, walker] = heroes
    expect(tileShieldNow(state, walker)).toMatchObject({ bonus: 0, guards: [] })
    expect(liveAc(state, walker)).toBe(heroAc(walker))
    const onTile = move(state, walker.id, [2, 1])
    expect(tileShieldNow(onTile, walker)).toMatchObject({ bonus: 2 })
    expect(tileShieldNow(onTile, walker).guards.map((g) => g.id)).toEqual([owner.id])
    expect(liveAc(onTile, walker)).toBe(heroAc(walker) + 2)
    expect(acParts(walker, onTile.heroes, tileShieldNow(onTile, walker)).total).toBe(heroAc(walker) + 2)
    const offAgain = move(onTile, walker.id, [0, -4])
    expect(liveAc(offAgain, walker)).toBe(heroAc(walker))
  })

  it('follows the owner, not where the shield was first played', () => {
    const { state, heroes } = shielded([0, -4])
    const [first, owner] = heroes
    expect(liveAc(state, first)).toBe(heroAc(first) + 2)
    const ownerLeft = move(state, owner.id, [1, -3])
    expect(liveAc(ownerLeft, first)).toBe(heroAc(first))
    expect(liveAc(ownerLeft, heroes[2])).toBe(heroAc(heroes[2]) + 2)
  })

  it('leaves it to the iPad question without a board', () => {
    const { state, heroes } = shielded([0, -4])
    expect(tileShieldNow({ ...state, board: null }, heroes[0])).toBeNull()
    expect(liveAc({ ...state, board: null }, heroes[0])).toBe(heroAc(heroes[0]))
  })
})

describe('the board follows the active hero this turn (Volcanic Vapors, Dragon Fear)', () => {
  const vapors = (tile) => ({ id: 'trap1', cardId: 'volcanic-vapors', name: 'Volcanic Vapors', type: 'hazard', tile, card: {} })
  const ask = (name) => `Did ${name} start the turn on the Volcanic Vapors tile, or move onto it?`
  const fear = (name) => `Did ${name} move onto a new tile this Hero Phase?`
  const move = (state, id, to) => gameReducer(state, { type: 'MOVE_TOKEN', id, to })

  it('sees a hero that started the turn on the Vapors tile', () => {
    const { state, heroes } = game([1, -2])
    expect(boardAnswer({ ...state, traps: [vapors('start')] }, ask(heroes[0].name))).toMatchObject({ answer: true })
  })

  it('sees a hero that moved onto the Vapors tile, even after moving off again', () => {
    const { state, heroes } = game([1, -6])
    const there = move({ ...state, traps: [vapors('t1')] }, heroes[0].id, [0, -1])
    expect(boardAnswer(there, ask(heroes[0].name))).toMatchObject({ answer: true })
    const back = move(there, heroes[0].id, [0, 1])
    expect(boardAnswer(back, ask(heroes[0].name))).toMatchObject({ answer: true })
    expect(back.turn.heroTiles[heroes[0].id]).toEqual({ start: 'start', entered: ['t1', 'start'] })
  })

  it('says no when the hero stayed clear of the Vapors tile', () => {
    const { state, heroes } = game([1, -6])
    const moved = move({ ...state, traps: [vapors('t2')] }, heroes[0].id, [0, -1])
    expect(boardAnswer(moved, ask(heroes[0].name))).toMatchObject({ answer: false })
  })

  it('asks when it is not that hero’s turn, or the marker has no tile', () => {
    const { state, heroes } = game([1, -2])
    expect(boardAnswer({ ...state, traps: [vapors('t1')] }, ask(heroes[2].name))).toBeNull()
    expect(boardAnswer({ ...state, traps: [vapors(undefined)] }, ask(heroes[0].name))).toBeNull()
  })

  it('answers Dragon Fear from the tiles the hero moved onto', () => {
    const { state, heroes } = game([1, -6])
    expect(boardAnswer(state, fear(heroes[0].name))).toMatchObject({ answer: false })
    const sameTile = move(state, heroes[0].id, [2, 0])
    expect(boardAnswer(sameTile, fear(heroes[0].name))).toMatchObject({ answer: false })
    const newTile = move(state, heroes[0].id, [0, -1])
    expect(boardAnswer(newTile, fear(heroes[0].name))).toMatchObject({ answer: true })
  })

  it('starts a fresh trail each turn', () => {
    const { state, heroes } = game([1, -6])
    const moved = move(state, heroes[0].id, [0, -1])
    let next = moved
    for (let i = 0; i < 3; i++) next = gameReducer(next, { type: 'NEXT_PHASE', rolls: [] })
    expect(next.turn.heroIndex).toBe(1)
    expect(next.turn.heroTiles).toBeUndefined()
  })
})
