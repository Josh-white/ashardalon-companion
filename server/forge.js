// The 🛠️ Hero Builder's saved figures (src/components/HeroBuilder.jsx). Each is a small
// recipe (src/data/forge.js) that the iPads build into a 3D figure themselves; the Pi only
// keeps the list, in cards/workshop/figures.json (the Model Workshop's folder, which is
// already writable in the container).
//
//   GET    /forge.json      every saved figure, newest first: { figures: [{ id, recipe, savedAt }] }
//   POST   /forge           a new figure (the recipe), answers { id, recipe, savedAt }
//   POST   /forge/<id>      saves over a figure
//   DELETE /forge/<id>      throws a figure away
//
// Friends from outside can't use it, like the Model Workshop.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { readBody } from './readBody.js'
import { cleanRecipe, MAX_FIGURES } from '../src/data/forge.js'

const ID = /^[a-z0-9-]{1,80}$/

export function isForgePath(path) {
  return path === '/forge.json' || path === '/forge' || path.startsWith('/forge/')
}

export function createForge(dir) {
  const file = join(dir, 'figures.json')
  let figures = []
  try {
    if (existsSync(file)) figures = JSON.parse(readFileSync(file, 'utf8')).figures ?? []
  } catch (error) {
    console.error(`Hero Builder: could not read ${file}:`, error.message)
  }
  function save(next) {
    mkdirSync(dir, { recursive: true })
    const temp = `${file}.tmp`
    writeFileSync(temp, JSON.stringify({ figures: next }, null, 1))
    renameSync(temp, file)
    figures = next
  }
  const send = (res, status, body) => res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(body))
  const failed = (res, error) => {
    // Most likely cards/workshop on the Pi belongs to root (made by Docker, not by auto-update.sh).
    console.error('Hero Builder: could not save:', error.message)
    send(res, 500, { error: "Couldn't save it on the Pi. Ask Dad to check it." })
  }

  async function respond(req, res) {
    const path = decodeURIComponent(req.url.split('?')[0])
    if (path === '/forge.json' && req.method === 'GET') return send(res, 200, { figures: [...figures].reverse() })
    const readRecipe = async () => cleanRecipe(JSON.parse((await readBody(req, 32 * 1024)).toString('utf8') || '{}'))
    if (path === '/forge' && req.method === 'POST') {
      if (figures.length >= MAX_FIGURES) return send(res, 507, { error: 'There are too many saved heroes. Throw some away first.' })
      const recipe = await readRecipe()
      const saved = { id: `${new Date().toISOString().slice(0, 10)}-${randomBytes(3).toString('hex')}`, recipe, savedAt: new Date().toISOString() }
      try {
        save([...figures, saved])
      } catch (error) {
        return failed(res, error)
      }
      return send(res, 201, saved)
    }
    const id = path.slice('/forge/'.length)
    if (!ID.test(id)) return send(res, 404, { error: 'No such hero.' })
    const index = figures.findIndex((f) => f.id === id)
    if (index === -1) return send(res, 404, { error: 'That hero was thrown away.' })
    if (req.method === 'POST') {
      const saved = { ...figures[index], recipe: await readRecipe(), savedAt: new Date().toISOString() }
      try {
        // Saved last, so it comes first in the list.
        save([...figures.filter((_, n) => n !== index), saved])
      } catch (error) {
        return failed(res, error)
      }
      return send(res, 200, saved)
    }
    if (req.method === 'DELETE') {
      try {
        save(figures.filter((_, n) => n !== index))
      } catch (error) {
        return failed(res, error)
      }
      return send(res, 200, { ok: true })
    }
    send(res, 405, { error: 'Not allowed.' })
  }

  return {
    // True when the request was for the Hero Builder (and it has been answered).
    handle(req, res) {
      if (!isForgePath(req.url.split('?')[0])) return false
      respond(req, res).catch((error) => {
        console.error('Hero Builder:', error.message)
        if (!res.headersSent) send(res, 400, { error: 'Could not read that.' })
      })
      return true
    },
  }
}
