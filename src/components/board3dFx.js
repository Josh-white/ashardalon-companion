import * as THREE from 'three'
import { FX_MS } from '../board/attackFx.js'
import { chained, IMPACT, msAt, shotOffset, slowMo } from './attackFxDraw.js'
import { HEAL_MS } from './HealFx.jsx'
import { attackMove } from '../board/heroModels.js'
import { face, playMove, setDown } from './figureModels.js'

// Attacks and heals on the 3D board (Board3D.jsx), the same moments the flat board draws
// (board/attackFx.js, board/healFx.js) on the same clock: lightning crackles from figure to
// figure, a fireball arcs over, a frost beam grows, holy light falls from above, a fighter
// lunges and the swing flashes on the target. Then the target flinches red or dodges, the
// "-N" or "MISS" rises, and a defeated monster's standee tips over and fades in smoke.
// A heal rises as a green "+N" with sparkles. With Reduce Motion on only the words show.
//
// Everything here lives for one animation and is thrown away after, apart from the
// pictures (kept on the stage for the next time).

export function canvasTexture(w, h, draw) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  draw(canvas.getContext('2d'), w, h)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

const MELEE = new Set(['weapon', 'slash', 'bite', 'claw'])
export const LOOK_COLORS = {
  weapon: '#f1f5f9',
  slash: '#f87171',
  bite: '#fca5a5',
  claw: '#f87171',
  arrow: '#d6d3d1',
  zap: '#bfdbfe',
  fire: '#fb923c',
  frost: '#67e8f9',
  ray: '#7dd3fc',
  holy: '#fde68a',
  boom: '#c7d2fe',
  arcane: '#c084fc',
  psychic: '#f472b6',
  wind: '#e2e8f0',
  shield: '#fcd34d',
}
export const lookColor = (fx) => (fx.look === 'ray' && fx.color) || LOOK_COLORS[fx.look] || LOOK_COLORS.weapon

// 0 before a, 1 after b, a straight ramp between.
export const seg = (p, a, b) => Math.min(1, Math.max(0, (p - a) / (b - a)))

// The words over a target, in the flat board's words: "-3", "HIT!", "MISS", then
// "DEFEATED!" or "DOWN!" once the blow has landed.
export function shotWords(shot) {
  const hurt = shot.dealt > 0 ? `-${shot.dealt}` : 'HIT!'
  if (shot.result === 'miss') return { first: shot.dealt > 0 ? `MISS -${shot.dealt}` : 'MISS', firstColor: '#cbd5e1' }
  if (shot.result === 'kill') return { first: hurt, firstColor: '#f87171', then: 'DEFEATED!', thenColor: '#fde68a' }
  if (shot.result === 'down') return { first: hurt, firstColor: '#f87171', then: 'DOWN!', thenColor: '#fde68a' }
  return { first: hurt, firstColor: '#f87171' }
}

const cached = (stage, key, make) => {
  if (!stage.textures.has(key)) stage.textures.set(key, make())
  return stage.textures.get(key)
}

// A soft round glow, white so a material's colour tints it.
const glowTexture = (stage) =>
  cached(stage, 'fx:glow', () =>
    canvasTexture(64, 64, (g, w) => {
      const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2)
      r.addColorStop(0, 'rgba(255,255,255,1)')
      r.addColorStop(0.25, 'rgba(255,255,255,0.7)')
      r.addColorStop(1, 'rgba(255,255,255,0)')
      g.fillStyle = r
      g.fillRect(0, 0, w, w)
    }),
  )

// Big outlined words, like the flat board's.
const textTexture = (stage, text, color) =>
  cached(stage, `fx:text:${text}:${color}`, () =>
    canvasTexture(512, 160, (g, w, h) => {
      g.font = '900 104px system-ui, -apple-system, "Segoe UI", sans-serif'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.lineJoin = 'round'
      g.lineWidth = 18
      g.strokeStyle = '#120a04'
      g.strokeText(text, w / 2, h / 2, w - 24)
      g.fillStyle = color
      g.fillText(text, w / 2, h / 2, w - 24)
    }),
  )

// The flash of a blade, a claw's three streaks or a bite's jaws, white so they can be tinted.
const swipeTexture = (stage, look) =>
  cached(stage, `fx:swipe:${look}`, () =>
    canvasTexture(256, 256, (g, w) => {
      g.strokeStyle = '#fff'
      g.fillStyle = '#fff'
      g.lineCap = 'round'
      g.shadowColor = '#fff'
      g.shadowBlur = 18
      if (look === 'claw') {
        g.lineWidth = 14
        for (let i = -1; i <= 1; i++) {
          g.beginPath()
          g.moveTo(70 + i * 38, 40)
          g.quadraticCurveTo(128 + i * 38, 128, 186 + i * 38, 216)
          g.stroke()
        }
      } else if (look === 'bite') {
        for (const flip of [1, -1]) {
          g.save()
          g.translate(w / 2, w / 2)
          g.scale(1, flip)
          g.beginPath()
          g.moveTo(-100, -20)
          g.quadraticCurveTo(0, -110, 100, -20)
          g.lineWidth = 12
          g.stroke()
          for (let i = 0; i < 5; i++) {
            const x = -72 + i * 36
            g.beginPath()
            g.moveTo(x - 12, -46 + Math.abs(x) * 0.28)
            g.lineTo(x + 12, -46 + Math.abs(x) * 0.28)
            g.lineTo(x, -8)
            g.fill()
          }
          g.restore()
        }
      } else {
        // A crescent: thick in the middle, sharp at both ends.
        g.beginPath()
        g.arc(w / 2, w / 2 + 30, 100, -2.7, -0.45)
        g.arc(w / 2, w / 2 + 62, 80, -0.6, -2.55, true)
        g.closePath()
        g.fill()
      }
    }),
  )

