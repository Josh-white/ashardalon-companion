import { describe, expect, it } from 'vitest'
import { initialState, SAVE_VERSION } from './game.js'
import { migrateSave } from './saves.js'

describe('migrating a saved game', () => {
  it('keeps a current save as it is', () => {
    const saved = { ...initialState, xp: 7, campaign: { games: 2 } }
    expect(migrateSave(saved)).toEqual(saved)
  })

  it('fills in fields an older save never had', () => {
    const old = { ...initialState, xp: 3 }
    delete old.tileStack
    delete old.soundboard
    const migrated = migrateSave(old)
    expect(migrated).toMatchObject({ xp: 3, tileStack: initialState.tileStack, soundboard: initialState.soundboard })
  })

  it('runs each step in order up to the current version', () => {
    const migrations = {
      1: (s) => ({ ...s, gold: s.xp * 10 }),
      2: (s) => ({ ...s, gold: s.gold + 1, steps: [...(s.steps ?? []), 2] }),
    }
    expect(migrateSave({ version: 1, xp: 2 }, migrations, 3)).toMatchObject({ version: 3, xp: 2, gold: 21, steps: [2] })
    expect(migrateSave({ version: 2, xp: 2, gold: 5 }, migrations, 3)).toMatchObject({ version: 3, gold: 6 })
  })

  it("refuses saves it can't use", () => {
    expect(migrateSave(null)).toBe(null)
    expect(migrateSave([])).toBe(null)
    expect(migrateSave({ xp: 1 })).toBe(null)
    expect(migrateSave({ version: SAVE_VERSION + 1 })).toBe(null)
    // A step is missing.
    expect(migrateSave({ version: 1 }, {}, 2)).toBe(null)
  })
})
