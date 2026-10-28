import { afterEach, describe, expect, it } from 'vitest'
import { normalizeCardFile } from './cards.js'
import { HERO_TEMPLATES, addedSlot, hasAbility, heroTemplates, setHeroTemplates, statsAtLevel, templateFor } from './heroes.js'
import { effectsOf, maxRolls } from './powerEffects.js'
import { createHero, gameReducer, initialState, levelSlots, poisonBonus } from '../state/game.js'

// A made-up homebrew hero, the way it would be written in cards.json.
const MONK = {
  hero: 'monk',
  name: 'Sen',
  className: 'Human Monk',
  color: 'teal',
  levels: [
    { level: 1, hp: 8, ac: 16, surge: 4, speed: 7 },
    { level: 2, hp: 11, ac: 16, surge: 5, speed: 8, addSlot: 'utility' },
  ],
  powerSlots: ['at-will', 'at-will', 'utility', 'daily'],
  abilities: [{ name: 'Iron Body', text: 'Shrugs off poison.', effect: 'cast-iron-stomach' }],
}
const monkPower = (id, type, extra = {}) => ({ id, hero: 'monk', type, name: id, text: `${id} text`, ...extra })

afterEach(() => setHeroTemplates(null))

describe('homebrew heroes in cards.json', () => {
  it('adds a homebrew hero after the five in the box, and accepts its powers', () => {
    const cards = normalizeCardFile({ powers: [monkPower('crane-step', 'at-will')], heroes: [MONK] })
    expect(cards.problems).toEqual([])
    expect(cards.heroes.map((h) => h.key)).toEqual([...HERO_TEMPLATES.map((t) => t.key), 'monk'])
    expect(cards.heroes.at(-1)).toMatchObject({
      key: 'monk',
      name: 'Sen',
      className: 'Human Monk',
      color: 'teal',
      maxHp: 8,
      ac: 16,
      surgeValue: 4,
      speed: 7,
      powerSlots: ['at-will', 'at-will', 'utility', 'daily'],
      abilityEffects: ['cast-iron-stomach'],
      homebrew: true,
    })
    expect(cards.powers.map((p) => p.hero)).toEqual(['monk'])
    expect(cards.abilities).toEqual([{ hero: 'monk', name: 'Iron Body', text: 'Shrugs off poison.', level: 1 }])
  })

  it('lists the five box heroes when the file has no heroes', () => {
    expect(normalizeCardFile({ powers: [] }).heroes).toEqual(HERO_TEMPLATES)
  })

  it('still flags a power for a hero nobody listed', () => {
    const cards = normalizeCardFile({ powers: [monkPower('crane-step', 'at-will')] })
    expect(cards.powers).toEqual([])
    expect(cards.problems[0]).toMatch(/hero "monk"/)
  })

  it('lists mistakes in a homebrew hero instead of hiding them', () => {
    const problems = (heroes) => normalizeCardFile({ powers: [], heroes }).problems
    expect(problems([{ hero: 'Monk' }])[0]).toMatch(/small letters/)
    expect(problems([{ hero: 'monk', levels: MONK.levels }])[0]).toMatch(/needs a "name"/)
    expect(problems([{ hero: 'monk', name: 'Sen', levels: [{ level: 1, hp: 8 }] }])[0]).toMatch(/level 1 row/)
    expect(problems([{ ...MONK, color: 'plaid' }])[0]).toMatch(/color "plaid"/)
    expect(problems([{ ...MONK, levels: [MONK.levels[0], { level: 2, addSlot: 'cantrip' }] }])[0]).toMatch(/slot "cantrip"/)
    expect(problems([{ ...MONK, abilities: [{ name: 'Zen', effect: 'levitate' }] }])[0]).toMatch(/effect "levitate"/)
    expect(problems([{ hero: 'paladin', levels: MONK.levels }])[0]).toMatch(/in the box/)
  })

  it('gives a homebrew hero without a color one nobody else has', () => {
    const { color, ...noColor } = MONK
    const cards = normalizeCardFile({ powers: [], heroes: [noColor] })
    expect(HERO_TEMPLATES.map((t) => t.color)).not.toContain(cards.heroes.at(-1).color)
  })

  it('lets a box hero ability name an effect too', () => {
    const cards = normalizeCardFile({ powers: [], heroes: [{ hero: 'rogue', abilities: [{ name: 'Tough', effect: 'healing-hands' }] }] })
    expect(cards.heroes.find((h) => h.key === 'rogue').abilityEffects).toEqual(['brutal-recovery', 'healing-hands'])
    expect(HERO_TEMPLATES.find((h) => h.key === 'rogue').abilityEffects).toEqual(['brutal-recovery'])
  })
})

