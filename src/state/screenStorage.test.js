import { describe, expect, it } from 'vitest'
import { screenName } from './screenStorage.js'

describe('screen storage', () => {
  it('reads the pane name from the address', () => {
    expect(screenName('?screen=iPad%201')).toBe('iPad 1')
    expect(screenName('')).toBe(null)
  })
})
