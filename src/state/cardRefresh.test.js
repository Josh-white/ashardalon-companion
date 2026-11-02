import { describe, expect, it } from 'vitest'
import { refreshCardEffects } from './cardRefresh.js'

const game = () => ({
  status: 'playing',
  heroes: [
    {
      id: 'h1',
      key: 'monk',
      name: 'Darna',
      hp: 5,
      abilityEffects: ['mind-over-body'],
      powers: [
        { id: 'p1', type: 'daily', used: true, card: { id: 'comet', name: 'Comet Strike', text: 'Old words.', attack: '+6', damage: '2', effect: { targets: 'any' } } },
        { id: 'p2', type: 'at-will', used: false, card: { id: 'jab', name: 'Jab', text: '', attack: '+4', damage: '1' } },
        { id: 'p3', type: 'utility', used: false, card: null },
      ],
    },
  ],
})

describe('card fixes reach a game in progress', () => {
  it('takes the card file effects and abilities, and keeps everything else', () => {
    const cards = {
      powers: [
        { id: 'comet', name: 'Comet Strike', text: 'New words.', effect: { targets: 'any', board: { before: [{ pick: 'self', to: 'path', n: 'speed' }] } } },
        { id: 'jab', name: 'Jab', text: '', effect: { critFrom: 19 } },
      ],
      heroes: [{ key: 'monk', abilityEffects: ['mind-over-body', 'fearless'] }],
    }
    const next = refreshCardEffects(game(), cards)
    const [hero] = next.heroes
    expect(hero.powers[0].card.effect.board.before[0].to).toBe('path')
    // The game's own copy of the card otherwise stays: its words, whether it's used.
    expect(hero.powers[0].card.text).toBe('Old words.')
    expect(hero.powers[0].used).toBe(true)
    expect(hero.powers[1].card.effect).toEqual({ critFrom: 19 })
    expect(hero.powers[2].card).toBeNull()
    expect(hero.abilityEffects).toEqual(['mind-over-body', 'fearless'])
    expect(hero.hp).toBe(5)
  })

  it('drops an effect the card file took away', () => {
    const next = refreshCardEffects(game(), { powers: [{ id: 'comet', name: 'Comet Strike' }], heroes: [] })
    expect(next.heroes[0].powers[0].card).not.toHaveProperty('effect')
  })

  it('gives the same game back when nothing changed, or the card is gone from the file', () => {
    const state = game()
    expect(refreshCardEffects(state, { powers: [{ id: 'comet', effect: { targets: 'any' } }, { id: 'jab' }], heroes: [{ key: 'monk', abilityEffects: ['mind-over-body'] }] })).toBe(state)
    expect(refreshCardEffects(state, { powers: [], heroes: [] })).toBe(state)
    expect(refreshCardEffects({ status: 'setup', heroes: [] }, { powers: [] })).toEqual({ status: 'setup', heroes: [] })
  })
})
