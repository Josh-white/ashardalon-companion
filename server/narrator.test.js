import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createNarrator } from './narrator.js'
import { startServer } from './server.js'

describe('narrator endpoint', () => {
  let dir
  let server
  let calls

  const start = async (apiKey) => {
    calls = []
    const fetchSpeech = async (url, options) => {
      calls.push({ url, options })
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 })
    }
    server = await startServer({
      port: 0,
      saveFile: join(dir, 'game.json'),
      staticDir: dir,
      narrator: createNarrator({ apiKey, cacheDir: join(dir, 'narration'), fetchSpeech }),
    })
    return `http://localhost:${server.port}`
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ashardalon-narrator-'))
  })

  afterEach(async () => {
    await server?.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('says whether a key is set, without ever sending the key', async () => {
    const base = await start('secret-key')
    const body = await (await fetch(`${base}/narrate`)).text()
    expect(JSON.parse(body)).toEqual({ enabled: true })
    expect(body).not.toContain('secret-key')
  })

  it('is off without a key', async () => {
    const base = await start(null)
    expect(await (await fetch(`${base}/narrate`)).json()).toEqual({ enabled: false })
    expect((await fetch(`${base}/narrate?text=Hello`)).status).toBe(503)
    expect(calls).toHaveLength(0)
  })

  it('turns a line into speech once and serves it from the cache after', async () => {
    const base = await start('secret-key')
    const first = await fetch(`${base}/narrate?text=${encodeURIComponent('A Kobold appears!')}`)
    expect(first.status).toBe(200)
    expect(first.headers.get('content-type')).toBe('audio/mpeg')
    expect([...new Uint8Array(await first.arrayBuffer())]).toEqual([1, 2, 3])
    expect(calls[0].options.headers['xi-api-key']).toBe('secret-key')
    expect(JSON.parse(calls[0].options.body).text).toBe('A Kobold appears!')

    await fetch(`${base}/narrate?text=${encodeURIComponent('A Kobold appears!')}`)
    expect(calls).toHaveLength(1)
    expect(readdirSync(join(dir, 'narration'))).toHaveLength(1)
  })

  it('refuses very long lines', async () => {
    const base = await start('secret-key')
    expect((await fetch(`${base}/narrate?text=${'a'.repeat(500)}`)).status).toBe(413)
    expect(calls).toHaveLength(0)
  })
})
