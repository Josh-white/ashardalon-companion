import { describe, expect, it } from 'vitest'
import { torchSpots } from './dungeonLook3d.js'

// A 6x6 room: rock down the west side, a wall round the rest.
function room() {
  const squares = []
  const walls = []
  for (let x = 0; x < 6; x++) for (let y = 0; y < 6; y++) squares.push({ x, y, floor: x > 0, tile: 'start' })
  for (let y = 0; y < 6; y++) walls.push({ x: 5, y, side: 'E' })
  return { squares, walls, openEdges: [], exits: [], bounds: { x: 0, y: 0, w: 6, h: 6 } }
}

describe('torches on the 3D board', () => {
  it('hang on rock faces and walls next to the floor, spread apart', () => {
    const spots = torchSpots(room())
    expect(spots.length).toBeGreaterThan(0)
    for (const s of spots) {
      const onRock = s.side === 'W' && s.x === 1
      const onWall = s.side === 'E' && s.x === 5
      expect(onRock || onWall).toBe(true)
    }
    for (const a of spots) for (const b of spots) if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(3.2)
  })

  it('are the same every time for the same dungeon, and capped', () => {
    expect(torchSpots(room())).toEqual(torchSpots(room()))
    expect(torchSpots(room(), 1)).toHaveLength(1)
  })
})
