import { FX_MS } from '../board/attackFx.js'
import { SQUARE } from './TileDrawing.jsx'

// The canvas drawing for an attack's animation (AttackFx.jsx puts the canvas over the
// virtual board and calls drawFrame each frame): lightning, a sword swing, an arrow, a
// fireball and so on, then the hit, the miss or the fall. Also the animation's timing,
// which the tokens' CSS moves (tokenFx in AttackFx.jsx) share.

// Where the attack reaches its target, as a share of the animation (see slowMo).
export const IMPACT = 0.5
// The effects are drawn as if a token were this many units across its middle.
export const R = 70
// Arc Lightning jumps from its first target to its second this much later.
export const CHAIN = 0.14

// The animation slows right down at the hit: real time 0..1 to animation time 0..1.
export function slowMo(t) {
  const a = 0.35
  const b = 0.62
  if (t < a) return (t * (IMPACT - 0.05)) / a
  if (t < b) return IMPACT - 0.05 + ((t - a) / (b - a)) * 0.17
  return IMPACT + 0.12 + ((t - b) / (1 - b)) * (1 - IMPACT - 0.12)
}
// The ms into the animation when it reaches `p` (the other way round from slowMo).
export function msAt(p) {
  let lo = 0
  let hi = 1
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2
    if (slowMo(mid) < p) lo = mid
    else hi = mid
  }
  return Math.round(lo * FX_MS)
}

// Each shot's own start, as a share of the animation: Arc Lightning's second target is struck by the bolt after the first.
export const chained = (fx) => fx.by === 'hero' && fx.look === 'zap' && fx.shots.length > 1
export const shotOffset = (fx, i) => (chained(fx) ? i * CHAIN : 0)

// Clears the whole canvas. The drawing is scaled to the tokens' size, so the scale comes
// off first: a clear at the drawing's scale on a small board left words like MISS behind.
export function wipe(g) {
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.clearRect(0, 0, g.canvas.width, g.canvas.height)
}

export function drawFrame(scene, canvas, anchor, p) {
  const { g, fx } = scene
  const box = canvas.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  const [w, h] = [Math.round(box.width * dpr), Math.round(box.height * dpr)]
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w
    canvas.height = h
  }
  // Last frame's drawing goes first, even when the board is hidden and nothing is drawn.
  wipe(g)
  const m = anchor.getScreenCTM()
  if (!m || box.width === 0) return
  // One token's radius on this screen, in canvas pixels; everything is drawn to scale with it.
  const radius = (SQUARE / 2 - 3) * Math.hypot(m.a, m.b) * (canvas.width / box.width)
  const k = radius / R
  const at = ([x, y]) => {
    const pt = new DOMPoint(x * SQUARE + SQUARE / 2, y * SQUARE + SQUARE / 2).matrixTransform(m)
    return { x: (((pt.x - box.left) * canvas.width) / box.width) / k, y: (((pt.y - box.top) * canvas.height) / box.height) / k }
  }
  g.setTransform(k, 0, 0, k, 0, 0)
  scene.k = k

  for (const s of scene.scorch) scorch(g, s)
  const from = at(fx.from)
  fx.shots.forEach((shot, i) => {
    const off = shotOffset(fx, i)
    const local = p - off
    if (local < 0) return
    const start = chained(fx) && i > 0 ? at(fx.shots[i - 1].to) : from
    const target = at(shot.to)
    const aim = shot.result === 'miss' ? missPoint(start, target) : target
    const ctx = { scene, shot, i, from: start, target, aim, p: local, once: (key, when, fn) => once(scene, `${i}:${key}`, when, fn) }
    // A defeated monster's token is already off the board: its ghost cracks and fades here.
    if (shot.result === 'kill') ghost(ctx, scene.pictures[i])
    ;(LOOKS[fx.look] ?? LOOKS.weapon)(ctx)
    reaction(ctx)
  })
  stepParts(scene)
}

const lerp = (a, b, t) => a + (b - a) * t
const clamp01 = (t) => Math.max(0, Math.min(1, t))
const ease = (t) => 1 - Math.pow(1 - t, 3)
const seg = (t, a, b) => clamp01((t - a) / (b - a))

function once(scene, key, when, fn) {
  if (when && !scene.done.has(key)) {
    scene.done.add(key)
    fn()
  }
}

