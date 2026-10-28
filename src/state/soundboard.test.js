import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { createHero, gameReducer, initialState } from './game.js'
import { COOLDOWN_MS, MOMENT_QUIET_MS, USES_PER_TURN, boardStatus, playBoardSound } from './soundboard.js'

const startGame = () => gameReducer(initialState, { type: 'START_GAME', heroes: HERO_TEMPLATES.slice(0, 2).map((t) => createHero(t)) })
const tap = (state, who, now, sound = 'fanfare') => playBoardSound(state, { who, sound }, now)

describe('sound board', () => {
  it('plays a sound and remembers who tapped it', () => {
    const state = startGame()
    const hero = state.heroes[0]
    const next = tap(state, hero.id, 1000)
    expect(next.soundboard.last).toMatchObject({ sound: 'fanfare', who: hero.id, at: 1000 })
  })

  it('makes everyone wait out the cooldown after any sound', () => {
    const state = startGame()
    const [a, b] = state.heroes
    const once = tap(state, a.id, 1000)
    expect(tap(once, b.id, 1000 + COOLDOWN_MS - 1)).toBe(once)
    expect(boardStatus(once, b.id, 1000 + COOLDOWN_MS - 1500).waitMs).toBe(1500)
    expect(tap(once, b.id, 1000 + COOLDOWN_MS).soundboard.last.who).toBe(b.id)
  })

  it('gives each player a few sounds per turn, refilled on the next turn', () => {
    let state = startGame()
    const hero = state.heroes[0]
    let now = 0
    for (let i = 0; i < USES_PER_TURN; i++) state = tap(state, hero.id, (now += COOLDOWN_MS))
    expect(boardStatus(state, hero.id, (now += COOLDOWN_MS)).usesLeft).toBe(0)
    expect(tap(state, hero.id, now)).toBe(state)
    // The other player still has theirs.
    expect(boardStatus(state, state.heroes[1].id, now).ok).toBe(true)
    state = { ...state, turn: { ...state.turn, heroIndex: 1 } }
    expect(boardStatus(state, hero.id, now)).toMatchObject({ ok: true, usesLeft: USES_PER_TURN })
  })

  it('waits while a big moment plays', () => {
    const state = { ...startGame(), moment: { id: 'm', kind: 'roll', at: 1000 } }
    const hero = state.heroes[0]
    expect(tap(state, hero.id, 1000 + MOMENT_QUIET_MS - 1)).toBe(state)
    expect(tap(state, hero.id, 1000 + MOMENT_QUIET_MS)).not.toBe(state)
  })

  it('stays quiet while switched off, and only in the dungeon', () => {
    const state = gameReducer(startGame(), { type: 'SET_SOUNDBOARD_OFF', off: true })
    expect(tap(state, state.heroes[0].id, 1000)).toBe(state)
    const on = gameReducer(state, { type: 'SET_SOUNDBOARD_OFF', off: false })
    expect(tap(on, on.heroes[0].id, 1000)).not.toBe(on)
    expect(boardStatus(initialState, 'table').ok).toBe(false)
  })

  it('ignores unknown sounds and players', () => {
    const state = startGame()
    expect(tap(state, state.heroes[0].id, 1000, 'airhorn')).toBe(state)
    expect(tap(state, 'nobody', 1000)).toBe(state)
    expect(tap(state, 'table', 1000)).not.toBe(state)
  })

  it('goes through the game reducer', () => {
    const state = startGame()
    const next = gameReducer(state, { type: 'PLAY_BOARD_SOUND', who: state.heroes[0].id, sound: 'applause' })
    expect(next.soundboard.last.sound).toBe('applause')
  })
})
