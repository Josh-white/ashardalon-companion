import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { boardFigures, boardLayout } from '../board/scene3d.js'
import { artUrl, useArt } from '../state/useArt.js'
import { TOKEN_COLORS } from './Board.jsx'

// The virtual board in 3D (three.js), for the big screen: the dungeon's stone floor and
// rock, walls along shut edges, the stairs, and every figure as a standee carrying its
// round token art. Read only: the iPads still move the figures.
//
// It draws only when something changes (a figure walks, a tile goes down, someone drags the
// camera) plus the torches' flicker, which stops with Reduce Motion on. One floor block is
// drawn for every square at once (instancing), so a big dungeon costs little.
// `onFail` hands the screen back to the flat board when this device can't draw 3D.

const FLOOR_H = 0.16
const ROCK_H = 0.8
const WALL_H = 0.55
const STEP_MS = 180

const seeded = (n) => {
  const s = Math.sin(n * 12.9898) * 43758.5453
  return s - Math.floor(s)
}

function canvasTexture(w, h, draw) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  draw(canvas.getContext('2d'), w, h)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
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
function makeStage(mount) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
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

  scene.add(new THREE.HemisphereLight('#8a9bc4', '#2a1d12', 0.9))
  const moon = new THREE.DirectionalLight('#c9d4ff', 0.55)
  moon.castShadow = true
  moon.shadow.mapSize.set(2048, 2048)
  scene.add(moon, moon.target)

  const blob = canvasTexture(64, 64, (g, w) => {
    const r = g.createRadialGradient(w / 2, w / 2, 2, w / 2, w / 2, w / 2)
    r.addColorStop(0, 'rgba(0,0,0,0.75)')
    r.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = r
    g.fillRect(0, 0, w, w)
  })
  const dungeon = new THREE.Group()
  const figures = new THREE.Group()
  scene.add(dungeon, figures)
  return { renderer, scene, camera, controls, moon, blob, dungeon, figures, nodes: new Map(), textures: new Map(), tweens: [], center: new THREE.Vector3() }
}

