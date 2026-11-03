// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdventurePicker } from './Adventure.jsx'
import { normalizeCardFile } from '../data/cards.js'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const mountain = { id: 'adv-2', number: 2, title: 'Into the Mountain', goal: 'Find the gate.', players: '1-5' }
const lair = { id: 'adv-3', number: 3, title: 'The Lair', goal: 'Beat the boss.', players: '1-5' }
const cards = normalizeCardFile({ powers: [], adventures: [mountain, lair] })

function stubPi() {
  let marked = false
  const fetch = vi.fn(async (url, options) => {
    if (url === '/cards.json') return { ok: true, json: async () => cards }
    if (url === '/records/adventure') {
      marked = JSON.parse(options.body).beaten
      return { ok: true }
    }
    const adventures = { 'the lair': { games: 2, wins: 1, winners: ['Colton'] } }
    if (marked) adventures['into the mountain'] = { games: 0, wins: 0, winners: [], marked: true }
    return { ok: true, json: async () => ({ players: [], solo: [], played: {}, adventures, canMark: true }) }
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}

describe('beaten adventures in the picker', () => {
  it('shows who beat an adventure, and lets the family mark an old win by hand', async () => {
    const fetch = stubPi()
    render(<AdventurePicker state={{ lobbyAdventure: cards.adventures.find((a) => a.id === mountain.id) }} dispatch={() => {}} />)
    await waitFor(() => screen.getByText('Won by Colton'))
    fireEvent.click(await screen.findByText('✅ We beat this before'))
    await waitFor(() => screen.getByText('Beaten before'))
    expect(JSON.parse(fetch.mock.calls.find(([url]) => url === '/records/adventure')[1].body)).toEqual({ adventure: 'Into the Mountain', beaten: true })
    screen.getByText('✅ Marked as beaten before.')
  })
})
