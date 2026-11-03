// The Model Workshop (src/data/workshop.js): the players' requests for their own 3D
// figures, and Claude's pictures back. Everything lives in one folder on the Pi,
// cards/workshop (mounted writable into the container, like cards/sounds):
//
//   requests.json          what the players asked for and their answers (written here)
//   <id>/reply.json        Claude's rounds of pictures, written by whoever builds it:
//                          { "rounds": [{ "note": "…", "pictures": ["front.png"], "at": "…" }],
//                            "inGame": false }
//   <id>/<picture>.png     the pictures each round names
//
// So a build can be answered by copying files into the folder (scripts/models/WORKSHOP.md),
// with no change to the game itself.
//
//   GET    /workshop.json              every request with its rounds, newest first
//   POST   /workshop                   { idea, from, kind, colors, size, holds, attack }
//   POST   /workshop/<id>              { love: true } or { change: "…" } for the latest pictures,
//                                      or { tweaks } from the 🎨 Tweak panel,
//                                      or { useInGame: true|false } for a loved model (one per player)
//   GET    /workshop/<id>/<name>.glb   a round's 3D model ("model": "model-3.glb" in a round)
//   DELETE /workshop/<id>              takes a request off the list: it's only hidden, so
//                                      { hidden: false } brings it back with its tweaks
//   GET    /workshop/<id>/<name>.png   one of the pictures
//
// Friends from outside can't use it: it's the family's workshop.
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync, createReadStream } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { readBody } from './readBody.js'
import { cleanRequest, cleanTweaks, lovedRound, MAX_CHANGE_LENGTH, MAX_REQUESTS, playerKey } from '../src/data/workshop.js'

const ID = /^[a-z0-9-]{1,80}$/
const PICTURE = /^[a-zA-Z0-9_-]{1,60}\.(png|jpg)$/
// A round's 3D model, for the 🎨 Tweak panel.
const MODEL = /^[a-zA-Z0-9_-]{1,60}\.glb$/
const TYPES = { png: 'image/png', jpg: 'image/jpeg', glb: 'model/gltf-binary' }

const slug = (text) =>
  String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)

// Easy to read in a folder listing: 2026-11-03-colton-lava-knight-1a2b.
export function requestId(request, now = new Date()) {
  const words = slug(request.idea.split(/\s+/).slice(0, 4).join(' '))
  return [now.toISOString().slice(0, 10), slug(request.from) || 'player', words, randomBytes(2).toString('hex')].filter(Boolean).join('-')
}

function readJsonFile(file, fallback) {
  try {
    if (!existsSync(file)) return fallback
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    console.error(`Model Workshop: could not read ${file}:`, error.message)
    return fallback
  }
}

// Claude's rounds for one request, keeping only pictures that are really there.
export function loadReply(dir, id) {
  const reply = readJsonFile(join(dir, id, 'reply.json'), {})
  const rounds = (Array.isArray(reply.rounds) ? reply.rounds : []).map((r) => ({
    note: typeof r?.note === 'string' ? r.note : '',
    at: typeof r?.at === 'string' ? r.at : null,
    pictures: (Array.isArray(r?.pictures) ? r.pictures : []).filter((p) => typeof p === 'string' && PICTURE.test(p) && existsSync(join(dir, id, p))),
    model: typeof r?.model === 'string' && MODEL.test(r.model) && existsSync(join(dir, id, r.model)) ? r.model : null,
  }))
  return { rounds, inGame: Boolean(reply.inGame) }
}

