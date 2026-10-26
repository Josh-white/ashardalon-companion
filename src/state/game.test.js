import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { createHero, gameReducer, initialState } from './game.js'

const startGame = (count = 2) =>
  gameReducer(initialState, { type: 'START_GAME', heroes: HERO_TEMPLATES.slice(0, count).map((t) => createHero(t)) })

describe('heroes', () => {
  it('keeps HP between 0 and max', () => {
    let state = startGame()
    const hero = state.heroes[0]
    state = gameReducer(state, { type: 'ADJUST_HP', heroId: hero.id, amount: 5 })
    expect(state.heroes[0].hp).toBe(hero.maxHp)
    state = gameReducer(state, { type: 'ADJUST_HP', heroId: hero.id, amount: -99 })
    expect(state.heroes[0].hp).toBe(0)
  })

  it('heals to the surge value and spends a shared surge', () => {
    let state = startGame()
    const hero = state.heroes[0]
    state = gameReducer(state, { type: 'ADJUST_HP', heroId: hero.id, amount: -99 })
    state = gameReducer(state, { type: 'USE_SURGE', heroId: hero.id })
    expect(state.heroes[0].hp).toBe(hero.surgeValue)
    expect(state.surges).toBe(initialState.surges - 1)
  })

  it('loses the game when a surge is needed and none are left', () => {
    let state = { ...startGame(), surges: 0 }
    state = gameReducer(state, { type: 'USE_SURGE', heroId: state.heroes[0].id })
    expect(state.status).toBe('lost')
  })

  it('levels up once for 5 XP', () => {
    let state = { ...startGame(), xp: 6 }
    const hero = state.heroes[0]
    state = gameReducer(state, { type: 'LEVEL_UP', heroId: hero.id })
    expect(state.heroes[0].level).toBe(2)
    expect(state.heroes[0].maxHp).toBe(hero.maxHp + 2)
    expect(state.heroes[0].ac).toBe(hero.ac + 1)
    expect(state.heroes[0].surgeValue).toBe(hero.surgeValue + 1)
    expect(state.heroes[0].powers.filter((p) => p.type === 'daily')).toHaveLength(2)
    expect(state.xp).toBe(1)
    expect(gameReducer(state, { type: 'LEVEL_UP', heroId: hero.id })).toBe(state)
  })
})

describe('powers', () => {
  it('starts each hero with two at-wills, a utility, and a daily', () => {
    expect(startGame().heroes[0].powers.map((p) => p.type)).toEqual(['at-will', 'at-will', 'utility', 'daily'])
  })

  it('gives Keyleth an extra utility slot for Lay on Hands', () => {
    const paladin = HERO_TEMPLATES.find((t) => t.key === 'paladin')
    expect(createHero(paladin).powers.map((p) => p.type)).toEqual(['at-will', 'at-will', 'utility', 'utility', 'daily'])
  })

  it('picks a card for a slot and never marks at-wills as used', () => {
    let state = startGame()
    const hero = state.heroes[0]
    const [atWill, , , daily] = hero.powers
    const card = { id: 'x', name: 'Holy Strike', text: 'Smite!', attack: '+6', damage: '1' }
    state = gameReducer(state, { type: 'SET_POWER_CARD', heroId: hero.id, powerId: daily.id, card })
    state = gameReducer(state, { type: 'TOGGLE_POWER', heroId: hero.id, powerId: daily.id })
    state = gameReducer(state, { type: 'TOGGLE_POWER', heroId: hero.id, powerId: atWill.id })
    const powers = state.heroes[0].powers
    expect(powers[3]).toMatchObject({ name: 'Holy Strike', used: true, card: { text: 'Smite!' } })
    expect(powers[0].used).toBe(false)
    state = gameReducer(state, { type: 'SET_POWER_CARD', heroId: hero.id, powerId: daily.id, card: null })
    expect(state.heroes[0].powers[3]).toMatchObject({ name: 'Daily power', card: null })
  })
})

describe('big moments', () => {
  it('rolls a d20 and flags natural 20s and 1s', () => {
    let state = startGame()
    const hero = state.heroes[0]
    state = gameReducer(state, { type: 'ROLL_DIE', heroId: hero.id, value: 20 })
    expect(state.moment).toMatchObject({ kind: 'crit', value: 20, heroId: hero.id })
    state = gameReducer(state, { type: 'ROLL_DIE', heroId: hero.id, value: 1 })
    expect(state.moment.kind).toBe('fumble')
    state = gameReducer(state, { type: 'ROLL_DIE', heroId: hero.id, value: 12 })
    expect(state.moment).toMatchObject({ kind: 'roll', title: `${hero.name} rolled 12` })
    expect(state.log[0].text).toBe(`${hero.name} rolled a 12.`)
  })

  it('ignores rolls outside 1 to 20', () => {
    const state = startGame()
    for (const value of [0, 21, 2.5, 'x']) {
      expect(gameReducer(state, { type: 'ROLL_DIE', heroId: state.heroes[0].id, value })).toBe(state)
    }
  })

  it('marks a hero going down only when HP first reaches 0', () => {
    let state = startGame()
    const hero = state.heroes[0]
    state = gameReducer(state, { type: 'ADJUST_HP', heroId: hero.id, amount: -1 })
    expect(state.moment).toBeNull()
    state = gameReducer(state, { type: 'ADJUST_HP', heroId: hero.id, amount: -99 })
    const downMoment = state.moment
    expect(downMoment).toMatchObject({ kind: 'down', heroId: hero.id })
    state = gameReducer(state, { type: 'ADJUST_HP', heroId: hero.id, amount: -1 })
    expect(state.moment).toBe(downMoment)
  })

  it('celebrates defeated monsters and level-ups', () => {
    let state = { ...startGame(), xp: 5 }
    state = gameReducer(state, { type: 'ADD_MONSTER', name: 'Snake', hp: 1, xp: 1, ownerId: state.heroes[0].id })
    state = gameReducer(state, { type: 'DEFEAT_MONSTER', monsterId: state.monsters[0].id })
    expect(state.moment).toMatchObject({ kind: 'defeat', title: 'Snake defeated!' })
    state = gameReducer(state, { type: 'LEVEL_UP', heroId: state.heroes[0].id })
    expect(state.moment.kind).toBe('level')
  })
})

