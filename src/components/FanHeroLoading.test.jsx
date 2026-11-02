// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HERO_TEMPLATES, setHeroTemplates } from '../data/heroes.js'
import { initialState } from '../state/game.js'
import { RETRY_MS, useCards } from '../state/useCards.js'
import { MyHero } from './Setup.jsx'

vi.mock('../state/useArt.js', async (importOriginal) => ({ ...(await importOriginal()), useArt: () => ({}) }))
afterEach(() => {
  cleanup()
  setHeroTemplates(HERO_TEMPLATES)
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const BARD = { ...HERO_TEMPLATES[0], key: 'bard', name: 'Berryloaf', className: 'Halfling Bard', color: 'lime' }
const CARDS = { powers: [], abilities: [] }

describe('a fan hero picked before this screen has its cards', () => {
  it('shows Loading heroes instead of crashing, then the hero once the cards arrive', () => {
    const claim = { deviceId: 'ipad', heroKey: 'bard', player: 'Colton', picks: [null, null, null], ready: false }
    const props = { state: { ...initialState, lobby: [claim] }, claim, cards: CARDS, deviceId: 'ipad', dispatch: vi.fn() }
    const { rerender } = render(<MyHero {...props} />)
    expect(screen.getByText('Loading heroes…')).toBeTruthy()
    setHeroTemplates([...HERO_TEMPLATES, BARD])
    rerender(<MyHero {...props} cards={{ ...CARDS }} />)
    expect(screen.getAllByText('Berryloaf').length).toBeGreaterThan(0)
  })
})

describe('loading cards.json', () => {
  it('tries again when the Pi is restarting, and picks up the fan heroes', async () => {
    vi.useFakeTimers()
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 502 })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ source: 'pi', powers: [], heroes: [...HERO_TEMPLATES, BARD] }) })
    vi.stubGlobal('fetch', fetch)
    const { result } = renderHook(() => useCards())
    await act(async () => {})
    expect(result.current.source).toBe('error')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RETRY_MS)
    })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(result.current.source).toBe('pi')
  })
})
