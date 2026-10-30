import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { normalizeCardFile } from '../data/cards.js'
import { createHero, gameReducer, initialState, phaseChecks } from '../state/game.js'
import { boardAnswer } from './checks.js'
import { markerOnHeroTile } from './markers.js'
import { wrathPull } from './monsters.js'
import { heroReach, movesLeft } from './play.js'
import { normalizeTiles } from './tileDefs.js'

// Cards that should use the virtual board (the card audit): each test is one card.

// A made-up Start tile with a room north of it and another north of that.
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

const file = normalizeCardFile({
  powers: [],
  monsters: [
    { id: 'rat', name: 'Rat', copies: 3, ac: 12, hp: 1, xp: 1, types: ['Animal'], attacks: [{ id: 'bite', name: 'Bite', bonus: 5, damage: 1 }], tactics: [{ move: 'toward' }] },
    { id: 'ooze', name: 'Ooze', copies: 3, ac: 10, hp: 2, xp: 2, types: ['Aberrant'], attacks: [{ id: 'slap', name: 'Slap', bonus: 5, damage: 2 }], tactics: [{ move: 'toward' }] },
  ],
  villains: [{ id: 'dragon', name: 'Dragon', ac: 15, hp: 9, attacks: [{ id: 'claw', name: 'Claw', bonus: 9, damage: 3 }], tactics: [{ move: 'toward' }] }],
  encounters: [
    { id: 'cage', name: 'Cage', type: 'curse', text: 'You are cursed!', curse: { acPenalty: 2, removeRoll: { phase: 'action', target: 10 } } },
    {
      id: 'a-gap-in-the-armor', name: 'A Gap in the Armor', type: 'curse', text: 'You are cursed!', curse: { acPenalty: 4 },
      checks: [{ phase: 'hero', ask: 'Did {hero} move during this Hero Phase?', no: { remove: true } }],
    },
    {
      id: 'wrath-of-the-enemy', name: 'Wrath of the Enemy', type: 'curse', text: 'You are cursed!', curse: {},
      checks: [{ phase: 'exploration', note: "Wrath of the Enemy: put the closest monster that isn't on {hero}'s tile next to {hero}." }],
    },
    { id: 'pit', name: 'Pit', type: 'hazard', text: 'Place the Pit marker on the active Hero\'s tile.' },
    { id: 'whirling-blades', name: 'Whirling Blades', type: 'trap', text: 'Trigger the trap: Move the Whirling Blades marker one tile toward the closest Hero.' },
    { id: 'arrives', name: 'Arrives', type: 'event', adventure: true, noCancel: true, placeVillain: 'dragon', text: 'Place the dragon.' },
    { id: 'flares', name: 'Flares', type: 'event', adventure: true, noCancel: true, objective: 'Gate', drawMonsterType: 'Aberrant', text: 'An Aberrant comes out.' },
    { id: 'occupied-lair', name: 'Occupied Lair', type: 'event', drawMonster: true, text: 'A lair.' },
  ],
})
const card = (id) => file.encounters.find((c) => c.id === id)

// Two heroes on the Start tile's north half, the rooms north of it.
function game() {
  const heroes = HERO_TEMPLATES.slice(0, 2).map((t) => createHero(t))
  let state = gameReducer(initialState, { type: 'START_GAME', heroes, tileRandom: [], boardTiles: TILES })
  const tiles = [...state.board.tiles, { uid: 't1', tileId: 'room', at: [0, -4], turn: 0 }, { uid: 't2', tileId: 'room', at: [0, -8], turn: 0 }]
  const [a, b] = state.heroes
  state = { ...state, firstRoll: null, board: { ...state.board, tiles, tokens: { [a.id]: [0, 2], [b.id]: [1, 1] } } }
  return { state, heroes: state.heroes }
}
const curse = (state, heroId, id) => ({
  ...state,
  heroes: state.heroes.map((h) => (h.id === heroId ? { ...h, curses: [...(h.curses ?? []), { id: `curse-${id}`, cardId: id, name: card(id).name, card: card(id).curse, checks: card(id).checks ?? [] }] } : h)),
})
const encounter = (state, id) => ({ ...state, encounter: { id: 'enc1', cardId: id, card: card(id), heroId: state.heroes[0].id } })
const resolve = (state) => gameReducer(state, { type: 'RESOLVE_ENCOUNTER', monsterCards: file.monsters, villains: file.villains, random: [] })

describe('A Gap in the Armor', () => {
  const ask = (name) => `Did ${name} move during this Hero Phase?`

  it('the board says whether the hero moved this Hero Phase', () => {
    const { state, heroes } = game()
    expect(boardAnswer(state, ask(heroes[0].name))).toMatchObject({ answer: false })
    const moved = gameReducer(state, { type: 'MOVE_HERO', heroId: heroes[0].id, to: [0, 5] })
    expect(boardAnswer(moved, ask(heroes[0].name))).toMatchObject({ answer: true })
    // Only the active hero's turn is followed.
    expect(boardAnswer(moved, ask(heroes[1].name))).toBeNull()
  })

  it('a hero who stayed put loses the curse at the end of the Hero Phase', () => {
    let { state, heroes } = game()
    state = curse(state, heroes[0].id, 'a-gap-in-the-armor')
    const [check] = phaseChecks(state, 'hero')
    const board = boardAnswer(state, check.ask.replace('{hero}', heroes[0].name))
    state = gameReducer(state, { type: 'ANSWER_CHECK', key: check.key, answer: board.answer })
    expect(state.heroes[0].curses).toEqual([])
  })
})

