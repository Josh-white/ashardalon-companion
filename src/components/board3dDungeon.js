import * as THREE from 'three'
import { STAIR_STEPS_PER_SQUARE, STAIR_TOP, stairHeights, stairsRise } from '../board/scene3d.js'
import { STEP } from '../board/grid.js'
import { FLOOR_LOOKS, WALL_DEPTH, dressDungeon, hideTorches, stoneMaterials } from './dungeonLook3d.js'

// The 3D board's dungeon (Board3D.jsx): stone floor, rock, walls cut low on the camera's
// side, open edges, seams between tiles, and the stairs.

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
export function frontSide(stage) {
  const cam = stage.camera?.position
  const target = stage.controls?.target
  if (!cam || !target || (cam.x === target.x && cam.z === target.z)) return 'S'
  const a = Math.atan2(cam.x - target.x, cam.z - target.z)
  const q = Math.round(a / (Math.PI / 2))
  return q === 0 ? 'S' : q === 1 ? 'E' : q === -1 ? 'W' : 'N'
}
export const seeded = (n) => {
  const s = Math.sin(n * 12.9898) * 43758.5453
  return s - Math.floor(s)
}

export const disposeTree = (root) =>
  root.traverse((o) => {
    o.geometry?.dispose()
    for (const m of [].concat(o.material ?? [])) if (!m.userData.shared) m.dispose()
  })

// The stone, rock, walls, open edges and stairs, rebuilt when a tile goes down or a door opens.
export function buildDungeon(stage, layout) {
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
  stage.dungeonAnimators = stone && stage.look !== 'stone' ? dressDungeon(stage.torchGroup, layout, at, { lights: stage.torchLights, wallH: tall ? 1.05 : WALL_H, wallTop: tall ? TALL_H - 0.1 : null, heights: stage.heights, props: stage.look === 'full' }) : []
  hideTorches(stage.torchGroup, stage.torchCut)
  setAir(stage, stone && stage.look !== 'stone')

  // Shadows cover the whole dungeon.
  const span = Math.max(bounds.w, bounds.h) / 2 + 2
  Object.assign(stage.moon.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 1, far: span * 4 })
  stage.moon.shadow.camera.updateProjectionMatrix()
  stage.moon.position.set(-span * 0.6, span * 1.6, span * 0.5)
}

// The rock and walls (rebuilt on their own when the camera turns to another side and the
// walls nearest it get cut low).
export function buildWalls(stage) {
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

  // A wall on the camera's side of its floor square hides that square. Walls between two
  // floor squares are kept once, on the square's east or south side, so seen from the west
  // or north they're in front of the square on their far side.
  const back = { N: 'S', S: 'N', E: 'W', W: 'E' }[front]
  const wallFront = (w) =>
    style !== 'low' && style !== 'tall' && (w.side === front || (w.side === back && floorAt.has(`${w.x + STEP[w.side][0]},${w.y + STEP[w.side][1]}`)))
  const wallMat = stone ? stone.wall : new THREE.MeshStandardMaterial({ color: '#3a322c', roughness: 1 })
  const turn = new THREE.Quaternion()
  const wallSets = [
    [layout.walls.filter((w) => !wallFront(w)), high, wallMat],
    [layout.walls.filter(wallFront), style === 'cutaway' ? CUT_H : high, style === 'fade' ? seeThrough(wallMat) : wallMat],
  ]
  for (const [list, h, mat] of wallSets) {
    if (list.length === 0) continue
    const wallMesh = new THREE.InstancedMesh(tallBox(1, h, stone ? WALL_DEPTH : 0.12), mat, list.length)
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

  // Torches on walls or rock cut low go too.
  const cutWalls = new Set(layout.walls.filter(wallFront).map((w) => `${w.x},${w.y},${w.side}`))
  const rockAt = new Set(rocks.map((s) => `${s.x},${s.y}`))
  stage.torchCut =
    style === 'low' || style === 'tall'
      ? null
      : (t) => {
          const [nx, ny] = [t.x + STEP[t.side][0], t.y + STEP[t.side][1]]
          return cutWalls.has(`${t.x},${t.y},${t.side}`) || (rockAt.has(`${nx},${ny}`) && rockFront({ x: nx, y: ny }))
        }
  if (stage.torchGroup) hideTorches(stage.torchGroup, stage.torchCut)
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