describe('monsters', () => {
  it('adds XP to the pool when defeated', () => {
    let state = startGame()
    state = gameReducer(state, { type: 'ADD_MONSTER', name: 'Snake', hp: 1, xp: 2, ownerId: state.heroes[0].id })
    state = gameReducer(state, { type: 'DEFEAT_MONSTER', monsterId: state.monsters[0].id })
    expect(state.monsters).toHaveLength(0)
    expect(state.xp).toBe(2)
  })

  it('spends 5 XP to cancel an encounter only when there is enough', () => {
    let state = { ...startGame(), xp: 4 }
    expect(gameReducer(state, { type: 'CANCEL_ENCOUNTER' }).xp).toBe(4)
    state = { ...state, xp: 7 }
    expect(gameReducer(state, { type: 'CANCEL_ENCOUNTER' }).xp).toBe(2)
  })
})

describe('turns', () => {
  it('walks through three phases then passes to the next hero', () => {
    let state = startGame(2)
    for (let i = 0; i < 3; i++) state = gameReducer(state, { type: 'NEXT_PHASE' })
    expect(state.turn).toEqual({ heroIndex: 1, phase: 0, round: 1 })
    for (let i = 0; i < 3; i++) state = gameReducer(state, { type: 'NEXT_PHASE' })
    expect(state.turn).toEqual({ heroIndex: 0, phase: 0, round: 2 })
    state = gameReducer(state, { type: 'PREVIOUS_PHASE' })
    expect(state.turn).toEqual({ heroIndex: 1, phase: 2, round: 1 })
  })
})

describe('START_DEMO', () => {
  it('starts a game in progress with every hero and some monsters', () => {
    const state = gameReducer(initialState, { type: 'START_DEMO' })
    expect(state.status).toBe('playing')
    expect(state.heroes).toHaveLength(5)
    expect(state.monsters.length).toBeGreaterThan(0)
    expect(state.monsters.every((m) => state.heroes.some((h) => h.id === m.ownerId))).toBe(true)
    expect(state.xp).toBe(3)
  })
})

describe('hero lobby', () => {
  const card = (id, type) => ({ id, hero: 'paladin', type, name: id, text: `${id} text` })

  it('lets each iPad claim one hero that no other iPad can take', () => {
    let state = gameReducer(initialState, { type: 'CLAIM_HERO', deviceId: 'a', heroKey: 'paladin' })
    expect(gameReducer(state, { type: 'CLAIM_HERO', deviceId: 'b', heroKey: 'paladin' })).toBe(state)
    state = gameReducer(state, { type: 'CLAIM_HERO', deviceId: 'a', heroKey: 'rogue' })
    expect(state.lobby.map((c) => c.heroKey)).toEqual(['rogue'])
    state = gameReducer(state, { type: 'RELEASE_HERO', deviceId: 'a' })
    expect(state.lobby).toEqual([])
  })

  it('starts the game from the lobby in claim order, with the picked powers and card stats', () => {
    let state = gameReducer(initialState, {
      type: 'CLAIM_HERO',
      deviceId: 'a',
      heroKey: 'paladin',
      picks: [card('one', 'at-will'), null, card('lay', 'utility')],
    })
    state = gameReducer(state, { type: 'CLAIM_HERO', deviceId: 'b', heroKey: 'rogue' })
    state = gameReducer(state, { type: 'SET_LOBBY_PLAYER', deviceId: 'a', player: 'Dad' })
    state = gameReducer(state, { type: 'SET_LOBBY_PICK', deviceId: 'a', slot: 1, card: card('two', 'at-will') })
    state = gameReducer(state, { type: 'START_GAME' })

    expect(state.status).toBe('playing')
    expect(state.heroes.map((h) => h.key)).toEqual(['paladin', 'rogue'])
    const keyleth = state.heroes[0]
    expect(keyleth).toMatchObject({ player: 'Dad', maxHp: 8, hp: 8, ac: 17 })
    expect(keyleth.powers.map((p) => p.name)).toEqual(['one', 'two', 'lay', 'Utility power', 'Daily power'])
    expect(keyleth.powers[0].card.text).toBe('one text')
    expect(state.lobby).toEqual([])
  })

  it('ignores hero claims once the game has started', () => {
    const state = gameReducer(initialState, { type: 'START_DEMO' })
    expect(gameReducer(state, { type: 'CLAIM_HERO', deviceId: 'a', heroKey: 'paladin' })).toBe(state)
  })
})