// The scratch group everything of one animation hangs on, and how to throw it away.
function scratch(stage) {
  const group = new THREE.Group()
  stage.scene.add(group)
  return {
    group,
    dispose() {
      stage.scene.remove(group)
      group.traverse((o) => {
        o.geometry?.dispose()
        // Cached pictures stay; the materials made for this animation go.
        for (const m of [].concat(o.material ?? [])) m.dispose()
      })
    },
  }
}

function glow(stage, group, color, size) {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: glowTexture(stage), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
  )
  sprite.scale.setScalar(size)
  sprite.renderOrder = 15
  sprite.visible = false
  group.add(sprite)
  return sprite
}

function words(stage, group, text, color, height) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTexture(stage, text, color), transparent: true, depthTest: false, depthWrite: false }))
  sprite.scale.set(height * 3.2, height, 1)
  sprite.renderOrder = 30
  sprite.visible = false
  group.add(sprite)
  return sprite
}

// Sparks (or smoke) flying out of a point. Returns update(age in seconds).
function burst(stage, group, at, color, count, { speed = 2.4, size = 0.16, lift = 1.6, gravity = 4, life = 0.7, smoke = false } = {}) {
  const positions = new Float32Array(count * 3)
  const velocity = []
  for (let i = 0; i < count; i++) {
    const turn = Math.random() * Math.PI * 2
    const v = speed * (0.35 + Math.random() * 0.65)
    velocity.push([Math.cos(turn) * v, lift * (0.3 + Math.random() * 0.7), Math.sin(turn) * v])
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const material = new THREE.PointsMaterial({
    map: glowTexture(stage),
    color,
    size,
    transparent: true,
    depthWrite: false,
    blending: smoke ? THREE.NormalBlending : THREE.AdditiveBlending,
  })
  const points = new THREE.Points(geometry, material)
  points.renderOrder = 16
  points.visible = false
  points.frustumCulled = false
  group.add(points)
  return (age) => {
    points.visible = age >= 0 && age < life
    if (!points.visible) return
    for (let i = 0; i < count; i++) {
      const [vx, vy, vz] = velocity[i]
      const slow = smoke ? 1 / (1 + age * 2) : 1
      positions[i * 3] = at.x + vx * age * slow
      positions[i * 3 + 1] = at.y + vy * age - (gravity * age * age) / 2
      positions[i * 3 + 2] = at.z + vz * age * slow
    }
    geometry.attributes.position.needsUpdate = true
    material.opacity = (smoke ? 0.55 : 1) * (1 - age / life)
    material.size = smoke ? size * (1 + age * 2) : size
  }
}

// A straight glowing beam between two points, `reach` of the way along.
function beam(group, color, radius, opacity) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 1, 10, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }),
  )
  mesh.renderOrder = 14
  mesh.visible = false
  group.add(mesh)
  const up = new THREE.Vector3(0, 1, 0)
  return (from, to, reach, fade) => {
    const dir = to.clone().sub(from)
    const len = dir.length() * reach
    mesh.visible = len > 0.01 && fade > 0
    if (!mesh.visible) return
    mesh.quaternion.setFromUnitVectors(up, dir.normalize())
    mesh.position.copy(from).addScaledVector(dir, len / 2)
    mesh.scale.set(radius, len, radius)
    mesh.material.opacity = opacity * fade
  }
}

