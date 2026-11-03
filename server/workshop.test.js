import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { startServer } from './server.js'
import { boneScales, cleanRequest, cleanTweaks, usedSlots, workshopStatus } from '../src/data/workshop.js'

describe('Model Workshop', () => {
  let dir
  let workshopDir
  let server
  let url
  const start = async () => {
    server = await startServer({ port: 0, saveFile: join(dir, 'game.json'), staticDir: dir, workshopDir, warmNarrator: false })
    url = `http://localhost:${server.port}`
  }
  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'ashardalon-workshop-'))
    workshopDir = join(dir, 'workshop')
    await start()
  })
  afterEach(async () => {
    await server.close()
    rmSync(dir, { recursive: true, force: true })
  })
  const post = (path, body) => fetch(url + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const list = async () => (await (await fetch(`${url}/workshop.json`)).json()).requests
  // What a thread does once it has built the model: pictures and a reply.json in the request's folder.
  const reply = (id, rounds, extra = {}) => {
    mkdirSync(join(workshopDir, id), { recursive: true })
    for (const r of rounds) for (const p of r.pictures) writeFileSync(join(workshopDir, id, p), 'png!')
    writeFileSync(join(workshopDir, id, 'reply.json'), JSON.stringify({ rounds, ...extra }))
  }

  it('saves a request with a readable id, then shows Claude\'s pictures and the answers', async () => {
    const res = await post('/workshop', { idea: ' A lava knight with a flaming axe ', from: 'Colton', kind: 'monster', colors: ['red', 'gold', 'nope'], size: 'big', holds: 'Axe', attack: 'swing' })
    expect(res.status).toBe(201)
    const sent = await res.json()
    expect(sent.id).toMatch(/^\d{4}-\d\d-\d\d-colton-a-lava-knight-with-[0-9a-f]{4}$/)
    expect(sent).toMatchObject({ idea: 'A lava knight with a flaming axe', from: 'Colton', kind: 'monster', colors: ['red', 'gold'], rounds: [] })
    expect(workshopStatus(sent)).toBe('waiting')
    expect(JSON.parse(readFileSync(join(workshopDir, 'requests.json'), 'utf8')).requests).toHaveLength(1)

    // No pictures yet: nothing to answer.
    expect((await post(`/workshop/${sent.id}`, { love: true })).status).toBe(409)

    reply(sent.id, [{ note: 'Here he is!', pictures: ['front.png', 'side.png', 'gone.png'] }])
    rmSync(join(workshopDir, sent.id, 'gone.png'))
    let [r] = await list()
    expect(r.rounds).toEqual([{ note: 'Here he is!', at: null, pictures: ['front.png', 'side.png'], model: null }])
    expect(workshopStatus(r)).toBe('look')
    const pic = await fetch(`${url}/workshop/${sent.id}/front.png`)
    expect(pic.headers.get('content-type')).toBe('image/png')
    expect(await pic.text()).toBe('png!')
    expect((await fetch(`${url}/workshop/${sent.id}/..%2Frequests.json`)).status).toBe(404)
    expect((await fetch(`${url}/workshop/${sent.id}/reply.json`)).status).toBe(404)

    expect((await post(`/workshop/${sent.id}`, {})).status).toBe(400)
    expect((await post(`/workshop/${sent.id}`, { change: 'Bigger horns' })).status).toBe(200)
    ;[r] = await list()
    expect(workshopStatus(r)).toBe('fixing')

    reply(sent.id, [{ note: 'Here he is!', pictures: ['front.png'] }, { note: 'Bigger horns!', pictures: ['front-2.png'] }])
    ;[r] = await list()
    expect(workshopStatus(r)).toBe('look')
    await post(`/workshop/${sent.id}`, { love: true })
    ;[r] = await list()
    expect(workshopStatus(r)).toBe('loved')
    expect(r.answers.map((a) => a.round)).toEqual([1, 2])

    reply(sent.id, [{ note: 'Bigger horns!', pictures: ['front-2.png'] }], { inGame: true })
    ;[r] = await list()
    expect(workshopStatus(r)).toBe('inGame')

    // Still there after a restart; taking it off the list leaves its folder.
    await server.close()
    await start()
    expect(await list()).toHaveLength(1)
    expect((await fetch(`${url}/workshop/${sent.id}`, { method: 'DELETE' })).status).toBe(200)
    expect(await list()).toEqual([])
    expect(readFileSync(join(workshopDir, sent.id, 'reply.json'), 'utf8')).toContain('inGame')
  })

  it('serves a round\'s 3D model and saves the player\'s tweaks without answering', async () => {
    const sent = await (await post('/workshop', { idea: 'Lizard mage', from: 'Colton' })).json()
    reply(sent.id, [{ note: 'Hi', pictures: ['front.png'] }])
    writeFileSync(join(workshopDir, sent.id, 'model-1.glb'), 'glTF!')
    writeFileSync(join(workshopDir, sent.id, 'reply.json'), JSON.stringify({ rounds: [{ note: 'Hi', pictures: ['front.png'], model: 'model-1.glb' }] }))
    let [r] = await list()
    expect(r.rounds[0].model).toBe('model-1.glb')
    const glb = await fetch(`${url}/workshop/${sent.id}/model-1.glb`)
    expect(glb.headers.get('content-type')).toBe('model/gltf-binary')
    const res = await post(`/workshop/${sent.id}`, { tweaks: { size: 9, head: 1.2, colors: { 3: '#AA00FF', x: '#fff', 4: 'red' } } })
    expect(res.status).toBe(200)
    ;[r] = await list()
    expect(r.tweaks).toEqual({ size: 1.25, head: 1.2, body: 1, colors: { 3: '#aa00ff' } })
    expect(workshopStatus(r)).toBe('look')
  })

  it('turns away an empty idea and unknown ids', async () => {
    expect((await post('/workshop', { idea: '  ', from: 'Easton' })).status).toBe(400)
    expect((await post('/workshop/nope', { love: true })).status).toBe(404)
    expect((await fetch(`${url}/workshop/NOPE!/front.png`)).status).toBe(404)
    expect(await list()).toEqual([])
  })

  it('finds the colours a figure uses and sizes its bones', () => {
    expect(usedSlots(new Float32Array([0.1, 0.5, 0.12, 0.5, 0.95, 0.5, 0.11, 0.5]), 10)).toEqual([1, 9])
    expect(boneScales({ head: 1.2, body: 0.8 }).head).toBeCloseTo(1.5)
    expect(cleanTweaks(undefined)).toEqual({ size: 1, head: 1, body: 1, colors: {} })
  })

  it('tidies what a screen sends', () => {
    expect(cleanRequest({ idea: 'x', kind: 'dragon', size: 'galaxy', attack: 'tickle', colors: 'red' })).toEqual({ idea: 'x', from: null, kind: 'hero', colors: [], size: null, holds: null, attack: null })
    expect(cleanRequest({ idea: 'x', colors: ['red', 'blue', 'green', 'pink'] }).colors).toEqual(['red', 'blue', 'green'])
  })
})
