import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES, setHeroTemplates } from '../data/heroes.js'
import { createHero, gameReducer, initialState } from './game.js'
import { gameHeroLimit, heroLimit, heroLimitText } from './adventure.js'
import { canJoin } from '../components/JoinGame.jsx'

const solo = { id: 'adventure-1', number: 1, title: 'Lone Hero', players: '1', needs: [], reveals: [], rules: [], win: {} }
const group = { id: 'adventure-2', number: 2, title: 'Party', players: '2-5', needs: [], reveals: [], rules: [], win: {} }
// Fan heroes from cards.json: seven to pick from, more than the book's five.
const FAN = [...HERO_TEMPLATES, { ...HERO_TEMPLATES[0], key: 'bard', name: 'Berryloaf' }, { ...HERO_TEMPLATES[1], key: 'monk', name: 'Darna' }]
const KEYS = FAN.map((t) => t.key)
const claim = (state, heroKey, i) => gameReducer(state, { type: 'CLAIM_HERO', deviceId: `ipad-${i}`, heroKey, picks: [], player: `P${i}` })
const fill = (state, n) => KEYS.slice(0, n).reduce((s, key, i) => claim(s, key, i), state)

describe('how many heroes an adventure allows', () => {
  it('reads the biggest number of its players line, five when it says nothing', () => {
    expect(heroLimit(solo)).toBe(1)
    expect(heroLimit(group)).toBe(5)
    expect(heroLimit({ players: '1 (solo)' })).toBe(1)
    expect(heroLimit({ players: '' })).toBe(5)
    expect(heroLimit(null)).toBe(5)
    expect(heroLimitText(solo)).toBe('Adventure 1 is for 1 hero.')
    expect(heroLimitText(null)).toBe('Free play is for up to 5 heroes.')
  })

  it('stops the lobby at five in free play, even with fan heroes to pick', () => {
    setHeroTemplates(FAN)
    try {
      const state = fill(initialState, 7)
      expect(state.lobby).toHaveLength(5)
      // Swapping your own hero still works when the lobby is full.
      const swapped = gameReducer(state, { type: 'CLAIM_HERO', deviceId: 'ipad-0', heroKey: 'monk', picks: [] })
      expect(swapped.lobby.map((c) => c.heroKey)).toContain('monk')
    } finally {
      setHeroTemplates(null)
    }
  })

  it('lets Adventure 1 have one hero, and refuses to start with more', () => {
    let state = gameReducer(initialState, { type: 'CHOOSE_ADVENTURE', adventure: solo })
    state = fill(state, 3)
    expect(state.lobby).toHaveLength(1)
    // Heroes picked before the adventure changed: Enter does nothing until some are freed.
    let early = fill(initialState, 3)
    early = gameReducer(early, { type: 'CHOOSE_ADVENTURE', adventure: solo })
    early = early.lobby.reduce((s, c) => gameReducer(s, { type: 'SET_LOBBY_READY', deviceId: c.deviceId, ready: true }), early)
    expect(gameReducer(early, { type: 'START_GAME', tileRandom: [] }).status).toBe('setup')
  })

  it('blocks joining a game going once the party is at the limit', () => {
    const heroes = HERO_TEMPLATES.slice(0, 5).map((t, i) => ({ ...createHero(t), player: `P${i}` }))
    let state = gameReducer(initialState, { type: 'START_GAME', heroes, tileRandom: [] })
    state = { ...state, firstRoll: { ...state.firstRoll, winner: heroes[0].id }, opening: null }
    expect(gameHeroLimit(state)).toBe(5)
    setHeroTemplates(FAN)
    try {
      expect(canJoin(state)).toBe(false)
      const joined = gameReducer(state, { type: 'JOIN_GAME', heroKey: 'bard', player: 'Easton', picks: [] })
      expect(joined.heroes).toHaveLength(5)
    } finally {
      setHeroTemplates(null)
    }
  })
})
