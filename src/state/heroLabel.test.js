import { describe, expect, it } from 'vitest'
import { heroLabel, playerName } from './gameHelpers.js'

describe('heroLabel', () => {
  it("uses the player's name when there is one", () => {
    expect(heroLabel({ name: 'Keyleth', player: 'Colton' })).toBe('Colton')
  })

  it("uses the hero's name in a solo game, where every hero goes by Solo", () => {
    expect(heroLabel({ name: 'Keyleth', player: 'Solo' })).toBe('Keyleth')
    expect(heroLabel({ name: 'Quinn', player: ' solo ' })).toBe('Quinn')
    expect(playerName({ name: 'Quinn', player: 'Solo' })).toBe('')
  })

  it("uses the hero's name when nobody typed a name", () => {
    expect(heroLabel({ name: 'Tarak', player: '' })).toBe('Tarak')
    expect(heroLabel({ name: 'Tarak' })).toBe('Tarak')
  })
})
