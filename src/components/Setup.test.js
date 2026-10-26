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
    expect(claimReady({ heroKey: 'paladin', picks }, cards)).toBe(false)
    const full = [picks[0], cards[1], picks[2], picks[3], cards[4]]
    expect(claimReady({ heroKey: 'paladin', picks: full }, cards)).toBe(true)
    expect(claimReady({ heroKey: 'rogue', picks: [null, null, null, null] }, cards)).toBe(true)
  })
})
