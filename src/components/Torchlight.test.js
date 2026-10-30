import { describe, expect, it } from 'vitest'
import { lightSources } from './Torchlight.jsx'
import { SQUARE } from './TileDrawing.jsx'

describe('torchlight sources', () => {
  const heroes = [
    { id: 'a', hp: 5 },
    { id: 'b', hp: 5 },
    { id: 'c', hp: 0 },
    { id: 'd', hp: 5 },
  ]
  const tokens = { a: [0, 0], b: [2, 1], c: [4, 4] }

  it('lights every hero on the board, the active one the brightest', () => {
    const lights = lightSources({ heroes, tokens, activeId: 'b', markers: [] })
    expect(lights.map((l) => l.id)).toEqual(['a', 'b', 'c'])
    const [a, b, c] = lights
    expect(b).toMatchObject({ kind: 'active', cx: 2.5 * SQUARE, cy: 1.5 * SQUARE })
    expect(b.r).toBeGreaterThan(a.r)
    expect(c.r).toBeLessThan(a.r) // a fallen hero's torch is low
  })

  it('makes each Lava Flow tile glow from its middle', () => {
    const squares = [
      { x: 0, y: 0, area: 't1' },
      { x: 1, y: 0, area: 't1' },
      { x: 5, y: 5, area: 't2' },
    ]
    const markers = [
      { marker: { id: 'm1', cardId: 'lava-flow' }, tiles: ['t1', 't2'], squares },
      { marker: { id: 'm2', cardId: 'pit' }, tiles: ['t3'], squares: [{ x: 9, y: 9, area: 't3' }] },
    ]
    const lights = lightSources({ heroes: [], tokens: {}, activeId: null, markers })
    expect(lights).toHaveLength(2)
    expect(lights[0]).toMatchObject({ kind: 'lava', cx: SQUARE, cy: SQUARE / 2 })
    expect(lights[1]).toMatchObject({ cx: 5.5 * SQUARE, cy: 5.5 * SQUARE })
  })
})
