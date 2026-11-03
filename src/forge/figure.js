import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { PARTS, SLOTS } from './parts.js'
import { MOVES } from './moves.js'

// Builds a 🛠️ Hero Builder figure from a recipe (src/forge/recipe.js): a skeleton of pivots
// (hips, body, head, arms, hands, legs, tail) with each part's shapes hung on them. The parts
// are rigid, like the chibi figures made in Blender, so the moves just turn the pivots.
// Front is +Z, up is +Y; about 2.5 units tall before the recipe's size.

const JOINTS = [
  // name, parent, position in the parent
  ['hips', 'root', [0, 0.92, 0]],
  ['body', 'hips', [0, 0, 0]],
  ['head', 'body', [0, 0.55, 0]],
  ['arm.L', 'body', [0.42, 0.42, 0]],
  ['arm.R', 'body', [-0.42, 0.42, 0]],
  ['hand.L', 'arm.L', [0.04, -0.56, 0.02]],
  ['hand.R', 'arm.R', [-0.04, -0.56, 0.02]],
  ['leg.L', 'hips', [0.18, -0.42, 0]],
  ['leg.R', 'hips', [-0.18, -0.42, 0]],
  ['tail', 'hips', [0, -0.25, -0.22]],
]

// A small kit for the parts: each call makes one coloured shape on one joint.
export function kit(joints, materials) {
  const mat = (colour) => {
    if (!materials.has(colour)) {
      const glow = colour.startsWith('glow:')
      const hex = glow ? colour.slice(5) : colour
      materials.set(colour, new THREE.MeshStandardMaterial({ color: hex, roughness: 0.75, metalness: 0.05, emissive: glow ? hex : '#000000', emissiveIntensity: glow ? 0.8 : 0 }))
    }
    return materials.get(colour)
  }
  const place = (geometry, colour, joint, at, rot = [0, 0, 0], scale = null) => {
    const mesh = new THREE.Mesh(geometry, mat(colour))
    mesh.position.set(...at)
    mesh.rotation.set(...rot.map((d) => THREE.MathUtils.degToRad(d)), 'YXZ')
    if (scale) mesh.scale.set(...scale)
    joints[joint].add(mesh)
    return mesh
  }
  return {
    box: (colour, joint, at, size, opts = {}) =>
      place(new RoundedBoxGeometry(size[0], size[1], size[2], 2, Math.min(opts.round ?? 0.04, Math.min(...size) * 0.45)), colour, joint, at, opts.rot),
    ball: (colour, joint, at, r, opts = {}) => place(new THREE.SphereGeometry(r, opts.seg ?? 14, opts.rings ?? 10), colour, joint, at, opts.rot, opts.scale),
    cone: (colour, joint, at, r, h, opts = {}) =>
      place(new THREE.CylinderGeometry(opts.tip ?? 0, r, h, opts.sides ?? 8), colour, joint, at, opts.rot, opts.scale),
    tube: (colour, joint, at, r, h, opts = {}) => place(new THREE.CylinderGeometry(opts.tip ?? r, r, h, opts.sides ?? 8), colour, joint, at, opts.rot, opts.scale),
  }
}

export function buildFigure(recipe) {
  const root = new THREE.Group()
  root.name = 'hero-builder-figure'
  const joints = { root }
  for (const [name, parent, at] of JOINTS) {
    const j = new THREE.Group()
    j.name = name
    j.position.set(...at)
    joints[parent].add(j)
    joints[name] = j
  }
  const materials = new Map()
  const k = kit(joints, materials)
  for (const slot of SLOTS) {
    const pick = recipe.parts?.[slot.key]
    const part = PARTS[slot.key]?.find((p) => p.id === pick?.id)
    if (!part) continue
    const shape = Object.fromEntries((part.shape ?? []).map((s) => [s.key, pick.shape?.[s.key] ?? s.value]))
    part.build(k, { ...recipe.colors, ...pick.colors }, shape, recipe)
  }
  root.scale.setScalar(recipe.size ?? 1)
  root.userData = { joints, rest: Object.fromEntries(Object.entries(joints).map(([n, j]) => [n, j.position.clone()])) }
  return root
}

// Poses the figure partway through a move. `t` is seconds since it began.
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
  for (const [name, j] of Object.entries(joints)) {
    if (name === 'root') continue
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
  return !move.loop && t >= len
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
