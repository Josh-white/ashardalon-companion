import { describe, expect, it } from 'vitest'
import { MOMENT_DUCK, VOICE_DUCK, quietLevel } from './mixer.js'

describe('the background dips', () => {
  it('stays at full level with nothing to make room for', () => {
    expect(quietLevel(new Map(), 0)).toBe(1)
  })

  it('takes the quietest reason, while it lasts', () => {
    const holds = new Map([
      ['voice', { level: VOICE_DUCK, until: null }],
      ['moment', { level: MOMENT_DUCK, until: 2 }],
    ])
    expect(quietLevel(holds, 1)).toBe(MOMENT_DUCK)
    expect(quietLevel(holds, 3)).toBe(VOICE_DUCK)
  })

  it('brings 30% music down to about 10% under the narrator', () => {
    expect(0.3 * VOICE_DUCK).toBeCloseTo(0.1)
  })
})