// Just past the target, off to one side, where a miss goes.
function missPoint(from, to) {
  const [dx, dy] = [to.x - from.x, to.y - from.y]
  const len = Math.hypot(dx, dy) || 1
  return { x: to.x + (dx / len) * R * 0.7 - (dy / len) * R * 1.2, y: to.y + (dy / len) * R * 0.7 + (dx / len) * R * 1.2 }
}

function spawn(scene, n, x, y, c, o = {}) {
  for (let i = 0; i < n; i++) {
    const a = (o.dir ?? Math.random() * 7) + (Math.random() - 0.5) * (o.spread ?? 7)
    const s = (o.speed ?? 6) * (0.4 + Math.random())
    scene.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, decay: o.decay ?? 0.02 + Math.random() * 0.03, size: o.size ?? 3 + Math.random() * 6, c, grav: o.grav ?? 0, kind: o.kind })
  }
}

function stepParts(scene) {
  const { g } = scene
  for (const p of scene.parts) {
    p.x += p.vx
    p.y += p.vy
    p.vy += p.grav
    p.vx *= 0.97
    p.vy *= 0.97
    p.life -= p.decay
  }
  scene.parts = scene.parts.filter((p) => p.life > 0)
  g.save()
  for (const p of scene.parts) {
    if (p.kind === 'smoke') {
      g.globalCompositeOperation = 'source-over'
      g.globalAlpha = p.life * 0.5
      g.fillStyle = '#57534e'
      g.beginPath()
      g.arc(p.x, p.y, p.size * (2.5 - p.life), 0, 7)
      g.fill()
      continue
    }
    g.globalCompositeOperation = 'lighter'
    g.globalAlpha = Math.max(0, p.life)
    if (p.kind === 'star') star(g, p.x, p.y, p.size * 1.6, p.c)
    else {
      g.fillStyle = p.c
      g.beginPath()
      g.arc(p.x, p.y, p.size * p.life, 0, 7)
      g.fill()
    }
  }
  g.restore()
}

function star(g, x, y, r, c) {
  g.fillStyle = c
  g.beginPath()
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5 - Math.PI / 2
    const rr = i % 2 ? r * 0.45 : r
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
  }
  g.fill()
}

function glowLine(g, pts, c, w, fade = 1) {
  g.save()
  g.globalCompositeOperation = 'lighter'
  g.lineCap = 'round'
  g.lineJoin = 'round'
  for (const [lw, alpha] of [
    [w * 4, 0.18],
    [w * 2, 0.4],
    [w, 1],
  ]) {
    g.strokeStyle = lw === w ? '#fff' : c
    g.globalAlpha = alpha * fade
    g.lineWidth = lw
    g.beginPath()
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)))
    g.stroke()
  }
  g.restore()
}

function orb(g, x, y, r, c) {
  g.save()
  g.globalCompositeOperation = 'lighter'
  const gr = g.createRadialGradient(x, y, 0, x, y, r * 2.4)
  gr.addColorStop(0, '#fff')
  gr.addColorStop(0.25, c)
  gr.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = gr
  g.beginPath()
  g.arc(x, y, r * 2.4, 0, 7)
  g.fill()
  g.restore()
}

function ring(g, x, y, r, c, w, alpha) {
  g.save()
  g.globalAlpha = alpha
  g.strokeStyle = c
  g.lineWidth = Math.max(0.5, w)
  g.beginPath()
  g.arc(x, y, r, 0, 7)
  g.stroke()
  g.restore()
}

function bolt(a, b, jag) {
  const pts = [[a.x, a.y]]
  const [dx, dy] = [b.x - a.x, b.y - a.y]
  const len = Math.hypot(dx, dy) || 1
  for (let i = 1; i < 12; i++) {
    const t = i / 12
    const off = (Math.random() - 0.5) * jag * Math.sin(t * Math.PI)
    pts.push([a.x + dx * t + (-dy / len) * off, a.y + dy * t + (dx / len) * off])
  }
  pts.push([b.x, b.y])
  return pts
}

function bigText(g, text, x, y, c, size, alpha) {
  if (alpha <= 0) return
  g.save()
  g.globalAlpha = alpha
  g.font = `800 ${size}px system-ui, sans-serif`
  g.textAlign = 'center'
  g.lineJoin = 'round'
  g.lineWidth = size / 6
  g.strokeStyle = '#120a04'
  g.strokeText(text, x, y)
  g.fillStyle = c
  g.fillText(text, x, y)
  g.restore()
}

