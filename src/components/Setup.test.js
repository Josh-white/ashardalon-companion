import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { claimReady, startingPicks } from './Setup.jsx'

const paladin = HERO_TEMPLATES.find((t) => t.key === 'paladin')
const card = (id, type, flags = {}) => ({ id, hero: 'paladin', type, name: id, ...flags })

describe('setup picks', () => {
  const cards = [
    card('strike', 'at-will', { suggested: true }),
    card('other', 'at-will'),
    card('lay', 'utility', { always: true }),
    card('brave', 'utility', { suggested: true }),
    card('smite', 'daily'),
  ]

  it('fills always-cards first, then suggested ones', () => {
    expect(startingPicks(paladin, cards).map((c) => c?.id ?? null)).toEqual(['strike', null, 'lay', 'brave', null])
  })

  it('is ready only when every slot with cards has a pick', () => {
    const picks = startingPicks(paladin, cards)
    expect(claimReady({ heroKey: 'paladin', player: 'Dad', picks }, cards)).toBe(false)
    const full = [picks[0], cards[1], picks[2], picks[3], cards[4]]
    expect(claimReady({ heroKey: 'paladin', player: 'Dad', picks: full }, cards)).toBe(true)
    expect(claimReady({ heroKey: 'rogue', player: 'Dad', picks: [null, null, null, null] }, cards)).toBe(true)
  })

  it('needs a name before getting ready', () => {
    const picks = [cards[0], cards[1], cards[2], cards[3], cards[4]]
    expect(claimReady({ heroKey: 'paladin', player: '', picks }, cards)).toBe(false)
    expect(claimReady({ heroKey: 'paladin', player: '   ', picks }, cards)).toBe(false)
    expect(claimReady({ heroKey: 'paladin', player: 'Sam', picks }, cards)).toBe(true)
  })

  it('gives Heskan two daily slots, one for Hurled Breath', () => {
    const wizard = HERO_TEMPLATES.find((t) => t.key === 'wizard')
    const wizardCards = [
      { id: 'breath', hero: 'wizard', type: 'daily', always: true },
      { id: 'ram', hero: 'wizard', type: 'daily', suggested: true },
      { id: 'invis', hero: 'wizard', type: 'utility', suggested: true },
    ]
    expect(startingPicks(wizard, wizardCards).map((c) => c?.id ?? null)).toEqual([null, null, 'invis', 'breath', 'ram'])
  })
})
