// Friends playing from outside the house (server/access.js): each sees and plays only the
// games they made or were invited to, and can't change the family's things.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import { HERO_TEMPLATES } from '../src/data/heroes.js'
import { createHero } from '../src/state/game.js'
import { FRIEND_GAMES, MAX_GAMES, startServer } from './server.js'

// Stands in for Cloudflare: the test says who it is with a header.
const fakeAccess = {
  async who(req) {
    if (req.headers['x-test-refuse']) return null
    const email = req.headers['x-test-email']
    return email ? { family: false, email } : { family: true, email: null }
  },
}
const as = (email) => (email ? { 'x-test-email': email } : {})

function connect(port, { email, game } = {}) {
  const socket = new WebSocket(`ws://localhost:${port}/ws${game ? `?game=${game}` : ''}`, { headers: as(email) })
  const messages = []
  const waiters = []
  socket.on('message', (raw) => {
    messages.push(JSON.parse(raw))
    waiters.splice(0).forEach((check) => check())
  })
  const next = (match) =>
    new Promise((resolve) => {
      const check = () => {
        const found = messages.find(match)
        if (found) {
          messages.splice(messages.indexOf(found), 1)
          resolve(found)
        } else waiters.push(check)
      }
      check()
    })
  const send = (message) => socket.send(JSON.stringify(message))
  const opened = new Promise((resolve, reject) => {
    socket.on('open', resolve)
    socket.on('error', reject)
  })
  const newGame = async (name) => {
    await opened
    send({ type: 'new-game', name, requestId: name })
    return next((m) => (m.type === 'game-created' || m.type === 'new-game-refused') && m.requestId === name)
  }
  return { socket, messages, next, send, opened, newGame }
}

const until = async (check) => {
  for (let i = 0; i < 100 && !(await check()); i++) await new Promise((r) => setTimeout(r, 10))
  return check()
}

