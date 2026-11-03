import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { DEFAULT_COLORS } from '../data/forge.js'
import { PARTS, SLOTS, shapeOf } from './parts.js'
import { BOARD_MOVES, MOVES } from './moves.js'

// Builds a 🛠️ Hero Builder figure from a recipe (src/data/forge.js): a skeleton of pivots
// (hips, body, head, arms, hands, legs, tail) with each part's shapes hung on them. The parts
// are rigid, like the chibi figures made in Blender, so the moves just turn the pivots.
// Front is +Z, up is +Y, the figure stands on y = 0. The body, arm, leg and head parts can
// stretch the skeleton (their `frame`), so a long-legged figure really stands taller.

// The skeleton's measurements before any part changes them.
export const BASE_FRAME = {
  BW: 0.62, // body width
  BH: 0.62, // body height, hips to neck
  BD: 0.4, // body depth
  LL: 0.5, // leg length, hip to ankle
  legW: 0.13, // leg radius
  foot: 0.1, // boot height under the ankle
  AL: 0.5, // arm length, shoulder to hand
  armW: 0.1, // arm radius
  HS: 0.5, // head height
  HR: 0.27, // head radius (for hats and helmets)
  HC: 0.29, // head centre, above the neck
}

// The joints the moves turn. grip.*, back, hat and fx are fixed to them.
const POSED = ['hips', 'body', 'head', 'arm.L', 'arm.R', 'hand.L', 'hand.R', 'leg.L', 'leg.R', 'tail']

function skeleton(f) {
  return [
    // name, parent, position in the parent, turn (degrees)
    ['hips', 'root', [0, f.LL + f.foot, 0]],
    ['body', 'hips', [0, 0, 0]],
    ['head', 'body', [0, f.BH, 0]],
    ['arm.L', 'body', [f.BW / 2 + f.armW * 0.9, f.BH - f.armW * 1.2, 0]],
    ['arm.R', 'body', [-(f.BW / 2 + f.armW * 0.9), f.BH - f.armW * 1.2, 0]],
    ['hand.L', 'arm.L', [0, -f.AL, 0.02]],
    ['hand.R', 'arm.R', [0, -f.AL, 0.02]],
    ['leg.L', 'hips', [f.BW * 0.24, 0, 0]],
    ['leg.R', 'hips', [-f.BW * 0.24, 0, 0]],
    ['tail', 'hips', [0, 0.08, -f.BD / 2 + 0.02]],
    // A held weapon points along +Y of its grip: up, a little forward and away from the body.
    ['grip.R', 'hand.R', [0, 0, 0], [20, 0, 18]],
    ['grip.L', 'hand.L', [0, 0, 0], [20, 0, -18]],
    ['back', 'body', [0, f.BH * 0.78, -f.BD / 2]],
    ['hat', 'head', [0, f.HS, 0]],
    // Magic effects around the whole figure, from the floor up; it turns slowly in the builder.
    ['fx', 'root', [0, 0, 0]],
  ]
}

const rad = (degrees) => degrees.map((d) => THREE.MathUtils.degToRad(d))
const UP = new THREE.Vector3(0, 1, 0)

