import { describe, expect, it } from 'vitest'
import { betterItem, helpsRightAway, itemsOutdone, spareItems } from './items.js'

const item = (name, card) => ({ id: name, name, card: { inPlay: true, ...card } })
const hero = (...items) => ({ id: 'h', items })
const sword1 = { inPlay: true, attackBonus: 1, attackRange: 'adjacent' }
const sword2 = item('+2 Magic Sword', { attackBonus: 2, attackRange: 'adjacent' })
const staff = item('Staff of the Elements', { attackBonus: 2, attackRange: 'within1' })
const amulet = { inPlay: true, acBonus: 1 }

describe('betterItem (Rulebook p. 13: only the best item bonus counts)', () => {
  it('names the item that already gives as good an attack bonus', () => {
    expect(betterItem(hero(sword2), sword1)?.name).toBe('+2 Magic Sword')
    expect(betterItem(hero(staff), sword1)?.name).toBe('Staff of the Elements')
  })

  it('lets a bigger bonus or a longer reach count', () => {
    expect(betterItem(hero(item('+1 Magic Sword', sword1)), sword2.card)).toBeNull()
    expect(betterItem(hero(sword2), staff.card)).toBeNull()
  })

  it('checks AC bonuses, with Blessed Shield counting for its owner', () => {
    expect(betterItem(hero(item('Blessed Shield', { tileAcBonus: 2 })), amulet)?.name).toBe('Blessed Shield')
    expect(betterItem(hero(item('Amulet', amulet)), { inPlay: true, acBonus: 2 })).toBeNull()
  })

  it('never calls a card wasted when it does anything else', () => {
    expect(betterItem(hero(sword2), { inPlay: true, attackBonus: 1, attackRange: 'adjacent', critFrom: 19 })).toBeNull()
    expect(betterItem(hero(item('Amulet', amulet)), { inPlay: true, acBonus: 1, tileAcBonus: 2 })).toBeNull()
    expect(betterItem(hero(sword2), { name: 'Potion of Healing' })).toBeNull()
    expect(betterItem(hero(), sword1)).toBeNull()
  })
})

describe('spareItems and itemsOutdone (items that add nothing for their owner)', () => {
  const amuletItem = item('Amulet of Protection', amulet)
  const shieldOfProtection = item('Shield of Protection', { acBonus: 1 })

  it('flags the newer of two equal items as the spare', () => {
    const spare = spareItems(hero(amuletItem, shieldOfProtection))
    expect(spare.map((s) => s.item.name)).toEqual(['Shield of Protection'])
    expect(spare[0].cover.name).toBe('Amulet of Protection')
  })

  it('flags an older item a better one has outdone', () => {
    expect(spareItems(hero(item('+1 Magic Sword', sword1), sword2)).map((s) => s.item.name)).toEqual(['+1 Magic Sword'])
    expect(spareItems(hero(amuletItem, sword2))).toEqual([])
  })

  it('names the held item a new card would outdo', () => {
    expect(itemsOutdone(hero(amuletItem), { inPlay: true, acBonus: 2 }).map((s) => s.item.name)).toEqual(['Amulet of Protection'])
    expect(itemsOutdone(hero(amuletItem), amulet)).toEqual([])
    expect(itemsOutdone(hero(amuletItem), sword1)).toEqual([])
  })
})

describe('helpsRightAway (which hero a drawn potion would help now)', () => {
  const healing = { name: 'Potion of Healing', use: 'heal', heal: 2 }
  const recovery = { name: 'Potion of Recovery', use: 'endCondition' }
  const rejuvenation = { name: 'Potion of Rejuvenation', use: 'refreshPower' }

  it('marks a hero at 2 HP or less for a Potion of Healing', () => {
    expect(helpsRightAway({ hp: 2, maxHp: 8 }, healing)).toMatch(/2 HP/)
    expect(helpsRightAway({ hp: 0, maxHp: 8 }, healing)).toMatch(/0 HP/)
    expect(helpsRightAway({ hp: 3, maxHp: 8 }, healing)).toBeNull()
    expect(helpsRightAway({ hp: 2, maxHp: 2 }, healing)).toBeNull()
  })

  it('marks a hero with a condition for a Potion of Recovery, not a curse', () => {
    expect(helpsRightAway({ hp: 5, maxHp: 8, conditions: ['Poisoned'] }, recovery)).toMatch(/Poisoned/)
    expect(helpsRightAway({ hp: 5, maxHp: 8, conditions: [], curses: [{ name: 'Gaze of the Basilisk' }] }, recovery)).toBeNull()
  })

  it('marks a hero with a used power for a Potion of Rejuvenation', () => {
    expect(helpsRightAway({ powers: [{ name: 'Hurled Breath', type: 'daily', used: true }] }, rejuvenation)).toMatch(/Hurled Breath/)
    expect(helpsRightAway({ powers: [{ name: 'Hurled Breath', type: 'daily', used: false }] }, rejuvenation)).toBeNull()
  })

  it('ignores other cards and heroes who escaped', () => {
    expect(helpsRightAway({ hp: 1, maxHp: 8 }, { name: '+1 Magic Sword', inPlay: true })).toBeNull()
    expect(helpsRightAway({ hp: 1, maxHp: 8, escaped: true }, healing)).toBeNull()
  })
})