describe('friends on the real game', () => {
  let dir
  let server
  let url
  const get = (path, email) => fetch(`${url}${path}`, { headers: as(email) })
  const games = async (email) => (await get('/games.json', email)).json()

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'ashardalon-friends-'))
    server = await startServer({ port: 0, saveFile: join(dir, 'game.json'), staticDir: dir, access: fakeAccess, warmNarrator: false })
    url = `http://localhost:${server.port}`
  })

  afterEach(async () => {
    await server.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('turns away a request Cloudflare did not sign, and says who a friend is', async () => {
    expect((await fetch(`${url}/games.json`, { headers: { 'x-test-refuse': '1' } })).status).toBe(403)
    expect((await fetch(`${url}/health`, { headers: { 'x-test-refuse': '1' } })).status).toBe(200)
    expect(await (await get('/me.json', 'amy@example.com')).json()).toEqual({ friend: true, email: 'amy@example.com' })
    expect(await (await get('/me.json')).json()).toEqual({ friend: false, email: null })
    const refused = new WebSocket(`ws://localhost:${server.port}/ws`, { headers: { 'x-test-refuse': '1' } })
    await expect(new Promise((resolve, reject) => {
      refused.on('open', resolve)
      refused.on('error', reject)
    })).rejects.toThrow(/403/)
  })

  it("keeps a friend out of the family game and other people's games", async () => {
    const dad = connect(server.port)
    const dadsGame = (await dad.newGame("Colton's solo")).id
    const amy = connect(server.port, { email: 'amy@example.com' })
    // No game asked for: the friend waits on "Which game?" instead of joining the family game.
    expect(await amy.next((m) => m.type === 'no-game' || m.type === 'state')).toMatchObject({ type: 'no-game' })
    for (const game of ['family', dadsGame]) {
      const peek = connect(server.port, { email: 'amy@example.com', game })
      expect(await peek.next((m) => m.type === 'no-game' || m.type === 'state')).toMatchObject({ type: 'no-game' })
      peek.socket.close()
    }
    const amysGame = (await amy.newGame("Amy's game")).id
    expect((await games('amy@example.com')).games.map((g) => g.id)).toEqual([amysGame])
    expect((await games('bob@example.com')).games).toEqual([])
    // A friend can't rename or finish a game that isn't theirs.
    amy.send({ type: 'rename-game', id: dadsGame, name: 'Mine now' })
    amy.send({ type: 'finish-game', id: dadsGame })
    const bob = connect(server.port, { email: 'bob@example.com' })
    await bob.opened
    bob.send({ type: 'finish-game', id: amysGame })
    await new Promise((r) => setTimeout(r, 50))
    const family = await games()
    expect(family.games.map((g) => g.name)).toEqual(['Family game', "Colton's solo", "Amy's game"])
    expect(family.games.find((g) => g.id === amysGame)).toMatchObject({ owner: 'amy@example.com', mine: true })
    for (const s of [dad, amy, bob]) s.socket.close()
  })

  it("starts a friend's new game on an adventure, and the family's on free play", async () => {
    const amy = connect(server.port, { email: 'amy@example.com' })
    const amysGame = (await amy.newGame("Amy's game")).id
    const inAmys = connect(server.port, { email: 'amy@example.com', game: amysGame })
    const state = (await inAmys.next((m) => m.type === 'state')).state
    // The example cards have no Adventure 1, so the first adventure in the file.
    expect(state.lobbyAdventure?.id).toBe('example-practice-hunt')
    const dad = connect(server.port)
    const dadsGame = (await dad.newGame('Dad solo')).id
    const inDads = connect(server.port, { game: dadsGame })
    expect((await inDads.next((m) => m.type === 'state')).state.lobbyAdventure).toBeNull()
    for (const s of [amy, inAmys, dad, inDads]) s.socket.close()
  })

  it('a friend in no game changes nothing, even with a tap', async () => {
    const amy = connect(server.port, { email: 'amy@example.com' })
    await amy.next((m) => m.type === 'no-game')
    amy.send({ type: 'action', id: 'x', action: { type: 'START_GAME', heroes: [createHero(HERO_TEMPLATES[0])] } })
    expect(await amy.next((m) => m.type === 'ack')).toMatchObject({ id: 'x' })
    const dad = connect(server.port)
    expect((await dad.next((m) => m.type === 'state')).state.status).toBe('setup')
    for (const s of [dad, amy]) s.socket.close()
  })

  it('lets a friend invite another friend to play together, and take them out again', async () => {
    const amy = connect(server.port, { email: 'amy@example.com' })
    const game = (await amy.newGame('Game night')).id
    amy.send({ type: 'invite-game', id: game, email: ' Bob@Example.com ' })
    expect(await until(async () => (await games('bob@example.com')).games.length === 1)).toBe(true)
    expect((await games('bob@example.com')).games[0]).toMatchObject({ id: game, mine: false, owner: 'amy@example.com' })
    const bob = connect(server.port, { email: 'bob@example.com', game })
    expect(await bob.next((m) => m.type === 'state' || m.type === 'no-game')).toMatchObject({ type: 'state', game: { id: game } })
    // Bob can play but not invite others or finish Amy's game.
    bob.send({ type: 'invite-game', id: game, email: 'cat@example.com' })
    bob.send({ type: 'finish-game', id: game })
    await new Promise((r) => setTimeout(r, 50))
    expect((await games('cat@example.com')).games).toEqual([])
    expect((await games('amy@example.com')).games).toHaveLength(1)
    amy.send({ type: 'uninvite-game', id: game, email: 'bob@example.com' })
    expect(await bob.next((m) => m.type === 'no-game')).toBeTruthy()
    expect((await games('bob@example.com')).games).toEqual([])
    for (const s of [amy, bob]) s.socket.close()
  })

  it('lets the family invite friends into a family-made game, but not the family game', async () => {
    const dad = connect(server.port)
    const game = (await dad.newGame('Dad and friends')).id
    dad.send({ type: 'invite-game', id: game, email: 'amy@example.com' })
    dad.send({ type: 'invite-game', id: 'family', email: 'amy@example.com' })
    expect(await until(async () => (await games('amy@example.com')).games.length === 1)).toBe(true)
    expect((await games('amy@example.com')).games.map((g) => g.id)).toEqual([game])
    dad.socket.close()
  })

  it('gives each friend their own few games, apart from the family slots', async () => {
    const amy = connect(server.port, { email: 'amy@example.com' })
    for (let i = 0; i < FRIEND_GAMES; i++) expect((await amy.newGame(`Amy ${i}`)).type).toBe('game-created')
    expect(await amy.newGame('One more')).toMatchObject({ type: 'new-game-refused', reason: 'friend-full' })
    expect(await games('amy@example.com')).toMatchObject({ full: true, max: FRIEND_GAMES, friend: true })
    const dad = connect(server.port)
    for (let i = 1; i < MAX_GAMES; i++) expect((await dad.newGame(`Family ${i}`)).type).toBe('game-created')
    expect(await dad.newGame('Too many')).toMatchObject({ reason: 'full' })
    // Finishing one of Amy's games frees one of her slots, and only she sees it on Finished.
    amy.send({ type: 'finish-game', id: 'amy-0' })
    expect(await until(async () => (await games('amy@example.com')).finished.length === 1)).toBe(true)
    expect((await games('bob@example.com')).finished).toEqual([])
    expect((await amy.newGame('Amy again')).type).toBe('game-created')
    for (const s of [amy, dad]) s.socket.close()
  })

  it("keeps the family's things to the family", async () => {
    const amy = 'amy@example.com'
    expect((await fetch(`${url}/art/hero-fighter.jpg`, { method: 'PUT', headers: as(amy), body: 'x' })).status).toBe(403)
    expect((await fetch(`${url}/art/hero-fighter.jpg`, { method: 'DELETE', headers: as(amy) })).status).toBe(403)
    expect((await fetch(`${url}/sound-takes/pick`, { method: 'POST', headers: as(amy), body: '{}' })).status).toBe(403)
    expect((await get('/ideas.json', amy)).status).toBe(403)
    const sent = await fetch(`${url}/ideas`, { method: 'POST', headers: { ...as(amy), 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'More dragons', from: 'Amy' }) })
    expect(sent.status).toBe(201)
    const { ideas } = await (await get('/ideas.json')).json()
    expect(ideas[0]).toMatchObject({ text: 'More dragons', from: 'Amy', email: amy })
    expect((await fetch(`${url}/ideas/${ideas[0].id}`, { method: 'DELETE', headers: as(amy) })).status).toBe(403)
    expect(await (await get('/records.json', amy)).json()).toEqual({ players: [], solo: [], played: {} })
  })
})

