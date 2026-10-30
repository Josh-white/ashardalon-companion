// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { Component, useSyncExternalStore } from 'react'
import { readFileSync } from 'node:fs'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { normalizeCardFile } from '../data/cards.js'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { powerSlotsFor } from '../state/heroSetup.js'
import { ROBOT_CARD_FILE } from './robotCards.js'

// The robot: plays whole games by itself, tapping a random button on the real screens again
// and again, with every tap going through the real game rules. Most games are solo games on
// the virtual board; every 4th is a party game on the shared table screen (every other one of
// those on the party's virtual board, the rest with real tiles on the table), and every 4th
// after seed 2 is a solo game of a made-up campaign (robotCards.js).
// It doesn't try to win; it looks for a screen that goes blank or a tap the rules can't take
// (like the monster-move crash in PR 131), so those are caught before a merge goes live.
//
// Every game is seeded, so a failure can be played again exactly:
//   ROBOT_SEED=1234 ROBOT_GAMES=1 npm run robot
// More games or longer ones, to dig deeper than the checks do:
//   ROBOT_GAMES=40 ROBOT_TAPS=600 npm run robot
// Your own card file (the real cards.json on the Pi, say) instead of the made-up one:
//   ROBOT_CARDS=cards/cards.json npm run robot

const GAMES = Number(process.env.ROBOT_GAMES) || 16
const TAPS = Number(process.env.ROBOT_TAPS) || 300
const FIRST_SEED = Number(process.env.ROBOT_SEED) || 1
const CARD_FILE = process.env.ROBOT_CARDS ? JSON.parse(readFileSync(process.env.ROBOT_CARDS, 'utf8')) : ROBOT_CARD_FILE
const CARDS = normalizeCardFile(CARD_FILE)

// Taps the robot never makes: ones that end or leave the game, and sound switches.
const SKIP = [/New game/i, /We won/i, /We lost/i, /switch$/i, /Sound/i, /Music/i, /🔊|🔇|🎵/, /Finish and archive/i, /Back to the normal lobby/i, /Which game/i, /Switch game/i, /Card pictures/i]

// --- Seeded dice ---------------------------------------------------------------------------

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
// Three streams from each game's seed: the robot's own choices, the dice and shuffles the
// screens send with their taps, and anything else on the page that wants a random number.
// Kept apart, a screen that happens to ask for one more number doesn't change the game.
let random = seeded(FIRST_SEED)
let dice = seeded(FIRST_SEED)
let other = seeded(FIRST_SEED)

// --- A Pi in the test: the screens' taps go straight through the game rules ----------------

const store = { state: null, history: [], listeners: new Set(), crash: null }
// The app and its rules, loaded fresh for every game (see playGame).
let app = null
const setState = (next) => {
  store.state = next
  for (const listener of store.listeners) listener()
}
function robotDispatch(action) {
  if (store.crash) return
  if (action.type === 'UNDO') {
    if (action.depth !== store.history.length) return
    const previous = store.history.pop()
    if (previous) setState({ ...previous, moment: null })
    return
  }
  let next
  try {
    next = app.gameReducer(store.state, action)
  } catch (error) {
    // Recorded, not thrown: the tap's own handler would swallow it otherwise.
    store.crash ??= { where: `the game rules, on ${action.type}`, error }
    return
  }
  if (next === store.state) return
  store.history.push(store.state)
  if (store.history.length > 30) store.history.shift()
  setState(next)
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
        dispatch: robotDispatch,
        undo: store.history.length > 0 ? 'the last change' : null,
        undoDepth: store.history.length,
        instance: 'Robot',
        screens: [],
        game: { id: real.FAMILY_GAME, name: 'Robot game' },
        gamesVersion: 0,
        changeGames: () => {},
        startGame: async () => ({ type: 'new-game-refused', reason: 'offline' }),
      }
    },
  }
})

// The robot can't hear; sound stays off.
vi.mock('../audio/soundSetting.js', async (importOriginal) => ({
  ...(await importOriginal()),
  useSoundSetting: () => [false, () => {}],
  useMusicSetting: () => [false, () => {}],
  useAudioLocked: () => false,
}))

// A screen that throws while drawing would leave the iPad blank; this catches it instead.
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
  vi.stubGlobal('fetch', async (url) => {
    const body = String(url).includes('cards.json') ? CARDS : {}
    return { ok: true, status: 200, json: async () => body }
  })
  // Every die and shuffle comes from the seed.
  vi.spyOn(crypto, 'getRandomValues').mockImplementation((values) => {
    for (let i = 0; i < values.length; i++) values[i] = Math.floor(dice() * 2 ** 32)
    return values
  })
  vi.spyOn(Math, 'random').mockImplementation(() => other())
  window.HTMLElement.prototype.scrollIntoView = () => {}
  window.HTMLElement.prototype.scrollTo = () => {}
  // "Move on anyway?" and the like: the robot says yes or no at random.
  vi.spyOn(window, 'confirm').mockImplementation(() => random() < 0.5)
  window.addEventListener('error', (event) => {
    store.crash ??= { where: 'a tap', error: event.error ?? new Error(event.message) }
  })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

