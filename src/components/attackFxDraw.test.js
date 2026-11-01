import { describe, expect, it } from 'vitest'
import { drawFrame, LOOKS } from './attackFxDraw.js'

// A stand-in for a canvas's 2D context: every method is a no-op that counts its calls,
// every property can be set. Enough to run each attack style through a whole animation.
function fakeContext(canvas) {
  const calls = { count: 0 }
  const g = new Proxy(
    { canvas },
    {
      get(target, key) {
        if (key in target) return target[key]
        if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop() {} })
        if (key === 'measureText') return () => ({ width: 10 })
        return () => {
          calls.count += 1
        }
      },
      set(target, key, value) {
        target[key] = value
        return true
      },
    },
  )
  return { g, calls }
}

// jsdom-free: the drawing only needs a canvas size, a screen matrix and DOMPoint.
globalThis.window ??= { devicePixelRatio: 1 }
globalThis.DOMPoint ??= class {
  constructor(x, y) {
    this.x = x
    this.y = y
  }
  matrixTransform(m) {
    return { x: m.a * this.x + m.c * this.y + m.e, y: m.b * this.x + m.d * this.y + m.f }
  }
}

function play(fx, pictures = []) {
  const canvas = { width: 0, height: 0, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) }
  const { g, calls } = fakeContext(canvas)
  const anchor = { getScreenCTM: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) }
  const scene = { g, fx, parts: [], done: new Set(), pictures, scorch: [] }
  for (let step = 0; step <= 40; step++) drawFrame(scene, canvas, anchor, step / 40)
  // Sparks and smoke keep going after the attack lands, until they fade.
  for (let n = 0; n < 200 && scene.parts.length > 0; n++) drawFrame(scene, canvas, anchor, 1)
  return { calls, scene }
}

describe('attack animation drawing', () => {
  const results = ['hit', 'miss', 'kill']
  for (const look of Object.keys(LOOKS)) {
    for (const by of ['hero', 'monster']) {
      it(`draws ${look} by a ${by} for a hit, a miss and a defeat without breaking`, () => {
        for (const result of results) {
          const fx = { look, by, from: [0, 3], shots: [{ to: [2, 0], result, dealt: result === 'miss' ? 0 : 2 }] }
          const { calls, scene } = play(fx, [null])
          expect(calls.count).toBeGreaterThan(0)
          expect(scene.parts).toHaveLength(0)
        }
      })
    }
  }

  it('chains Arc Lightning from one target to the next, and draws a style it does not know as a weapon', () => {
    const zap = { look: 'zap', by: 'hero', from: [0, 0], shots: [{ to: [1, 1], result: 'hit', dealt: 1 }, { to: [3, 1], result: 'kill', dealt: 1 }] }
    expect(play(zap, [null, null]).calls.count).toBeGreaterThan(0)
    const odd = { look: 'nothing-like-this', by: 'monster', from: [0, 0], shots: [{ to: [1, 0], result: 'hit', dealt: 1 }] }
    expect(play(odd, [null]).calls.count).toBeGreaterThan(0)
  })
})
