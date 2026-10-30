import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import { HERO_TEMPLATES } from '../src/data/heroes.js'
import { createHero, initialState } from '../src/state/game.js'
import { byteRange, gameIdFor, listSounds, loadCards, loadGameList, loadSavedGame, FINISHED_DAYS, MAX_GAMES, startServer } from './server.js'

// Opens a socket and collects every state the server sends.
function connect(port, game) {
  const socket = new WebSocket(`ws://localhost:${port}/ws${game ? `?game=${game}` : ''}`)
  const states = []
  const messages = []
  const waiters = []
  const screens = []
  const other = []
  socket.on('message', (raw) => {
    const message = JSON.parse(raw)
    // Which screens are open comes on its own, whenever that changes.
    if (message.type === 'screens') {
      screens.push(message.seats)
      return
    }
    // News about the list of games, and answers to starting one.
    if (['games', 'game-created', 'new-game-refused'].includes(message.type)) {
      other.push(message)
      waiters.splice(0).forEach((resolve) => resolve())
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
  const nextOther = (...types) =>
    new Promise((resolve) => {
      const check = () => {
        const found = other.find((m) => types.includes(m.type))
        if (found) {
          other.splice(other.indexOf(found), 1)
          resolve(found)
        } else waiters.push(check)
      }
      check()
    })
  return { socket, nextState, send, messages, screens, nextOther }
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

describe('several games at once', () => {
  let dir
  let server
  const open = () => startServer({ port: 0, saveFile: join(dir, 'game.json'), staticDir: dir, warmNarrator: false })
  const newGame = async (screen, name) => {
    screen.socket.send(JSON.stringify({ type: 'new-game', name, requestId: name }))
    const answer = await screen.nextOther('game-created', 'new-game-refused')
    // A started game also tells every screen the list changed.
    if (answer.type === 'game-created') await screen.nextOther('games')
    return answer
  }
  const games = async () => (await fetch(`http://localhost:${server.port}/games.json`)).json()

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'ashardalon-'))
    server = await open()
  })

  afterEach(async () => {
    await server.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('puts a screen with no game, or a game that is gone, in the family game', async () => {
    const plain = connect(server.port)
    const lost = connect(server.port, 'nobody-here')
    await plain.nextState(1)
    await lost.nextState(1)
    expect(plain.messages[0].game).toEqual({ id: 'family', name: 'Family game' })
    expect(lost.messages[0].game.id).toBe('family')
    plain.socket.close()
    lost.socket.close()
  })

  it('keeps each game, its Undo and its screens apart', async () => {
    const dad = connect(server.port)
    await dad.nextState(1)
    const created = await newGame(dad, "Colton's solo")
    expect(created).toMatchObject({ type: 'game-created', id: 'coltons-solo', name: "Colton's solo", requestId: "Colton's solo" })

    const colton = connect(server.port, 'coltons-solo')
    await colton.nextState(1)
    expect(colton.messages[0].game).toEqual({ id: 'coltons-solo', name: "Colton's solo" })

    colton.send({ type: 'START_GAME', heroes: [createHero(HERO_TEMPLATES[1])] })
    const solo = await colton.nextState(2)
    expect(solo.status).toBe('playing')
    expect(colton.messages[1].undo).toBe('Starting the game')

    // The family screen heard nothing about it, and its game and Undo are untouched.
    await new Promise((r) => setTimeout(r, 100))
    expect(dad.messages).toHaveLength(1)
    expect(dad.messages[0].state.status).toBe('setup')

    dad.send({ type: 'START_GAME', heroes: [createHero(HERO_TEMPLATES[0]), createHero(HERO_TEMPLATES[2])] })
    expect((await dad.nextState(2)).heroes).toHaveLength(2)
    expect(colton.messages).toHaveLength(2)

    // Undo in the solo game only steps back the solo game.
    colton.send({ type: 'UNDO', depth: 1 })
    expect((await colton.nextState(3)).status).toBe('setup')
    expect(dad.messages).toHaveLength(2)

    // Each game has its own save file.
    expect(JSON.parse(readFileSync(join(dir, 'game.json'), 'utf8')).heroes).toHaveLength(2)
    expect(JSON.parse(readFileSync(join(dir, 'games', 'coltons-solo.json'), 'utf8')).status).toBe('setup')
    dad.socket.close()
    colton.socket.close()
  })

  it('lists the games, and keeps them after a restart', async () => {
    const dad = connect(server.port)
    await dad.nextState(1)
    await newGame(dad, 'Solo run')
    const colton = connect(server.port, 'solo-run')
    await colton.nextState(1)
    colton.send({ type: 'START_GAME', heroes: [createHero(HERO_TEMPLATES[3])] })
    await colton.nextState(2)

    const listed = await games()
    expect(listed.max).toBe(MAX_GAMES)
    expect(listed.games.map((g) => [g.id, g.name, g.status])).toEqual([
      ['family', 'Family game', 'setup'],
      ['solo-run', 'Solo run', 'playing'],
    ])
    expect(listed.games[1].heroes).toEqual([HERO_TEMPLATES[3].name])
    expect(listed.games[1].screens).toBe(1)
    dad.socket.close()
    colton.socket.close()

    await server.close()
    server = await open()
    const again = connect(server.port, 'solo-run')
    expect((await again.nextState(1)).heroes[0].name).toBe(HERO_TEMPLATES[3].name)
    again.socket.close()
  })

  it('tells every screen when a game is started', async () => {
    const dad = connect(server.port)
    const son = connect(server.port)
    await dad.nextState(1)
    await son.nextState(1)
    dad.socket.send(JSON.stringify({ type: 'new-game', name: 'Another' }))
    expect(await son.nextOther('games')).toEqual({ type: 'games' })
    dad.socket.close()
    son.socket.close()
  })

  it('turns away a game with no name, and more than the limit', async () => {
    const dad = connect(server.port)
    await dad.nextState(1)
    expect(await newGame(dad, '   ')).toMatchObject({ type: 'new-game-refused', reason: 'name' })
    for (let i = 1; i < MAX_GAMES; i++) expect((await newGame(dad, `Game ${i}`)).type).toBe('game-created')
    expect(await newGame(dad, 'One too many')).toMatchObject({ type: 'new-game-refused', reason: 'full' })
    expect((await games()).games).toHaveLength(MAX_GAMES)
    dad.socket.close()
  })

  it('makes a short, unique id from the name', () => {
    expect(gameIdFor("Colton's Solo!", [])).toBe('coltons-solo')
    expect(gameIdFor('Solo', ['solo'])).toBe('solo-2')
    expect(gameIdFor('Family', [])).toBe('family-2')
    expect(gameIdFor('🐉', [])).toBe('game')
  })

  it('reads a missing or broken list of games as none', () => {
    const none = { games: [], finished: [] }
    expect(loadGameList(join(dir, 'missing.json'))).toEqual(none)
    writeFileSync(join(dir, 'list.json'), '{oops')
    expect(loadGameList(join(dir, 'list.json'))).toEqual(none)
    writeFileSync(join(dir, 'list.json'), JSON.stringify({ games: [{ id: 'ok', name: 'OK' }, { id: '../bad', name: 'x' }, { id: 'family', name: 'x' }] }))
    expect(loadGameList(join(dir, 'list.json'))).toEqual({ games: [{ id: 'ok', name: 'OK' }], finished: [] })
  })

  it('renames a game for everyone in it', async () => {
    const dad = connect(server.port)
    await dad.nextState(1)
    await newGame(dad, 'Solo')
    const colton = connect(server.port, 'solo')
    await colton.nextState(1)
    dad.socket.send(JSON.stringify({ type: 'rename-game', id: 'solo', name: '  Colton  vs the dragon ' }))
    await colton.nextState(2)
    expect(colton.messages[1].game).toEqual({ id: 'solo', name: 'Colton vs the dragon' })
    // The family game keeps its name.
    dad.socket.send(JSON.stringify({ type: 'rename-game', id: 'family', name: 'Nope' }))
    await dad.nextOther('games')
    expect((await games()).games.map((g) => g.name)).toEqual(['Family game', 'Colton vs the dragon'])
    dad.socket.close()
    colton.socket.close()
  })

  it('moves a finished game to the Finished list, sends its screens to the family game, and can bring it back', async () => {
    const dad = connect(server.port)
    await dad.nextState(1)
    await newGame(dad, 'Solo')
    const colton = connect(server.port, 'solo')
    await colton.nextState(1)
    colton.send({ type: 'START_GAME', heroes: [createHero(HERO_TEMPLATES[1])] })
    await colton.nextState(2)

    dad.socket.send(JSON.stringify({ type: 'finish-game', id: 'solo' }))
    await colton.nextState(3)
    expect(colton.messages[2].game.id).toBe('family')
    let listed = await games()
    expect(listed.games.map((g) => g.id)).toEqual(['family'])
    expect(listed.finished).toMatchObject([{ id: 'solo', name: 'Solo' }])
    expect(existsSync(join(dir, 'games', 'finished', 'solo.json'))).toBe(true)
    expect(existsSync(join(dir, 'games', 'solo.json'))).toBe(false)
    // The family game itself can't be finished.
    dad.socket.send(JSON.stringify({ type: 'finish-game', id: 'family' }))
    await dad.nextOther('games')

    dad.socket.send(JSON.stringify({ type: 'bring-back-game', id: 'solo' }))
    await dad.nextOther('games')
    listed = await games()
    expect(listed.games.map((g) => g.id)).toEqual(['family', 'solo'])
    expect(listed.games[1].status).toBe('playing')
    expect(listed.finished).toEqual([])
    dad.socket.close()
    colton.socket.close()
  })

  it('forgets finished games after a while', async () => {
    await server.close()
    mkdirSync(join(dir, 'games', 'finished'), { recursive: true })
    writeFileSync(join(dir, 'games', 'finished', 'old.json'), JSON.stringify(initialState))
    writeFileSync(join(dir, 'games', 'finished', 'new.json'), JSON.stringify(initialState))
    const long = Date.now() - (FINISHED_DAYS + 1) * 24 * 60 * 60 * 1000
    writeFileSync(
      join(dir, 'games', 'games.json'),
      JSON.stringify({ games: [], finished: [{ id: 'old', name: 'Old', finishedAt: long }, { id: 'new', name: 'New', finishedAt: Date.now() }] }),
    )
    server = await open()
    expect((await games()).finished.map((g) => g.id)).toEqual(['new'])
    expect(existsSync(join(dir, 'games', 'finished', 'old.json'))).toBe(false)
    expect(existsSync(join(dir, 'games', 'finished', 'new.json'))).toBe(true)
  })

  it('counts only games still being played toward the limit', async () => {
    const dad = connect(server.port)
    await dad.nextState(1)
    for (let i = 1; i < MAX_GAMES; i++) await newGame(dad, `Game ${i}`)
    dad.socket.send(JSON.stringify({ type: 'finish-game', id: 'game-1' }))
    await dad.nextOther('games')
    expect((await newGame(dad, 'Fresh')).type).toBe('game-created')
    // Now it's full again, so game 1 can't come back yet.
    dad.socket.send(JSON.stringify({ type: 'bring-back-game', id: 'game-1' }))
    expect(await dad.nextOther('new-game-refused')).toMatchObject({ reason: 'full' })
    dad.socket.close()
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

  it('adds how loud each music track is, when the Pi has measured it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ashardalon-sounds-'))
    writeFileSync(join(dir, 'loop-battle.mp3'), 'x')
    writeFileSync(join(dir, 'loop-boss.mp3'), 'x')
    writeFileSync(join(dir, 'music-levels.json'), JSON.stringify({ 'loop-battle': -15.2, 'loop-boss': 'loud' }))
    const sounds = listSounds(dir)
    expect(sounds['loop-battle'].lufs).toBe(-15.2)
    expect(sounds['loop-boss'].lufs).toBe(undefined)
    expect(sounds['music-levels']).toBe(undefined)
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
