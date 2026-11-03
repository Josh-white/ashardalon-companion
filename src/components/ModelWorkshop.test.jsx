// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorkshopButton, pickedLine } from './ModelWorkshop.jsx'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const state = { heroes: [{ player: 'Colton' }, { player: 'Easton' }], lobby: [] }

// A pretend Pi: GET /workshop.json gives `requests`, and every POST is recorded.
function pi(requests) {
  const posts = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path, init) => {
      if (init?.method === 'POST') {
        posts.push([path, JSON.parse(init.body)])
        return { ok: true, json: async () => ({}) }
      }
      return { ok: true, json: async () => ({ requests }) }
    }),
  )
  return posts
}

const knight = { id: '2026-11-03-colton-lava-knight-1a2b', idea: 'A lava knight', from: 'Colton', kind: 'monster', colors: ['red'], size: 'big', holds: 'Axe', attack: 'swing', sentAt: '2026-11-03T01:00:00Z', answers: [] }

describe('Model Workshop', () => {
  it('sends a new model with what the player picked', async () => {
    const posts = pi([])
    render(<WorkshopButton state={state} me="Colton" />)
    fireEvent.click(screen.getByText('🧙 My model'))
    await waitFor(() => screen.getByLabelText('Describe it'))
    const send = screen.getByText('🧙 Send to Claude')
    expect(send.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Describe it'), { target: { value: 'A lava knight' } })
    fireEvent.click(screen.getByText('👹 A monster'))
    fireEvent.click(screen.getByLabelText('red'))
    fireEvent.click(screen.getByText('Big'))
    fireEvent.click(screen.getByText('Axe'))
    fireEvent.click(screen.getByText('🔥 Breathes fire'))
    fireEvent.click(send)
    await waitFor(() => screen.getByText('Your model was sent!'))
    screen.getByText(/takes time/)
    expect(posts).toEqual([['/workshop', { idea: 'A lava knight', kind: 'monster', colors: ['red'], size: 'big', holds: 'Axe', attack: 'breath', from: 'Colton' }]])
  })

  it("keeps the Sent note up after the very first model, though the list isn't empty any more", async () => {
    const requests = []
    pi(requests)
    render(<WorkshopButton state={state} me="Colton" />)
    fireEvent.click(screen.getByText('🧙 My model'))
    fireEvent.change(await screen.findByLabelText('Describe it'), { target: { value: 'A lava knight' } })
    requests.push({ ...knight, rounds: [] })
    fireEvent.click(screen.getByText('🧙 Send to Claude'))
    await waitFor(() => screen.getByText('Your model was sent!'))
    await waitFor(() => screen.getByText('📦 Models (1)'))
    screen.getByText('Your model was sent!')
  })

  it('shows new pictures on the button, then Love it answers them', async () => {
    const posts = pi([{ ...knight, rounds: [{ note: 'Here he is!', pictures: ['front.png'] }] }])
    render(<WorkshopButton state={state} />)
    await waitFor(() => screen.getByText('🧙 📸 Pictures!'))
    fireEvent.click(screen.getByText('🧙 📸 Pictures!'))
    await waitFor(() => screen.getByText('🧙 Here he is!'))
    expect(screen.getByAltText('Colton model, front').getAttribute('src')).toBe(`/workshop/${knight.id}/front.png?r=1`)
    fireEvent.click(screen.getByText('❤️ Love it!'))
    await waitFor(() => expect(posts).toEqual([[`/workshop/${knight.id}`, { love: true }]]))
  })

  it('asks for changes in words', async () => {
    const posts = pi([{ ...knight, rounds: [{ note: '', pictures: ['front.png'] }] }])
    render(<WorkshopButton state={state} />)
    await waitFor(() => screen.getByText('🧙 📸 Pictures!'))
    fireEvent.click(screen.getByText('🧙 📸 Pictures!'))
    fireEvent.click(await screen.findByText('✏️ Change it'))
    fireEvent.change(screen.getByLabelText('What should change?'), { target: { value: 'Bigger horns' } })
    fireEvent.click(screen.getByText('Send changes'))
    await waitFor(() => expect(posts).toEqual([[`/workshop/${knight.id}`, { change: 'Bigger horns' }]]))
  })

  it('puts a loved model in the game, and says how to play with it', async () => {
    const loved = { ...knight, rounds: [{ note: '', pictures: ['front.png'], model: 'model-1.glb' }], answers: [{ round: 1, love: true }] }
    const posts = pi([loved])
    render(<WorkshopButton state={state} me="Colton" />)
    fireEvent.click(await screen.findByText(/🧙/))
    fireEvent.click(await screen.findByText('📦 Models (1)'))
    await screen.findByText('🎮 Use it in the game')
    screen.getByText(/type your name as/)
    fireEvent.click(screen.getByText("🎮 Use it as Colton's hero"))
    await waitFor(() => expect(posts).toEqual([[`/workshop/${knight.id}`, { useInGame: true }]]))
  })

  it('offers to stop using a figure that is in the game', async () => {
    pi([{ ...knight, useInGame: true, rounds: [{ note: '', pictures: ['front.png'], model: 'model-1.glb' }], answers: [{ round: 1, love: true }] }])
    render(<WorkshopButton state={state} me="Colton" />)
    fireEvent.click(await screen.findByText(/🧙/))
    fireEvent.click(await screen.findByText('📦 Models (1)'))
    await screen.findByText('Stop using it')
    screen.getByText('🎉 In the game')
  })

  it('sums up the picks in one line', () => {
    expect(pickedLine(knight)).toBe('A monster · red · Big · holds Axe · Swings it')
  })
})