describe('the hero list', () => {
  it('is the five in the box until the cards say otherwise', () => {
    expect(heroTemplates()).toBe(HERO_TEMPLATES)
    setHeroTemplates(normalizeCardFile({ powers: [], heroes: [MONK] }).heroes)
    expect(heroTemplates().map((t) => t.key)).toContain('monk')
    expect(templateFor('monk').name).toBe('Sen')
    setHeroTemplates([])
    expect(heroTemplates()).toBe(HERO_TEMPLATES)
    // A box hero is always found, even if a card file somehow left it out.
    setHeroTemplates([templateFor('cleric')])
    expect(templateFor('wizard').name).toBe('Heskan')
  })
})

describe('levels', () => {
  const monk = normalizeCardFile({ powers: [], heroes: [MONK] }).heroes.at(-1)

  it('uses the box bonuses for a box hero', () => {
    const keyleth = templateFor('paladin')
    expect(statsAtLevel(keyleth, 1)).toEqual({ maxHp: 8, ac: 17, surgeValue: 4, speed: 6 })
    expect(statsAtLevel(keyleth, 2)).toEqual({ maxHp: 10, ac: 18, surgeValue: 5, speed: 6 })
    expect(addedSlot(keyleth, 2)).toBe('daily')
    expect(levelSlots(keyleth, 2)).toEqual(['at-will', 'at-will', 'utility', 'utility', 'daily', 'daily'])
  })

  it("uses a homebrew hero's own level rows", () => {
    expect(statsAtLevel(monk, 2)).toEqual({ maxHp: 11, ac: 16, surgeValue: 5, speed: 8 })
    expect(levelSlots(monk, 2)).toEqual(['at-will', 'at-will', 'utility', 'daily', 'utility'])
  })

  it('levels a homebrew hero up by its row, with the power slot it adds', () => {
    setHeroTemplates(normalizeCardFile({ powers: [], heroes: [MONK] }).heroes)
    let state = gameReducer(initialState, { type: 'START_GAME', heroes: [createHero(monk)] })
    const hero = state.heroes[0]
    state = gameReducer(state, { type: 'ADJUST_HP', heroId: hero.id, amount: -3 })
    state = { ...state, xp: 5, turn: { ...state.turn, natural20: hero.id } }
    state = gameReducer(state, { type: 'LEVEL_UP', heroId: hero.id })
    expect(state.heroes[0]).toMatchObject({ level: 2, maxHp: 11, hp: 8, ac: 16, surgeValue: 5, speed: 8 })
    expect(state.heroes[0].powers.map((p) => p.type)).toEqual(['at-will', 'at-will', 'utility', 'daily', 'utility'])
    expect(state.moment.detail).toMatch(/another utility power/)
    // Level 2 is still as high as anyone goes.
    state = { ...state, xp: 5 }
    expect(gameReducer(state, { type: 'LEVEL_UP', heroId: hero.id })).toBe(state)
  })
})

