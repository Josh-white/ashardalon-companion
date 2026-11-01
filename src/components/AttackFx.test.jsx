// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FX_DELAY_MS, FX_MS } from '../board/attackFx.js'
import { useAttackFx } from './AttackFx.jsx'

const fx = { look: 'arrow', by: 'hero', from: [0, 2], shots: [{ to: [0, 0], result: 'miss', dealt: 0 }] }

describe('useAttackFx', () => {
  afterEach(() => vi.useRealTimers())

  it('plays the attack even when another moment follows straight after, then stops', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(({ moment }) => useAttackFx(moment), { initialProps: { moment: { id: 'a', at: Date.now(), fx } } })
    // The treasure for a defeated monster arrives while the die is still showing.
    rerender({ moment: { id: 'b', at: Date.now(), kind: 'treasure' } })
    act(() => vi.advanceTimersByTime(FX_DELAY_MS + 10))
    expect(result.current?.id).toBe('a')
    act(() => vi.advanceTimersByTime(FX_MS + 1000))
    expect(result.current).toBeNull()
  })
})
