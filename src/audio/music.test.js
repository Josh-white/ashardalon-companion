import { describe, expect, it } from 'vitest'
import { MOODS, musicMood } from './music.js'

const game = (extra = {}) => ({ status: 'playing', monsters: [], villains: [], ...extra })

describe('background music', () => {
  it('explores quietly, fights when monsters are out and goes dark for a villain', () => {
    expect(musicMood(game())).toBe('explore')
    expect(musicMood(game({ monsters: [{ id: 'm' }] }))).toBe('battle')
    expect(musicMood(game({ monsters: [{ id: 'm' }], villains: [{ id: 'v' }] }))).toBe('boss')
    expect(musicMood(game({ villains: [{ id: 'v', defeated: true }] }))).toBe('explore')
  })

  it('is silent outside a game', () => {
    expect(musicMood(game({ status: 'setup' }))).toBe(null)
    expect(musicMood(game({ status: 'won' }))).toBe(null)
    expect(musicMood(null)).toBe(null)
  })

  it('has a chord and a scale for every mood', () => {
    for (const mood of Object.values(MOODS)) {
      expect(mood.chords.length).toBeGreaterThan(0)
      expect(mood.scale.length).toBeGreaterThan(0)
    }
  })
})
