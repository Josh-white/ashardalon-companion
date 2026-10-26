import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { normalizeCardFile } from './cards.js'

describe('card files', () => {
  it('accepts the example file with no problems', () => {
    const example = JSON.parse(readFileSync(new URL('../../cards/cards.example.json', import.meta.url), 'utf8'))
    const { powers, problems } = normalizeCardFile(example)
    expect(problems).toEqual([])
    expect(powers).toHaveLength(20)
  })

  it('skips broken cards and says why', () => {
    const { powers, problems } = normalizeCardFile({
      powers: [
        { id: 'a', hero: 'paladin', type: 'daily', name: 'Good' },
        { id: 'a', hero: 'paladin', type: 'daily', name: 'Same id' },
        { id: 'b', hero: 'bard', type: 'daily', name: 'Wrong hero' },
        { id: 'c', hero: 'rogue', type: 'encounter', name: 'Wrong type' },
        { hero: 'rogue', type: 'daily', name: 'No id' },
      ],
    })
    expect(powers.map((p) => p.name)).toEqual(['Good'])
    expect(problems).toHaveLength(4)
  })

  it('needs a powers list', () => {
    expect(normalizeCardFile({}).problems).toHaveLength(1)
  })
})
