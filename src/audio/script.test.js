import { describe, expect, it } from 'vitest'
import { narrationScript } from './script.js'

const cards = {
  monsters: [{ name: 'Kobold' }, { name: 'Orc Archer', figures: 2 }],
  villains: [{ name: 'Ashardalon', fullName: 'Ashardalon, Red Dragon' }],
  encounters: [{ name: 'Hall of Spiders', flavor: 'Spiders drop from the ceiling!' }],
  treasures: [{ name: 'Potion of Healing' }],
  chambers: [{ name: 'Dragon Hoard' }],
  adventures: [{ title: 'Into the Mountain', story: { start: 'Long ago…', victory: 'You won!' }, reveals: [{ tile: 'Tunnel Exit', story: 'Light ahead.' }] }],
}

describe('the narration script', () => {
  const lines = narrationScript(cards)
  const texts = lines.map((l) => l.text.replace(/\[[^\]]*\]\s*/g, ''))

  it('covers the cards, the heroes and the adventure stories', () => {
    expect(texts).toContain('Encounter! Hall of Spiders. Spiders drop from the ceiling!')
    expect(texts).toContain('Treasure! Potion of Healing')
    expect(texts.some((t) => t.endsWith('2 Orc Archers appear!'))).toBe(true)
    expect(texts).toContain("Keyleth, it's your turn. What will you do?")
    expect(texts).toContain('The Tunnel Exit! Light ahead.')
    expect(texts).toContain('Long ago…')
    expect(texts).toContain('You won!')
    expect(texts).toContain('Beneath Firestorm Peak, the red dragon stirs. Who dares enter his halls?')
    expect(texts).toContain('Heskan the Dragonborn Wizard has arrived!')
    expect(texts).toContain('Keyleth wins the roll and goes first!')
    expect(texts).toContain('Previously… the heroes conquered the Dragon Hoard. But greater dangers still wait below.')
  })

  it('has each villain speak in its own voice', () => {
    expect(lines.filter((l) => l.voice === 'ashardalon').length).toBe(2)
  })

  it('lists each line once', () => {
    const keys = lines.map((l) => `${l.voice}|${l.text}`)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
