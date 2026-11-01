import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { TITLES } from '../data/titles.js'
import { createHero, gameReducer, initialState } from './game.js'
import { findPlayer, gameRecord, playerRecords, recordGames, recordsReply, syncRecord } from './records.js'

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

  it('fills in the trophy book across games, and says which game won each trophy first', () => {
    const one = start(['Colton', 'Colton'])
    const [a, b] = one.heroes.map((h) => h.id)
    const ogre = { name: 'Ogre', count: 1 }
    const first = gameRecord(end(one, 'lost', { [a]: { kills: 1, trophies: { 'monster-ogre': ogre } }, [b]: { kills: 1, trophies: { 'monster-ogre': ogre } } }))
    expect(first.players[0].stats.trophies).toEqual({ 'monster-ogre': { name: 'Ogre', count: 2 } })
    const two = start(['Colton'])
    const second = gameRecord(end(two, 'won', { [two.heroes[0].id]: { kills: 2, trophies: { 'monster-ogre': ogre, 'villain-gauth': { name: 'Gauth', count: 1 } } } }))
    const [colton] = playerRecords([{ ...first, endedAt: 1 }, { ...second, endedAt: 2 }])
    expect(colton.trophies).toEqual({
      'monster-ogre': { name: 'Ogre', count: 3, newIn: first.key },
      'villain-gauth': { name: 'Gauth', count: 1, newIn: second.key },
    })
    // Games from before the trophy book have none.
    expect(playerRecords([{ ...gameRecord(end(start(['Dad']), 'won')), endedAt: 1 }])[0].trophies).toEqual({})
  })

  it("leaves out games still going and the demo game's nameless heroes", () => {
    expect(gameRecord(start(['Colton']))).toBeNull()
    expect(gameRecord(end(start(['', '']), 'won'))).toBeNull()
  })

  it("keeps solo games apart, under the solo screen's name, counting only the heroes the player ran", () => {
    // Two of the three heroes handed to the computer.
    const solo = (soloName) => {
      const started = gameReducer(initialState, { type: 'START_GAME', soloName, heroes: HERO_TEMPLATES.slice(0, 3).map((t) => ({ ...createHero(t), player: 'Solo' })) })
      return { ...started, heroes: started.heroes.map((h, i) => (i > 0 ? { ...h, ally: true } : h)) }
    }
    const state = solo('  JJ ')
    expect(state.soloName).toBe('JJ')
    const [me, ally] = state.heroes.map((h) => h.id)
    const game = gameRecord(end(state, 'won', { [me]: { kills: 2, trophies: { 'monster-grell': { name: 'Grell', count: 1 } } }, [ally]: { kills: 5 } }))
    expect(game).toMatchObject({ solo: true, outcome: 'won', players: [{ name: 'JJ', heroes: [HERO_TEMPLATES[0].key], stats: { kills: 2 } }] })
    // No name typed: the games still count, for "Solo".
    expect(gameRecord(end(solo(''), 'lost')).players[0].name).toBe('Solo')
    // A family game with JJ in it stays on the family side.
    const family = gameRecord(end(start(['JJ']), 'won'))
    const reply = recordsReply({ games: { a: { ...game, endedAt: 1 }, b: { ...family, endedAt: 2 } } })
    expect(reply.players.map((p) => [p.name, p.games, p.kills])).toEqual([['JJ', 1, 0]])
    expect(reply.solo.map((p) => [p.name, p.games, p.wins, p.kills])).toEqual([['JJ', 1, 1, 2]])
    expect(reply.solo[0].trophies['monster-grell'].count).toBe(1)
  })

  it('keeps the solo name when the heroes try again', () => {
    const lost = end(gameReducer(initialState, { type: 'START_GAME', soloName: 'Easton', heroes: [{ ...createHero(HERO_TEMPLATES[0]), player: 'Solo' }] }), 'lost')
    expect(gameReducer(lost, { type: 'TRY_AGAIN' }).soloName).toBe('Easton')
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
