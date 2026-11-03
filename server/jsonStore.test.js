import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readJsonFile, writeJsonFile } from './jsonStore.js'
import { wearNone, wearOnly } from '../src/data/workshop.js'

describe('jsonStore', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ashardalon-store-'))
  afterEach(() => vi.restoreAllMocks())

  it('writes the whole file, makes its folder, and reads it back', () => {
    const file = join(dir, 'a', 'b.json')
    writeJsonFile(file, { ok: [1, 2] })
    expect(readJsonFile(file, null)).toEqual({ ok: [1, 2] })
    expect(existsSync(`${file}.tmp`)).toBe(false)
    writeJsonFile(file, { ok: 1 }, 0)
    expect(readFileSync(file, 'utf8')).toBe('{"ok":1}')
  })

  it('falls back when the file is missing or broken', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(readJsonFile(join(dir, 'nope.json'), { none: true })).toEqual({ none: true })
    writeFileSync(join(dir, 'bad.json'), '{not json')
    expect(readJsonFile(join(dir, 'bad.json'), [], 'the bad file')).toEqual([])
    expect(console.error).toHaveBeenCalledWith('Could not read the bad file:', expect.any(String))
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('one figure per player', () => {
  const from = (f) => f.from
  const list = [
    { id: 1, from: 'Colton', useInGame: true },
    { id: 2, from: ' colton ', useInGame: false },
    { id: 3, from: 'Easton', useInGame: true },
  ]
  it('turning one on turns off only that player\'s others', () => {
    expect(wearOnly(list, 1, true, from).map((f) => f.useInGame)).toEqual([false, true, true])
    expect(wearOnly(list, 0, false, from).map((f) => f.useInGame)).toEqual([false, false, true])
  })
  it('takes all of one player\'s figures out', () => {
    expect(wearNone(list, 'colton', from).map((f) => f.useInGame)).toEqual([false, false, true])
  })
})