const disposeTree = (root) =>
  root.traverse((o) => {
    o.geometry?.dispose()
    for (const m of [].concat(o.material ?? [])) m.dispose()
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

  const onExit = new Set(layout.exits.flatMap((e) => (e.type === 'stairs' ? e.squares.map(([x, y]) => `${x},${y}`) : [])))
  const floors = layout.squares.filter((s) => s.floor && !onExit.has(`${s.x},${s.y}`))
  const rocks = layout.squares.filter((s) => !s.floor && !s.door)
  const doors = layout.squares.filter((s) => s.door)
  const matrix = new THREE.Matrix4()
  const color = new THREE.Color()

  const floorMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.95, FLOOR_H, 0.95), new THREE.MeshStandardMaterial({ roughness: 0.92 }), Math.max(floors.length, 1))
  floorMesh.count = floors.length
  floors.forEach((s, i) => {
    const [x, z] = at(s.x, s.y)
    matrix.makeTranslation(x, -FLOOR_H / 2 + seeded(s.x * 7 + s.y) * 0.02, z)
    floorMesh.setMatrixAt(i, matrix)
    const v = 0.34 + seeded(s.x * 31 + s.y * 17) * 0.1
    floorMesh.setColorAt(i, s.scorch ? color.setRGB(0.13, 0.09, 0.08) : color.setRGB(v * 1.05, v, v * 0.92))
  })
  floorMesh.receiveShadow = true
  dungeon.add(floorMesh)

  const rockMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, ROCK_H, 1), new THREE.MeshStandardMaterial({ roughness: 1 }), Math.max(rocks.length, 1))
  rockMesh.count = rocks.length
  rocks.forEach((s, i) => {
    const [x, z] = at(s.x, s.y)
    matrix.makeTranslation(x, ROCK_H / 2 - 0.1, z)
    rockMesh.setMatrixAt(i, matrix)
    const v = 0.16 + seeded(s.x * 13 + s.y * 3) * 0.06
    rockMesh.setColorAt(i, color.setRGB(v * 1.1, v, v * 0.9))
  })
  rockMesh.castShadow = true
  rockMesh.receiveShadow = true
  dungeon.add(rockMesh)

  // A shut door: a banded wooden block on its square.
  const doorMat = new THREE.MeshStandardMaterial({ color: '#5b3a1e', roughness: 0.8 })
  for (const s of doors) {
    const [x, z] = at(s.x, s.y)
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.7, 0.96), doorMat)
    door.position.set(x, 0.35, z)
    door.castShadow = true
    dungeon.add(door)
  }

  // Walls stand on the edge between squares (or round the outside of the dungeon).
  const wallMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, WALL_H, 0.12), new THREE.MeshStandardMaterial({ color: '#3a322c', roughness: 1 }), Math.max(layout.walls.length, 1))
  wallMesh.count = layout.walls.length
  const turn = new THREE.Quaternion()
  const up = new THREE.Vector3(0, 1, 0)
  layout.walls.forEach((w, i) => {
    const [x, z] = at(w.x, w.y)
    const dx = w.side === 'E' ? 0.5 : w.side === 'W' ? -0.5 : 0
    const dz = w.side === 'S' ? 0.5 : w.side === 'N' ? -0.5 : 0
    turn.setFromAxisAngle(up, dx ? Math.PI / 2 : 0)
    matrix.compose(new THREE.Vector3(x + dx, WALL_H / 2 - 0.1, z + dz), turn, new THREE.Vector3(1, 1, 1))
    wallMesh.setMatrixAt(i, matrix)
  })
  wallMesh.castShadow = true
  wallMesh.receiveShadow = true
  dungeon.add(wallMesh)

  // Open edges glow cyan, like the flat board's: the next tile goes there.
  const edgeMat = new THREE.MeshBasicMaterial({ color: '#22d3ee', transparent: true, opacity: 0.55 })
  for (const e of layout.openEdges) {
    const [x, z] = at(e.x, e.y)
    const across = e.side === 'E' || e.side === 'W'
    const strip = new THREE.Mesh(new THREE.BoxGeometry(across ? 0.06 : 0.9, 0.03, across ? 0.9 : 0.06), edgeMat)
    strip.position.set(x + (e.side === 'E' ? 0.47 : e.side === 'W' ? -0.47 : 0), 0.015, z + (e.side === 'S' ? 0.47 : e.side === 'N' ? -0.47 : 0))
    dungeon.add(strip)
  }

  // Stairs going down (and a ladder): steps across the feature's squares.
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
    // Stairs: steps going down into a dark well where the floor would be.
    const well = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, h), new THREE.MeshStandardMaterial({ color: '#0a0807', roughness: 1 }))
    well.position.set(cxs, -0.42, czs)
    dungeon.add(well)
    const steps = 5
    for (let i = 0; i < steps; i++) {
      const step = new THREE.Mesh(
        new THREE.BoxGeometry(w - 0.06, 0.08, h / steps),
        new THREE.MeshStandardMaterial({ color: new THREE.Color().setScalar(0.38 - i * 0.06), roughness: 0.9 }),
      )
      step.position.set(cxs, -0.04 - i * 0.06, czs - h / 2 + (i + 0.5) * (h / steps))
      step.receiveShadow = true
      dungeon.add(step)
    }
  }

  // Shadows cover the whole dungeon.
  const span = Math.max(bounds.w, bounds.h) / 2 + 2
  Object.assign(stage.moon.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 1, far: span * 4 })
  stage.moon.shadow.camera.updateProjectionMatrix()
  stage.moon.position.set(-span * 0.6, span * 1.6, span * 0.5)
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

// A standee: the round token standing up on a coloured base, with a soft shadow and a ring
// that lights for the hero whose turn it is (gold) or the monster acting (orange).
function makeStandee(stage, figure, url) {
  const node = new THREE.Group()
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
  node.add(shadow, ring, body)
  if (figure.kind === 'hero') {
    const torch = new THREE.PointLight('#ff9a3c', 6, 8, 1.2)
    torch.position.set(0, 1.3, 0)
    node.add(torch)
    node.userData.torch = torch
  }
  Object.assign(node.userData, { ring, body, card, baseMat, faceMat, url })
  return node
}

// Figures come, go and walk to their new squares.
function syncFigures(stage, figures, art) {
  const seen = new Set()
  for (const f of figures) {
    seen.add(f.id)
    const url = f.art ? artUrl(art, f.art) : null
    let node = stage.nodes.get(f.id)
    if (node && node.userData.url !== url) {
      stage.figures.remove(node)
      disposeTree(node)
      stage.nodes.delete(f.id)
      node = null
    }
    const [x, z] = stage.at(f.at[0], f.at[1])
    const to = new THREE.Vector3(x, 0, z)
    if (!node) {
      node = makeStandee(stage, f, url)
      node.position.copy(to)
      stage.figures.add(node)
      stage.nodes.set(f.id, node)
    } else if (node.position.distanceTo(to) > 0.01) {
      glide(stage, node, to)
    }
    const { ring, faceMat, baseMat } = node.userData
    ring.visible = Boolean(f.active || f.acting)
    ring.material.color.set(f.acting ? '#fb923c' : '#fbbf24')
    faceMat.opacity = f.faded ? 0.35 : 1
    baseMat.color.set(f.faded ? '#3f3f46' : figureColor(f))
    if (node.userData.torch) node.userData.torch.visible = !f.faded
  }
  for (const [id, node] of stage.nodes) {
    if (seen.has(id)) continue
    stage.figures.remove(node)
    disposeTree(node)
    stage.nodes.delete(id)
  }
}

