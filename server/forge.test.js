import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { createForge } from './forge.js'

let server
let dir
afterEach(() => {
  server?.close()
  if (dir) rmSync(dir, { recursive: true, force: true })
})

let used = []
async function start() {
  dir = mkdtempSync(join(tmpdir(), 'forge-'))
  used = []
  const forge = createForge(dir, { onUse: (key) => used.push(key) })
  start.forge = forge
  server = createServer((req, res) => {
    if (!forge.handle(req, res)) res.writeHead(404).end()
  })
  await new Promise((resolve) => server.listen(0, resolve))
  const base = `http://localhost:${server.address().port}`
  return (path, method = 'GET', body) =>
    fetch(base + path, { method, ...(body ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : {}) }).then(async (r) => ({ status: r.status, body: await r.json() }))
}

describe('Hero Builder figures on the Pi', () => {
  it('saves, lists, saves over and throws away figures', async () => {
    const call = await start()
    expect((await call('/forge.json')).body.figures).toEqual([])
    const made = await call('/forge', 'POST', { name: 'Lava Knight', from: 'Colton', size: 9, colors: { skin: '#ABCDEF', outfit: 'red' }, parts: { body: { id: 'armor', shape: { width: 1.3, evil: 'x' } }, hand: { id: '../bad' } }, extra: 1 })
    expect(made.status).toBe(201)
    const { id, recipe } = made.body
    expect(recipe.name).toBe('Lava Knight')
    expect(recipe.size).toBe(1.6)
    expect(recipe.colors.skin).toBe('#abcdef')
    expect(recipe.colors.outfit).toMatch(/^#/)
    expect(recipe.parts).toEqual({ body: { id: 'armor', shape: { width: 1.3 } } })
    expect(recipe.extra).toBeUndefined()

    await call('/forge', 'POST', { name: 'Second' })
    const changed = await call(`/forge/${id}`, 'POST', { ...recipe, name: 'Lava Knight 2' })
    expect(changed.body.id).toBe(id)
    const list = (await call('/forge.json')).body.figures
    expect(list.map((f) => f.recipe.name)).toEqual(['Lava Knight 2', 'Second'])
    expect(JSON.parse(readFileSync(join(dir, 'figures.json'), 'utf8')).figures).toHaveLength(2)

    expect((await call(`/forge/${id}`, 'DELETE')).status).toBe(200)
    expect((await call('/forge.json')).body.figures.map((f) => f.recipe.name)).toEqual(['Second'])
    expect((await call(`/forge/${id}`, 'POST', recipe)).status).toBe(404)
    expect((await call('/forge/..%2Fx', 'DELETE')).status).toBe(404)
  })

  it('keeps the figures after a restart', async () => {
    const call = await start()
    await call('/forge', 'POST', { name: 'Kept' })
    server.close()
    const again = createForge(dir)
    server = createServer((req, res) => again.handle(req, res))
    await new Promise((resolve) => server.listen(0, resolve))
    const r = await fetch(`http://localhost:${server.address().port}/forge.json`).then((x) => x.json())
    expect(r.figures[0].recipe.name).toBe('Kept')
  })

  it('puts one figure per player in the game', async () => {
    const call = await start()
    const a = (await call('/forge', 'POST', { name: 'A', from: 'Colton' })).body
    const b = (await call('/forge', 'POST', { name: 'B', from: ' colton ' })).body
    const nameless = (await call('/forge', 'POST', { name: 'C' })).body
    expect((await call(`/forge/${nameless.id}`, 'POST', { useInGame: true })).status).toBe(400)
    expect((await call(`/forge/${a.id}`, 'POST', { useInGame: true })).body.useInGame).toBe(true)
    await call(`/forge/${b.id}`, 'POST', { useInGame: true })
    let list = (await call('/forge.json')).body.figures
    expect(list.filter((f) => f.useInGame).map((f) => f.recipe.name)).toEqual(['B'])
    expect(used).toEqual(['colton', 'colton'])
    // Saving changes keeps it in the game; the name in it is unchanged.
    await call(`/forge/${b.id}`, 'POST', { ...b.recipe, name: 'B2' })
    list = (await call('/forge.json')).body.figures
    expect(list.find((f) => f.id === b.id).useInGame).toBe(true)
    // The player turned on a Model Workshop figure instead.
    start.forge.stopUsing('colton')
    list = (await call('/forge.json')).body.figures
    expect(list.some((f) => f.useInGame)).toBe(false)
  })
})