// A small kit for the parts: each call makes one coloured shape on one joint. A colour is
// one of the recipe's color roles (skin, outfit, trim, metal, wood, magic, eyes), or a
// #hex; "magic" and "glow:<colour>" shine.
export function kit(joints, palette, materials = new Map()) {
  let groups = 0
  const mat = (colour, side, opacity = 1) => {
    const glow = colour === 'magic' || colour.startsWith('glow:')
    const name = colour.startsWith('glow:') ? colour.slice(5) : colour
    const hex = palette[name] ?? (name.startsWith('#') ? name : '#ff00ff')
    const key = `${hex}|${glow}|${side ? 2 : 0}|${opacity}`
    if (!materials.has(key)) {
      materials.set(
        key,
        new THREE.MeshStandardMaterial({
          color: hex,
          roughness: name === 'metal' ? 0.45 : 0.75,
          metalness: name === 'metal' ? 0.35 : 0.05,
          emissive: glow ? hex : '#000000',
          emissiveIntensity: glow ? 0.9 : 0,
          side: side ? THREE.DoubleSide : THREE.FrontSide,
          // See-through shapes (smoke, fairy wings, a magic aura) don't hide what's behind them.
          ...(opacity < 1 ? { transparent: true, opacity, depthWrite: false } : {}),
        }),
      )
    }
    return materials.get(key)
  }
  const place = (geometry, colour, joint, at, opts = {}) => {
    const mesh = new THREE.Mesh(geometry, mat(colour, opts.double, opts.opacity))
    mesh.position.set(...at)
    if (opts.rot) mesh.rotation.set(...rad(opts.rot), 'YXZ')
    if (opts.scale) mesh.scale.set(...(typeof opts.scale === 'number' ? [opts.scale, opts.scale, opts.scale] : opts.scale))
    ;(joints[joint] ?? joints.root).add(mesh)
    return mesh
  }
  const k = {
    // A new pivot on a joint, for chains (tails, horns, a floppy hat). Returns its name.
    group(joint, at = [0, 0, 0], rot = [0, 0, 0]) {
      const g = new THREE.Group()
      g.position.set(...at)
      g.rotation.set(...rad(rot), 'YXZ')
      ;(joints[joint] ?? joints.root).add(g)
      const name = `g${groups++}`
      joints[name] = g
      return name
    },
    box: (c, j, at, size, opts = {}) =>
      place(new RoundedBoxGeometry(size[0], size[1], size[2], 2, Math.min(opts.round ?? 0.04, Math.min(...size) * 0.45)), c, j, at, opts),
    ball: (c, j, at, r, opts = {}) => place(new THREE.SphereGeometry(r, opts.seg ?? 16, opts.rings ?? 12, opts.phi?.[0] ?? 0, opts.phi?.[1] ?? Math.PI * 2, 0, opts.thetaLen ?? (opts.half ? Math.PI / 2 : Math.PI)), c, j, at, { ...opts, double: opts.double ?? Boolean(opts.half || opts.phi || opts.thetaLen) }),
    // Wide at the bottom (r), narrowing to `tip` at the top.
    cone: (c, j, at, r, h, opts = {}) => place(new THREE.CylinderGeometry(opts.tip ?? 0, r, h, opts.sides ?? 10, 1, opts.open ?? false, opts.theta?.[0] ?? 0, opts.theta?.[1] ?? Math.PI * 2), c, j, at, { ...opts, double: opts.double ?? opts.open }),
    tube: (c, j, at, r, h, opts = {}) => k.cone(c, j, at, r, h, { tip: r, ...opts }),
    ring: (c, j, at, r, thick, opts = {}) => place(new THREE.TorusGeometry(r, thick, 8, opts.sides ?? 24, opts.arc ?? Math.PI * 2), c, j, at, opts),
    // A flat 2D shape (points in x, y) given some thickness along z.
    flat(c, j, at, points, depth, opts = {}) {
      const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)))
      const bevel = Math.min(0.012, depth * 0.3)
      const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 6 })
      geometry.translate(0, 0, -depth / 2)
      return place(geometry, c, j, at, opts)
    },
    // A round rod from one point to another (radius r at `from`, `tip` at `to`).
    limb(c, j, from, to, r, opts = {}) {
      const a = new THREE.Vector3(...from)
      const b = new THREE.Vector3(...to)
      const length = a.distanceTo(b) || 0.001
      const mesh = place(new THREE.CylinderGeometry(opts.tip ?? r, r, length, opts.sides ?? 10), c, j, a.clone().add(b).multiplyScalar(0.5).toArray())
      mesh.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize())
      if (opts.ends) {
        k.ball(c, j, from, r, { seg: 10, rings: 8 })
        k.ball(c, j, to, opts.tip ?? r, { seg: 10, rings: 8 })
      }
      return mesh
    },
  }
  return k
}

// The part picked for a slot, with its shape values filled in.
function picked(recipe, slot) {
  const pick = recipe.parts?.[slot.key]
  const part = PARTS[slot.key]?.find((p) => p.id === pick?.id)
  return part ? { part, shape: shapeOf(part, pick.shape) } : null
}

