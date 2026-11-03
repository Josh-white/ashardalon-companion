import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { STAIR_STEPS_PER_SQUARE, STAIR_TOP, boardExtras, boardFigures, boardLayout, restFacing, stairHeights, stairsRise } from '../board/scene3d.js'
import { STEP } from '../board/grid.js'
import { artUrl, useArt } from '../state/useArt.js'
import { TOKEN_COLORS } from './Board.jsx'
import { useAttackFx } from './AttackFx.jsx'
import { useHealFx } from './HealFx.jsx'
import { canvasTexture, playAttack3D, playExit3D, playHeal3D } from './board3dFx.js'
import { FLOOR_LOOKS, dressDungeon, hideTorches, stoneMaterials } from './dungeonLook3d.js'
import { attachModel, detachModel, face, setDown, setWalking, stepModels } from './figureModels.js'
import { FX_DELAY_MS, FX_MS, fxLeadMs } from '../board/attackFx.js'
import { closeUpShot, restShot, tourShot, turnBy, VIEW_LABELS, viewAngles, VIEWS } from '../board/camera3d.js'
import { IMPACT, msAt } from './attackFxDraw.js'
import { serverNow } from '../state/useSharedGame.js'

// The virtual board in 3D (three.js): the dungeon's stone floor and rock, walls along shut
// edges, the stairs, and every figure as a standee carrying its round token art. Attacks
// and heals play on it like on the flat board (board3dFx.js).
//
// It draws only when something changes (a figure walks, a tile goes down, someone drags the
// camera) plus the torches' flicker, which stops with Reduce Motion on. One floor block is
// drawn for every square at once (instancing), so a big dungeon costs little.
// `onFail` hands the screen back to the flat board when this device can't draw 3D.

const FLOOR_H = 0.16
const ROCK_H = 0.55
const WALL_H = 0.55
const TALL_H = 1.5
const CUT_H = 0.3

// A block whose sides repeat the brick pattern up its height (rather than stretching it).
function tallBox(w, h, d) {
  const box = new THREE.BoxGeometry(w, h, d)
  const uv = box.attributes.uv
  // Faces in order +x, -x, +y, -y, +z, -z, four corners each; the sides' v runs up the wall.
  for (const face of [0, 1, 4, 5]) for (let k = 0; k < 4; k++) uv.setY(face * 4 + k, uv.getY(face * 4 + k) * (h / ROCK_H))
  return box
}

const seeThrough = (mat) =>
  [].concat(mat).map((m) => {
    const c = m.clone()
    c.userData = {}
    c.transparent = true
    c.opacity = 0.22
    c.depthWrite = false
    return c
  })

// The side of a square that faces the camera: the way the camera looks from, to the
// nearest quarter turn (south when it hasn't been placed yet).
function frontSide(stage) {
  const cam = stage.camera?.position
  const target = stage.controls?.target
  if (!cam || !target || (cam.x === target.x && cam.z === target.z)) return 'S'
  const a = Math.atan2(cam.x - target.x, cam.z - target.z)
  const q = Math.round(a / (Math.PI / 2))
  return q === 0 ? 'S' : q === 1 ? 'E' : q === -1 ? 'W' : 'N'
}
const STEP_MS = 180
const TORCH_LIGHTS = 6

const seeded = (n) => {
  const s = Math.sin(n * 12.9898) * 43758.5453
  return s - Math.floor(s)
}

// A round token for a figure with no picture on the Pi: its colour and first letter.
function plainToken(figure, color) {
  return canvasTexture(256, 256, (g, w) => {
    g.fillStyle = '#1c1917'
    g.beginPath()
    g.arc(w / 2, w / 2, w / 2 - 2, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = color
    g.beginPath()
    g.arc(w / 2, w / 2, w / 2 - 14, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#fff'
    g.font = 'bold 120px Georgia, serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(figure.label.slice(0, 1).toUpperCase(), w / 2, w / 2 + 6)
  })
}

const FIGURE_COLORS = { monster: '#7f1d1d', villain: '#581c87', villager: '#065f46' }
const figureColor = (f) => (f.kind === 'hero' ? TOKEN_COLORS[f.color] ?? '#71717a' : FIGURE_COLORS[f.kind])

// Everything three.js needs, made once when the board opens.
// `calm` (iPads, phones, the table screen): no shadows, a little less sharp, and nothing
// moves unless a figure does, so the board costs nothing between moves (the iPad lag lesson).
function makeStage(mount, calm) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, calm ? 1.5 : 2))
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.shadowMap.enabled = !calm
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.domElement.style.display = 'block'
  renderer.domElement.style.width = '100%'
  renderer.domElement.style.height = '100%'
  renderer.domElement.style.touchAction = 'none'
  mount.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#0c0a09')
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200)
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.maxPolarAngle = 1.2
  controls.minDistance = 3
  controls.maxDistance = 60
  controls.screenSpacePanning = false

  const hemi = new THREE.HemisphereLight('#8a9bc4', '#2a1d12', 0.9)
  scene.add(hemi)
  const moon = new THREE.DirectionalLight('#c9d4ff', 0.55)
  moon.castShadow = !calm
  moon.shadow.mapSize.set(2048, 2048)
  scene.add(moon, moon.target)
  // The flash of a blow landing (board3dFx.js). Always there, dark until then: adding a
  // light later would make every material rebuild, a stutter right at the hit.
  const flash = new THREE.PointLight('#ffffff', 0, 7, 1.5)
  scene.add(flash)
  // The wall torches' real lights, big screen only, made now for the same reason; the
  // dungeon moves them to its torches (dungeonLook3d.js).
  const torchLights = calm ? [] : Array.from({ length: TORCH_LIGHTS }, () => new THREE.PointLight('#ff9a4a', 0, 4.5, 1.6))
  if (torchLights.length > 0) scene.add(...torchLights)

  const blob = canvasTexture(64, 64, (g, w) => {
    const r = g.createRadialGradient(w / 2, w / 2, 2, w / 2, w / 2, w / 2)
    r.addColorStop(0, 'rgba(0,0,0,0.75)')
    r.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = r
    g.fillRect(0, 0, w, w)
  })
  const dungeon = new THREE.Group()
  const extras = new THREE.Group()
  const figures = new THREE.Group()
  const lit = new THREE.Group()
  scene.add(dungeon, extras, lit, figures)
  return { renderer, scene, camera, controls, hemi, moon, flash, torchLights, blob, dungeon, extras, lit, figures, nodes: new Map(), textures: new Map(), tweens: [], animators: [], leaving: new Set(), center: new THREE.Vector3() }
}

const disposeTree = (root) =>
  root.traverse((o) => {
    o.geometry?.dispose()
    for (const m of [].concat(o.material ?? [])) if (!m.userData.shared) m.dispose()
  })

