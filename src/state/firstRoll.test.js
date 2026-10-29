import { describe, expect, it } from 'vitest'
import { FIRST_ROLL_MAX_MS, FIRST_ROLL_SHOW_MS, firstRollShowing, newFirstRoll, rollFirst, waitingToRoll } from './firstRoll.js'
import { createHero, gameReducer, initialState } from './game.js'
import { HERO_TEMPLATES } from '../data/heroes.js'

const heroes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

describe('roll for first turn', () => {
  it('only starts with more than one hero', () => {
    expect(newFirstRoll([{ id: 'a' }])).toBeNull()
    expect(waitingToRoll(newFirstRoll(heroes))).toEqual(['a', 'b', 'c'])
  })

  it('gives the first turn to the highest roll', () => {
    let roll = newFirstRoll(heroes)
    roll = rollFirst(roll, 'a', 12, 0).firstRoll
    expect(rollFirst(roll, 'a', 20, 0)).toBeNull() // no second roll
    roll = rollFirst(roll, 'b', 17, 0).firstRoll
    const out = rollFirst(roll, 'c', 3, 1000)
    expect(out.result).toEqual({ winner: 'b' })
    expect(out.firstRoll.decidedAt).toBe(1000)
    expect(rollFirst(out.firstRoll, 'c', 20, 0)).toBeNull()
  })

  it('has the heroes who tie for the top roll again', () => {
    let roll = newFirstRoll(heroes)
    roll = rollFirst(roll, 'a', 15, 0).firstRoll
    roll = rollFirst(roll, 'b', 15, 0).firstRoll
    const out = rollFirst(roll, 'c', 4, 0)
    expect(out.result).toEqual({ tie: ['a', 'b'] })
    expect(waitingToRoll(out.firstRoll)).toEqual(['a', 'b'])
    expect(out.firstRoll.tied).toEqual({ value: 15, heroIds: ['a', 'b'] })
    roll = rollFirst(out.firstRoll, 'a', 2, 0).firstRoll
    expect(rollFirst(roll, 'b', 9, 0).result).toEqual({ winner: 'b' })
  })

  it('stays on screen a few seconds after it is decided', () => {
    const state = { status: 'playing', firstRoll: { winner: 'a', decidedAt: 1000 } }
    expect(firstRollShowing(state, 2000)).toBe(true)
    expect(firstRollShowing(state, 9000)).toBe(false)
    expect(firstRollShowing({ status: 'playing', firstRoll: null }, 0)).toBe(false)
  })

  it('sets whose turn it is in the game', () => {
    const party = HERO_TEMPLATES.slice(0, 2).map((t) => createHero(t))
    let state = gameReducer(initialState, { type: 'START_GAME', heroes: party })
    expect(state.firstRoll.contenders).toEqual(party.map((h) => h.id))
    state = gameReducer(state, { type: 'ROLL_FIRST', heroId: party[0].id, value: 6 })
    state = gameReducer(state, { type: 'ROLL_FIRST', heroId: party[1].id, value: 20 })
    expect(state.turn.heroIndex).toBe(1)
    // A natural 20 is cheered on the roll screen, not as a big moment of its own.
    expect(state.moment).toBe(null)
    expect(state.firstRoll.last).toEqual({ heroId: party[1].id, value: 20 })
    expect(state.log[0].text).toBe(`${party[1].name} goes first!`)
  })

  it('holds the starting treasure until the roll is decided', () => {
    const party = HERO_TEMPLATES.slice(0, 2).map((t) => createHero(t))
    const treasureCards = [{ id: 't1', name: 'Sword', count: 2 }]
    let state = gameReducer(initialState, { type: 'START_GAME', heroes: party, treasureCards, random: [] })
    expect(state.moment).toBeNull()
    // Too early: nobody has won yet.
    expect(gameReducer(state, { type: 'FIRST_ROLL_DONE' })).toBe(state)
    state = gameReducer(state, { type: 'ROLL_FIRST', heroId: party[0].id, value: 6 })
    state = gameReducer(state, { type: 'ROLL_FIRST', heroId: party[1].id, value: 9 })
    expect(state.moment).toBeNull()
    // Not while the narrator is still cheering the winner.
    const cheering = gameReducer(state, { type: 'FIRST_ROLL_NARRATING' })
    expect(gameReducer(cheering, { type: 'FIRST_ROLL_DONE' }).moment).toBeNull()
    state = gameReducer(cheering, { type: 'FIRST_ROLL_QUIET' })
    state = gameReducer(state, { type: 'FIRST_ROLL_DONE' })
    expect(state.moment).toMatchObject({ kind: 'treasure', title: 'Starting treasure!' })
    // Every screen sends it; only the first one counts.
    expect(gameReducer(state, { type: 'FIRST_ROLL_DONE' })).toBe(state)
    // Skipping the roll shows the treasure right away.
    const skipped = gameReducer(gameReducer(initialState, { type: 'START_GAME', heroes: party, treasureCards, random: [] }), { type: 'SKIP_FIRST_ROLL' })
    expect(skipped.moment).toMatchObject({ kind: 'treasure', title: 'Starting treasure!' })
  })

  it('can be skipped', () => {
    const party = HERO_TEMPLATES.slice(0, 2).map((t) => createHero(t))
    const state = gameReducer(gameReducer(initialState, { type: 'START_GAME', heroes: party }), { type: 'SKIP_FIRST_ROLL' })
    expect(state.firstRoll).toBeNull()
    expect(state.turn.heroIndex).toBe(0)
  })
})

describe('first roll and the narrator', () => {
  it('keeps the winner up while the narrator cheers, but not forever', () => {
    const state = (firstRoll) => ({ status: 'playing', firstRoll })
    const decided = { winner: 'h1', decidedAt: 0 }
    expect(firstRollShowing(state(decided), FIRST_ROLL_SHOW_MS + 1)).toBe(false)
    expect(firstRollShowing(state({ ...decided, narrating: true }), FIRST_ROLL_SHOW_MS + 1)).toBe(true)
    expect(firstRollShowing(state({ ...decided, narrating: true }), FIRST_ROLL_MAX_MS + 1)).toBe(false)
  })
})
