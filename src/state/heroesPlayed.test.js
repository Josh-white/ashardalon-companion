import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { createHero, gameReducer, initialState } from './game.js'
import { heroesPlayed, syncRecord } from './records.js'
import { newToHero } from '../components/Setup.jsx'

const start = (players) =>
  gameReducer(initialState, { type: 'START_GAME', heroes: players.map((player, i) => ({ ...createHero(HERO_TEMPLATES[i]), player })) })

describe('heroes each player has played (for the hero coach)', () => {
  it('counts a hero as played once the game is under way, before it ends', () => {
    const file = syncRecord({ games: {} }, start(['Colton', 'Dad']), 5)
    expect(file.played).toEqual({ colton: { cleric: 5 }, dad: { fighter: 5 } })
    expect(heroesPlayed(file.played, ' COLTON ')).toEqual(['cleric'])
    // Nothing new: nothing to save.
    expect(syncRecord(file, start(['colton']), 9)).toBeNull()
  })

  it('keeps the first time and adds new heroes', () => {
    const first = syncRecord({ games: {} }, start(['Colton']), 5)
    const state = start(['', 'Colton'])
    const next = syncRecord(first, state, 9)
    expect(next.played.colton).toEqual({ cleric: 5, fighter: 9 })
  })

  it("skips the demo game's nameless heroes and solo's stand-in, and the lobby", () => {
    expect(syncRecord({ games: {} }, start(['', 'Solo']), 5)).toBeNull()
    expect(syncRecord({ games: {} }, initialState, 5)).toBeNull()
  })

  it('still records a finished game alongside', () => {
    const state = gameReducer(start(['Colton']), { type: 'END_GAME', result: 'won' })
    const file = syncRecord(syncRecord({ games: {} }, start(['Colton']), 1), state, 2)
    expect(Object.keys(file.games)).toHaveLength(1)
    expect(file.played.colton).toBeTruthy()
  })

  it('tells the lobby who is new to a hero', () => {
    const played = { colton: { cleric: 1 } }
    expect(newToHero(played, 'Colton', 'cleric')).toBe(false)
    expect(newToHero(played, 'Colton', 'rogue')).toBe(true)
    expect(newToHero(played, '', 'cleric')).toBe(true)
    expect(newToHero(null, 'Colton', 'cleric')).toBeNull()
  })
})