// The stone, rock, walls, open edges and stairs, rebuilt when a tile goes down or a door opens.
function buildDungeon(stage, layout) {
  const { dungeon } = stage
  disposeTree(dungeon)
  dungeon.clear()
  const { bounds } = layout
  const cx = bounds.x + bounds.w / 2
  const cy = bounds.y + bounds.h / 2
  stage.center.set(cx, 0, cy)
  const at = (x, y) => [x + 0.5 - cx, y + 0.5 - cy]
  stage.at = at
  stage.torchGroup = null

  const onExit = new Set(layout.exits.flatMap((e) => (e.type === 'stairs' ? e.squares.map(([x, y]) => `${x},${y}`) : [])))
  const floors = layout.squares.filter((s) => s.floor && !onExit.has(`${s.x},${s.y}`))
  const doors = layout.squares.filter((s) => s.door)
  const matrix = new THREE.Matrix4()
  const color = new THREE.Color()

  const stone = stage.look === 'plain' ? null : stoneMaterials()
  stage.floors = []
  const quarter = new THREE.Quaternion()
  const up = new THREE.Vector3(0, 1, 0)
  const one = new THREE.Vector3(1, 1, 1)
  // Carved flagstones: a few stone patterns, each square turned a random quarter-turn, one
  // instanced block per pattern. Plain: one grey block for all.
  const looks = stone ? FLOOR_LOOKS : 1
  for (let look = 0; look < looks; look++) {
    const mine = floors.filter((s) => (stone ? Math.floor(seeded(s.x * 11 + s.y * 23) * looks) === look : true))
    const mat = stone ? stone.floors[look] : new THREE.MeshStandardMaterial({ roughness: 0.92 })
    const floorMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.98, FLOOR_H, 0.98), mat, Math.max(mine.length, 1))
    floorMesh.count = mine.length
    mine.forEach((s, i) => {
      const [x, z] = at(s.x, s.y)
      // Stones sit a hair lower or higher, but never above 0, so marks on the floor always show.
      quarter.setFromAxisAngle(up, Math.floor(seeded(s.x * 5 + s.y * 9) * 4) * (Math.PI / 2))
      matrix.compose(new THREE.Vector3(x, -FLOOR_H / 2 - seeded(s.x * 7 + s.y) * 0.02, z), quarter, one)
      floorMesh.setMatrixAt(i, matrix)
      // Each tile gets its own shade of stone, so neighbouring tiles read apart (JJ).
      const v = (stone ? 0.82 + seeded(s.x * 31 + s.y * 17) * 0.3 : 0.34 + seeded(s.x * 31 + s.y * 17) * 0.1) * tileShade(s.tile)
      floorMesh.setColorAt(i, s.scorch ? color.setRGB(0.3, 0.2, 0.17) : color.setRGB(v * 1.03, v, v * 0.95))
    })
    floorMesh.receiveShadow = true
    floorMesh.userData.floorSquares = mine.map((f) => [f.x, f.y])
    stage.floors.push(floorMesh)
    dungeon.add(floorMesh)
  }

  // The rock and the walls go in their own group: on 'cutaway' they're rebuilt when the
  // camera swings round to another side (see the tick's frontSide check).
  stage.layout = layout
  stage.wallGroup = new THREE.Group()
  dungeon.add(stage.wallGroup)
  stage.front = frontSide(stage)
  buildWalls(stage)

  // A shut door: a banded wooden block on its square.
  const doorMat = new THREE.MeshStandardMaterial({ color: '#5b3a1e', roughness: 0.8 })
  for (const s of doors) {
    const [x, z] = at(s.x, s.y)
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.7, 0.96), doorMat)
    door.position.set(x, 0.35, z)
    door.castShadow = true
    dungeon.add(door)
  }

  // A dark groove where one tile meets the next, so you can see where each tile ends (JJ).
  const seams = layout.seams ?? []
  const seamMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.012, 0.14), new THREE.MeshBasicMaterial({ color: '#000000' }), Math.max(seams.length, 1))
  seamMesh.count = seams.length
  seams.forEach((w, i) => {
    const [x, z] = at(w.x, w.y)
    const across = w.side === 'E'
    quarter.setFromAxisAngle(up, across ? Math.PI / 2 : 0)
    matrix.compose(new THREE.Vector3(x + (across ? 0.5 : 0), 0.004, z + (across ? 0 : 0.5)), quarter, one)
    seamMesh.setMatrixAt(i, matrix)
  })
  dungeon.add(seamMesh)

  // Walls stand on the edge between squares (or round the outside of the dungeon).
  // Open edges glow cyan, like the flat board's: the next tile goes there.
  const edgeMat = new THREE.MeshBasicMaterial({ color: '#22d3ee', transparent: true, opacity: 0.55 })
  for (const e of layout.openEdges) {
    const [x, z] = at(e.x, e.y)
    const across = e.side === 'E' || e.side === 'W'
    const strip = new THREE.Mesh(new THREE.BoxGeometry(across ? 0.06 : 0.9, 0.03, across ? 0.9 : 0.06), edgeMat)
    strip.position.set(x + (e.side === 'E' ? 0.47 : e.side === 'W' ? -0.47 : 0), 0.015, z + (e.side === 'S' ? 0.47 : e.side === 'N' ? -0.47 : 0))
    dungeon.add(strip)
  }

  // Stairs standing up out of the floor (and a ladder lying on it).
  stage.heights = new Map()
  for (const exit of layout.exits) {
    const xs = exit.squares.map((s) => s[0])
    const ys = exit.squares.map((s) => s[1])
    const [x0, y0, x1, y1] = [Math.min(...xs), Math.min(...ys), Math.max(...xs) + 1, Math.max(...ys) + 1]
    const w = x1 - x0
    const h = y1 - y0
    const cxs = x0 + w / 2 - cx
    const czs = y0 + h / 2 - cy
    if (exit.type === 'ladder') {
      // A ladder: two rails and rungs lying on the floor.
      const wood = new THREE.MeshStandardMaterial({ color: '#6b4423', roughness: 0.9 })
      for (const side of [-1, 1]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, h - 0.2), wood)
        rail.position.set(cxs + side * (w / 2 - 0.2), 0.03, czs)
        dungeon.add(rail)
      }
      for (let i = 0; i < 5; i++) {
        const rung = new THREE.Mesh(new THREE.BoxGeometry(w - 0.4, 0.04, 0.06), wood)
        rung.position.set(cxs, 0.03, czs - h / 2 + 0.2 + (i * (h - 0.4)) / 4)
        dungeon.add(rung)
      }
      continue
    }
    buildStairs(stage, layout, exit, stone)
  }

  // Torches on the walls (and bones and rubble), with the board's darker torchlit air.
  // Torch lights left over (a small dungeon) stay dark.
  for (const light of stage.torchLights) light.intensity = 0
  stage.torchGroup = new THREE.Group()
  dungeon.add(stage.torchGroup)
  const tall = (stage.walls ?? 'low') !== 'low'
  stage.dungeonAnimators = stone && stage.look !== 'stone' ? dressDungeon(stage.torchGroup, layout, at, { lights: stage.torchLights, wallH: tall ? 1.05 : WALL_H, props: stage.look === 'full' }) : []
  hideTorches(stage.torchGroup, stage.walls === 'cutaway' ? stage.front : null)
  setAir(stage, stone && stage.look !== 'stone')

  // Shadows cover the whole dungeon.
  const span = Math.max(bounds.w, bounds.h) / 2 + 2
  Object.assign(stage.moon.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 1, far: span * 4 })
  stage.moon.shadow.camera.updateProjectionMatrix()
  stage.moon.position.set(-span * 0.6, span * 1.6, span * 0.5)
}

// The rock and walls (rebuilt on their own when the camera turns to another side and the
// walls nearest it get cut low).
function buildWalls(stage) {
  const { layout, at, wallGroup: dungeon } = stage
  disposeTree(dungeon)
  dungeon.clear()
  const stone = stage.look === 'plain' ? null : stoneMaterials()
  const rocks = layout.squares.filter((s) => !s.floor && !s.door)
  const matrix = new THREE.Matrix4()
  const color = new THREE.Color()
  const up = new THREE.Vector3(0, 1, 0)
  const one = new THREE.Vector3(1, 1, 1)
  // How tall the rock and walls stand (stage.walls): 'low' (under the figures), 'tall'
  // (over them), 'cutaway' (tall, but the ones between the camera and the floor stay low)
  // or 'fade' (tall, those ones see-through).
  const style = stage.walls ?? 'low'
  const high = style === 'low' ? ROCK_H : TALL_H
  const front = stage.front
  const floorAt = new Set(layout.squares.filter((s) => s.floor).map((s) => `${s.x},${s.y}`))
  // Rock in front of floor (between it and the camera) hides that floor.
  const rockFront = (s) => style !== 'low' && style !== 'tall' && floorAt.has(`${s.x - STEP[front][0]},${s.y - STEP[front][1]}`)
  const rockMat = stone ? stone.rock : new THREE.MeshStandardMaterial({ roughness: 1 })
  const rockSets = [
    [rocks.filter((s) => !rockFront(s)), high, rockMat],
    [rocks.filter(rockFront), style === 'cutaway' ? CUT_H : high, style === 'fade' ? seeThrough(rockMat) : rockMat],
  ]
  for (const [list, h, mat] of rockSets) {
    if (list.length === 0) continue
    const rockMesh = new THREE.InstancedMesh(tallBox(1, h, 1), mat, list.length)
    list.forEach((s, i) => {
      const [x, z] = at(s.x, s.y)
      matrix.makeTranslation(x, h / 2 - 0.1, z)
      rockMesh.setMatrixAt(i, matrix)
      const v = stone ? 0.75 + seeded(s.x * 13 + s.y * 3) * 0.3 : 0.16 + seeded(s.x * 13 + s.y * 3) * 0.06
      rockMesh.setColorAt(i, color.setRGB(v * 1.05, v, v * 0.95))
    })
    rockMesh.castShadow = true
    rockMesh.receiveShadow = true
    dungeon.add(rockMesh)
  }

  // A wall on the camera's side of its floor square hides that square.
  const wallFront = (w) => style !== 'low' && style !== 'tall' && w.side === front
  const wallMat = stone ? stone.wall : new THREE.MeshStandardMaterial({ color: '#3a322c', roughness: 1 })
  const turn = new THREE.Quaternion()
  const wallSets = [
    [layout.walls.filter((w) => !wallFront(w)), high, wallMat],
    [layout.walls.filter(wallFront), style === 'cutaway' ? CUT_H : high, style === 'fade' ? seeThrough(wallMat) : wallMat],
  ]
  for (const [list, h, mat] of wallSets) {
    if (list.length === 0) continue
    const wallMesh = new THREE.InstancedMesh(tallBox(1, h, stone ? 0.16 : 0.12), mat, list.length)
    list.forEach((w, i) => {
      const [x, z] = at(w.x, w.y)
      const dx = w.side === 'E' ? 0.5 : w.side === 'W' ? -0.5 : 0
      const dz = w.side === 'S' ? 0.5 : w.side === 'N' ? -0.5 : 0
      turn.setFromAxisAngle(up, dx ? Math.PI / 2 : 0)
      matrix.compose(new THREE.Vector3(x + dx, h / 2 - 0.1, z + dz), turn, one)
      wallMesh.setMatrixAt(i, matrix)
    })
    wallMesh.castShadow = true
    wallMesh.receiveShadow = true
    dungeon.add(wallMesh)
  }

  if (stage.torchGroup) hideTorches(stage.torchGroup, style === 'cutaway' ? front : null)
}

