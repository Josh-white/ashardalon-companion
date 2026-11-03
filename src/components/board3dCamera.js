import * as THREE from 'three'
import { EYES_DIST, VIEWS, turnBy } from '../board/camera3d.js'

// The 3D board's camera (Board3D.jsx): fitting the dungeon, aiming at a shot, each
// screen's remembered choices (view, follow, drag, walls, hero figures), and taps.

// The camera looks over the whole dungeon from one side, tilted so the walls and standees
// stand up. A long dungeon on a wide screen is looked at from its side, so it runs across.
// iPads look more from above, so the near rock doesn't hide the squares you tap.
const TILT_BIG = 0.8 // radians from straight down
const CALM_TILT = 0.6
export function fitCamera(stage, bounds, aspect) {
  const TILT = stage.calm ? CALM_TILT : TILT_BIG
  const sideways = bounds.h > bounds.w * 1.2 && aspect > 1.1
  const across = (sideways ? bounds.h : bounds.w) + 1
  const deep = (sideways ? bounds.w : bounds.h) + 1
  const vfov = (stage.camera.fov * Math.PI) / 180
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect)
  const far = Math.max(across / 2 / Math.tan(hfov / 2), (deep * Math.cos(TILT) + 1) / 2 / Math.tan(vfov / 2)) * 1.12 + deep * Math.sin(TILT) * 0.3
  const back = Math.sin(TILT) * far
  // The near rows look bigger, so the middle of the view sits a little toward them.
  const lean = deep * 0.06
  stage.controls.target.set(sideways ? lean : 0, 0, sideways ? 0 : lean)
  stage.camera.position.set(sideways ? back + lean : 0, Math.cos(TILT) * far, sideways ? 0 : back + lean)
  stage.controls.maxDistance = Math.max(60, far * 2)
  stage.controls.update()
  stage.fitYaw = sideways ? Math.PI / 2 : 0
  stage.fitTilt = TILT
  stage.keep = cameraAngles(stage)
}

export const stillWanted = () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)

// A finger that moves further than this (pixels) is turning the camera, not tapping.
export const TAP_SLOP = 10

// What a tap at this point on the screen lands on: a figure, a marker's badge, a token,
// a lit square or a floor square (nearest first).
export function tapHit(stage, event) {
  const r = stage.renderer.domElement.getBoundingClientRect()
  const pointer = new THREE.Vector2(((event.clientX - r.left) / r.width) * 2 - 1, -((event.clientY - r.top) / r.height) * 2 + 1)
  const ray = new THREE.Raycaster()
  ray.setFromCamera(pointer, stage.camera)
  const hits = ray.intersectObjects([stage.figures, stage.extras, stage.lit, stage.dungeon], true)
  for (const hit of hits) {
    for (let o = hit.object; o; o = o.parent) {
      if (o.userData.figId) return { figure: o.userData.figId }
      if (o.userData.markerId) return { marker: o.userData.markerId }
      if (o.userData.itemId) return { item: o.userData.itemId }
      if (o.userData.square) return { square: o.userData.square }
      if (o.userData.floorSquares && hit.instanceId !== undefined) return { square: o.userData.floorSquares[hit.instanceId] }
    }
  }
  return {}
}

export const cornerButton = (calm) =>
  `rounded-lg border border-zinc-700 bg-zinc-950/70 text-zinc-300 hover:text-white ${calm ? 'px-3 py-1 text-sm' : 'px-[0.8vw] py-[0.3vw] text-[0.9vw]'}`

// Heroes and the monsters that have one as 3D figures, or all as standees with their token,
// per screen.
export const FIGURES_KEY = 'ashardalon-board3d-figures'
export function heroModelsWanted() {
  try {
    return localStorage.getItem(FIGURES_KEY) !== 'standees'
  } catch {
    return true
  }
}

// Whether walls between the camera and the floor drop low so nothing hides behind them
// ('shrink', at first) or always stay full height ('tall'), per screen (Colton's ask).
export const WALLS_KEY = 'ashardalon-board3d-walls'
export function wallsWanted() {
  try {
    return localStorage.getItem(WALLS_KEY) === 'tall' ? 'tall' : 'shrink'
  } catch {
    return 'shrink'
  }
}

// What one finger (or the left mouse button) does when it drags the 3D board, per screen:
// 'turn' the camera around the dungeon, or 'move' (slide) the board like the flat one.
// Two fingers or the right button always do the other one.
// Whether the camera slides along to the hero whose turn it is, per screen (on at first).
export const FOLLOW_KEY = 'ashardalon-board3d-follow'
export function followWanted() {
  try {
    return localStorage.getItem(FOLLOW_KEY) !== 'off'
  } catch {
    return true
  }
}

