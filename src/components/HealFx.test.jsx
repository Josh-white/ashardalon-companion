// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HEAL_MS, useHealFx } from './HealFx.jsx'
import { momentCoverMs } from './MomentOverlay.jsx'

describe('useHealFx', () => {
  afterEach(() => vi.useRealTimers())

  it('shows a heal straight away, then lets it go', () => {
    vi.useFakeTimers()
    const healFx = { id: 'h1', at: Date.now(), heals: [{ heroId: 'a', amount: 2 }] }
    const { result } = renderHook(() => useHealFx(healFx, null))
    expect(result.current).toEqual([{ heroId: 'a', amount: 2, key: 'h1-a', delay: 0 }])
    act(() => vi.advanceTimersByTime(HEAL_MS + 300))
    expect(result.current).toEqual([])
  })

  it('waits for the moment it came with, and never replays an old heal (Undo)', () => {
    vi.useFakeTimers()
    const moment = { id: 'm', at: Date.now(), kind: 'roll' }
    const first = { id: 'h1', at: Date.now(), heals: [{ heroId: 'a', amount: 3 }], momentId: 'm' }
    const { result, rerender } = renderHook(({ healFx }) => useHealFx(healFx, moment), { initialProps: { healFx: first } })
    expect(result.current[0].delay).toBe(momentCoverMs(moment))
    rerender({ healFx: { id: 'h2', at: Date.now(), heals: [{ heroId: 'b', amount: 1 }] } })
    rerender({ healFx: first })
    expect(result.current.map((h) => h.key)).toEqual(['h1-a', 'h2-b'])
  })

  it('skips a heal from long ago (a screen reconnecting)', () => {
    const { result } = renderHook(() => useHealFx({ id: 'old', at: Date.now() - 60000, heals: [{ heroId: 'a', amount: 2 }] }, null))
    expect(result.current).toEqual([])
  })
})
