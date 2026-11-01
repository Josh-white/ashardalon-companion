// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { Component, useSyncExternalStore } from 'react'
import { readFileSync } from 'node:fs'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { normalizeCardFile } from '../data/cards.js'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { startingPicks } from '../components/Setup.jsx'
import { powerSlotsFor } from '../state/heroSetup.js'
import { ROBOT_CARD_FILE } from './robotCards.js'

// Games where the computer plays every hero (src/ally/): the table screen is the one screen
// open, so it plays them, with nobody tapping anything, unless an ally asks for a hand.
// Then a "player" taps a button of the turn screen at random, as a kid helping out would.
// The game has to keep moving: round after round, until it's won or lost, without a crash.
//   ALLY_GAMES=10 ALLY_STEPS=800 npx vitest run src/robot/allies.test.jsx
//   ROBOT_CARDS=cards/cards.json ...   to play with the Pi's real cards

const GAMES = Number(process.env.ALLY_GAMES) || 4
const STEPS = Number(process.env.ALLY_STEPS) || 400
const FIRST_SEED = Number(process.env.ALLY_SEED) || 1
const CARD_FILE = process.env.ROBOT_CARDS ? JSON.parse(readFileSync(process.env.ROBOT_CARDS, 'utf8')) : ROBOT_CARD_FILE
const CARDS = normalizeCardFile(CARD_FILE)

