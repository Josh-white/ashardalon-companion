import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createNarrator, DEFAULT_MODEL, DEFAULT_STABILITY, DEFAULT_VILLAIN_MODEL, DEFAULT_VOICES, speakable, villainLines } from './narrator.js'
import { startServer } from './server.js'

describe('narrator endpoint', () => {
  let dir
  let server
  let calls

  const start = async (apiKey, access = undefined) => {
    calls = []
    const fetchSpeech = async (url, options) => {
      calls.push({ url, options })
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 })
    }
    server = await startServer({
      port: 0,
      saveFile: join(dir, 'game.json'),
      staticDir: dir,
      warmNarrator: false,
      narrator: createNarrator({ apiKey, cacheDir: join(dir, 'narration'), fetchSpeech }),
      access,
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

  it('is off without a key or any recordings', async () => {
    const base = await start(null)
    expect(await (await fetch(`${base}/narrate`)).json()).toEqual({ enabled: false })
    expect((await fetch(`${base}/narrate?text=Hello`)).status).toBe(404)
    expect(calls).toHaveLength(0)
  })

  it("plays friends only lines already recorded, so they never spend the family's credits", async () => {
    const access = { who: async (req) => (req.headers['x-friend'] ? { family: false, email: 'amy@example.com' } : { family: true, email: null }) }
    const base = await start('secret-key', access)
    await fetch(`${base}/narrate?voice=herald&text=Hello`)
    expect(calls).toHaveLength(1)
    const friend = { headers: { 'x-friend': '1' } }
    expect((await fetch(`${base}/narrate?voice=herald&text=Hello`, friend)).status).toBe(200)
    expect((await fetch(`${base}/narrate?voice=herald&text=Something%20new`, friend)).status).toBe(404)
    expect(calls).toHaveLength(1)
  })

  it('keeps playing recorded lines after the key is removed', async () => {
    const withKey = await start('secret-key')
    await fetch(`${withKey}/narrate?voice=herald&text=Hello`)
    await server.close()
    const withoutKey = await start(null)
    expect(await (await fetch(`${withoutKey}/narrate`)).json()).toEqual({ enabled: true })
    expect((await fetch(`${withoutKey}/narrate?voice=herald&text=Hello`)).status).toBe(200)
    expect((await fetch(`${withoutKey}/narrate?voice=herald&text=Something%20new`)).status).toBe(404)
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

  it('speaks each role in its own voice, and only the cast', async () => {
    const base = await start('secret-key')
    await fetch(`${base}/narrate?voice=villain&text=Hello`)
    await fetch(`${base}/narrate?voice=herald&text=Hello`)
    await fetch(`${base}/narrate?voice=not-a-role&text=Hello`)
    await fetch(`${base}/narrate?voice=constructor&text=Hello`)
    const used = calls.map((c) => c.url.split('/text-to-speech/')[1].split('?')[0])
    expect(used[0]).toBe(DEFAULT_VOICES.villain)
    expect(used[1]).toBe(DEFAULT_VOICES.herald)
    // Anything else is the narrator; the last call is the same line again, from the cache.
    expect(used.slice(2)).toEqual([DEFAULT_VOICES.narrator])
  })

  it("falls back to the narrator when a voice isn't available", async () => {
    calls = []
    const fetchSpeech = async (url) => {
      calls.push({ url })
      return url.includes(DEFAULT_VOICES.villain)
        ? new Response('{"detail":{"status":"voice_not_found"}}', { status: 404 })
        : new Response(new Uint8Array([7]), { status: 200 })
    }
    server = await startServer({
      port: 0,
      saveFile: join(dir, 'game.json'),
      staticDir: dir,
      warmNarrator: false,
      narrator: createNarrator({ apiKey: 'k', cacheDir: join(dir, 'narration'), fetchSpeech }),
    })
    const response = await fetch(`http://localhost:${server.port}/narrate?voice=villain&text=Hello`)
    expect(response.status).toBe(200)
    expect(calls.map((c) => c.url.includes(DEFAULT_VOICES.narrator))).toEqual([false, true])
  })

  it('keeps stage directions only for models that act them out', () => {
    expect(speakable('[menacing] Kneel… [laughs] or burn!', 'eleven_v3')).toBe('[menacing] Kneel… [laughs] or burn!')
    expect(speakable('[menacing] Kneel… [laughs] or burn!', 'eleven_multilingual_v2')).toBe('Kneel… or burn!')
  })

  it('spells D&D names the way they are said', () => {
    expect(speakable('The otyugh rises. Duergar of Firestorm Peak!', 'eleven_v3')).toBe('The ot-yug rises. Dwer-gar of Firestorm Peak!')
  })

  it('records every villain line ahead of time, once', async () => {
    calls = []
    const fetchSpeech = async (url, options) => {
      calls.push({ url, options })
      return new Response(new Uint8Array([1]), { status: 200 })
    }
    const narrator = createNarrator({ apiKey: 'k', cacheDir: join(dir, 'narration'), fetchSpeech })
    await narrator.warmUp()
    const lines = villainLines()
    expect(calls).toHaveLength(lines.length)
    // Ashardalon speaks in his own voice.
    const ashardalon = calls.find((c) => JSON.parse(c.options.body).text.includes('lair of Ashardalon'))
    expect(ashardalon.url).toContain(DEFAULT_VOICES.ashardalon)
    await narrator.warmUp()
    expect(calls).toHaveLength(lines.length)
  })

  it('records every voice with v3 at the chosen stability', async () => {
    const base = await start('secret-key')
    await fetch(`${base}/narrate?voice=herald&text=Hello`)
    await fetch(`${base}/narrate?voice=ashardalon&text=Hello`)
    const bodies = calls.map((c) => JSON.parse(c.options.body))
    expect(bodies.map((b) => b.model_id)).toEqual([DEFAULT_MODEL, DEFAULT_VILLAIN_MODEL])
    expect(DEFAULT_MODEL).toBe('eleven_v3')
    expect(bodies.map((b) => b.voice_settings.stability)).toEqual([DEFAULT_STABILITY, DEFAULT_STABILITY])
  })

  it('records a line again when the stability changes', async () => {
    const made = []
    const fetchSpeech = async (url, options) => {
      made.push(JSON.parse(options.body).voice_settings.stability)
      return new Response(new Uint8Array([9]), { status: 200 })
    }
    for (const stability of [0.5, 0.3, 0.3]) {
      const narrator = createNarrator({ apiKey: 'k', stability, cacheDir: join(dir, 'narration'), fetchSpeech })
      await narrator.speakAs('herald', 'Hello')
    }
    expect(made).toEqual([0.5, 0.3])
  })

  it('reuses a line already recorded with another model', async () => {
    const made = []
    const fetchSpeech = async (url, options) => {
      made.push(JSON.parse(options.body).model_id)
      return new Response(new Uint8Array([9]), { status: 200 })
    }
    const ask = async (model) => {
      const narrator = createNarrator({ apiKey: 'k', model, cacheDir: join(dir, 'narration'), fetchSpeech })
      const one = await startServer({ port: 0, saveFile: join(dir, 'game.json'), staticDir: dir, warmNarrator: false, narrator })
      await fetch(`http://localhost:${one.port}/narrate?voice=herald&text=Hello`)
      await one.close()
    }
    await ask('eleven_flash_v2_5')
    await ask(DEFAULT_MODEL)
    expect(made).toEqual(['eleven_flash_v2_5'])
  })

  it('refuses very long lines', async () => {
    const base = await start('secret-key')
    expect((await fetch(`${base}/narrate?text=${'a'.repeat(1300)}`)).status).toBe(413)
    expect(calls).toHaveLength(0)
  })
})

describe('hero voices', () => {
  it('gives each hero in the box a voice of their own for reading cards', () => {
    const heroes = ['cleric', 'fighter', 'paladin', 'rogue', 'wizard'].map((key) => DEFAULT_VOICES[`hero_${key}`])
    expect(heroes.every(Boolean)).toBe(true)
    const others = Object.entries(DEFAULT_VOICES).filter(([role]) => !role.startsWith('hero_')).map(([, id]) => id)
    expect(new Set(heroes).size).toBe(5)
    expect(heroes.some((id) => others.includes(id))).toBe(false)
  })
})
