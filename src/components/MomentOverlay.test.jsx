// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FX_DELAY_MS, FX_MS } from '../board/attackFx.js'
import { momentBusyMs, useMomentsDone } from './MomentOverlay.jsx'

const fx = { look: 'zap', by: 'hero', from: [0, 2], shots: [{ to: [0, 0], result: 'kill', dealt: 2 }] }

describe('useMomentsDone (the end screen waits for the last roll)', () => {
  afterEach(() => vi.useRealTimers())

  it('waits for the winning attack and its board animation before saying done', () => {
    vi.useFakeTimers()
    const winning = { id: 'arc', at: Date.now(), kind: 'roll', rolls: [{ value: 14 }, { value: 9 }], fx }
    const { result } = renderHook(() => useMomentsDone(winning))
    expect(result.current).toBe(false)
    act(() => vi.advanceTimersByTime(FX_DELAY_MS + FX_MS))
    expect(result.current).toBe(false)
    act(() => vi.advanceTimersByTime(1000))
    expect(result.current).toBe(true)
  })

  it('a moment straight after the last roll adds its own time', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(({ moment }) => useMomentsDone(moment), {
      initialProps: { moment: { id: 'a', at: Date.now(), kind: 'roll', value: 15 } },
    })
    act(() => vi.advanceTimersByTime(2000))
    rerender({ moment: { id: 'b', at: Date.now(), kind: 'defeat' } })
    act(() => vi.advanceTimersByTime(momentBusyMs({ kind: 'roll' })))
    expect(result.current).toBe(false)
    act(() => vi.advanceTimersByTime(momentBusyMs({ kind: 'defeat' })))
    expect(result.current).toBe(true)
  })

  it('a screen that opens on a finished game shows the end screen at once', () => {
    const { result } = renderHook(() => useMomentsDone({ id: 'old', at: Date.now() - 60_000, kind: 'roll', fx }))
    expect(result.current).toBe(true)
    const none = renderHook(() => useMomentsDone(null))
    expect(none.result.current).toBe(true)
  })
})

describe('useMomentsDone on the first render', () => {
  it('is not done even before effects run, so the recap never flashes', () => {
    const seen = []
    renderHook(() => seen.push(useMomentsDone({ id: 'x', at: Date.now(), kind: 'roll', value: 20 })))
    expect(seen[0]).toBe(false)
  })
})
