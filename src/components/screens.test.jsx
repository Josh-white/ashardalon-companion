// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useReducer } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { normalizeTiles } from '../board/tileDefs.js'
import { normalizeCardFile } from '../data/cards.js'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { createHero, gameReducer, initialState } from '../state/game.js'
import { EncounterStep } from './Encounters.jsx'
import HeroAttack from './HeroAttack.jsx'
import MonsterTurns, { VillainTurns } from './MonsterTurns.jsx'

// Screen tests: each one shows a real screen on a made-up game and taps through it the way a
// player would, with every tap going through the real game rules. They catch a screen that
// crashes (goes blank) on a common turn, which the rules tests can't see.

// Made-up cards in the cards.json shape, so the tests don't need the real ones.
const CARD_FILE = {
  powers: [],
  monsters: [
    {
      // Attacks a hero within 1 tile; otherwise only moves (like the Orc Smasher).
      id: 'brute', name: 'Brute', copies: 1, ac: 13, hp: 1, xp: 1,
      attacks: [{ id: 'club', name: 'Club', bonus: 7, damage: 1, effect: 'The hero is knocked back.' }],
      tactics: [
        { when: 'within1', move: 'adjacent', attack: 'club', text: 'Attacks a hero within 1 tile.' },
        { move: 'toward', text: 'Otherwise, it moves 1 tile toward the closest Hero.' },
      ],
    },
  ],
  villains: [
    {
      id: 'boss', name: 'Big Boss', fullName: 'Grak, Big Boss', level: 5, ac: 15, hp: 6,
      attacks: [{ id: 'axe', name: 'Axe', bonus: 8, damage: 2, effect: 'Push the hero.' }],
      tactics: [
        { when: 'adjacent', attack: 'axe', then: 'within1', text: 'Attacks a hero next to it.' },
        { move: 'toward', toward: 'mostHp', text: 'Otherwise, it moves toward the hero with the most HP.' },
      ],
    },
  ],
  encounters: [
    { id: 'rocks', name: 'Falling Rocks', type: 'event', text: 'Rocks fall on your tile.', attack: { bonus: 8, damage: 1, miss: 1, targets: 'activeTile' } },
  ],
  treasures: [],
}
const CARDS = normalizeCardFile(CARD_FILE)

// A made-up start tile and an open room north of it, then a second room north of that.
const TILES = normalizeTiles(
  [
    {
      id: 'start', kind: 'start', rows: ['...#', '...#', '...#', '...#', '...#', '...#', '...#', '...#'],
      exits: { N: 'ooox', S: 'ooox', W: 'oooooooo', E: 'xxxxxxxx' },
    },
    { id: 'room', name: 'Room', kind: 'regular', triangle: 'black', rows: ['....', '....', '....', '....'], exits: { N: 'oooo', S: 'oooo', W: 'oooo', E: 'oooo' } },
  ],
  [],
)

// The screens load cards.json and art.json from the Pi; here they get the made-up cards,
// read the way the Pi's server reads them.
beforeAll(() => {
  vi.stubGlobal('fetch', async (url) => {
    const body = String(url).includes('cards.json') ? CARDS : {}
    return { ok: true, status: 200, json: async () => body }
  })
})
afterEach(cleanup)

// Two heroes, each with an at-will that attacks, in the Villain Phase of the first turn.
function newGame({ board = false } = {}) {
  const heroes = HERO_TEMPLATES.slice(0, 2).map((t) => {
    const hero = createHero(t)
    const powers = hero.powers.map((p, i) => (i === 0 ? { ...p, name: 'Jab', card: { attack: '+7', damage: '1', text: 'Attack one adjacent monster.' } } : p))
    return { ...hero, powers }
  })
  const state = gameReducer(initialState, { type: 'START_GAME', heroes, ...(board ? { tileRandom: [], boardTiles: TILES } : {}) })
  return { ...state, firstRoll: null }
}

const brute = (state, id = 'm1') => ({
  id, name: 'Brute', hp: 1, maxHp: 1, ac: 13, xp: 1, ownerId: state.heroes[0].id, conditions: [], card: CARDS.monsters[0],
})

