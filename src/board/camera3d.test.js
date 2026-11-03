import { describe, expect, it } from 'vitest'
import { behindShot, closeUpShot, HERO_TILT, restShot, tourShot, turnBy, viewAngles } from './camera3d.js'

const close = (a, b) => expect(Math.abs(turnBy(a, b))).toBeLessThan(1e-6)

describe('the 3D camera', () => {
  it('turns the short way round', () => {
    expect(turnBy(3, -3)).toBeCloseTo(2 * Math.PI - 6)
    expect(turnBy(0, 1)).toBeCloseTo(1)
  })

  it('sits behind the hero, looking past them at the nearest monster', () => {
    const shot = behindShot([0, 0], [[0, 10], [0, 3]])
    // The camera is on the -z side (yaw PI), looking toward +z where the monster is.
    close(shot.yaw, Math.PI)
    expect(shot.target[0]).toBeCloseTo(0)
    expect(shot.target[1]).toBeGreaterThan(0)
    expect(shot.target[1]).toBeLessThan(3)
    expect(shot.tilt).toBe(HERO_TILT)
  })

  it('looks at the hero, keeping its angle, with no monster about', () => {
    expect(behindShot([2, 3], [], { yaw: 1 })).toMatchObject({ target: [2, 3], yaw: 1 })
  })

  it("keeps a screen's own angle and zoom over the hero in the top and corner views", () => {
    const keep = { yaw: 0.3, tilt: 0.8, dist: 12 }
    expect(restShot('top', [1, 1], [[5, 5]], keep)).toEqual({ ...keep, target: [1, 1] })
    expect(restShot('corner', [1, 1], [], keep)).toEqual({ ...keep, target: [1, 1] })
    close(restShot('hero', [0, 0], [[3, 0]], keep).yaw, -Math.PI / 2)
  })

  it('turns 45 degrees for the corner view', () => {
    const keep = { yaw: 2, tilt: 0.5, dist: 10, fitTilt: 0.8 }
    expect(viewAngles('corner', 0, keep).yaw).toBeCloseTo(Math.PI / 4)
    expect(viewAngles('top', 0, keep)).toMatchObject({ yaw: 0, tilt: 0.8, dist: 10 })
  })

  it('shows an attack from the side, on the side the camera is nearest', () => {
    // Attacker and target along x: the camera goes to +z or -z.
    const front = closeUpShot([0, 0], [4, 0], 0.2)
    close(front.yaw, 0)
    expect(front.target).toEqual([2, 0])
    const back = closeUpShot([0, 0], [4, 0], 3)
    close(back.yaw, Math.PI)
    expect(front.dist).toBeGreaterThanOrEqual(3.6)
  })

  it('glides to the monster taking its turn', () => {
    const keep = { yaw: 0, tilt: 0.8, dist: 14 }
    expect(tourShot('top', [4, 4], [[0, 0]], keep)).toEqual({ yaw: 0, tilt: 0.8, dist: 6.5, target: [4, 4] })
    // Behind hero: from behind the monster, at the hero.
    close(tourShot('hero', [0, 4], [[0, 0]], keep).yaw, 0)
  })
})
