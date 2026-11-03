import * as THREE from 'three'

// How the 3D board's dungeon looks: carved flagstones, brick-faced rock and walls (all
// painted once on canvases, no picture files), torches in sconces on the walls, and a few
// bones and loose stones lying about. Board3D.jsx builds the blocks; this file gives them
// their stone and adds the dressing.
//
// Cheap on purpose (the iPad lag lesson): every texture is drawn once and shared, the
// floor is still one instanced block per look, and on calm screens the torches are glowing
// pictures, not real lights.

const seeded = (n) => {
  const s = Math.sin(n * 12.9898) * 43758.5453
  return s - Math.floor(s)
}

function paint(size, draw) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  draw(canvas.getContext('2d'), size)
  return canvas
}

function texture(canvas, color = true) {
  const tex = new THREE.CanvasTexture(canvas)
  if (color) tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  // Tall walls repeat their bricks up the face instead of stretching them.
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  return tex
}

// Speckles and scratches so stone doesn't look like plastic.
function grit(g, x, y, w, h, seed, amount = 260) {
  for (let i = 0; i < amount; i++) {
    const r = seeded(seed + i * 3.1)
    g.fillStyle = r > 0.5 ? `rgba(255,240,220,${0.03 + r * 0.05})` : `rgba(0,0,0,${0.05 + r * 0.1})`
    const s = 1 + seeded(seed + i * 7.7) * 3
    g.fillRect(x + seeded(seed + i) * w, y + seeded(seed + i * 1.3) * h, s, s)
  }
}

// One stone: a slightly uneven slab with a lit top-left rim and a dark bottom-right rim.
function slab(g, x, y, w, h, seed, base) {
  const v = base + (seeded(seed) - 0.5) * 26
  g.fillStyle = `rgb(${v + 6},${v},${v - 8})`
  const j = (n) => (seeded(seed + n) - 0.5) * 3
  g.beginPath()
  g.moveTo(x + j(1), y + j(2))
  g.lineTo(x + w + j(3), y + j(4))
  g.lineTo(x + w + j(5), y + h + j(6))
  g.lineTo(x + j(7), y + h + j(8))
  g.closePath()
  g.fill()
  const shade = g.createLinearGradient(x, y, x + w, y + h)
  shade.addColorStop(0, 'rgba(255,245,230,0.10)')
  shade.addColorStop(0.5, 'rgba(0,0,0,0)')
  shade.addColorStop(1, 'rgba(0,0,0,0.22)')
  g.fillStyle = shade
  g.fill()
  grit(g, x, y, w, h, seed * 17, (w * h) / 60)
  // A crack now and then.
  if (seeded(seed * 3) > 0.72) {
    g.strokeStyle = 'rgba(10,8,6,0.55)'
    g.lineWidth = 1.5
    g.beginPath()
    let cx = x + seeded(seed * 5) * w
    let cy = y + 2
    g.moveTo(cx, cy)
    for (let k = 0; k < 4; k++) {
      cx += (seeded(seed * 7 + k) - 0.5) * w * 0.4
      cy += h / 4
      g.lineTo(cx, cy)
    }
    g.stroke()
  }
}

// The floor of one square: two to four flagstones with dark grout between them.
// Three layouts; Board3D turns each square a quarter-turn at random for more variety.
const FLOOR_CUTS = [
  [[0, 0, 0.55, 0.5], [0.55, 0, 0.45, 0.5], [0, 0.5, 0.35, 0.5], [0.35, 0.5, 0.65, 0.5]],
  [[0, 0, 1, 0.42], [0, 0.42, 0.6, 0.58], [0.6, 0.42, 0.4, 0.58]],
  [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]],
]
export const FLOOR_LOOKS = FLOOR_CUTS.length

function floorCanvas(cut, size = 256) {
  return paint(size, (g, s) => {
    g.fillStyle = '#16120f'
    g.fillRect(0, 0, s, s)
    const gap = s * 0.025
    FLOOR_CUTS[cut].forEach(([x, y, w, h], i) => slab(g, x * s + gap, y * s + gap, w * s - gap * 2, h * s - gap * 2, cut * 31 + i * 7 + 1, 132))
    // The square's own edge: a deeper groove, so the grid still reads like the real tiles.
    g.strokeStyle = 'rgba(0,0,0,0.65)'
    g.lineWidth = s * 0.03
    g.strokeRect(0, 0, s, s)
  })
}

