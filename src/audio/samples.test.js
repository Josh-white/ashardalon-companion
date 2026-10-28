import { describe, expect, it } from 'vitest'
import { isLoop, measure } from './samples.js'

describe('recordings', () => {
  it('skips the silence at the start and evens out the volume', () => {
    const rate = 1000
    const data = new Float32Array(2000)
    for (let i = 500; i < 2000; i++) data[i] = i % 2 ? 0.5 : -0.5
    const { gain, offset } = measure(data, rate)
    expect(offset).toBe(0.5)
    // RMS 0.5 brought to -17 dBFS.
    expect(gain).toBeCloseTo(Math.pow(10, -17 / 20) / 0.5, 3)
  })

  it('leaves a silent file alone', () => {
    expect(measure(new Float32Array(100), 1000)).toEqual({ gain: 1, offset: 0 })
  })
})

describe('background music tracks', () => {
  it('are left to the streaming player', () => {
    expect(isLoop('loop-boss')).toBe(true)
    expect(isLoop('coins')).toBe(false)
  })
})