// A tile's own shade: a little lighter or darker than its neighbours, steady for the game.
function tileShade(tile) {
  const name = String(tile ?? '')
  let n = 0
  for (const ch of name) n = n * 31 + ch.charCodeAt(0)
  return 0.74 + seeded(n % 9973) * 0.42
}

// A flight of stairs standing up out of the floor (JJ: we're 3D now). The Start tile's come
// down from a dark doorway where the heroes came in; the Tunnel Exit's climb to a doorway
// with daylight in it. Every step knows its square, so a tap on it is a tap on that square,
// and a figure standing on a stair square stands on its step (stage.heights).
function buildStairs(stage, layout, exit, stone) {
  const side = stairsRise(layout, exit.squares)
  const heights = stairHeights(exit.squares, side)
  const [dx, dz] = STEP[side]
  const along = ([x, y]) => x * dx + y * dz
  const lows = Math.min(...exit.squares.map(along))
  const run = Math.max(...exit.squares.map(along)) - lows + 1
  const rise = STAIR_TOP / (run * STAIR_STEPS_PER_SQUARE)
  const sideways = dx !== 0
  const mat = stone
    ? [stone.rock[0], stone.rock[0], stone.steps, stone.steps, stone.rock[0], stone.rock[0]]
    : new THREE.MeshStandardMaterial({ color: '#57534e', roughness: 0.9 })
  for (const sq of exit.squares) {
    const [x, z] = stage.at(sq[0], sq[1])
    stage.heights.set(`${sq[0]},${sq[1]}`, heights[`${sq[0]},${sq[1]}`])
    for (let k = 0; k < STAIR_STEPS_PER_SQUARE; k++) {
      const i = (along(sq) - lows) * STAIR_STEPS_PER_SQUARE + k
      const top = (i + 1) * rise
      const deep = 1 / STAIR_STEPS_PER_SQUARE
      const tall = top + FLOOR_H
      const step = new THREE.Mesh(new THREE.BoxGeometry(sideways ? deep : 0.98, tall, sideways ? 0.98 : deep), mat)
      const off = -0.5 + (k + 0.5) * deep
      step.position.set(x + dx * off, top - tall / 2, z + dz * off)
      step.castShadow = true
      step.receiveShadow = true
      step.userData.square = sq
      stage.dungeon.add(step)
    }
  }
  // The doorway at the top of the flight.
  const xs = exit.squares.map(([x]) => x)
  const ys = exit.squares.map(([, y]) => y)
  const [cx, cz] = stage.at((Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2)
  const span = sideways ? Math.max(...ys) - Math.min(...ys) + 1 : Math.max(...xs) - Math.min(...xs) + 1
  const edge = run / 2
  const door = new THREE.Group()
  door.position.set(cx + dx * edge, 0, cz + dz * edge)
  door.rotation.y = Math.atan2(-dx, -dz)
  const high = STAIR_TOP + 0.7
  const frame = stone ? stone.rock : new THREE.MeshStandardMaterial({ color: '#44403c', roughness: 1 })
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, high, 0.2), frame)
    post.position.set(s * (span / 2 - 0.08), high / 2 - FLOOR_H, 0.08)
    post.castShadow = true
    door.add(post)
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(span, 0.18, 0.22), frame)
  lintel.position.set(0, high - FLOOR_H, 0.08)
  lintel.castShadow = true
  const way = exit.entrance ? new THREE.MeshBasicMaterial({ color: '#030203' }) : new THREE.MeshBasicMaterial({ color: '#cfe3ff' })
  const opening = new THREE.Mesh(new THREE.PlaneGeometry(span - 0.4, high - STAIR_TOP + 0.05), way)
  opening.position.set(0, STAIR_TOP + (high - STAIR_TOP) / 2 - 0.08, -0.02)
  door.add(lintel, opening)
  if (!exit.entrance) {
    // Daylight spilling down the stairs from the way out.
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(span, run),
      new THREE.MeshBasicMaterial({ color: '#bcd6ff', transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false }),
    )
    glow.rotation.x = -Math.PI / 2 + Math.atan2(STAIR_TOP, run)
    glow.position.set(0, STAIR_TOP / 2 + 0.03, run / 2)
    door.add(glow)
  }
  stage.dungeon.add(door)
}

// Torchlit: a dimmer room, so the torches still show. Calm screens (phones, iPads)
// have no real torch lights and small, often dim screens, so they stay much brighter (JJ:
// too dark on the phone). No fog: with the camera pulled back to fit a long dungeon on a
// narrow screen it swallowed the whole board.
function setAir(stage, torchlit) {
  const calm = stage.calm
  // JJ (twice): still too dark on the projector and the phone, so both get more fill light.
  stage.hemi.intensity = torchlit ? (calm ? 2 : 1.4) : 0.9
  stage.moon.intensity = torchlit ? (calm ? 1 : 0.75) : 0.55
  stage.scene.fog = null
  stage.renderer.toneMappingExposure = torchlit ? (calm ? 1.9 : 1.5) : 1
  stage.scene.background.set(torchlit ? '#07060a' : '#0c0a09')
}

function texture(stage, url, figure) {
  const cacheKey = url ?? `plain:${figure.label}:${figureColor(figure)}`
  if (!stage.textures.has(cacheKey)) {
    if (url) {
      const tex = new THREE.TextureLoader().load(url, () => stage.render(), undefined, () => {
        // The picture didn't load: fall back to the plain token.
        const plain = plainToken(figure, figureColor(figure))
        tex.image = plain.image
        tex.needsUpdate = true
        stage.render()
      })
      tex.colorSpace = THREE.SRGBColorSpace
      stage.textures.set(cacheKey, tex)
    } else {
      stage.textures.set(cacheKey, plainToken(figure, figureColor(figure)))
    }
  }
  return stage.textures.get(cacheKey)
}

// An emoji on a round dark badge (a marker's), or bare (a condition), always facing the
// camera and drawn over the walls so it never hides. Pictures are kept for reuse.
function iconTexture(stage, icon, ring, count) {
  const cacheKey = `icon:${icon}:${ring ?? ''}:${count ?? ''}`
  if (!stage.textures.has(cacheKey)) {
    stage.textures.set(
      cacheKey,
      canvasTexture(128, 128, (g, w) => {
        if (ring) {
          g.fillStyle = '#18181b'
          g.strokeStyle = ring
          g.lineWidth = 10
          g.beginPath()
          g.arc(w / 2, w / 2, w / 2 - 8, 0, Math.PI * 2)
          g.fill()
          g.stroke()
        }
        g.font = `${ring ? 62 : 92}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`
        g.textAlign = 'center'
        g.textBaseline = 'middle'
        g.fillText(icon, w / 2, w / 2 + 4)
        if (count) {
          g.font = 'bold 44px sans-serif'
          g.lineWidth = 8
          g.strokeStyle = '#0a0c10'
          g.fillStyle = '#fde68a'
          g.strokeText(String(count), w - 26, 30)
          g.fillText(String(count), w - 26, 30)
        }
      }),
    )
  }
  return stage.textures.get(cacheKey)
}

