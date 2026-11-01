// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setStayAwake, useStayAwake, useStayAwakeSetting } from './stayAwake.js'

function fakeWakeLock() {
  const locks = []
  const wakeLock = {
    request: vi.fn(async () => {
      const lock = { released: false, release: vi.fn(async () => { lock.released = true }) }
      locks.push(lock)
      return lock
    }),
  }
  Object.defineProperty(navigator, 'wakeLock', { value: wakeLock, configurable: true })
  return { wakeLock, locks }
}

const flush = () => act(async () => {})

afterEach(() => {
  delete navigator.wakeLock
  setStayAwake(true)
})

describe('stay awake', () => {
  it('holds a screen wake lock while active and lets go when not', async () => {
    const { wakeLock, locks } = fakeWakeLock()
    const { rerender } = renderHook(({ on }) => useStayAwake(on), { initialProps: { on: true } })
    await flush()
    expect(wakeLock.request).toHaveBeenCalledWith('screen')
    rerender({ on: false })
    expect(locks[0].release).toHaveBeenCalled()
  })

  it('asks again when the page comes back (the browser drops the lock when hidden)', async () => {
    const { wakeLock, locks } = fakeWakeLock()
    renderHook(() => useStayAwake(true))
    await flush()
    locks[0].released = true
    await act(async () => document.dispatchEvent(new Event('visibilitychange')))
    expect(wakeLock.request).toHaveBeenCalledTimes(2)
  })

  it('does nothing when off', async () => {
    const { wakeLock } = fakeWakeLock()
    renderHook(() => useStayAwake(false))
    await flush()
    expect(wakeLock.request).not.toHaveBeenCalled()
  })

  it('remembers the switch on this screen', () => {
    const { result } = renderHook(() => useStayAwakeSetting())
    expect(result.current[0]).toBe(true)
    act(() => result.current[1](false))
    expect(result.current[0]).toBe(false)
    expect(localStorage.getItem('ashardalon-stay-awake')).toBe('off')
  })
})