// Brick courses for the sides of rock and walls.
function brickCanvas(size = 256) {
  return paint(size, (g, s) => {
    g.fillStyle = '#120e0c'
    g.fillRect(0, 0, s, s)
    const rows = 3
    const h = s / rows
    for (let r = 0; r < rows; r++) {
      const shift = r % 2 ? 0.5 : 0
      for (let c = -1; c < 3; c++) {
        const x = (c + shift) * (s / 2)
        slab(g, x + 3, r * h + 3, s / 2 - 6, h - 6, r * 13 + c * 5 + 101, 92)
      }
    }
  })
}

// The rough top of solid rock: broken rubble packed together, darker than the floor.
function rockTopCanvas(size = 256) {
  return paint(size, (g, s) => {
    g.fillStyle = '#1a1512'
    g.fillRect(0, 0, s, s)
    const n = 7
    const c = s / n
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const seed = i * 19 + j * 7 + 300
        const x = i * c + (seeded(seed) - 0.5) * c * 0.5
        const y = j * c + (seeded(seed + 1) - 0.5) * c * 0.5
        const v = 46 + seeded(seed + 2) * 30
        g.fillStyle = `rgb(${v + 5},${v},${v - 5})`
        g.beginPath()
        const pts = 6
        for (let k = 0; k < pts; k++) {
          const ang = (k / pts) * Math.PI * 2 + seeded(seed + k) * 0.6
          const r = c * (0.45 + seeded(seed + k * 3) * 0.25)
          g.lineTo(x + c / 2 + Math.cos(ang) * r, y + c / 2 + Math.sin(ang) * r)
        }
        g.closePath()
        g.fill()
        g.fillStyle = 'rgba(255,240,220,0.06)'
        g.fill()
      }
    }
    grit(g, 0, 0, s, s, 77, 900)
  })
}

// A grey copy of a colour canvas, to give the stone bumps (grout sinks in, stones stand up).
function bumpOf(canvas) {
  const out = paint(canvas.width, (g) => {
    g.filter = 'grayscale(1) contrast(1.4)'
    g.drawImage(canvas, 0, 0)
  })
  return texture(out, false)
}

let cache = null
// Made once for the page and shared by every board drawn on it.
export function stoneMaterials() {
  if (cache) return cache
  const floors = Array.from({ length: FLOOR_LOOKS }, (_, i) => {
    const canvas = floorCanvas(i)
    return new THREE.MeshStandardMaterial({ map: texture(canvas), bumpMap: bumpOf(canvas), bumpScale: 2.2, roughness: 0.93 })
  })
  const brick = brickCanvas()
  const top = rockTopCanvas()
  const brickMat = new THREE.MeshStandardMaterial({ map: texture(brick), bumpMap: bumpOf(brick), bumpScale: 2.5, roughness: 1 })
  const topMat = new THREE.MeshStandardMaterial({ map: texture(top), bumpMap: bumpOf(top), bumpScale: 2, roughness: 1 })
  // A box's faces in three.js order: +x, -x, +y (top), -y, +z, -z.
  const rock = [brickMat, brickMat, topMat, topMat, brickMat, brickMat]
  const steps = new THREE.MeshStandardMaterial({ map: texture(floorCanvas(1)), roughness: 0.95 })
  cache = { floors, rock, wall: rock, steps }
  // Kept on purpose: Board3D's clean-up skips materials marked shared.
  for (const m of [...floors, brickMat, topMat, steps]) m.userData.shared = true
  return cache
}

// A flame: a soft glowing picture that always faces the camera.
let flameTex = null
function flameTexture() {
  if (flameTex) return flameTex
  flameTex = texture(
    paint(64, (g, s) => {
      const r = g.createRadialGradient(s / 2, s * 0.62, 1, s / 2, s * 0.55, s / 2)
      r.addColorStop(0, 'rgba(255,250,210,1)')
      r.addColorStop(0.25, 'rgba(255,190,80,0.95)')
      r.addColorStop(0.6, 'rgba(240,90,20,0.45)')
      r.addColorStop(1, 'rgba(120,20,0,0)')
      g.fillStyle = r
      g.fillRect(0, 0, s, s)
    }),
  )
  return flameTex
}