// A figure hops to its new square (a hop per square, so a walk looks like steps).
function glide(stage, node, to) {
  stage.tweens = stage.tweens.filter((t) => t.node !== node)
  const from = node.position.clone()
  const hops = Math.max(1, Math.round(from.distanceTo(to)))
  const ms = stage.still ? 1 : Math.min(hops, 6) * STEP_MS
  stage.tweens.push({
    node,
    ms,
    step: (k) => {
      node.position.lerpVectors(from, to, k)
      node.userData.body.position.y = stage.still ? 0 : Math.abs(Math.sin(k * Math.PI * hops)) * 0.12
    },
  })
  stage.render()
}

// The camera looks over the whole dungeon from one side, tilted so the walls and standees
// stand up. A long dungeon on a wide screen is looked at from its side, so it runs across.
const TILT = 0.8 // radians from straight down
function fitCamera(stage, bounds, aspect) {
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
}

const stillWanted = () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)

export default function Board3D({ state, onFail }) {
  const mountRef = useRef(null)
  const stageRef = useRef(null)
  const art = useArt()
  const [ready, setReady] = useState(false)
  const board = state.board
  // Rebuilt only when the dungeon itself changes (a tile, a door), not every time a figure moves.
  const layoutKey = board ? `${board.tiles.map((t) => t.uid).join()}|${(board.doors ?? []).map((d) => d.id).join()}` : ''
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const layout = useMemo(() => (board ? boardLayout(board) : null), [layoutKey])
  const figures = boardFigures(state)

  // Make the stage once; hand back to the flat board if this screen can't draw 3D.
  useEffect(() => {
    const mount = mountRef.current
    let stage
    try {
      stage = makeStage(mount)
    } catch {
      onFail?.()
      return undefined
    }
    stage.still = stillWanted()
    let frame = 0
    const tick = (now) => {
      frame = 0
      stage.tweens = stage.tweens.filter((t) => {
        t.start ??= now
        const k = Math.min(1, (now - t.start) / t.ms)
        t.step(k)
        return k < 1
      })
      if (!stage.still) {
        for (const node of stage.nodes.values()) {
          const torch = node.userData.torch
          if (torch) torch.intensity = 6 + Math.sin(now / 90 + node.position.x) * 0.6 + Math.sin(now / 37 + node.position.z) * 0.4
        }
      }
      // Standees turn to face the camera.
      for (const node of stage.nodes.values()) {
        const p = node.position
        node.userData.card.rotation.set(-0.3, Math.atan2(stage.camera.position.x - p.x, stage.camera.position.z - p.z), 0, 'YXZ')
      }
      stage.renderer.render(stage.scene, stage.camera)
      const torches = !stage.still && [...stage.nodes.values()].some((n) => n.userData.torch?.visible)
      if (stage.tweens.length > 0 || torches) stage.render()
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
    stage.controls.addEventListener('change', stage.render)
    stageRef.current = stage
    setReady(true)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      stage.controls.dispose()
      disposeTree(stage.scene)
      for (const tex of stage.textures.values()) tex.dispose()
      stage.blob.dispose()
      stage.renderer.dispose()
      stage.renderer.domElement.remove()
      stageRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // A new tile (or a door opening) redraws the dungeon and looks over all of it again.
  useEffect(() => {
    const stage = stageRef.current
    if (!ready || !stage || !layout) return
    buildDungeon(stage, layout)
    for (const node of stage.nodes.values()) {
      stage.figures.remove(node)
      disposeTree(node)
    }
    stage.nodes.clear()
    stage.resize()
    fitCamera(stage, layout.bounds, stage.camera.aspect)
    stage.render()
  }, [ready, layout])

  // Figures every time the game changes.
  useEffect(() => {
    const stage = stageRef.current
    if (!ready || !stage?.at) return
    syncFigures(stage, figures, art)
    stage.render()
  })

  const fit = () => {
    const stage = stageRef.current
    if (!stage || !layout) return
    fitCamera(stage, layout.bounds, stage.camera.aspect)
    stage.render()
  }

  if (!board) return null
  return (
    <section className="relative h-full overflow-hidden rounded-2xl" data-board3d>
      <div ref={mountRef} className="h-full w-full" />
      <button
        type="button"
        onClick={fit}
        className="absolute right-[0.8vw] top-[0.8vw] rounded-lg border border-zinc-700 bg-zinc-950/70 px-[0.8vw] py-[0.3vw] text-[0.9vw] text-zinc-300 hover:text-white"
      >
        Fit
      </button>
    </section>
  )
}
