// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { normalizeCardFile } from '../data/cards.js'
import { startingPicks } from './Setup.jsx'
import { ROBOT_CARD_FILE } from '../robot/robotCards.js'

const CARDS = normalizeCardFile(ROBOT_CARD_FILE)
const store = { state: null, listeners: new Set() }
let reducer = null
function dispatch(action) {
  store.state = reducer(store.state, action)
  for (const l of store.listeners) l()
}
vi.mock('../state/useSharedGame.js', async (importOriginal) => {
  const real = await importOriginal()
  return {
    ...real,
    useSharedGame: () => ({
      state: useSyncExternalStore((l) => (store.listeners.add(l), () => store.listeners.delete(l)), () => store.state),
      connected: true, dispatch, undo: null, undoDepth: 0, instance: null,
      screens: ['quinn', 'keyleth', 'tarak'], game: { id: real.FAMILY_GAME, name: 'Family' }, gamesVersion: 0,
      changeGames: () => {}, startGame: async () => ({}),
    }),
  }
})
vi.mock('../audio/soundSetting.js', async (importOriginal) => ({
  ...(await importOriginal()),
  useSoundSetting: () => [false, () => {}],
  useMusicSetting: () => [false, () => {}],
  useAudioLocked: () => false,
}))

beforeAll(() => {
  vi.stubGlobal('fetch', async (url) => ({ ok: true, status: 200, json: async () => (String(url).includes('cards.json') ? CARDS : {}) }))
  window.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} }
  window.HTMLElement.prototype.scrollIntoView = () => {}
  window.HTMLElement.prototype.scrollTo = () => {}
})
afterEach(cleanup)

// Quinn (JJ) casts Cause Fear on her turn; Tarak's iPad (one of the boys) has to offer
// Tarak's +2 attack, at the top of the screen, not only Quinn's iPad.
async function setup(board) {
  const [{ default: App }, { gameReducer, initialState }, { templateFor }] = await Promise.all([import('../App.jsx'), import('../state/game.js'), import('../data/heroes.js')])
  reducer = gameReducer
  let state = board ? gameReducer(initialState, { type: 'SET_LOBBY_BOARD', on: true }) : initialState
  for (const key of ['cleric', 'paladin', 'rogue']) {
    const template = templateFor(key)
    state = gameReducer(state, { type: 'CLAIM_HERO', deviceId: key, heroKey: key, picks: startingPicks(template, CARDS.powers), player: key })
    state = gameReducer(state, { type: 'SET_LOBBY_READY', deviceId: key, ready: true })
  }
  state = gameReducer(state, { type: 'START_GAME', treasureCards: CARDS.treasures, chambers: CARDS.chambers, tokens: CARDS.treasureTokens, random: Array(128).fill(0.5), tileRandom: Array(8).fill(0.5), boardTiles: CARDS.tiles, boardRandom: Array(64).fill(0.5) })
  return { App, state }
}

describe('Cause Fear on the other heroes\' iPads', () => {
  for (const board of [false, true]) {
    it(`shows the extra attack on the ally's own screen (${board ? 'virtual board' : 'real tiles'})`, async () => {
      const { App, state } = await setup(board)
      let s = { ...state, firstRoll: null, opening: null, moment: null }
      const quinn = s.heroes.find((h) => h.key === 'cleric')
      s = { ...s, turn: { ...s.turn, heroIndex: s.heroes.indexOf(quinn), phase: 0 } }
      s = reducer(s, { type: 'ADD_MONSTER', name: 'Snake', hp: 1, xp: 1, ownerId: quinn.id })
      s = { ...s, monsters: s.monsters.map((m) => ({ ...m, ac: 12 })) }
      const fear = quinn.powers.find((p) => p.name === 'Cause Fear')
      const others = s.heroes.filter((h) => h.id !== quinn.id).map((h) => h.id)
      s = reducer(s, { type: 'USE_POWER', heroId: quinn.id, powerId: fear.id, heroIds: others })
      expect(s.turn.bonusAttacks.map((b) => b.heroId)).toEqual(others)
      store.state = s
      localStorage.clear()
      sessionStorage.clear()
      sessionStorage.setItem('ashardalon-companion/intro-seen', 'yes')
      localStorage.setItem('ashardalon-companion/device', 'rogue')
      localStorage.setItem('ashardalon-companion/game', 'family')
      localStorage.setItem('ashardalon-companion/screen', 'hero')
      localStorage.setItem('ashardalon-companion/seat', 'rogue')
      render(<App />)
      const callout = await screen.findByText(/Quinn's Cause Fear gives you a free attack right now/)
      expect(screen.getByText(/Tarak's extra attack from Cause Fear/)).toBeTruthy()
      // First thing in the turn column, above "It's Quinn's turn".
      const waiting = screen.getByText(/'s turn$/, { selector: 'h2' })
      expect(callout.compareDocumentPosition(waiting) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      // Quinn's own extra attack isn't offered to anyone.
      expect(screen.queryByText(/Quinn's extra attack/)).toBeNull()
    })
  }
})
