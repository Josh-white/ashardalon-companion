// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useReducer } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { HOW_TO_PLAY, PHASE_HELP, howToPlayLine, phaseHelpLine, teachingLines } from '../data/howToPlay.js'
import { changeSounds } from '../audio/sfx.js'
import { createHero, gameReducer, initialState } from '../state/game.js'
import { heroesFromLobby } from '../state/heroSetup.js'
import { oweTreasure } from '../state/treasureDeck.js'
import { HowToPlayCards } from './HowToPlay.jsx'
import { newToGame } from './Setup.jsx'
import { TreasureStep, treasureWhy } from './Treasure.jsx'
import TurnGuide from './TurnGuide.jsx'

// Teaching new players: the how-to-play cards, the first-game helper on the turn screen,
// and the treasure bar saying why it's there.

beforeAll(() => {
  vi.stubGlobal('fetch', async () => ({ ok: true, status: 200, json: async () => ({}) }))
})
beforeEach(() => window.localStorage.clear())
afterEach(cleanup)

function newGame({ newPlayer = false } = {}) {
  const heroes = HERO_TEMPLATES.slice(0, 2).map((t, i) => ({ ...createHero(t), player: `P${i}`, ...(newPlayer && i === 0 ? { newPlayer: true } : {}) }))
  return { ...gameReducer(initialState, { type: 'START_GAME', heroes }), firstRoll: null }
}

function Live({ start, show }) {
  const [state, dispatch] = useReducer(gameReducer, start)
  return show(state, dispatch)
}
const guide = (state, dispatch) => <TurnGuide state={state} dispatch={dispatch} />

describe('how to play', () => {
  it('has six cards, each with words the narrator reads', () => {
    expect(HOW_TO_PLAY).toHaveLength(6)
    for (const card of HOW_TO_PLAY) {
      const line = howToPlayLine(card)
      expect(line.voice).toBe('narrator')
      expect(line.text).toContain(card.title)
    }
    expect(howToPlayLine(HOW_TO_PLAY[1]).text).toContain('Hero: Move and attack.')
  })

  it("records each coach's line for each phase, and a narrator one for heroes without a coach", () => {
    const lines = teachingLines(['fighter', 'bard'])
    expect(lines).toHaveLength(6 + 3 * 3)
    expect(phaseHelpLine('fighter', 'hero')).toEqual({ voice: 'coach_fighter', text: `[gruff, commanding] ${PHASE_HELP.hero}` })
    expect(phaseHelpLine('bard', 'villain').voice).toBe('narrator')
    expect(lines.every((l) => l.text.length > 10)).toBe(true)
  })

  it('pages through the cards and finishes on the last one', () => {
    const done = vi.fn()
    render(<HowToPlayCards onDone={done} />)
    expect(screen.getByText("You're a team")).toBeTruthy()
    for (let i = 1; i < HOW_TO_PLAY.length; i++) fireEvent.click(screen.getByRole('button', { name: 'Next →' }))
    expect(screen.getByText('Knocked out?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: "Got it, let's play!" }))
    expect(done).toHaveBeenCalled()
  })

  it('counts only a named player with no games as new', () => {
    const played = { colton: { fighter: 1 } }
    expect(newToGame(played, 'Colton')).toBe(false)
    expect(newToGame(played, 'Sam')).toBe(true)
    expect(newToGame(played, '')).toBe(false)
    expect(newToGame(null, 'Sam')).toBe(false)
  })

  it("carries a new player's ready from the lobby onto their hero", () => {
    let state = gameReducer(initialState, { type: 'CLAIM_HERO', deviceId: 'a', heroKey: 'fighter', picks: [], player: 'Sam' })
    state = gameReducer(state, { type: 'SET_LOBBY_READY', deviceId: 'a', ready: true, newPlayer: true })
    expect(state.lobby[0].newPlayer).toBe(true)
    expect(heroesFromLobby(state.lobby)[0].newPlayer).toBe(true)
    state = gameReducer(state, { type: 'SET_LOBBY_READY', deviceId: 'a', ready: true, newPlayer: false })
    expect(heroesFromLobby(state.lobby)[0].newPlayer).toBeUndefined()
  })
})

describe('first game helper', () => {
  it("shows the coach's line each phase for a new player's hero, until hidden", () => {
    render(<Live start={newGame({ newPlayer: true })} show={guide} />)
    expect(screen.getByText(PHASE_HELP.hero)).toBeTruthy()
    expect(screen.getByText(/Sergeant Brumm|Mother Ardra/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Hide tips' }))
    expect(screen.queryByText(PHASE_HELP.hero)).toBeNull()
    expect(window.localStorage.getItem('ashardalon-companion/first-game-help')).toBe('off')
  })

  it('stays out of the way for players who know the game, but explains a phase when its name is tapped', () => {
    render(<Live start={newGame()} show={guide} />)
    expect(screen.queryByText(PHASE_HELP.hero)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'What is the Exploration Phase?' }))
    expect(screen.getByText(PHASE_HELP.exploration)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '🎓 Tips every phase' }))
    expect(screen.getByText(PHASE_HELP.hero)).toBeTruthy()
  })
})

describe('treasure bar', () => {
  it('says why the treasure is there', () => {
    const state = newGame()
    const hero = state.heroes[0]
    const owed = { ...state, treasureDeck: [{ id: 't1', name: 'Gold' }], turn: oweTreasure(state, hero.id) }
    expect(treasureWhy(owed, hero)).toBe(`${hero.name} beat a monster, so they get a treasure card. Only one per turn!`)
    expect(treasureWhy({ ...owed, turn: { ...owed.turn, treasureWhy: null } }, hero)).toBe(`${hero.name} found treasure! Draw a treasure card to see what it is.`)
    render(<TreasureStep state={owed} dispatch={() => {}} />)
    expect(screen.getByText('💰 Treasure!')).toBeTruthy()
    expect(screen.getByText(/beat a monster/)).toBeTruthy()
  })

  it('clinks coins when treasure is earned, once', () => {
    const state = newGame()
    const owed = { ...state, turn: oweTreasure(state, state.heroes[0].id) }
    expect(changeSounds(state, owed).map(([s]) => s)).toContain('coins')
    expect(changeSounds(owed, owed)).toEqual([])
    expect(changeSounds(null, owed)).toEqual([])
  })
})
