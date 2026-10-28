// Serves the built app and keeps the one shared game. Every iPad connects over
// a WebSocket, sends actions, and receives the new state after each change.
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { dirname, extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'
import { ART_NAME, MAX_ART_BYTES } from '../src/data/art.js'
import { createNarrator } from './narrator.js'
import { auditionList, pickTake, takesDir } from './soundTakes.js'
import { normalizeCardFile } from '../src/data/cards.js'
import { setHeroTemplates } from '../src/data/heroes.js'
import { describeAction } from '../src/state/describeAction.js'
import { gameReducer, initialState } from '../src/state/game.js'
import { migrateSave } from '../src/state/saves.js'

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
    return { source, powers: [], abilities: [], monsters: [], villains: [], encounters: [], adventures: [], chambers: [], treasures: [], villagers: [], boons: [], treasureTokens: [], problems: [`Could not read ${source === 'custom' ? 'cards.json' : 'the example cards'}: ${error.message}`] }
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

export function listSounds(soundsDir) {
  const sounds = {}
  try {
    for (const file of readdirSync(soundsDir)) {
      const [, name] = file.match(SOUND_FILE) ?? []
      if (name) sounds[name] = { file, v: Math.round(statSync(join(soundsDir, file)).mtimeMs) }
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

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(new Error('too big'))
        req.destroy()
      } else chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
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

const SEEN_LIMIT = 500
const NOT_UNDOABLE = new Set(['ROLL_DIE', 'ATTACH_MONSTER_CARDS', 'UPDATE_ENCOUNTER_CARDS', 'CLAIM_HERO', 'RELEASE_HERO', 'SET_LOBBY_PLAYER', 'SET_LOBBY_PICK', 'SET_LOBBY_READY', 'PLAY_BOARD_SOUND', 'SET_SOUNDBOARD_OFF', 'SET_SOUNDBOARD_UNLIMITED', 'FIRST_ROLL_DONE'])

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
  let state = loadSavedGame(saveFile)
  // The heroes players can pick, homebrew ones too. Read again whenever a screen loads the cards.
  setHeroTemplates(loadCards(cardsFile, exampleCardsFile).heroes)
  // Which build of the screens this server hands out. A screen that loaded an older
  // build reloads itself when it sees a new one, so an update reaches the iPads.
  const indexFile = join(staticDir, 'index.html')
  const build = existsSync(indexFile) ? createHash('sha1').update(readFileSync(indexFile)).digest('hex').slice(0, 12) : null
  // Earlier versions of the game, newest last, each with what changed after it.
  const history = []
  // The ids of the latest actions, so a resent one isn't applied twice.
  const seenActions = new Set()

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
    if (narrator.handle(req, res)) return
    serveStatic(staticDir, req, res)
  })

  const wss = new WebSocketServer({ server, path: '/ws' })

  const stateMessage = () =>
    // `now` lets each screen tell how old a moment is by the Pi's clock, not its own.
    JSON.stringify({ type: 'state', state, undo: history.at(-1)?.label ?? null, undoDepth: history.length, instance, build, now: Date.now() })

  function broadcastRaw(message) {
    for (const client of wss.clients) {
      if (client.readyState === client.OPEN) client.send(message)
    }
  }
  const broadcast = () => broadcastRaw(stateMessage())

  // Which seats have a screen open right now, so a table screen knows whether the
  // projector is there to play the sound.
  const screensMessage = () =>
    JSON.stringify({ type: 'screens', seats: [...new Set([...wss.clients].map((c) => c.seat).filter(Boolean))].sort() })
  const broadcastScreens = () => broadcastRaw(screensMessage())

  wss.on('connection', (socket) => {
    socket.send(stateMessage())
    socket.send(screensMessage())
    socket.on('close', () => {
      if (socket.seat) broadcastScreens()
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
          broadcastScreens()
        }
        return
      }
      if (message?.type !== 'action' || typeof message.action?.type !== 'string') return
      const action = message.action
      // A screen keeps an action until the server says it got it, and sends it again after
      // a reconnect. Each action has an id, so one that arrived twice only counts once.
      const id = typeof message.id === 'string' ? message.id : null
      if (id) socket.send(JSON.stringify({ type: 'ack', id }))
      if (id && seenActions.has(id)) return
      if (id) {
        seenActions.add(id)
        if (seenActions.size > SEEN_LIMIT) seenActions.delete(seenActions.values().next().value)
      }
      // Turning off the sound board's limits is only for trying sounds on the test copy.
      if (action.type === 'SET_SOUNDBOARD_UNLIMITED' && !instance) return
      if (action.type === 'UNDO') {
        // Two people tapping Undo at once both saw the same history depth; only
        // the first tap counts, so one tap never undoes two changes.
        if (action.depth !== history.length) return
        const previous = history.pop()
        if (!previous) return
        // Clear the moment so screens don't replay an old celebration.
        // The sound board isn't part of Undo either, so Undo can't hand out more taps.
        state = { ...previous.state, moment: null, soundboard: state.soundboard }
      } else {
        const next = gameReducer(state, action)
        if (next === state) return
        // Dice rolls can't be undone (no rerolling a bad roll), and neither can
        // picking heroes, since each iPad changes its own pick freely, or the sound board.
        if (!NOT_UNDOABLE.has(action.type)) {
          history.push({ state, label: describeAction(state, action) })
          if (history.length > UNDO_LIMIT) history.shift()
        }
        state = next
      }
      try {
        writeSave(saveFile, state)
      } catch (error) {
        console.error('Could not save the game:', error.message)
      }
      broadcast()
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
