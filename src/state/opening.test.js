import { describe, expect, it } from 'vitest'
import { briefing, openingMs, openingNarrating, openingPlaying } from './opening.js'

describe('opening', () => {
  it('gives a longer story more time', () => {
    const short = openingMs({ adventure: null })
    const long = openingMs({ adventure: { card: { title: 'Lost' }, story: { text: 'word '.repeat(80) } } })
    expect(long).toBeGreaterThan(short + 30000)
  })

  it('plays until its time is up, or while a screen is still reading it', () => {
    const state = (opening) => ({ status: 'playing', opening })
    expect(openingPlaying(state({ until: 100, narrating: false, done: false }), 50)).toBe(true)
    expect(openingPlaying(state({ until: 100, narrating: false, done: false }), 150)).toBe(false)
    expect(openingPlaying(state({ until: 100, narrating: true, done: false }), 150)).toBe(true)
    expect(openingPlaying(state({ until: 100, narrating: true, done: true }), 50)).toBe(false)
  })

  it('briefs the goal, a campaign night\'s win and the special rules, not the standard ones', () => {
    const card = {
      goal: 'Defeat the leaders of the Monster clans.',
      campaign: { chambers: [] },
      rules: [
        { name: 'Treasure tokens', text: 'Draw a token.' },
        { name: 'Victory', text: 'Defeat the clan leader.' },
        { name: 'Defeat', text: 'Standard.' },
        { name: 'Between adventures', text: 'Shop.' },
      ],
    }
    expect(briefing(card)).toEqual({ goal: card.goal, win: 'Defeat the clan leader.', rules: [card.rules[0]] })
    expect(briefing({ ...card, campaign: undefined }).win).toBe('')
    expect(briefing(null)).toBe(null)
  })

  it('gives time to read the special rules', () => {
    const card = { title: 'Lost', goal: 'Find it.', rules: [] }
    const plain = openingMs({ adventure: { card } })
    const ruled = openingMs({ adventure: { card: { ...card, rules: [{ name: 'Doors', text: 'word '.repeat(60) }] } } })
    expect(ruled).toBeGreaterThan(plain + 15000)
  })

  it('keeps the briefing up after the narrator finishes, until its time is up', () => {
    const state = { status: 'playing', opening: { until: 100, narrating: true, done: false } }
    const quiet = openingNarrating(state, false)
    expect(openingPlaying(quiet, 50)).toBe(true)
    expect(openingPlaying(quiet, 150)).toBe(false)
    expect(openingNarrating(quiet, false)).toBe(quiet)
  })
})
