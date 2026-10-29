import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ENCOUNTER_IDS, missingCards } from './cardCheck.js'
import { POWER_EFFECT_NAMES } from './powerEffects.js'

const allPowers = POWER_EFFECT_NAMES.map((name) => ({ name }))
const allEncounters = Object.keys(ENCOUNTER_IDS).map((id) => ({ id }))

describe('missingCards', () => {
  it('says nothing for the example cards', () => {
    expect(missingCards({ source: 'example', powers: [], encounters: [] })).toEqual([])
  })

  it('says nothing when every card is there', () => {
    expect(missingCards({ source: 'custom', powers: allPowers, encounters: allEncounters })).toEqual([])
  })

  it('names a power whose name is spelled differently', () => {
    const powers = allPowers.map((p) => (p.name === 'Sacred Flame' ? { name: 'Holy Flame' } : p))
    expect(missingCards({ source: 'custom', powers, encounters: allEncounters })).toEqual([
      'No power card named "Sacred Flame", so its effect isn\'t done for you.',
    ])
  })

  it('accepts spelling differences the app already matches', () => {
    const powers = allPowers.map((p) => (p.name === 'Arcing Smite' ? { name: 'Arcing Strike' } : p.name === 'Ray of Frost' ? { name: 'RAY OF FROST!' } : p))
    expect(missingCards({ source: 'custom', powers, encounters: allEncounters })).toEqual([])
  })

  it('names a missing encounter id', () => {
    const encounters = allEncounters.filter((e) => e.id !== 'spotted')
    expect(missingCards({ source: 'custom', powers: allPowers, encounters })).toEqual([
      'No encounter card with id "spotted" (Spotted!: draws the bottom tile).',
    ])
  })
})

// Every encounter id the code looks for is on the list, so a new one can't be missed.
it('lists every encounter id the code looks for', () => {
  const files = ['src/components', 'src/state', 'src/board'].flatMap((dir) =>
    readdirSync(dir).filter((f) => /\.jsx?$/.test(f) && !f.includes('.test.')).map((f) => join(dir, f)),
  )
  const found = new Set()
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    for (const [, id] of text.matchAll(/(?:environment\?\.cardId|c\.cardId|card\.id) === '([a-z-]+)'/g)) found.add(id)
    for (const [, list] of text.matchAll(/BOTTOM_TILE_CARDS = new Set\(\[([^\]]*)\]/g)) {
      for (const [, id] of list.matchAll(/'([a-z-]+)'/g)) found.add(id)
    }
  }
  expect([...found].sort()).toEqual(Object.keys(ENCOUNTER_IDS).sort())
})