function iconSprite(stage, icon, size, ring, count) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconTexture(stage, icon, ring, count), transparent: true, depthTest: false }))
  sprite.scale.set(size, size, 1)
  sprite.renderOrder = 10
  return sprite
}

const squarePlane = (material, x, z, y, size = 0.96) => {
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material)
  plane.rotation.x = -Math.PI / 2
  plane.position.set(x, y, z)
  return plane
}

// A defeated monster's picture for its falling standee (kept for next time), or a plain
// dark token when the Pi has none.
function cachedPicture(stage, url) {
  return texture(stage, url, { label: '?', kind: 'monster' })
}

// Markers, tokens and the way out, rebuilt whenever one of them changes. Lava glows and
// shimmers, vapors drift and the open way out pulses (all still with Reduce Motion on).
function buildExtras(stage, extras) {
  const group = stage.extras
  disposeTree(group)
  group.clear()
  stage.animators = []
  const at = stage.at
  for (const m of extras.markers) {
    const centre = m.squares.reduce((c, [x, y]) => [c[0] + x / m.squares.length, c[1] + y / m.squares.length], [0, 0])
    if (m.floor === 'lava') {
      const lava = new THREE.MeshStandardMaterial({ color: '#7f1d1d', emissive: '#ff4d00', emissiveIntensity: 1.1, roughness: 0.5 })
      for (const [x, y] of m.squares) group.add(squarePlane(lava, ...at(x, y), 0.006))
      const glow = new THREE.PointLight('#ff5a1f', 3, 5, 1.4)
      const [gx, gz] = at(centre[0], centre[1])
      glow.position.set(gx, 0.8, gz)
      group.add(glow)
      stage.animators.push((now) => {
        lava.emissiveIntensity = 1 + Math.sin(now / 600) * 0.3 + Math.sin(now / 230) * 0.1
        glow.intensity = 3 + Math.sin(now / 400) * 0.6
      })
    } else if (m.floor === 'vapors') {
      const fog = new THREE.MeshBasicMaterial({ color: '#d9f99d', transparent: true, opacity: 0.34, depthWrite: false })
      for (const [x, y] of m.squares) {
        const [px, pz] = at(x, y)
        const puff = squarePlane(fog, px, pz, 0.25 + seeded(x * 5 + y) * 0.15, 1)
        group.add(puff)
        const phase = seeded(x * 11 + y * 7) * 6
        stage.animators.push((now) => {
          puff.position.y = 0.25 + Math.sin(now / 900 + phase) * 0.08
        })
      }
      stage.animators.push((now) => {
        fog.opacity = 0.3 + Math.sin(now / 1100) * 0.08
      })
    } else if (m.floor === 'rubble') {
      const stone = new THREE.MeshStandardMaterial({ color: '#78716c', roughness: 1 })
      for (const [x, y] of m.squares) {
        const [px, pz] = at(x, y)
        for (let i = 0; i < 3; i++) {
          const r = seeded(x * 17 + y * 5 + i)
          const rock = new THREE.Mesh(new THREE.BoxGeometry(0.16 + r * 0.14, 0.1 + r * 0.1, 0.14 + r * 0.12), stone)
          rock.position.set(px + (seeded(x + i * 3 + y * 13) - 0.5) * 0.6, 0.06, pz + (seeded(y + i * 7 + x * 3) - 0.5) * 0.6)
          rock.rotation.y = r * 3
          rock.castShadow = true
          group.add(rock)
        }
      }
    } else if (m.floor === 'pit') {
      // One hole, on the square nearest the tile's middle that isn't the scorch mark.
      const scorch = new Set(m.scorch.map(([x, y]) => `${x},${y}`))
      const spot = m.squares.filter(([x, y]) => !scorch.has(`${x},${y}`)).sort((a, b) => Math.hypot(a[0] - centre[0], a[1] - centre[1]) - Math.hypot(b[0] - centre[0], b[1] - centre[1]))[0]
      if (spot) {
        const [px, pz] = at(...spot)
        const rim = new THREE.Mesh(new THREE.CircleGeometry(0.46, 32), new THREE.MeshStandardMaterial({ color: '#3f2a1c', roughness: 1 }))
        rim.rotation.x = -Math.PI / 2
        rim.position.set(px, 0.006, pz)
        const hole = new THREE.Mesh(new THREE.CircleGeometry(0.38, 32), new THREE.MeshBasicMaterial({ color: '#000000' }))
        hole.rotation.x = -Math.PI / 2
        hole.position.set(px, 0.008, pz)
        group.add(rim, hole)
      }
    } else {
      const tint = new THREE.MeshBasicMaterial({ color: m.color, transparent: true, opacity: 0.3, depthWrite: false })
      for (const [x, y] of m.squares) group.add(squarePlane(tint, ...at(x, y), 0.006))
      const xs = m.squares.map(([x]) => x)
      const ys = m.squares.map(([, y]) => y)
      const [x0, y0, x1, y1] = [Math.min(...xs), Math.min(...ys), Math.max(...xs) + 1, Math.max(...ys) + 1]
      const [ox, oz] = at(x0 - 0.5, y0 - 0.5)
      const edge = new THREE.MeshBasicMaterial({ color: m.color })
      for (const [w, d, x, z] of [[x1 - x0, 0.05, (x1 - x0) / 2, 0.03], [x1 - x0, 0.05, (x1 - x0) / 2, y1 - y0 - 0.03], [0.05, y1 - y0, 0.03, (y1 - y0) / 2], [0.05, y1 - y0, x1 - x0 - 0.03, (y1 - y0) / 2]]) {
        const line = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, d), edge)
        line.position.set(ox + x, 0.012, oz + z)
        group.add(line)
      }
    }
    const badge = iconSprite(stage, m.icon, m.badge.small ? 0.4 : 0.8, m.color)
    badge.userData.markerId = m.id
    const [bx, bz] = at(m.badge.at[0], m.badge.at[1])
    badge.position.set(bx, m.badge.small ? 0.3 : 0.5, bz)
    group.add(badge)
  }
  for (const item of extras.items) {
    const [px, pz] = at(item.at[0], item.at[1])
    const before = group.children.length
    if (item.kind === 'carpet') {
      const fringe = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.02, 0.96), new THREE.MeshStandardMaterial({ color: '#fbbf24' }))
      fringe.position.set(px, 0.01, pz)
      const rug = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.03, 0.88), new THREE.MeshStandardMaterial({ color: '#7c3aed', roughness: 0.9 }))
      rug.position.set(px, 0.02, pz)
      group.add(fringe, rug)
    } else if (item.kind === 'treasure') {
      const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.06, 28), new THREE.MeshStandardMaterial({ color: '#f59e0b', metalness: 0.8, roughness: 0.3 }))
      coin.position.set(px, 0.03, pz)
      coin.castShadow = true
      const icon = iconSprite(stage, '💰', 0.36)
      icon.position.set(px, 0.32, pz)
      group.add(coin, icon)
    } else {
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 28), new THREE.MeshStandardMaterial({ color: item.color, roughness: 0.7 }))
      disc.position.set(px, 0.025, pz)
      const icon = iconSprite(stage, item.icon, 0.42, undefined, item.count)
      icon.position.set(px, 0.36, pz)
      group.add(disc, icon)
    }
    for (const part of group.children.slice(before)) part.userData.itemId = item.id
  }
  for (const q of extras.quests) {
    const [px, pz] = at(q.at[0], q.at[1])
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 28), new THREE.MeshStandardMaterial({ color: '#0e7490', emissive: '#0e7490', emissiveIntensity: 0.4 }))
    disc.position.set(px, 0.03, pz)
    const icon = iconSprite(stage, '⚙️', 0.45, '#fde047')
    icon.position.set(px, 0.42, pz)
    group.add(disc, icon)
    stage.animators.push((now) => {
      icon.position.y = 0.42 + Math.sin(now / 500) * 0.05
    })
  }
  if (extras.exits.squares.length > 0) {
    const open = extras.exits.open
    const glow = new THREE.MeshBasicMaterial({ color: '#10b981', transparent: true, opacity: open ? 0.4 : 0.12, depthWrite: false })
    for (const [x, y] of extras.exits.squares) group.add(squarePlane(glow, ...at(x, y), 0.02, 0.9))
    if (open) stage.animators.push((now) => (glow.opacity = 0.3 + Math.sin(now / 320) * 0.15))
  }
}

