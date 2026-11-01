import { describe, expect, it } from 'vitest'
import { audioBusy, narratorBusyIs, soundPlaying } from './busy.js'

describe('waiting for the sounds', () => {
  it('is busy while a sound effect plays or the narrator talks', () => {
    const now = Date.now()
    soundPlaying(1000)
    expect(audioBusy(now + 500)).toBe(true)
    expect(audioBusy(now + 1500)).toBe(false)
    let talking = true
    narratorBusyIs(() => talking)
    expect(audioBusy(now + 1500)).toBe(true)
    talking = false
    expect(audioBusy(now + 1500)).toBe(false)
  })
})
