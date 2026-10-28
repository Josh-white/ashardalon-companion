// Takes of the ElevenLabs sounds (src/audio/soundPrompts.js): made by
// server/generate-sounds.js into cards/sounds/takes/, listened to on the #audition
// page, and the favourite of each copied up into cards/sounds/ where the game plays it.
// Everything here stays on the Pi.
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { SOUND_PROMPTS, takeFile } from '../src/audio/soundPrompts.js'

const TAKE_FILE = /^([a-z0-9-]+)-(\d+)\.mp3$/

export const takesDir = (soundsDir) => join(soundsDir, 'takes')

// Every take on disk, by sound: { coins: [1, 2, 3] }.
export function listTakes(soundsDir) {
  const takes = {}
  try {
    for (const file of readdirSync(takesDir(soundsDir))) {
      const [, name, take] = file.match(TAKE_FILE) ?? []
      if (name) (takes[name] ??= []).push(Number(take))
    }
  } catch {
    // No takes made yet.
  }
  for (const list of Object.values(takes)) list.sort((a, b) => a - b)
  return takes
}

// What the #audition page shows: each sound's prompt, its takes, and which take (if
// any) the game plays now.
export function auditionList(soundsDir) {
  const takes = listTakes(soundsDir)
  const picks = readPicks(soundsDir)
  return SOUND_PROMPTS.map(({ name, group, prompt, seconds, loop }) => ({
    name,
    group,
    prompt,
    seconds,
    loop,
    takes: takes[name] ?? [],
    picked: existsSync(join(soundsDir, `${name}.mp3`)) ? picks[name] ?? 'other' : null,
  }))
}

const PICKS_FILE = 'CREDITS.csv'

// Which take each sound was copied from, from the credits file (last line wins).
function readPicks(soundsDir) {
  const picks = {}
  try {
    const text = readFileSync(join(soundsDir, PICKS_FILE), 'utf8')
    for (const line of text.split('\n')) {
      const [file, source] = line.split(',')
      const [, take] = source?.match(/^ElevenLabs take (\d+)/) ?? []
      if (file && take) picks[file.replace(/\.mp3$/, '')] = Number(take)
    }
  } catch {
    // No credits file yet.
  }
  return picks
}

// Copies take `take` of `name` into cards/sounds/<name>.mp3. Whatever was there is
// kept in takes/replaced/, and the credits file says where the new one came from.
export function pickTake(soundsDir, name, take) {
  const entry = SOUND_PROMPTS.find((p) => p.name === name)
  const from = join(takesDir(soundsDir), takeFile(name, take))
  if (!entry || !Number.isInteger(take) || !existsSync(from)) return false
  const to = join(soundsDir, `${name}.mp3`)
  if (existsSync(to)) {
    const replaced = join(takesDir(soundsDir), 'replaced')
    mkdirSync(replaced, { recursive: true })
    copyFileSync(to, join(replaced, `${name}-${Math.round(statSync(to).mtimeMs)}.mp3`))
  }
  copyFileSync(from, to)
  const prompt = entry.prompt.replace(/["\n]/g, ' ')
  appendFileSync(join(soundsDir, PICKS_FILE), `${name}.mp3,ElevenLabs take ${take} (${new Date().toISOString().slice(0, 10)}),"${prompt}"\n`)
  return true
}
