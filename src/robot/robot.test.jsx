// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { Component, useSyncExternalStore } from 'react'
import { appendFileSync, readFileSync } from 'node:fs'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { normalizeCardFile } from '../data/cards.js'
import { powerSlotsFor } from '../state/heroSetup.js'
import { campaignOutcome } from '../state/campaign.js'
import { TOWN_EVENTS } from '../data/townEvents.js'
import { easyCards, ROBOT_CARD_FILE } from './robotCards.js'

// The robot: plays whole games by itself, tapping a random button on the real screens again
// and again, with every tap going through the real game rules. Most games are solo games on
// the virtual board; every 4th is a party game on the shared table screen (every other one of
// those on the party's virtual board, the rest with real tiles on the table), and every 4th
// after seed 2 is a solo game of a made-up campaign (robotCards.js).
// Every 3rd solo game starts from the empty solo lobby and picks its heroes and powers there.
// It doesn't try to win; it looks for a screen that goes blank, a tap the rules can't take
// (like the monster-move crash in PR 131), or a game that stops moving on (the turn stays put
// for 600 taps), so those are caught before a merge goes live.
//
// Every game is seeded, so a failure can be played again exactly:
//   ROBOT_SEED=1234 ROBOT_GAMES=1 npm run robot
// More games or longer ones, to dig deeper than the checks do:
//   ROBOT_GAMES=40 ROBOT_TAPS=600 npm run robot
// Your own card file (the real cards.json on the Pi, say) instead of the made-up one:
//   ROBOT_CARDS=cards/cards.json npm run robot
// A game-night checkup: every adventure in the card file in turn (or the ones listed, by id),
// each played as a party game (solo for a one-hero adventure), board and real tiles in turn:
//   ROBOT_CARDS=cards/cards.json ROBOT_ADVENTURES=all ROBOT_GAMES=52 npm run robot
//   ROBOT_CARDS=cards/cards.json ROBOT_ADVENTURES=adventure-4,adventure-6 npm run robot
// Every tap of every game written to a file, to see what the robot did, and the end of each
// game's own log (what the app says happened):
//   ROBOT_TAPLOG=robot-taps.txt ROBOT_GAMELOG=robot-log.txt npm run robot
// Playing to win: a random robot almost never finds a chamber or beats a campaign, so some
// games are played in easy mode (robotCards.js easyCards: one-hit monsters and villains, the
// Chamber Entrance in the first few tiles) and keep going after a win: on through the
// recap, the campaign lobby on the big screen and the next adventure, to the campaign's end.
// In CI every 8th game (seeds 6, 14, ...) plays the made-up clan campaign that way. For a
// checkup, ROBOT_WIN=1 plays every adventure to win, campaigns as a party:
//   ROBOT_CARDS=cards/cards.json ROBOT_ADVENTURES=adventure-6,adventure-13 ROBOT_WIN=1 npm run robot

const GAMES = Number(process.env.ROBOT_GAMES) || 16
const TAPS = Number(process.env.ROBOT_TAPS) || 300
// Taps a solo game that starts from the empty lobby gets to pick its heroes and enter.
const LOBBY_TAPS = 120
// Taps with the turn going nowhere before the robot calls the game stuck.
const STUCK_TAPS = Number(process.env.ROBOT_STUCK) || 600
const FIRST_SEED = Number(process.env.ROBOT_SEED) || 1
const CARD_FILE = process.env.ROBOT_CARDS ? JSON.parse(readFileSync(process.env.ROBOT_CARDS, 'utf8')) : ROBOT_CARD_FILE
const PLAIN_CARDS = normalizeCardFile(CARD_FILE)
// Play-to-win games keep to the box's heroes: the made-up fan heroes add so many buttons that
// random taps rarely get a chamber beaten (the allies' games play the fan heroes instead).
const EASY_CARDS = normalizeCardFile({ ...easyCards(CARD_FILE), heroes: (CARD_FILE.heroes ?? []).filter((h) => !h.levels) })
// Easy mode only changes numbers; a card it broke would quietly drop out of the game.
for (const kind of ['monsters', 'villains', 'encounters', 'adventures']) {
  if (EASY_CARDS[kind].length !== PLAIN_CARDS[kind].length) throw new Error(`Easy mode lost some ${kind}: ${EASY_CARDS.problems.join(' ')}`)
}
// The cards the game being played uses (easy ones for a play-to-win game), as the screens load them.
let CARDS = PLAIN_CARDS
const WIN = Boolean(process.env.ROBOT_WIN)
// Taps a play-to-win game gets: a whole campaign is several adventures.
const WIN_TAPS = Math.max(TAPS, Number(process.env.ROBOT_WIN_TAPS) || 2500)
// Taps on the big screen's campaign lobby between adventures, before the robot enters the dungeon,
// leaving alone the ones that would turn the big screen into something else.
const CAMPAIGN_LOBBY_TAPS = 30
const LOBBY_SKIP = [/Use this screen for something else/i]
// Taps on one hero's iPad in the campaign lobby (its powers, the shop) before that.
const IPAD_LOBBY_TAPS = 15
const CHECKUP = process.env.ROBOT_ADVENTURES
  ? PLAIN_CARDS.adventures.filter((a) => process.env.ROBOT_ADVENTURES === 'all' || process.env.ROBOT_ADVENTURES.split(',').includes(a.id))
  : null

