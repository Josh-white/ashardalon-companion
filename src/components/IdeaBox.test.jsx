// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { IdeaButton, playerNames } from './IdeaBox.jsx'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const state = { heroes: [{ player: 'Colton' }, { player: 'easton' }, { player: '' }], lobby: [{ player: 'Easton' }, { player: 'Dad' }] }

describe('ideas box', () => {
  it("offers this game's player names once each", () => {
    expect(playerNames(state)).toEqual(['Colton', 'easton', 'Dad'])
    expect(playerNames(null)).toEqual([])
  })

  it('sends the idea with who sent it, then says thanks', async () => {
    const fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) }))
    vi.stubGlobal('fetch', fetch)
    render(<IdeaButton state={state} me="Colton" />)
    fireEvent.click(screen.getByText('💡 Send an idea'))
    const send = screen.getByText('Send it')
    expect(send.disabled).toBe(true)
    fireEvent.change(screen.getByPlaceholderText('My idea is…'), { target: { value: 'A pet dragon' } })
    fireEvent.click(screen.getByText('Dad'))
    fireEvent.click(send)
    await waitFor(() => screen.getByText('Idea saved!'))
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ text: 'A pet dragon', from: 'Dad' })
    fireEvent.click(screen.getByText('Back to the game'))
    expect(screen.queryByText('Idea saved!')).toBe(null)
  })
})
