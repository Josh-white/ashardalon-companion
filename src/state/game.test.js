import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { normalizeCardFile } from '../data/cards.js'
import { heroAc, heroAttackPenalty } from '../data/powerEffects.js'
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
    let state = startGame()
    const hero = state.heroes[0]
    state = { ...state, xp: 6, turn: { ...state.turn, natural20: hero.id } }
    state = gameReducer(state, { type: 'LEVEL_UP', heroId: hero.id })
    expect(state.heroes[0].level).toBe(2)
    expect(state.heroes[0].maxHp).toBe(hero.maxHp + 2)
    expect(state.heroes[0].ac).toBe(hero.ac + 1)
    expect(state.heroes[0].surgeValue).toBe(hero.surgeValue + 1)
    expect(state.heroes[0].powers.filter((p) => p.type === 'daily')).toHaveLength(2)
    expect(state.xp).toBe(1)
    expect(gameReducer(state, { type: 'LEVEL_UP', heroId: hero.id })).toBe(state)
  })

  it('only levels up after that hero rolls a natural 20 this turn', () => {
    const state = { ...startGame(), xp: 6 }
    expect(gameReducer(state, { type: 'LEVEL_UP', heroId: state.heroes[0].id })).toBe(state)
    const other = { ...state, turn: { ...state.turn, natural20: state.heroes[1].id } }
    expect(gameReducer(other, { type: 'LEVEL_UP', heroId: state.heroes[0].id })).toBe(other)
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
    let state = startGame()
    state = { ...state, xp: 5, turn: { ...state.turn, natural20: state.heroes[0].id } }
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

  it('never gives a hero two of the same monster card', () => {
    let state = draw(startGame()) // a Snake
    state = draw(state) // the second Snake is discarded, so the Devil comes out
    expect(state.monsters.map((m) => m.name)).toEqual(['Snake', 'Devil'])
    expect(state.monsterDeck).toMatchObject({ draw: [], discard: ['snake'] })
    // Another hero can still have a Snake: the discards are reshuffled.
    state = draw(state, 1)
    expect(state.monsters.map((m) => m.name)).toEqual(['Snake', 'Devil', 'Snake'])
    expect(draw(state).log[0].text).toMatch(/no monster card left/)
  })

  it('puts defeated monsters in the XP pile and removed ones back in the deck', () => {
    let state = draw(draw(startGame()))
    state = gameReducer(state, { type: 'DEFEAT_MONSTER', monsterId: state.monsters[0].id })
    expect(state.monsterDeck.discard).toEqual(['snake'])
    state = gameReducer(state, { type: 'REMOVE_MONSTER', monsterId: state.monsters[0].id })
    expect(state.monsterDeck.discard).toEqual(['snake', 'devil'])
  })

  it('asks for one treasure card per turn for defeating monsters', () => {
    let state = draw(draw(startGame()))
    state = gameReducer(state, { type: 'DEFEAT_MONSTER', monsterId: state.monsters[0].id })
    expect(state.moment.detail).toMatch(/treasure/)
    state = gameReducer(state, { type: 'DEFEAT_MONSTER', monsterId: state.monsters[0].id })
    expect(state.moment.detail).not.toMatch(/treasure/)
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

describe('hero attacks', () => {
  const ogre = {
    id: 'ogre', name: 'Ogre', copies: 1, ac: 14, hp: 2, xp: 2, figures: 1,
    attacks: [{ id: 'slam', name: 'Slam', bonus: 7, damage: 1, miss: 0, conditions: [] }],
    tactics: [{ move: 'toward' }],
  }
  const devils = { ...ogre, id: 'devils', name: 'Devil', hp: 1, xp: 3, figures: 3 }
  const withPower = (state, card, type = 'at-will') => {
    const hero = state.heroes[0]
    return gameReducer(state, { type: 'SET_POWER_CARD', heroId: hero.id, powerId: hero.powers.find((p) => p.type === type).id, card })
  }
  const setup = (cards = [ogre], power = { id: 'strike', name: 'Strike', attack: '+6', damage: '2' }, type) => {
    let state = startGame()
    state = gameReducer(state, { type: 'DRAW_MONSTER', heroId: state.heroes[1].id, cards, random: [] })
    return withPower(state, power, type)
  }
  const attack = (state, roll, powerType = 'at-will') =>
    gameReducer(state, {
      type: 'HERO_ATTACK',
      heroId: state.heroes[0].id,
      powerId: state.heroes[0].powers.find((p) => p.type === powerType).id,
      targets: [{ monsterId: state.monsters[0].id, roll }],
    })

  it('misses below the monster AC and defeats it on a hit that drops it to 0', () => {
    let state = setup()
    expect(attack(state, 7).monsters[0].hp).toBe(2) // 7 + 6 = 13 vs AC 14
    state = attack(state, 8)
    expect(state.monsters).toHaveLength(0)
    expect(state.xp).toBe(2)
    expect(state.monsterDeck.discard).toEqual([])
    expect(state.moment).toMatchObject({ kind: 'defeat', detail: expect.stringMatching(/treasure/) })
  })

  it('remembers a natural 20 so the hero can level up, until the next turn', () => {
    expect(attack(setup(), 19).turn.natural20).toBeUndefined()
    let state = attack(setup(), 20)
    expect(state.turn.natural20).toBe(state.heroes[0].id)
    for (let i = 0; i < 3; i++) state = gameReducer(state, { type: 'NEXT_PHASE' })
    expect(state.turn.natural20).toBeUndefined()
  })

  it('takes one Legion Devil figure at a time', () => {
    const state = attack(setup([devils]), 15)
    expect(state.monsters[0].hp).toBe(2)
  })

  it('uses up a daily power after attacking', () => {
    const state = attack(setup([ogre], { id: 'blast', name: 'Blast', attack: '+8', damage: '1' }, 'daily'), 2, 'daily')
    expect(state.heroes[0].powers.find((p) => p.type === 'daily').used).toBe(true)
    expect(attack(state, 15, 'daily')).toBe(state)
  })

  it('deals a power\'s miss damage on a miss', () => {
    const state = attack(setup([ogre], { id: 'smite', name: 'Smite', attack: '+9', damage: '3 (Miss: 1)' }), 2)
    expect(state.monsters[0].hp).toBe(1)
  })

  it('gives monsters from before the deck their card, matched by name', () => {
    let state = gameReducer(startGame(), { type: 'ADD_MONSTER', name: 'ogre', hp: 2, xp: 2, ownerId: startGame().heroes[0].id })
    state = gameReducer(state, { type: 'ATTACH_MONSTER_CARDS', cards: [ogre] })
    expect(state.monsters[0]).toMatchObject({ ac: 14, hp: 2, card: { attacks: [{ id: 'slam' }] } })
    expect(gameReducer(state, { type: 'ATTACH_MONSTER_CARDS', cards: [ogre] })).toBe(state)
  })

  it('needs a power with an attack number', () => {
    const state = setup([ogre], { id: 'heal', name: 'Heal', attack: '', damage: '' })
    expect(attack(state, 15)).toBe(state)
  })
})

describe('turn guide answers', () => {
  const toExploration = (state) => gameReducer(state, { type: 'NEXT_PHASE' })

  it('moves on to the Villain Phase when the hero did not explore', () => {
    const state = gameReducer(toExploration(startGame()), { type: 'SET_EXPLORED', explored: false })
    expect(state.turn).toMatchObject({ phase: 2, explored: false })
  })

  it('remembers the monster drawn for a new tile until the turn passes', () => {
    let state = gameReducer(toExploration(startGame()), { type: 'SET_EXPLORED', explored: true })
    expect(state.turn).toMatchObject({ phase: 1, explored: true })
    state = gameReducer(state, { type: 'DRAW_MONSTER', heroId: state.heroes[0].id, cards: [
      { id: 'a', name: 'A', copies: 2, ac: 13, hp: 1, xp: 1, attacks: [], tactics: [{ move: 'toward' }] },
    ], random: [] })
    expect(state.turn.monsterDrawn).toBe(true)
    state = gameReducer(gameReducer(state, { type: 'NEXT_PHASE' }), { type: 'NEXT_PHASE' })
    expect(state.turn).toEqual({ heroIndex: 1, phase: 0, round: 1 })
  })

  it('only answers the exploration question during the Exploration Phase', () => {
    const state = startGame()
    expect(gameReducer(state, { type: 'SET_EXPLORED', explored: false })).toBe(state)
  })
})

describe('conditions between phases', () => {
  const poisoned = (state, i) => gameReducer(state, { type: 'TOGGLE_HERO_CONDITION', heroId: state.heroes[i].id, condition: 'Poisoned' })
  const next = (state, roll = 1) => gameReducer(state, { type: 'NEXT_PHASE', roll })

  it('hurts a poisoned hero at the start of their turn', () => {
    let state = poisoned(startGame(), 1)
    state = next(next(next(state)))
    expect(state.turn.heroIndex).toBe(1)
    expect(state.heroes[1].hp).toBe(state.heroes[1].maxHp - 1)
    expect(state.moment.kind).toBe('poison')
  })

  it('rolls 10 or more after the Hero Phase to end the poison', () => {
    const state = poisoned(startGame(), 0)
    expect(next(state, 9).heroes[0].conditions).toEqual(['Poisoned'])
    expect(next(state, 10).heroes[0].conditions).toEqual([])
  })

  it('ends Dazed after the Hero Phase', () => {
    const start = startGame()
    const state = gameReducer(start, { type: 'TOGGLE_HERO_CONDITION', heroId: start.heroes[0].id, condition: 'Dazed' })
    expect(state.heroes[0].conditions).toEqual(['Dazed'])
    expect(next(state).heroes[0].conditions).toEqual([])
  })
})

describe('encounter deck', () => {
  // Made-up cards in the card file's format, normalized like the real ones.
  const { encounters, monsters, problems } = normalizeCardFile({
    powers: [],
    monsters: [
      { id: 'orc', name: 'Orc', copies: 2, ac: 13, hp: 1, xp: 1, types: ['Orc'], attacks: [], tactics: [{ move: 'toward' }] },
      { id: 'rat', name: 'Rat', copies: 3, ac: 12, hp: 1, xp: 1, types: ['Animal'], attacks: [], tactics: [{ move: 'toward' }] },
    ],
    encounters: [
      { id: 'arrow', name: 'Arrow', type: 'event', attack: { bonus: 8, damage: 2, miss: 1, conditions: ['Poisoned'], targets: 'active' } },
      { id: 'heat', name: 'Heat', type: 'event', damageEach: 1, drawAnother: true },
      { id: 'jinx', name: 'Jinx', type: 'curse', curse: { acPenalty: 4, attackPenalty: 2, removeRoll: { phase: 'hero', target: 10 } } },
      { id: 'bad-air', name: 'Bad Air', type: 'environment', trapPenalty: 4 },
      { id: 'still-air', name: 'Still Air', type: 'environment' },
      { id: 'darts', name: 'Darts', type: 'trap', trap: { attack: { bonus: 8, damage: 1, targets: 'trapTile' }, disable: 10 } },
      { id: 'orcs', name: 'Orcs', type: 'event', filterMonsters: 'Orc' },
      { id: 'cage', name: 'Cage', type: 'curse', curse: { removeRoll: { phase: 'action', target: 10 } } },
      { id: 'thirst', name: 'Thirst', type: 'curse', curse: { startDamage: 1, removeOnDefeat: true } },
    ],
  })
  const card = (id) => encounters.find((c) => c.id === id)
  // Draws the given card by putting it alone in the deck.
  const drawCard = (state, id, heroIndex = 0) =>
    gameReducer(
      { ...state, encounterDeck: { cards: Object.fromEntries(encounters.map((c) => [c.id, c])), draw: [id], discard: state.encounterDeck?.discard ?? [] } },
      { type: 'DRAW_ENCOUNTER', heroId: state.heroes[heroIndex].id, cards: encounters, random: [] },
    )
  const resolve = (state) => gameReducer(state, { type: 'RESOLVE_ENCOUNTER', random: [], monsterCards: monsters })

  it('reads the made-up cards without problems', () => {
    expect(problems).toEqual([])
    expect(card('jinx').curse).toMatchObject({ acPenalty: 4, removeRoll: { phase: 'hero', target: 10 } })
  })

  it('builds the deck on the first draw and shows the card', () => {
    const game = startGame()
    const state = gameReducer(game, { type: 'DRAW_ENCOUNTER', heroId: game.heroes[0].id, cards: encounters, random: [] })
    expect(state.encounter.card.name).toBeTruthy()
    expect(state.encounterDeck.draw).toHaveLength(encounters.length - 1)
    expect(state.turn.encountersDrawn).toBe(1)
    expect(state.moment.kind).toBe('encounter')
  })

  it('rolls an encounter attack once against the active hero', () => {
    let state = drawCard(startGame(), 'arrow')
    const hero = state.heroes[0]
    state = gameReducer(state, { type: 'ENCOUNTER_ATTACK', targets: [{ heroId: hero.id, roll: 20 }] })
    expect(state.heroes[0].hp).toBe(hero.hp - 2)
    expect(state.heroes[0].conditions).toContain('Poisoned')
    expect(gameReducer(state, { type: 'ENCOUNTER_ATTACK', targets: [{ heroId: hero.id, roll: 20 }] })).toBe(state)
    expect(gameReducer(state, { type: 'CANCEL_ENCOUNTER' })).toBe(state)
    state = resolve(state)
    expect(state.encounter).toBeNull()
    expect(state.encounterDeck.discard).toEqual(['arrow'])
  })

  it('cancels an encounter for 5 XP before it happens', () => {
    let state = drawCard({ ...startGame(), xp: 6 }, 'heat')
    state = gameReducer(state, { type: 'CANCEL_ENCOUNTER' })
    expect(state.xp).toBe(1)
    expect(state.encounter).toBeNull()
    expect(state.heroes[0].hp).toBe(state.heroes[0].maxHp)
  })

  it('deals damage to every hero and owes another draw', () => {
    const state = resolve(drawCard(startGame(), 'heat'))
    expect(state.heroes.every((h) => h.hp === h.maxHp - 1)).toBe(true)
    expect(state.turn.encountersOwed).toBe(1)
  })

  it('keeps the turn from moving on while an encounter is out', () => {
    let state = startGame()
    for (let i = 0; i < 2; i++) state = gameReducer(state, { type: 'NEXT_PHASE' })
    state = drawCard(state, 'heat')
    expect(gameReducer(state, { type: 'NEXT_PHASE' })).toBe(state)
  })

  it('puts a curse on the hero that lowers AC and attacks, and a roll can end it', () => {
    let state = resolve(drawCard(startGame(), 'jinx'))
    const hero = state.heroes[0]
    expect(hero.curses).toHaveLength(1)
    expect(heroAc(hero)).toBe(hero.ac - 4)
    expect(heroAttackPenalty(hero)).toBe(2)
    expect(gameReducer(state, { type: 'NEXT_PHASE', rolls: [9] }).heroes[0].curses).toHaveLength(1)
    state = gameReducer(state, { type: 'NEXT_PHASE', rolls: [10] })
    expect(state.heroes[0].curses).toHaveLength(0)
    expect(state.encounterDeck.discard).toContain('jinx')
  })

  it('opens the cage on a 10 or more', () => {
    let state = resolve(drawCard(startGame(), 'cage'))
    const curseId = state.heroes[0].curses[0].id
    const heroId = state.heroes[0].id
    expect(gameReducer(state, { type: 'CURSE_ROLL', heroId, curseId, roll: 9 }).heroes[0].curses).toHaveLength(1)
    state = gameReducer(state, { type: 'CURSE_ROLL', heroId, curseId, roll: 12 })
    expect(state.heroes[0].curses).toHaveLength(0)
  })

  it('hurts at the start of the turn until the hero defeats a monster', () => {
    let state = resolve(drawCard(startGame(), 'thirst', 1))
    for (let i = 0; i < 3; i++) state = gameReducer(state, { type: 'NEXT_PHASE' })
    expect(state.turn.heroIndex).toBe(1)
    expect(state.heroes[1].hp).toBe(state.heroes[1].maxHp - 1)
  })

  it('replaces the environment and discards the old one', () => {
    let state = resolve(drawCard(startGame(), 'bad-air'))
    expect(state.environment.name).toBe('Bad Air')
    state = resolve(drawCard(state, 'still-air'))
    expect(state.environment.name).toBe('Still Air')
    expect(state.encounterDeck.discard).toContain('bad-air')
  })

  it('places a trap that attacks on its turn and can be disabled', () => {
    let state = resolve(drawCard(startGame(), 'darts'))
    const trap = state.traps[0]
    const hero = state.heroes[1]
    expect(trap).toMatchObject({ name: 'Darts', ownerId: state.heroes[0].id })
    state = gameReducer(state, { type: 'TRAP_ATTACK', trapId: trap.id, targets: [{ heroId: hero.id, roll: 19 }] })
    expect(state.heroes[1].hp).toBe(hero.hp - 1)
    expect(gameReducer(state, { type: 'DISABLE_TRAP', trapId: trap.id, heroId: hero.id, roll: 9 }).traps).toHaveLength(1)
    state = gameReducer(state, { type: 'DISABLE_TRAP', trapId: trap.id, heroId: hero.id, roll: 10 })
    expect(state.traps).toHaveLength(0)
    expect(state.encounterDeck.discard).toContain('darts')
  })

  it('makes traps harder to disable in a trapper environment', () => {
    let state = resolve(drawCard(startGame(), 'darts'))
    state = resolve(drawCard(state, 'bad-air'))
    expect(gameReducer(state, { type: 'DISABLE_TRAP', trapId: state.traps[0].id, heroId: state.heroes[0].id, roll: 13 }).traps).toHaveLength(1)
  })

  it('discards a trap drawn for a tile that already has a marker and owes a new draw', () => {
    const state = gameReducer(drawCard(startGame(), 'darts'), { type: 'REDRAW_ENCOUNTER' })
    expect(state.encounter).toBeNull()
    expect(state.traps).toHaveLength(0)
    expect(state.turn.encountersOwed).toBe(1)
  })

  it('keeps only the monsters of one kind on top of the monster deck', () => {
    let state = startGame()
    const cards = Object.fromEntries(monsters.map((m) => [m.id, m]))
    state = { ...state, monsterDeck: { cards, draw: ['rat', 'orc', 'rat', 'orc', 'rat', 'rat'], discard: [] } }
    state = resolve(drawCard(state, 'orcs'))
    expect(state.monsterDeck.draw).toEqual(['orc', 'orc', 'rat'])
    expect(state.monsterDeck.discard).toEqual(['rat', 'rat', 'rat'])
  })

  it('passes a monster card to another hero', () => {
    let state = startGame()
    state = gameReducer(state, { type: 'ADD_MONSTER', name: 'Rat', hp: 1, xp: 1, ownerId: state.heroes[0].id })
    state = gameReducer(state, { type: 'SET_MONSTER_OWNER', monsterId: state.monsters[0].id, ownerId: state.heroes[1].id })
    expect(state.monsters[0].ownerId).toBe(state.heroes[1].id)
  })
})

describe('treasure deck', () => {
  const { treasures, monsters } = normalizeCardFile({
    powers: [],
    monsters: [
      { id: 'ogre', name: 'Ogre', ac: 14, hp: 1, xp: 2, attacks: [{ id: 'slam', name: 'Slam', bonus: 8, damage: 2 }], tactics: [{ move: 'toward' }] },
      { id: 'rat', name: 'Rat', ac: 12, hp: 1, xp: 1, attacks: [], tactics: [{ move: 'toward' }] },
    ],
    treasures: [
      { id: 'sword', name: 'Sword', inPlay: true, attackBonus: 2, attackRange: 'adjacent', critFrom: 18 },
      { id: 'amulet', name: 'Amulet', inPlay: true, acBonus: 1 },
      { id: 'shield', name: 'Shield', inPlay: true, tileAcBonus: 2 },
      { id: 'potion', name: 'Potion', use: 'heal', heal: 2, after: 'discard' },
      { id: 'ring', name: 'Ring', attack: { bonus: 8, damage: 1 }, after: 'flip' },
      { id: 'charm', name: 'Charm', use: 'reroll', after: 'discard' },
      { id: 'tome', name: 'Tome', use: 'levelUp', after: 'discard' },
      { id: 'pearl', name: 'Pearl', use: 'refreshAny', after: 'flip' },
      { id: 'tools', name: 'Tools', inPlay: true, trapBonus: 4 },
      { id: 'scroll', name: 'Scroll', use: 'monsterControl', monsterAttack: { bonus: 9, damage: 1 }, after: 'discard' },
      { id: 'wand', name: 'Wand', use: 'polymorph', after: 'flip' },
    ],
  })
  const strike = { id: 'strike', name: 'Strike', attack: '+6', damage: '1' }
  // Two heroes, each with a monster, Quinn holding a Strike.
  const setup = () => {
    let state = startGame()
    const quinn = state.heroes[0]
    state = gameReducer(state, { type: 'SET_POWER_CARD', heroId: quinn.id, powerId: quinn.powers[0].id, card: strike })
    for (const hero of state.heroes) state = gameReducer(state, { type: 'DRAW_MONSTER', heroId: hero.id, cards: monsters, random: [] })
    return state
  }
  // Gives a hero a treasure by drawing it off a one-card deck.
  const give = (state, id, heroIndex = 0) => {
    const owed = { ...state, turn: { ...state.turn, treasureOwed: state.heroes[heroIndex].id } }
    const deck = { cards: Object.fromEntries(treasures.map((t) => [t.id, t])), draw: [id], discard: state.treasureDeck?.discard ?? [] }
    const drawn = gameReducer({ ...owed, treasureDeck: deck }, { type: 'DRAW_TREASURE', cards: treasures, random: [] })
    return gameReducer(drawn, { type: 'KEEP_TREASURE' })
  }
  const item = (state, name, heroIndex = 0) => state.heroes[heroIndex].items.find((i) => i.name === name)
  const attack = (state, roll, extra = {}) =>
    gameReducer(state, {
      type: 'HERO_ATTACK',
      heroId: state.heroes[0].id,
      powerId: state.heroes[0].powers[0].id,
      targets: [{ monsterId: state.monsters[0].id, roll }],
      ...extra,
    })

  it('reads the made-up cards without problems', () => {
    expect(treasures).toHaveLength(11)
  })

  it('gives each hero one treasure card before the adventure starts', () => {
    const heroes = HERO_TEMPLATES.slice(0, 3).map((t) => createHero(t))
    const state = gameReducer(initialState, { type: 'START_GAME', heroes, treasureCards: treasures, random: [] })
    expect(state.heroes.map((h) => h.items.map((i) => i.name))).toEqual([['Sword'], ['Amulet'], ['Shield']])
    expect(state.treasureDeck.draw).toHaveLength(8)
    expect(state.moment).toMatchObject({ kind: 'treasure', title: 'Starting treasure!' })
    // Without treasure cards, nobody gets one.
    expect(startGame().heroes[0].items).toBeUndefined()
  })

  it('owes the defeating hero one treasure card a turn, and draws it from the deck', () => {
    let state = attack(setup(), 10) // 10 + 6 beats the Ogre's AC 14
    expect(state.turn.treasureOwed).toBe(state.heroes[0].id)
    state = gameReducer(state, { type: 'DRAW_TREASURE', cards: treasures, random: [] })
    expect(state.treasure.card.name).toBe('Sword')
    expect(state.treasureDeck.draw).toHaveLength(10)
    expect(state.turn.treasureOwed).toBe(null)
    expect(state.moment.kind).toBe('treasure')
    // A second draw in the same turn does nothing.
    expect(gameReducer(state, { type: 'DRAW_TREASURE', cards: treasures, random: [] })).toBe(state)
  })

  it('keeps the turn from passing until someone takes the treasure, who can be another hero', () => {
    let state = attack(setup(), 10)
    state = gameReducer(state, { type: 'DRAW_TREASURE', cards: treasures, random: [] })
    state = { ...state, turn: { ...state.turn, phase: 2 } }
    expect(gameReducer(state, { type: 'NEXT_PHASE' })).toBe(state)
    state = gameReducer(state, { type: 'KEEP_TREASURE', heroId: state.heroes[1].id })
    expect(item(state, 'Sword', 1)).toMatchObject({ used: false })
    expect(state.treasure).toBe(null)
    expect(gameReducer(state, { type: 'NEXT_PHASE' }).turn.heroIndex).toBe(1)
  })

  it('adds a weapon bonus only against a monster next to the hero, plus damage on a high roll', () => {
    const state = give(setup(), 'sword')
    // 7 + 6 = 13 misses AC 14 from afar, but + 2 hits next to the hero.
    expect(attack(state, 7, { distances: { [state.monsters[0].id]: 'far' } }).turn.lastAttack.rolls[0].hit).toBe(false)
    expect(attack(state, 7, { distances: { [state.monsters[0].id]: 'adjacent' } }).turn.lastAttack.rolls[0].hit).toBe(true)
    expect(attack(state, 18).turn.lastAttack.rolls[0].dealt).toBe(2)
  })

  it('raises AC, and a shield guards heroes on its owner\'s tile when asked', () => {
    let state = give(give(setup(), 'amulet'), 'shield', 1)
    const [quinn, vistra] = state.heroes
    expect(heroAc(quinn)).toBe(quinn.ac + 1)
    expect(heroAc(vistra)).toBe(vistra.ac + 2)
    // The Ogre's 9 + 8 = 17 hits Quinn's AC 17 (16 + 1 for the amulet), but not 19 on the shield's tile.
    const ogre = state.monsters[0]
    const hit = gameReducer(state, { type: 'MONSTER_ATTACK', monsterId: ogre.id, attackId: 'slam', targets: [{ heroId: quinn.id, roll: 9 }] })
    expect(hit.turn.lastMonsterAttack.results[0].hit).toBe(true)
    const guarded = gameReducer(state, { type: 'MONSTER_ATTACK', monsterId: ogre.id, attackId: 'slam', targets: [{ heroId: quinn.id, roll: 9 }], tileGuarded: [quinn.id] })
    expect(guarded.turn.lastMonsterAttack.results[0]).toMatchObject({ hit: false, ac: 19 })
  })

  it('uses a potion on another hero and discards it', () => {
    let state = give(setup(), 'potion')
    const vistra = state.heroes[1]
    state = gameReducer(state, { type: 'ADJUST_HP', heroId: vistra.id, amount: -3 })
    state = gameReducer(state, { type: 'USE_ITEM', heroId: state.heroes[0].id, itemId: item(state, 'Potion').id, heroIds: [vistra.id] })
    expect(state.heroes[1].hp).toBe(vistra.maxHp - 1)
    expect(state.heroes[0].items).toEqual([])
    expect(state.treasureDeck.discard).toEqual(['potion'])
  })

  it('attacks with an item, then flips it over until a pearl flips it back', () => {
    let state = give(give(setup(), 'ring'), 'pearl')
    state = gameReducer(state, { type: 'HERO_ATTACK', heroId: state.heroes[0].id, itemId: item(state, 'Ring').id, targets: [{ monsterId: state.monsters[0].id, roll: 6 }] })
    expect(state.monsters.map((m) => m.name)).toEqual(['Rat']) // 6 + 8 beats AC 14
    expect(item(state, 'Ring').used).toBe(true)
    state = gameReducer(state, { type: 'USE_ITEM', heroId: state.heroes[0].id, itemId: item(state, 'Pearl').id, targetId: item(state, 'Ring').id })
    expect(item(state, 'Ring').used).toBe(false)
    expect(item(state, 'Pearl').used).toBe(true)
  })

  it('rerolls a missed attack with a lucky charm', () => {
    let state = attack(give(setup(), 'charm'), 2)
    const hero = state.heroes[0]
    state = gameReducer(state, { type: 'REROLL_ATTACK', helperId: hero.id, helperItemId: item(state, 'Charm').id, monsterId: state.monsters[0].id, roll: 15 })
    expect(state.monsters.map((m) => m.name)).toEqual(['Rat'])
    expect(state.heroes[0].items).toEqual([])
  })

  it('levels a hero up with a tome, without XP or a natural 20', () => {
    let state = give(setup(), 'tome')
    state = gameReducer(state, { type: 'USE_ITEM', heroId: state.heroes[0].id, itemId: item(state, 'Tome').id })
    expect(state.heroes[0].level).toBe(2)
    expect(state.xp).toBe(0)
  })

  it('makes one monster attack another with the scroll', () => {
    let state = give(setup(), 'scroll')
    const [ogre, rat] = state.monsters
    state = gameReducer(state, { type: 'MONSTER_CONTROL', heroId: state.heroes[0].id, itemId: item(state, 'Scroll').id, monsterId: ogre.id, targetId: rat.id, roll: 5 })
    expect(state.monsters.map((m) => m.name)).toEqual(['Ogre'])
    expect(state.xp).toBe(1)
    expect(state.turn.treasureOwed).toBe(state.heroes[0].id)
  })

  it('turns a monster into the next one off the monster deck', () => {
    let state = give(setup(), 'wand')
    const rat = state.monsters[1]
    state = gameReducer(state, { type: 'USE_ITEM', heroId: state.heroes[0].id, itemId: item(state, 'Wand').id, monsterId: rat.id, cards: monsters, random: [] })
    expect(state.monsters).toHaveLength(2)
    expect(state.monsters.find((m) => m.id === rat.id)).toBeUndefined()
    expect(state.monsters[1].ownerId).toBe(rat.ownerId)
  })

  it('adds thieves\' tools to the roll to disable a trap', () => {
    let state = give(setup(), 'tools')
    state = { ...state, traps: [{ id: 't1', cardId: 'darts', name: 'Darts', type: 'trap', ownerId: state.heroes[0].id, card: { trap: { disable: 10 } } }] }
    state = gameReducer(state, { type: 'DISABLE_TRAP', trapId: 't1', heroId: state.heroes[0].id, roll: 6 })
    expect(state.traps).toEqual([])
  })
})