// The skeleton's measurements for a recipe.
export function frameFor(recipe) {
  const f = { ...BASE_FRAME }
  for (const slot of SLOTS) {
    const p = picked(recipe, slot)
    p?.part.frame?.(p.shape, f)
  }
  return f
}

export function buildFigure(recipe) {
  const root = new THREE.Group()
  root.name = 'hero-builder-figure'
  const joints = { root }
  const f = frameFor(recipe)
  const rest = {}
  for (const [name, parent, at, rot] of skeleton(f)) {
    const j = new THREE.Group()
    // No dots in the names: an animation track names its joint before a dot.
    j.name = name.replace('.', '_')
    j.position.set(...at)
    if (rot) j.rotation.set(...rad(rot), 'YXZ')
    joints[parent].add(j)
    joints[name] = j
    rest[name] = j.position.clone()
  }
  const palette = { ...DEFAULT_COLORS, ...recipe.colors }
  const k = kit(joints, palette)
  for (const slot of SLOTS) {
    const p = picked(recipe, slot)
    p?.part.build(k, p.shape, f)
  }
  const size = recipe.size ?? 1
  root.scale.setScalar(size)
  root.userData = { joints, rest, frame: f, height: (f.LL + f.foot + f.BH + f.HS) * size }
  return root
}

// Poses the figure partway through a move. `t` is seconds since it began. Returns true
// once a move that doesn't loop has finished.
export function pose(figure, moveName, t) {
  const { joints, rest } = figure.userData
  const move = MOVES[moveName] ?? MOVES.Idle
  const len = move.frames.at(-1)[0]
  const time = move.loop ? t % len : Math.min(t, len)
  let i = 0
  while (i < move.frames.length - 2 && move.frames[i + 1][0] <= time) i++
  const [t0, a] = move.frames[i]
  const [t1, b] = move.frames[Math.min(i + 1, move.frames.length - 1)]
  const f = t1 > t0 ? Math.min(1, (time - t0) / (t1 - t0)) : 0
  const ease = f * f * (3 - 2 * f)
  for (const name of POSED) {
    const j = joints[name]
    const ra = a[name] ?? [0, 0, 0]
    const rb = b[name] ?? [0, 0, 0]
    const r = [0, 1, 2].map((n) => THREE.MathUtils.degToRad(ra[n] + (rb[n] - ra[n]) * ease))
    // + leans forward / swings forward: that's about -X with the front at +Z.
    j.rotation.set(-r[0], r[1], r[2])
    j.position.copy(rest[name])
  }
  const bobA = a.bob ?? 0
  const bobB = b.bob ?? 0
  joints.hips.position.y = rest.hips.y + bobA + (bobB - bobA) * ease
  joints.fx.rotation.y = t * 0.9
  return !move.loop && t >= len
}

// The figure's moves as three.js animation clips, named like the 3D board's other figures'
// moves (BOARD_MOVES), so the board plays them with its own AnimationMixer.
export function figureClips(figure) {
  const { joints, rest } = figure.userData
  const euler = new THREE.Euler()
  const q = new THREE.Quaternion()
  return Object.entries(BOARD_MOVES).map(([moveName, clipName]) => {
    const move = MOVES[moveName]
    const times = move.frames.map(([t]) => t)
    const tracks = POSED.map((name) => {
      const values = []
      for (const [, frame] of move.frames) {
        const r = (frame[name] ?? [0, 0, 0]).map((d) => THREE.MathUtils.degToRad(d))
        q.setFromEuler(euler.set(-r[0], r[1], r[2]))
        values.push(q.x, q.y, q.z, q.w)
      }
      return new THREE.QuaternionKeyframeTrack(`${joints[name].name}.quaternion`, times, values)
    })
    const hips = rest.hips
    tracks.push(new THREE.VectorKeyframeTrack(`${joints.hips.name}.position`, times, move.frames.flatMap(([, f]) => [hips.x, hips.y + (f.bob ?? 0), hips.z]), THREE.InterpolateSmooth))
    return new THREE.AnimationClip(clipName, times.at(-1), tracks)
  })
}

export function disposeFigure(figure) {
  const seen = new Set()
  figure.traverse((o) => {
    o.geometry?.dispose()
    if (o.material && !seen.has(o.material)) {
      seen.add(o.material)
      o.material.dispose()
    }
  })
}
