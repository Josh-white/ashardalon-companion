// The narrator's voices. The projector asks for a line with GET /narrate?voice=herald&text=...,
// and this turns it into speech with ElevenLabs. The API key stays here on the
// Pi (ELEVENLABS_API_KEY in .env); no browser ever sees it. Each line is saved
// as an mp3, so a line heard before ("A Kobold appears!") costs nothing again.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { VILLAIN_DEFAULT, VILLAIN_LINES } from '../src/data/villainLines.js'

// The cast, picked by JJ from the ElevenLabs voice library. Each can be
// swapped with a voice id in .env: ELEVENLABS_VOICE_ID for the narrator, and
// ELEVENLABS_VOICE_<ROLE> for the rest (ELEVENLABS_VOICE_HERALD, _MEERAK, ...).
export const DEFAULT_VOICES = {
  narrator: 'oR4uRy4fHDUGGISL0Rev', // the storyteller: tiles, turns, encounters and stories
  herald: 'ZF6FPAbjXT4488VcRRnw', // cheers the heroes on
  danger: 'fs2OqxduwXgp9foh2xjK', // monsters and bad news
  villain: 'IDuDsTbqg77GnVCQrair', // any villain without its own voice (Kraash's)
  meerak: 'Nw7vpAFWzoeAAt8VlVfL', // the kobold dragonlord
  margrath: '09BJBPASOGbr1evokbCu', // the duergar captain
  kraash: 'IDuDsTbqg77GnVCQrair', // the orc storm shaman
  ashardalon: 'd5zuFgodxfQobkK5AfKH', // the red dragon
  bellax: 'mLw8kuDeVGqVstOYjRII', // the gauth's whisper of madness
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
// Every line uses v3, which acts out stage directions like [menacing] or [laughs].
// It costs about twice as much as flash, but each line is recorded only once.
export const DEFAULT_MODEL = 'eleven_v3'
export const DEFAULT_VILLAIN_MODEL = 'eleven_v3'
// Lower is more expressive, higher is steadier.
export const DEFAULT_STABILITY = 0.3
// How strongly the voice leans into its own style.
export const DEFAULT_STYLE = 0.5
// ElevenLabs credits per letter, for the recording estimate.
export const CREDITS_PER_LETTER = { eleven_flash_v2_5: 0.5, eleven_turbo_v2_5: 0.5 }
// Models lines may already be saved under, so changing models never pays twice.
const KNOWN_MODELS = ['eleven_flash_v2_5', 'eleven_v3', 'eleven_multilingual_v2']
const VILLAIN_ROLES = new Set(['villain', ...Object.values(VILLAIN_LINES).map((v) => v.voice).filter((v) => v !== 'danger')])
// Older models read stage directions out loud, so they're taken out for those.
const actsTags = (model) => /^eleven_v[3-9]/.test(model)
// D&D names spelled the way they're said, in what ElevenLabs hears only; the screen
// and the saved recording's name keep the real spelling.
const SAY_AS = [
  [/otyugh/gi, 'ot-yug'],
  [/duergar/gi, 'dwer-gar'],
]
const sayAs = (text) =>
  SAY_AS.reduce((t, [word, spoken]) => t.replace(word, (m) => (m[0] === m[0].toUpperCase() ? spoken[0].toUpperCase() + spoken.slice(1) : spoken)), text)
export const speakable = (text, model) => sayAs(actsTags(model) ? text : text.replace(/\[[^\]]*\]\s*/g, '').trim())
// Longer than any line the projector sends (the longest adventure story is
// about 750 characters); a guard against running up the bill.
export const MAX_TEXT = 1200