describe('how much friends play', () => {
  let dir
  let server
  let url
  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'ashardalon-friendlog-'))
    server = await startServer({ port: 0, saveFile: join(dir, 'game.json'), staticDir: dir, access: fakeAccess, warmNarrator: false })
    url = `http://localhost:${server.port}`
  })
  afterEach(async () => {
    await server.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('counts visits, games and taps for the #friends page, which only the family can read', async () => {
    const amy = connect(server.port, { email: 'amy@example.com' })
    const game = (await amy.newGame("Amy's game")).id
    const inGame = connect(server.port, { email: 'amy@example.com', game })
    await inGame.next((m) => m.type === 'state')
    inGame.send({ type: 'action', id: 't1', action: { type: 'START_GAME', heroes: [createHero(HERO_TEMPLATES[0])] } })
    await inGame.next((m) => m.type === 'ack')
    expect((await fetch(`${url}/friends.json`, { headers: as('amy@example.com') })).status).toBe(403)
    const { friends } = await (await fetch(`${url}/friends.json`)).json()
    expect(friends).toHaveLength(1)
    expect(friends[0]).toMatchObject({ email: 'amy@example.com', visits: 1, gamesStarted: 1, taps: 1, gamesFinished: 0 })
    expect(friends[0].games).toEqual([expect.objectContaining({ id: game, name: "Amy's game", mine: true, status: 'playing' })])
    for (const s of [amy, inGame]) s.socket.close()
  })
})
