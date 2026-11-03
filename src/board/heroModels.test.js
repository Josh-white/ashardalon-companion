import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { attackMove, heroModel, MODEL_PROPS, monsterModel } from './heroModels.js'

describe("the heroes' 3D figures", () => {
  it('gives each box hero its own figure, made from the card art', () => {
    const looks = HERO_TEMPLATES.map((t) => heroModel(t))
    expect(new Set(looks.map((l) => l.model)).size).toBe(HERO_TEMPLATES.length)
    for (const look of looks) expect(MODEL_PROPS[look.model]).toEqual([])
    expect(heroModel({ key: 'wizard' })).toEqual({ model: 'Hero_Heskan', gear: [], height: 1 })
    expect(heroModel({ key: 'fighter' }).model).toBe('Hero_Vistra')
    expect(heroModel({ key: 'cleric' }).model).toBe('Hero_Quinn')
    expect(heroModel({ key: 'paladin' }).model).toBe('Hero_Keyleth')
    expect(heroModel({ key: 'rogue' }).model).toBe('Hero_Tarak')
  })

  it('gives Berryloaf and Darna their own figures, by name', () => {
    expect(heroModel({ key: 'bard', name: 'Berryloaf', className: 'Halfling Bard' }).model).toBe('Hero_Berryloaf')
    expect(heroModel({ key: 'monk', name: 'Darna', className: 'Human Monk' }).model).toBe('Hero_Darna')
    // Somebody else's monk still gets a figure by class.
    expect(heroModel({ key: 'monk', name: 'Sen', className: 'Human Monk' }).model).toBe('Rogue')
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
    expect(monsterModel({ name: 'Kobold Dragonlord' }).model).toBe('Kobold_Dragonlord')
    expect(monsterModel({ name: 'Human Cultist' }).model).toBe('Human_Cultist')
    expect(monsterModel({ name: 'Duergar Guard' }).model).toBe('Duergar_Guard')
    expect(monsterModel({ name: 'Duergar Captain' }).model).toBe('Duergar_Captain')
    expect(monsterModel({ name: 'Orc Storm Shaman' }).model).toBe('Orc_Storm_Shaman')
    expect(monsterModel({ name: 'Gauth' }).model).toBe('Gauth')
    expect(monsterModel({ name: 'Otyugh' }).model).toBe('Otyugh')
    expect(monsterModel({ name: 'Rage Drake' }).model).toBe('Rage_Drake')
    expect(monsterModel({ name: 'Ashardalon' }).model).toBe('Ashardalon')
    expect(monsterModel({ name: 'Cassi' }).model).toBe('Villager_Cassi')
    expect(monsterModel({ name: 'Donnel' }).model).toBe('Villager_Donnel')
    expect(monsterModel({ name: 'Snake' }).model).toBe('Snake')
    expect(monsterModel({ name: 'Cave Bear' }).model).toBe('Cave_Bear')
    expect(monsterModel({ name: 'Legion Devil' }).model).toBe('Legion_Devil')
    expect(monsterModel({ name: 'Grell' }).model).toBe('Grell')
    expect(monsterModel({ name: 'Gibbering Mouther' }).model).toBe('Gibbering_Mouther')
    for (const name of ['Orc_Smasher', 'Orc_Archer', 'Kobold_Dragonshield', 'Human_Cultist', 'Duergar_Guard', 'Snake', 'Cave_Bear', 'Legion_Devil', 'Grell', 'Gibbering_Mouther', 'Kobold_Dragonlord', 'Duergar_Captain', 'Orc_Storm_Shaman', 'Gauth', 'Otyugh', 'Rage_Drake', 'Ashardalon', 'Villager_Alek', 'Villager_Brandis', 'Villager_Cassi', 'Villager_Donnel', 'Villager_Elizar']) expect(MODEL_PROPS[name]).toEqual([])
  })
})
