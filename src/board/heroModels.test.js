import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { attackMove, heroModel, MODEL_PROPS, monsterModel } from './heroModels.js'

describe("the heroes' 3D figures", () => {
  it('gives each box hero its own look, carrying gear its figure has', () => {
    const looks = HERO_TEMPLATES.map((t) => heroModel(t))
    expect(new Set(looks.map((l) => `${l.model}:${l.gear.join()}`)).size).toBe(HERO_TEMPLATES.length)
    for (const look of looks) for (const gear of look.gear) expect(MODEL_PROPS[look.model]).toContain(gear)
    expect(heroModel({ key: 'wizard' }).model).toBe('Mage')
    // Vistra the dwarf stands a little shorter.
    expect(heroModel({ key: 'fighter' }).height).toBeLessThan(1)
  })

  it('picks a figure for a fan hero from its class, and one for anybody else', () => {
    expect(heroModel({ key: 'aldred', className: 'Human Druid' }).model).toBe('Mage')
    expect(heroModel({ key: 'savryna', className: 'Elf Ranger' }).gear).toEqual(['2H_Crossbow'])
    expect(heroModel({ key: 'fesud', className: 'Tiefling Assassin' }).model).toBe('Rogue_Hooded')
    expect(heroModel({ key: 'robot', className: 'Robot' }).model).toBe('Knight')
  })

  it('swings for a weapon, shoots an arrow, throws the shield and casts a spell', () => {
    expect(attackMove('weapon')).toBe('attack')
    expect(attackMove('arrow')).toBe('shoot')
    expect(attackMove('shield')).toBe('throw')
    expect(attackMove('fire')).toBe('cast')
  })

  it('gives the monsters we made their own figures and leaves other monsters as standees', () => {
    expect(monsterModel({ name: 'Orc Smasher' })).toEqual({ model: 'Orc_Smasher', gear: [], height: 1 })
    expect(monsterModel({ name: 'Orc Archer' }).model).toBe('Orc_Archer')
    expect(monsterModel({ name: 'Kobold Dragonshield' }).model).toBe('Kobold_Dragonshield')
    // Not the villain: Kobold Dragonlord gets his own figure later.
    expect(monsterModel({ name: 'Kobold Dragonlord' })).toBeNull()
    expect(monsterModel({ name: 'Human Cultist' }).model).toBe('Human_Cultist')
    expect(monsterModel({ name: 'Duergar Guard' }).model).toBe('Duergar_Guard')
    expect(monsterModel({ name: 'Duergar Captain' })).toBeNull()
    expect(monsterModel({ name: 'Snake' }).model).toBe('Snake')
    expect(monsterModel({ name: 'Cave Bear' }).model).toBe('Cave_Bear')
    expect(monsterModel({ name: 'Grell' })).toBeNull()
    for (const name of ['Orc_Smasher', 'Orc_Archer', 'Kobold_Dragonshield', 'Human_Cultist', 'Duergar_Guard', 'Snake', 'Cave_Bear']) expect(MODEL_PROPS[name]).toEqual([])
  })
})
