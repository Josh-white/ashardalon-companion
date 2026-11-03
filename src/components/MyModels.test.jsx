// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MyModels } from './MyModels.jsx'
import { myModels } from '../data/myModels.js'
import { snapshot } from '../forge/snapshot.js'
import { STARTERS } from '../forge/recipes.js'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const loved = (id, from, idea, extra = {}) => ({
  id,
  from,
  idea,
  sentAt: '2026-11-02T10:00:00Z',
  rounds: [{ note: 'Hi', pictures: ['front.png'], model: 'model-1.glb' }],
  answers: [{ round: 1, love: true }],
  ...extra,
})
const REQUESTS = [
  loved('w-lizard', 'Colton', 'Lizard mage', { useInGame: true }),
  loved('w-gone', 'Colton', 'Taken off', { hidden: true }),
  { id: 'w-waiting', from: 'Easton', idea: 'Not built yet', rounds: [], answers: [] },
]
const FIGURES = [
  { id: 'b-grim', savedAt: '2026-11-03T03:00:00Z', recipe: { name: 'Grim', from: 'colton', parts: { head: { id: 'skull' }, hand: { id: 'scythe' } } } },
  { id: 'b-knight', savedAt: '2026-11-03T02:00:00Z', recipe: { name: 'Sir Easton', from: 'Easton', parts: {} } },
  { id: 'b-nobody', savedAt: '2026-11-03T02:00:00Z', recipe: { name: 'No name', parts: {} } },
]

describe('My models', () => {
  it('puts each player\'s workshop and builder figures together', () => {
    const players = myModels(REQUESTS, FIGURES)
    expect(players.map((p) => p.name)).toEqual(['Colton', 'Easton'])
    expect(players[0].models.map((m) => [m.source, m.id, m.on])).toEqual([
      ['builder', 'b-grim', false],
      ['workshop', 'w-lizard', true],
    ])
    expect(players[0].models[1].picture).toBe('/workshop/w-lizard/front.png')
    expect(players[0].models[0].emojis.length).toBe(2)
  })

  it('picks a figure for the game, or the normal hero', async () => {
    const calls = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path, init = {}) => {
        if (init.method === 'POST') {
          calls.push([path, JSON.parse(init.body)])
          return { ok: true, json: async () => ({}) }
        }
        return { ok: true, json: async () => (path === '/workshop.json' ? { requests: REQUESTS } : { figures: FIGURES }) }
      }),
    )
    render(<MyModels />)
    const grim = await screen.findByRole('button', { name: 'Colton: Grim' })
    expect(screen.getByRole('button', { name: 'Colton: Lizard mage' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Easton: normal hero' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(grim)
    await waitFor(() => expect(calls).toEqual([['/forge/b-grim', { useInGame: true }]]))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Colton: normal hero' }).disabled).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: 'Colton: normal hero' }))
    await waitFor(() => expect(calls[1]).toEqual(['/workshop/w-lizard', { useInGame: false }]))
  })

  it('shows the parts while a figure can\'t be drawn (no 3D here), and keeps the builder\'s recipe', () => {
    expect(snapshot(STARTERS[0])).toBeNull()
    expect(myModels([], FIGURES)[0].models[0].recipe.name).toBe('Grim')
  })
})
