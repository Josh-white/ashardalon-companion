import { describe, expect, it } from 'vitest'
import { MOODS, musicMood, musicTracks } from './music.js'
import { LOUDEST, QUIETEST, UNMEASURED, trackLevel } from './ambience.js'

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
  })

  it('celebrates a win with the Pi\'s victory track only', () => {
    expect(musicMood(game({ status: 'won' }))).toBe('victory')
    expect(MOODS.victory).toBe(undefined)
  })

  it('picks a track for the dungeon area, then the plain one for the mood', () => {
    expect(musicTracks(game(), 'explore')).toEqual(['loop-explore'])
    const deep = game({ tileStack: { drawn: 9 } })
    expect(musicTracks(deep, 'explore')).toEqual(['loop-explore-tunnels', 'loop-explore'])
    expect(musicTracks(game({ tileStack: { drawn: 3 } }), 'explore')).toEqual(['loop-explore-halls', 'loop-explore'])
    expect(musicTracks(game({ tileStack: { drawn: 15 } }), 'explore')).toEqual(['loop-explore-depths', 'loop-explore'])
    expect(musicTracks(game({ tileStack: { drawn: 3 }, adventure: { revealed: ['The Vault'] } }), 'explore')).toEqual(['loop-explore-chamber', 'loop-explore'])
    expect(musicTracks(deep, 'battle')).toEqual(['loop-battle'])
    expect(musicTracks(game({ villains: [{ id: 'v', name: 'Ashardalon' }] }), 'boss')).toEqual(['loop-boss-ashardalon', 'loop-boss'])
    expect(musicTracks(game({ villains: [{ id: 'v', name: 'Otyugh' }] }), 'boss')).toEqual(['loop-boss'])
    expect(musicTracks(game(), null)).toEqual([])
  })

  it('keeps every track inside the same loudness band', () => {
    const loudness = (lufs) => lufs + 20 * Math.log10(trackLevel(lufs))
    expect(loudness(-15)).toBeCloseTo(LOUDEST)
    expect(loudness(-35)).toBeCloseTo(QUIETEST)
    expect(trackLevel(-23)).toBe(1)
    expect(trackLevel(undefined)).toBe(UNMEASURED)
  })

  it('plays a lament after a loss', () => {
    expect(musicMood(game({ status: 'lost', monsters: [{ id: 'm' }] }))).toBe('lament')
    expect(musicMood(null)).toBe(null)
  })

  it('has a chord and a scale for every mood', () => {
    for (const mood of Object.values(MOODS)) {
      expect(mood.chords.length).toBeGreaterThan(0)
      expect(mood.scale.length).toBeGreaterThan(0)
    }
  })
})