let poolTex = null
// The warm patch of light a torch throws on the floor and wall (calm screens use this
// instead of a real light).
function poolTexture() {
  if (poolTex) return poolTex
  poolTex = texture(
    paint(128, (g, s) => {
      const r = g.createRadialGradient(s / 2, s / 2, 2, s / 2, s / 2, s / 2)
      r.addColorStop(0, 'rgba(255,170,80,0.55)')
      r.addColorStop(0.5, 'rgba(255,120,40,0.18)')
      r.addColorStop(1, 'rgba(255,100,20,0)')
      g.fillStyle = r
      g.fillRect(0, 0, s, s)
    }),
  )
  return poolTex
}

const SIDE_STEP = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] }
// How thick the thin walls between squares are (Board3D builds them this deep).
export const WALL_DEPTH = 0.16

// Where torches hang: on a shut wall or a rock face next to the floor, about one per tile,
// spread out so no two are close. Pure, so the same dungeon always gets the same torches.
export function torchSpots(layout, most = 12) {
  const rock = new Set(layout.squares.filter((s) => !s.floor && !s.door).map((s) => `${s.x},${s.y}`))
  const candidates = []
  for (const s of layout.squares) {
    if (!s.floor) continue
    for (const [side, [dx, dy]] of Object.entries(SIDE_STEP)) {
      if (rock.has(`${s.x + dx},${s.y + dy}`)) candidates.push({ x: s.x, y: s.y, side, tile: s.tile })
    }
  }
  for (const w of layout.walls) candidates.push({ x: w.x, y: w.y, side: w.side, tile: null, wall: true })
  candidates.sort((a, b) => seeded(a.x * 37 + a.y * 101 + a.side.charCodeAt(0)) - seeded(b.x * 37 + b.y * 101 + b.side.charCodeAt(0)))
  const picked = []
  for (const c of candidates) {
    if (picked.length >= most) break
    if (picked.every((p) => Math.hypot(p.x - c.x, p.y - c.y) >= 3.2)) picked.push(c)
  }
  return picked
}

// Dressing for the dungeon: torches and, with `props`, bones and loose stones. `lights` is
// the board's own few real lights (none on calm screens), moved to the first torches; the
// rest glow without one. Returns things that move for the board's ambient loop.
export function dressDungeon(group, layout, at, { lights = [], wallH, wallTop = null, heights = null, props = true }) {
  const animators = []
  const iron = new THREE.MeshStandardMaterial({ color: '#2b2622', roughness: 0.6, metalness: 0.6 })
  const wood = new THREE.MeshStandardMaterial({ color: '#4a2f1a', roughness: 0.9 })
  const flameMat = new THREE.SpriteMaterial({ map: flameTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })
  const poolMat = new THREE.MeshBasicMaterial({ map: poolTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })
  const spots = torchSpots(layout)
  spots.forEach((t, i) => {
    const [x, z] = at(t.x, t.y)
    const [dx, dz] = SIDE_STEP[t.side]
    // Flat against the face of the wall, toward the square it lights: a rock face is the
    // square's own edge, a thin wall stands out of it by half its thickness.
    const face = t.wall ? 0.5 - WALL_DEPTH / 2 : 0.5
    const px = x + dx * face
    const pz = z + dz * face
    // On stairs the wall's foot is up a step too, but the flame stays under the top of a
    // tall wall (`wallTop`).
    const y = Math.min(wallH - 0.15 + (heights?.get(`${t.x},${t.y}`) ?? 0), (wallTop ?? Infinity) - 0.45)
    // An iron plate on the wall, and the torch standing out of it, leaning into the room.
    const plate = new THREE.Mesh(new THREE.BoxGeometry(dx ? 0.03 : 0.1, 0.16, dz ? 0.03 : 0.1), iron)
    plate.position.set(px - dx * 0.015, y, pz - dz * 0.015)
    const lean = 0.42
    const len = 0.26
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.018, len, 6), wood)
    // Tip the stick's top away from the wall (toward the square it lights).
    stick.rotation.set(-dz * lean, 0, dx * lean)
    const out = Math.sin(lean) * len
    const up = Math.cos(lean) * len
    stick.position.set(px - dx * (0.03 + out / 2), y - 0.04 + up / 2, pz - dz * (0.03 + out / 2))
    const topX = px - dx * (0.03 + out)
    const topZ = pz - dz * (0.03 + out)
    const topY = y - 0.04 + up
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.03, 0.07, 8), iron)
    cup.position.set(topX, topY, topZ)
    const flame = new THREE.Sprite(flameMat)
    flame.scale.set(0.34, 0.46, 1)
    flame.position.set(topX, topY + 0.2, topZ)
    flame.renderOrder = 5
    // One group per torch, so a torch on a wall cut low (hideTorches) can go away.
    const torch = new THREE.Group()
    torch.userData.torchSide = t.side
    torch.userData.torchAt = { x: t.x, y: t.y, side: t.side }
    torch.add(plate, stick, cup, flame)
    // The pool of light on the floor below.
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8), poolMat)
    pool.rotation.x = -Math.PI / 2
    pool.position.set(px - dx * 0.6, 0.012 + (heights?.get(`${t.x},${t.y}`) ?? 0), pz - dz * 0.6)
    torch.add(pool)
    group.add(torch)
    const phase = seeded(i * 9.1) * 10
    const light = lights[i]
    if (light) {
      light.position.set(topX - dx * 0.2, topY + 0.25, topZ - dz * 0.2)
      light.intensity = 2.4
      torch.userData.light = light
      animators.push((now) => (light.intensity = torch.visible ? 2.4 + Math.sin(now / 110 + phase) * 0.35 + Math.sin(now / 47 + phase) * 0.2 : 0))
    }
    animators.push((now) => {
      const k = 1 + Math.sin(now / 90 + phase) * 0.08 + Math.sin(now / 33 + phase) * 0.05
      flame.scale.set(0.34 * k, 0.46 * (2 - k), 1)
    })
  })
  if (props) addProps(group, layout, at)
  return animators
}

