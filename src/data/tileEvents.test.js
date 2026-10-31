import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from './heroes.js'
import { createHero, gameReducer, initialState } from '../state/game.js'
import { pickTileEvent, tileShape, TILE_EVENTS } from './tileEvents.js'

const start = () => {
  let state = gameReducer({ ...initialState, lobbyTiles: 10 }, { type: 'START_GAME', heroes: HERO_TEMPLATES.slice(0, 2).map((t) => createHero(t)) })
  return { ...state, turn: { ...state.turn, phase: 1 } }
}
// Shuffle numbers end with the event's two: the chance, then which one.
const explore = (state, chance, which) => gameReducer(state, { type: 'SET_EXPLORED', explored: true, random: [0.5, 0.5, chance, which] })

describe('tile events', () => {
  it('reads the shape of a tile from its exits and doors', () => {
    const tile = (exits, features) => ({ kind: 'regular', exits, features })
    expect(tileShape(tile({ N: 'xxxx', S: 'xoox', W: 'xxxx', E: 'xxxx' }))).toBe('deadEnd')
    expect(tileShape(tile({ N: 'xoox', S: 'xoox', W: 'xxxx', E: 'xxxx' }))).toBe('corridor')
    expect(tileShape(tile({ N: 'oooo', S: 'oooo', W: 'xoox', E: 'xxxx' }))).toBe('crossroads')
    expect(tileShape(tile({ N: 'oooo', S: 'oooo' }, [{ type: 'door' }]))).toBe('door')
    expect(tileShape({ kind: 'chamber' })).toBeNull()
  })

  it('happens about one tile in three, with an event that fits, never twice, and no gold outside a campaign', () => {
    expect(pickTileEvent({ shape: null }, 0.9, 0)).toBeNull()
    const picked = pickTileEvent({ shape: 'deadEnd', campaign: true }, 0.1, 0)
    expect(picked.shape).toBe('deadEnd')
    expect(pickTileEvent({ shape: 'deadEnd', campaign: true, seen: [picked.id] }, 0.1, 0).id).not.toBe(picked.id)
    for (let i = 0; i < 20; i++) expect(pickTileEvent({ shape: null }, 0, i / 20).effect?.gold).toBeUndefined()
    expect(TILE_EVENTS.every((e) => e.text.length < 120)).toBe(true)
  })

  it('shows on an explored ordinary tile and goes in the log; a hurt hero gets the spring water', () => {
    let state = start()
    state = { ...state, heroes: state.heroes.map((h, i) => (i === 0 ? { ...h, hp: h.maxHp - 2 } : h)) }
    const quiet = explore(state, 0.9, 0)
    expect(quiet.turn.tileEvent).toBeUndefined()
    const fits = TILE_EVENTS.filter((e) => e.shape === 'any' && !e.effect?.gold)
    const potion = fits.findIndex((e) => e.id === 'potion')
    const found = explore(state, 0.1, (potion + 0.5) / fits.length)
    expect(found.turn.tileEvent).toMatchObject({ id: 'potion', text: expect.stringMatching(/gets 1 HP back/) })
    expect(found.heroes[0].hp).toBe(state.heroes[0].hp + 1)
    expect(found.tileEventsSeen).toEqual(['potion'])
    expect(found.log.some((l) => l.text.startsWith('👀'))).toBe(true)
  })
})