// --- The robot -------------------------------------------------------------------------------

const pick = (list) => list[Math.floor(random() * list.length)]
const label = (el) => (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80)

// Taps a player makes now and then, not every turn: fixing numbers by hand, looking at
// things, tabs. The robot makes them less often, so its games get somewhere.
const NOW_AND_THEN = [/^[−+]$/, /Zoom/i, /board$/i, /[LG][oa][si][en] 1 HP/i, /Tap to see why/i, /Menu/i, /^\W*(Log|Monsters|Party|Quest)/, /✋/, /(gains|loses) 1 HP/, /Read the card/i, /Hide the card/i, /conditions/i, /^(Weakened|Dazed|Poisoned|Immobilized|Slowed)$/, /Treasure token/i, /Put a villain/i, /^← Back$/, /^Close$/, /^Cancel$/]
const weightOf = (text) => (/Undo/.test(text) ? 0.03 : NOW_AND_THEN.some((re) => re.test(text)) ? 0.1 : 1)

// Everything on the screen the robot could tap or choose right now, each with how likely
// the robot is to pick it.
function choices() {
  const buttons = [...document.querySelectorAll('button')].filter((b) => !b.disabled && !SKIP.some((re) => re.test(label(b))))
  const selects = [...document.querySelectorAll('select')].filter((s) => !s.disabled && s.options.length > 1)
  // On the virtual board: the lit squares a figure can go to, and the figures themselves.
  const squares = [...document.querySelectorAll('svg rect.cursor-pointer')]
  const figures = [...document.querySelectorAll('svg g.cursor-pointer')]
  return [
    ...buttons.map((el) => ({ el, kind: 'tap', weight: weightOf(label(el)) })),
    ...selects.map((el) => ({ el, kind: 'choose', weight: 0.3 })),
    ...squares.map((el) => ({ el, kind: 'square', weight: 4 / squares.length })),
    ...figures.map((el) => ({ el, kind: 'figure', weight: el.dataset.token ? 1 : 0.1 })),
  ]
}

function pickWeighted(options) {
  let roll = random() * options.reduce((sum, o) => sum + o.weight, 0)
  return options.find((o) => (roll -= o.weight) < 0) ?? options.at(-1)
}

// Which kind of game a seed plays: 'solo', 'campaign' (solo, on the made-up campaign), or a
// party game ('party-board' on the party's virtual board, 'party-tiles' with real tiles).
// Picked from the seed, not the dice.
const kindOf = (seed) => (seed % 4 === 2 ? 'campaign' : seed % 4 !== 0 ? 'solo' : seed % 8 === 0 ? 'party-board' : 'party-tiles')

// The lobby, filled in the way the solo screen does: an adventure, 1 to 5 heroes, their powers.
function lobbyFor(game) {
  const { gameReducer, initialState } = app
  const adventures = CARDS.adventures.filter((a) => !a.campaign && gameReducer(initialState, { type: 'CHOOSE_ADVENTURE', adventure: a }).lobbyAdventure)
  const adventure = game.kind === 'campaign' ? CARDS.adventures.find((a) => a.campaign) : adventures.length > 0 && random() < 0.8 ? pick(adventures) : null
  const heroCount = 1 + Math.floor(random() * 3)
  const heroes = [...HERO_TEMPLATES].sort(() => random() - 0.5).slice(0, heroCount)
  let state = gameReducer(initialState, { type: 'CHOOSE_ADVENTURE', adventure })
  const party = game.kind.startsWith('party')
  if (party) state = gameReducer(state, { type: 'SET_LOBBY_BOARD', on: game.kind === 'party-board' })
  heroes.forEach((template, i) => {
    const deviceId = party ? `robot-ipad-${i + 1}` : `robot~solo-${i + 1}`
    const used = new Set()
    const picks = powerSlotsFor(template).map((type) => {
      const card = pick(CARDS.powers.filter((c) => c.hero === template.key && c.type === type && !used.has(c.id)))
      if (card) used.add(card.id)
      return card ?? null
    })
    state = gameReducer(state, { type: 'CLAIM_HERO', deviceId, heroKey: template.key, picks, player: `Player ${i + 1}` })
    if (party) state = gameReducer(state, { type: 'SET_LOBBY_READY', deviceId, ready: true })
  })
  game.adventure = adventure?.title ?? 'free play'
  game.heroes = heroes.map((t) => t.name)
  if (!party) return state
  // A party game starts from the big screen's Enter the dungeon (Setup.jsx) once every iPad
  // is ready, sending the same cards and dice.
  const numbers = (n) => Array.from({ length: n }, () => random())
  return gameReducer(state, {
    type: 'START_GAME',
    treasureCards: CARDS.treasures,
    chambers: CARDS.chambers,
    tokens: CARDS.treasureTokens,
    random: numbers(128),
    tileRandom: numbers(8),
    ...(game.kind === 'party-board' ? { boardTiles: CARDS.tiles, boardRandom: numbers(64) } : {}),
  })
}

