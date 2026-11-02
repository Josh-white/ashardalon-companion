// Takes of the ElevenLabs sounds (src/audio/soundPrompts.js): made by
// server/generate-sounds.js into cards/sounds/takes/, and the favourite (picked with
// generate-sounds.js --pick) of each copied up into cards/sounds/ where the game plays it.
// Everything here stays on the Pi.
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
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

const PICKS_FILE = 'CREDITS.csv'

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