function scorch(g, { x, y }) {
  g.save()
  g.globalAlpha = 0.5
  g.fillStyle = '#100a06'
  g.beginPath()
  g.ellipse(x, y, 46, 28, 0, 0, 7)
  g.fill()
  g.restore()
}

// The target's red (or icy) flash, its number floating up, and a defeated monster's smoke.
function reaction({ scene, shot, target, p, once: onceFor }) {
  const { g, fx } = scene
  if (p > IMPACT && shot.result !== 'miss') {
    const k = seg(p, IMPACT, IMPACT + 0.25)
    const frost = fx.look === 'frost'
    if (shot.result !== 'kill' || p < IMPACT + 0.2) {
      g.save()
      g.fillStyle = frost ? 'rgba(150,220,255,0.45)' : `rgba(255,40,40,${0.55 * (1 - k)})`
      g.beginPath()
      g.arc(target.x, target.y, R, 0, 7)
      g.fill()
      g.restore()
    }
  }
  if (shot.result === 'kill') {
    onceFor('smoke', p > IMPACT + 0.2, () => {
      spawn(scene, 30, target.x, target.y, '#555', { kind: 'smoke', speed: 2, decay: 0.012, size: 14 })
      spawn(scene, 20, target.x, target.y, '#fde68a', { speed: 6, kind: 'star', size: 3 })
    })
  }
  if (p <= IMPACT + 0.02) return
  const k = seg(p, IMPACT + 0.02, 0.95)
  const y = target.y - R - 20 - k * 60
  const fade = 1 - seg(p, 0.85, 1)
  const hurt = shot.dealt > 0 ? `-${shot.dealt}` : 'HIT!'
  if (shot.result === 'miss') bigText(g, shot.dealt > 0 ? `MISS -${shot.dealt}` : 'MISS', target.x, y, '#cbd5e1', 60, fade)
  else if (shot.result === 'kill' || shot.result === 'down') {
    const late = p > IMPACT + 0.25
    bigText(g, late ? (shot.result === 'kill' ? 'DEFEATED!' : 'DOWN!') : hurt, target.x, y, late ? '#fde68a' : '#f87171', late ? 60 : 80, fade)
  } else bigText(g, hurt, target.x, y, '#f87171', 84, fade)
}

// A defeated monster's token, drawn from its picture, cracking and fading away.
function ghost({ scene, target, p }, picture) {
  const { g } = scene
  const gone = seg(p, IMPACT + 0.18, 0.92)
  if (gone >= 1) return
  const r = R * (1 - gone * 0.4)
  const shake = p > IMPACT && p < IMPACT + 0.25 ? Math.sin(p * 300) * 8 * (1 - seg(p, IMPACT, IMPACT + 0.25)) : 0
  const [x, y] = [target.x + shake, target.y]
  g.save()
  g.globalAlpha = 1 - gone
  g.fillStyle = '#7f1d1d'
  g.beginPath()
  g.arc(x, y, r, 0, 7)
  g.fill()
  g.save()
  g.beginPath()
  g.arc(x, y, r, 0, 7)
  g.clip()
  if (picture?.complete && picture.naturalWidth > 0) g.drawImage(picture, x - r, y - r, r * 2, r * 2)
  if (p > IMPACT + 0.08) {
    g.strokeStyle = 'rgba(10,10,10,0.9)'
    g.lineWidth = 5
    g.beginPath()
    g.moveTo(x - 10, y - r)
    g.lineTo(x + 6, y - 20)
    g.lineTo(x - 14, y + 8)
    g.lineTo(x + 18, y + r)
    g.moveTo(x + 6, y - 20)
    g.lineTo(x + r, y - 10)
    g.stroke()
  }
  g.restore()
  g.strokeStyle = '#09090b'
  g.lineWidth = 4
  g.beginPath()
  g.arc(x, y, r, 0, 7)
  g.stroke()
  g.restore()
}

