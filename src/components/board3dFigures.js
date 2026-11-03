import * as THREE from 'three'
import { artUrl } from '../state/useArt.js'
import { TOKEN_COLORS } from './Board.jsx'
import { canvasTexture, playExit3D } from './board3dFx.js'
import { attachModel, detachModel, face, setDown, setWalking } from './figureModels.js'
import { FIGURE_EXIT_MS, FX_DELAY_MS, HERO_EXIT_MS } from '../board/attackFx.js'
import { disposeTree, seeded } from './board3dDungeon.js'

// The 3D board's figures and markers (Board3D.jsx): standees and their icons, the cage,
// figures walking to new squares, and the floor markers, items and lit squares.

const STEP_MS = 180
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
export function cachedPicture(stage, url) {
  return texture(stage, url, { label: '?', kind: 'monster' })
}

// Markers, tokens and the way out, rebuilt whenever one of them changes. Lava glows and
// shimmers, vapors drift and the open way out pulses (all still with Reduce Motion on).
export function buildExtras(stage, extras) {
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
export function buildLit(stage, targets) {
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
  // A cage still flying off (freed, then caged again quickly, as with Undo) goes now
  // instead of being left hanging over the hero.
  for (const t of stage.tweens) if (t.cageOf === node) t.done?.()
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
    else stage.tweens.push({ cageOf: node, ms: 600, done: gone, step: (k) => (cage.position.y = k * k * 2.4, k >= 1 && gone()) })
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
export function syncFigures(stage, figures, art, fallAt, killedAt = () => false) {
  const seen = new Set()
  // Squares a figure is about to leave (or is leaving) by portal or beam of light, and how
  // long that takes. A figure arriving on one waits for it (a Time Leap's monster takes the
  // vanishing hero's square), so the two don't play on top of each other.
  const ids = new Set(figures.map((f) => f.id))
  const exits = new Map()
  if (!stage.still) {
    for (const [id, node] of stage.nodes) {
      if (!ids.has(id) && node.userData.at && !node.userData.anim?.down && !killedAt(node.userData.at)) {
        exits.set(`${node.userData.at[0]},${node.userData.at[1]}`, node.userData.kind === 'hero' ? HERO_EXIT_MS : FIGURE_EXIT_MS)
      }
    }
  }
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
      const wait = exits.get(`${f.at[0]},${f.at[1]}`)
      if (wait) arriveAfter(stage, node, wait)
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

// A figure that waits off the board, then pops up onto its square.
function arriveAfter(stage, node, wait) {
  node.scale.setScalar(0.001)
  node.visible = false
  stage.tweens.push({
    wait,
    ms: 380,
    step: (k) => {
      if (k <= 0) return
      node.visible = true
      // Grows with a little overshoot, then settles.
      node.scale.setScalar(Math.max(0.001, 1 + 2.2 * (k - 1) ** 3 + 1.2 * (k - 1) ** 2))
    },
  })
}

// A figure standing still turns (quickly) to look at its foe (restFacing in scene3d.js).
// Walking, attacking or lying down it doesn't: those face their own way.
export function lookAtRest(stage, node, now = false) {
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