// Taps the robot never makes: ones that end or leave the game, and sound switches.
const SKIP = [/New game/i, /End the campaign/i, /Free this hero/i, /We won/i, /We lost/i, /switch$/i, /Sound/i, /Music/i, /🔊|🔇|🎵|☀️|🌙/, /Finish and archive/i, /Back to the normal lobby/i, /Which game/i, /Switch game/i, /Card pictures/i, /^🔥$/]

// Taps a play-to-win game leaves alone too: taking HP off a hero by hand, the − and +
// buttons (XP, healing surges, tiles left), and Undo, which takes back the win it's after.
const WIN_SKIP = [/[LG]oses 1 HP/i, /^[−+]$/, /Undo/]
let playingToWin = false

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

const store = { state: null, history: [], listeners: new Set(), crash: null, log: [], carried: null }
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
  // On to the next campaign adventure: what each hero takes with them (their level, gold and
  // items when the party left the recap, after any last level-up or Treasure token there).
  if (action.type === 'CAMPAIGN_NEXT') {
    store.carried = store.state.heroes.map((h) => ({ key: h.key, level: h.level, gold: h.gold ?? 0, items: (h.items ?? []).map((i) => i.cardId) }))
  }
  // Playing to win, every adventure's heroes start with three times their hit points: easy
  // cards can't soften the hazards and environments the rules themselves deal damage for.
  if (playingToWin && next.status === 'playing' && store.state.status !== 'playing') {
    next = { ...next, heroes: next.heroes.map((h) => ({ ...h, maxHp: h.maxHp * 3, hp: h.maxHp * 3 })) }
  }
  store.history.push(store.state)
  if (store.history.length > 30) store.history.shift()
  // The game keeps only its last log lines; the robot keeps them all, for ROBOT_GAMELOG.
  const seen = store.state.log?.[0]?.id
  const added = []
  for (const line of next.log ?? []) {
    if (line.id === seen) break
    added.push(line)
  }
  store.log.push(...added.reverse())
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
  // The big screen fits itself to the window; jsdom has no layout to watch.
  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
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
const NOW_AND_THEN = [/^[−+]$/, /Zoom/i, /board$/i, /[LG][oa][si][en] 1 HP/i, /Tap to see why/i, /Menu/i, /^\W*(Log|Monsters|Party|Quest)/, /✋/, /(gains|loses) 1 HP/, /Read the card/i, /Hide the card/i, /conditions/i, /^(Weakened|Dazed|Poisoned|Immobilized|Slowed)$/, /Treasure token/i, /Put a villain/i, /^← Back$/, /^Close$/, /^Close .*'s card$/, /^Cancel$/, /^🪨 /, /^(Attack bonus|AC|Speed) ?[+−\d]/, /^↓ /, /[▾▴]$/, /HP · AC \d/, /Pick a different hero/, /Change powers/, /^Change$/, /tips/, /We escaped/, /^\W*How .* works/, /^Got it!$/]
// In the lobby the robot leans toward getting in, or it would pick and unpick powers all night.
const LEANS = [/Enter the dungeon/, /Done choosing powers/, /^Tap to pick/, /On to the next adventure/]
// Playing to win, the robot also goes after the villain, rolls its attacks, and doesn't
// hurry out of its Hero Phase.
const WIN_LEANS = [
  [/👑 Villain/, 6],
  [/^🎲 Roll (?!the .* attack \(\+)/, 3],
  [/On to Exploration Phase/, 0.3],
]
const weightOf = (text) => {
  if (/Undo/.test(text)) return 0.03
  // The Turn tab: back to the turn from the board or the other tabs, now and then.
  if (/^\W*Turn$/.test(text)) return 0.4
  if (NOW_AND_THEN.some((re) => re.test(text))) return 0.1
  if (LEANS.some((re) => re.test(text))) return 4
  return (playingToWin && WIN_LEANS.find(([re]) => re.test(text))?.[1]) || 1
}

// Everything on the screen the robot could tap or choose right now, each with how likely
// the robot is to pick it.
function choices(also = []) {
  const skip = [...SKIP, ...(playingToWin ? WIN_SKIP : []), ...also]
  const buttons = [...document.querySelectorAll('button')].filter((b) => !b.disabled && !skip.some((re) => re.test(label(b))))
  const selects = [...document.querySelectorAll('select')].filter((s) => !s.disabled && s.options.length > 1)
  // On the virtual board: the lit squares a figure can go to, and the figures themselves.
  const squares = [...document.querySelectorAll('svg rect.cursor-pointer')]
  const figures = [...document.querySelectorAll('svg g.cursor-pointer')]
  const taps = buttons.map((el) => ({ el, kind: 'tap', weight: weightOf(label(el)) }))
  return [
    ...taps.filter((o) => o.weight >= 1),
    // However many of them a screen shows (a power card each has Read the card), the
    // now-and-then taps and the figures together only get a share, so the game moves on.
    ...shareOf(taps.filter((o) => o.weight < 1), 0.6),
    ...selects.map((el) => ({ el, kind: 'choose', weight: 0.3 })),
    ...squares.map((el) => ({ el, kind: 'square', weight: 4 / squares.length })),
    ...shareOf(figures.map((el) => ({ el, kind: 'figure', weight: el.dataset.token ? 1 : 0.1 })), 1.5),
  ]
}

// Shrinks a group's weights so they add up to at most `most`.
function shareOf(options, most) {
  const total = options.reduce((sum, o) => sum + o.weight, 0)
  return total <= most ? options : options.map((o) => ({ ...o, weight: (o.weight * most) / total }))
}

function pickWeighted(options) {
  let roll = random() * options.reduce((sum, o) => sum + o.weight, 0)
  return options.find((o) => (roll -= o.weight) < 0) ?? options.at(-1)
}

// Which kind of game a seed plays: 'solo', 'campaign' (solo, on the made-up campaign), or a
// party game ('party-board' on the party's virtual board, 'party-tiles' with real tiles).
// Picked from the seed, not the dice.
// In a checkup, the adventure comes from the seed's place in the list (seed 1 is the first),
// and so does the kind, so a seed plays the same game alone as in a batch.
const checkupAdventure = (seed) => CHECKUP[(seed - 1) % CHECKUP.length]
function checkupKind(seed) {
  const adventure = checkupAdventure(seed)
  // Played to win, a campaign is a party's, like the book's (2-5 heroes).
  if (adventure.campaign && !WIN) return 'campaign'
  if (playerRange(adventure)[1] < 2) return 'solo'
  return Math.floor((seed - 1) / CHECKUP.length) % 2 === 0 ? 'party-board' : 'party-tiles'
}
// "2-5" or "1" on the adventure, as [fewest, most] heroes.
const playerRange = (adventure) => {
  const [low, high = low] = String(adventure?.players ?? '1-5').split('-').map(Number)
  return [low || 1, high || 5]
}
const kindOf = (seed) =>
  CHECKUP ? checkupKind(seed)
  : seed % 8 === 6 ? (seed % 16 === 6 ? 'party-board' : 'party-tiles')
  : seed % 4 === 2 ? 'campaign' : seed % 4 !== 0 ? 'solo' : seed % 8 === 0 ? 'party-board' : 'party-tiles'
// Games played to win: every checkup game with ROBOT_WIN, and the made-up clan campaign in CI.
const winsOf = (seed) => (CHECKUP ? WIN : seed % 8 === 6)

// A random power card for each of the hero's slots.
function randomPicks(template) {
  const used = new Set()
  return powerSlotsFor(template).map((type) => {
    const card = pick(CARDS.powers.filter((c) => c.hero === template.key && c.type === type && !used.has(c.id)))
    if (card) used.add(card.id)
    return card ?? null
  })
}

// The lobby, filled in the way the solo screen does: an adventure, 1 to 5 heroes, their powers.
function lobbyFor(game) {
  const { gameReducer, initialState } = app
  const adventures = CARDS.adventures.filter((a) => !a.campaign && gameReducer(initialState, { type: 'CHOOSE_ADVENTURE', adventure: a }).lobbyAdventure)
  const adventure = CHECKUP
    ? CARDS.adventures.find((a) => a.id === checkupAdventure(game.seed).id)
    : game.win ? CARDS.adventures.find((a) => a.id === 'robot-clans')
    : game.kind === 'campaign' ? CARDS.adventures.find((a) => a.campaign) : adventures.length > 0 && random() < 0.8 ? pick(adventures) : null
  // A checkup brings the party the adventure asks for (2 to 4 heroes); otherwise 1 to 3.
  const [fewest, most] = CHECKUP || game.win ? playerRange(adventure).map((n, i) => (i ? Math.min(n, 4) : Math.max(n, 2))) : [1, 3]
  const heroCount = Math.min(fewest, most) + Math.floor(random() * (Math.max(most - fewest, 0) + 1))
  const heroes = [...CARDS.heroes].sort(() => random() - 0.5).slice(0, heroCount)
  let state = gameReducer(initialState, { type: 'CHOOSE_ADVENTURE', adventure })
  // Playing to win, the party takes all the healing surges the lobby allows.
  if (game.win) state = gameReducer(state, { type: 'SET_LOBBY_SURGES', surges: 99 })
  if (adventure && !state.lobbyAdventure) game.problem = `the lobby wouldn't take ${adventure.title}`
  game.adventure = adventure?.title ?? 'free play'
  // Some solo games start from the empty lobby, and the robot picks its heroes and powers there.
  if (game.lobby) return state
  const party = game.kind.startsWith('party')
  if (party) state = gameReducer(state, { type: 'SET_LOBBY_BOARD', on: game.kind === 'party-board' })
  heroes.forEach((template, i) => {
    const deviceId = party ? `robot-ipad-${i + 1}` : `robot~solo-${i + 1}`
    state = gameReducer(state, { type: 'CLAIM_HERO', deviceId, heroKey: template.key, picks: randomPicks(template), player: `Player ${i + 1}` })
    if (party) state = gameReducer(state, { type: 'SET_LOBBY_READY', deviceId, ready: true })
  })
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

// Let the cards load, then a player-sized pause after every tap, so moments and dice finish.
const wait = () => act(async () => vi.advanceTimersByTimeAsync(4000))

// One tap (or choice) on whatever the screen shows; false when there's nothing to tap.
async function tapSomething(game, skip = []) {
  const options = choices(skip)
  if (options.length === 0) return false
  const { el, kind } = pickWeighted(options)
  if (kind === 'square' || kind === 'figure') {
    const what = el.dataset.token ?? el.dataset.item ?? el.dataset.marker ?? `square ${el.getAttribute('x')},${el.getAttribute('y')}`
    game.taps.push(`tap the board: ${what}`)
    fireEvent.click(el)
  } else if (kind === 'choose') {
    const option = pick([...el.options].filter((o) => !o.disabled && o.value !== el.value))
    if (!option) return true
    game.taps.push(`choose "${option.textContent.trim()}" (${store.state.turn.round}/${store.state.turn.phase})`)
    fireEvent.change(el, { target: { value: option.value } })
  } else {
    game.taps.push(`tap "${label(el)}"`)
    fireEvent.click(el)
  }
  await wait()
  return true
}

async function playGame(seed) {
  // Fresh modules, so nothing (a counter for new ids, the loaded cards) carries over from
  // the game before: a seed plays the same game whether it's played alone or after others.
  vi.resetModules()
  const [{ default: App }, { gameReducer, initialState }, { setHeroTemplates }] = await Promise.all([import('../App.jsx'), import('../state/game.js'), import('../data/heroes.js')])
  app = { gameReducer, initialState }
  random = seeded(seed)
  dice = seeded(seed + 1_000_003)
  other = seeded(seed + 2_000_003)
  const game = { seed, kind: kindOf(seed), win: winsOf(seed), taps: [], adventures: [] }
  CARDS = game.win ? EASY_CARDS : PLAIN_CARDS
  // The card file's heroes (the made-up fan heroes too), as the Pi and the screens set them.
  setHeroTemplates(CARDS.heroes)
  playingToWin = game.win
  game.lobby = !CHECKUP && game.kind === 'solo' && seed % 3 === 0
  store.crash = null
  store.history = []
  store.log = []
  store.carried = null
  store.state = lobbyFor(game)
  if (game.problem) return game
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
  const show = () =>
    render(
      <CrashCatcher>
        <App />
      </CrashCatcher>,
    )
  show()
  await wait()

  if (game.lobby) {
    // Half the lobby taps at random: picking heroes, powers, tips, the adventure. Then any hero
    // still short of powers gets random ones (picking them by chance takes all night) and in it goes.
    for (let n = 0; n < LOBBY_TAPS && !store.crash && store.state.status === 'setup'; n++) await tapSomething(game)
    if (!store.crash && store.state.status === 'setup') {
      const claims = store.state.lobby.length > 0 ? store.state.lobby : [{ deviceId: 'robot~solo-1', heroKey: pick(CARDS.heroes).key }]
      for (const claim of claims) {
        const template = CARDS.heroes.find((t) => t.key === claim.heroKey)
        robotDispatch({ type: 'CLAIM_HERO', deviceId: claim.deviceId, heroKey: claim.heroKey, picks: randomPicks(template) })
      }
      await wait()
      const enter = [...document.querySelectorAll('button')].find((b) => /Enter the dungeon/.test(b.textContent))
      if (enter && !enter.disabled) fireEvent.click(enter)
      await wait()
    }
    game.heroes = store.state.heroes.map((h) => h.name)
    if (store.crash) return { ...game, problem: `crashed in the lobby, in ${store.crash.where}: ${store.crash.error?.stack ?? store.crash.error}` }
    if (store.state.status === 'setup') return { ...game, problem: `the robot couldn't get into the dungeon from the solo lobby (${document.body.textContent.slice(0, 200)})` }
  } else if (!game.kind.startsWith('party')) {
    const enter = [...document.querySelectorAll('button')].find((b) => /Enter the dungeon/.test(b.textContent))
    if (!enter || enter.disabled) return { ...game, problem: `the solo lobby wouldn't let the robot in (${document.body.textContent.slice(0, 200)})` }
    fireEvent.click(enter)
    await wait()
  }

  // Where the turn is; if it stays put for STUCK_TAPS taps, the game is stuck (PR 148: Back
  // past an open encounter card left the turn with no way on but Undo).
  const where = () => `${store.state.status} ${store.state.turn.round}/${store.state.turn.heroIndex}/${store.state.turn.phase}`
  let lastMove = { where: where(), tap: 0 }
  const taps = game.win ? WIN_TAPS : TAPS
  // Which campaign adventure was last seen ending, and how, so each ending is noted once
  // (an Undo on the recap can take a win back, and the adventure can still end another way).
  let ended = null
  for (let n = 0; n < taps && !store.crash; n++) {
    const { status } = store.state
    if ((status === 'won' || status === 'lost') && document.querySelector('[data-end-hold]')) {
      // The end screen waits for the last roll to finish; the game under it can't be tapped.
      await wait()
      continue
    }
    if (status === 'won' || status === 'lost') {
      const adventureNo = `${store.state.campaign?.games ?? 0} ${status}`
      if (ended !== adventureNo) {
        ended = adventureNo
        const outcome = campaignOutcome(store.state)
        game.adventures.push(`${status}${store.state.adventure?.chamber ? ` ${store.state.adventure.chamber.card.name}` : ''} in round ${store.state.turn.round}`)
        if (outcome?.over) game.campaign = outcome.over
      }
      // A play-to-win campaign goes on through the recap to the next adventure.
      if (!game.win || !store.state.campaign || campaignOutcome(store.state)?.over) break
    } else if (status === 'setup' && store.state.campaign) {
      // On to the next adventure: the campaign lobby, on the big screen.
      await campaignLobby(game, show)
      if (game.problem || store.crash) break
      lastMove = { where: where(), tap: n }
      continue
    }
    if (!(await tapSomething(game))) return { ...game, problem: 'nothing left on the screen to tap' }
    if (where() !== lastMove.where) lastMove = { where: where(), tap: n }
    else if (n - lastMove.tap >= STUCK_TAPS) {
      const onScreen = [...new Set([...document.querySelectorAll('button')].filter((b) => !b.disabled).map(label))].join(' | ')
      game.problem = `got stuck: ${STUCK_TAPS} taps without the turn moving on (round/hero/phase ${lastMove.where}). Buttons on the screen: ${onScreen}`
      break
    }
  }
  game.status = store.state.status
  game.round = store.state.turn.round
  game.tiles = store.state.board?.tiles.length ?? 0
  if (game.problem) return game
  if (store.crash) game.problem = `crashed in ${store.crash.where}: ${store.crash.error?.stack ?? store.crash.error}`
  else if (game.kind === 'campaign' && !store.state.campaign) game.problem = "the campaign didn't start"
  // The made-up clan campaign in easy mode is beaten almost at once; if it never beats a
  // chamber, the way through chambers or on to the next adventure is broken.
  else if (game.win && !CHECKUP && !game.adventures.some((a) => /^won \S/.test(a) && !/^won in round/.test(a))) {
    game.problem = `never beat a chamber in ${WIN_TAPS} taps (${game.adventures.join(', ') || 'no adventure ended'})`
  }
  return game
}

// Between campaign adventures: each iPad buys from the shop now and then and gets ready, the
// robot taps around the big screen's lobby, and enters the dungeon from there, as the party does.
async function campaignLobby(game, show) {
  const state = store.state
  const problem = (what) => (game.problem = `${what} (campaign adventure ${state.campaign.games + 1})`)
  // What came over from the last adventure (rulebook p. 13: level, gold and items; XP resets).
  // A night in town can hand every hero gold, or take some (never below 0).
  const townGold = TOWN_EVENTS.find((e) => e.id === state.campaign.event?.id)?.gold ?? 0
  for (const before of store.carried ?? []) {
    const saved = state.campaign.heroes.find((h) => h.key === before.key)
    if (!saved) return problem(`${before.key} wasn't kept for the next adventure`)
    if (saved.level !== before.level || saved.gold !== Math.max(0, before.gold + townGold) || saved.items.map((i) => i.cardId).join() !== before.items.join()) {
      return problem(`${before.key} came out of the adventure at level ${before.level} with ${before.gold} gold and [${before.items}], but the campaign kept level ${saved.level}, ${saved.gold} gold and [${saved.items.map((i) => i.cardId)}]`)
    }
  }
  if (state.lobby.length !== state.campaign.heroes.length) return problem(`the lobby has ${state.lobby.length} heroes for the campaign's ${state.campaign.heroes.length}`)
  // One hero's iPad, on its "Ready your hero" screen with the shop: the robot taps around
  // there (buying, if the hero can afford it), as the player would.
  const claim = pick(state.lobby)
  game.taps.push(`--- campaign adventure ${state.campaign.games + 1}: ${claim.heroKey}'s iPad in the lobby ---`)
  cleanup()
  localStorage.setItem('ashardalon-companion/device', claim.deviceId)
  localStorage.setItem('ashardalon-companion/seat', claim.heroKey)
  show()
  await wait()
  for (let n = 0; n < IPAD_LOBBY_TAPS && !store.crash && store.state.status === 'setup'; n++) await tapSomething(game, [...LOBBY_SKIP, /Pick a different hero/])
  if (store.crash) return
  localStorage.setItem('ashardalon-companion/device', 'robot')
  // The other iPads buy now and then too, and every iPad gets ready (with a name, if the robot cleared it).
  for (const claim of store.state.lobby) {
    const hero = store.state.campaign.heroes.find((h) => h.key === claim.heroKey)
    const card = store.state.campaign.shop.find((c) => c.cost > 0 && c.cost <= hero.gold)
    if (card && random() < 0.5) {
      game.taps.push(`${claim.heroKey}'s iPad buys ${card.name} from the shop`)
      robotDispatch({ type: 'CAMPAIGN_BUY', heroKey: claim.heroKey, cardId: card.id })
    }
    if (!claim.player.trim()) robotDispatch({ type: 'SET_LOBBY_PLAYER', deviceId: claim.deviceId, player: claim.heroKey })
    robotDispatch({ type: 'SET_LOBBY_READY', deviceId: claim.deviceId, ready: true })
  }
  game.taps.push(`--- campaign adventure ${state.campaign.games + 1}: the big screen's lobby ---`)
  cleanup()
  localStorage.setItem('ashardalon-companion/seat', 'projector')
  show()
  await wait()
  for (let n = 0; n < CAMPAIGN_LOBBY_TAPS && !store.crash && store.state.status === 'setup'; n++) await tapSomething(game, LOBBY_SKIP)
  if (!store.crash && store.state.status === 'setup') {
    // Out of the Hall of Records or the like first, if the robot went in.
    const back = [...document.querySelectorAll('button')].find((b) => /^(Back|Close|Done)$/.test(label(b)))
    if (back && !document.body.textContent.includes('Enter the dungeon')) {
      fireEvent.click(back)
      await wait()
    }
    const enter = [...document.querySelectorAll('button')].find((b) => /Enter the dungeon/.test(b.textContent))
    if (!enter || enter.disabled) return problem(`the big screen wouldn't enter the dungeon (${document.body.textContent.slice(0, 300)})`)
    game.taps.push('tap "Enter the dungeon"')
    fireEvent.click(enter)
    await wait()
  }
  if (store.crash) return
  if (store.state.status !== 'playing') return problem("the next campaign adventure didn't start")
  if (!store.state.campaign) return problem('the campaign was gone when the next adventure started')
  // Each hero starts the new adventure at the level the campaign kept, with its gold and items
  // (and a starting treasure card on top, as every adventure begins).
  for (const saved of store.state.campaign.heroes) {
    const hero = store.state.heroes.find((h) => h.key === saved.key)
    if (!hero) return problem(`${saved.key} isn't in the next adventure`)
    const items = (hero.items ?? []).map((i) => i.cardId)
    const missing = saved.items.map((i) => i.cardId).filter((id) => {
      const i = items.indexOf(id)
      return i === -1 || items.splice(i, 1).length === 0
    })
    if (hero.level !== saved.level || (hero.gold ?? 0) !== saved.gold || missing.length > 0) {
      return problem(`${saved.key} started the next adventure at level ${hero.level} with ${hero.gold ?? 0} gold${missing.length > 0 ? `, without ${missing}` : ''}, not level ${saved.level} with ${saved.gold} gold`)
    }
  }
  game.taps.push('--- back to the table screen ---')
  cleanup()
  localStorage.setItem('ashardalon-companion/seat', 'table')
  show()
  await wait()
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
      const played = game.adventures.length > 0 ? `; adventures: ${game.adventures.join(', ')}${game.campaign ? `; campaign ${game.campaign}` : ''}` : ''
      process.stderr.write(`Robot ${game.kind}${game.win ? ' play-to-win' : ''} game ${seed}: ${game.adventure} with ${game.heroes?.join(', ')}, ${game.taps.length} taps, reached round ${game.round} with ${game.tiles} tiles out${game.status === 'playing' ? '' : `, ${game.status}`}${played}\n`)
      // The game's own log, every line of it, to see what happened in it.
      if (process.env.ROBOT_GAMELOG) appendFileSync(process.env.ROBOT_GAMELOG, `\n# game ${seed}\n${store.log.map((l) => `${l.round}/${l.heroIndex} ${l.text}`).join('\n')}\n`)
      if (process.env.ROBOT_TAPLOG) appendFileSync(process.env.ROBOT_TAPLOG, `\n# game ${seed} ${game.kind} ${game.adventure} -> ${game.status}\n${game.taps.join('\n')}\n`)
      expect(game.problem, game.problem && report(game)).toBeUndefined()
    }, 120_000 * Math.max(1, (winsOf(seed) ? WIN_TAPS : TAPS) / 300))
  }
})
