import { describe, expect, it } from 'vitest'
import { applyPatch, makePatch } from './statePatch.js'

const line = (id) => ({ id, text: `line ${id}` })

describe('sending only what changed', () => {
  const deck = { cards: Array.from({ length: 50 }, (_, i) => ({ id: i, text: 'a long card' })) }
  const before = { turn: { phase: 0 }, encounterDeck: deck, heroes: [{ id: 'a', hp: 8 }], log: [line(2), line(1)], gone: true }

  it('leaves out the parts that are the same, and keeps them the same objects on the screen', () => {
    const after = { ...before, turn: { phase: 1 }, gone: undefined }
    delete after.gone
    const patch = makePatch(before, after)
    expect(patch.changes).toEqual({ turn: { phase: 1 } })
    expect(patch.removed).toEqual(['gone'])
    expect(JSON.stringify(patch)).not.toContain('a long card')
    const shown = applyPatch(before, JSON.parse(JSON.stringify(patch)))
    expect(shown).toEqual(after)
    expect(shown.encounterDeck).toBe(before.encounterDeck)
    expect(shown.heroes).toBe(before.heroes)
  })

  it('sends just the new log lines, and drops the oldest the way the game does', () => {
    const after = { ...before, log: [line(4), line(3), ...before.log].slice(0, 3) }
    const patch = makePatch(before, after)
    expect(patch.changes).toEqual({})
    expect(patch.logAdd).toEqual([line(4), line(3)])
    expect(applyPatch(before, JSON.parse(JSON.stringify(patch))).log).toEqual(after.log)
  })

  it('sends the whole log when it was rewritten (an Undo, a new game)', () => {
    const undone = { ...before, log: [line(1)] }
    const patch = makePatch(before, undone)
    expect(patch.changes.log).toEqual([line(1)])
    expect(applyPatch(before, patch).log).toEqual([line(1)])
    const fresh = { ...before, log: [] }
    expect(applyPatch(before, makePatch(before, fresh)).log).toEqual([])
    const first = { ...before, log: [line(9)] }
    const empty = { ...before, log: [] }
    expect(applyPatch(empty, makePatch(empty, first)).log).toEqual([line(9)])
  })
})
