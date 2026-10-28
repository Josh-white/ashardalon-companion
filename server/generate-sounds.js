// Makes the game's recorded sounds with ElevenLabs' sound effects (the list and
// prompts are in src/audio/soundPrompts.js). Each sound gets a few takes in
// cards/sounds/takes/; pick the favourites on the #audition page (or with --pick), and
// those are copied into cards/sounds/ where the game plays them. Takes already made are
// skipped, so running it again costs only what's new.
//
//   docker compose exec ashardalon node server/generate-sounds.js --dry-run       # cost only
//   docker compose exec ashardalon node server/generate-sounds.js                 # make every take
//   docker compose exec ashardalon node server/generate-sounds.js coins trap      # just these sounds
//   docker compose exec ashardalon node server/generate-sounds.js --pick coins=2  # use take 2 of coins
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CREDITS_PER_SECOND, SOUND_PROMPTS, takeFile } from '../src/audio/soundPrompts.js'
import { pickTake, takesDir } from './soundTakes.js'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
// 192 kbps needs the Creator plan or above; ELEVENLABS_SFX_FORMAT=mp3_44100_128 for less.
const FORMAT = process.env.ELEVENLABS_SFX_FORMAT || 'mp3_44100_192'
const MODEL = 'eleven_text_to_sound_v2'

// Every take of `prompts` that isn't on disk yet, and what they'll cost.
export function plan(soundsDir, prompts) {
  const todo = []
  for (const prompt of prompts) {
    for (let take = 1; take <= prompt.takes; take++) {
      if (!existsSync(join(takesDir(soundsDir), takeFile(prompt.name, take)))) todo.push({ ...prompt, take })
    }
  }
  const credits = todo.reduce((sum, t) => sum + Math.ceil(t.seconds * CREDITS_PER_SECOND), 0)
  return { todo, credits }
}

// Asks ElevenLabs for one take and saves it.
export async function makeTake(soundsDir, { name, take, prompt, seconds, loop, follow }, { apiKey, fetchSound = fetch } = {}) {
  const response = await fetchSound(`https://api.elevenlabs.io/v1/sound-generation?output_format=${FORMAT}`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text: prompt, duration_seconds: seconds, prompt_influence: follow, loop, model_id: MODEL }),
  })
  if (!response.ok) {
    const reason = await response.text().catch(() => '')
    throw new Error(`ElevenLabs said ${response.status}: ${reason.slice(0, 200)}`)
  }
  const file = join(takesDir(soundsDir), takeFile(name, take))
  mkdirSync(takesDir(soundsDir), { recursive: true })
  writeFileSync(`${file}.tmp`, Buffer.from(await response.arrayBuffer()))
  renameSync(`${file}.tmp`, file)
  return file
}

async function main() {
  const args = process.argv.slice(2)
  const soundsDir = process.env.SOUNDS_DIR ?? join(ROOT, 'cards', 'sounds')

  const picks = args.filter((a) => !a.startsWith('--') && a.includes('='))
  if (args.includes('--pick')) {
    for (const pick of picks) {
      const [name, take] = pick.split('=')
      console.log(pickTake(soundsDir, name, Number(take)) ? `Using take ${take} of ${name}.` : `No take ${take} of ${name}.`)
    }
    return
  }

  const names = args.filter((a) => !a.startsWith('--'))
  const unknown = names.filter((n) => !SOUND_PROMPTS.some((p) => p.name === n))
  if (unknown.length) {
    console.log(`Not in the list: ${unknown.join(', ')}. The sounds are: ${SOUND_PROMPTS.map((p) => p.name).join(', ')}`)
    process.exitCode = 1
    return
  }
  const prompts = names.length ? SOUND_PROMPTS.filter((p) => names.includes(p.name)) : SOUND_PROMPTS
  const { todo, credits } = plan(soundsDir, prompts)
  console.log(`${todo.length} takes to make, about ${credits} ElevenLabs credits.`)
  if (args.includes('--dry-run')) {
    for (const t of todo) console.log(`  ${takeFile(t.name, t.take)}  ${t.seconds}s${t.loop ? ' loop' : ''}  ${t.prompt}`)
    return
  }
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) {
    console.log('No ELEVENLABS_API_KEY, so nothing can be made.')
    process.exitCode = 1
    return
  }
  let done = 0
  for (const t of todo) {
    try {
      await makeTake(soundsDir, t, { apiKey })
      done++
      console.log(`  ${done}/${todo.length} ${takeFile(t.name, t.take)}`)
    } catch (error) {
      console.log(`Stopped: ${error.message}`)
      console.log('Run this again later (for example after the credits reset) to make the rest.')
      process.exitCode = 1
      break
    }
  }
  console.log(`Made ${done} of ${todo.length}. Pick the favourites at /#audition.`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
