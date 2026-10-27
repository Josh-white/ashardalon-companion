import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { cardStats, normalizeCardFile } from './cards.js'

describe('card files', () => {
  it('accepts the example file with no problems', () => {
    const example = JSON.parse(readFileSync(new URL('../../cards/cards.example.json', import.meta.url), 'utf8'))
    const { powers, monsters, problems } = normalizeCardFile(example)
    expect(problems).toEqual([])
    expect(powers).toHaveLength(20)
    expect(monsters.map((m) => m.copies)).toEqual([3, 2])
  })

  it('skips monster cards whose tactics or attacks are broken', () => {
    const tactics = [{ move: 'toward' }]
    const { monsters, problems } = normalizeCardFile({
      powers: [],
      monsters: [
        { id: 'ok', name: 'Fine', ac: 13, hp: 1, xp: 1, attacks: [{ id: 'bite', name: 'Bite', bonus: 7 }], tactics },
        { id: 'no-ac', name: 'No AC', hp: 1, xp: 1, tactics },
        { id: 'bad-when', name: 'Bad when', ac: 13, hp: 1, xp: 1, tactics: [{ when: 'nearby' }] },
        { id: 'bad-attack', name: 'Bad attack', ac: 13, hp: 1, xp: 1, tactics: [{ when: 'adjacent', attack: 'claw' }] },
        { id: 'no-tactics', name: 'No tactics', ac: 13, hp: 1, xp: 1 },
      ],
    })
    expect(monsters.map((m) => m.name)).toEqual(['Fine'])
    expect(monsters[0]).toMatchObject({ copies: 1, figures: 1, attacks: [{ damage: 0, miss: 0, conditions: [] }] })
    expect(problems).toHaveLength(4)
  })

  it('skips broken cards and says why', () => {
    const { powers, problems } = normalizeCardFile({
      powers: [
        { id: 'a', hero: 'paladin', type: 'daily', name: 'Good' },
        { id: 'a', hero: 'paladin', type: 'daily', name: 'Same id' },
        { id: 'b', hero: 'bard', type: 'daily', name: 'Wrong hero' },
        { id: 'c', hero: 'rogue', type: 'encounter', name: 'Wrong type' },
        { hero: 'rogue', type: 'daily', name: 'No id' },
      ],
    })
    expect(powers.map((p) => p.name)).toEqual(['Good'])
    expect(problems).toHaveLength(4)
  })

  it('needs a powers list', () => {
    expect(normalizeCardFile({}).problems).toHaveLength(1)
  })
})

describe('hero abilities', () => {
  it('reads abilities and their level', () => {
    const { abilities, problems } = normalizeCardFile({
      powers: [],
      heroes: [
        { hero: 'paladin', abilities: [{ name: 'Healing Hands', text: 'Heal' }, { name: 'Critical Hit', level: 2 }, { text: 'no name' }] },
        { hero: 'bard', abilities: [] },
      ],
    })
    expect(abilities.map((a) => [a.name, a.level])).toEqual([
      ['Healing Hands', 1],
      ['Critical Hit', 2],
    ])
    expect(problems).toHaveLength(2)
  })
})

describe('cardStats', () => {
  it('shows attack and damage when the card has them', () => {
    expect(cardStats({ attack: '+8', damage: '1' })).toBe('Attack +8 · Damage 1')
    expect(cardStats({ text: 'heal' })).toBe('')
    expect(cardStats(null)).toBe('')
  })
})
