import { describe, expect, it } from 'vitest'
import { regroupNodes } from './board3dFigures.js'
import { pruneTokens } from '../board/play.js'

const node = (name, at) => ({ name, userData: { at } })
const devil = (id, at) => ({ id, kind: 'monster', at })

describe('Legion Devil figures on the 3D board', () => {
  it('keeps each standing devil on its own figure, so the one that fell leaves from its square', () => {
    const a = node('a', [0, 0])
    const b = node('b', [3, 0])
    const c = node('c', [5, 5])
    const nodes = new Map([['m1', a], ['m1#2', b], ['m1#3', c], ['h1', node('hero', [1, 1])]])
    // Devil 1 (at 0,0) falls; the game renumbers the other two.
    const out = regroupNodes(nodes, [devil('m1', [3, 0]), devil('m1#2', [5, 5]), { id: 'h1', kind: 'hero', at: [1, 1] }])
    expect(out.get('m1')).toBe(b)
    expect(out.get('m1#2')).toBe(c)
    expect(out.get('h1').name).toBe('hero')
    const gone = [...out].filter(([id]) => !['m1', 'm1#2', 'h1'].includes(id))
    expect(gone.map(([, n]) => n)).toEqual([a])
  })

  it('leaves figures alone when nothing fell', () => {
    const nodes = new Map([['m1', node('a', [0, 0])], ['m1#2', node('b', [3, 0])]])
    const out = regroupNodes(nodes, [devil('m1', [1, 0]), devil('m1#2', [3, 0])])
    expect(out).toEqual(nodes)
  })

  it('matches the renumbering pruneTokens really does', () => {
    const state = {
      heroes: [{ id: 'h1', hp: 8, conditions: [] }],
      turn: { heroIndex: 0 },
      monsters: [{ id: 'm1', hp: 2, card: { hp: 1, figures: 3 } }],
      board: { tokens: { h1: [0, 1], m1: [0, 0], 'm1#2': [3, 0], 'm1#3': [5, 5] } },
    }
    const tokens = pruneTokens(state).board.tokens
    const a = node('a', [0, 0])
    const nodes = new Map([['m1', a], ['m1#2', node('b', [3, 0])], ['m1#3', node('c', [5, 5])]])
    const figures = Object.entries(tokens).filter(([id]) => id !== 'h1').map(([id, at]) => devil(id, at))
    const out = regroupNodes(nodes, figures)
    for (const f of figures) expect(out.get(f.id).userData.at).toEqual(f.at)
    expect([...out.values()]).toContain(a)
    expect(figures.some((f) => out.get(f.id) === a)).toBe(false)
  })
})
