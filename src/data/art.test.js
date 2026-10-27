import { describe, expect, it } from 'vitest'
import { ART_NAME, cardArt, heroArt, monsterArt } from './art.js'

describe('card art names', () => {
  it('names each picture after what it shows', () => {
    expect(heroArt('cleric')).toBe('hero-cleric')
    expect(cardArt('monster', { id: 'human-cultist' })).toBe('monster-human-cultist')
    expect(monsterArt({ id: 'monster-7', cardId: 'human-cultist', name: 'Human Cultist' })).toBe('monster-human-cultist')
    expect(monsterArt({ id: 'villain-3', villain: true, cardId: 'meerak' })).toBe('villain-meerak')
  })

  it('uses the name for a monster added before the deck', () => {
    expect(monsterArt({ id: 'monster-1', name: 'Orc Archer' })).toBe('monster-orc-archer')
  })

  it('only makes names the server accepts', () => {
    for (const name of [heroArt('wizard'), monsterArt({ name: "Kobold's ../ Dragonshield!" })]) expect(name).toMatch(ART_NAME)
    expect('../game').not.toMatch(ART_NAME)
  })
})
