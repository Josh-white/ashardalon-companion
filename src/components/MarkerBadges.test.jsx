import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MarkerBadges } from './BoardPieces.jsx'

const squares = [0, 1].flatMap((y) => [0, 1].map((x) => ({ x, y, area: 'start' })))
const markers = [{ marker: { id: 'cave' }, look: { icon: '🪨', color: '#a8a29e' }, squares, tile: 'start' }]
const centre = (html) => html.match(/cx="([\d.]+)" cy="([\d.]+)"/).slice(1).map(Number)

describe('marker badges', () => {
  it('sit on a free square so they never hide a figure (the Grell under the Cave In)', () => {
    expect(centre(renderToStaticMarkup(<svg><MarkerBadges markers={markers} onTap={() => {}} /></svg>))).toEqual([20, 20])
    expect(centre(renderToStaticMarkup(<svg><MarkerBadges markers={markers} taken={new Set(['0,0'])} onTap={() => {}} /></svg>))).toEqual([60, 20])
  })

  it('shrink into the corner when every square is taken', () => {
    const html = renderToStaticMarkup(<svg><MarkerBadges markers={markers} taken={new Set(['0,0', '1,0', '0,1', '1,1'])} onTap={() => {}} /></svg>)
    expect(html).toContain('r="9"')
  })
})
