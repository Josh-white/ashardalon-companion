import { describe, expect, it } from 'vitest'
import { LOOKS } from './attackFxDraw.js'
import { LOOK_COLORS, lookColor, seg, shotWords } from './board3dFx.js'

describe('attacks on the 3D board', () => {
  it('has a colour for every look the flat board draws', () => {
    for (const look of Object.keys(LOOKS)) expect(LOOK_COLORS[look], look).toBeTruthy()
    expect(lookColor({ look: 'ray', color: '#a3e635' })).toBe('#a3e635')
    expect(lookColor({ look: 'something new' })).toBe(LOOK_COLORS.weapon)
  })

  it('says the same words as the flat board over the target', () => {
    expect(shotWords({ result: 'hit', dealt: 2 })).toEqual({ first: '-2', firstColor: '#f87171' })
    expect(shotWords({ result: 'hit', dealt: 0 }).first).toBe('HIT!')
    expect(shotWords({ result: 'miss', dealt: 0 }).first).toBe('MISS')
    // Some attacks still hurt on a miss.
    expect(shotWords({ result: 'miss', dealt: 1 }).first).toBe('MISS -1')
    expect(shotWords({ result: 'kill', dealt: 3 })).toMatchObject({ first: '-3', then: 'DEFEATED!' })
    expect(shotWords({ result: 'down', dealt: 2 })).toMatchObject({ first: '-2', then: 'DOWN!' })
  })

  it('ramps from 0 to 1 between two moments', () => {
    expect(seg(0.1, 0.2, 0.4)).toBe(0)
    expect(seg(0.3, 0.2, 0.4)).toBeCloseTo(0.5)
    expect(seg(0.9, 0.2, 0.4)).toBe(1)
  })
})
