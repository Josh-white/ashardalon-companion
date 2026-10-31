import { describe, expect, it } from 'vitest'
import { DEFAULT_VOICES, MAX_TEXT } from '../../server/narrator.js'
import { narrationScript } from '../audio/script.js'
import { HERO_TEMPLATES } from './heroes.js'
import { COACHES, coachLine, coachPowerHint } from './coaches.js'

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

  it('gives the cheat card a tip for every hero and finds powers in the coach tips', () => {
    for (const t of HERO_TEMPLATES) expect(COACHES[t.key].tip).toBeTruthy()
    expect(coachPowerHint('fighter', 'Reaping Strike')).toMatch(/attacks twice/)
    expect(coachPowerHint('cleric', "CLERIC'S SHIELD")).toMatch(/harder to hit/)
    expect(coachPowerHint('cleric', 'Not a real power')).toBeNull()
    expect(coachPowerHint('homebrew', 'Anything')).toBeNull()
  })
})