function drawArrow(g, x, y, ang) {
  g.save()
  g.translate(x, y)
  g.rotate(ang)
  g.strokeStyle = '#8b5a2b'
  g.lineWidth = 6
  g.beginPath()
  g.moveTo(-60, 0)
  g.lineTo(18, 0)
  g.stroke()
  g.fillStyle = '#d4d4d8'
  g.beginPath()
  g.moveTo(34, 0)
  g.lineTo(14, -11)
  g.lineTo(14, 11)
  g.fill()
  g.fillStyle = '#fef3c7'
  g.beginPath()
  g.moveTo(-60, 0)
  g.lineTo(-74, -12)
  g.lineTo(-50, 0)
  g.lineTo(-74, 12)
  g.fill()
  g.restore()
}

function flash(g, c) {
  g.save()
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.fillStyle = c
  g.fillRect(0, 0, g.canvas.width, g.canvas.height)
  g.restore()
}

// A curved slash across the target: a sword's for a hero, a monster's blade in red.
function slash({ scene, target, aim, shot, p, once: onceFor }, color) {
  const { g } = scene
  const k = seg(p, IMPACT - 0.06, IMPACT + 0.14)
  if (k > 0 && k < 1) {
    const [cx, cy] = [aim.x - 10, aim.y]
    g.save()
    g.globalCompositeOperation = 'lighter'
    g.lineCap = 'round'
    const end = lerp(-2.4, 0.7, ease(k))
    for (const [w, alpha, c] of [
      [30, 0.25, color],
      [14, 0.55, '#fff'],
      [5, 1, '#fff'],
    ]) {
      g.globalAlpha = alpha * (1 - seg(k, 0.7, 1))
      g.strokeStyle = c
      g.lineWidth = w
      g.beginPath()
      g.arc(cx, cy, 105, -2.4, end)
      g.stroke()
    }
    g.restore()
  }
  onceFor('impact', p > IMPACT, () => {
    if (shot.result !== 'miss') spawn(scene, 34, target.x, target.y, '#fef3c7', { speed: 10, size: 3, decay: 0.05 })
  })
}

function arrow({ scene, from, target, shot, p, once: onceFor }) {
  const { g } = scene
  const miss = shot.result === 'miss'
  const end = miss ? { x: target.x + (target.x - from.x) * 0.4 + 60, y: target.y + (target.y - from.y) * 0.4 + 60 } : target
  const t = miss ? seg(p, 0.1, IMPACT + 0.25) : seg(p, 0.1, IMPACT)
  const pos = (u) => ({ x: lerp(from.x, end.x, u), y: lerp(from.y, end.y, u) - Math.sin(u * Math.PI) * 90 })
  if (p > 0.1 && t < 1) {
    const a = pos(t)
    const b = pos(t + 0.01)
    drawArrow(g, a.x, a.y, Math.atan2(b.y - a.y, b.x - a.x))
  }
  if (!miss && p >= IMPACT) {
    const ang = Math.atan2(target.y - from.y, target.x - from.x)
    const wob = Math.sin(seg(p, IMPACT, 0.8) * 40) * 0.12 * (1 - seg(p, IMPACT, 0.8))
    g.save()
    g.globalAlpha = shot.result === 'kill' ? 1 - seg(p, IMPACT + 0.18, 0.92) : 1
    drawArrow(g, target.x - Math.cos(ang) * 40, target.y - Math.sin(ang) * 40, ang + wob)
    g.restore()
  }
  onceFor('impact', p > IMPACT, () => {
    if (!miss) spawn(scene, 20, target.x, target.y, '#fde68a', { speed: 6, size: 3 })
  })
}

function zap({ scene, from, aim, shot, p, once: onceFor }, color = '#7dd3fc') {
  const { g } = scene
  const t = seg(p, 0.08, IMPACT)
  if (p > 0.08 && p < IMPACT + 0.12) {
    const head = { x: lerp(from.x, aim.x, ease(t)), y: lerp(from.y, aim.y, ease(t)) }
    glowLine(g, bolt(from, head, 90), color, 7)
    if (Math.random() < 0.5) glowLine(g, bolt(from, head, 140), color, 2)
  }
  onceFor('impact', p > IMPACT, () => {
    spawn(scene, 40, aim.x, aim.y, '#bae6fd', { speed: 9 })
    if (shot.result === 'miss') scene.scorch.push(aim)
  })
  if (p > IMPACT && p < IMPACT + 0.025) flash(g, 'rgba(186,230,253,0.18)')
}