function seeded(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
let random = seeded(1)
let dice = seeded(1)

const store = { state: null, listeners: new Set(), crash: null, log: [] }
let reducer = null
function dispatch(action) {
  if (store.crash || action.type === 'UNDO') return
  let next
  try {
    next = reducer(store.state, action)
  } catch (error) {
    store.crash ??= { where: `the game rules, on ${action.type}`, error }
    return
  }
  if (next === store.state) return
  const seen = store.state.log?.[0]?.id
  const added = []
  for (const line of next.log ?? []) {
    if (line.id === seen) break
    added.push(line)
  }
  store.log.push(...added.reverse())
  store.state = next
  for (const listener of store.listeners) listener()
}

vi.mock('../state/useSharedGame.js', async (importOriginal) => {
  const real = await importOriginal()
  return {
    ...real,
    useSharedGame: () => {
      const state = useSyncExternalStore(
        (listener) => (store.listeners.add(listener), () => store.listeners.delete(listener)),
        () => store.state,
      )
      return {
        state,
        connected: true,
        dispatch,
        undo: null,
        undoDepth: 0,
        instance: 'Robot',
        // Only the table screen is open, so it plays the allies.
        screens: ['table'],
        game: { id: real.FAMILY_GAME, name: 'Ally game' },
        gamesVersion: 0,
        changeGames: () => {},
        startGame: async () => ({ type: 'new-game-refused', reason: 'offline' }),
      }
    },
  }
})
vi.mock('../audio/soundSetting.js', async (importOriginal) => ({
  ...(await importOriginal()),
  useSoundSetting: () => [false, () => {}],
  useMusicSetting: () => [false, () => {}],
  useAudioLocked: () => false,
}))

class CrashCatcher extends Component {
  state = { crashed: false }
  static getDerivedStateFromError() {
    return { crashed: true }
  }
  componentDidCatch(error) {
    store.crash ??= { where: 'a screen', error }
  }
  render() {
    return this.state.crashed ? <p>crashed</p> : this.props.children
  }
}

beforeAll(() => {
  vi.stubGlobal('fetch', async (url) => ({ ok: true, status: 200, json: async () => (String(url).includes('cards.json') ? CARDS : {}) }))
  vi.spyOn(crypto, 'getRandomValues').mockImplementation((values) => {
    for (let i = 0; i < values.length; i++) values[i] = Math.floor(dice() * 2 ** 32)
    return values
  })
  vi.spyOn(Math, 'random').mockImplementation(() => dice())
  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.HTMLElement.prototype.scrollIntoView = () => {}
  window.HTMLElement.prototype.scrollTo = () => {}
  vi.spyOn(window, 'confirm').mockImplementation(() => true)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const label = (el) => (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80)
const pick = (list) => list[Math.floor(random() * list.length)]

async function playGame(seed) {
  vi.resetModules()
  const [{ default: App }, { gameReducer, initialState }] = await Promise.all([import('../App.jsx'), import('../state/game.js')])
  reducer = gameReducer
  random = seeded(seed)
  dice = seeded(seed + 1_000_003)
  store.crash = null
  store.log = []
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'Date'] })
  vi.setSystemTime(new Date('2026-10-30T19:00:00'))
  const numbers = (n) => Array.from({ length: n }, () => random())
  const heroes = [...HERO_TEMPLATES].sort(() => random() - 0.5).slice(0, 1 + (seed % 3))
  let state = gameReducer(initialState, { type: 'SET_LOBBY_BOARD', on: true })
  heroes.forEach((template) => {
    // The suggested powers, and the first free card for any slot without one (a card file with no suggestions).
    const picks = startingPicks(template, CARDS.powers)
    const slots = powerSlotsFor(template)
    picks.forEach((card, i) => {
      if (!card) picks[i] = CARDS.powers.find((c) => c.hero === template.key && c.type === slots[i] && !picks.some((p) => p?.id === c.id)) ?? null
    })
    state = gameReducer(state, { type: 'CLAIM_HERO', deviceId: `ally:${template.key}`, heroKey: template.key, picks, ally: true })
  })
  state = gameReducer(state, {
    type: 'START_GAME',
    treasureCards: CARDS.treasures,
    chambers: CARDS.chambers,
    tokens: CARDS.treasureTokens,
    random: numbers(128),
    tileRandom: numbers(8),
    boardTiles: CARDS.tiles,
    boardRandom: numbers(64),
  })
  store.state = state
  const game = { seed, heroes: heroes.map((h) => h.name), helps: 0, steps: 0, problem: null }
  if (state.status !== 'playing' || !state.heroes.every((h) => h.ally)) return { ...game, problem: "the allies' game didn't start" }

  localStorage.clear()
  sessionStorage.clear()
  sessionStorage.setItem('ashardalon-companion/intro-seen', 'yes')
  localStorage.setItem('ashardalon-companion/device', 'robot')
  localStorage.setItem('ashardalon-companion/game', 'family')
  localStorage.setItem('ashardalon-companion/screen', 'hero')
  localStorage.setItem('ashardalon-companion/seat', 'table')
  render(
    <CrashCatcher>
      <App />
    </CrashCatcher>,
  )
  const where = () => `${store.state.turn.round}/${store.state.turn.heroIndex}/${store.state.turn.phase}`
  let last = { where: where(), step: 0 }
  for (let n = 0; n < STEPS && !store.crash; n++) {
    game.steps = n
    if (store.state.status !== 'playing') break
    await act(async () => vi.advanceTimersByTimeAsync(3000))
    if (process.env.ALLY_DEBUG && n < 5) process.stderr.write(`step ${n}: ${where()} firstRoll=${JSON.stringify(store.state.firstRoll)} opening=${Boolean(store.state.opening)} body=${document.body.textContent.slice(0, 300)}\n`)
    // An ally asked for a hand: a kid taps something on the turn screen.
    if (store.state.turn.allyHelp) {
      game.helps += 1
      game.lastHelp = `${store.state.turn.allyHelp} (${where()}) buttons: ${[...document.querySelectorAll('[data-ally-scope] button:not(:disabled)')].map(label).join(' | ')}`
      if (process.env.ALLY_LOG) process.stderr.write(`HELP ${game.lastHelp}\n`)
      // Mostly the step's own buttons; taking an answer back or Skip only when there's nothing else.
      const all = [...document.querySelectorAll('[data-ally-scope] button:not(:disabled), [data-ally-scope] select')].filter((b) => !/Back|Pause/.test(label(b)))
      const buttons = all.filter((b) => !/^↓|Skip|Oops|got it wrong|let me answer|What the card says|Read the card|Hide the card|tips|How .* works/.test(label(b)))
      const squares = [...document.querySelectorAll('svg rect.cursor-pointer')]
      const picking = store.state.turn.boardMove || store.state.turn.trapPick
      const oops = all.filter((b) => /Oops|got it wrong/.test(label(b)))
      const options = picking && squares.length > 0 ? squares : buttons.length > 0 ? buttons : oops.length > 0 ? oops : all
      const el = pick(options)
      if (process.env.ALLY_LOG) process.stderr.write(`KID taps ${el ? label(el) || el.tagName : 'nothing'} (picking ${Boolean(picking)})\n`)
      if (el?.tagName === 'SELECT') {
        const option = pick([...el.options].filter((o) => !o.disabled && o.value !== el.value))
        if (option) fireEvent.change(el, { target: { value: option.value } })
      } else if (el) fireEvent.click(el)
    }
    if (where() !== last.where) last = { where: where(), step: n }
    else if (n - last.step >= 60) {
      game.problem = `got stuck at ${last.where}; ${game.lastHelp ?? 'no help asked'}; the turn screen says: ${[...document.querySelectorAll('[data-ally-scope]')].map((el) => el.textContent).join(' / ').slice(0, 1500)}`
      break
    }
  }
  game.status = store.state.status
  game.round = store.state.turn.round
  game.tiles = store.state.board?.tiles.length ?? 0
  if (store.crash) game.problem = `crashed in ${store.crash.where}: ${store.crash.error?.stack ?? store.crash.error}`
  return game
}

describe('computer allies', () => {
  for (let i = 0; i < GAMES; i++) {
    const seed = FIRST_SEED + i
    it(`play a whole game by themselves (seed ${seed})`, async () => {
      const game = await playGame(seed)
      process.stderr.write(
        `Ally game ${seed}: ${game.heroes.join(', ')}, ${game.steps} steps, round ${game.round}, ${game.tiles} tiles, ${game.status}, asked for a hand ${game.helps} times\n`,
      )
      if (process.env.ALLY_LOG) process.stderr.write(store.log.map((l) => `  ${l.round}/${l.heroIndex} ${l.text}`).join('\n') + '\n')
      expect(game.problem, game.problem).toBeNull()
      // Out of the start: the allies explored and fought, round after round.
      expect(game.round).toBeGreaterThan(2)
    }, 300_000)
  }
})
