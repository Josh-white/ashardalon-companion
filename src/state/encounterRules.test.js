import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { heroAc } from '../data/powerEffects.js'
import { createHero, gameReducer, initialState } from './game.js'
import {
  attackBlocked, attackRolls, boardEffect, effectWords, encounterNotes, extraEncounterReasons, firstPicks, fixedTargets,
  heroNames, hitWords, resolveLabel, takesWords, targetQuestion,
} from './encounterRules.js'

function game() {
  const heroes = HERO_TEMPLATES.slice(0, 3).map((t) => createHero(t))
  const state = gameReducer(initialState, { type: 'START_GAME', heroes, tileRandom: [] })
  return { ...state, firstRoll: null, opening: null }
}

const attack = { bonus: 8, damage: 2, conditions: ['Dazed'], miss: 1, missConditions: [], targets: 'activeTile' }

describe('encounter rules', () => {
  it('asks who a tile attack hits, and fixes the active hero or everyone', () => {
    const state = game()
    const [hero] = state.heroes
    expect(targetQuestion('activeTile', hero)).toBe(`Tap every hero on ${hero.name}'s tile.`)
    expect(targetQuestion('active', hero)).toBeNull()
    expect(fixedTargets(state, { targets: 'active' }, hero)).toEqual([hero.id])
    expect(fixedTargets(state, { targets: 'all' }, hero)).toEqual(state.heroes.map((h) => h.id))
    expect(fixedTargets(state, attack, hero)).toBeNull()
  })

  it('skips heroes who are down at 0 HP', () => {
    const state = game()
    const down = { ...state, heroes: state.heroes.map((h, i) => (i === 1 ? { ...h, hp: 0 } : h)) }
    const [a, b, c] = down.heroes
    expect(fixedTargets(down, { targets: 'all' }, a)).toEqual([a.id, c.id])
    expect(fixedTargets(down, { targets: 'active' }, b)).toEqual([])
    expect(firstPicks(attack, b, null)).toEqual([])
  })

  it("picks the board's heroes first, else the active hero, else nobody for a trap's tile", () => {
    const [hero] = game().heroes
    expect(firstPicks(attack, hero, ['x'])).toEqual(['x'])
    expect(firstPicks(attack, hero, null)).toEqual([hero.id])
    expect(firstPicks({ targets: 'trapTile' }, hero, null)).toEqual([])
  })

  it('rolls each target against their AC: a tie hits', () => {
    const state = game()
    const [a, b] = state.heroes
    const rolls = attackRolls(state, attack, [{ heroId: a.id, roll: heroAc(a) - 8 }, { heroId: b.id, roll: heroAc(b) - 9 }])
    expect(rolls.map((r) => r.hit)).toEqual([true, false])
    expect(rolls[0]).toMatchObject({ hero: a, total: heroAc(a), ac: heroAc(a) })
  })

  it('says what a hit and a miss do', () => {
    expect(hitWords(attack)).toBe('2 damage and Dazed')
    expect(takesWords(attack, true)).toBe('2 damage and Dazed')
    expect(takesWords(attack, false)).toBe('1 damage')
    expect(takesWords({ ...attack, miss: 0 }, false)).toBe('nothing')
    expect(heroNames([{ name: 'A' }, { name: 'B' }, { name: 'C' }])).toBe('A, B and C')
  })

  it("discards a card whose villain isn't in play", () => {
    const state = game()
    const card = { type: 'event', villain: 'Meerak', drawAnother: true }
    expect(encounterNotes(state, card, false)).toEqual(['Its villain isn’t in play, so it’s just discarded.'])
    expect(encounterNotes(state, card, true)).toEqual(['Then you draw another encounter card.'])
    expect(resolveLabel(card, state.heroes[0], false)).toBe('Discard it')
    expect(resolveLabel({ type: 'curse' }, state.heroes[0], true)).toBe(`Put the curse on ${state.heroes[0].name}`)
  })

  it('explains an extra encounter card', () => {
    const state = game()
    const hero = { ...state.heroes[0], curses: [{ name: 'Bad Luck', card: { extraEncounter: 1 } }] }
    expect(extraEncounterReasons({ ...state, adventure: { extraEncounters: 1 } }, hero)).toEqual([
      `Bad Luck: ${hero.name} draws an extra card every Villain Phase.`,
      'The adventure adds an extra card every Villain Phase.',
    ])
  })

  it('blocks disabling a trap once the attack is spent', () => {
    const state = game()
    const hero = state.heroes[state.turn.heroIndex]
    expect(attackBlocked(state, hero, 'disabling a trap')).toBeNull()
    const spent = { ...state, turn: { ...state.turn, attackSpent: { heroId: hero.id, on: 'the Cage' } } }
    expect(attackBlocked(spent, hero, 'disabling a trap')).toBe(`${hero.name} used this turn's attack on the Cage.`)
  })

  it("says what a phase check's answer does", () => {
    expect(effectWords(null)).toBe('nothing happens')
    expect(effectWords({ damage: 1, condition: 'Dazed' })).toBe('1 damage and Dazed')
    expect(boardEffect({ damage: 1 }, 'Quinn')).toBe('Quinn takes 1 damage when you tap OK.')
    expect(boardEffect(null, 'Quinn')).toBe('Nothing happens.')
  })
})
