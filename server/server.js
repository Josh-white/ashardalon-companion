// Serves the built app and keeps the one shared game. Every iPad connects over
// a WebSocket, sends actions, and receives the new state after each change.
import { createReadStream, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'
import { normalizeCardFile } from '../src/data/cards.js'
import { describeAction } from '../src/state/describeAction.js'
import { gameReducer, initialState, SAVE_VERSION } from '../src/state/game.js'

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
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
}

export function loadSavedGame(file) {
  try {
    const saved = JSON.parse(readFileSync(file, 'utf8'))
    if (saved && saved.version === SAVE_VERSION) return saved
  } catch {
    // No save yet, or a broken one: start fresh.
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
    return { source, powers: [], abilities: [], monsters: [], encounters: [], treasures: [], problems: [`Could not read ${source === 'custom' ? 'cards.json' : 'the example cards'}: ${error.message}`] }
  }
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

const NOT_UNDOABLE = new Set(['ROLL_DIE', 'ATTACH_MONSTER_CARDS', 'CLAIM_HERO', 'RELEASE_HERO', 'SET_LOBBY_PLAYER', 'SET_LOBBY_PICK', 'SET_LOBBY_READY'])

export function startServer({
  port = Number(process.env.PORT ?? 3000),
  saveFile = process.env.SAVE_FILE ?? join(ROOT, 'data', 'game.json'),
  staticDir = join(ROOT, 'dist'),
  cardsFile = process.env.CARDS_FILE ?? join(ROOT, 'cards', 'cards.json'),
  exampleCardsFile = join(ROOT, 'cards', 'cards.example.json'),
  // Set on the test copy so every screen shows it isn't the real game.
  instance = process.env.INSTANCE_LABEL || null,
} = {}) {
  let state = loadSavedGame(saveFile)
  // Earlier versions of the game, newest last, each with what changed after it.
  const history = []

  const server = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok')
      return
    }
    if (req.url === '/cards.json') {
      res
        .writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
        .end(JSON.stringify(loadCards(cardsFile, exampleCardsFile)))
      return
    }
    serveStatic(staticDir, req, res)
  })

  const wss = new WebSocketServer({ server, path: '/ws' })

  const stateMessage = () =>
    JSON.stringify({ type: 'state', state, undo: history.at(-1)?.label ?? null, undoDepth: history.length, instance })

  const broadcast = () => {
    const message = stateMessage()
    for (const client of wss.clients) {
      if (client.readyState === client.OPEN) client.send(message)
    }
  }

  wss.on('connection', (socket) => {
    socket.send(stateMessage())
    socket.on('message', (raw) => {
      let message
      try {
        message = JSON.parse(raw)
      } catch {
        return
      }
      if (message?.type !== 'action' || typeof message.action?.type !== 'string') return
      const action = message.action
      if (action.type === 'UNDO') {
        // Two people tapping Undo at once both saw the same history depth; only
        // the first tap counts, so one tap never undoes two changes.
        if (action.depth !== history.length) return
        const previous = history.pop()
        if (!previous) return
        // Clear the moment so screens don't replay an old celebration.
        state = { ...previous.state, moment: null }
      } else {
        const next = gameReducer(state, action)
        if (next === state) return
        // Dice rolls can't be undone (no rerolling a bad roll), and neither can
        // picking heroes, since each iPad changes its own pick freely.
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