describe('Cage', () => {
  it('a caged hero gets no squares to walk to on the board', () => {
    let { state, heroes } = game()
    expect(movesLeft(state, heroes[0])).toBe(2)
    state = curse(state, heroes[0].id, 'cage')
    expect(movesLeft(state, state.heroes[0])).toBe(0)
    expect(heroReach(state, state.heroes[0])).toEqual([])
    expect(gameReducer(state, { type: 'MOVE_HERO', heroId: heroes[0].id, to: [0, 5] })).toBe(state)
  })
})

describe('Wrath of the Enemy', () => {
  const withRats = (state) => ({
    ...state,
    monsters: [
      { id: 'm1', cardId: 'rat', name: 'Rat', hp: 1, ac: 12, ownerId: state.heroes[1].id, card: { hp: 1 } },
      { id: 'm2', cardId: 'ooze', name: 'Ooze', hp: 2, ac: 10, ownerId: state.heroes[1].id, card: { hp: 2 } },
    ],
    board: { ...state.board, tokens: { ...state.board.tokens, m1: [2, -2], m2: [2, -7] } },
  })

  it('pulls the closest monster off another tile next to the hero', () => {
    const { state, heroes } = game()
    const pull = wrathPull(withRats(state), heroes[0].id)
    expect(pull).toMatchObject({ id: 'm1', name: 'Rat' })
    expect(Math.max(Math.abs(pull.to[0] - 0), Math.abs(pull.to[1] - 2))).toBe(1)
  })

  it('skips a monster already on the hero\'s tile, and the board moves it when the note is done', () => {
    let { state, heroes } = game()
    state = withRats(state)
    state = { ...state, board: { ...state.board, tokens: { ...state.board.tokens, m1: [2, 0] } } }
    state = curse(state, heroes[0].id, 'wrath-of-the-enemy')
    state = { ...state, turn: { ...state.turn, phase: 1 } }
    const [check] = phaseChecks(state, 'exploration')
    const after = gameReducer(state, { type: 'ANSWER_CHECK', key: check.key, answer: true })
    const at = after.board.tokens.m2
    expect(Math.max(Math.abs(at[0] - 0), Math.abs(at[1] - 2))).toBe(1)
    expect(after.board.tokens.m1).toEqual([2, 0])
  })

  it('does nothing without a monster on another tile', () => {
    const { state, heroes } = game()
    expect(wrathPull(state, heroes[0].id)).toBeNull()
  })
})

describe('a new trap or hazard: is there a marker on the tile already?', () => {
  const marker = (cardId, tile) => ({ id: `trap-${cardId}`, cardId, name: card(cardId).name, type: card(cardId).type, tile, card: card(cardId) })

  it('the board knows the markers on the hero\'s tile', () => {
    const { state, heroes } = game()
    expect(markerOnHeroTile(state, heroes[0])).toBe(false)
    expect(markerOnHeroTile({ ...state, traps: [marker('pit', 'start')] }, heroes[0])).toMatchObject({ cardId: 'pit' })
    expect(markerOnHeroTile({ ...state, traps: [marker('pit', 't1')] }, heroes[0])).toBe(false)
  })

  it('asks when a marker could be anywhere', () => {
    const { state, heroes } = game()
    expect(markerOnHeroTile({ ...state, traps: [marker('whirling-blades', 't1')] }, heroes[0])).toBeNull()
    expect(markerOnHeroTile({ ...state, traps: [marker('pit', undefined)] }, heroes[0])).toBeNull()
    expect(markerOnHeroTile({ ...state, board: null }, heroes[0])).toBeNull()
  })
})

describe('Ashardalon Arrives! and The Vast Gate Flares!', () => {
  it('puts an arriving villain on the board, on the tile with an unexplored edge closest to the hero', () => {
    const { state } = game()
    const after = resolve(encounter(state, 'arrives'))
    const dragon = after.villains.find((v) => v.name === 'Dragon')
    expect(after.board.tokens[dragon.id]).toBeDefined()
  })

  it('puts the Aberrant next to the Vast Gate', () => {
    let { state } = game()
    const gate = { id: 'gate', name: 'Gate', objective: true, hp: 5, ac: 12, card: { hp: 5 } }
    state = { ...state, monsters: [gate], board: { ...state.board, tokens: { ...state.board.tokens, gate: [1, -6] } } }
    const after = resolve(encounter(state, 'flares'))
    const ooze = after.monsters.find((m) => m.name === 'Ooze')
    const at = after.board.tokens[ooze.id]
    expect(Math.max(Math.abs(at[0] - 1), Math.abs(at[1] + 6))).toBe(1)
  })
})

describe('Occupied Lair', () => {
  it('a Treasure token waits for its square', () => {
    const { state } = game()
    const after = resolve({ ...encounter(state, 'occupied-lair'), encounter: { ...encounter(state, 'occupied-lair').encounter, monsterDrawn: true } })
    expect(after.board.items).toEqual([expect.objectContaining({ kind: 'treasure', at: null })])
  })
})
