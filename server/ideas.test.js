import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanIdea, MAX_IDEA_LENGTH } from './ideas.js'
import { startServer } from './server.js'

describe('ideas box', () => {
  let dir
  let server
  let url
  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'ashardalon-ideas-'))
    server = await startServer({ port: 0, saveFile: join(dir, 'game.json'), staticDir: dir, warmNarrator: false })
    url = `http://localhost:${server.port}`
  })
  afterEach(async () => {
    await server.close()
    rmSync(dir, { recursive: true, force: true })
  })
  const post = (path, body) => fetch(url + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const list = async () => (await (await fetch(`${url}/ideas.json`)).json()).ideas

  it('saves ideas next to the game, newest first, and marks them done', async () => {
    expect(await list()).toEqual([])
    expect((await post('/ideas', { text: '  A dragon pet!  ', from: 'Colton' })).status).toBe(201)
    await post('/ideas', { text: 'More snakes', from: '' })
    const [snakes, dragon] = await list()
    expect(dragon).toMatchObject({ text: 'A dragon pet!', from: 'Colton', done: false })
    expect(snakes.from).toBe(null)
    expect((await post(`/ideas/${dragon.id}`, { done: true })).status).toBe(200)
    expect((await list()).find((i) => i.id === dragon.id).done).toBe(true)
    const saved = JSON.parse(readFileSync(join(dir, 'ideas.json'), 'utf8'))
    expect(saved.ideas.map((i) => i.text)).toEqual(['A dragon pet!', 'More snakes'])
    expect((await fetch(`${url}/ideas/${snakes.id}`, { method: 'DELETE' })).status).toBe(200)
    expect((await list()).map((i) => i.text)).toEqual(['A dragon pet!'])
  })

  it('turns away an empty idea, a broken one, and an unknown id', async () => {
    expect((await post('/ideas', { text: '   ' })).status).toBe(400)
    expect((await fetch(`${url}/ideas`, { method: 'POST', body: '{nope' })).status).toBe(400)
    expect((await post('/ideas/nope', { done: true })).status).toBe(404)
    expect(await list()).toEqual([])
  })

  it('keeps ideas through a restart', async () => {
    await post('/ideas', { text: 'Keep me' })
    await server.close()
    server = await startServer({ port: 0, saveFile: join(dir, 'game.json'), staticDir: dir, warmNarrator: false })
    url = `http://localhost:${server.port}`
    expect((await list()).map((i) => i.text)).toEqual(['Keep me'])
  })

  it('trims long ideas and names', () => {
    expect(cleanIdea({ text: 'x'.repeat(5000), from: 'y'.repeat(100) })).toEqual({ text: 'x'.repeat(MAX_IDEA_LENGTH), from: 'y'.repeat(40) })
    expect(cleanIdea({ text: 42 })).toBe(null)
  })
})
