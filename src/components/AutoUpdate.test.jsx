// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AutoUpdateWarning, autoUpdateProblem } from './AutoUpdate.jsx'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const now = Date.parse('2026-11-02T19:00:00Z')

describe('auto-update warning', () => {
  it('is quiet when updates work or this Pi has none', () => {
    expect(autoUpdateProblem(null, now)).toBe(null)
    expect(autoUpdateProblem({ none: true }, now)).toBe(null)
    expect(autoUpdateProblem({ ok: true, line: 'Updated to abc1234.', checkedAt: '2026-11-02T18:55:00Z' }, now)).toBe(null)
  })

  it('warns when the last update failed', () => {
    const problem = autoUpdateProblem({ ok: false, line: 'The new version failed.', detail: 'FAIL timed out', checkedAt: '2026-11-02T18:55:00Z' }, now)
    expect(problem.line).toBe('The new version failed.')
    expect(problem.detail).toBe('FAIL timed out')
  })

  it("warns when it hasn't run in a while", () => {
    expect(autoUpdateProblem({ ok: true, checkedAt: '2026-11-02T17:00:00Z' }, now).line).toMatch(/hasn't run since/)
    expect(autoUpdateProblem({ checkedAt: '2026-11-02T17:00:00Z' }, now).line).toMatch(/crontab -l/)
  })

  it('shows the reason and how to look', () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ none: true }) })))
    render(<AutoUpdateWarning status={{ ok: false, at: '2026-11-02T18:00:00Z', line: 'The new version failed, so the game went back to abc1234.', tried: 'def5678 Add a thing', detail: 'Error: Test timed out' }} />)
    expect(screen.getByRole('alert').textContent).toMatch(/went back to abc1234/)
    expect(screen.getByText(/Tried: def5678/)).toBeTruthy()
    expect(screen.getByText(/auto-update.log/)).toBeTruthy()
  })
})