export function createNarrator({
  apiKey = process.env.ELEVENLABS_API_KEY || null,
  voices = castFromEnv(process.env),
  model: everydayModel = process.env.ELEVENLABS_MODEL || DEFAULT_MODEL,
  villainModel = process.env.ELEVENLABS_VILLAIN_MODEL || DEFAULT_VILLAIN_MODEL,
  stability = Number(process.env.ELEVENLABS_STABILITY || DEFAULT_STABILITY),
  style = Number(process.env.ELEVENLABS_STYLE || DEFAULT_STYLE),
  cacheDir,
  fetchSpeech = globalThis.fetch,
} = {}) {
  // Lines being fetched right now, so two screens asking at once cost one call.
  const pending = new Map()
  // Voices ElevenLabs refused (missing, or not on this plan) since the server started;
  // their lines go straight to the narrator.
  const refused = new Set()

  // The voice settings are part of the name, so changing them records the lines again.
  const cacheFile = (voice, model, text) =>
    join(cacheDir, `${createHash('sha1').update(`${voice}|${model}|${stability}|${style}|${text}`).digest('hex')}.mp3`)

  // The same line in the same voice, recorded with any model.
  const savedFile = (voice, text) => KNOWN_MODELS.map((model) => cacheFile(voice, model, text)).find(existsSync)

  const speak = async (text, voice, model) => {
    const file = cacheFile(voice, model, text)
    if (existsSync(file)) return readFileSync(file)
    // The same line in the same voice, already recorded with another model.
    const saved = savedFile(voice, text)
    if (saved) return readFileSync(saved)
    // Without a key the narrator only plays lines it already recorded.
    if (!apiKey) throw Object.assign(new Error('Not recorded yet, and no ElevenLabs key to record it'), { status: 0, offline: true })
    if (pending.has(file)) return pending.get(file)
    const job = (async () => {
      const response = await fetchSpeech(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
        method: 'POST',
        headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify({
          text: speakable(text, model),
          model_id: model,
          voice_settings: { stability, similarity_boost: 0.75, style },
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
    const chosen = voiceFor(role)
    const voice = refused.has(chosen) ? voices.narrator : chosen
    const model = modelFor(role)
    return speak(text, voice, model).catch((error) => {
      if (voice === voices.narrator) throw error
      if (!error.offline) console.error(`Narrator: the ${role} voice failed, using the narrator instead.`, error.message)
      // Not found or not on this plan won't fix itself; a network blip might.
      if (error.status === 402 || error.status === 403 || error.status === 404) refused.add(voice)
      return speak(text, voices.narrator, model)
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

  const voiceFor = (role) => (Object.hasOwn(voices, role ?? '') ? voices[role] : voices.narrator)
  // Is this line already recorded in its own voice?
  const isSaved = (role, text) => Boolean(savedFile(voiceFor(role), text))
  const modelFor = (role) => (VILLAIN_ROLES.has(role) ? villainModel : everydayModel)
  // The narrator plays when there's a key, or recordings to play without one.
  const enabled = () => Boolean(apiKey) || (existsSync(cacheDir) && readdirSync(cacheDir).some((f) => f.endsWith('.mp3')))

  // Handles /narrate (is the narrator set up?) and /narrate?text=... (the mp3).
  // Returns false for any other path.
  const handle = (req, res) => {
    const url = new URL(req.url, 'http://localhost')
    if (url.pathname !== '/narrate') return false
    const text = (url.searchParams.get('text') ?? '').trim()
    if (!text) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify({ enabled: enabled() }))
      return true
    }
    if (text.length > MAX_TEXT) {
      res.writeHead(413, { 'Content-Type': 'text/plain' }).end('Line too long')
      return true
    }
    speakAs(url.searchParams.get('voice'), text).then(
      (audio) => res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'public, max-age=31536000, immutable' }).end(audio),
      (error) => {
        if (error.offline) {
          res.writeHead(404, { 'Content-Type': 'text/plain' }).end('That line was never recorded')
          return
        }
        console.error('Narrator:', error.message)
        res.writeHead(502, { 'Content-Type': 'text/plain' }).end('The narrator could not speak')
      },
    )
    return true
  }

  return { get enabled() { return enabled() }, handle, warmUp, speakAs, isSaved, modelFor, hasKey: Boolean(apiKey) }
}
