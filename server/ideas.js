// The ideas box: ideas and feedback the players send from their iPads, kept in
// ideas.json next to the saved games (so the nightly backup picks it up). Nothing
// leaves the Pi. The #ideas page reads them and marks them done.
//
//   GET    /ideas.json        every idea, newest first
//   POST   /ideas             { text, from }  adds one
//   POST   /ideas/<id>        { done }        marks one done (or not done)
//   DELETE /ideas/<id>                        takes one away
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname } from 'node:path'
import { readBody } from './readBody.js'

export const MAX_IDEA_LENGTH = 2000
export const MAX_FROM_LENGTH = 40
// Plenty for years of ideas; stops a stuck button filling the Pi's disk.
export const MAX_IDEAS = 1000

export function loadIdeas(file) {
  try {
    if (!existsSync(file)) return []
    const saved = JSON.parse(readFileSync(file, 'utf8'))
    return Array.isArray(saved.ideas) ? saved.ideas : []
  } catch (error) {
    console.error('Could not read the ideas box:', error.message)
    return []
  }
}

// What a sent idea looks like once it's tidied up, or null when there's nothing in it.
export function cleanIdea({ text, from } = {}) {
  const body = typeof text === 'string' ? text.trim().slice(0, MAX_IDEA_LENGTH) : ''
  if (!body) return null
  const who = typeof from === 'string' ? from.trim().slice(0, MAX_FROM_LENGTH) : ''
  return { text: body, from: who || null }
}

async function readJson(req, limit = 16 * 1024) {
  return JSON.parse((await readBody(req, limit)).toString('utf8') || '{}')
}

export function createIdeaBox(file) {
  let ideas = loadIdeas(file)
  function save() {
    mkdirSync(dirname(file), { recursive: true })
    const temp = `${file}.tmp`
    writeFileSync(temp, JSON.stringify({ ideas }, null, 1))
    renameSync(temp, file)
  }
  const send = (res, status, body) =>
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(body))

  async function respond(req, res) {
    const path = req.url.split('?')[0]
    if (path === '/ideas.json' && req.method === 'GET') {
      send(res, 200, { ideas: [...ideas].reverse() })
      return
    }
    if (path === '/ideas' && req.method === 'POST') {
      const idea = cleanIdea(await readJson(req))
      if (!idea) return send(res, 400, { error: 'Write your idea first.' })
      if (ideas.length >= MAX_IDEAS) return send(res, 507, { error: 'The ideas box is full.' })
      const saved = { id: randomUUID(), ...idea, sentAt: new Date().toISOString(), done: false }
      ideas = [...ideas, saved]
      save()
      return send(res, 201, saved)
    }
    const id = path.slice('/ideas/'.length)
    const index = ideas.findIndex((i) => i.id === id)
    if (index === -1) return send(res, 404, { error: 'No such idea.' })
    if (req.method === 'POST') {
      const { done } = await readJson(req)
      ideas = ideas.map((i, n) => (n === index ? { ...i, done: Boolean(done) } : i))
      save()
      return send(res, 200, ideas[index])
    }
    if (req.method === 'DELETE') {
      ideas = ideas.filter((_, n) => n !== index)
      save()
      return send(res, 200, { ok: true })
    }
    send(res, 405, { error: 'Not allowed.' })
  }

  return {
    // True when the request was for the ideas box (and it has been answered).
    handle(req, res) {
      const path = req.url.split('?')[0]
      if (path !== '/ideas.json' && path !== '/ideas' && !path.startsWith('/ideas/')) return false
      respond(req, res).catch((error) => {
        console.error('Ideas box:', error.message)
        if (!res.headersSent) send(res, 400, { error: 'Could not read that.' })
      })
      return true
    },
  }
}