function fire({ scene, from, aim, shot, p, once: onceFor }) {
  const { g } = scene
  const t = seg(p, 0.08, IMPACT)
  if (p > 0.08 && p < IMPACT) {
    const x = lerp(from.x, aim.x, ease(t))
    const y = lerp(from.y, aim.y, ease(t)) - Math.sin(t * Math.PI) * 50
    orb(g, x, y, 26, '#fb923c')
    spawn(scene, 3, x, y, Math.random() < 0.5 ? '#fdba74' : '#ef4444', { speed: 2, decay: 0.05 })
  }
  onceFor('impact', p > IMPACT, () => {
    spawn(scene, 70, aim.x, aim.y, '#fb923c', { speed: 11 })
    spawn(scene, 30, aim.x, aim.y, '#fde047', { speed: 6 })
    if (shot.result === 'miss') scene.scorch.push(aim)
  })
  const k = seg(p, IMPACT, IMPACT + 0.25)
  if (k > 0 && k < 1) {
    orb(g, aim.x, aim.y, 40 + k * 60, `rgba(249,115,22,${1 - k})`)
    ring(g, aim.x, aim.y, 40 + k * 140, '#fdba74', 10 * (1 - k), 1 - k)
  }
}

// A straight beam: Ray of Frost, or a gauth's eye ray in its own colour.
function beam({ scene, from, aim, shot, p, once: onceFor }, color, icy) {
  const { g } = scene
  const miss = shot.result === 'miss'
  const end = miss ? { x: aim.x + (aim.x - from.x) * 0.15, y: aim.y + (aim.y - from.y) * 0.15 } : aim
  const t = seg(p, 0.08, IMPACT + 0.05)
  if (p > 0.08 && p < IMPACT + 0.2) {
    const hx = lerp(from.x, end.x, ease(t))
    const hy = lerp(from.y, end.y, ease(t))
    glowLine(g, [[from.x, from.y], [hx, hy]], color, 9, 1 - seg(p, IMPACT + 0.05, IMPACT + 0.2))
    if (Math.random() < 0.8) spawn(scene, 2, lerp(from.x, hx, Math.random()), lerp(from.y, hy, Math.random()), icy ? '#e0f2fe' : color, { speed: 1, size: 3, decay: 0.04, kind: icy ? 'star' : undefined })
  }
  onceFor('impact', p > IMPACT, () => spawn(scene, 36, aim.x, aim.y, icy ? '#e0f2fe' : color, { speed: 7, kind: icy ? 'star' : undefined, size: 4 }))
  if (icy && !miss && p > IMPACT) {
    const k = seg(p, IMPACT, IMPACT + 0.1)
    g.save()
    g.globalAlpha = 0.9 * k * (shot.result === 'kill' ? 1 - seg(p, IMPACT + 0.18, 0.92) : 1 - seg(p, 0.85, 1))
    g.fillStyle = '#cffafe'
    for (let i = 0; i < 6; i++) {
      const a = i * 1.05 + 0.3
      g.beginPath()
      g.moveTo(aim.x + Math.cos(a) * 55, aim.y + Math.sin(a) * 55)
      g.lineTo(aim.x + Math.cos(a - 0.15) * 86, aim.y + Math.sin(a - 0.15) * 86)
      g.lineTo(aim.x + Math.cos(a + 0.15) * 86, aim.y + Math.sin(a + 0.15) * 86)
      g.fill()
    }
    g.restore()
  }
}

function holy({ scene, from, aim, p, once: onceFor }) {
  const { g } = scene
  if (p < 0.3) orb(g, from.x, from.y - 10, 30 + seg(p, 0, 0.3) * 30, `rgba(253,224,71,${0.8 * seg(p, 0, 0.3)})`)
  const k = seg(p, 0.3, IMPACT + 0.25)
  if (k > 0 && k < 1) {
    const w = 110 * Math.sin(k * Math.PI)
    g.save()
    g.globalCompositeOperation = 'lighter'
    const gr = g.createLinearGradient(aim.x - w, 0, aim.x + w, 0)
    gr.addColorStop(0, 'rgba(253,224,71,0)')
    gr.addColorStop(0.5, 'rgba(255,250,220,0.9)')
    gr.addColorStop(1, 'rgba(253,224,71,0)')
    g.fillStyle = gr
    g.fillRect(aim.x - w, aim.y - 420, w * 2, 450)
    g.restore()
    orb(g, aim.x, aim.y, 30 + w * 0.3, 'rgba(253,224,71,0.8)')
    if (Math.random() < 0.8) spawn(scene, 2, aim.x + (Math.random() - 0.5) * w * 1.4, aim.y - Math.random() * 300, '#fef08a', { dir: Math.PI / 2, spread: 0.3, speed: 3, size: 3, decay: 0.03 })
  }
  onceFor('impact', p > IMPACT, () => spawn(scene, 40, aim.x, aim.y, '#fef9c3', { speed: 8, kind: 'star', size: 4 }))
}