// How the attack travels from the attacker to one target. Returns update(p).
function projectile(stage, group, fx, from, to, hitAt, miss) {
  const color = lookColor(fx)
  const dir = to.clone().sub(from)
  const side = new THREE.Vector3(-dir.z, 0, dir.x).normalize()
  const along = (k, arc) => from.clone().lerp(to, k).add(new THREE.Vector3(0, Math.sin(Math.PI * k) * arc, 0))

  if (fx.look === 'zap') {
    const sparks = Array.from({ length: 14 }, () => glow(stage, group, color, 0.22))
    const core = beam(group, '#ffffff', 0.018, 1)
    let jitter = 0
    let bends = []
    return (p) => {
      const reach = seg(p, hitAt - 0.2, hitAt)
      const on = p > hitAt - 0.2 && p < hitAt + 0.12
      // The bolt re-forks a few times a second.
      if (Math.floor(p * 60) !== jitter) {
        jitter = Math.floor(p * 60)
        bends = sparks.map((_, i) => (i === 0 || i === sparks.length - 1 ? 0 : (Math.random() - 0.5) * 0.36))
      }
      sparks.forEach((s, i) => {
        const k = (i / (sparks.length - 1)) * reach
        s.visible = on
        s.position.copy(from).lerp(to, k).addScaledVector(side, bends[i] ?? 0).add(new THREE.Vector3(0, (bends[i] ?? 0) * 0.6, 0))
        s.material.opacity = 0.6 + Math.random() * 0.4
      })
      core(from, to, on ? reach : 0, 1)
    }
  }

  if (fx.look === 'fire') {
    const head = glow(stage, group, color, 0.5)
    const heart = glow(stage, group, '#fef08a', 0.22)
    const trail = Array.from({ length: 6 }, (_, i) => glow(stage, group, '#f97316', 0.34 - i * 0.04))
    return (p) => {
      const k = seg(p, hitAt - 0.3, hitAt)
      const on = k > 0 && k < 1
      head.visible = heart.visible = on
      head.position.copy(along(k, 0.7))
      heart.position.copy(head.position)
      head.scale.setScalar(0.4 + k * 0.4)
      trail.forEach((t, i) => {
        t.visible = on && k > (i + 1) * 0.05
        t.position.copy(along(Math.max(0, k - (i + 1) * 0.05), 0.7))
        t.material.opacity = 0.7 - i * 0.1
      })
    }
  }

  if (fx.look === 'frost' || fx.look === 'ray') {
    const outer = beam(group, color, 0.13, 0.35)
    const inner = beam(group, '#ffffff', 0.04, 0.9)
    const tip = glow(stage, group, color, 0.5)
    return (p) => {
      const reach = seg(p, hitAt - 0.22, hitAt)
      const fade = 1 - seg(p, hitAt + 0.05, hitAt + 0.25)
      outer(from, to, reach, fade)
      inner(from, to, reach, fade)
      tip.visible = reach > 0 && fade > 0
      tip.position.copy(from).lerp(to, reach)
      tip.material.opacity = fade
    }
  }

  if (fx.look === 'holy') {
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.34, 3.2, 20, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    )
    pillar.renderOrder = 14
    group.add(pillar)
    const halo = glow(stage, group, color, 0.7)
    return (p) => {
      const fall = seg(p, hitAt - 0.18, hitAt)
      const fade = 1 - seg(p, hitAt + 0.08, hitAt + 0.35)
      pillar.visible = fall > 0 && fade > 0
      pillar.position.set(to.x, 1.6 + (1 - fall) * 2.5, to.z)
      pillar.scale.set(1 - fall * 0.3 + (1 - fade) * 0.6, 1, 1 - fall * 0.3 + (1 - fade) * 0.6)
      pillar.material.opacity = 0.55 * fall * fade
      // The caster's hands glow while the light gathers.
      halo.visible = p > hitAt - 0.35 && p < hitAt
      halo.position.copy(from)
      halo.scale.setScalar(0.5 + Math.sin(p * 80) * 0.1)
    }
  }

  if (fx.look === 'boom') {
    const wave = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 1, 48),
      new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    )
    wave.rotation.x = -Math.PI / 2
    wave.renderOrder = 14
    group.add(wave)
    const reachTo = dir.length()
    return (p) => {
      const k = seg(p, hitAt - 0.25, hitAt + 0.05)
      wave.visible = k > 0 && k < 1
      wave.position.set(from.x, 0.15, from.z)
      wave.scale.setScalar(0.3 + reachTo * k)
      wave.material.opacity = 0.9 * (1 - k * k)
    }
  }

  if (fx.look === 'arcane' || fx.look === 'wind') {
    const many = fx.look === 'arcane' ? 3 : 7
    const orbs = Array.from({ length: many }, () => [glow(stage, group, color, fx.look === 'arcane' ? 0.34 : 0.2), glow(stage, group, '#ffffff', 0.12)])
    return (p) => {
      orbs.forEach(([orb, core], j) => {
        const k = seg(p, hitAt - 0.32 + j * 0.025, hitAt)
        orb.visible = core.visible = k > 0 && k < 1
        if (!orb.visible) return
        const bend = fx.look === 'arcane' ? (j - 1) * 0.9 * Math.sin(Math.PI * k) : Math.sin(k * Math.PI * 4 + j) * 0.3 * (1 - k)
        orb.position.copy(along(k, fx.look === 'arcane' ? 0.5 : 0.2)).addScaledVector(side, bend)
        if (fx.look === 'wind') orb.position.y += Math.cos(k * Math.PI * 4 + j) * 0.25 * (1 - k)
        core.position.copy(orb.position)
      })
    }
  }

  if (fx.look === 'psychic') {
    const rings = [0, 1].map(() => {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1, 0.035, 6, 40),
        new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
      )
      ring.renderOrder = 14
      group.add(ring)
      return ring
    })
    return (p) => {
      const k = seg(p, hitAt - 0.3, hitAt)
      const fade = 1 - seg(p, hitAt, hitAt + 0.2)
      rings.forEach((ring, j) => {
        ring.visible = k > 0 && fade > 0
        ring.position.copy(to)
        ring.scale.setScalar(0.95 - k * 0.6 + j * 0.15)
        ring.rotation.set(Math.PI / 2 + Math.sin(p * 30 + j) * 0.5, p * 40 * (j ? -1 : 1), 0)
        ring.material.opacity = 0.9 * fade
      })
    }
  }

  if (fx.look === 'arrow') {
    const arrow = new THREE.Group()
    const wood = new THREE.MeshStandardMaterial({ color: '#a16207', roughness: 0.8 })
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.5, 6), wood)
    shaft.rotation.x = Math.PI / 2
    const point = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 8), new THREE.MeshStandardMaterial({ color: '#d4d4d8', metalness: 0.7, roughness: 0.3 }))
    point.rotation.x = Math.PI / 2
    point.position.z = 0.3
    arrow.add(shaft, point)
    arrow.visible = false
    group.add(arrow)
    // A miss sails on past.
    const end = miss ? to.clone().add(dir.clone().normalize().multiplyScalar(0.9)).addScaledVector(side, 0.25) : to
    return (p) => {
      const k = seg(p, hitAt - 0.18, miss ? hitAt + 0.08 : hitAt)
      arrow.visible = k > 0 && k < 1
      const at = from.clone().lerp(end, k).add(new THREE.Vector3(0, Math.sin(Math.PI * k) * 0.3, 0))
      const next = from.clone().lerp(end, Math.min(1, k + 0.02)).add(new THREE.Vector3(0, Math.sin(Math.PI * Math.min(1, k + 0.02)) * 0.3, 0))
      arrow.position.copy(at)
      arrow.lookAt(next)
    }
  }

  if (fx.look === 'shield') {
    // A round red shield with a gold rim and boss, flying flat like a frisbee, spinning
    // around its middle, out to the monster and back to the hero.
    const shield = new THREE.Group()
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.04, 28), new THREE.MeshStandardMaterial({ color: '#b91c1c', metalness: 0.3, roughness: 0.5 }))
    const gold = new THREE.MeshStandardMaterial({ color: '#fbbf24', metalness: 0.9, roughness: 0.25, emissive: '#92400e', emissiveIntensity: 0.5 })
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.025, 8, 32), gold)
    rim.rotation.x = Math.PI / 2
    const boss = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), gold)
    boss.position.y = 0.02
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.045, 0.05), gold)
    shield.add(face, rim, boss, stripe)
    shield.visible = false
    group.add(shield)
    const shine = glow(stage, group, color, 0.55)
    return (p) => {
      const out = seg(p, hitAt - 0.25, hitAt)
      const back = seg(p, hitAt + 0.05, 0.85)
      shield.visible = shine.visible = out > 0 && back < 1
      shield.position.copy(out < 1 ? along(out, 0.4) : to.clone().lerp(from, back).add(new THREE.Vector3(0, Math.sin(Math.PI * back) * 0.4, 0)))
      // Flat, tipped a little toward the camera so its face shows, spinning like a frisbee.
      shield.rotation.set(0.35, p * 45, 0, 'XYZ')
      shine.position.copy(shield.position)
    }
  }

  // Swords, claws and jaws: the flash of the blow, right on the target.
  const swipe = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: swipeTexture(stage, fx.look), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }),
  )
  swipe.renderOrder = 20
  swipe.visible = false
  group.add(swipe)
  const spot = miss ? to.clone().addScaledVector(side, 0.35) : to
  return (p) => {
    const k = seg(p, hitAt - 0.06, hitAt + 0.2)
    swipe.visible = k > 0 && k < 1
    swipe.position.copy(spot)
    swipe.scale.setScalar(0.5 + k * (fx.look === 'bite' ? 0.4 : 0.8))
    swipe.material.rotation = fx.look === 'bite' ? 0 : 0.6 - k * 1.2
    swipe.material.opacity = (miss ? 0.5 : 1) * (1 - k)
  }
}

