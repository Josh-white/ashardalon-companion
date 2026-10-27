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
  it('starts each hero with two at-wills, two utilities, and a daily', () => {
    expect(startGame().heroes[0].powers.map((p) => p.type)).toEqual(['at-will', 'at-will', 'utility', 'utility', 'daily'])
  })

  it('picks a card for a slot and never marks at-wills as used', () => {
    let state = startGame()
    const hero = state.heroes[0]
    const [atWill, , , , daily] = hero.powers
    const card = { id: 'x', name: 'Holy Strike', text: 'Smite!', attack: '+6', damage: '1' }
    state = gameReducer(state, { type: 'SET_POWER_CARD', heroId: hero.id, powerId: daily.id, card })
    state = gameReducer(state, { type: 'TOGGLE_POWER', heroId: hero.id, powerId: daily.id })
    state = gameReducer(state, { type: 'TOGGLE_POWER', heroId: hero.id, powerId: atWill.id })
    const powers = state.heroes[0].powers
    expect(powers[4]).toMatchObject({ name: 'Holy Strike', used: true, card: { text: 'Smite!' } })
    expect(powers[0].used).toBe(false)
    state = gameReducer(state, { type: 'SET_POWER_CARD', heroId: hero.id, powerId: daily.id, card: null })
    expect(state.heroes[0].powers[4]).toMatchObject({ name: 'Daily power', card: null })
  })

  it("won't put the same card in two of a hero's slots", () => {
    let state = startGame()
    const hero = state.heroes[0]
    const [first, second] = hero.powers
    const card = { id: 'strike', name: 'Holy Strike' }
    state = gameReducer(state, { type: 'SET_POWER_CARD', heroId: hero.id, powerId: first.id, card })
    expect(gameReducer(state, { type: 'SET_POWER_CARD', heroId: hero.id, powerId: second.id, card })).toBe(state)
    // Picking it again for the slot that already has it is fine.
    expect(gameReducer(state, { type: 'SET_POWER_CARD', heroId: hero.id, powerId: first.id, card }).heroes[0].powers[0].name).toBe('Holy Strike')
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

  it('gives each hero the starting cards it is handed', () => {
    const picks = { cleric: [{ id: 'flame', name: 'Sacred Flame', type: 'at-will' }] }
    const state = gameReducer(initialState, { type: 'START_DEMO', picks })
    const quinn = state.heroes.find((h) => h.key === 'cleric')
    expect(quinn.powers[0]).toMatchObject({ name: 'Sacred Flame', card: { id: 'flame' } })
    expect(quinn.powers[1].card).toBe(null)
  })
})