function thunder({ scene, from, target, shot, p, once: onceFor, i }) {
  const { g } = scene
  const d = Math.hypot(target.x - from.x, target.y - from.y) + 40
  // One set of rings for the whole attack, even when it hits several heroes.
  if (i === 0) {
    for (let n = 0; n < 3; n++) {
      const k = seg(p, 0.05 + n * 0.07, IMPACT + 0.1 + n * 0.07)
      if (k > 0 && k < 1) ring(g, from.x, from.y, R + k * d, '#c4b5fd', 22 * (1 - k), 0.9 * (1 - k))
    }
    if (p > 0.05 && p < 0.12) flash(g, 'rgba(196,181,253,0.1)')
  }
  onceFor('impact', p > IMPACT, () => {
    if (shot.result !== 'miss') spawn(scene, 30, target.x, target.y, '#ddd6fe', { speed: 8, dir: Math.atan2(target.y - from.y, target.x - from.x), spread: 1.4 })
  })
}

function missiles({ scene, from, target, shot, p, once: onceFor }) {
  const { g } = scene
  ;[-170, 0, 170].forEach((curve, n) => {
    const t = seg(p, 0.06 + n * 0.06, IMPACT - 0.06 + n * 0.06)
    const end = shot.result === 'miss' ? { x: target.x + (n - 1) * 90, y: target.y + 60 } : target
    if (t > 0 && t < 1) {
      // Each missile bows out to its own side of the straight line.
      const len = Math.hypot(end.x - from.x, end.y - from.y) || 1
      const mx = (from.x + end.x) / 2 - ((end.y - from.y) / len) * curve
      const my = (from.y + end.y) / 2 + ((end.x - from.x) / len) * curve
      const x = (1 - t) ** 2 * from.x + 2 * (1 - t) * t * mx + t * t * end.x
      const y = (1 - t) ** 2 * from.y + 2 * (1 - t) * t * my + t * t * end.y
      orb(g, x, y, 14, '#c084fc')
      spawn(scene, 2, x, y, '#e9d5ff', { speed: 0.6, size: 3, decay: 0.05 })
    }
    onceFor(`m${n}`, t >= 1, () => spawn(scene, 16, end.x, end.y, '#e9d5ff', { speed: 6, size: 3 }))
  })
}

function swirl({ scene, from, target, aim, shot, p, once: onceFor }) {
  const { g } = scene
  const t = seg(p, 0.05, IMPACT)
  if (t > 0 && t < 1) {
    for (let n = 0; n < 3; n++) {
      const u = clamp01(t - n * 0.08)
      const x = lerp(from.x, aim.x, u)
      const y = lerp(from.y, aim.y, u) + Math.sin(u * 14 + n) * 30
      g.save()
      g.globalCompositeOperation = 'lighter'
      g.strokeStyle = '#e879f9'
      g.globalAlpha = 0.9
      g.lineWidth = 5
      g.beginPath()
      for (let s = 0; s < 40; s++) {
        const a = s * 0.45 + p * 30
        g.lineTo(x + Math.cos(a) * s * 0.9, y + Math.sin(a) * s * 0.9)
      }
      g.stroke()
      g.restore()
    }
  }
  if (shot.result !== 'miss' && p > IMPACT && p < 0.95) {
    for (let n = 0; n < 4; n++) {
      const a = p * 18 + (n * Math.PI) / 2
      star(g, target.x + Math.cos(a) * 60, target.y - R - 5 + Math.sin(a) * 16, 14, '#fde047')
    }
  }
  onceFor('impact', p > IMPACT, () => spawn(scene, 24, aim.x, aim.y, '#f5d0fe', { speed: 5, size: 4 }))
}

