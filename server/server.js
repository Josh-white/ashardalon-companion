// Serves the built app and keeps the shared games. Every iPad connects over a
// WebSocket to one game, sends actions, and receives that game's new state after
// each change. The family game is saved in game.json as it always was; any other
// game is saved in games/<id>.json, listed in games/games.json.
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { dirname, extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'
import { ART_NAME, MAX_ART_BYTES } from '../src/data/art.js'
import { createNarrator } from './narrator.js'
import { createIdeaBox } from './ideas.js'
import { readBody } from './readBody.js'
import { auditionList, pickTake, takesDir } from './soundTakes.js'
import { normalizeCardFile } from '../src/data/cards.js'
import { missingCards } from '../src/data/cardCheck.js'
import { setHeroTemplates } from '../src/data/heroes.js'
import { describeAction } from '../src/state/describeAction.js'
import { gameReducer, initialState } from '../src/state/game.js'
import { migrateSave } from '../src/state/saves.js'
import { recordsReply, syncRecord } from '../src/state/records.js'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

// How many changes Undo can step back through. Kept in memory only, so a
// restart of the server starts with nothing to undo.
export const UNDO_LIMIT = 30

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
}

// The saved game, upgraded from an older version of the app if needed. A save that
// can't be used (broken, or from a newer version) is moved aside rather than saved
// over, so it can still be put back by hand.
export function loadSavedGame(file) {
  if (!existsSync(file)) return initialState
  let saved = null
  try {
    saved = migrateSave(JSON.parse(readFileSync(file, 'utf8')))
  } catch {
    // Not JSON: handled below.
  }
  if (saved) return saved
  const aside = `${file.replace(/\.json$/, '')}-unreadable-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  try {
    renameSync(file, aside)
    console.error(`Could not use the saved game, so it was moved to ${aside} and a new game started.`)
  } catch (error) {
    console.error('Could not use or move the saved game:', error.message)
  }
  return initialState
}

function writeSave(file, state) {
  mkdirSync(dirname(file), { recursive: true })
  const temp = `${file}.tmp`
  writeFileSync(temp, JSON.stringify(state))
  renameSync(temp, file)
}

// Reads the card file on every request, so edits show up on the next reload.
export function loadCards(cardsFile, exampleFile) {
  const file = existsSync(cardsFile) ? cardsFile : exampleFile
  const source = file === cardsFile ? 'custom' : 'example'
  try {
    return { source, ...normalizeCardFile(JSON.parse(readFileSync(file, 'utf8'))) }
  } catch (error) {
    return { source, powers: [], abilities: [], monsters: [], villains: [], encounters: [], adventures: [], chambers: [], treasures: [], villagers: [], boons: [], treasureTokens: [], tiles: [], problems: [`Could not read ${source === 'custom' ? 'cards.json' : 'the example cards'}: ${error.message}`] }
  }
}

// Card pictures are JPEGs (cropped photos) or PNGs (tokens with see-through corners).
const ART_TYPES = {
  jpg: { type: 'image/jpeg', magic: [0xff, 0xd8, 0xff] },
  png: { type: 'image/png', magic: [0x89, 0x50, 0x4e, 0x47] },
}

// Which card pictures are on the Pi, each with its file type and a version that
// changes when the picture does, so screens fetch a new one and cache the rest.
export function listArt(artDir) {
  const art = {}
  try {
    for (const file of readdirSync(artDir)) {
      const [, name, ext] = file.match(/^(.+)\.(jpg|png)$/) ?? []
      if (name && ART_NAME.test(name)) art[name] = { ext, v: Math.round(statSync(join(artDir, file)).mtimeMs) }
    }
  } catch {
    // No art folder yet: no pictures.
  }
  return art
}

// Recordings that play in place of a made-up sound (src/audio/samples.js), named for
// the sound they replace: cards/sounds/dice.mp3 replaces "dice". Only on the Pi.
const SOUND_FILE = /^([a-z0-9-]+)\.(mp3|ogg|wav|m4a)$/
const SOUND_TYPES = { mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4' }

// How loud each music track is (integrated LUFS), measured on the Pi by
// scripts/measure-music.sh into cards/sounds/music-levels.json, so screens can even
// the tracks out without changing the files.
export const MUSIC_LEVELS = 'music-levels.json'

function musicLevels(soundsDir) {
  try {
    return JSON.parse(readFileSync(join(soundsDir, MUSIC_LEVELS), 'utf8'))
  } catch {
    return {}
  }
}

export function listSounds(soundsDir) {
  const sounds = {}
  try {
    const levels = musicLevels(soundsDir)
    for (const file of readdirSync(soundsDir)) {
      const [, name] = file.match(SOUND_FILE) ?? []
      if (!name) continue
      sounds[name] = { file, v: Math.round(statSync(join(soundsDir, file)).mtimeMs) }
      if (Number.isFinite(levels[name])) sounds[name].lufs = levels[name]
    }
  } catch {
    // No sounds folder: every sound is made up.
  }
  return sounds
}

function serveSound(soundsDir, req, res) {
  const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).slice('/sounds/'.length)
  const [, , ext] = name.match(SOUND_FILE) ?? []
  const file = ext && join(soundsDir, name)
  if (!file || !existsSync(file)) {
    res.writeHead(404).end('Not found')
    return
  }
  // Screens ask for ?v=<version>, so a recording never changes under one URL.
  const headers = { 'Content-Type': SOUND_TYPES[ext], 'Cache-Control': 'public, max-age=31536000, immutable', 'Accept-Ranges': 'bytes' }
  const size = statSync(file).size
  // The long music tracks stream in pieces, and Safari only plays audio that can.
  const range = byteRange(req.headers.range, size)
  if (range === false) {
    res.writeHead(416, { 'Content-Range': `bytes */${size}` }).end()
    return
  }
  if (range) {
    const [start, end] = range
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 })
    createReadStream(file, { start, end }).pipe(res)
    return
  }
  res.writeHead(200, { ...headers, 'Content-Length': size })
  createReadStream(file).pipe(res)
}

// The bytes a Range header asks for, as [start, end], null for the whole file, or false
// for a range outside it. Only one range is served.
export function byteRange(header, size) {
  const [, from, to] = /^bytes=(\d*)-(\d*)$/.exec(header ?? '') ?? []
  if (from === undefined || (from === '' && to === '')) return null
  // "bytes=-500" is the last 500 bytes.
  const start = from === '' ? Math.max(0, size - Number(to)) : Number(from)
  const end = from === '' || to === '' ? size - 1 : Math.min(Number(to), size - 1)
  return start <= end && start < size ? [start, end] : false
}

// The #audition page: the list of sounds and their takes, each take's audio, and
// POST /sound-takes/pick { name, take } to make a take the one the game plays.
const TAKE_NAME = /^[a-z0-9-]+-\d+\.mp3$/
async function handleTakes(soundsDir, req, res) {
  const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
  if (path === '/sound-takes.json') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(auditionList(soundsDir)))
    return
  }
  if (path === '/sound-takes/pick' && req.method === 'POST') {
    try {
      const { name, take } = JSON.parse(String(await readBody(req, 1000)))
      const ok = typeof name === 'string' && pickTake(soundsDir, name, take)
      res.writeHead(ok ? 200 : 404, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok }))
    } catch {
      res.writeHead(400).end('Bad request')
    }
    return
  }
  const name = path.slice('/sound-takes/'.length)
  const file = TAKE_NAME.test(name) && join(takesDir(soundsDir), name)
  if (!file || !existsSync(file)) {
    res.writeHead(404).end('Not found')
    return
  }
  res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' })
  createReadStream(file).pipe(res)
}

// GET /art/<name>.jpg (or .png) serves a picture, PUT saves one, and DELETE
// takes it away. Every change tells the screens to look again.
async function handleArt(artDir, req, res, onChange) {
  const [, name, ext] = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).match(/^\/art\/(.+)\.(jpg|png)$/) ?? []
  if (!name || !ART_NAME.test(name)) {
    res.writeHead(404).end('Not found')
    return
  }
  const file = join(artDir, `${name}.${ext}`)
  const others = Object.keys(ART_TYPES).map((e) => join(artDir, `${name}.${e}`))
  if (req.method === 'GET' || req.method === 'HEAD') {
    if (!existsSync(file)) {
      res.writeHead(404).end('Not found')
      return
    }
    // Screens ask for ?v=<version>, so a picture never changes under one URL.
    res.writeHead(200, { 'Content-Type': ART_TYPES[ext].type, 'Cache-Control': 'public, max-age=31536000, immutable' })
    if (req.method === 'HEAD') res.end()
    else createReadStream(file).pipe(res)
    return
  }
  try {
    if (req.method === 'PUT') {
      const body = await readBody(req, MAX_ART_BYTES)
      // The file has to really be the picture type its name says.
      if (!ART_TYPES[ext].magic.every((byte, i) => body[i] === byte)) {
        res.writeHead(400, { 'Content-Type': 'text/plain' }).end(`Send a ${ext.toUpperCase()} picture.`)
        return
      }
      mkdirSync(artDir, { recursive: true })
      writeFileSync(`${file}.tmp`, body)
      renameSync(`${file}.tmp`, file)
      // One picture per card: a new PNG replaces an old JPEG and the other way round.
      for (const other of others) if (other !== file) rmSync(other, { force: true })
    } else if (req.method === 'DELETE') {
      for (const other of others) rmSync(other, { force: true })
    } else {
      res.writeHead(405).end('Not allowed')
      return
    }
  } catch (error) {
    const tooBig = error.message === 'too big'
    if (!res.headersSent) res.writeHead(tooBig ? 413 : 500, { 'Content-Type': 'text/plain' }).end(tooBig ? 'That picture is too big.' : `Could not save the picture: ${error.message}`)
    return
  }
  res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(listArt(artDir)))
  onChange()
}

function serveStatic(staticDir, req, res) {
  const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
  let file = normalize(join(staticDir, path))
  if (!file.startsWith(staticDir) || !existsSync(file) || statSync(file).isDirectory()) {
    file = join(staticDir, 'index.html')
  }
  if (!existsSync(file)) {
    res.writeHead(404).end('Not found')
    return
  }
  const isAsset = file.startsWith(join(staticDir, 'assets'))
  res.writeHead(200, {
    'Content-Type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': isAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
  })
  createReadStream(file).pipe(res)
}

// The family game is always there. Other games are started from the "Which game?" screen.
export const FAMILY_GAME = 'family'
const FAMILY_NAME = 'Family game'
// How many games can be kept at once, the family game included.
export const MAX_GAMES = 10
const GAME_ID = /^[a-z0-9-]{1,40}$/

// How long a finished game stays on the Finished list, where it can be brought back.
export const FINISHED_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

// The games other than the family game: { games: [{ id, name, createdAt }], finished:
// [{ id, name, createdAt, finishedAt }] }. A missing or broken list means there are none
// yet; their save files are left alone.
export function loadGameList(file) {
  const valid = (g) => GAME_ID.test(g?.id) && g.id !== FAMILY_GAME && typeof g.name === 'string'
  try {
    const list = JSON.parse(readFileSync(file, 'utf8'))
    return { games: (list.games ?? []).filter(valid), finished: (list.finished ?? []).filter(valid) }
  } catch {
    return { games: [], finished: [] }
  }
}

const cleanName = (name) => (typeof name === 'string' ? name.trim().replace(/\s+/g, ' ').slice(0, 40) : '')

// "Colton's solo!" -> "coltons-solo", made unique against the ids already used.
export function gameIdFor(name, taken) {
  const base = name.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'game'
  let id = base
  for (let n = 2; id === FAMILY_GAME || taken.includes(id); n++) id = `${base}-${n}`
  return id
}

// What the "Which game?" screen shows about a game.
const gameSummary = (room, name, screens) => ({
  id: room.id,
  name,
  status: room.state.status,
  heroes: room.state.heroes.map((h) => h.name),
  adventure: room.state.adventure?.card?.name ?? room.state.adventure?.name ?? null,
  board: Boolean(room.state.board),
  updatedAt: room.updatedAt,
  screens,
})

const SEEN_LIMIT = 500
const NOT_UNDOABLE = new Set(['ROLL_DIE', 'ATTACH_MONSTER_CARDS', 'UPDATE_ENCOUNTER_CARDS', 'CLAIM_HERO', 'RELEASE_HERO', 'SET_LOBBY_PLAYER', 'SET_LOBBY_PICK', 'SET_LOBBY_READY', 'SET_LOBBY_ALLY', 'PLAY_BOARD_SOUND', 'SET_SOUNDBOARD_OFF', 'SET_SOUNDBOARD_UNLIMITED', 'FIRST_ROLL_DONE', 'OPENING_NARRATING', 'OPENING_QUIET', 'OPENING_DONE', 'FIRST_ROLL_NARRATING', 'FIRST_ROLL_QUIET', 'ALLY_PAUSE', 'ALLY_HELP', 'CARD_READING', 'SKIP_READING'])

export function startServer({
  port = Number(process.env.PORT ?? 3000),
  saveFile = process.env.SAVE_FILE ?? join(ROOT, 'data', 'game.json'),
  staticDir = join(ROOT, 'dist'),
  cardsFile = process.env.CARDS_FILE ?? join(ROOT, 'cards', 'cards.json'),
  exampleCardsFile = join(ROOT, 'cards', 'cards.example.json'),
  artDir = process.env.ART_DIR ?? join(ROOT, 'cards', 'art'),
  soundsDir = process.env.SOUNDS_DIR ?? join(ROOT, 'cards', 'sounds'),
  // Set on the test copy so every screen shows it isn't the real game.
  instance = process.env.INSTANCE_LABEL || null,
  // Spoken lines are saved next to the game, so they survive updates.
  narrator = createNarrator({ cacheDir: join(dirname(saveFile), 'narration') }),
  // ELEVENLABS_WARM_UP=off skips recording the villain lines on start (to try voices cheaply).
  warmNarrator = process.env.ELEVENLABS_WARM_UP !== 'off',
} = {}) {
  const gamesDir = join(dirname(saveFile), 'games')
  const gameListFile = join(gamesDir, 'games.json')
  const finishedDir = join(gamesDir, 'finished')
  // Every player's finished games, for their records and titles (state/records.js).
  const recordsFile = join(dirname(saveFile), 'records.json')
  let records = { games: {} }
  try {
    if (existsSync(recordsFile)) records = { games: {}, ...JSON.parse(readFileSync(recordsFile, 'utf8')) }
  } catch (error) {
    console.error('Could not read the players\' records:', error.message)
  }
  function updateRecords(state) {
    const next = syncRecord(records, state)
    if (!next) return
    records = next
    try {
      writeSave(recordsFile, records)
    } catch (error) {
      console.error('Could not save the players\' records:', error.message)
    }
  }
  // The players' ideas and feedback, sent from the 💡 button (server/ideas.js).
  const ideaBox = createIdeaBox(join(dirname(saveFile), 'ideas.json'))
  let { games: otherGames, finished } = loadGameList(gameListFile)
  // Each game in memory: its state, its own Undo steps, and the ids of its latest actions
  // (so a resent one isn't applied twice). Loaded the first time a screen joins it.
  const rooms = new Map()
  const gameFile = (id) => (id === FAMILY_GAME ? saveFile : join(gamesDir, `${id}.json`))
  const gameName = (id) => (id === FAMILY_GAME ? FAMILY_NAME : otherGames.find((g) => g.id === id)?.name)
  const isGame = (id) => id === FAMILY_GAME || otherGames.some((g) => g.id === id)
  function room(id) {
    if (!rooms.has(id)) {
      const file = gameFile(id)
      let updatedAt = null
      try {
        updatedAt = statSync(file).mtimeMs
      } catch {
        // Not saved yet.
      }
      rooms.set(id, { id, file, state: loadSavedGame(file), history: [], seenActions: new Set(), updatedAt })
    }
    return rooms.get(id)
  }
  // The family game loads straight away, as it always has.
  room(FAMILY_GAME)
  try {
    clearOldFinished()
  } catch (error) {
    console.error('Could not clear old finished games:', error.message)
  }
  // The heroes players can pick, homebrew ones too. Read again whenever a screen loads the cards.
  const startCards = loadCards(cardsFile, exampleCardsFile)
  setHeroTemplates(startCards.heroes)
  // In the Pi's log too, so a card the app can't find shows up after an update.
  for (const line of [...startCards.problems, ...missingCards(startCards)]) console.warn(`Card check: ${line}`)
  // Which build of the screens this server hands out. A screen that loaded an older
  // build reloads itself when it sees a new one, so an update reaches the iPads.
  const indexFile = join(staticDir, 'index.html')
  const build = existsSync(indexFile) ? createHash('sha1').update(readFileSync(indexFile)).digest('hex').slice(0, 12) : null
  const server = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok')
      return
    }
    if (req.url === '/cards.json') {
      const cards = loadCards(cardsFile, exampleCardsFile)
      setHeroTemplates(cards.heroes)
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(cards))
      return
    }
    if (req.url === '/art.json') {
      res
        .writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
        .end(JSON.stringify(listArt(artDir)))
      return
    }
    if (req.url === '/sounds.json') {
      res
        .writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
        .end(JSON.stringify(listSounds(soundsDir)))
      return
    }
    if (req.url.startsWith('/sounds/')) {
      serveSound(soundsDir, req, res)
      return
    }
    if (req.url === '/sound-takes.json' || req.url.startsWith('/sound-takes/')) {
      handleTakes(soundsDir, req, res)
      return
    }
    if (req.url.startsWith('/art/')) {
      handleArt(artDir, req, res, () => broadcastRaw(JSON.stringify({ type: 'art' })))
      return
    }
    if (req.url === '/games.json') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(gameList()))
      return
    }
    if (req.url === '/records.json') {
      res
        .writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
        .end(JSON.stringify(recordsReply(records)))
      return
    }
    if (ideaBox.handle(req, res)) return
    if (narrator.handle(req, res)) return
    serveStatic(staticDir, req, res)
  })

  const wss = new WebSocketServer({ server, path: '/ws' })
  const screensIn = (r) => [...wss.clients].filter((c) => c.room === r)

  const stateMessage = (r) =>
    // `now` lets each screen tell how old a moment is by the Pi's clock, not its own.
    JSON.stringify({
      type: 'state',
      state: r.state,
      game: { id: r.id, name: gameName(r.id) },
      undo: r.history.at(-1)?.label ?? null,
      undoDepth: r.history.length,
      instance,
      build,
      now: Date.now(),
    })

  function broadcastRaw(message, clients = wss.clients) {
    for (const client of clients) {
      if (client.readyState === client.OPEN) client.send(message)
    }
  }
  const broadcast = (r) => broadcastRaw(stateMessage(r), screensIn(r))

  // Which seats have a screen open in a game right now, so a table screen knows
  // whether the projector is there to play the sound.
  const screensMessage = (r) =>
    JSON.stringify({ type: 'screens', seats: [...new Set(screensIn(r).map((c) => c.seat).filter(Boolean))].sort() })
  const broadcastScreens = (r) => broadcastRaw(screensMessage(r), screensIn(r))

  function gameList() {
    const games = [FAMILY_GAME, ...otherGames.map((g) => g.id)].map((id) => gameSummary(room(id), gameName(id), screensIn(room(id)).length))
    return { games, finished: finished.map(({ id, name, finishedAt }) => ({ id, name, finishedAt })), max: MAX_GAMES, finishedDays: FINISHED_DAYS }
  }

  function saveList(games, done) {
    writeSave(gameListFile, { games, finished: done })
    otherGames = games
    finished = done
  }

  // Finished games older than FINISHED_DAYS are gone for good.
  function clearOldFinished() {
    const cutoff = Date.now() - FINISHED_DAYS * DAY_MS
    const old = finished.filter((g) => g.finishedAt < cutoff)
    if (old.length === 0) return
    for (const g of old) rmSync(join(finishedDir, `${g.id}.json`), { force: true })
    saveList(otherGames, finished.filter((g) => !old.includes(g)))
  }

  // Moves a game to the Finished list. Its screens go to the family game.
  function finishGame(id) {
    const game = otherGames.find((g) => g.id === id)
    if (!game) return
    mkdirSync(finishedDir, { recursive: true })
    if (existsSync(gameFile(id))) renameSync(gameFile(id), join(finishedDir, `${id}.json`))
    saveList(otherGames.filter((g) => g !== game), [...finished, { ...game, finishedAt: Date.now() }])
    const r = rooms.get(id)
    rooms.delete(id)
    const family = room(FAMILY_GAME)
    for (const client of r ? screensIn(r) : []) {
      client.room = family
      if (client.readyState === client.OPEN) client.send(stateMessage(family))
    }
    broadcastScreens(family)
  }

  // Brings a finished game back, if there's room for it.
  function bringBack(socket, id) {
    const game = finished.find((g) => g.id === id)
    if (!game) return
    if (otherGames.length + 1 >= MAX_GAMES) {
      socket.send(JSON.stringify({ type: 'new-game-refused', reason: 'full' }))
      return
    }
    const kept = join(finishedDir, `${id}.json`)
    if (existsSync(kept)) renameSync(kept, gameFile(id))
    const { finishedAt, ...back } = game
    saveList([...otherGames, back], finished.filter((g) => g !== game))
  }

  function renameGame(id, name) {
    if (!name || !otherGames.some((g) => g.id === id)) return
    saveList(otherGames.map((g) => (g.id === id ? { ...g, name } : g)), finished)
    for (const r of rooms.values()) if (r.id === id) broadcast(r)
  }

  // Changes to the list of games: start, rename, finish and bring back.
  function changeGames(socket, message) {
    if (message.type === 'new-game') {
      startGame(socket, message)
      return
    }
    try {
      if (message.type === 'rename-game') renameGame(message.id, cleanName(message.name))
      if (message.type === 'finish-game') finishGame(message.id)
      if (message.type === 'bring-back-game') bringBack(socket, message.id)
      clearOldFinished()
    } catch (error) {
      console.error('Could not change the list of games:', error.message)
    }
    broadcastGames()
  }
  // Tells every "Which game?" screen that the list changed.
  const broadcastGames = () => broadcastRaw(JSON.stringify({ type: 'games' }))

  function startGame(socket, message) {
    const requestId = typeof message.requestId === 'string' ? message.requestId.slice(0, 80) : null
    const name = cleanName(message.name)
    const refuse = (reason) => socket.send(JSON.stringify({ type: 'new-game-refused', requestId, reason }))
    if (!name) return refuse('name')
    if (otherGames.length + 1 >= MAX_GAMES) return refuse('full')
    const id = gameIdFor(name, [...otherGames, ...finished].map((g) => g.id))
    try {
      writeSave(gameFile(id), initialState)
      saveList([...otherGames, { id, name, createdAt: Date.now() }], finished)
    } catch (error) {
      console.error('Could not start a new game:', error.message)
      return refuse('save')
    }
    rooms.delete(id)
    room(id)
    socket.send(JSON.stringify({ type: 'game-created', requestId, id, name }))
    broadcastGames()
  }

  wss.on('connection', (socket, req) => {
    // A screen asks for its game in the address (/ws?game=coltons-solo). No game, or
    // one that isn't kept any more, means the family game.
    const asked = new URL(req.url, 'http://localhost').searchParams.get('game')
    socket.room = room(isGame(asked) ? asked : FAMILY_GAME)
    socket.send(stateMessage(socket.room))
    socket.send(screensMessage(socket.room))
    socket.on('close', () => {
      if (socket.seat) broadcastScreens(socket.room)
    })
    socket.on('message', (raw) => {
      let message
      try {
        message = JSON.parse(raw)
      } catch {
        return
      }
      if (message?.type === 'seat') {
        const seat = typeof message.seat === 'string' ? message.seat.slice(0, 40) : null
        if (seat !== (socket.seat ?? null)) {
          socket.seat = seat
          broadcastScreens(socket.room)
        }
        return
      }
      if (['new-game', 'rename-game', 'finish-game', 'bring-back-game'].includes(message?.type)) {
        changeGames(socket, message)
        return
      }
      if (message?.type !== 'action' || typeof message.action?.type !== 'string') return
      const action = message.action
      const r = socket.room
      // A screen keeps an action until the server says it got it, and sends it again after
      // a reconnect. Each action has an id, so one that arrived twice only counts once.
      const id = typeof message.id === 'string' ? message.id : null
      if (id) socket.send(JSON.stringify({ type: 'ack', id }))
      if (id && r.seenActions.has(id)) return
      if (id) {
        r.seenActions.add(id)
        if (r.seenActions.size > SEEN_LIMIT) r.seenActions.delete(r.seenActions.values().next().value)
      }
      // Turning off the sound board's limits is only for trying sounds on the test copy.
      if (action.type === 'SET_SOUNDBOARD_UNLIMITED' && !instance) return
      if (action.type === 'UNDO') {
        // Two people tapping Undo at once both saw the same history depth; only
        // the first tap counts, so one tap never undoes two changes.
        if (action.depth !== r.history.length) return
        const previous = r.history.pop()
        if (!previous) return
        // Clear the moment so screens don't replay an old celebration.
        // The sound board isn't part of Undo either, so Undo can't hand out more taps.
        r.state = { ...previous.state, moment: null, soundboard: r.state.soundboard }
        // A computer ally would take the same step again straight away: it waits after an Undo
        // until someone lets it go on (src/ally/).
        if (r.state.status === 'playing' && r.state.heroes?.some((h) => h.ally)) r.state = { ...r.state, allyPaused: true }
      } else {
        const next = gameReducer(r.state, action)
        if (next === r.state) return
        // Dice rolls can't be undone (no rerolling a bad roll), and neither can
        // picking heroes, since each iPad changes its own pick freely, or the sound board.
        if (!NOT_UNDOABLE.has(action.type)) {
          r.history.push({ state: r.state, label: describeAction(r.state, action) })
          if (r.history.length > UNDO_LIMIT) r.history.shift()
        }
        r.state = next
      }
      try {
        writeSave(r.file, r.state)
        r.updatedAt = Date.now()
      } catch (error) {
        console.error('Could not save the game:', error.message)
      }
      updateRecords(r.state)
      broadcast(r)
    })
  })

  return new Promise((resolve) => {
    server.listen(port, () => {
      // Villain lines get recorded in the background, so they're ready before game night.
      if (warmNarrator) narrator.warmUp?.()
      resolve({
        port: server.address().port,
        close: () =>
          new Promise((done) => {
            for (const client of wss.clients) client.terminate()
            wss.close()
            server.close(done)
          }),
      })
    })
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer().then(({ port }) => console.log(`Ashardalon Companion listening on port ${port}`))
}
