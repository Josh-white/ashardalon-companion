import { describe, expect, it } from 'vitest'
import { AFTER_SFX_MS, PAUSE_MS, SWITCH_PAUSE_MS, pauseBetween, waitMs } from './pacing.js'

describe('narrator pacing', () => {
  const narrator = { voice: 'narrator', text: 'a' }
  const danger = { voice: 'danger', text: 'b' }

  it('pauses between lines, longer when the speaker changes', () => {
    expect(pauseBetween(null, narrator)).toBe(0)
    expect(pauseBetween(narrator, { ...narrator, text: 'c' })).toBe(PAUSE_MS)
    expect(pauseBetween(narrator, danger)).toBe(SWITCH_PAUSE_MS)
    expect(SWITCH_PAUSE_MS).toBeGreaterThan(PAUSE_MS)
  })

  it('waits for the pause and for sound effects still playing', () => {
    expect(waitMs(1000)).toBe(0)
    expect(waitMs(1000, { restUntil: 1500 })).toBe(500)
    expect(waitMs(1000, { sfxUntil: 2000 })).toBe(1000 + AFTER_SFX_MS)
    expect(waitMs(1000, { restUntil: 1500, sfxUntil: 1100 })).toBe(500)
    expect(waitMs(5000, { restUntil: 1500, sfxUntil: 2000 })).toBe(0)
  })
})