// A defeated monster's standee (its figure is already gone from the board), shaking, then
// tipping over backwards and fading.
function ghost(stage, group, at, picture) {
  const card = new THREE.Group()
  const back = new THREE.Mesh(new THREE.CircleGeometry(0.44, 40), new THREE.MeshStandardMaterial({ color: '#1c1917', transparent: true, side: THREE.DoubleSide }))
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.84), new THREE.MeshStandardMaterial({ map: picture, transparent: true, alphaTest: 0.05, roughness: 0.7 }))
  face.position.z = 0.006
  // Turned about its foot, so it falls over rather than spinning in the air.
  back.position.y = face.position.y = 0.48
  card.add(back, face)
  card.position.set(at.x, 0.08, at.z)
  card.rotation.order = 'YXZ'
  card.rotation.y = Math.atan2(stage.camera.position.x - at.x, stage.camera.position.z - at.z)
  card.visible = false
  group.add(card)
  return (p, hitAt) => {
    const gone = seg(p, hitAt + 0.18, 0.92)
    card.visible = gone < 1
    const shaking = p > hitAt && p < hitAt + 0.25
    card.position.x = at.x + (shaking ? Math.sin(p * 300) * 0.05 * (1 - seg(p, hitAt, hitAt + 0.25)) : 0)
    card.rotation.x = -0.3 - gone * 1.25
    card.position.y = 0.08 - gone * 0.1
    for (const m of [back.material, face.material]) m.opacity = 1 - gone
  }
}

