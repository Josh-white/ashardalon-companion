// Serves the built app and keeps the one shared game. Every iPad connects over
// a WebSocket, sends actions, and receives the new state after each change.
import { createReadStream, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'
import { normalizeCardFile } from '../src/data/cards.js'
import { gameReducer, initialState, SAVE_VERSION } from '../src/state/game.js'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

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
    return { source, powers: [], problems: [`Could not read ${source === 'custom' ? 'cards.json' : 'the example cards'}: ${error.message}`] }
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

export function startServer({
  port = Number(process.env.PORT ?? 3000),
  saveFile = process.env.SAVE_FILE ?? join(ROOT, 'data', 'game.json'),
  staticDir = join(ROOT, 'dist'),
  cardsFile = process.env.CARDS_FILE ?? join(ROOT, 'cards', 'cards.json'),
  exampleCardsFile = join(ROOT, 'cards', 'cards.example.json'),
} = {}) {
  let state = loadSavedGame(saveFile)

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

  const broadcast = () => {
    const message = JSON.stringify({ type: 'state', state })
    for (const client of wss.clients) {
      if (client.readyState === client.OPEN) client.send(message)
    }
  }

  wss.on('connection', (socket) => {
    socket.send(JSON.stringify({ type: 'state', state }))
    socket.on('message', (raw) => {
      let message
      try {
        message = JSON.parse(raw)
      } catch {
        return
      }
      if (message?.type !== 'action' || typeof message.action?.type !== 'string') return
      const next = gameReducer(state, message.action)
      if (next === state) return
      state = next
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
