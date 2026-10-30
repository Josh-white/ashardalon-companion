import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { TITLES } from '../data/titles.js'
import { createHero, gameReducer, initialState } from './game.js'
import { findPlayer, gameRecord, playerRecords, recordGames, syncRecord } from './records.js'

const start = (players) =>
  gameReducer(initialState, { type: 'START_GAME', heroes: players.map((player, i) => ({ ...createHero(HERO_TEMPLATES[i]), player })) })
const end = (state, result, stats = {}) => gameReducer({ ...state, stats }, { type: 'END_GAME', result })

describe("players' records", () => {
  it('records a finished game for each named player, adding up a player running two heroes', () => {
    const state = start(['Colton', 'Dad', 'Colton'])
    const [a, b, c] = state.heroes.map((h) => h.id)
    const game = gameRecord(end(state, 'won', { [a]: { kills: 2, biggestHit: 2 }, [b]: { kills: 1 }, [c]: { kills: 3, biggestHit: 3, nat20s: 1 } }))
    expect(game.outcome).toBe('won')
    expect(game.players.map((p) => p.name)).toEqual(['Colton', 'Dad'])
    expect(game.players[0]).toMatchObject({ heroes: ['cleric', 'paladin'], mvp: true, stats: { kills: 5, biggestHit: 3, nat20s: 1 } })
  })

  it("leaves out games still going, the demo game's nameless heroes and solo's stand-in name", () => {
    expect(gameRecord(start(['Colton']))).toBeNull()
    expect(gameRecord(end(start(['', 'Solo']), 'won'))).toBeNull()
  })

  it('adds games up per player, whatever the name looks like, and hands out titles', () => {
    const won = gameRecord(end(start(['Colton']), 'won'))
    const lost = gameRecord(end(start(['  colton ']), 'lost'))
    const [colton] = playerRecords([{ ...won, endedAt: 1 }, { ...lost, endedAt: 2 }])
    expect(colton).toMatchObject({ name: 'colton', games: 2, wins: 1, losses: 1, flawlessWins: 1 })
    expect(colton.titles.map((t) => t.key)).toEqual(['untouchable', 'first-quest'])
    // Each title says which game earned it.
    expect(colton.titles.find((t) => t.key === 'first-quest').newIn).toBe(won.key)
  })

  it('gives Dragon-Slayer only for a won game with Ashardalon beaten', () => {
    const base = end(start(['Colton']), 'won')
    const beaten = { ...base, villains: [{ name: 'Ashardalon', defeated: true }] }
    expect(findPlayer(playerRecords([gameRecord(beaten)]), 'Colton').titles[0].key).toBe('dragon-slayer')
    const lost = { ...beaten, status: 'lost' }
    expect(findPlayer(playerRecords([gameRecord(lost)]), 'Colton').titles.map((t) => t.key)).toEqual(['first-quest'])
  })

  it('has a way to earn every title, and no two with the same key', () => {
    expect(new Set(TITLES.map((t) => t.key)).size).toBe(TITLES.length)
    for (const t of TITLES) expect(t.how).toBeTruthy()
  })

  it('writes an ended game in once, and takes it out when Undo brings it back', () => {
    const playing = start(['Colton'])
    const won = end(playing, 'won')
    const file = syncRecord({ games: {} }, won, 5)
    expect(recordGames(file)).toHaveLength(1)
    expect(syncRecord(file, won, 9)).toBeNull()
    expect(recordGames(syncRecord(file, end(playing, 'lost'), 9))[0]).toMatchObject({ outcome: 'lost', endedAt: 5 })
    expect(recordGames(syncRecord(file, playing))).toEqual([])
  })
})