// A defeated monster crumbles to dust where it fell, and its gold flies to the hero.
function crumble(stage, group, node, at, hero, hitAt, fewer) {
  const start = Math.min(0.78, hitAt + 0.42)
  const dust = burst(stage, group, new THREE.Vector3(at.x, 0.15, at.z), '#a8a29e', Math.round(26 * fewer), { smoke: true, size: 0.35, speed: 0.9, lift: 0.5, gravity: -0.2, life: 1.1 })
  const dustSec = msAt(start) / 1000
  const coins = []
  const coinMat = new THREE.MeshStandardMaterial({ color: '#fbbf24', metalness: 0.9, roughness: 0.25, emissive: '#92400e', emissiveIntensity: 0.6 })
  const coinGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.03, 16)
  const count = Math.round(9 * fewer) + 1
  for (let i = 0; i < count; i++) {
    const coin = new THREE.Mesh(coinGeo, i === 0 ? coinMat : coinMat.clone())
    coin.visible = false
    group.add(coin)
    coins.push({ coin, wait: i * 0.025, side: (Math.random() - 0.5) * 0.9, up: 0.9 + Math.random() * 0.7 })
  }
  const pop = burst(stage, group, hero.clone(), '#fde68a', Math.round(14 * fewer), { size: 0.12, speed: 1.2, lift: 1.2 })
  const popAt = Math.min(0.97, start + 0.36)
  const popSec = msAt(popAt) / 1000
  const across = hero.clone().sub(at).setY(0)
  const sideways = new THREE.Vector3(-across.z, 0, across.x).normalize()
  return (p, sec) => {
    if (node) {
      const k = seg(p, start, start + 0.2)
      node.userData.body.scale.set(1 + k * 0.25, Math.max(0.02, 1 - k), 1 + k * 0.25)
      node.userData.body.visible = k < 1
    }
    dust(sec - dustSec)
    for (const c of coins) {
      const k = seg(p, start + c.wait, popAt)
      c.coin.visible = k > 0 && k < 1
      if (!c.coin.visible) continue
      const pos = at.clone().lerp(hero, k).addScaledVector(sideways, Math.sin(Math.PI * k) * c.side)
      pos.y = 0.3 + Math.sin(Math.PI * k) * c.up
      c.coin.position.copy(pos)
      c.coin.rotation.set(p * 40, 0, p * 25)
    }
    pop(sec - popSec)
  }
}

let crackTexture = null
function crackPicture() {
  crackTexture ??= canvasTexture(256, 256, (g, w) => {
    const c = w / 2
    g.translate(c, c)
    g.lineCap = 'round'
    for (const [width, color] of [
      [14, 'rgba(220,38,38,0.35)'],
      [6, 'rgba(248,113,113,0.9)'],
      [2, 'rgba(254,240,138,1)'],
    ]) {
      g.strokeStyle = color
      g.lineWidth = width
      for (let i = 0; i < 7; i++) {
        let a = (i / 7) * Math.PI * 2 + Math.sin(i * 7.1) * 0.3
        let r = 8
        g.beginPath()
        g.moveTo(Math.cos(a) * r, Math.sin(a) * r)
        while (r < c - 10) {
          r += 14 + ((i * 13 + r) % 9)
          a += Math.sin(r * 0.37 + i) * 0.35
          g.lineTo(Math.cos(a) * r, Math.sin(a) * r)
        }
        g.stroke()
      }
    }
  })
  return crackTexture
}

// A defeated villain: the floor cracks open under it, red light pours out, and it sinks in.
function villainCrack(stage, group, node, at, hitAt, fewer) {
  const start = Math.min(0.7, hitAt + 0.3)
  const crack = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 2.4),
    new THREE.MeshBasicMaterial({ map: crackPicture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  )
  crack.rotation.x = -Math.PI / 2
  crack.position.set(at.x, 0.03, at.z)
  crack.visible = false
  group.add(crack)
  const shine = glow(stage, group, '#dc2626', 3.2)
  const embers = burst(stage, group, new THREE.Vector3(at.x, 0.1, at.z), '#f97316', Math.round(30 * fewer), { size: 0.16, speed: 0.7, lift: 2.4, gravity: -0.4, life: 1.2 })
  const emberSec = msAt(start + 0.08) / 1000
  return (p, sec) => {
    const open = seg(p, start, start + 0.15)
    const fade = 1 - seg(p, 0.9, 1)
    crack.visible = shine.visible = open > 0 && fade > 0
    crack.scale.setScalar(0.2 + open * 0.8)
    crack.material.opacity = fade
    shine.position.set(at.x, 0.4, at.z)
    shine.material.opacity = open * fade * (0.75 + Math.sin(p * 90) * 0.25)
    embers(sec - emberSec)
    if (node) {
      const sink = seg(p, start + 0.08, 0.92)
      const { body } = node.userData
      body.position.y = -sink * 1.6
      body.position.x = sink > 0 && sink < 1 ? Math.sin(p * 260) * 0.03 : 0
      body.visible = sink < 1
    }
  }
}