// `onUse(key)` hears when a player turns a model on for the game.
export function createWorkshop(dir, { onUse } = {}) {
  const file = join(dir, 'requests.json')
  let requests = readJsonFile(file, {}).requests ?? []
  // Writes `next` and only then keeps it, so a save that fails (cards/workshop belonging to
  // root, a full disk) leaves the list as the Pi really has it.
  function save(next) {
    mkdirSync(dir, { recursive: true })
    const temp = `${file}.tmp`
    writeFileSync(temp, JSON.stringify({ requests: next }, null, 1))
    renameSync(temp, file)
    requests = next
  }
  const send = (res, status, body) =>
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(body))
  const withReply = (r) => ({ ...r, ...loadReply(dir, r.id) })

  function servePicture(res, id, name) {
    const path = join(dir, id, name)
    let size
    try {
      size = statSync(path).size
    } catch {
      return send(res, 404, { error: 'No such picture.' })
    }
    res.writeHead(200, { 'Content-Type': TYPES[name.split('.').pop()], 'Content-Length': size, 'Cache-Control': 'no-cache' })
    createReadStream(path).pipe(res)
  }

  async function respond(req, res) {
    const path = decodeURIComponent(req.url.split('?')[0])
    if (path === '/workshop.json' && req.method === 'GET') {
      return send(res, 200, { requests: [...requests].reverse().map(withReply) })
    }
    const readJson = async () => JSON.parse((await readBody(req, 16 * 1024)).toString('utf8') || '{}')
    if (path === '/workshop' && req.method === 'POST') {
      const request = cleanRequest(await readJson())
      if (!request) return send(res, 400, { error: 'Tell Claude what to make first.' })
      if (requests.length >= MAX_REQUESTS) return send(res, 507, { error: 'The workshop is full.' })
      const saved = { id: requestId(request), ...request, sentAt: new Date().toISOString(), answers: [] }
      save([...requests, saved])
      return send(res, 201, withReply(saved))
    }
    const [id, name, extra] = path.slice('/workshop/'.length).split('/')
    if (!ID.test(id ?? '') || extra !== undefined) return send(res, 404, { error: 'No such model.' })
    if (name !== undefined) {
      if (!(PICTURE.test(name) || MODEL.test(name)) || (req.method !== 'GET' && req.method !== 'HEAD')) return send(res, 404, { error: 'No such picture.' })
      return servePicture(res, id, name)
    }
    const index = requests.findIndex((r) => r.id === id)
    if (index === -1) return send(res, 404, { error: 'No such model.' })
    if (req.method === 'POST') {
      const body = await readJson()
      if (body.tweaks !== undefined) {
        // The player's own 🎨 tweaks: saved as they are, without answering the pictures.
        const tweaks = cleanTweaks(body.tweaks)
        save(requests.map((r, n) => (n === index ? { ...r, tweaks, tweakedAt: new Date().toISOString() } : r)))
        return send(res, 200, withReply(requests[index]))
      }
      const { rounds } = loadReply(dir, id)
      if (body.hidden === false) {
        save(requests.map((r, n) => (n === index ? { ...r, hidden: false } : r)))
        return send(res, 200, withReply(requests[index]))
      }
      if (body.useInGame !== undefined) {
        // The player's hero wears it on the 3D board. Only a loved model with its 3D file, and
        // only one per player: turning one on turns their others off.
        const on = Boolean(body.useInGame)
        const mine = requests[index]
        const key = playerKey(mine.from)
        if (on && !key) return send(res, 400, { error: 'This model has no name on it, so the game does not know whose hero wears it.' })
        if (on && !lovedRound({ ...mine, rounds })?.model) return send(res, 409, { error: 'Tap Love it first.' })
        save(requests.map((r, n) => (n === index ? { ...r, useInGame: on } : on && r.useInGame && playerKey(r.from) === key ? { ...r, useInGame: false } : r)))
        if (on) onUse?.(key)
        return send(res, 200, withReply(requests[index]))
      }
      if (!rounds.length) return send(res, 409, { error: 'There are no pictures to answer yet.' })
      const change = typeof body.change === 'string' ? body.change.trim().slice(0, MAX_CHANGE_LENGTH) : ''
      if (!body.love && !change) return send(res, 400, { error: 'Say what to change.' })
      const answer = { round: rounds.length, ...(body.love ? { love: true } : { change }), at: new Date().toISOString() }
      const answers = [...(requests[index].answers ?? []).filter((a) => a.round !== answer.round), answer]
      save(requests.map((r, n) => (n === index ? { ...r, answers } : r)))
      return send(res, 200, withReply(requests[index]))
    }
    if (req.method === 'DELETE') {
      // Hidden, not deleted: a player who changes their mind can bring it back. It comes out
      // of the game too, so bringing it back can't leave two figures on for one player.
      save(requests.map((r, n) => (n === index ? { ...r, hidden: true, useInGame: false } : r)))
      return send(res, 200, { ok: true })
    }
    send(res, 405, { error: 'Not allowed.' })
  }

  return {
    // A player turned on another figure (a 🛠️ Hero Builder one): this one comes off.
    stopUsing(key) {
      if (!requests.some((r) => r.useInGame && playerKey(r.from) === key)) return
      try {
        save(requests.map((r) => (r.useInGame && playerKey(r.from) === key ? { ...r, useInGame: false } : r)))
      } catch (error) {
        console.error('Model Workshop: could not save:', error.message)
      }
    },
    // True when the request was for the workshop (and it has been answered).
    handle(req, res) {
      const path = req.url.split('?')[0]
      if (path !== '/workshop.json' && path !== '/workshop' && !path.startsWith('/workshop/')) return false
      respond(req, res).catch((error) => {
        console.error('Model Workshop:', error.message)
        if (res.headersSent) return
        // A file error (it has a code, like EACCES) is the Pi failing to save, most likely
        // cards/workshop belonging to root (made by Docker, not by auto-update.sh).
        if (error.code) send(res, 500, { error: "The workshop couldn't save it on the Pi. Ask Dad to check it." })
        else send(res, 400, { error: 'Could not read that.' })
      })
      return true
    },
  }
}