// Torches hang on the face of a wall toward their square. A wall or rock cut low (the ones
// between the camera and the floor) has no room for one, so `isCut({ x, y, side })` (or
// null: nothing cut) says which torches to hide.
export function hideTorches(group, isCut) {
  group.traverse((o) => {
    if (o.userData.torchAt === undefined) return
    o.visible = !isCut?.(o.userData.torchAt)
    if (!o.visible && o.userData.light) o.userData.light.intensity = 0
    else if (o.userData.light) o.userData.light.intensity = 2.4
  })
}

// Bones and loose stones lying against the walls: small and flat, so they never hide a
// figure or look like something you can tap.
function addProps(group, layout, at) {
  const bone = new THREE.MeshStandardMaterial({ color: '#d6cbb0', roughness: 0.8 })
  const pebble = new THREE.MeshStandardMaterial({ color: '#4b433b', roughness: 1 })
  const rock = new Set(layout.squares.filter((s) => !s.floor).map((s) => `${s.x},${s.y}`))
  for (const s of layout.squares) {
    if (!s.floor || s.scorch) continue
    const r = seeded(s.x * 53 + s.y * 29)
    const touching = Object.entries(SIDE_STEP).filter(([, [dx, dy]]) => rock.has(`${s.x + dx},${s.y + dy}`))
    if (touching.length === 0) continue
    const [side] = touching[Math.floor(r * touching.length)]
    const [dx, dz] = SIDE_STEP[side]
    const [x, z] = at(s.x, s.y)
    const ex = x + dx * 0.36 + (seeded(r * 9) - 0.5) * 0.4 * Math.abs(dz)
    const ez = z + dz * 0.36 + (seeded(r * 11) - 0.5) * 0.4 * Math.abs(dx)
    if (r < 0.14) {
      // A skull and a bone or two.
      const skull = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), bone)
      skull.scale.set(1, 0.85, 1.1)
      skull.position.set(ex, 0.06, ez)
      group.add(skull)
      for (let k = 0; k < 2; k++) {
        const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.2, 2, 6), bone)
        b.rotation.set(Math.PI / 2, 0, seeded(r * 17 + k) * 3)
        b.position.set(ex + (k - 0.5) * 0.14, 0.02, ez + (seeded(r + k) - 0.5) * 0.12)
        group.add(b)
      }
    } else if (r < 0.4) {
      // A little heap of rubble at the foot of the rock.
      for (let k = 0; k < 4; k++) {
        const q = seeded(r * 31 + k)
        const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.04 + q * 0.04, 0), pebble)
        stone.position.set(ex + (q - 0.5) * 0.26, 0.03, ez + (seeded(q * 7) - 0.5) * 0.26)
        stone.rotation.set(q * 5, q * 3, q)
        group.add(stone)
      }
    }
  }
}
