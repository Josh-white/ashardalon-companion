// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
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

// "Since your last turn" on Tarak's iPad: "Got it" has to keep it put away when the player
// looks at another tab and comes back (the Turn tab is built again each time), and it comes
// back on Tarak's next turn.
const logLine = (id, round, heroIndex, text) => ({ id, round, heroIndex, text })

describe('Since your last turn card', () => {
  for (const board of [false, true]) {
    it(`stays dismissed across tab switches, back next turn (${board ? 'virtual board' : 'real tiles'})`, async () => {
      const { App, state } = await setup(board)
      const tarak = state.heroes.findIndex((h) => h.key === 'rogue')
      const other = state.heroes.findIndex((h) => h.key === 'cleric')
      const name = state.heroes[other].name
      const turnOf = (round, log) => ({ ...state, firstRoll: null, opening: null, moment: null, turn: { ...state.turn, round, heroIndex: tarak, phase: 0 }, log })
      // The cleric goes before Tarak, so their round-2 turn is between Tarak's turns.
      expect(other).toBeLessThan(tarak)
      const round1 = [logLine('log-b', 2, other, `${name} explored a new tile.`), logLine('log-a', 1, tarak, 'Tarak drew a card.')]
      store.state = turnOf(2, round1)
      localStorage.clear()
      sessionStorage.clear()
      sessionStorage.setItem('ashardalon-companion/intro-seen', 'yes')
      localStorage.setItem('ashardalon-companion/device', 'rogue')
      localStorage.setItem('ashardalon-companion/game', 'family')
      localStorage.setItem('ashardalon-companion/screen', 'hero')
      localStorage.setItem('ashardalon-companion/seat', 'rogue')
      const view = render(<App />)
      await screen.findByLabelText('Since your last turn')
      fireEvent.click(screen.getByRole('button', { name: 'Got it' }))
      expect(screen.queryByLabelText('Since your last turn')).toBeNull()

      // Over to the Log tab and back to the Turn tab: still put away.
      fireEvent.click(screen.getByRole('button', { name: /Log/ }))
      fireEvent.click(screen.getByRole('button', { name: /My turn/ }))
      expect(screen.getByRole('button', { name: /My turn/ })).toBeTruthy()
      expect(screen.queryByLabelText('Since your last turn')).toBeNull()

      // A reload of the page (updates reload every screen) doesn't bring it back either.
      view.unmount()
      render(<App />)
      await screen.findByRole('button', { name: /My turn/ })
      expect(screen.queryByLabelText('Since your last turn')).toBeNull()

      // Tarak's next turn has a new card.
      act(() => dispatchState(turnOf(3, [logLine('log-c', 3, other, `${name} drew a monster.`), ...round1])))
      expect(await screen.findByLabelText('Since your last turn')).toBeTruthy()
      expect(screen.getByText(/drew a monster/)).toBeTruthy()
    })
  }
})

function dispatchState(next) {
  store.state = next
  for (const l of store.listeners) l()
}