// A figure taken off the board without being defeated (a monster sent away, a villager who
// leaves) drops through a purple portal; a hero who leaves (escapes, swaps out) rises up a
// beam of light. `done` takes the figure away after. Returns stop().
export function playExit3D(stage, node, done) {
  const { group, dispose } = scratch(stage)
  const fewer = stage.calm ? 0.5 : 1
  const at = node.position.clone()
  const hero = node.userData.kind === 'hero'
  const { body } = node.userData
  const parts = []
  if (hero) {
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.5, 7, 28, 1, true),
      new THREE.MeshBasicMaterial({ color: '#fde68a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    )
    beam.position.set(at.x, 3.5, at.z)
    group.add(beam)
    const shine = glow(stage, group, '#fde68a', 1.8)
    const sparkle = burst(stage, group, new THREE.Vector3(at.x, 0.2, at.z), '#fef08a', Math.round(24 * fewer), { size: 0.12, speed: 0.5, lift: 2.6, gravity: -0.6, life: 1.4 })
    parts.push((k, sec) => {
      const on = seg(k, 0, 0.18) * (1 - seg(k, 0.82, 1))
      beam.material.opacity = on * 0.32
      shine.visible = on > 0
      shine.position.set(at.x, 0.5 + body.position.y, at.z)
      shine.material.opacity = on
      const lift = seg(k, 0.2, 0.85)
      body.position.y = lift * lift * 3.2
      body.scale.setScalar(1 - lift * 0.6)
      body.rotation.y = lift * 4
      body.visible = lift < 1
      sparkle(sec - 0.3)
    })
  } else {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.3, 0.52, 40),
      new THREE.MeshBasicMaterial({ color: '#a855f7', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    )
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.32, 40), new THREE.MeshBasicMaterial({ color: '#1e0b36', transparent: true, depthWrite: false }))
    for (const m of [ring, hole]) {
      m.rotation.x = -Math.PI / 2
      m.position.set(at.x, 0.025, at.z)
      group.add(m)
    }
    const shine = glow(stage, group, '#c084fc', 1.6)
    const swirl = burst(stage, group, new THREE.Vector3(at.x, 0.05, at.z), '#d8b4fe', Math.round(22 * fewer), { size: 0.12, speed: 0.9, lift: 1.2, gravity: 1.5, life: 0.9 })
    parts.push((k, sec) => {
      const open = seg(k, 0, 0.2) * (1 - seg(k, 0.8, 1))
      ring.scale.setScalar(0.1 + open * 1.1)
      hole.scale.setScalar(0.1 + open * 1.1)
      ring.rotation.z = k * 12
      ring.material.opacity = open
      hole.material.opacity = open * 0.95
      shine.visible = open > 0
      shine.position.set(at.x, 0.15, at.z)
      shine.material.opacity = open * 0.8
      const fall = seg(k, 0.22, 0.75)
      body.position.y = -fall * fall * 1.1
      body.scale.setScalar(1 - fall * 0.8)
      body.rotation.y = fall * fall * 14
      body.visible = fall < 1
      swirl(sec - 0.25)
    })
  }
  let over = false
  const stop = () => {
    if (over) return
    over = true
    dispose()
    tween.start = -Infinity
    done()
    stage.render()
  }
  const ms = hero ? 1800 : 1500
  const tween = {
    ms,
    step: (k) => {
      if (over) return
      for (const part of parts) part(k, (k * ms) / 1000)
      if (k >= 1) stop()
    },
  }
  stage.tweens.push(tween)
  stage.render()
  return stop
}

// A part that does something once, when the animation reaches `at`.
function once(at, run) {
  let done = false
  return (p) => {
    if (done || p < at) return
    done = true
    run()
  }
}

const leavingAt = (stage, square) =>
  [...(stage.leaving ?? [])].find((n) => n.userData.at && n.userData.at[0] === square[0] && n.userData.at[1] === square[1] && !n.userData.claimed) ?? null

const nodeAt = (stage, square) =>
  [...stage.nodes.values()].find((n) => n.userData.at && n.userData.at[0] === square[0] && n.userData.at[1] === square[1]) ?? null

// The middle of a standee's token, or where it stood.
function aimPoint(stage, square, node) {
  const [x, z] = stage.at(square[0], square[1])
  return new THREE.Vector3(x, 0.55 * (node?.userData.body.scale.y ?? 1), z)
}

