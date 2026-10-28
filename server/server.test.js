import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import { HERO_TEMPLATES } from '../src/data/heroes.js'
import { createHero, initialState } from '../src/state/game.js'
import { byteRange, listSounds, loadCards, loadSavedGame, startServer } from './server.js'

// Opens a socket and collects every state the server sends.
function connect(port) {
  const socket = new WebSocket(`ws://localhost:${port}/ws`)
  const states = []
  const messages = []
  const waiters = []
  const screens = []
  socket.on('message', (raw) => {
    const message = JSON.parse(raw)
    // Which screens are open comes on its own, whenever that changes.
    if (message.type === 'screens') {
      screens.push(message.seats)
      return
    }
    messages.push(message)
    states.push(message.state)
    waiters.splice(0).forEach((resolve) => resolve())
  })
  const nextState = (count) =>
    new Promise((resolve) => {
      const check = () => (states.length >= count ? resolve(states[count - 1]) : waiters.push(check))
      check()
    })
  const send = (action) => socket.send(JSON.stringify({ type: 'action', action }))
  return { socket, nextState, send, messages, screens }
}

const until = async (check) => {
  for (let i = 0; i < 100 && !check(); i++) await new Promise((r) => setTimeout(r, 10))
  return check()
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

  it('confirms each tap and applies a resent one only once', async () => {
    const dad = connect(server.port)
    await dad.nextState(1)
    const tap = JSON.stringify({ type: 'action', id: 'tap-1', action: { type: 'START_GAME', heroes: [createHero(HERO_TEMPLATES[0])] } })
    dad.socket.send(tap)
    await dad.nextState(3) // the ack, then the new state
    dad.socket.send(tap)
    dad.socket.send(JSON.stringify({ type: 'action', id: 'tap-2', action: { type: 'ADJUST_XP', amount: 1 } }))
    expect((await dad.nextState(6)).xp).toBe(1) // ack, ack, new state
    expect(dad.messages.filter((m) => m.type === 'ack').map((m) => m.id)).toEqual(['tap-1', 'tap-1', 'tap-2'])
  })

  it("tells every screen which seats are open, and stamps each state with the Pi's clock", async () => {
    const before = Date.now()
    const table = connect(server.port)
    const projector = connect(server.port)
    await table.nextState(1)
    await projector.nextState(1)
    expect(table.messages[0].now).toBeGreaterThanOrEqual(before)
    projector.socket.send(JSON.stringify({ type: 'seat', seat: 'projector' }))
    table.socket.send(JSON.stringify({ type: 'seat', seat: 'table' }))
    expect(await until(() => table.screens.at(-1)?.join() === 'projector,table')).toBe(true)
    projector.socket.close()
    expect(await until(() => table.screens.at(-1)?.join() === 'table')).toBe(true)
    table.socket.close()
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

  it('undoes the last change for everyone, but never a dice roll', async () => {
    const dad = connect(server.port)
    const son = connect(server.port)
    await dad.nextState(1)
    await son.nextState(1)
    dad.send({ type: 'START_GAME', heroes: [createHero(HERO_TEMPLATES[2])] })
    const started = await son.nextState(2)
    const heroId = started.heroes[0].id

    son.send({ type: 'ADJUST_HP', heroId, amount: -2 })
    await dad.nextState(3)
    expect(dad.messages[2].undo).toBe('Keyleth −2 HP')

    son.send({ type: 'ROLL_DIE', heroId, value: 7 })
    await dad.nextState(4)
    expect(dad.messages[3].undo).toBe('Keyleth −2 HP')

    // Dad and Sam both tap Undo at once: only one change comes back.
    dad.send({ type: 'UNDO', depth: dad.messages[3].undoDepth })
    son.send({ type: 'UNDO', depth: dad.messages[3].undoDepth })
    const undone = await son.nextState(5)
    expect(undone.heroes[0].hp).toBe(HERO_TEMPLATES[2].maxHp)
    expect(undone.moment).toBeNull()
    expect(son.messages[4].undo).toBe('Starting the game')

    await new Promise((r) => setTimeout(r, 100))
    expect(son.messages).toHaveLength(5)
    dad.send({ type: 'UNDO', depth: son.messages[4].undoDepth })
    expect((await son.nextState(6)).status).toBe('setup')
    expect(son.messages[5].undo).toBeNull()
    dad.socket.close()
    son.socket.close()
  })

  it('keeps sound board taps out of Undo, so Undo never hands out more taps', async () => {
    const dad = connect(server.port)
    await dad.nextState(1)
    dad.send({ type: 'START_GAME', heroes: [createHero(HERO_TEMPLATES[0])] })
    const started = await dad.nextState(2)
    const heroId = started.heroes[0].id
    dad.send({ type: 'ADJUST_HP', heroId, amount: -1 })
    await dad.nextState(3)
    dad.send({ type: 'PLAY_BOARD_SOUND', who: heroId, sound: 'tada' })
    const played = await dad.nextState(4)
    expect(played.soundboard.used[heroId]).toBe(1)
    expect(dad.messages[3].undo).toBe(dad.messages[2].undo)

    dad.send({ type: 'UNDO', depth: dad.messages[3].undoDepth })
    const undone = await dad.nextState(5)
    expect(undone.heroes[0].hp).toBe(HERO_TEMPLATES[0].maxHp)
    expect(undone.soundboard.used[heroId]).toBe(1)
    dad.socket.close()
  })

  it('only lets the test copy turn off the sound board limits', async () => {
    const dad = connect(server.port)
    await dad.nextState(1)
    dad.send({ type: 'START_GAME', heroes: [createHero(HERO_TEMPLATES[0])] })
    await dad.nextState(2)
    dad.send({ type: 'SET_SOUNDBOARD_UNLIMITED', unlimited: true })
    dad.send({ type: 'ADJUST_XP', amount: 1 })
    const after = await dad.nextState(3)
    expect(after.xp).toBe(1)
    expect(after.soundboard?.unlimited ?? false).toBe(false)
    dad.socket.close()
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

  it('moves an unusable save aside instead of losing it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ashardalon-'))
    const file = join(dir, 'game.json')
    writeFileSync(file, JSON.stringify({ version: 999, xp: 5 }))
    expect(loadSavedGame(file)).toBe(initialState)
    expect(existsSync(file)).toBe(false)
    const kept = readdirSync(dir).filter((name) => name.startsWith('game-unreadable-'))
    expect(kept).toHaveLength(1)
    expect(JSON.parse(readFileSync(join(dir, kept[0]), 'utf8')).xp).toBe(5)
    rmSync(dir, { recursive: true, force: true })
  })

  it('keeps a saved game, filling in anything new', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ashardalon-'))
    const file = join(dir, 'game.json')
    const older = { ...initialState, xp: 4 }
    delete older.stats
    writeFileSync(file, JSON.stringify(older))
    expect(loadSavedGame(file)).toMatchObject({ xp: 4, stats: {} })
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('loading cards', () => {
  it('uses cards.json when it exists, otherwise the example', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ashardalon-'))
    const example = join(dir, 'example.json')
    const custom = join(dir, 'cards.json')
    writeFileSync(example, JSON.stringify({ powers: [{ id: 'e', hero: 'wizard', type: 'daily', name: 'Example' }] }))
    expect(loadCards(custom, example)).toMatchObject({ source: 'example', powers: [{ name: 'Example' }] })
    writeFileSync(custom, JSON.stringify({ powers: [{ id: 'c', hero: 'wizard', type: 'daily', name: 'Mine' }] }))
    expect(loadCards(custom, example)).toMatchObject({ source: 'custom', powers: [{ name: 'Mine' }] })
    writeFileSync(custom, '{oops')
    expect(loadCards(custom, example).problems[0]).toMatch(/Could not read cards.json/)
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('card art', () => {
  let dir
  let server
  const url = (path) => `http://localhost:${server.port}${path}`
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'ashardalon-'))
    server = await startServer({ port: 0, saveFile: join(dir, 'game.json'), staticDir: dir, artDir: join(dir, 'art') })
  })

  afterEach(async () => {
    await server.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('saves a picture, lists it, serves it, and tells every screen', async () => {
    expect(await (await fetch(url('/art.json'))).json()).toEqual({})
    const screen = connect(server.port)
    await screen.nextState(1)

    const saved = await fetch(url('/art/monster-human-cultist.jpg'), { method: 'PUT', body: jpeg })
    expect(saved.status).toBe(200)
    expect(await saved.json()).toEqual({ 'monster-human-cultist': { ext: 'jpg', v: expect.any(Number) } })
    expect(readFileSync(join(dir, 'art', 'monster-human-cultist.jpg'))).toEqual(jpeg)
    await screen.nextState(2)
    expect(screen.messages[1]).toEqual({ type: 'art' })

    const served = await fetch(url('/art/monster-human-cultist.jpg?v=1'))
    expect(served.headers.get('content-type')).toBe('image/jpeg')
    expect(Buffer.from(await served.arrayBuffer())).toEqual(jpeg)

    expect((await fetch(url('/art/monster-human-cultist.jpg'), { method: 'DELETE' })).status).toBe(200)
    expect(await (await fetch(url('/art.json'))).json()).toEqual({})
    expect((await fetch(url('/art/monster-human-cultist.jpg'))).status).toBe(404)
    screen.socket.close()
  })

  it('takes a PNG token in place of a JPEG', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    await fetch(url('/art/hero-cleric.jpg'), { method: 'PUT', body: jpeg })
    expect((await fetch(url('/art/hero-cleric.png'), { method: 'PUT', body: jpeg })).status).toBe(400)
    expect((await fetch(url('/art/hero-cleric.png'), { method: 'PUT', body: png })).status).toBe(200)
    expect(await (await fetch(url('/art.json'))).json()).toEqual({ 'hero-cleric': { ext: 'png', v: expect.any(Number) } })
    expect((await fetch(url('/art/hero-cleric.png'))).headers.get('content-type')).toBe('image/png')
    expect((await fetch(url('/art/hero-cleric.jpg'))).status).toBe(404)
  })

  it('turns away odd names and files that are not JPEGs', async () => {
    expect((await fetch(url('/art/..%2Fgame.jpg'), { method: 'PUT', body: jpeg })).status).toBe(404)
    expect((await fetch(url('/art/cards.jpg'), { method: 'PUT', body: jpeg })).status).toBe(404)
    expect((await fetch(url('/art/hero-cleric.jpg'), { method: 'PUT', body: 'hello' })).status).toBe(400)
    const huge = Buffer.concat([jpeg, Buffer.alloc(3 * 1024 * 1024)])
    expect((await fetch(url('/art/hero-cleric.jpg'), { method: 'PUT', body: huge }).catch(() => ({ status: 413 }))).status).toBe(413)
    expect(await (await fetch(url('/art.json'))).json()).toEqual({})
  })
})

describe('recordings', () => {
  it('lists the recordings on the Pi by the sound they replace', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ashardalon-sounds-'))
    writeFileSync(join(dir, 'dice.mp3'), 'x')
    writeFileSync(join(dir, 'CREDITS.csv'), 'x')
    writeFileSync(join(dir, 'Bad Name.mp3'), 'x')
    expect(Object.keys(listSounds(dir))).toEqual(['dice'])
    expect(listSounds(dir).dice.file).toBe('dice.mp3')
    expect(listSounds(join(dir, 'missing'))).toEqual({})
    rmSync(dir, { recursive: true, force: true })
  })

  it('serves part of a long track when a player asks for a range', () => {
    expect(byteRange(undefined, 1000)).toBe(null)
    expect(byteRange('bytes=0-', 1000)).toEqual([0, 999])
    expect(byteRange('bytes=100-199', 1000)).toEqual([100, 199])
    expect(byteRange('bytes=900-5000', 1000)).toEqual([900, 999])
    expect(byteRange('bytes=-100', 1000)).toEqual([900, 999])
    expect(byteRange('bytes=2000-', 1000)).toBe(false)
    expect(byteRange('bytes=0-1,5-9', 1000)).toBe(null)
  })
})
