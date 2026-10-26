import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import { HERO_TEMPLATES } from '../src/data/heroes.js'
import { createHero, initialState } from '../src/state/game.js'
import { loadSavedGame, startServer } from './server.js'

// Opens a socket and collects every state the server sends.
function connect(port) {
  const socket = new WebSocket(`ws://localhost:${port}/ws`)
  const states = []
  const waiters = []
  socket.on('message', (raw) => {
    const message = JSON.parse(raw)
    states.push(message.state)
    waiters.splice(0).forEach((resolve) => resolve())
  })
  const nextState = (count) =>
    new Promise((resolve) => {
      const check = () => (states.length >= count ? resolve(states[count - 1]) : waiters.push(check))
      check()
    })
  const send = (action) => socket.send(JSON.stringify({ type: 'action', action }))
  return { socket, nextState, send }
}

describe('sync server', () => {
  let dir
  let server

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'ashardalon-'))
    server = await startServer({ port: 0, saveFile: join(dir, 'game.json'), staticDir: dir })
  })

  afterEach(async () => {
    await server.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('sends one iPad the change another iPad made, and saves it', async () => {
    const dad = connect(server.port)
    const son = connect(server.port)
    expect((await dad.nextState(1)).status).toBe('setup')
    await son.nextState(1)

    dad.send({ type: 'START_GAME', heroes: [createHero(HERO_TEMPLATES[0])] })
    const seen = await son.nextState(2)
    expect(seen.status).toBe('playing')
    expect(seen.heroes[0].name).toBe(HERO_TEMPLATES[0].name)

    son.send({ type: 'ADJUST_HP', heroId: seen.heroes[0].id, amount: -3 })
    expect((await dad.nextState(3)).heroes[0].hp).toBe(HERO_TEMPLATES[0].maxHp - 3)

    const saved = JSON.parse(readFileSync(join(dir, 'game.json'), 'utf8'))
    expect(saved.heroes[0].hp).toBe(HERO_TEMPLATES[0].maxHp - 3)
    dad.socket.close()
    son.socket.close()
  })

  it('ignores messages that are not actions', async () => {
    const client = connect(server.port)
    await client.nextState(1)
    client.socket.send('not json')
    client.socket.send(JSON.stringify({ type: 'hello' }))
    client.send({ type: 'ADJUST_XP', amount: 2 })
    expect((await client.nextState(2)).xp).toBe(2)
    client.socket.close()
  })
})

describe('loading a saved game', () => {
  it('starts fresh when the save is missing or broken', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ashardalon-'))
    expect(loadSavedGame(join(dir, 'missing.json'))).toBe(initialState)
    writeFileSync(join(dir, 'broken.json'), '{not json')
    expect(loadSavedGame(join(dir, 'broken.json'))).toBe(initialState)
    rmSync(dir, { recursive: true, force: true })
  })
})
