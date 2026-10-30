import { describe, expect, it } from 'vitest'
import { DEFAULT_VOICES, MAX_TEXT } from '../../server/narrator.js'
import { narrationScript } from '../audio/script.js'
import { HERO_TEMPLATES } from './heroes.js'
import { COACHES, coachLine } from './coaches.js'

describe('hero coaches', () => {
  it('has a coach with a voice of their own for every hero in the box', () => {
    const voices = HERO_TEMPLATES.map((t) => DEFAULT_VOICES[coachLine(t.key).voice])
    expect(voices.every(Boolean)).toBe(true)
    expect(new Set(voices).size).toBe(HERO_TEMPLATES.length)
    expect(Object.keys(COACHES).sort()).toEqual(HERO_TEMPLATES.map((t) => t.key).sort())
  })

  it('fits each speech in one narrator line and records it with the rest of the script', () => {
    const script = narrationScript({ heroes: HERO_TEMPLATES })
    for (const t of HERO_TEMPLATES) {
      const line = coachLine(t.key)
      expect(line.text.length).toBeLessThan(MAX_TEXT)
      expect(script).toContainEqual(line)
    }
    expect(coachLine('homebrew')).toBeNull()
  })
})