describe('a homebrew hero in the lobby', () => {
  it('can be claimed and taken into the game with its powers', () => {
    const cards = normalizeCardFile({ powers: [monkPower('crane-step', 'at-will')], heroes: [MONK] })
    setHeroTemplates(cards.heroes)
    let state = gameReducer(initialState, { type: 'CLAIM_HERO', deviceId: 'a', heroKey: 'monk', picks: [cards.powers[0]] })
    expect(state.lobby[0].picks).toHaveLength(4)
    state = gameReducer(state, { type: 'SET_LOBBY_PLAYER', deviceId: 'a', player: 'Colton' })
    state = gameReducer(state, { type: 'SET_LOBBY_READY', deviceId: 'a', ready: true })
    state = gameReducer(state, { type: 'START_GAME' })
    expect(state.heroes[0]).toMatchObject({ key: 'monk', name: 'Sen', color: 'teal', maxHp: 8, speed: 7, abilityEffects: ['cast-iron-stomach'] })
    expect(state.heroes[0].powers[0].name).toBe('crane-step')
  })

  it("can't be claimed once it's gone from the card file", () => {
    expect(gameReducer(initialState, { type: 'CLAIM_HERO', deviceId: 'a', heroKey: 'monk' })).toBe(initialState)
  })
})

describe('hero card abilities', () => {
  it('go by what the ability does, not which hero has it', () => {
    const monk = createHero(normalizeCardFile({ powers: [], heroes: [MONK] }).heroes.at(-1))
    expect(poisonBonus(monk)).toBe(5)
    expect(poisonBonus(createHero(templateFor('fighter')))).toBe(5)
    expect(poisonBonus(createHero(templateFor('rogue')))).toBe(0)
  })

  it("work for a hero saved before abilities were saved on heroes", () => {
    const { abilityEffects, ...oldVistra } = createHero(templateFor('fighter'))
    expect(hasAbility(oldVistra, 'cast-iron-stomach')).toBe(true)
  })

  it('heals 1 more on a healing surge for any hero with Healing Hands', () => {
    const tough = { ...MONK, abilities: [{ name: 'Tough', effect: 'healing-hands' }] }
    const monk = createHero(normalizeCardFile({ powers: [], heroes: [tough] }).heroes.at(-1))
    let state = gameReducer(initialState, { type: 'START_GAME', heroes: [monk] })
    state = gameReducer(state, { type: 'ADJUST_HP', heroId: monk.id, amount: -99 })
    state = gameReducer(state, { type: 'USE_SURGE', heroId: monk.id })
    expect(state.heroes[0].hp).toBe(monk.surgeValue + 1)
  })
})

describe("a homebrew power's own effect", () => {
  it('is kept from cards.json, with unknown fields listed', () => {
    const cards = normalizeCardFile({
      powers: [monkPower('flurry', 'at-will', { effect: { targets: 2, note: 'Then move 1 square.', teleport: true } })],
      heroes: [MONK],
    })
    expect(cards.powers[0].effect).toEqual({ targets: 2, note: 'Then move 1 square.' })
    expect(cards.problems).toEqual(['"flurry" has effect fields the app doesn\'t know: teleport.'])
    expect(normalizeCardFile({ powers: [monkPower('x', 'daily', { effect: 'heal' })], heroes: [MONK] }).problems[0]).toMatch(/isn't a list/)
  })

  it('is used once the card is picked, and travels with the card into the game', () => {
    const card = normalizeCardFile({ powers: [monkPower('flurry', 'at-will', { effect: { targets: 2 } })], heroes: [MONK] }).powers[0]
    setHeroTemplates(normalizeCardFile({ powers: [], heroes: [MONK] }).heroes)
    let state = gameReducer(initialState, { type: 'CLAIM_HERO', deviceId: 'a', heroKey: 'monk', picks: [card] })
    state = gameReducer(state, { type: 'SET_LOBBY_PLAYER', deviceId: 'a', player: 'JJ' })
    state = gameReducer(state, { type: 'SET_LOBBY_READY', deviceId: 'a', ready: true })
    state = gameReducer(state, { type: 'START_GAME' })
    const power = state.heroes[0].powers[0]
    expect(effectsOf(power)).toEqual({ targets: 2 })
    expect(maxRolls(power)).toBe(2)
  })

  it("loses to the app's own entry for a power from the box", () => {
    expect(effectsOf({ card: { name: 'Healing Hymn', effect: { targets: 3 } } }).use.healSelf).toBe(2)
  })
})
