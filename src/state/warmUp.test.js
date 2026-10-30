import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { normalizeCardFile } from '../data/cards.js'
import { WARM_UP_ID } from '../data/warmUp.js'
import { isPlayable } from './adventure.js'
import { createHero, gameReducer, initialState } from './game.js'
import { gameRecord, syncRecord } from './records.js'

const { adventures, monsters } = normalizeCardFile({
  powers: [],
  monsters: ['Rat', 'Bat', 'Toad'].map((name) => ({ id: name, name, copies: 1, ac: 12, hp: 1, xp: 1, attacks: [{ id: 'bite', name: 'Bite', bonus: 5, damage: 1 }], tactics: [{ move: 'toward' }] })),
})
const warmUp = adventures.find((a) => a.id === WARM_UP_ID)

const start = () => {
  const state = gameReducer(initialState, { type: 'CHOOSE_ADVENTURE', adventure: warmUp })
  return gameReducer(state, { type: 'START_GAME', heroes: HERO_TEMPLATES.slice(0, 2).map((t, i) => ({ ...createHero(t), player: ['Colton', 'Dad'][i] })) })
}
const draw = (state, i = 0) => gameReducer(state, { type: 'DRAW_MONSTER', heroId: state.heroes[i].id, cards: monsters, random: [] })
const defeatFirst = (state) => gameReducer(state, { type: 'DEFEAT_MONSTER', monsterId: state.monsters[0].id })

describe('Hero Swap Warm-up', () => {
  it('comes with every card file, even one with no adventures, and can be played', () => {
    expect(warmUp).toMatchObject({ title: 'Hero Swap Warm-up', practice: true, win: { figures: 3 } })
    expect(isPlayable(warmUp)).toBe(true)
    // A card file with its own adventure by that id keeps it.
    const own = normalizeCardFile({ powers: [], adventures: [{ id: WARM_UP_ID, title: 'Mine' }] }).adventures
    expect(own.map((a) => a.title)).toEqual(['Mine'])
  })

  it('is won after three monsters', () => {
    let state = draw(draw(draw(start()), 1), 1)
    state = defeatFirst(defeatFirst(state))
    expect(state.status).toBe('playing')
    state = defeatFirst(state)
    expect(state.status).toBe('won')
  })

  it("never counts toward records or titles, but still notes the heroes tried", () => {
    const won = gameReducer(start(), { type: 'END_GAME', result: 'won' })
    expect(gameRecord(won)).toBeNull()
    const played = syncRecord({}, start(), 5)
    expect(played.games).toBeUndefined()
    expect(Object.keys(played.played)).toEqual(['colton', 'dad'])
    expect(syncRecord(played, won)).toBeNull()
  })
})