describe('hero lobby', () => {
  const card = (id, type) => ({ id, hero: 'paladin', type, name: id, text: `${id} text` })

  it("won't pick the same card for two lobby slots", () => {
    let state = gameReducer(initialState, { type: 'CLAIM_HERO', deviceId: 'a', heroKey: 'paladin' })
    state = gameReducer(state, { type: 'SET_LOBBY_PICK', deviceId: 'a', slot: 0, card: card('one', 'at-will') })
    expect(gameReducer(state, { type: 'SET_LOBBY_PICK', deviceId: 'a', slot: 1, card: card('one', 'at-will') })).toBe(state)
  })

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
    state = gameReducer(state, { type: 'SET_LOBBY_READY', deviceId: 'a', ready: true })
    // No one gets ready without a name, and clearing the name takes them out of ready.
    state = gameReducer(state, { type: 'SET_LOBBY_READY', deviceId: 'b', ready: true })
    expect(state.lobby[1].ready).toBe(false)
    state = gameReducer(state, { type: 'SET_LOBBY_PLAYER', deviceId: 'b', player: 'Sam' })
    state = gameReducer(state, { type: 'SET_LOBBY_READY', deviceId: 'b', ready: true })
    expect(gameReducer(state, { type: 'SET_LOBBY_PLAYER', deviceId: 'b', player: ' ' }).lobby[1].ready).toBe(false)
    // Changing a power after getting ready takes the hero out of ready.
    state = gameReducer(state, { type: 'SET_LOBBY_PICK', deviceId: 'a', slot: 1, card: card('two', 'at-will') })
    expect(state.lobby[0].ready).toBe(false)
    expect(gameReducer(state, { type: 'START_GAME' })).toBe(state)
    state = gameReducer(state, { type: 'SET_LOBBY_READY', deviceId: 'a', ready: true })
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

describe('monster deck', () => {
  // Made-up cards in the card file's shape, so the tests don't need the real ones.
  const snake = {
    id: 'snake', name: 'Snake', copies: 2, ac: 13, hp: 1, xp: 1, figures: 1,
    attacks: [{ id: 'bite', name: 'Bite', bonus: 7, damage: 0, miss: 0, conditions: ['Poisoned'] }],
    tactics: [{ when: 'within1', move: 'adjacent', attack: 'bite', targets: 'one' }, { move: 'toward' }],
  }
  const devils = {
    id: 'devil', name: 'Devil', copies: 1, ac: 16, hp: 1, xp: 3, figures: 3,
    attacks: [{ id: 'sword', name: 'Sword', bonus: 11, damage: 2, miss: 1, conditions: [] }],
    tactics: [{ move: 'toward' }],
  }
  // With no random numbers the deck isn't shuffled, so the cards come off in file order.
  const draw = (state, heroIndex = 0, cards = [snake, devils]) =>
    gameReducer(state, { type: 'DRAW_MONSTER', heroId: state.heroes[heroIndex].id, cards, random: [] })

  it('builds the deck on the first draw and gives the card to the hero who drew it', () => {
    const state = draw(startGame(), 1)
    expect(state.monsterDeck.draw).toHaveLength(2)
    expect(state.monsters).toHaveLength(1)
    expect(state.monsters[0]).toMatchObject({ ownerId: state.heroes[1].id, cardId: expect.any(String) })
    expect(state.moment.kind).toBe('spawn')
  })

  it('makes one monster with every figure for a group card', () => {
    const state = draw(startGame(), 0, [devils])
    expect(state.monsters[0]).toMatchObject({ name: 'Devil', hp: 3, maxHp: 3, ac: 16, xp: 3 })
  })

  it('discards defeated monsters and reshuffles them when the deck runs out', () => {
    let state = startGame()
    for (let i = 0; i < 3; i++) state = draw(state)
    expect(state.monsterDeck.draw).toEqual([])
    expect(draw(state).log[0].text).toMatch(/already in play/)
    state = gameReducer(state, { type: 'DEFEAT_MONSTER', monsterId: state.monsters[0].id })
    state = gameReducer(state, { type: 'REMOVE_MONSTER', monsterId: state.monsters[0].id })
    expect(state.monsterDeck.discard).toHaveLength(2)
    state = draw(state)
    expect(state.monsters).toHaveLength(2)
    expect(state.monsterDeck).toMatchObject({ discard: [] })
    expect(state.monsterDeck.draw).toHaveLength(1)
  })

  it('rolls monster attacks against hero AC and applies damage and conditions', () => {
    let state = draw(startGame(), 0, [devils])
    const [quinn, vistra] = state.heroes
    const devil = state.monsters[0]
    state = gameReducer(state, {
      type: 'MONSTER_ATTACK',
      monsterId: devil.id,
      attackId: 'sword',
      // 5 + 11 = 16 hits Quinn (AC 16); 5 + 11 misses Vistra (AC 17) but still deals the miss damage.
      targets: [{ heroId: quinn.id, roll: 5 }, { heroId: vistra.id, roll: 5 }],
    })
    expect(state.heroes[0].hp).toBe(quinn.hp - 2)
    expect(state.heroes[1].hp).toBe(vistra.hp - 1)
    expect(state.moment.rolls.map((r) => r.hit)).toEqual([true, false])
  })

  it('adds a condition on a hit', () => {
    let state = draw(startGame())
    expect(state.monsters[0].name).toBe('Snake')
    state = gameReducer(state, { type: 'MONSTER_ATTACK', monsterId: state.monsters[0].id, attackId: 'bite', targets: [{ heroId: state.heroes[0].id, roll: 20 }] })
    expect(state.heroes[0].conditions).toEqual(['Poisoned'])
  })

  it('says when a monster attack knocks a hero down', () => {
    let state = draw(startGame(), 0, [devils])
    state = gameReducer(state, { type: 'ADJUST_HP', heroId: state.heroes[0].id, amount: -7 })
    state = gameReducer(state, { type: 'MONSTER_ATTACK', monsterId: state.monsters[0].id, attackId: 'sword', targets: [{ heroId: state.heroes[0].id, roll: 19 }] })
    expect(state.heroes[0].hp).toBe(0)
    expect(state.moment.kind).toBe('monster-down')
  })

  it('ignores attacks with bad rolls or unknown attacks', () => {
    const state = draw(startGame())
    const monsterId = state.monsters[0].id
    expect(gameReducer(state, { type: 'MONSTER_ATTACK', monsterId, attackId: 'nope', targets: [{ heroId: state.heroes[0].id, roll: 5 }] })).toBe(state)
    expect(gameReducer(state, { type: 'MONSTER_ATTACK', monsterId, attackId: 'bite', targets: [{ heroId: state.heroes[0].id, roll: 21 }] })).toBe(state)
  })

  it('starts the demo with monsters from the deck when it has cards', () => {
    const state = gameReducer(initialState, { type: 'START_DEMO', monsterCards: [snake, devils], random: [] })
    expect(state.monsters).toHaveLength(3)
    expect(state.monsters.every((m) => m.card)).toBe(true)
    expect(state.monsterDeck.draw).toHaveLength(0)
  })
})
