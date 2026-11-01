// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CrashScreen, { reloadedRecently, RELOAD_AFTER_MS } from './CrashScreen.jsx'

function Boom() {
  throw new Error('kaboom')
}

describe('CrashScreen', () => {
  let reload
  beforeEach(() => {
    sessionStorage.clear()
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('shows the screen as usual when nothing breaks', () => {
    render(
      <CrashScreen>
        <p>the game</p>
      </CrashScreen>,
    )
    expect(screen.getByText('the game')).toBeTruthy()
  })

  it('shows a reload screen instead of a blank one, then reloads by itself', () => {
    render(
      <CrashScreen>
        <Boom />
      </CrashScreen>,
    )
    expect(screen.getByRole('alert').textContent).toContain(
      'Something went wrong',
    )
    expect(screen.getByText('kaboom')).toBeTruthy()
    vi.advanceTimersByTime(RELOAD_AFTER_MS)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(reloadedRecently()).toBe(true)
  })

  it('waits for a tap when it already reloaded a moment ago', () => {
    sessionStorage.setItem(
      'ashardalon-companion/crash-reload',
      String(Date.now()),
    )
    render(
      <CrashScreen>
        <Boom />
      </CrashScreen>,
    )
    expect(screen.getByRole('alert').textContent).toContain('Tap Reload')
    vi.advanceTimersByTime(RELOAD_AFTER_MS * 3)
    expect(reload).not.toHaveBeenCalled()
    screen.getByText('Reload').click()
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