// The squares a tap can go to, lit green like the flat board's.
function buildLit(stage, targets) {
  const group = stage.lit
  disposeTree(group)
  group.clear()
  const mat = new THREE.MeshBasicMaterial({ color: '#34d399', transparent: true, opacity: 0.6, depthWrite: false })
  for (const k of targets) {
    const [x, y] = k.split(',').map(Number)
    const plane = squarePlane(mat, ...stage.at(x, y), 0.04 + (stage.heights?.get(k) ?? 0), 0.9)
    plane.userData.square = [x, y]
    group.add(plane)
  }
}

// Condition icons in a row over a figure's head.
function setIcons(stage, node, icons) {
  const wanted = icons.join('')
  if (node.userData.iconKey === wanted) return
  node.userData.iconKey = wanted
  const row = node.userData.icons
  disposeTree(row)
  row.clear()
  icons.forEach((icon, i) => {
    const sprite = iconSprite(stage, icon, 0.4)
    sprite.position.set((i - (icons.length - 1) / 2) * 0.36, 0, 0)
    row.add(sprite)
  })
}

// The Cage curse: iron bars round the hero's square. It drops in from above when the hero is
// caged and lifts away when they get out.
const CAGE_H = 1.3
function makeCage() {
  const cage = new THREE.Group()
  const iron = new THREE.MeshStandardMaterial({ color: '#3f3f46', metalness: 0.7, roughness: 0.45 })
  const rust = new THREE.MeshStandardMaterial({ color: '#7c2d12', metalness: 0.4, roughness: 0.7 })
  const R = 0.44
  const BARS = 12
  const bar = new THREE.CylinderGeometry(0.022, 0.022, CAGE_H, 8)
  for (let i = 0; i < BARS; i++) {
    const a = (i / BARS) * Math.PI * 2
    const m = new THREE.Mesh(bar, iron)
    m.position.set(Math.cos(a) * R, CAGE_H / 2, Math.sin(a) * R)
    m.castShadow = true
    cage.add(m)
  }
  for (const [y, mat] of [[0.03, rust], [CAGE_H * 0.55, iron], [CAGE_H, rust]]) {
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(R, 0.035, 8, 36), mat)
    hoop.rotation.x = Math.PI / 2
    hoop.position.y = y
    cage.add(hoop)
  }
  // A domed top with a ring to hang it by.
  const dome = new THREE.Mesh(new THREE.SphereGeometry(R, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#27272a', metalness: 0.6, roughness: 0.5, wireframe: true }))
  dome.position.y = CAGE_H
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.025, 8, 20), rust)
  hook.position.y = CAGE_H + R + 0.06
  cage.add(dome, hook)
  return cage
}

function setCaged(stage, node, on) {
  if (Boolean(node.userData.cage) === on) return
  const icons = node.userData.icons
  stage.tweens = stage.tweens.filter((t) => t.cageOf !== node)
  if (on) {
    const cage = makeCage()
    node.userData.cage = cage
    node.add(cage)
    icons.position.y = CAGE_H + 0.75
    const drop = 2.2
    cage.position.y = stage.still ? 0 : drop
    if (!stage.still) {
      // Falls with a little bounce when it lands.
      stage.tweens.push({ cageOf: node, ms: 650, step: (k) => (cage.position.y = k < 0.8 ? drop * (1 - (k / 0.8) ** 2) : Math.sin(((k - 0.8) / 0.2) * Math.PI) * 0.08) })
    }
  } else {
    const cage = node.userData.cage
    node.userData.cage = null
    icons.position.y = node.userData.kind === 'villain' ? 1.45 : 1.12
    const gone = () => (node.remove(cage), disposeTree(cage))
    if (stage.still) gone()
    else stage.tweens.push({ cageOf: node, ms: 600, step: (k) => (cage.position.y = k * k * 2.4, k >= 1 && gone()) })
  }
  stage.render()
}

// A standee: the round token standing up on a coloured base, with a soft shadow and a ring
// that lights for the hero whose turn it is (gold) or the monster acting (orange).
function makeStandee(stage, figure, url) {
  const node = new THREE.Group()
  node.userData.figId = figure.id
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.95), new THREE.MeshBasicMaterial({ map: stage.blob, transparent: true, depthWrite: false }))
  shadow.rotation.x = -Math.PI / 2
  shadow.position.y = 0.005
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.48, 40), new THREE.MeshBasicMaterial({ color: '#fbbf24', transparent: true, opacity: 0.95 }))
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.012
  ring.visible = false
  const body = new THREE.Group()
  const baseMat = new THREE.MeshStandardMaterial({ color: figureColor(figure), roughness: 0.6 })
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.37, 0.08, 28), baseMat)
  base.position.y = 0.04
  base.castShadow = true
  const card = new THREE.Group()
  card.position.y = 0.52
  const back = new THREE.Mesh(new THREE.CircleGeometry(0.44, 40), new THREE.MeshStandardMaterial({ color: '#1c1917', side: THREE.DoubleSide }))
  back.castShadow = true
  const faceMat = new THREE.MeshStandardMaterial({ map: texture(stage, url, figure), transparent: true, alphaTest: 0.4, roughness: 0.7 })
  const front = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.84), faceMat)
  front.position.z = 0.006
  const rear = front.clone()
  rear.rotation.y = Math.PI
  rear.position.z = -0.006
  card.add(back, front, rear)
  card.userData.billboard = true
  body.add(base, card)
  if (figure.kind === 'villain') body.scale.setScalar(1.3)
  const icons = new THREE.Group()
  icons.position.y = figure.kind === 'villain' ? 1.45 : 1.12
  node.add(shadow, ring, body, icons)
  if (figure.kind === 'hero') {
    const torch = new THREE.PointLight('#ff9a3c', 6, 8, 1.2)
    torch.position.set(0, 1.3, 0)
    node.add(torch)
    node.userData.torch = torch
  }
  Object.assign(node.userData, { ring, body, card, baseMat, faceMat, url, icons, kind: figure.kind })
  return node
}

// A figure taken off the board: its pictures stay for next time, a figure still loading
// is not put on.
function forget(node) {
  node.userData.disposed = true
  clearTimeout(node.userData.fallTimer)
  detachModel(node)
  disposeTree(node)
}

// Figures come, go and walk to their new squares. `fallAt(figure)`: when a hero who just
// dropped to 0 HP should fall over (after the attack animation that downs them), in ms.
function syncFigures(stage, figures, art, fallAt, killedAt = () => false) {
  const seen = new Set()
  for (const f of figures) {
    seen.add(f.id)
    const url = f.art ? artUrl(art, f.art) : null
    const look = stage.heroModels && f.model ? f.model : null
    // Compared by what it says: boardFigures makes a new look object every time the game
    // changes, and a figure rebuilt then has no moves yet for the attack about to play.
    const lookKey = look ? JSON.stringify(look) : null
    let node = stage.nodes.get(f.id)
    if (node && (node.userData.url !== url || node.userData.lookKey !== lookKey)) {
      stage.figures.remove(node)
      forget(node)
      stage.nodes.delete(f.id)
      node = null
    }
    const [x, z] = stage.at(f.at[0], f.at[1])
    // On a stair square a figure stands on its step.
    const to = new THREE.Vector3(x, stage.heights?.get(`${f.at[0]},${f.at[1]}`) ?? 0, z)
    if (!node) {
      node = makeStandee(stage, f, url)
      node.position.copy(to)
      node.userData.look = look
      node.userData.lookKey = lookKey
      stage.figures.add(node)
      stage.nodes.set(f.id, node)
      if (look) {
        const n = node
        attachModel(n, look, figureColor(f), () => {
          // A new figure looks at its foe, or at the camera (so its face shows) when there's none.
          face(n, stage.camera.position.x - n.position.x, stage.camera.position.z - n.position.z)
          lookAtRest(stage, n, true)
          setDown(n, n.userData.faded)
          stage.render()
        })
      }
    } else if (node.position.distanceTo(to) > 0.01) {
      glide(stage, node, to)
    }
    node.userData.at = f.at
    const { ring, faceMat, baseMat } = node.userData
    ring.visible = Boolean(f.active || f.acting || f.selected)
    ring.material.color.set(f.selected ? '#34d399' : f.acting ? '#fb923c' : '#fbbf24')
    faceMat.opacity = f.faded ? 0.35 : 1
    baseMat.color.set(f.faded ? '#3f3f46' : figureColor(f))
    if (node.userData.torch) node.userData.torch.visible = !f.faded
    if (node.userData.faded !== f.faded) {
      node.userData.faded = f.faded
      clearTimeout(node.userData.fallTimer)
      const wait = f.faded ? fallAt(f) : 0
      if (wait > 0) node.userData.fallTimer = setTimeout(() => (setDown(node, true), stage.render()), wait)
      else setDown(node, f.faded)
    }
    setIcons(stage, node, f.icons ?? [])
    if (f.kind === 'hero') setCaged(stage, node, Boolean(f.caged))
  }
  for (const [id, node] of stage.nodes) {
    if (seen.has(id)) continue
    stage.nodes.delete(id)
    // A figure taken off the board stays a moment for its way out. One defeated by the
    // attack about to play waits for the blow (board3dFx.js falls, crumbles or sinks it);
    // any other goes through a portal, or (a hero) up a beam of light.
    if (!stage.still && !node.userData.anim?.down) {
      stage.leaving.add(node)
      node.userData.ring.visible = false
      node.userData.figId = null
      const gone = () => {
        clearTimeout(node.userData.leaveTimer)
        if (!stage.leaving.delete(node)) return
        stage.figures.remove(node)
        forget(node)
        stage.render()
      }
      node.userData.gone = gone
      const exit = () => {
        if (node.userData.claimed || !stage.leaving.has(node)) return
        node.userData.claimed = true
        playExit3D(stage, node, gone)
      }
      if (killedAt(node.userData.at)) node.userData.leaveTimer = setTimeout(exit, FX_DELAY_MS + 3500)
      else exit()
      continue
    }
    stage.figures.remove(node)
    forget(node)
  }
}

