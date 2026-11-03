import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { buildFigure, disposeFigure, figureClips, frameFor, pose } from './figure.js'
import { PARTS, SLOTS } from './parts.js'
import { MOVES } from './moves.js'
import { DEFAULT_RECIPE, randomRecipe, STARTERS } from './recipes.js'
import { cleanRecipe } from '../data/forge.js'

// Builds hundreds of figures: a few seconds here, but over 6 on the Pi's own build.
const SLOW = 60000

const meshes = (figure) => {
  let n = 0
  figure.traverse((o) => {
    if (o.isMesh) {
      n++
      for (const v of o.geometry.attributes.position.array) if (!Number.isFinite(v)) throw new Error(`NaN in ${o.parent?.name}`)
    }
  })
  return n
}

describe('Hero Builder figures', () => {
  it('has unique part ids in every slot', () => {
    for (const slot of SLOTS) {
      const ids = PARTS[slot.key].map((p) => p.id)
      expect(new Set(ids).size).toBe(ids.length)
      for (const id of ids) expect(id).toMatch(/^[a-z0-9-]{1,40}$/)
    }
  })

  it('builds every part at its smallest, normal and biggest shape', () => {
    for (const slot of SLOTS) {
      for (const part of PARTS[slot.key]) {
        for (const end of ['min', 'value', 'max']) {
          const shape = Object.fromEntries((part.shape ?? []).map((s) => [s.key, s[end]]))
          const recipe = { ...DEFAULT_RECIPE, parts: { ...DEFAULT_RECIPE.parts, [slot.key]: { id: part.id, shape } } }
          const figure = buildFigure(recipe)
          expect(meshes(figure), `${slot.key}/${part.id}/${end}`).toBeGreaterThan(5)
          disposeFigure(figure)
        }
      }
    }
  }, SLOW)

  it('builds the starters and random figures, and a saved recipe builds the same', () => {
    let seed = 7
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    for (const recipe of [...STARTERS, ...Array.from({ length: 30 }, () => randomRecipe(random))]) {
      const figure = buildFigure(recipe)
      const again = buildFigure(cleanRecipe(recipe))
      expect(meshes(again)).toBe(meshes(figure))
    }
  }, SLOW)

  it('stands on the ground: longer legs make a taller figure', () => {
    const short = frameFor({ parts: { legs: { id: 'trousers', shape: { length: 0.5 } } } })
    const long = frameFor({ parts: { legs: { id: 'trousers', shape: { length: 1.8 } } } })
    expect(long.LL).toBeGreaterThan(short.LL)
    const figure = buildFigure(DEFAULT_RECIPE)
    figure.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(figure)
    expect(box.min.y).toBeGreaterThan(-0.05)
    expect(box.min.y).toBeLessThan(0.05)
  })

  it('plays every move without moving the held weapon off the hand', () => {
    const figure = buildFigure(DEFAULT_RECIPE)
    const grip = figure.userData.joints['grip.R'].rotation.x
    for (const name of Object.keys(MOVES)) {
      for (const t of [0, 0.3, 0.7, 5]) pose(figure, name, t)
    }
    expect(figure.userData.joints['grip.R'].rotation.x).toBe(grip)
    expect(pose(figure, 'Swing', 10)).toBe(true)
    expect(pose(figure, 'Idle', 10)).toBe(false)
  })

  it('closes a holding hand into a fist and stands poles up', () => {
    const empty = buildFigure({ ...DEFAULT_RECIPE, parts: { ...DEFAULT_RECIPE.parts, hand: undefined, offhand: undefined } })
    expect(empty.userData.frame.fist).toEqual({ R: false, L: false })
    expect(empty.userData.joints['grip.R'].children).toHaveLength(0)
    const sword = buildFigure({ ...DEFAULT_RECIPE, parts: { ...DEFAULT_RECIPE.parts, hand: { id: 'sword', shape: {} }, offhand: { id: 'round-shield', shape: {} } } })
    expect(sword.userData.frame.fist).toEqual({ R: true, L: false })
    const staff = buildFigure({ ...DEFAULT_RECIPE, parts: { ...DEFAULT_RECIPE.parts, hand: { id: 'staff', shape: {} } } })
    expect(staff.userData.joints['grip.R'].rotation.x).toBeLessThan(sword.userData.joints['grip.R'].rotation.x)
  })

  it('moves a nudged hat with its head, and keeps the nudge through a save', () => {
    const at = (recipe) => {
      const figure = buildFigure(recipe)
      figure.updateMatrixWorld(true)
      const hat = figure.userData.joints.hat
      const box = new THREE.Box3()
      hat.traverse((o) => o.isMesh && box.expandByObject(o))
      return box.getCenter(new THREE.Vector3())
    }
    const plain = { ...DEFAULT_RECIPE, parts: { ...DEFAULT_RECIPE.parts, hat: { id: 'wizard-hat', shape: {} } } }
    const nudged = cleanRecipe({ ...plain, parts: { ...plain.parts, hat: { id: 'wizard-hat', shape: {}, nudge: { up: -0.5, forward: 1, side: 0, tilt: 0.3, junk: 4 } } } })
    expect(nudged.parts.hat.nudge).toEqual({ up: -0.5, forward: 1, tilt: 0.3 })
    const a = at(plain)
    const b = at(nudged)
    expect(b.y).toBeLessThan(a.y - 0.03)
    expect(b.z).toBeGreaterThan(a.z + 0.08)
    // A nudge on a slot that can't be moved is dropped by the figure.
    expect(meshes(buildFigure({ ...nudged, parts: { ...nudged.parts, body: { ...nudged.parts.body, nudge: { up: 1 } } } }))).toBeGreaterThan(5)
  })

  it('ignores parts it does not know', () => {
    const figure = buildFigure({ ...DEFAULT_RECIPE, parts: { ...DEFAULT_RECIPE.parts, hand: { id: 'laser-cannon', shape: {} } } })
    expect(meshes(figure)).toBeGreaterThan(5)
  })

  it('has the 3D board\'s moves as animation clips that play', () => {
    const figure = buildFigure(DEFAULT_RECIPE)
    const clips = figureClips(figure)
    expect(clips.map((c) => c.name)).toEqual(expect.arrayContaining(['Idle', 'Walking_A', '1H_Melee_Attack_Chop', 'Spellcast_Shoot', 'Hit_A', 'Death_A', 'Death_A_Pose', 'Cheer']))
    const mixer = new THREE.AnimationMixer(figure)
    const fall = mixer.clipAction(clips.find((c) => c.name === 'Death_A'))
    fall.setLoop(THREE.LoopOnce, 1)
    fall.clampWhenFinished = true
    fall.play()
    mixer.update(2)
    // Lying down: the hips tipped over and lowered.
    expect(Math.abs(figure.userData.joints.hips.rotation.x)).toBeGreaterThan(1.2)
    expect(figure.userData.joints.hips.position.y).toBeLessThan(figure.userData.rest.hips.y - 0.3)
  })
})
