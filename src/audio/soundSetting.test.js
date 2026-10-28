import { describe, expect, it } from 'vitest'
import { soundOnByDefault } from './soundSetting.js'

describe('which screens play sound', () => {
  it('plays on the projector, on the table only without a projector, and never on hero iPads unless asked', () => {
    expect(soundOnByDefault('projector', true)).toBe(true)
    expect(soundOnByDefault('table', true)).toBe(false)
    expect(soundOnByDefault('table', false)).toBe(true)
    expect(soundOnByDefault('wizard', false)).toBe(false)
  })
})