async function playGame(seed) {
  // Fresh modules, so nothing (a counter for new ids, the loaded cards) carries over from
  // the game before: a seed plays the same game whether it's played alone or after others.
  vi.resetModules()
  const [{ default: App }, { gameReducer, initialState }] = await Promise.all([import('../App.jsx'), import('../state/game.js')])
  app = { gameReducer, initialState }
  random = seeded(seed)
  dice = seeded(seed + 1_000_003)
  other = seeded(seed + 2_000_003)
  const game = { seed, kind: kindOf(seed), taps: [] }
  store.crash = null
  store.history = []
  store.state = lobbyFor(game)
  if (game.kind.startsWith('party') && store.state.status !== 'playing') return { ...game, problem: "the party game didn't start" }
  localStorage.clear()
  sessionStorage.clear()
  sessionStorage.setItem('ashardalon-companion/intro-seen', 'yes')
  localStorage.setItem('ashardalon-companion/device', 'robot')
  localStorage.setItem('ashardalon-companion/game', 'family')
  localStorage.setItem('ashardalon-companion/screen', game.kind.startsWith('party') ? 'hero' : 'solo')
  // The party plays on the shared table screen, with every hero's turn on it.
  if (game.kind.startsWith('party')) localStorage.setItem('ashardalon-companion/seat', 'table')

  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'Date'] })
  vi.setSystemTime(new Date('2026-10-30T19:00:00'))
  render(
    <CrashCatcher>
      <App />
    </CrashCatcher>,
  )
  // Let the cards load, then a player-sized pause after every tap, so moments and dice finish.
  const wait = () => act(async () => vi.advanceTimersByTimeAsync(4000))
  await wait()

  if (!game.kind.startsWith('party')) {
    const enter = [...document.querySelectorAll('button')].find((b) => /Enter the dungeon/.test(b.textContent))
    if (!enter || enter.disabled) return { ...game, problem: `the solo lobby wouldn't let the robot in (${document.body.textContent.slice(0, 200)})` }
    fireEvent.click(enter)
    await wait()
  }

  for (let n = 0; n < TAPS && !store.crash; n++) {
    if (store.state.status === 'won' || store.state.status === 'lost') break
    const options = choices()
    if (options.length === 0) return { ...game, problem: 'nothing left on the screen to tap' }
    const { el, kind } = pickWeighted(options)
    if (kind === 'square' || kind === 'figure') {
      const what = el.dataset.token ?? el.dataset.item ?? el.dataset.marker ?? `square ${el.getAttribute('x')},${el.getAttribute('y')}`
      game.taps.push(`tap the board: ${what}`)
      fireEvent.click(el)
    } else if (kind === 'choose') {
      const option = pick([...el.options].filter((o) => !o.disabled && o.value !== el.value))
      if (!option) continue
      game.taps.push(`choose "${option.textContent.trim()}" (${store.state.turn.round}/${store.state.turn.phase})`)
      fireEvent.change(el, { target: { value: option.value } })
    } else {
      game.taps.push(`tap "${label(el)}"`)
      fireEvent.click(el)
    }
    await wait()
  }
  game.status = store.state.status
  game.round = store.state.turn.round
  game.tiles = store.state.board?.tiles.length ?? 0
  if (store.crash) game.problem = `crashed in ${store.crash.where}: ${store.crash.error?.stack ?? store.crash.error}`
  else if (game.kind === 'campaign' && !store.state.campaign) game.problem = "the campaign didn't start"
  return game
}

function report(game) {
  return [
    `Robot ${game.kind} game with seed ${game.seed} (${game.adventure}; ${game.heroes.join(', ')}) ${game.problem}`,
    `Play it again: ROBOT_SEED=${game.seed} ROBOT_GAMES=1 npm run robot`,
    'Its last taps:',
    ...game.taps.slice(-25).map((t, i, all) => `  ${game.taps.length - all.length + i + 1}. ${t}`),
  ].join('\n')
}

describe('the robot', () => {
  for (let i = 0; i < GAMES; i++) {
    const seed = FIRST_SEED + i
    it(`plays a whole game without crashing (seed ${seed})`, async () => {
      const game = await playGame(seed)
      process.stderr.write(`Robot ${game.kind} game ${seed}: ${game.adventure} with ${game.heroes?.join(', ')}, ${game.taps.length} taps, reached round ${game.round} with ${game.tiles} tiles out\n`)
      expect(game.problem, game.problem && report(game)).toBeUndefined()
    }, 120_000)
  }
})