// A figure standing still turns (quickly) to look at its foe (restFacing in scene3d.js).
// Walking, attacking or lying down it doesn't: those face their own way.
function lookAtRest(stage, node, now = false) {
  const anim = node.userData.anim
  const target = node.userData.lookAt
  if (!node.userData.model || !target || anim?.down || (anim?.busy && anim.state !== 'idle')) return
  const [x, z] = stage.at(target[0], target[1])
  const dx = x - node.position.x
  const dz = z - node.position.z
  if (Math.abs(dx) < 1e-3 && Math.abs(dz) < 1e-3) return
  const model = node.userData.model
  const from = model.rotation.y
  // The short way round.
  let to = Math.atan2(dx, dz)
  to = from + ((((to - from + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI
  if (Math.abs(to - from) < 0.01) return
  stage.tweens = stage.tweens.filter((t) => t.turn !== node)
  if (now || stage.still) {
    model.rotation.y = to
    stage.render()
    return
  }
  stage.tweens.push({ turn: node, ms: 260, step: (k) => (model.rotation.y = from + (to - from) * (1 - (1 - k) * (1 - k))) })
  stage.render()
}

// A figure hops to its new square (a hop per square, so a walk looks like steps).
function glide(stage, node, to) {
  stage.tweens = stage.tweens.filter((t) => t.node !== node)
  const from = node.position.clone()
  const hops = Math.max(1, Math.round(from.distanceTo(to)))
  const ms = stage.still ? 1 : Math.min(hops, 6) * STEP_MS * (node.userData.model ? 1.6 : 1)
  // A hero figure walks there, facing the way it goes; a standee hops.
  const walker = Boolean(node.userData.model)
  if (walker) {
    face(node, to.x - from.x, to.z - from.z)
    if (!stage.still) setWalking(node, true)
  }
  stage.tweens.push({
    node,
    ms,
    step: (k) => {
      node.position.lerpVectors(from, to, k)
      node.userData.body.position.y = stage.still || walker ? 0 : Math.abs(Math.sin(k * Math.PI * hops)) * 0.12
      if (k >= 1 && walker) {
        setWalking(node, false)
        lookAtRest(stage, node)
      }
    },
  })
  stage.render()
}

// The camera looks over the whole dungeon from one side, tilted so the walls and standees
// stand up. A long dungeon on a wide screen is looked at from its side, so it runs across.
// iPads look more from above, so the near rock doesn't hide the squares you tap.
const TILT_BIG = 0.8 // radians from straight down
const CALM_TILT = 0.6
function fitCamera(stage, bounds, aspect) {
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

const stillWanted = () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)

// Drawing slower than this on average (milliseconds a frame, while something moves) means
// this device is better off with the flat board.
const SLOW_FRAME_MS = 45
const SLOW_SAMPLE = 40
// A finger that moves further than this (pixels) is turning the camera, not tapping.
const TAP_SLOP = 10

// What a tap at this point on the screen lands on: a figure, a marker's badge, a token,
// a lit square or a floor square (nearest first).
function tapHit(stage, event) {
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

const cornerButton = (calm) =>
  `rounded-lg border border-zinc-700 bg-zinc-950/70 text-zinc-300 hover:text-white ${calm ? 'px-3 py-1 text-sm' : 'px-[0.8vw] py-[0.3vw] text-[0.9vw]'}`

// Heroes and the monsters that have one as 3D figures, or all as standees with their token,
// per screen.
const FIGURES_KEY = 'ashardalon-board3d-figures'
function heroModelsWanted() {
  try {
    return localStorage.getItem(FIGURES_KEY) !== 'standees'
  } catch {
    return true
  }
}

// What one finger (or the left mouse button) does when it drags the 3D board, per screen:
// 'turn' the camera around the dungeon, or 'move' (slide) the board like the flat one.
// Two fingers or the right button always do the other one.
// Whether the camera slides along to the hero whose turn it is, per screen (on at first).
const FOLLOW_KEY = 'ashardalon-board3d-follow'
function followWanted() {
  try {
    return localStorage.getItem(FOLLOW_KEY) !== 'off'
  } catch {
    return true
  }
}

// The camera's angle now: { yaw, tilt, dist } around the point it looks at (board/camera3d.js).
function cameraAngles(stage) {
  const o = stage.camera.position.clone().sub(stage.controls.target)
  const dist = o.length() || 1
  return { yaw: Math.atan2(o.x, o.z), tilt: Math.acos(Math.max(-1, Math.min(1, o.y / dist))), dist }
}

// The view picked on this screen with 🎥 (board/camera3d.js VIEWS).
const VIEW_KEY = 'ashardalon-board3d-view'
function viewWanted() {
  try {
    const v = localStorage.getItem(VIEW_KEY)
    return VIEWS.includes(v) ? v : 'top'
  } catch {
    return 'top'
  }
}

// Glides the camera to `shot` ({ target: [x, z], yaw, tilt, dist }) the short way round.
function aimCamera(stage, shot, ms = 700) {
  const t = stage.controls.target
  const from = { x: t.x, z: t.z, ...cameraAngles(stage) }
  const to = { x: shot.target[0], z: shot.target[1], yaw: from.yaw + turnBy(from.yaw, shot.yaw), tilt: Math.min(shot.tilt, stage.controls.maxPolarAngle), dist: shot.dist }
  const near = Math.hypot(to.x - from.x, to.z - from.z) < 0.03 && Math.abs(to.yaw - from.yaw) < 0.01 && Math.abs(to.tilt - from.tilt) < 0.01 && Math.abs(to.dist - from.dist) < 0.03
  stage.tweens = stage.tweens.filter((tw) => !tw.camera)
  if (near) return
  const put = (k) => {
    const e = 1 - (1 - k) ** 3
    const mix = (a, b) => a + (b - a) * e
    const yaw = mix(from.yaw, to.yaw)
    const tilt = mix(from.tilt, to.tilt)
    const dist = mix(from.dist, to.dist)
    t.set(mix(from.x, to.x), 0, mix(from.z, to.z))
    stage.camera.position.set(t.x + Math.sin(yaw) * Math.sin(tilt) * dist, Math.cos(tilt) * dist, t.z + Math.cos(yaw) * Math.sin(tilt) * dist)
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

const DRAG_KEY = 'ashardalon-board3d-drag'
function dragWanted() {
  try {
    return localStorage.getItem(DRAG_KEY) === 'move' ? 'move' : 'turn'
  } catch {
    return 'turn'
  }
}
function setDragMode(controls, drag) {
  const move = drag === 'move'
  controls.mouseButtons = { LEFT: move ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: move ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN }
  controls.touches = { ONE: move ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE, TWO: move ? THREE.TOUCH.DOLLY_ROTATE : THREE.TOUCH.DOLLY_PAN }
}

// Sliding the board stops with the dungeon still in view: the point the camera looks at
// stays over the dungeon (plus a square or two), and the camera comes along with it.
function keepOnBoard(stage) {
  const b = stage.bounds
  if (!b) return
  const t = stage.controls.target
  const x = Math.max(-b.w / 2 - 1, Math.min(b.w / 2 + 1, t.x))
  const z = Math.max(-b.h / 2 - 1, Math.min(b.h / 2 + 1, t.z))
  if (x === t.x && z === t.z && t.y === 0) return
  stage.camera.position.x += x - t.x
  stage.camera.position.z += z - t.z
  stage.camera.position.y -= t.y
  t.set(x, 0, z)
}

// Whether the attack about to play (or playing) defeats the figure on square `at`.
function killedBy(moment, at) {
  if (!moment?.fx || !at || serverNow() - moment.at > fxLeadMs(moment) + FX_DELAY_MS + FX_MS) return false
  return moment.fx.shots.some((s) => s.result === 'kill' && s.to[0] === at[0] && s.to[1] === at[1])
}

// A hero downed by an attack falls when the animation's blow lands, not when the die is
// rolled (the board already knows they're at 0 HP by then). Ms from now, 0 for at once.
function fallDelay(moment, at) {
  const shot = moment?.fx?.shots.find((s) => s.result === 'down' && s.to[0] === at[0] && s.to[1] === at[1])
  if (!shot) return 0
  return Math.max(0, moment.at + fxLeadMs(moment) + FX_DELAY_MS + msAt(IMPACT + 0.25) - serverNow())
}

// `taps` (a board that moves figures): { targets, selected, onSquare, onFigure, onItem,
// onMarker, onBackground }, the same handlers the flat board uses. `calm`: see makeStage.
export default function Board3D({ state, onFail, onSlow, taps = null, calm = false, look = 'full', walls = 'cutaway' }) {
  const mountRef = useRef(null)
  const stageRef = useRef(null)
  const tapsRef = useRef(taps)
  tapsRef.current = taps
  const art = useArt()
  const [ready, setReady] = useState(false)
  const [heroModels, setHeroModels] = useState(heroModelsWanted)
  const [drag, setDrag] = useState(dragWanted)
  const [follow, setFollow] = useState(followWanted)
  const [view, setView] = useState(viewWanted)
  const [directTick, setDirectTick] = useState(0)
  const board = state.board
  // Rebuilt only when the dungeon itself changes (a tile, a door), not every time a figure moves.
  const layoutKey = board ? `${board.tiles.map((t) => t.uid).join()}|${(board.doors ?? []).map((d) => d.id).join()}` : ''
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const layout = useMemo(() => (board ? boardLayout(board) : null), [layoutKey])
  const selected = taps?.selected ?? new Set()
  const figures = boardFigures(state).map((f) => ({ ...f, selected: selected.has(f.id) }))
  const extras = boardExtras(state)
  const extrasKey = JSON.stringify(extras)
  const targetsKey = (taps?.targets ?? []).join(' ')
  const playing = useAttackFx(state.moment)
  const heals = useHealFx(state.healFx, state.moment)

  // Make the stage once; hand back to the flat board if this screen can't draw 3D.
  useEffect(() => {
    const mount = mountRef.current
    let stage
    try {
      stage = makeStage(mount, calm)
    } catch {
      onFail?.()
      return undefined
    }
    stage.still = stillWanted()
    stage.calm = calm
    stage.look = look
    stage.walls = walls
    stage.heroModels = heroModels
    // Torch flicker, lava and fog keep the board drawing all the time: only on the big screen.
    stage.ambient = !stage.still && !calm
    let frame = 0
    let last = 0
    const slow = { frames: 0, ms: 0, done: !onSlow }
    const tick = (now) => {
      frame = 0
      // How long frames take while something keeps moving (a walk, the camera turning).
      // Frames closer than 200 ms apart are one run of drawing; a pause starts a new run.
      if (!slow.done && last && now - last < 200) {
        slow.frames++
        slow.ms += now - last
        if (slow.frames >= SLOW_SAMPLE) {
          slow.done = true
          if (slow.ms / slow.frames > SLOW_FRAME_MS) onSlow()
        }
      }
      stage.tweens = stage.tweens.filter((t) => {
        t.start ??= now + (t.wait ?? 0)
        const k = Math.max(0, Math.min(1, (now - t.start) / t.ms))
        t.step(k)
        return k < 1
      })
      if (stage.ambient) {
        for (const animate of stage.animators) animate(now)
        for (const animate of stage.dungeonAnimators ?? []) animate(now)
        for (const node of stage.nodes.values()) {
          const torch = node.userData.torch
          if (torch) torch.intensity = 6 + Math.sin(now / 90 + node.position.x) * 0.6 + Math.sin(now / 37 + node.position.z) * 0.4
        }
      }
      // Hero figures breathe on the big screen, and make their moves everywhere.
      const models = stepModels([...stage.nodes.values(), ...stage.leaving], last ? Math.min(0.1, (now - last) / 1000) : 0, stage.ambient)
      // Standees turn to face the camera.
      for (const node of stage.nodes.values()) {
        const p = node.position
        node.userData.card.rotation.set(-0.3, Math.atan2(stage.camera.position.x - p.x, stage.camera.position.z - p.z), 0, 'YXZ')
      }
      // Walls cut low on the camera's side follow it round.
      if (stage.walls === 'cutaway' && stage.layout && frontSide(stage) !== stage.front) {
        stage.front = frontSide(stage)
        buildWalls(stage)
      }
      stage.renderer.render(stage.scene, stage.camera)
      const torches = stage.ambient && [...stage.nodes.values()].some((n) => n.userData.torch?.visible)
      const keepGoing = models || stage.tweens.length > 0 || torches || (stage.ambient && (stage.animators.length > 0 || stage.dungeonAnimators?.length > 0))
      last = now
      if (keepGoing) stage.render()
    }
    stage.render = () => {
      if (!frame) frame = requestAnimationFrame(tick)
    }
    const resize = () => {
      const w = mount.clientWidth || 1
      const h = mount.clientHeight || 1
      stage.renderer.setSize(w, h, false)
      stage.camera.aspect = w / h
      stage.camera.updateProjectionMatrix()
      stage.render()
    }
    stage.resize = resize
    const observer = new ResizeObserver(resize)
    observer.observe(mount)
    // A hand on the camera stops the director's glide, and what it leaves is this screen's
    // own angle and zoom from then on (not while an attack close-up is showing).
    stage.controls.addEventListener('start', () => {
      stage.tweens = stage.tweens.filter((tw) => !tw.camera)
    })
    stage.controls.addEventListener('end', () => {
      if (!(stage.closeUntil > performance.now())) stage.keep = cameraAngles(stage)
    })
    stage.controls.addEventListener('change', () => {
      keepOnBoard(stage)
      stage.render()
    })

    // A tap (not a drag) on the board goes to the same handlers as the flat board's.
    const canvas = stage.renderer.domElement
    let down = null
    const press = (e) => {
      down = e.isPrimary ? { x: e.clientX, y: e.clientY } : null
    }
    const release = (e) => {
      const t = tapsRef.current
      if (!t || !down || !e.isPrimary || Math.hypot(e.clientX - down.x, e.clientY - down.y) > TAP_SLOP) return
      down = null
      const hit = tapHit(stage, e)
      if (hit.figure) t.onFigure?.(hit.figure)
      else if (hit.marker) t.onMarker?.(hit.marker)
      else if (hit.item) t.onItem?.(hit.item)
      else if (hit.square) t.onSquare?.(hit.square)
      else t.onBackground?.()
    }
    canvas.addEventListener('pointerdown', press)
    canvas.addEventListener('pointerup', release)
    stageRef.current = stage
    setReady(true)
    return () => {
      stage.stopFx?.()
      for (const stop of stage.stopHeals ?? []) stop()
      cancelAnimationFrame(frame)
      observer.disconnect()
      canvas.removeEventListener('pointerdown', press)
      canvas.removeEventListener('pointerup', release)
      stage.controls.dispose()
      disposeTree(stage.scene)
      for (const tex of stage.textures.values()) tex.dispose()
      stage.blob.dispose()
      stage.renderer.dispose()
      canvas.remove()
      stageRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // A new tile (or a door opening) redraws the dungeon. The first time, the camera looks
  // over all of it; after that it keeps this screen's zoom and angle on the same spot (the
  // dungeon's middle moves as it grows), and Follow slides it on to the hero.
  useEffect(() => {
    const stage = stageRef.current
    if (!ready || !stage || !layout) return
    const before = stage.viewed ? stage.center.clone() : null
    buildDungeon(stage, layout)
    for (const node of stage.nodes.values()) {
      stage.figures.remove(node)
      forget(node)
    }
    stage.nodes.clear()
    for (const node of [...stage.leaving]) node.userData.gone()
    stage.bounds = layout.bounds
    stage.resize()
    if (before) {
      const shift = before.sub(stage.center)
      stage.controls.target.add(shift)
      stage.camera.position.add(shift)
      keepOnBoard(stage)
      stage.controls.update()
    } else {
      fitCamera(stage, layout.bounds, stage.camera.aspect)
      stage.viewed = true
    }
    stage.render()
  }, [ready, layout])

  // Markers and tokens, when one of them changes (and after the dungeon is rebuilt).
  useEffect(() => {
    const stage = stageRef.current
    if (!ready || !stage?.at) return
    buildExtras(stage, JSON.parse(extrasKey))
    stage.render()
  }, [ready, layout, extrasKey])

  // The squares a tap can go to.
  useEffect(() => {
    const stage = stageRef.current
    if (!ready || !stage?.at) return
    buildLit(stage, targetsKey ? targetsKey.split(' ') : [])
    stage.render()
  }, [ready, layout, targetsKey])

  // Figures every time the game changes.
  useEffect(() => {
    const stage = stageRef.current
    if (!ready || !stage?.at) return
    stage.heroModels = heroModels
    syncFigures(stage, figures, art, (f) => fallDelay(state.moment, f.at), (at) => killedBy(state.moment, at))
    const looks = restFacing(figures)
    for (const [id, node] of stage.nodes) {
      node.userData.lookAt = looks[id] ?? null
      const walking = stage.tweens.some((t) => t.node === node)
      if (!walking) lookAtRest(stage, node)
    }
    stage.render()
  })

  // The camera director (with 🎯 Follow on): it rests on the hero whose turn it is, glides to
  // each monster or villain as it takes its turn, and swoops in close for every attack.
  const active = figures.find((f) => f.active)
  const acting = figures.find((f) => f.acting)
  const foes = figures.filter((f) => f.kind === 'monster' || f.kind === 'villain')
  const heroes = figures.filter((f) => f.kind === 'hero' && !f.faded)
  const where = (f) => stageRef.current.at(f.at[0], f.at[1])
  const directKey = [active?.id, active?.at, acting?.id, acting?.at, foes.map((f) => f.at).join(';'), playing?.id].join('|')
  useEffect(() => {
    const stage = stageRef.current
    if (!ready || !stage?.at || !follow) return
    stage.keep ??= cameraAngles(stage)
    const keep = { ...stage.keep, fitTilt: stage.fitTilt }
    clearTimeout(stage.closeTimer)
    let shot = null
    let quick = false
    let slow = 0
    if (playing && stage.closeUpOf !== playing.id) {
      const fx = playing.fx
      const from = stage.at(fx.from[0], fx.from[1])
      const to = stage.at(fx.shots[0].to[0], fx.shots[0].to[1])
      stage.closeUpOf = playing.id
      stage.closeUntil = performance.now() + FX_MS + 400
      shot = closeUpShot(from, to, cameraAngles(stage).yaw)
      quick = true
    } else if (stage.closeUntil > performance.now()) {
      // An attack still playing: stay close, and look again once it's over.
    } else if (acting) {
      shot = tourShot(view, where(acting), heroes.map(where), keep)
      // It walks there: the camera goes along at its pace.
      const walking = stage.nodes.get(acting.id) && stage.tweens.find((tw) => tw.node === stage.nodes.get(acting.id))
      if (walking) slow = walking.ms
    } else if (active) {
      shot = restShot(view, where(active), foes.map(where), keep)
    }
    if (stage.closeUntil > performance.now()) {
      stage.closeTimer = setTimeout(() => {
        stage.closeUntil = 0
        setDirectTick((n) => n + 1)
      }, stage.closeUntil - performance.now())
    }
    if (shot) aimCamera(stage, shot, quick ? 550 : Math.max(800, slow))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, layout, directKey, follow, view, directTick])
  useEffect(() => () => clearTimeout(stageRef.current?.closeTimer), [])

  // An attack flies, strikes and fades (one at a time: a new one clears the last).
  useEffect(() => {
    const stage = stageRef.current
    if (!ready || !stage?.at || !playing) return
    stage.stopFx?.()
    stage.stopFx = playAttack3D(stage, playing.fx, (name) => cachedPicture(stage, artUrl(art, name)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, playing?.id])

  // Each heal floats up once over its hero.
  const healsKey = heals.map((h) => h.key).join()
  useEffect(() => {
    const stage = stageRef.current
    if (!ready || !stage?.at) return
    stage.healsShown ??= new Set()
    stage.stopHeals ??= []
    for (const h of heals) {
      const node = stage.nodes.get(h.heroId)
      if (stage.healsShown.has(h.key) || !node) continue
      stage.healsShown.add(h.key)
      stage.stopHeals.push(playHeal3D(stage, node, h.amount, h.delay))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, healsKey])

  useEffect(() => {
    if (ready && stageRef.current) setDragMode(stageRef.current.controls, drag)
  }, [ready, drag])

  const switchFollow = () => {
    const on = !follow
    setFollow(on)
    try {
      localStorage.setItem(FOLLOW_KEY, on ? 'on' : 'off')
    } catch {
      // Private browsing: it just isn't remembered.
    }
  }

  const switchDrag = () => {
    const next = drag === 'move' ? 'turn' : 'move'
    setDrag(next)
    try {
      localStorage.setItem(DRAG_KEY, next)
    } catch {
      // Private browsing: it just isn't remembered.
    }
  }

  const switchFigures = () => {
    const on = !heroModels
    setHeroModels(on)
    try {
      localStorage.setItem(FIGURES_KEY, on ? 'models' : 'standees')
    } catch {
      // Private browsing: it just isn't remembered.
    }
  }

  const fit = () => {
    const stage = stageRef.current
    if (!stage || !layout) return
    stage.tweens = stage.tweens.filter((tw) => !tw.camera)
    fitCamera(stage, layout.bounds, stage.camera.aspect)
    stage.render()
  }

  // 🎥 Top, Corner, Behind hero: each picks its angle, then the director keeps it on the hero.
  const switchView = () => {
    const next = VIEWS[(VIEWS.indexOf(view) + 1) % VIEWS.length]
    setView(next)
    try {
      localStorage.setItem(VIEW_KEY, next)
    } catch {
      // Private browsing: it just isn't remembered.
    }
    const stage = stageRef.current
    if (!stage?.at) return
    const now = { ...(stage.keep ?? cameraAngles(stage)), fitTilt: stage.fitTilt }
    const { fitTilt: _fit, ...keep } = viewAngles(next, stage.fitYaw ?? 0, now)
    stage.keep = keep
    if (!follow || !active) aimCamera(stage, { ...keep, target: [stage.controls.target.x, stage.controls.target.z] })
  }

  if (!board) return null
  return (
    <section className="relative h-full min-h-0 flex-1 overflow-hidden rounded-2xl" data-board3d>
      <div ref={mountRef} className="h-full w-full" />
      <div className="absolute right-2 top-2 flex gap-2">
        <button type="button" onClick={switchFigures} aria-pressed={heroModels} className={cornerButton(calm)}>
          {heroModels ? '🧍 Figures: 3D' : '🪪 Figures: tokens'}
        </button>
        <button type="button" onClick={switchView} title="Camera angle: from the top, from a corner, or from behind the hero" className={cornerButton(calm)}>
          🎥 {VIEW_LABELS[view]}
        </button>
        <button type="button" onClick={switchFollow} aria-pressed={follow} title="The map slides to the hero whose turn it is" className={cornerButton(calm)}>
          {follow ? '🎯 Follow: on' : '🎯 Follow: off'}
        </button>
        <button
          type="button"
          onClick={switchDrag}
          aria-pressed={drag === 'move'}
          title={drag === 'move' ? 'Dragging slides the board. Two fingers or right-drag turn it.' : 'Dragging turns the board. Two fingers or right-drag slide it.'}
          className={cornerButton(calm)}
        >
          {drag === 'move' ? '✋ Drag: move' : '🔄 Drag: turn'}
        </button>
        <button type="button" onClick={fit} className={cornerButton(calm)}>
          Fit
        </button>
      </div>
    </section>
  )
}
