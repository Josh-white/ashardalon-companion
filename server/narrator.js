// The narrator's voices. The projector asks for a line with GET /narrate?voice=herald&text=...,
// and this turns it into speech with ElevenLabs. The API key stays here on the
// Pi (ELEVENLABS_API_KEY in .env); no browser ever sees it. Each line is saved
// as an mp3, so a line heard before ("A Kobold appears!") costs nothing again.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { VILLAIN_DEFAULT, VILLAIN_LINES } from '../src/data/villainLines.js'

// The cast: ElevenLabs' built-in voices, which every plan can use. Each can be
// swapped with a voice id in .env: ELEVENLABS_VOICE_ID for the narrator, and
// ELEVENLABS_VOICE_<ROLE> for the rest (ELEVENLABS_VOICE_HERALD, _MEERAK, ...).
export const DEFAULT_VOICES = {
  narrator: 'JBFqnCBsd6RMkjVDRZzb', // George: warm storyteller
  herald: 'Xb7hH8MSUJpSbSDYk0k2', // Alice: clear and bright; cheers the heroes on
  danger: 'N2lVS1w4EtoT3dr4eOWO', // Callum: husky and menacing; monsters and bad news
  villain: 'pNInz6obpgDQGcFmaJgB', // Adam: dominant, firm; any villain without its own voice
  meerak: 'SOYHLrjzK2X1ezoPC6cr', // Harry: fierce warrior; the kobold dragonlord
  margrath: 'pqHfZKP75CvOlQylNhV4', // Bill: old and gruff; the duergar captain
  kraash: 'pNInz6obpgDQGcFmaJgB', // Adam: dominant, firm; the orc storm shaman
  ashardalon: 'nPczCjzI2devNBz1zQrb', // Brian: deep and resonant; the red dragon
  bellax: 'pFZP5JQG7iQjIQuC4Bku', // Lily: velvety; the gauth's whisper of madness
}
export const DEFAULT_VOICE = DEFAULT_VOICES.narrator

const castFromEnv = (env) =>
  Object.fromEntries(
    Object.entries(DEFAULT_VOICES).map(([role, id]) => [
      role,
      (role === 'narrator' ? env.ELEVENLABS_VOICE_ID : env[`ELEVENLABS_VOICE_${role.toUpperCase()}`]) || id,
    ]),
  )

// Every villain line, so they can be recorded before a villain ever shows up.
export const villainLines = () =>
  [...Object.values(VILLAIN_LINES), VILLAIN_DEFAULT].flatMap((lines) =>
    ['arrive', 'enraged', 'fall'].filter((when) => lines[when]).map((when) => ({ role: lines.voice, text: lines[when] })),
  )
// v3 acts out stage directions in the text, like [menacing] or [laughs].
export const DEFAULT_MODEL = 'eleven_v3'
// Older models read stage directions out loud, so they're taken out for those.
const actsTags = (model) => /^eleven_v[3-9]/.test(model)
export const speakable = (text, model) => (actsTags(model) ? text : text.replace(/\[[^\]]*\]\s*/g, '').trim())
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
  // Voices ElevenLabs refused (missing, or not on this plan) since the server started;
  // their lines go straight to the narrator.
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
          text: speakable(text, model),
          model_id: model,
          // v3 only takes stability 0, 0.5 or 1; 0.5 keeps a voice steady but expressive.
          voice_settings: actsTags(model) ? { stability: 0.5, similarity_boost: 0.75 } : { stability: 0.4, similarity_boost: 0.75, style: 0.35 },
        }),
      })
      if (!response.ok) {
        const reason = await response.text().catch(() => '')
        throw Object.assign(new Error(`ElevenLabs said ${response.status}: ${reason.slice(0, 200)}`), { status: response.status })
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

  // Speaks a line as one of the cast's roles; anything else is the narrator, so a
  // page can't ask for any voice it likes. A voice this ElevenLabs account can't
  // use falls back to the narrator, so the line is still heard.
  const speakAs = (role, text) => {
    const chosen = Object.hasOwn(voices, role ?? '') ? voices[role] : voices.narrator
    const voice = refused.has(chosen) ? voices.narrator : chosen
    return speak(text, voice).catch((error) => {
      if (voice === voices.narrator) throw error
      console.error(`Narrator: the ${role} voice failed, using the narrator instead.`, error.message)
      // Not found or not on this plan won't fix itself; a network blip might.
      if (error.status === 402 || error.status === 403 || error.status === 404) refused.add(voice)
      return speak(text, voices.narrator)
    })
  }

  // Records every villain line ahead of time, one at a time, so a villain speaks the
  // moment it appears instead of after a long wait. Lines already saved cost nothing.
  const warmUp = async () => {
    if (!apiKey) return
    for (const { role, text } of villainLines()) {
      await speakAs(role, text).catch((error) => console.error('Narrator warm-up:', error.message))
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
    speakAs(url.searchParams.get('voice'), text).then(
      (audio) => res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'public, max-age=31536000, immutable' }).end(audio),
      (error) => {
        console.error('Narrator:', error.message)
        res.writeHead(502, { 'Content-Type': 'text/plain' }).end('The narrator could not speak')
      },
    )
    return true
  }

  return { enabled: Boolean(apiKey), handle, warmUp }
}
