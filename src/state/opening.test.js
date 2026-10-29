import { describe, expect, it } from 'vitest'
import { openingMs, openingPlaying } from './opening.js'

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
})
