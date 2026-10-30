import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES, heroAbilities } from './heroes.js'

const keyleth = HERO_TEMPLATES.find((t) => t.key === 'paladin')

describe('heroAbilities', () => {
  it("gives the box's short hint for a card ability with the same name", () => {
    const cards = [{ hero: 'paladin', name: 'Healing hands', text: 'The card words.', level: 1 }]
    expect(heroAbilities(keyleth, cards)).toEqual([{ name: 'Healing hands', hint: expect.stringContaining('1 extra HP') }])
  })

  it("uses the card's own words for an ability without a hint, and leaves out later levels", () => {
    const cards = [
      { hero: 'paladin', name: 'Shining Oath', text: 'Homebrew words.', level: 1 },
      { hero: 'paladin', name: 'Later Trick', text: 'Level 2 words.', level: 2 },
      { hero: 'rogue', name: 'Brutal Recovery', text: '', level: 1 },
    ]
    expect(heroAbilities(keyleth, cards)).toEqual([{ name: 'Shining Oath', hint: 'Homebrew words.' }])
    expect(heroAbilities(keyleth, cards, 2).map((a) => a.name)).toEqual(['Shining Oath', 'Later Trick'])
  })

  it("falls back to the box's hints when the card file lists none", () => {
    for (const template of HERO_TEMPLATES) expect(heroAbilities(template, [])).toHaveLength(1)
  })
})
