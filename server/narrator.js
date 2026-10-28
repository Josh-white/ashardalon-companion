// The narrator's voices. The projector asks for a line with GET /narrate?voice=herald&text=...,
// and this turns it into speech with ElevenLabs. The API key stays here on the
// Pi (ELEVENLABS_API_KEY in .env); no browser ever sees it. Each line is saved
// as an mp3, so a line heard before ("A Kobold appears!") costs nothing again.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// The cast, from the ElevenLabs voice library. Each can be swapped with a voice id
// in .env: ELEVENLABS_VOICE_ID (narrator), ELEVENLABS_VOICE_HERALD, _DANGER, _VILLAIN.
export const DEFAULT_VOICES = {
  narrator: 'JBFqnCBsd6RMkjVDRZzb', // George: warm storyteller
  herald: 'Xb7hH8MSUJpSv4BDjhvA', // Alice: bright, confident; cheers the heroes on
  danger: 'N2lVS1w4EtoT3dr4eOWO', // Callum: husky and menacing; monsters and bad news
  villain: '2EiwWnXFnvU5JabPnv8n', // Clyde: gravelly; villains speak for themselves
}
export const DEFAULT_VOICE = DEFAULT_VOICES.narrator

const castFromEnv = (env) => ({
  narrator: env.ELEVENLABS_VOICE_ID || DEFAULT_VOICES.narrator,
  herald: env.ELEVENLABS_VOICE_HERALD || DEFAULT_VOICES.herald,
  danger: env.ELEVENLABS_VOICE_DANGER || DEFAULT_VOICES.danger,
  villain: env.ELEVENLABS_VOICE_VILLAIN || DEFAULT_VOICES.villain,
})
export const DEFAULT_MODEL = 'eleven_multilingual_v2'
// Longer than any line the projector sends (the longest adventure story is
// about 750 characters); a guard against running up the bill.
export const MAX_TEXT = 1200

export function createNarrator({
  apiKey = process.env.ELEVENLABS_API_KEY || null,
  voices = castFromEnv(process.env),
  model = process.env.ELEVENLABS_MODEL || DEFAULT_MODEL,
  cacheDir,
  fetchSpeech = globalThis.fetch,
} = {}) {
  // Lines being fetched right now, so two screens asking at once cost one call.
  const pending = new Map()
  // Voices ElevenLabs refused since the server started; their lines go to the narrator.
  const refused = new Set()

  const speak = async (text, voice) => {
    const file = join(cacheDir, `${createHash('sha1').update(`${voice}|${model}|${text}`).digest('hex')}.mp3`)
    if (existsSync(file)) return readFileSync(file)
    if (pending.has(file)) return pending.get(file)
    const job = (async () => {
      const response = await fetchSpeech(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
        method: 'POST',
        headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify({
          text,
          model_id: model,
          voice_settings: { stability: 0.4, similarity_boost: 0.75, style: 0.35 },
        }),
      })
      if (!response.ok) {
        const reason = await response.text().catch(() => '')
        throw new Error(`ElevenLabs said ${response.status}: ${reason.slice(0, 200)}`)
      }
      const audio = Buffer.from(await response.arrayBuffer())
      mkdirSync(cacheDir, { recursive: true })
      writeFileSync(`${file}.tmp`, audio)
      renameSync(`${file}.tmp`, file)
      return audio
    })()
    pending.set(file, job)
    try {
      return await job
    } finally {
      pending.delete(file)
    }
  }

  // Handles /narrate (is the narrator set up?) and /narrate?text=... (the mp3).
  // Returns false for any other path.
  const handle = (req, res) => {
    const url = new URL(req.url, 'http://localhost')
    if (url.pathname !== '/narrate') return false
    const text = (url.searchParams.get('text') ?? '').trim()
    if (!text) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify({ enabled: Boolean(apiKey) }))
      return true
    }
    if (!apiKey) {
      res.writeHead(503, { 'Content-Type': 'text/plain' }).end('No ELEVENLABS_API_KEY on the server')
      return true
    }
    if (text.length > MAX_TEXT) {
      res.writeHead(413, { 'Content-Type': 'text/plain' }).end('Line too long')
      return true
    }
    // Only the cast's roles, so a page can't ask for any voice it likes.
    const role = url.searchParams.get('voice')
    const chosen = Object.hasOwn(voices, role ?? '') ? voices[role] : voices.narrator
    const voice = refused.has(chosen) ? voices.narrator : chosen
    // A voice this ElevenLabs account can't use falls back to the narrator, so the
    // line is still heard.
    const spoken = speak(text, voice).catch((error) => {
      if (voice === voices.narrator) throw error
      console.error(`Narrator: the ${role} voice failed, using the narrator instead.`, error.message)
      refused.add(voice)
      return speak(text, voices.narrator)
    })
    spoken.then(
      (audio) => res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'public, max-age=31536000, immutable' }).end(audio),
      (error) => {
        console.error('Narrator:', error.message)
        res.writeHead(502, { 'Content-Type': 'text/plain' }).end('The narrator could not speak')
      },
    )
    return true
  }

  return { enabled: Boolean(apiKey), handle }
}
