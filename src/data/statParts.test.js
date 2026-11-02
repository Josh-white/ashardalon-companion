import { describe, expect, it } from 'vitest'
import { moveSpeed } from '../board/play.js'
import { heroAc } from './powerEffects.js'
import { acParts, attackParts, heroBadges, speedParts } from './statParts.js'

const item = (name, card) => ({ id: name, name, card: { inPlay: true, ...card } })
const amulet = item('Amulet of Protection', { acBonus: 1 })
const shieldOfProtection = item('Shield of Protection', { acBonus: 1 })
const vorpal = item('Vorpal Sword', { attackBonus: 2, attackRange: 'adjacent', critFrom: 18 })
const sword1 = item('+1 Magic Sword', { attackBonus: 1, attackRange: 'adjacent' })
const staff = item('Staff of the Elements', { attackBonus: 2, attackRange: 'within1' })
const gauntlets = item('Gauntlets of Ogre Power', { damageBonus: 1, damageRange: 'adjacent' })
const boots = item('Boots of Striding', { speedBonus: 1 })
const quinn = { id: 'q', name: 'Quinn' }
const vistra = (extra = {}) => ({ id: 'v', name: 'Vistra', ac: 18, speed: 5, conditions: [], items: [], ...extra })

describe('acParts', () => {
  it('lists the card, the best item, shields and curses, adding up to heroAc', () => {
    const hero = vistra({
      items: [amulet, shieldOfProtection],
      shieldedBy: 'q',
      tokens: { mirrorImage: 1 },
      curses: [{ id: 'c', name: 'Gap in the Armor', card: { acPenalty: 4 } }],
    })
    const { total, parts } = acParts(hero, [quinn, hero])
    expect(parts.map((p) => [p.label, p.value, p.kind])).toEqual([
      ['Starting AC', 18, 'card'],
      ['Amulet of Protection', 1, 'item'],
      ['Shield of Protection', 0, 'off'],
      ["Quinn's Cleric's Shield", 2, 'power'],
      ['Mirror Image (1)', 2, 'power'],
      ['Gap in the Armor', -4, 'curse'],
    ])
    expect(total).toBe(heroAc(hero))
  })

  it('counts Blessed Shield for its owner', () => {
    const hero = vistra({ items: [amulet, item('Blessed Shield', { tileAcBonus: 2 })] })
    expect(acParts(hero).total).toBe(heroAc(hero))
    expect(acParts(hero).parts.find((p) => p.kind === 'off').label).toBe('Amulet of Protection')
  })
})

describe('speedParts', () => {
  it('adds Boots of Striding, like the virtual board does', () => {
    const hero = vistra({ items: [boots] })
    expect(speedParts(hero).total).toBe(6)
    expect(moveSpeed(hero)).toBe(6)
  })

  it('caps a Slowed hero at 2', () => {
    const hero = vistra({ items: [boots], conditions: ['Slowed'] })
    expect(speedParts(hero).total).toBe(2)
    expect(moveSpeed(hero)).toBe(2)
    expect(speedParts(hero).parts.at(-1)).toMatchObject({ label: 'Slowed', value: -4, kind: 'condition' })
  })
})

describe('attackParts', () => {
  it('counts only the best attack item and every damage item', () => {
    const hero = vistra({ items: [sword1, vorpal, gauntlets] })
    const result = attackParts(hero)
    expect(result.total).toBe(2)
    expect(result.parts.map((p) => [p.label, p.kind])).toEqual([
      ['Vorpal Sword', 'item'],
      ['+1 Magic Sword', 'off'],
    ])
    expect(result.damage).toBe(1)
    expect(result.damageParts.map((p) => p.label)).toEqual(['Gauntlets of Ogre Power', 'Vorpal Sword'])
  })

  it('says when a tied item still counts farther away', () => {
    const hero = vistra({ items: [vorpal, staff] })
    expect(attackParts(hero).parts[1]).toMatchObject({ label: 'Staff of the Elements', kind: 'off', note: 'Counts instead against a monster within 1 tile.' })
  })

  it('takes off curse penalties', () => {
    const hero = vistra({ curses: [{ id: 'c', name: 'Dragon Fear', card: { attackPenalty: 2 } }] })
    expect(attackParts(hero).total).toBe(-2)
  })
})

describe('heroBadges', () => {
  it('shows helping things and hurting things, and leaves out items that add nothing', () => {
    const hero = vistra({ items: [amulet, shieldOfProtection, vorpal, gauntlets, boots], shieldedBy: 'q', conditions: ['Poisoned'] })
    expect(heroBadges(hero, [quinn, hero])).toEqual([
      { text: '+1 AC Amulet of Protection', good: true },
      { text: "+2 AC Quinn's Cleric's Shield", good: true },
      { text: '+2 hit Vorpal Sword', good: true },
      { text: '+1 dmg Gauntlets of Ogre Power', good: true },
      { text: '+1 dmg on 18+ Vorpal Sword', good: true },
      { text: '+1 speed Boots of Striding', good: true },
      { text: 'Poisoned', good: false },
    ])
  })

  it('is empty for a hero with nothing going on', () => {
    expect(heroBadges(vistra())).toEqual([])
  })
})

describe('attackNumbers (the attack box sum and the roll use the same numbers)', () => {
  it('lists the power, magic weapon, curse and damage items', async () => {
    const { attackNumbers } = await import('../state/game.js')
    const hero = vistra({ items: [vorpal, gauntlets], curses: [{ id: 'c', name: 'Dragon Fear', card: { attackPenalty: 1 } }] })
    const power = { id: 'p', name: 'Cleave', type: 'at-will', card: { attack: '+6', damage: '1' } }
    const numbers = attackNumbers(hero, { power, distance: 'adjacent' })
    expect(numbers.parts.bonus).toEqual([
      { label: 'Cleave', value: 6 },
      { label: 'Dragon Fear', value: -1 },
      { label: 'Vorpal Sword', value: 2 },
    ])
    expect(numbers.bonus).toBe(7)
    expect(numbers.damage).toBe(2)
    expect(numbers.crits).toEqual([18])
    expect(attackNumbers(hero, { power, distance: 'far' }).bonus).toBe(5)
  })
})

describe('Critical Hit at level 2 (house rule)', () => {
  it('adds +1 damage on a natural 20 for level 2 heroes only', async () => {
    const { attackNumbers } = await import('../state/game.js')
    const power = { id: 'p', name: 'Cleave', type: 'at-will', card: { attack: '+6', damage: '1' } }
    expect(attackNumbers(vistra({ level: 1 }), { power, distance: 'adjacent' }).crits).toEqual([])
    const levelTwo = attackNumbers(vistra({ level: 2, items: [vorpal] }), { power, distance: 'adjacent' })
    expect(levelTwo.crits).toEqual([18, 20])
    expect(levelTwo.parts.crits.at(-1)).toEqual({ label: 'Critical Hit', from: 20 })
  })
})