// Plays one attack (`fx` from board/attackFx.js). `picture(art)` gives a defeated monster's
// token picture. Returns stop(), which clears it all away at once.
export function playAttack3D(stage, fx, picture) {
  const { group, dispose } = scratch(stage)
  const still = Boolean(stage.still)
  const fewer = stage.calm ? 0.5 : 1
  const color = lookColor(fx)
  const attacker = nodeAt(stage, fx.from)
  const origin = aimPoint(stage, fx.from, attacker)
  const parts = []
  const touched = new Set()
  const text = stage.calm ? 0.42 : 0.5

  const aims = []
  const claimed = []
  fx.shots.forEach((shot, i) => {
    const hitAt = IMPACT + shotOffset(fx, i)
    // A defeated monster's 3D figure waits on the board for this blow (Board3D keeps it).
    const fallen = shot.result === 'kill' ? leavingAt(stage, shot.to) : null
    if (fallen) {
      clearTimeout(fallen.userData.leaveTimer)
      fallen.userData.claimed = true
      claimed.push(fallen)
    }
    const target = shot.result === 'kill' ? fallen : nodeAt(stage, shot.to)
    const to = aimPoint(stage, shot.to, target)
    aims.push(to)
    const from = chained(fx) && i > 0 ? aims[i - 1] : origin
    const miss = shot.result === 'miss'
    const hitSec = msAt(hitAt) / 1000

    if (!still) parts.push(projectile(stage, group, fx, from, to, hitAt, miss))

    // The words over the target.
    const say = shotWords(shot)
    const first = words(stage, group, say.first, say.firstColor, text)
    const then = say.then ? words(stage, group, say.then, say.thenColor, text) : null
    parts.push((p) => {
      const k = seg(p, hitAt + 0.02, 0.95)
      const fade = 1 - seg(p, 0.85, 1)
      const late = then && p > hitAt + 0.25
      for (const [sprite, on] of [
        [first, !late],
        [then, late],
      ]) {
        if (!sprite) continue
        sprite.visible = on && p > hitAt + 0.02 && fade > 0
        sprite.position.set(to.x, to.y + 0.75 + (still ? 0.2 : k * 0.6), to.z)
        sprite.material.opacity = fade
      }
    })
    if (still) return

    if (miss) {
      // The target steps aside, a little away from the blow.
      if (target) {
        touched.add(target)
        const d = to.clone().sub(from).setY(0).normalize()
        const away = new THREE.Vector3(-d.z, 0, d.x).multiplyScalar(0.3).addScaledVector(d, 0.12)
        // A hero figure turns to the blow and jumps aside.
        parts.push(once(hitAt - 0.15, () => {
          face(target, from.x - to.x, from.z - to.z)
          playMove(target, 'dodge')
        }))
        parts.push((p) => {
          const k = seg(p, hitAt - 0.15, hitAt) * (1 - seg(p, hitAt + 0.05, hitAt + 0.3))
          target.userData.body.position.x = away.x * k
          target.userData.body.position.z = away.z * k
        })
      }
      return
    }

    // A hit: sparks, a flash of light, and the target flinches red.
    const sparks = burst(stage, group, to, color, Math.round(26 * fewer), { size: 0.18 })
    const white = burst(stage, group, to, '#ffffff', Math.round(12 * fewer), { size: 0.1, speed: 3.2 })
    parts.push((p, sec) => {
      sparks(sec - hitSec)
      white(sec - hitSec)
      if (p >= hitAt && p < hitAt + 0.2) {
        stage.flash.position.set(to.x, to.y + 0.6, to.z)
        stage.flash.color.set(color)
        stage.flash.intensity = 30 * (1 - seg(p, hitAt, hitAt + 0.2))
      }
    })
    if (target) {
      touched.add(target)
      parts.push(once(hitAt, () => target.userData.anim?.down || playMove(target, 'hit')))
      parts.push((p, sec) => {
        const age = sec - hitSec
        const k = age > 0 && age < 0.45 ? 1 - age / 0.45 : 0
        target.userData.body.rotation.z = Math.sin(age * 55) * 0.22 * k
        target.userData.faceMat.emissive.set('#dc2626')
        target.userData.faceMat.emissiveIntensity = k * 0.9
      })
    }
    if (shot.result === 'kill') {
      const smoke = burst(stage, group, new THREE.Vector3(to.x, 0.3, to.z), '#57534e', Math.round(20 * fewer), { smoke: true, size: 0.55, speed: 0.8, lift: 0.9, gravity: -0.6, life: 1.4 })
      const stars = burst(stage, group, to, '#fde68a', Math.round(16 * fewer), { size: 0.14, speed: 1.8 })
      const smokeSec = msAt(hitAt + 0.2) / 1000
      // The figure staggers and falls (a standee tips over); then a monster crumbles to
      // dust and its gold flies to the hero who won, and a villain sinks into a burning crack.
      const villain = fallen?.userData.kind === 'villain'
      const fall = fallen
        ? (p) => {
            const { body, anim } = fallen.userData
            if (p > hitAt + 0.15) {
              if (anim && !anim.down) setDown(fallen, true)
              if (!anim) body.rotation.x = -seg(p, hitAt + 0.15, hitAt + 0.4) * 1.35
            }
          }
        : shot.art
          ? ghost(stage, group, to, picture(shot.art))
          : null
      const after = villain ? villainCrack(stage, group, fallen, to, hitAt, fewer) : crumble(stage, group, fallen, to, origin, hitAt, fewer)
      parts.push(after)
      parts.push((p, sec) => {
        smoke(sec - smokeSec)
        stars(sec - smokeSec)
        fall?.(p, hitAt)
      })
    }
  })

  // A hero figure turns to its (first) target and swings, shoots, throws or casts.
  // (A figure whose model is still loading turns and swings once it's in.)
  if (!still && attacker && aims.length > 0) {
    const turn = () => face(attacker, aims[0].x - origin.x, aims[0].z - origin.z)
    turn()
    parts.push(
      once(IMPACT - 0.3, () => {
        turn()
        playMove(attacker, attackMove(fx.look))
      }),
    )
  }

  // A fighter (or a monster's claws and jaws) lunges in at a single target.
  if (!still && attacker && MELEE.has(fx.look) && fx.shots.length === 1) {
    touched.add(attacker)
    const d = aims[0].clone().sub(origin).setY(0)
    const len = d.length() || 1
    const reach = Math.min(0.75, Math.max(0, len - 0.9)) / len
    parts.push((p) => {
      const k = seg(p, IMPACT - 0.2, IMPACT) * (1 - seg(p, IMPACT + 0.05, IMPACT + 0.3))
      attacker.userData.body.position.x = d.x * reach * k
      attacker.userData.body.position.z = d.z * reach * k
    })
  }

  // The board jolts when a blow lands.
  let shake = new THREE.Vector3()
  if (!still && fx.shots.some((s) => s.result !== 'miss')) {
    parts.push((p) => {
      stage.camera.position.sub(shake)
      const k = p > IMPACT && p < IMPACT + 0.12 ? 1 - seg(p, IMPACT, IMPACT + 0.12) : 0
      shake = new THREE.Vector3(Math.sin(p * 400), Math.cos(p * 330), 0).multiplyScalar(0.05 * k)
      stage.camera.position.add(shake)
    })
  }

  let over = false
  const stop = () => {
    if (over) return
    over = true
    stage.camera.position.sub(shake)
    stage.flash.intensity = 0
    for (const node of touched) {
      const { body, faceMat } = node.userData
      body.position.x = body.position.z = 0
      body.rotation.z = 0
      faceMat.emissiveIntensity = 0
    }
    for (const node of claimed) node.userData.gone?.()
    dispose()
    tween.start = -Infinity
    stage.render()
  }
  // A little longer than the flat board's, so the last sparks and smoke can settle.
  const ms = FX_MS + 500
  const tween = {
    ms,
    step: (k) => {
      if (over) return
      const sec = (k * ms) / 1000
      const p = slowMo(Math.min(1, (k * ms) / FX_MS))
      if (stage.flash.intensity) stage.flash.intensity = 0
      for (const part of parts) part(p, sec)
      if (k >= 1) stop()
    },
  }
  stage.tweens.push(tween)
  stage.render()
  return stop
}