// Jaws snap shut on the target.
function bite({ scene, target, aim, shot, p, once: onceFor }) {
  const { g } = scene
  const k = seg(p, IMPACT - 0.12, IMPACT)
  const open = 1 - ease(k)
  const fade = 1 - seg(p, IMPACT + 0.05, IMPACT + 0.2)
  if (p > IMPACT - 0.12 && fade > 0) {
    g.save()
    g.globalAlpha = fade
    for (const side of [-1, 1]) {
      const y = aim.y + side * (14 + open * 60)
      g.fillStyle = '#f5f5f4'
      g.strokeStyle = '#7f1d1d'
      g.lineWidth = 4
      g.beginPath()
      // A jaw: a curved band with a row of teeth pointing at the middle.
      g.moveTo(aim.x - 80, y)
      for (let n = 0; n <= 6; n++) {
        const x = aim.x - 80 + n * (160 / 6)
        g.lineTo(x, y)
        if (n < 6) g.lineTo(x + 160 / 12, y - side * 26)
      }
      g.lineTo(aim.x + 80, y)
      g.quadraticCurveTo(aim.x, y + side * 50, aim.x - 80, y)
      g.fill()
      g.stroke()
    }
    g.restore()
  }
  onceFor('impact', p > IMPACT, () => {
    if (shot.result !== 'miss') spawn(scene, 26, target.x, target.y, '#ef4444', { speed: 7, size: 4, grav: 0.3 })
  })
}

// Three claw (or tentacle) marks rake across the target.
function claws({ scene, target, aim, shot, p, once: onceFor }) {
  const { g } = scene
  for (let n = 0; n < 3; n++) {
    const k = seg(p, IMPACT - 0.08 + n * 0.03, IMPACT + 0.04 + n * 0.03)
    const fade = 1 - seg(p, IMPACT + 0.1, IMPACT + 0.3)
    if (k <= 0 || fade <= 0) continue
    const x0 = aim.x - 60 + n * 30
    const [sx, sy, ex, ey] = [x0 - 20, aim.y - 80, x0 + 30, aim.y + 80]
    glowLine(g, [[sx, sy], [lerp(sx, ex, ease(k)), lerp(sy, ey, ease(k))]], '#f87171', 6, fade)
  }
  onceFor('impact', p > IMPACT, () => {
    if (shot.result !== 'miss') spawn(scene, 24, target.x, target.y, '#fca5a5', { speed: 8, size: 3 })
  })
}

// A gust of wind streaks from the shaman to the hero.
function wind({ scene, from, aim, shot, target, p, once: onceFor }) {
  const { g } = scene
  const [dx, dy] = [aim.x - from.x, aim.y - from.y]
  const len = Math.hypot(dx, dy) || 1
  for (let n = 0; n < 6; n++) {
    const t = seg(p, 0.05 + n * 0.04, IMPACT + n * 0.03)
    if (t <= 0 || t >= 1) continue
    const side = (n - 2.5) * 16
    const pts = []
    for (let s = 0; s <= 10; s++) {
      const u = clamp01(t - 0.25 + s * 0.025)
      const wob = Math.sin(u * 10 + n) * 18 + side
      pts.push([from.x + dx * u + (-dy / len) * wob, from.y + dy * u + (dx / len) * wob])
    }
    glowLine(g, pts, '#a7f3d0', 3, 0.8)
  }
  onceFor('impact', p > IMPACT, () => {
    if (shot.result !== 'miss') spawn(scene, 24, target.x, target.y, '#d1fae5', { speed: 9, dir: Math.atan2(dy, dx), spread: 1 })
  })
}

export const LOOKS = {
  weapon: (ctx) => slash(ctx, '#e5e7eb'),
  slash: (ctx) => slash(ctx, '#f87171'),
  arrow,
  zap: (ctx) => zap(ctx),
  fire,
  frost: (ctx) => beam(ctx, '#67e8f9', true),
  ray: (ctx) => beam(ctx, ctx.scene.fx.color ?? '#7dd3fc', false),
  holy,
  boom: thunder,
  arcane: missiles,
  psychic: swirl,
  bite,
  claw: claws,
  wind,
}
