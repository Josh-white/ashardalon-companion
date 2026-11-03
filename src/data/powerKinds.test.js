import { describe, expect, it } from 'vitest'
import { byKind, powerKind } from './powerKinds.js'

describe('byKind', () => {
  it('lists At-Wills, then Dailies, then Utilities, keeping the hero order inside each', () => {
    const powers = [
      { id: 'd1', type: 'daily' },
      { id: 'u1', type: 'utility' },
      { id: 'a1', type: 'at-will' },
      { id: 'd2', type: 'daily' },
      { id: 'a2', type: 'at-will' },
    ]
    expect(byKind(powers).map((p) => p.id)).toEqual(['a1', 'a2', 'd1', 'd2', 'u1'])
  })

  it('names each kind', () => {
    expect(powerKind('daily').label).toBe('Daily')
    expect(powerKind('utility').label).toBe('Utility')
    expect(powerKind('at-will').label).toBe('At-Will')
  })
})
