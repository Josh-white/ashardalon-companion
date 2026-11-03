// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import HeroBuilder from './HeroBuilder.jsx'

// The 3D turntable needs WebGL, which the test browser hasn't got.
vi.mock('./ForgeStage.jsx', () => ({ default: () => <div data-testid="stage" /> }))

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

// A pretend Pi with saved `figures`; every POST and DELETE is recorded.
function pi(figures = []) {
  const calls = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path, init = {}) => {
      if (init.method && init.method !== 'GET') {
        calls.push([init.method, path, init.body ? JSON.parse(init.body) : null])
        return { ok: true, json: async () => ({ id: 'new-1', recipe: init.body ? JSON.parse(init.body) : null }) }
      }
      return { ok: true, json: async () => ({ figures }) }
    }),
  )
  return calls
}

describe('Hero Builder', () => {
  it('swaps parts, stretches them and saves the recipe', async () => {
    const calls = pi()
    render(<HeroBuilder />)
    await screen.findByTestId('stage')
    fireEvent.click(screen.getByRole('button', { name: /Robe/ }))
    fireEvent.change(screen.getByLabelText('Flare'), { target: { value: '1.5' } })
    fireEvent.click(screen.getByRole('tab', { name: /Weapon/ }))
    fireEvent.click(screen.getByRole('button', { name: /Scythe/ }))
    fireEvent.change(screen.getByLabelText('Hero name'), { target: { value: 'Grim' } })
    fireEvent.click(screen.getByText('💾 Save'))
    await waitFor(() => expect(calls).toHaveLength(1))
    const [method, path, recipe] = calls[0]
    expect([method, path]).toEqual(['POST', '/forge'])
    expect(recipe.name).toBe('Grim')
    expect(recipe.parts.body).toEqual({ id: 'robe', shape: { flare: 1.5 } })
    expect(recipe.parts.hand.id).toBe('scythe')
    // Saved once, it saves over itself after that.
    await screen.findByText('✅ Saved')
    fireEvent.click(screen.getByRole('tab', { name: /Tail/ }))
    fireEvent.click(screen.getByRole('button', { name: /Dragon tail/ }))
    fireEvent.click(screen.getByText('💾 Save changes'))
    await waitFor(() => expect(calls).toHaveLength(2))
    expect(calls[1][1]).toBe('/forge/new-1')
  })

  it('puts every slider back with Normal, and moves a hat into place', async () => {
    const calls = pi()
    render(<HeroBuilder />)
    await screen.findByTestId('stage')
    fireEvent.click(screen.getByRole('button', { name: /Robe/ }))
    fireEvent.change(screen.getByLabelText('Flare'), { target: { value: '1.5' } })
    fireEvent.change(screen.getByLabelText('Tall'), { target: { value: '1.3' } })
    fireEvent.click(screen.getByText('↺ Normal'))
    fireEvent.click(screen.getByRole('tab', { name: /Hat/ }))
    fireEvent.change(screen.getByLabelText('Move it: Up / down'), { target: { value: '-0.4' } })
    fireEvent.change(screen.getByLabelText('Move it: Tilt'), { target: { value: '0.2' } })
    fireEvent.click(screen.getByText('💾 Save'))
    await waitFor(() => expect(calls).toHaveLength(1))
    const recipe = calls[0][2]
    expect(recipe.parts.body).toEqual({ id: 'robe', shape: {} })
    expect(recipe.parts.hat.nudge).toEqual({ up: -0.4, tilt: 0.2 })
    fireEvent.click(screen.getByText('↺ Back in place'))
    expect(screen.getByLabelText('Move it: Up / down').value).toBe('0')
  })

  it('takes a part off an optional slot, and remembers the figure on this screen', async () => {
    pi()
    const { unmount } = render(<HeroBuilder />)
    fireEvent.click(screen.getByRole('tab', { name: /Hat/ }))
    fireEvent.click(screen.getByRole('button', { name: /None/ }))
    unmount()
    render(<HeroBuilder />)
    fireEvent.click(screen.getByRole('tab', { name: /Hat/ }))
    expect(screen.getByRole('button', { name: /None/ }).getAttribute('aria-pressed')).toBe('true')
  })

  it('opens and throws away saved heroes', async () => {
    const saved = { id: 'abc', savedAt: '2026-11-03T03:00:00Z', recipe: { name: 'Lava Knight', from: 'Easton', size: 1, colors: {}, parts: { body: { id: 'brute', shape: {} }, head: { id: 'orc', shape: {} } } } }
    const calls = pi([saved])
    render(<HeroBuilder />)
    fireEvent.click(await screen.findByText('📂 My heroes (1)'))
    fireEvent.click(screen.getByText('Open'))
    expect(screen.getByLabelText('Hero name').value).toBe('Lava Knight')
    expect(screen.getByRole('button', { name: /Brute/ }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByText(/My heroes/))
    fireEvent.click(screen.getByLabelText('Throw away Lava Knight'))
    fireEvent.click(screen.getByText('Throw it away'))
    await waitFor(() => expect(calls).toEqual([['DELETE', '/forge/abc', null]]))
  })
})