// A green "+N" rising off a healed hero, with a ring of light and sparkles, after `delay` ms.
export function playHeal3D(stage, node, amount, delay) {
  const { group, dispose } = scratch(stage)
  const still = Boolean(stage.still)
  const at = node.position.clone()
  const top = 0.55 * node.userData.body.scale.y
  const label = words(stage, group, `+${amount}`, '#4ade80', stage.calm ? 0.46 : 0.55)
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.38, 0.5, 40),
    new THREE.MeshBasicMaterial({ color: '#4ade80', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
  )
  ring.rotation.x = -Math.PI / 2
  ring.position.set(at.x, 0.03, at.z)
  ring.visible = false
  group.add(ring)
  const sparkles = still ? null : burst(stage, group, new THREE.Vector3(at.x, 0.2, at.z), '#86efac', stage.calm ? 10 : 20, { size: 0.12, speed: 0.6, lift: 1.4, gravity: -0.4, life: 1.6 })
  let over = false
  const stop = () => {
    if (over) return
    over = true
    node.userData.faceMat.emissiveIntensity = 0
    dispose()
    tween.start = -Infinity
    stage.render()
  }
  const tween = {
    wait: delay,
    ms: HEAL_MS,
    step: (k) => {
      if (over) return
      const on = k > 0 && k < 1
      label.visible = ring.visible = on
      label.position.set(node.position.x, top + 0.8 + (still ? 0.2 : k * 0.6), node.position.z)
      label.material.opacity = seg(k, 0, 0.08) * (1 - seg(k, 0.7, 1))
      ring.position.set(node.position.x, 0.03, node.position.z)
      ring.material.opacity = on ? 0.8 * (1 - k) * (0.7 + Math.sin(k * 30) * 0.3) : 0
      ring.scale.setScalar(1 + k * 0.4)
      sparkles?.(on ? (k * HEAL_MS) / 1000 : -1)
      if (!still) {
        node.userData.faceMat.emissive.set('#22c55e')
        node.userData.faceMat.emissiveIntensity = on ? 0.5 * (1 - seg(k, 0.1, 0.6)) : 0
      }
      if (k >= 1) stop()
    },
  }
  stage.tweens.push(tween)
  stage.render()
  return stop
}