// A virtual board with two rooms north of the Start tile and a Brute where we say.
function boardGame(bruteAt) {
  const state = newGame({ board: true })
  const tiles = [...state.board.tiles, { uid: 't1', tileId: 'room', at: [0, -4], turn: 0 }, { uid: 't2', tileId: 'room', at: [0, -8], turn: 0 }]
  return { ...state, monsters: [brute(state)], board: { ...state.board, tiles, tokens: { ...state.board.tokens, m1: bruteAt } } }
}

// Shows a screen on a live game: every tap runs through the real game rules and redraws it.
function Live({ start, screen: show }) {
  const [state, dispatch] = useReducer(gameReducer, start)
  return show(state, dispatch)
}
let latest
function play(start, show) {
  const tracked = (state, dispatch) => ((latest = state), show(state, dispatch))
  render(<Live start={start} screen={tracked} />)
  return () => latest
}

const tap = (name) => fireEvent.click(screen.getByRole('button', { name }))
// Lets the cards.json fetch land, so screens that draw cards can see them.
const loadCards = () => act(async () => {})

describe('monster turn screen', () => {
  const monsterTurns = (state, dispatch) => <MonsterTurns state={state} dispatch={dispatch} hero={state.heroes[0]} />

  it('asks the card question, rolls the attack and finishes the turn', () => {
    const start = newGame()
    const game = play({ ...start, monsters: [brute(start)] }, monsterTurns)
    tap(/Take its turn/)
    expect(screen.getByText(/Is a hero on the Brute's tile, or on a tile touching it/)).toBeTruthy()
    tap('Yes')
    fireEvent.click(screen.getByRole('button', { name: new RegExp(start.heroes[0].name) }))
    tap(/Roll the Club attack/)
    expect(screen.getByText(/The Brute rolled/)).toBeTruthy()
    tap(/Done with the Brute/)
    expect(game().turn.acted).toContain('m1')
    expect(screen.getByText('✓ Done')).toBeTruthy()
  })

  it('moves toward a hero when nobody is in reach', () => {
    const start = newGame()
    play({ ...start, monsters: [brute(start)] }, monsterTurns)
    tap(/Take its turn/)
    tap('No')
    expect(screen.getByText(/Move the Brute 1 tile toward the closest hero/)).toBeTruthy()
    tap(/Done with the Brute/)
    expect(screen.getByText('✓ Done')).toBeTruthy()
  })

  it('does nothing when every hero is off the board', () => {
    const start = newGame()
    const heroes = start.heroes.map((h) => ({ ...h, tokens: { refuge: true } }))
    play({ ...start, heroes, monsters: [brute(start)] }, monsterTurns)
    tap(/Take its turn/)
    expect(screen.getByText(/has nobody to go after/)).toBeTruthy()
    tap(/Done with the Brute/)
    expect(screen.getByText('✓ Done')).toBeTruthy()
  })

  it('only moves on the virtual board when no hero is within 1 tile', () => {
    // Heroes start on the Start tile; the Brute is two rooms away.
    const game = play(boardGame([1, -6]), monsterTurns)
    tap(/Take its turn/)
    expect(screen.getByText(/The Brute moves 1 tile toward/)).toBeTruthy()
    tap(/Move the Brute/)
    expect(game().board.tokens.m1).not.toEqual([1, -6])
    expect(screen.getByText('✓ Done')).toBeTruthy()
  })

  it('attacks on the virtual board when a hero is within 1 tile', () => {
    const game = play(boardGame([0, -2]), monsterTurns)
    tap(/Take its turn/)
    expect(screen.getByText(/The board says yes/)).toBeTruthy()
    tap(/Roll the Club attack/)
    expect(screen.getByText(/The Brute rolled/)).toBeTruthy()
    tap(/Done with the Brute/)
    expect(game().turn.acted).toContain('m1')
  })
})

describe('villain turn screen', () => {
  const villainTurns = (state, dispatch) => <VillainTurns state={state} dispatch={dispatch} hero={state.heroes[0]} />
  const withBoss = (state) => gameReducer(state, { type: 'PLACE_VILLAIN', name: 'Big Boss', cards: CARDS.villains })

  it('attacks a hero next to it', () => {
    const game = play(withBoss(newGame()), villainTurns)
    tap(/Take its turn/)
    tap('Yes')
    fireEvent.click(screen.getAllByRole('button', { name: /AC/ })[0])
    tap(/Roll the Axe attack/)
    expect(screen.getByText(/The Big Boss rolled/)).toBeTruthy()
    expect(screen.getByText(/Now move the Big Boss to any square within 1 tile/)).toBeTruthy()
    tap(/Done with the Big Boss/)
    expect(game().turn.acted).toHaveLength(1)
  })

  it('moves toward the hero with the most HP when nobody is next to it', () => {
    play(withBoss(newGame()), villainTurns)
    tap(/Take its turn/)
    tap('No')
    expect(screen.getByText(/Move the Big Boss 1 tile toward the hero with the most HP/)).toBeTruthy()
    tap(/Done with the Big Boss/)
    expect(screen.getByText('✓ Done')).toBeTruthy()
  })
})

describe('attack box', () => {
  const attackBox = (state, dispatch) => <HeroAttack state={state} dispatch={dispatch} hero={state.heroes[0]} />
  const heroPhase = (state) => ({ ...state, turn: { ...state.turn, phase: 0 } })

  it('says so when there is nothing to attack', () => {
    play(heroPhase(newGame()), attackBox)
    expect(screen.getByText(/No monsters to attack right now/)).toBeTruthy()
  })

  it('attacks a monster with a power', () => {
    const start = heroPhase(newGame())
    const game = play({ ...start, monsters: [brute(start)] }, attackBox)
    tap(/Jab/)
    fireEvent.click(screen.getByRole('button', { name: /Brute/ }))
    tap(/Roll Jab/)
    expect(game().turn.lastAttack?.heroId).toBe(start.heroes[0].id)
  })

  it('shows the item bonus and attacks with an item', () => {
    const start = heroPhase(newGame())
    const sword = { id: 'i1', cardId: 'sword', name: 'Sword', used: false, card: { id: 'sword', name: 'Sword', inPlay: true, attackBonus: 1, attackRange: 'adjacent' } }
    const wand = { id: 'i2', cardId: 'wand', name: 'Wand', used: false, card: { id: 'wand', name: 'Wand', text: 'Attack a monster.', attack: { bonus: 8, damage: 1 }, after: 'flip' } }
    const heroes = start.heroes.map((h, i) => (i === 0 ? { ...h, items: [sword, wand] } : h))
    const game = play({ ...start, heroes, monsters: [brute(start)] }, attackBox)
    // The Sword only helps next to the monster, so the box asks how far it is.
    tap(/Jab/)
    fireEvent.click(screen.getByRole('button', { name: /Brute/ }))
    expect(screen.getByText(/How far is the Brute/)).toBeTruthy()
    tap('Next to me')
    // Jab +7 and the Sword +1 against AC 13.
    expect(screen.getByText('roll 5 or more')).toBeTruthy()
    // The Wand makes its own attack instead.
    tap(/Wand/)
    fireEvent.click(screen.getByRole('button', { name: /Brute/ }))
    tap('Next to me')
    tap(/Roll Wand/)
    expect(game().heroes[0].items.find((i) => i.id === 'i2').used).toBe(true)
  })
})

describe('encounter screen', () => {
  const encounterStep = (state, dispatch) => <EncounterStep state={state} dispatch={dispatch} hero={state.heroes[0]} />

  it('draws an encounter card and rolls its attack', async () => {
    const start = newGame()
    const game = play({ ...start, turn: { ...start.turn, phase: 2 } }, encounterStep)
    await loadCards()
    tap(/Draw an encounter card/)
    expect(screen.getAllByText(/Falling Rocks/).length).toBeGreaterThan(0)
    expect(game().encounter?.card.id).toBe('rocks')
    // The active hero is already picked for an attack on their tile.
    tap(/Roll the attack/)
    expect(document.body.textContent).toMatch(/rolled \d+ \+ 8 =/)
    expect(game().encounter.attacked).toBe(true)
  })
})
