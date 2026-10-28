import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { auditionList, listTakes, pickTake } from './soundTakes.js'
import { makeTake, plan } from './generate-sounds.js'
import { SOUND_PROMPTS, promptCredits } from '../src/audio/soundPrompts.js'

const soundsDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'ashardalon-takes-'))
  mkdirSync(join(dir, 'takes'))
  return dir
}

describe('ElevenLabs sound takes', () => {
  it("costs what JJ's list adds up to: 2 takes of 3 loops, 3 of most one-shots, 4 of the remade horn and grell", () => {
    expect(SOUND_PROMPTS.filter((p) => p.loop)).toHaveLength(3)
    expect(SOUND_PROMPTS.filter((p) => !p.loop)).toHaveLength(25)
    expect(promptCredits(SOUND_PROMPTS.filter((p) => ['fanfare', 'monster-grell'].includes(p.name)))).toBe(1040)
    expect(promptCredits(SOUND_PROMPTS)).toBe(11980)
  })

  it('plans only the takes not made yet', () => {
    const dir = soundsDir()
    writeFileSync(join(dir, 'takes', 'coins-1.mp3'), 'x')
    const coins = SOUND_PROMPTS.filter((p) => p.name === 'coins')
    const { todo, credits } = plan(dir, coins)
    expect(todo.map((t) => t.take)).toEqual([2, 3])
    expect(credits).toBe(160)
  })

  it('asks ElevenLabs for a looping take at 192 kbps and saves it', async () => {
    const dir = soundsDir()
    let asked
    const fetchSound = async (url, init) => {
      asked = { url, body: JSON.parse(init.body), key: init.headers['xi-api-key'] }
      return { ok: true, arrayBuffer: async () => new TextEncoder().encode('mp3').buffer }
    }
    const loop = { ...SOUND_PROMPTS[0], take: 2 }
    await makeTake(dir, loop, { apiKey: 'k', fetchSound })
    expect(asked.url).toContain('/v1/sound-generation?output_format=mp3_44100_192')
    expect(asked.body).toMatchObject({ duration_seconds: 25, loop: true, model_id: 'eleven_text_to_sound_v2' })
    expect(asked.key).toBe('k')
    expect(listTakes(dir)).toEqual({ 'loop-explore': [2] })
  })

  it('copies the picked take into the game, keeping what it replaced', () => {
    const dir = soundsDir()
    writeFileSync(join(dir, 'coins.mp3'), 'old coins')
    writeFileSync(join(dir, 'takes', 'coins-2.mp3'), 'new coins')
    expect(auditionList(dir).find((s) => s.name === 'coins')).toMatchObject({ takes: [2], picked: 'other' })
    expect(pickTake(dir, 'coins', 2)).toBe(true)
    expect(readFileSync(join(dir, 'coins.mp3'), 'utf8')).toBe('new coins')
    expect(readdirSync(join(dir, 'takes', 'replaced'))).toHaveLength(1)
    expect(auditionList(dir).find((s) => s.name === 'coins').picked).toBe(2)
    expect(pickTake(dir, 'coins', 3)).toBe(false)
    expect(pickTake(dir, '../game', 1)).toBe(false)
    expect(existsSync(join(dir, 'CREDITS.csv'))).toBe(true)
  })
})

describe('making a sound again', () => {
  it('sets aside only that sound’s takes', async () => {
    const { setAside } = await import('./generate-sounds.js')
    const dir = soundsDir()
    for (const f of ['fanfare-1.mp3', 'fanfare-2.mp3', 'monster-grell-1.mp3']) writeFileSync(join(dir, 'takes', f), 'x')
    expect(setAside(dir, 'fanfare')).toBe(2)
    expect(listTakes(dir)).toEqual({ 'monster-grell': [1] })
    expect(readdirSync(join(dir, 'takes', 'rejected'))).toHaveLength(2)
  })
})