// The camera's angle now: { yaw, tilt, dist } around the point it looks at (board/camera3d.js).
export function cameraAngles(stage) {
  const o = stage.camera.position.clone().sub(stage.controls.target)
  const dist = o.length() || 1
  return { yaw: Math.atan2(o.x, o.z), tilt: Math.acos(Math.max(-1, Math.min(1, o.y / dist))), dist }
}

// The view picked on this screen with 🎥 (board/camera3d.js VIEWS).
export const VIEW_KEY = 'ashardalon-board3d-view'
export function viewWanted() {
  try {
    const v = localStorage.getItem(VIEW_KEY)
    return VIEWS.includes(v) ? v : 'top'
  } catch {
    return 'top'
  }
}

// How far the camera may lean from straight down: to eye level (and a little up) in the
// Hero eyes view. In Hero eyes the camera stays in the hero's head: a drag turns the head,
// and there's no zooming or sliding it away from the hero.
const MAX_TILT = 1.2
export function setMaxTilt(stage, view) {
  const eyes = view === 'eyes'
  const c = stage.controls
  c.maxPolarAngle = eyes ? Math.PI / 2 + 0.25 : MAX_TILT
  c.minDistance = eyes ? EYES_DIST * 0.9 : 3
  c.enableZoom = !eyes
  c.enablePan = !eyes
  setDragMode(c, stage.drag, view)
}

// Glides the camera to `shot` ({ target: [x, z], yaw, tilt, dist, lift? }) the short way round.
export function aimCamera(stage, shot, ms = 700) {
  const t = stage.controls.target
  const from = { x: t.x, y: t.y, z: t.z, ...cameraAngles(stage) }
  const to = { x: shot.target[0], y: shot.lift ?? 0, z: shot.target[1], yaw: from.yaw + turnBy(from.yaw, shot.yaw), tilt: Math.min(shot.tilt, stage.controls.maxPolarAngle), dist: shot.dist }
  const near = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z) < 0.03 && Math.abs(to.yaw - from.yaw) < 0.01 && Math.abs(to.tilt - from.tilt) < 0.01 && Math.abs(to.dist - from.dist) < 0.03
  stage.tweens = stage.tweens.filter((tw) => !tw.camera)
  if (near) return
  const put = (k) => {
    const e = 1 - (1 - k) ** 3
    const mix = (a, b) => a + (b - a) * e
    const yaw = mix(from.yaw, to.yaw)
    const tilt = mix(from.tilt, to.tilt)
    const dist = mix(from.dist, to.dist)
    t.set(mix(from.x, to.x), mix(from.y, to.y), mix(from.z, to.z))
    stage.camera.position.set(t.x + Math.sin(yaw) * Math.sin(tilt) * dist, t.y + Math.cos(tilt) * dist, t.z + Math.cos(yaw) * Math.sin(tilt) * dist)
    stage.controls.update()
  }
  if (stage.still || ms <= 0) {
    put(1)
    stage.render()
    return
  }
  stage.tweens.push({ camera: true, ms, step: put })
  stage.render()
}

export const DRAG_KEY = 'ashardalon-board3d-drag'
export function dragWanted() {
  try {
    return localStorage.getItem(DRAG_KEY) === 'move' ? 'move' : 'turn'
  } catch {
    return 'turn'
  }
}
export function setDragMode(controls, drag, view) {
  // Through the hero's eyes one finger always looks around.
  const move = drag === 'move' && view !== 'eyes'
  controls.mouseButtons = { LEFT: move ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: move ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN }
  controls.touches = { ONE: move ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE, TWO: move ? THREE.TOUCH.DOLLY_ROTATE : THREE.TOUCH.DOLLY_PAN }
}

// Sliding the board stops with the dungeon still in view: the point the camera looks at
// stays over the dungeon (plus a square or two), and the camera comes along with it.
export function keepOnBoard(stage) {
  const b = stage.bounds
  if (!b) return
  const t = stage.controls.target
  const x = Math.max(-b.w / 2 - 1, Math.min(b.w / 2 + 1, t.x))
  const z = Math.max(-b.h / 2 - 1, Math.min(b.h / 2 + 1, t.z))
  // Off the floor only as high as a Hero eyes look (camera3d.js lift).
  const y = Math.max(0, Math.min(1, t.y))
  if (x === t.x && z === t.z && y === t.y) return
  stage.camera.position.x += x - t.x
  stage.camera.position.y += y - t.y
  stage.camera.position.z += z - t.z
  t.set(x, y, z)
}
